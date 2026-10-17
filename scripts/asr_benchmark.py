#!/usr/bin/env python3
"""ASR Benchmark harness: Levenshtein CER, RTF, RAM, and Metal evaluation for Japanese captions.

Provides:
1. Corrected Japanese text normalization (preserving Latin letters, katakana prolonged mark ー).
2. Dynamic programming Levenshtein distance, CER, Deletion Rate, and Insertion Rate.
3. Multi-model matrix evaluation and DSP comparison (with/without audio enhancement).
4. Live Apple Silicon Metal memory, cache clearing, and Real-Time Factor (RTF) measurement.
5. Offline benchmark matrix comparing candidate models against baseline YouTube auto-captions.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import resource
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
LOCAL_BRIDGE = ROOT / "local-bridge"
if str(LOCAL_BRIDGE) not in sys.path:
    sys.path.insert(0, str(LOCAL_BRIDGE))

try:
    from app.services.asr import (
        DEFAULT_INITIAL_PROMPT,
        DEFAULT_MODEL_NAME,
        apply_audio_dsp,
    )
except ImportError:
    DEFAULT_MODEL_NAME = "mlx-community/whisper-large-v3-turbo"
    DEFAULT_INITIAL_PROMPT = "こんにちは。日本語のYouTube動画の字幕です。"

    def apply_audio_dsp(audio: np.ndarray, filter_profile: str = "enhanced", sr: int = 16000) -> np.ndarray:  # type: ignore
        return audio


def normalize_ja_text(text: Optional[str]) -> str:
    """Normalize Japanese transcript text for invariant CER calculation.

    Rules:
    1. Unicode NFKC (full-width ASCII/digits -> half-width; half-width kana -> full-width).
    2. Strip bracketed noise/sound tokens: [音楽], (拍手), [ため息], etc.
    3. Explicitly lowercase Latin characters BEFORE regex character filtering.
    4. Remove all whitespace.
    5. Strip punctuation while preserving Japanese kana, kanji, alphanumeric,
       iteration mark 々, and the Katakana prolonged sound mark ー (\\u30FC).
    """
    if not text:
        return ""
    # 1. Unicode NFKC
    text = unicodedata.normalize("NFKC", text)
    # 2. Strip bracketed noise/sound descriptions
    text = re.sub(r"\[.*?\]", "", text)
    text = re.sub(r"\(.*?\)", "", text)
    text = re.sub(r"【.*?】", "", text)
    text = re.sub(r"〔.*?〕", "", text)
    # 3. Explicitly lowercase Latin characters
    text = text.lower()
    # 4. Remove all whitespace
    text = re.sub(r"\s+", "", text)
    # 5. Filter punctuation while preserving kana, kanji, iteration mark 々 (\u3005), alphanumeric, and prolonged mark ー
    text = re.sub(r"[^a-z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u30FC\u3005]", "", text)
    return text


def compute_cer_details(ref: str, hyp: str) -> Dict[str, Any]:
    """Calculate Levenshtein distance with breakdown of substitutions, deletions, insertions.

    Metrics:
    - CER = (Substitutions + Deletions + Insertions) / len(ref)
    - Deletion Rate = Deletions / len(ref) (identifies dropped words / quiet whisper omissions)
    - Insertion Rate = Insertions / len(ref) (identifies hallucination on noise/BGM)
    """
    n_ref = len(ref)
    n_hyp = len(hyp)
    if n_ref == 0 and n_hyp == 0:
        return {
            "cer": 0.0,
            "substitutions": 0,
            "deletions": 0,
            "insertions": 0,
            "deletionRate": 0.0,
            "insertionRate": 0.0,
        }
    if n_ref == 0:
        return {
            "cer": 1.0,
            "substitutions": 0,
            "deletions": 0,
            "insertions": n_hyp,
            "deletionRate": 0.0,
            "insertionRate": 1.0,
        }
    if n_hyp == 0:
        return {
            "cer": 1.0,
            "substitutions": 0,
            "deletions": n_ref,
            "insertions": 0,
            "deletionRate": 1.0,
            "insertionRate": 0.0,
        }

    dp = np.zeros((n_ref + 1, n_hyp + 1), dtype=np.int32)
    for i in range(n_ref + 1):
        dp[i, 0] = i
    for j in range(n_hyp + 1):
        dp[0, j] = j

    for i in range(1, n_ref + 1):
        for j in range(1, n_hyp + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            dp[i, j] = min(
                dp[i - 1, j] + 1,        # deletion
                dp[i, j - 1] + 1,        # insertion
                dp[i - 1, j - 1] + cost  # substitution / match
            )

    i, j = n_ref, n_hyp
    subs, dels, inss = 0, 0, 0
    while i > 0 or j > 0:
        if i > 0 and j > 0 and dp[i, j] == dp[i - 1, j - 1] + (0 if ref[i - 1] == hyp[j - 1] else 1):
            if ref[i - 1] != hyp[j - 1]:
                subs += 1
            i -= 1
            j -= 1
        elif i > 0 and dp[i, j] == dp[i - 1, j] + 1:
            dels += 1
            i -= 1
        else:
            inss += 1
            j -= 1

    total_err = subs + dels + inss
    cer = total_err / n_ref
    del_rate = dels / n_ref
    ins_rate = inss / n_ref
    return {
        "cer": round(float(cer), 4),
        "substitutions": subs,
        "deletions": dels,
        "insertions": inss,
        "deletionRate": round(float(del_rate), 4),
        "insertionRate": round(float(ins_rate), 4),
    }


def compute_cer(ref: str, hyp: str) -> float:
    """Compute raw Character Error Rate."""
    return compute_cer_details(ref, hyp)["cer"]


def compute_normalized_cer(ref: str, hyp: str) -> float:
    """Compute Character Error Rate on normalized Japanese text."""
    norm_ref = normalize_ja_text(ref)
    norm_hyp = normalize_ja_text(hyp)
    return compute_cer_details(norm_ref, norm_hyp)["cer"]


def get_process_rss_bytes() -> int:
    """Get the peak resident set size (RSS) in bytes for the current process."""
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        return usage
    return usage * 1024


def get_metal_peak_memory_bytes() -> Optional[int]:
    """Get Apple Silicon Metal peak memory usage if available."""
    try:
        import mlx.core as mx
        if hasattr(mx, "get_peak_memory"):
            return mx.get_peak_memory()
        if hasattr(mx, "metal") and hasattr(mx.metal, "get_peak_memory"):
            return mx.metal.get_peak_memory()
    except Exception:
        pass
    return None


def clear_metal_cache() -> None:
    """Clear Apple Silicon Metal GPU cache to prevent memory bloat between model runs."""
    try:
        import mlx.core as mx
        if hasattr(mx, "clear_cache"):
            mx.clear_cache()
        if hasattr(mx, "metal") and hasattr(mx.metal, "clear_cache"):
            mx.metal.clear_cache()
    except Exception:
        pass


def transcribe_audio_segment(
    audio: np.ndarray,
    model_name: str = DEFAULT_MODEL_NAME,
    sr: int = 16000,
    preprocess: bool = True,
    condition_on_previous_text: bool = False,
    no_speech_threshold: float = 0.85,
    logprob_threshold: float = -1.5,
    initial_prompt: Optional[str] = DEFAULT_INITIAL_PROMPT,
) -> Dict[str, Any]:
    """Transcribe 16 kHz mono audio using MLX Whisper, recording inference time, RTF, and RAM."""
    import mlx_whisper

    if preprocess:
        audio = apply_audio_dsp(audio, filter_profile="enhanced", sr=sr)

    duration_sec = len(audio) / sr
    rss_before = get_process_rss_bytes()

    start_time = time.perf_counter()
    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=model_name,
        language="ja",
        temperature=0.0,
        condition_on_previous_text=condition_on_previous_text,
        no_speech_threshold=no_speech_threshold,
        logprob_threshold=logprob_threshold,
        initial_prompt=initial_prompt,
    )
    elapsed_time = time.perf_counter() - start_time

    rss_after = get_process_rss_bytes()
    metal_peak = get_metal_peak_memory_bytes()

    text = result.get("text", "").strip() if isinstance(result, dict) else str(result).strip()
    rtf = elapsed_time / duration_sec if duration_sec > 0 else 0.0

    return {
        "text": text,
        "elapsedSec": round(elapsed_time, 4),
        "durationSec": round(duration_sec, 4),
        "rtf": round(rtf, 4),
        "rssBytes": max(rss_before, rss_after),
        "metalPeakBytes": metal_peak,
    }


def evaluate_windows(
    manifest_path: str | Path,
    predictions: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Evaluate baseline YouTube ASR and model predictions against manifest reference hypotheses."""
    mpath = Path(manifest_path)
    if not mpath.is_file():
        raise FileNotFoundError(f"Manifest not found: {mpath}")

    with open(mpath, "r", encoding="utf-8") as f:
        data = json.load(f)

    windows = data.get("windows", [])
    if not windows:
        raise ValueError(f"No windows in manifest: {mpath}")

    # Normalize predictions mapping: support both flat Dict[str, str] and Dict[str, Dict[str, Any]]
    norm_preds: Dict[str, Dict[str, Any]] = {}
    if predictions:
        for wid, entry in predictions.items():
            if isinstance(entry, dict):
                # If entry already maps model_name -> result dict
                has_subdicts = any(isinstance(v, (dict, str)) for v in entry.values())
                if has_subdicts and ("text" not in entry or any(isinstance(v, dict) for v in entry.values())):
                    norm_preds[wid] = entry
                else:
                    norm_preds[wid] = {"default": entry}
            elif isinstance(entry, str):
                norm_preds[wid] = {"default": {"text": entry}}

    results: List[Dict[str, Any]] = []
    yt_raw_cers: List[float] = []
    yt_norm_cers: List[float] = []
    yt_del_rates: List[float] = []
    yt_ins_rates: List[float] = []

    for w in windows:
        wid = w["id"]
        ref = w.get("referenceHypothesis", "")
        yt_asr = w.get("sourceAsr", "")

        yt_raw_details = compute_cer_details(ref, yt_asr)
        yt_norm_details = compute_cer_details(normalize_ja_text(ref), normalize_ja_text(yt_asr))

        yt_raw_cers.append(yt_raw_details["cer"])
        yt_norm_cers.append(yt_norm_details["cer"])
        yt_del_rates.append(yt_norm_details["deletionRate"])
        yt_ins_rates.append(yt_norm_details["insertionRate"])

        row: Dict[str, Any] = {
            "id": wid,
            "videoId": w.get("videoId"),
            "category": w.get("errorCategory"),
            "ref": ref,
            "normRef": normalize_ja_text(ref),
            "ytAsr": yt_asr,
            "ytNormAsr": normalize_ja_text(yt_asr),
            "ytRawCer": yt_raw_details["cer"],
            "ytNormCer": yt_norm_details["cer"],
            "ytDeletionRate": yt_norm_details["deletionRate"],
            "ytInsertionRate": yt_norm_details["insertionRate"],
        }

        if wid in norm_preds:
            row["models"] = {}
            for mkey, mres in norm_preds[wid].items():
                hyp = mres.get("text", "") if isinstance(mres, dict) else str(mres)
                m_raw = compute_cer_details(ref, hyp)
                m_norm = compute_cer_details(normalize_ja_text(ref), normalize_ja_text(hyp))
                row["models"][mkey] = {
                    "hyp": hyp,
                    "normHyp": normalize_ja_text(hyp),
                    "rawCer": m_raw["cer"],
                    "normCer": m_norm["cer"],
                    "deletionRate": m_norm["deletionRate"],
                    "insertionRate": m_norm["insertionRate"],
                    "rtf": mres.get("rtf") if isinstance(mres, dict) else None,
                    "elapsedSec": mres.get("elapsedSec") if isinstance(mres, dict) else None,
                }

        results.append(row)

    summary: Dict[str, Any] = {
        "manifest": str(mpath),
        "totalWindows": len(windows),
        "baselineYouTube": {
            "meanRawCer": round(float(np.mean(yt_raw_cers)), 4),
            "meanNormCer": round(float(np.mean(yt_norm_cers)), 4),
            "meanDeletionRate": round(float(np.mean(yt_del_rates)), 4),
            "meanInsertionRate": round(float(np.mean(yt_ins_rates)), 4),
        },
        "windows": results,
    }

    if norm_preds:
        model_summaries: Dict[str, Any] = {}
        model_keys = sorted({
            mkey
            for row_dict in norm_preds.values()
            for mkey in row_dict.keys()
        })

        for mkey in model_keys:
            m_raw_list = []
            m_norm_list = []
            m_del_list = []
            m_ins_list = []
            rtfs = []

            for row in results:
                m_data = row.get("models", {}).get(mkey)
                if m_data:
                    m_raw_list.append(m_data["rawCer"])
                    m_norm_list.append(m_data["normCer"])
                    m_del_list.append(m_data["deletionRate"])
                    m_ins_list.append(m_data["insertionRate"])
                    if m_data.get("rtf") is not None:
                        rtfs.append(m_data["rtf"])

            model_summaries[mkey] = {
                "evaluatedWindows": len(m_norm_list),
                "meanRawCer": round(float(np.mean(m_raw_list)), 4) if m_raw_list else 0.0,
                "meanNormCer": round(float(np.mean(m_norm_list)), 4) if m_norm_list else 0.0,
                "meanDeletionRate": round(float(np.mean(m_del_list)), 4) if m_del_list else 0.0,
                "meanInsertionRate": round(float(np.mean(m_ins_list)), 4) if m_ins_list else 0.0,
                "meanRtf": round(float(np.mean(rtfs)), 4) if rtfs else 0.0,
            }

        summary["modelEvaluations"] = model_summaries

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="ASR Benchmark: evaluate CER, RTF, and RAM.")
    parser.add_argument(
        "--manifest",
        default="testdata/audio-gold/manifest.json",
        help="Path to audio-gold manifest.json",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL_NAME,
        help="Single Hugging Face model repo for MLX Whisper",
    )
    parser.add_argument(
        "--models",
        default=None,
        help="Comma-separated list of Hugging Face model repos (e.g. 'mlx-community/whisper-large-v3-turbo,kaiinui/kotoba-whisper-v2.0-mlx')",
    )
    parser.add_argument(
        "--compare-dsp",
        action="store_true",
        help="Run comparative benchmark with DSP pre-processing ON vs OFF",
    )
    parser.add_argument(
        "--condition-on-previous-text",
        action="store_true",
        default=False,
        help="Condition decoding on previous text",
    )
    parser.add_argument(
        "--no-speech-threshold",
        type=float,
        default=0.85,
        help="No-speech probability threshold (default: 0.85)",
    )
    parser.add_argument(
        "--logprob-threshold",
        type=float,
        default=-1.5,
        help="Average logprob threshold (default: -1.5)",
    )
    parser.add_argument(
        "--initial-prompt",
        default=DEFAULT_INITIAL_PROMPT,
        help="Initial prompt string for Japanese ASR context",
    )
    parser.add_argument(
        "--wav-dir",
        default=None,
        help="Directory containing sliced WAV files for offline inference benchmark",
    )
    parser.add_argument(
        "--json-out",
        default=None,
        help="Path to write JSON benchmark summary",
    )

    args = parser.parse_args()

    # Determine models list
    if args.models:
        model_list = [m.strip() for m in args.models.split(",") if m.strip()]
    else:
        model_list = [args.model.strip()]

    # Determine DSP configurations
    dsp_configs = [True, False] if args.compare_dsp else [True]

    predictions: Optional[Dict[str, Dict[str, Any]]] = None

    if args.wav_dir:
        import soundfile as sf
        wav_path = Path(args.wav_dir)
        if wav_path.is_dir():
            predictions = {}
            with open(args.manifest, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)

            windows = manifest_data.get("windows", [])
            for model_name in model_list:
                for use_dsp in dsp_configs:
                    dsp_tag = "dsp_on" if use_dsp else "dsp_off"
                    config_key = f"{model_name} [{dsp_tag}]"
                    print(f"\n--- Benchmarking {config_key} on {len(windows)} windows ---", file=sys.stderr)
                    clear_metal_cache()

                    for w in windows:
                        wid = w["id"]
                        candidates = [
                            wav_path / f"{wid}.wav",
                            wav_path / "wav" / f"{wid}.wav",
                        ]
                        if w.get("wavFile"):
                            candidates.extend([
                                wav_path / w["wavFile"],
                                Path(args.manifest).parent / w["wavFile"],
                            ])
                        w_file = next((p for p in candidates if p.is_file()), None)
                        if not w_file:
                            continue
                        if wid not in predictions:
                            predictions[wid] = {}

                        audio, sr = sf.read(str(w_file), dtype="float32")
                        tx = transcribe_audio_segment(
                            audio,
                            model_name=model_name,
                            sr=sr,
                            preprocess=use_dsp,
                            condition_on_previous_text=args.condition_on_previous_text,
                            no_speech_threshold=args.no_speech_threshold,
                            logprob_threshold=args.logprob_threshold,
                            initial_prompt=args.initial_prompt,
                        )
                        predictions[wid][config_key] = tx
                        print(f"[{wid}] CER Ref: {w.get('referenceHypothesis', '')[:20]}... -> Hyp: {tx['text'][:20]}...", file=sys.stderr)

    summary = evaluate_windows(manifest_path=args.manifest, predictions=predictions)
    print(json.dumps(summary, indent=2, ensure_ascii=False))

    if args.json_out:
        out_p = Path(args.json_out)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with open(out_p, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        print(f"\nBenchmark summary successfully saved to: {out_p}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
