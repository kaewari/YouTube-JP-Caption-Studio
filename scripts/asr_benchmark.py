#!/usr/bin/env python3
"""ASR Benchmark harness: Levenshtein CER, RTF, RAM, and Metal evaluation for Japanese captions.

Provides:
1. Corrected Japanese text normalization (preserving Latin letters, katakana prolonged mark ー).
2. Dynamic programming Levenshtein distance and CER / Normalized CER.
3. Live Apple Silicon Metal memory and Real-Time Factor (RTF) measurement.
4. Offline benchmark matrix comparing candidate models against baseline YouTube auto-captions.
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
from typing import Any, Dict, List, Optional, Tuple

import numpy as np


def normalize_ja_text(text: Optional[str]) -> str:
    """Normalize Japanese transcript text for invariant CER calculation.

    Rules:
    1. Unicode NFKC (full-width ASCII/digits -> half-width; half-width kana -> full-width).
    2. Strip bracketed noise/sound tokens: [音楽], (拍手), [ため息], etc.
    3. Explicitly lowercase Latin characters BEFORE regex character filtering.
    4. Remove all whitespace.
    5. Strip punctuation while preserving Japanese kana, kanji, alphanumeric,
       and the Katakana prolonged sound mark ー (\\u30FC).
    """
    if not text:
        return ""
    # 1. Unicode NFKC
    text = unicodedata.normalize("NFKC", text)
    # 2. Strip bracketed noise/sound descriptions (halfwidth and Japanese fullwidth)
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


def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate the Levenshtein distance between two strings using space-optimized DP."""
    if s1 == s2:
        return 0
    if not s1:
        return len(s2)
    if not s2:
        return len(s1)

    len1, len2 = len(s1), len(s2)
    # Ensure s1 is shorter to minimize DP row memory
    if len1 > len2:
        s1, s2 = s2, s1
        len1, len2 = len2, len1

    prev_row = list(range(len1 + 1))
    curr_row = [0] * (len1 + 1)

    for j, c2 in enumerate(s2, 1):
        curr_row[0] = j
        for i, c1 in enumerate(s1, 1):
            cost = 0 if c1 == c2 else 1
            curr_row[i] = min(
                curr_row[i - 1] + 1,      # insertion
                prev_row[i] + 1,          # deletion
                prev_row[i - 1] + cost,   # substitution
            )
        prev_row, curr_row = curr_row, prev_row

    return prev_row[len1]


def compute_cer(ref: str, hyp: str) -> float:
    """Compute raw Character Error Rate (CER = Levenshtein / len(ref)).

    Edge cases:
    - len(ref) == 0 and len(hyp) == 0 -> 0.0
    - len(ref) == 0 and len(hyp) > 0 -> 1.0 (pure insertion)
    - len(ref) > 0 and len(hyp) == 0 -> 1.0 (pure deletion)
    """
    if len(ref) == 0:
        return 0.0 if len(hyp) == 0 else 1.0

    dist = levenshtein_distance(ref, hyp)
    return dist / len(ref)


def compute_normalized_cer(ref: str, hyp: str) -> float:
    """Compute Character Error Rate on normalized Japanese text."""
    norm_ref = normalize_ja_text(ref)
    norm_hyp = normalize_ja_text(hyp)
    return compute_cer(norm_ref, norm_hyp)


def get_process_rss_bytes() -> int:
    """Get the peak resident set size (RSS) in bytes for the current process."""
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        # On macOS, ru_maxrss is reported in bytes
        return usage
    # On Linux, ru_maxrss is reported in kilobytes
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


def transcribe_audio_segment(
    audio: np.ndarray,
    model_name: str = "mlx-community/whisper-large-v3-turbo",
    sr: int = 16000,
) -> Dict[str, Any]:
    """Transcribe 16 kHz mono audio using MLX Whisper, recording inference time, RTF, and RAM."""
    import mlx_whisper

    duration_sec = len(audio) / sr
    rss_before = get_process_rss_bytes()

    start_time = time.perf_counter()
    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=model_name,
        language="ja",
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
    predictions: Optional[Dict[str, str]] = None,
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

    results: List[Dict[str, Any]] = []
    yt_raw_cers: List[float] = []
    yt_norm_cers: List[float] = []
    pred_raw_cers: List[float] = []
    pred_norm_cers: List[float] = []

    for w in windows:
        wid = w["id"]
        ref = w.get("referenceHypothesis", "")
        yt_asr = w.get("sourceAsr", "")

        yt_raw_cer = compute_cer(ref, yt_asr)
        yt_norm_cer = compute_normalized_cer(ref, yt_asr)
        yt_raw_cers.append(yt_raw_cer)
        yt_norm_cers.append(yt_norm_cer)

        row: Dict[str, Any] = {
            "id": wid,
            "videoId": w.get("videoId"),
            "category": w.get("errorCategory"),
            "ref": ref,
            "normRef": normalize_ja_text(ref),
            "ytAsr": yt_asr,
            "ytNormAsr": normalize_ja_text(yt_asr),
            "ytRawCer": round(yt_raw_cer, 4),
            "ytNormCer": round(yt_norm_cer, 4),
        }

        if predictions and wid in predictions:
            hyp = predictions[wid]
            pred_raw_cer = compute_cer(ref, hyp)
            pred_norm_cer = compute_normalized_cer(ref, hyp)
            pred_raw_cers.append(pred_raw_cer)
            pred_norm_cers.append(pred_norm_cer)
            row["modelHyp"] = hyp
            row["modelNormHyp"] = normalize_ja_text(hyp)
            row["modelRawCer"] = round(pred_raw_cer, 4)
            row["modelNormCer"] = round(pred_norm_cer, 4)

        results.append(row)

    summary: Dict[str, Any] = {
        "manifest": str(mpath),
        "totalWindows": len(windows),
        "baselineYouTube": {
            "meanRawCer": round(float(np.mean(yt_raw_cers)), 4),
            "meanNormCer": round(float(np.mean(yt_norm_cers)), 4),
        },
        "windows": results,
    }

    if predictions:
        summary["modelEvaluation"] = {
            "evaluatedWindows": len(pred_raw_cers),
            "meanRawCer": round(float(np.mean(pred_raw_cers)), 4) if pred_raw_cers else 0.0,
            "meanNormCer": round(float(np.mean(pred_norm_cers)), 4) if pred_norm_cers else 0.0,
        }

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
        default="mlx-community/whisper-large-v3-turbo",
        help="Hugging Face model repo for MLX Whisper",
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

    predictions: Optional[Dict[str, str]] = None

    if args.wav_dir:
        import soundfile as sf
        wav_path = Path(args.wav_dir)
        if wav_path.is_dir():
            predictions = {}
            with open(args.manifest, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)
            for w in manifest_data.get("windows", []):
                w_file = wav_path / f"{w['id']}.wav"
                if w_file.is_file():
                    audio, sr = sf.read(str(w_file), dtype="float32")
                    tx = transcribe_audio_segment(audio, model_name=args.model, sr=sr)
                    predictions[w["id"]] = tx["text"]

    summary = evaluate_windows(manifest_path=args.manifest, predictions=predictions)
    print(json.dumps(summary, indent=2, ensure_ascii=False))

    if args.json_out:
        out_p = Path(args.json_out)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with open(out_p, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)

    return 0


if __name__ == "__main__":
    sys.exit(main())
