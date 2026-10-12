"""ASR (Automatic Speech Recognition) service using MLX Whisper on Apple Silicon Metal.

Provides:
1. Audio decoding from various containers (WebM Opus, WAV, OGG, PCM) to 16 kHz mono float32.
2. Input validation: size limits, zero-duration, negative/empty payloads, duration bounds.
3. Apple Silicon Metal-accelerated transcription using mlx_whisper.
4. Structured transcription output (text, segments with timestamps, RTF, RAM, Metal metrics).
"""

from __future__ import annotations

import io
import math
import logging
import resource
import shutil
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import soundfile as sf
from scipy import signal

logger = logging.getLogger("bridge.asr")

TARGET_SAMPLE_RATE = 16000
MAX_AUDIO_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_AUDIO_DURATION_SEC = 300.0       # 5 minutes
MIN_AUDIO_DURATION_SEC = 0.05        # 50 ms
DEFAULT_MODEL_NAME = "mlx-community/whisper-large-v3-turbo"


def get_process_rss_bytes() -> int:
    """Get peak resident set size in bytes for the current process."""
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


def to_mono_float32(audio: np.ndarray) -> np.ndarray:
    """Downmix multi-channel audio to 1D mono float32."""
    if audio.size == 0:
        raise ValueError("Audio array cannot be empty")
    if audio.ndim > 2:
        raise ValueError(f"Expected 1D or 2D audio, got ndim={audio.ndim}")
    if audio.ndim == 2:
        # Standard soundfile layout: (samples, channels)
        if audio.shape[1] <= 8 and audio.shape[0] >= audio.shape[1]:
            audio = audio.mean(axis=1)
        elif audio.shape[0] <= 8:
            audio = audio.mean(axis=0)
        else:
            audio = audio.mean(axis=1)
    return np.ascontiguousarray(audio, dtype=np.float32)


def resample_to_16k(audio: np.ndarray, orig_sr: int) -> np.ndarray:
    """Resample 1D mono audio to 16,000 Hz using polyphase filtering."""
    if audio.size == 0:
        raise ValueError("Cannot resample empty audio")
    if orig_sr <= 0:
        raise ValueError(f"Sample rate must be positive: orig_sr={orig_sr}")
    if orig_sr == TARGET_SAMPLE_RATE:
        return np.ascontiguousarray(audio, dtype=np.float32)

    g = math.gcd(orig_sr, TARGET_SAMPLE_RATE)
    up = TARGET_SAMPLE_RATE // g
    down = orig_sr // g
    resampled = signal.resample_poly(audio, up, down)
    return np.ascontiguousarray(resampled, dtype=np.float32)


def decode_audio_bytes(data: bytes) -> np.ndarray:
    """Decode raw audio bytes into 16 kHz mono float32 numpy array.

    Supports:
    - Soundfile readable containers (WAV, FLAC, OGG, etc.)
    - WebM/Opus and other formats via ffmpeg pipe decoding
    """
    if not data or len(data) == 0:
        raise ValueError("Audio data cannot be empty")
    if len(data) > MAX_AUDIO_BYTES:
        raise ValueError(f"Audio payload exceeds maximum size limit ({MAX_AUDIO_BYTES // (1024 * 1024)} MB)")

    # 1. Try reading via soundfile (fast for WAV/OGG)
    sf_error: Optional[Exception] = None
    try:
        bio = io.BytesIO(data)
        audio_arr, orig_sr = sf.read(bio)
        mono_arr = to_mono_float32(audio_arr)
        resampled_arr = resample_to_16k(mono_arr, orig_sr)
        return resampled_arr
    except Exception as e:
        sf_error = e

    # 2. Fallback to ffmpeg pipe (handles WebM/Opus from Chrome MediaRecorder)
    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin:
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            "pipe:0",
            "-f",
            "f32le",
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-ac",
            "1",
            "pipe:1",
        ]
        try:
            proc = subprocess.run(cmd, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            if not proc.stdout or len(proc.stdout) == 0:
                raise ValueError("ffmpeg output was empty")
            audio_arr = np.frombuffer(proc.stdout, dtype=np.float32)
            if audio_arr.size == 0:
                raise ValueError("Decoded audio contains no samples")
            return audio_arr
        except Exception as e:
            logger.error("ffmpeg decoding error: %s", e)
            raise ValueError(f"Unable to decode audio payload: {e}") from e

    raise ValueError(f"Unable to decode audio format: {sf_error}")


def transcribe_audio(
    audio_input: Union[bytes, np.ndarray],
    model_name: str = DEFAULT_MODEL_NAME,
    language: str = "ja",
    temperature: float = 0.0,
) -> Dict[str, Any]:
    """Transcribe audio using MLX Whisper on Apple Silicon Metal.

    Parameters:
    - audio_input: Raw audio bytes or preprocessed 16 kHz mono float32 numpy array.
    - model_name: Hugging Face repo or path for mlx_whisper model.
    - language: Target language code (e.g. 'ja').
    - temperature: Sampling temperature (0.0 for deterministic greedy decoding).

    Returns:
    Dict with text, segments (id, start, end, text), durationSec, elapsedSec, rtf, model, ram metrics.
    """
    if isinstance(audio_input, bytes):
        audio = decode_audio_bytes(audio_input)
    elif isinstance(audio_input, np.ndarray):
        audio = to_mono_float32(audio_input)
    else:
        raise ValueError(f"Unsupported audio input type: {type(audio_input)}")

    if audio.size == 0:
        raise ValueError("Audio array contains no samples")

    duration_sec = len(audio) / TARGET_SAMPLE_RATE
    if duration_sec < MIN_AUDIO_DURATION_SEC:
        raise ValueError(f"Audio duration is too short ({duration_sec:.3f}s < {MIN_AUDIO_DURATION_SEC}s)")
    if duration_sec > MAX_AUDIO_DURATION_SEC:
        raise ValueError(f"Audio duration exceeds {int(MAX_AUDIO_DURATION_SEC)} seconds limit ({duration_sec:.1f}s)")

    import mlx_whisper

    rss_before = get_process_rss_bytes()
    start_time = time.perf_counter()

    try:
        raw_result = mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=model_name,
            language=language,
            temperature=temperature,
        )
    except Exception as e:
        logger.error("mlx_whisper execution failed: %s", e)
        raise RuntimeError(f"ASR transcription failed: {e}") from e

    elapsed_time = time.perf_counter() - start_time
    rss_after = get_process_rss_bytes()
    metal_peak = get_metal_peak_memory_bytes()

    full_text = ""
    raw_segments: List[Dict[str, Any]] = []
    if isinstance(raw_result, dict):
        full_text = str(raw_result.get("text", "")).strip()
        raw_segments = raw_result.get("segments", []) or []
    else:
        full_text = str(raw_result).strip()

    segments = []
    for idx, seg in enumerate(raw_segments):
        if not isinstance(seg, dict):
            continue
        segments.append({
            "id": int(seg.get("id", idx)),
            "start": round(float(seg.get("start", 0.0)), 3),
            "end": round(float(seg.get("end", 0.0)), 3),
            "text": str(seg.get("text", "")).strip(),
        })

    rtf = elapsed_time / duration_sec if duration_sec > 0 else 0.0

    return {
        "text": full_text,
        "segments": segments,
        "language": language,
        "durationSec": round(float(duration_sec), 3),
        "elapsedSec": round(float(elapsed_time), 3),
        "rtf": round(float(rtf), 4),
        "model": model_name,
        "rssBytes": max(rss_before, rss_after),
        "metalPeakBytes": metal_peak,
    }


def get_asr_status() -> Dict[str, Any]:
    """Return runtime status of the ASR engine."""
    mlx_available = False
    try:
        import mlx_whisper
        mlx_available = True
    except ImportError:
        pass

    return {
        "available": mlx_available,
        "defaultModel": DEFAULT_MODEL_NAME,
        "targetSampleRate": TARGET_SAMPLE_RATE,
        "maxDurationSec": MAX_AUDIO_DURATION_SEC,
        "metalPeakBytes": get_metal_peak_memory_bytes(),
        "processRssBytes": get_process_rss_bytes(),
    }
