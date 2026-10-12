#!/usr/bin/env python3
"""Slice gold audio windows from source audio files with 16 kHz mono resampling.

Enforces:
1. Strict 16,000 Hz mono resampling invariant for MLX Whisper inference.
2. Downmixing multi-channel audio via channel-averaging.
3. Millisecond-accurate window slicing based on manifest timestamps.
4. Input validation and edge-case guards (0-duration, negative offsets, bounds clamping).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import soundfile as sf
from scipy import signal


TARGET_SAMPLE_RATE = 16000


def to_mono(audio: np.ndarray) -> np.ndarray:
    """Downmix multi-channel audio to 1D mono float32.

    Raises ValueError on empty audio or audio with >2 dimensions.
    """
    if audio.size == 0:
        raise ValueError("Audio array cannot be empty")
    if audio.ndim > 2:
        raise ValueError(f"Expected 1D or 2D audio, got ndim={audio.ndim}")
    if audio.ndim == 2:
        # Standard soundfile layout: (samples, channels)
        if audio.shape[1] < audio.shape[0]:
            audio = audio.mean(axis=1)
        else:
            audio = audio.mean(axis=0)
    return np.ascontiguousarray(audio, dtype=np.float32)


def resample_audio(audio: np.ndarray, orig_sr: int, target_sr: int = TARGET_SAMPLE_RATE) -> np.ndarray:
    """Resample 1D mono audio to target sample rate using polyphase filtering.

    Raises ValueError if sample rates are non-positive or audio is empty.
    """
    if audio.size == 0:
        raise ValueError("Cannot resample empty audio")
    if orig_sr <= 0 or target_sr <= 0:
        raise ValueError(f"Sample rates must be positive: orig_sr={orig_sr}, target_sr={target_sr}")
    if orig_sr == target_sr:
        return np.ascontiguousarray(audio, dtype=np.float32)

    g = math.gcd(orig_sr, target_sr)
    up = target_sr // g
    down = orig_sr // g
    resampled = signal.resample_poly(audio, up, down)
    return np.ascontiguousarray(resampled, dtype=np.float32)


def slice_audio(audio: np.ndarray, sr: int, start_ms: int, end_ms: int) -> np.ndarray:
    """Slice an audio segment by millisecond boundaries.

    start_ms must be non-negative.
    end_ms must be strictly greater than start_ms.
    end_ms is clamped to audio length if it exceeds the end.
    Raises ValueError on invalid boundaries or out-of-range start_ms.
    """
    if audio.size == 0:
        raise ValueError("Cannot slice empty audio")
    if sr <= 0:
        raise ValueError(f"Sample rate must be positive: sr={sr}")
    if start_ms < 0:
        raise ValueError(f"start_ms must be non-negative, got {start_ms}")
    if end_ms <= start_ms:
        raise ValueError(f"end_ms ({end_ms}) must be greater than start_ms ({start_ms})")

    start_idx = int(round(start_ms * sr / 1000.0))
    end_idx = int(round(end_ms * sr / 1000.0))

    if start_idx >= len(audio):
        raise ValueError(
            f"start_ms {start_ms}ms (sample index {start_idx}) exceeds audio length ({len(audio)} samples, {len(audio) * 1000 // sr}ms)"
        )

    end_idx = min(end_idx, len(audio))
    return np.ascontiguousarray(audio[start_idx:end_idx], dtype=np.float32)


def load_audio(file_path: str | Path, target_sr: int = TARGET_SAMPLE_RATE) -> Tuple[np.ndarray, int]:
    """Load an audio file from disk, convert to mono, and resample to target_sr."""
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Audio file not found: {path}")

    data, orig_sr = sf.read(str(path), dtype="float32")
    mono = to_mono(data)
    resampled = resample_audio(mono, orig_sr, target_sr)
    return resampled, target_sr


def save_audio(audio: np.ndarray, sr: int, output_path: str | Path) -> None:
    """Save 1D mono audio to 16-bit PCM WAV file."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), audio, sr, subtype="PCM_16")


def validate_manifest_window(window: Dict[str, Any]) -> None:
    """Validate required fields and invariants in a manifest window object."""
    required = ["id", "videoId", "startMs", "endMs", "durationMs", "sourceAsr"]
    missing = [f for f in required if f not in window]
    if missing:
        raise ValueError(f"Window missing required fields: {missing}")

    start_ms = window["startMs"]
    end_ms = window["endMs"]
    duration_ms = window["durationMs"]

    if start_ms < 0:
        raise ValueError(f"Window {window['id']}: negative startMs={start_ms}")
    if end_ms <= start_ms:
        raise ValueError(f"Window {window['id']}: endMs ({end_ms}) <= startMs ({start_ms})")
    if duration_ms != end_ms - start_ms:
        raise ValueError(
            f"Window {window['id']}: durationMs ({duration_ms}) != endMs - startMs ({end_ms - start_ms})"
        )


def process_manifest(
    manifest_path: str | Path,
    output_dir: str | Path,
    cache_dir: str | Path,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Process all windows in a gold manifest.

    In dry_run mode, validates all manifest entries and reports status without audio file I/O.
    When full audio tracks exist in cache_dir, slices them and saves to output_dir.
    """
    mpath = Path(manifest_path)
    if not mpath.is_file():
        raise FileNotFoundError(f"Manifest not found: {mpath}")

    with open(mpath, "r", encoding="utf-8") as f:
        data = json.load(f)

    windows = data.get("windows", [])
    if not windows:
        raise ValueError(f"Manifest contains no windows: {mpath}")

    for w in windows:
        validate_manifest_window(w)

    stats: Dict[str, Any] = {
        "manifest": str(mpath),
        "totalWindows": len(windows),
        "validWindows": len(windows),
        "processed": 0,
        "skippedMissingCache": 0,
        "dryRun": dry_run,
        "results": [],
    }

    if dry_run:
        return stats

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    cache_path = Path(cache_dir)

    # Group windows by videoId to load each source track once
    by_video: Dict[str, List[Dict[str, Any]]] = {}
    for w in windows:
        by_video.setdefault(w["videoId"], []).append(w)

    for video_id, win_list in by_video.items():
        # Check cache directory for source wav/opus/m4a
        cached_file: Optional[Path] = None
        for ext in [".wav", ".opus", ".m4a", ".mp3", ".webm"]:
            candidate = cache_path / f"{video_id}{ext}"
            if candidate.is_file():
                cached_file = candidate
                break

        if cached_file is None:
            stats["skippedMissingCache"] += len(win_list)
            for w in win_list:
                stats["results"].append({
                    "id": w["id"],
                    "videoId": video_id,
                    "status": "SKIPPED_MISSING_CACHE",
                })
            continue

        audio, sr = load_audio(cached_file, target_sr=TARGET_SAMPLE_RATE)

        for w in win_list:
            slice_data = slice_audio(audio, sr, w["startMs"], w["endMs"])
            slice_file = out_path / f"{w['id']}.wav"
            save_audio(slice_data, sr, slice_file)
            stats["processed"] += 1
            stats["results"].append({
                "id": w["id"],
                "videoId": video_id,
                "outputFile": str(slice_file),
                "samples": len(slice_data),
                "durationSec": round(len(slice_data) / sr, 4),
                "status": "SLICED",
            })

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Slice gold audio windows from cached YouTube audio.")
    parser.add_argument(
        "--manifest",
        default="testdata/audio-gold/manifest.json",
        help="Path to audio-gold manifest.json",
    )
    parser.add_argument(
        "--output-dir",
        default="testdata/audio-gold/wavs",
        help="Directory to save sliced WAV files",
    )
    parser.add_argument(
        "--cache-dir",
        default=".cache/audio",
        help="Directory containing full cached source audio tracks",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate manifest windows without slicing audio files",
    )

    args = parser.parse_args()

    try:
        summary = process_manifest(
            manifest_path=args.manifest,
            output_dir=args.output_dir,
            cache_dir=args.cache_dir,
            dry_run=args.dry_run,
        )
        print(json.dumps(summary, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
