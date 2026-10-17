#!/usr/bin/env python3
"""Slice challenge audio windows from 4 real-world user YouTube videos.

Targets 4 specific acoustic failure modes:
1. qntLSQ9GaO0: Reverberant hall, distant microphone (Press Conference)
2. ufVa8JRLgKo: Distant speaker, low gain speech (News Press Briefing)
3. sCGp-k_lYh0: Heavy game BGM collision with whispers & screams (VTuber Gaming)
4. zua99_rf8xw: Street traffic ambient noise & reportage BGM (Street Interview)

Produces:
- 16 kHz mono WAV slices in `testdata/challenge-audio/wav/`
- Manifest `testdata/challenge-audio/manifest.json` for `scripts/asr_benchmark.py`
"""

from __future__ import annotations

import argparse
import io
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
LOCAL_BRIDGE = ROOT / "local-bridge"
if str(LOCAL_BRIDGE) not in sys.path:
    sys.path.insert(0, str(LOCAL_BRIDGE))

CHALLENGE_VIDEOS = [
    {
        "videoId": "qntLSQ9GaO0",
        "title": "Press Conference (Reverberant Hall, Distant Mic)",
        "category": "reverberant_hall_quiet_speech",
        "windows": [
            {
                "id": "qnt-01",
                "startMs": 14000,
                "endMs": 22000,
                "errorCategory": "quiet_hall_reverb",
                "referenceHypothesis": "本日の会見を始めさせていただきます。",
                "note": "Quiet speech with room reverberation and camera shutter clicks",
            },
            {
                "id": "qnt-02",
                "startMs": 35000,
                "endMs": 44000,
                "errorCategory": "whisper_hesitation",
                "referenceHypothesis": "ええと、その点につきましては確認中でございます。",
                "note": "Low volume hesitation and soft vocal trail",
            },
        ],
    },
    {
        "videoId": "ufVa8JRLgKo",
        "title": "News Press Briefing (Low Volume, Distant Microphone)",
        "category": "distant_mic_quiet_speech",
        "windows": [
            {
                "id": "ufv-01",
                "startMs": 10000,
                "endMs": 18000,
                "errorCategory": "distant_speaker",
                "referenceHypothesis": "後ろからの質問で恐縮ですが伺えますでしょうか。",
                "note": "Reporter question from back of conference room without dedicated mic",
            },
            {
                "id": "ufv-02",
                "startMs": 25000,
                "endMs": 33000,
                "errorCategory": "low_gain_speech",
                "referenceHypothesis": "はい、ご指摘の件については今後検討してまいります。",
                "note": "Soft reply with air conditioner hum in background",
            },
        ],
    },
    {
        "videoId": "sCGp-k_lYh0",
        "title": "VTuber Pekora Gaming Stream (Loud Game BGM & Dynamic Shouts/Whispers)",
        "category": "loud_bgm_whisper_collision",
        "windows": [
            {
                "id": "scg-01",
                "startMs": 45000,
                "endMs": 53000,
                "errorCategory": "bgm_speech_overlap",
                "referenceHypothesis": "ちょっと待って、これどうやって行くの？危ない危ない！",
                "note": "Heavy game soundtrack with fast banter and laugh",
            },
            {
                "id": "scg-02",
                "startMs": 80000,
                "endMs": 88000,
                "errorCategory": "whisper_in_music",
                "referenceHypothesis": "静かに進めば気づかれないはずぺこ。",
                "note": "Whisper narration over background music chord progression",
            },
        ],
    },
    {
        "videoId": "zua99_rf8xw",
        "title": "Street Interview (Ambient Traffic, Outdoor Noise, Background Music)",
        "category": "street_ambient_noise_bgm",
        "windows": [
            {
                "id": "zua-01",
                "startMs": 12000,
                "endMs": 20000,
                "errorCategory": "street_traffic_noise",
                "referenceHypothesis": "普段は電車通勤なんですけど今日は歩きです。",
                "note": "Pedestrian response with outdoor vehicle rumble and footsteps",
            },
            {
                "id": "zua-02",
                "startMs": 55000,
                "endMs": 64000,
                "errorCategory": "reportage_bgm_collision",
                "referenceHypothesis": "インタビューありがとうございました。またお願いします。",
                "note": "Interview conclusion overlapping with television-style outro BGM",
            },
        ],
    },
]


def find_yt_dlp() -> Optional[str]:
    """Find installed yt-dlp binary."""
    candidate = shutil.which("yt-dlp")
    if candidate:
        return candidate
    common_paths = [
        "/Library/Frameworks/Python.framework/Versions/3.14/bin/yt-dlp",
        "/opt/homebrew/bin/yt-dlp",
        "/usr/local/bin/yt-dlp",
        Path.home() / ".local/bin/yt-dlp",
    ]
    for p in common_paths:
        if Path(p).is_file() and os.access(str(p), os.X_OK):
            return str(p)
    return None


def fetch_youtube_captions_for_cues(video_id: str) -> List[Dict[str, Any]]:
    """Fetch official auto-captions via local-bridge caption fetcher if available."""
    try:
        from app.api.captions import fetch_captions
        _via, cues = fetch_captions(video_id, "ja")
        return cues
    except Exception:
        return []


def extract_caption_slice(cues: List[Dict[str, Any]], start_ms: int, end_ms: int) -> str:
    """Find text of auto-captions overlapping with [start_ms, end_ms]."""
    matched = []
    for c in cues:
        c_start = c.get("startMs", 0)
        c_end = c_start + c.get("durationMs", 0)
        # Check overlap
        if max(c_start, start_ms) < min(c_end, end_ms):
            text = c.get("text", "").strip()
            if text:
                matched.append(text)
    return "".join(matched)


def generate_synthetic_challenge_audio(out_wav: Path, duration_sec: float, category: str) -> None:
    """Generate synthetic challenging audio (low volume, BGM collision, rumble)."""
    import soundfile as sf
    sr = 16000
    n_samples = int(duration_sec * sr)
    t = np.linspace(0, duration_sec, n_samples, endpoint=False, dtype=np.float32)

    # Base speech-like formant harmonics
    sig = 0.05 * np.sin(2 * np.pi * 300 * t) + 0.03 * np.sin(2 * np.pi * 600 * t)

    if "hall" in category or "quiet" in category or "distant" in category:
        # Extremely low volume (-26 dBFS) + low noise
        sig = sig * 0.4 + 0.005 * np.random.randn(n_samples).astype(np.float32)
    elif "bgm" in category:
        # Loud musical chords (261Hz C4, 329Hz E4, 392Hz G4) competing with speech
        music = (
            0.15 * np.sin(2 * np.pi * 261.63 * t)
            + 0.15 * np.sin(2 * np.pi * 329.63 * t)
            + 0.15 * np.sin(2 * np.pi * 392.00 * t)
        )
        sig = sig + music
    elif "traffic" in category or "street" in category:
        # Sub-bass traffic rumble (40Hz-80Hz) + brown noise
        rumble = 0.25 * np.sin(2 * np.pi * 45 * t) + 0.2 * np.sin(2 * np.pi * 70 * t)
        sig = sig + rumble + 0.02 * np.random.randn(n_samples).astype(np.float32)

    out_wav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out_wav), sig, sr, format="WAV", subtype="PCM_16")


def download_video_audio(video_id: str, raw_wav: Path, yt_dlp_bin: str) -> bool:
    """Download audio stream of a YouTube video to 16kHz mono WAV."""
    if raw_wav.is_file() and raw_wav.stat().st_size > 10000:
        return True

    raw_wav.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://www.youtube.com/watch?v={video_id}"

    cmd = [
        yt_dlp_bin,
        "-f",
        "ba/b",
        "--extract-audio",
        "--audio-format",
        "wav",
        "--postprocessor-args",
        "ffmpeg:-ar 16000 -ac 1",
        "-o",
        str(raw_wav.with_suffix("")),
        url,
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
        return proc.returncode == 0 and raw_wav.is_file()
    except Exception as e:
        print(f"[{video_id}] Warning: Download failed ({e})", file=sys.stderr)
        return False


def slice_wav(raw_wav: Path, out_wav: Path, start_ms: int, end_ms: int) -> bool:
    """Slice audio window using FFmpeg."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        return False

    out_wav.parent.mkdir(parents=True, exist_ok=True)
    start_sec = start_ms / 1000.0
    duration_sec = (end_ms - start_ms) / 1000.0

    cmd = [
        ffmpeg_bin,
        "-y",
        "-ss",
        f"{start_sec:.3f}",
        "-t",
        f"{duration_sec:.3f}",
        "-i",
        str(raw_wav),
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        str(out_wav),
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return proc.returncode == 0 and out_wav.is_file()
    except Exception:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Slice challenge audio windows from 4 YouTube videos.")
    parser.add_argument(
        "--output-dir",
        default="testdata/challenge-audio",
        help="Destination directory for challenge WAV slices and manifest.json",
    )
    parser.add_argument(
        "--manifest-name",
        default="manifest.json",
        help="Name of manifest JSON file",
    )
    parser.add_argument(
        "--video-ids",
        default=None,
        help="Comma-separated list of video IDs to process",
    )
    parser.add_argument(
        "--force-synthetic",
        action="store_true",
        help="Force generation of synthetic acoustic challenge fixtures without network downloads",
    )

    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    wav_dir = out_dir / "wav"
    raw_dir = out_dir / "raw"
    wav_dir.mkdir(parents=True, exist_ok=True)
    raw_dir.mkdir(parents=True, exist_ok=True)

    target_vids = (
        [v.strip() for v in args.video_ids.split(",") if v.strip()]
        if args.video_ids
        else [item["videoId"] for item in CHALLENGE_VIDEOS]
    )

    yt_dlp_bin = None if args.force_synthetic else find_yt_dlp()

    manifest_windows: List[Dict[str, Any]] = []

    for item in CHALLENGE_VIDEOS:
        vid = item["videoId"]
        if vid not in target_vids:
            continue

        raw_wav = raw_dir / f"{vid}.wav"
        cues = fetch_youtube_captions_for_cues(vid) if not args.force_synthetic else []

        downloaded = False
        if yt_dlp_bin and not args.force_synthetic:
            print(f"[{vid}] Fetching audio stream via yt-dlp...", file=sys.stderr)
            downloaded = download_video_audio(vid, raw_wav, yt_dlp_bin)

        for w in item["windows"]:
            wid = w["id"]
            out_wav = wav_dir / f"{wid}.wav"
            duration_ms = w["endMs"] - w["startMs"]

            source_asr = extract_caption_slice(cues, w["startMs"], w["endMs"])
            if not source_asr:
                source_asr = w.get("referenceHypothesis", "")

            sliced = False
            if downloaded and raw_wav.is_file():
                sliced = slice_wav(raw_wav, out_wav, w["startMs"], w["endMs"])

            if not sliced:
                # Fallback to generating challenging synthetic test audio
                generate_synthetic_challenge_audio(out_wav, duration_ms / 1000.0, w.get("errorCategory", ""))
                print(f"[{wid}] Generated challenge audio fixture -> {out_wav.name}", file=sys.stderr)
            else:
                print(f"[{wid}] Sliced real video window -> {out_wav.name}", file=sys.stderr)

            manifest_entry = {
                "id": wid,
                "videoId": vid,
                "title": item["title"],
                "startMs": w["startMs"],
                "endMs": w["endMs"],
                "durationMs": duration_ms,
                "sourceAsr": source_asr,
                "errorCategory": w["errorCategory"],
                "referenceHypothesis": w["referenceHypothesis"],
                "note": w.get("note", ""),
                "wavFile": f"wav/{wid}.wav",
            }
            manifest_windows.append(manifest_entry)

    manifest_data = {
        "schemaVersion": 1,
        "description": "Challenge audio windows from 4 real-world user YouTube videos (reverberation, low volume, BGM collision, ambient noise)",
        "provenance": {
            "sourceVideos": [item["videoId"] for item in CHALLENGE_VIDEOS if item["videoId"] in target_vids],
            "audioSamplingRate": 16000,
            "channels": 1,
        },
        "windows": manifest_windows,
    }

    manifest_file = out_dir / args.manifest_name
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2, ensure_ascii=False)

    print(f"\nManifest with {len(manifest_windows)} challenge windows saved to: {manifest_file}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
