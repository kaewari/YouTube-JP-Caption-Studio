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
import re
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
DEFAULT_MODEL_NAME = "kaiinui/kotoba-whisper-v2.0-mlx"
DEFAULT_INITIAL_PROMPT = "こんにちは。日本語のYouTube動画の字幕です。"
DEFAULT_AUDIO_FILTER_CHAIN = (
    "highpass=f=100,lowpass=f=8000,afftdn=nf=-25,dynaudnorm=f=150:g=15:p=0.95:b=1"
)


def is_valid_speech_text(text: str) -> bool:
    """Check whether transcribed text contains speech characters beyond whitespace and punctuation."""
    if not text:
        return False
    clean = re.sub(r"[\s!！?？.。,:：;；~～\-_—…·、。「」『』（）()\[\]【】]+", "", text)
    return len(clean) > 0




def build_audio_filter_chain(filter_profile: str = "enhanced") -> str:
    """Build FFmpeg audio filter chain for ASR speech enhancement.

    Profiles:
    - 'enhanced': 100Hz highpass, 8000Hz lowpass, -25dB FFT noise reduction,
                  dynamic audio normalizer with frame=150ms, odd Gaussian window g=15,
                  peak=0.95, and alternative boundary mode b=1 to preserve clip edges.
    - 'none': Passthrough with no filtering.
    """
    if filter_profile == "enhanced":
        return DEFAULT_AUDIO_FILTER_CHAIN
    if filter_profile == "none" or not filter_profile:
        return ""
    if any(k in filter_profile for k in ("highpass", "lowpass", "afftdn", "dynaudnorm", "volume", "equalizer")):
        return filter_profile
    raise ValueError(f"Unknown filter profile: {filter_profile}")


def apply_audio_dsp(
    audio: np.ndarray,
    filter_profile: str = "enhanced",
    sr: int = TARGET_SAMPLE_RATE,
) -> np.ndarray:
    """Apply FFmpeg audio DSP filter chain directly to 1D float32 audio array."""
    if audio.size == 0:
        return np.ascontiguousarray(audio, dtype=np.float32)
    chain = build_audio_filter_chain(filter_profile)
    if not chain:
        return np.ascontiguousarray(audio, dtype=np.float32)

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        logger.warning("ffmpeg not found, skipping DSP filter chain")
        return np.ascontiguousarray(audio, dtype=np.float32)

    # Ensure audio is contiguous 1D float32 array
    pcm_in = np.ascontiguousarray(audio.reshape(-1), dtype=np.float32)

    cmd = [
        ffmpeg_bin,
        "-y",
        "-f",
        "f32le",
        "-ar",
        str(sr),
        "-ac",
        "1",
        "-i",
        "pipe:0",
        "-af",
        chain,
        "-f",
        "f32le",
        "-ar",
        str(TARGET_SAMPLE_RATE),
        "-ac",
        "1",
        "pipe:1",
    ]
    try:
        proc = subprocess.run(
            cmd,
            input=pcm_in.tobytes(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        if proc.stdout and len(proc.stdout) > 0:
            valid_len = (len(proc.stdout) // 4) * 4
            filtered = np.frombuffer(proc.stdout[:valid_len], dtype=np.float32)
            if filtered.size > 0:
                return np.ascontiguousarray(filtered, dtype=np.float32)
    except Exception as e:
        logger.warning("Failed to apply FFmpeg DSP filter: %s", e)
    return pcm_in


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


def decode_audio_bytes(
    data: bytes,
    preprocess: bool = True,
    filter_profile: str = "enhanced",
) -> np.ndarray:
    """Decode raw audio bytes into 16 kHz mono float32 numpy array.

    When preprocess=True (default), all supported inputs (WAV, WebM, OGG, etc.)
    are routed through FFmpeg with the speech enhancement filter chain.
    """
    if not data or len(data) == 0:
        raise ValueError("Audio data cannot be empty")
    if len(data) > MAX_AUDIO_BYTES:
        raise ValueError(f"Audio payload exceeds maximum size limit ({MAX_AUDIO_BYTES // (1024 * 1024)} MB)")

    ffmpeg_bin = shutil.which("ffmpeg")
    ffmpeg_err: Optional[Exception] = None
    sf_error: Optional[Exception] = None

    # 1. When DSP preprocessing is enabled and ffmpeg is present, route via FFmpeg filter pipe
    if preprocess and ffmpeg_bin:
        filter_chain = build_audio_filter_chain(filter_profile)
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            "pipe:0",
        ]
        if filter_chain:
            cmd.extend(["-af", filter_chain])
        cmd.extend([
            "-f",
            "f32le",
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-ac",
            "1",
            "pipe:1",
        ])
        try:
            proc = subprocess.run(cmd, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            if proc.stdout and len(proc.stdout) > 0:
                valid_len = (len(proc.stdout) // 4) * 4
                audio_arr = np.frombuffer(proc.stdout[:valid_len], dtype=np.float32)
                if audio_arr.size > 0:
                    return np.ascontiguousarray(audio_arr, dtype=np.float32)
        except Exception as err:
            ffmpeg_err = err
            logger.warning("ffmpeg pipe with DSP failed (%s), trying soundfile fallback", ffmpeg_err)

    # 2. Try reading via soundfile (fast for WAV/OGG without DSP or as fallback)
    try:
        bio = io.BytesIO(data)
        audio_arr, orig_sr = sf.read(bio)
        mono_arr = to_mono_float32(audio_arr)
        resampled_arr = resample_to_16k(mono_arr, orig_sr)
        if preprocess:
            resampled_arr = apply_audio_dsp(resampled_arr, filter_profile=filter_profile)
        return resampled_arr
    except Exception as e:
        sf_error = e

    # 3. Fallback to ffmpeg pipe without filter (handles WebM/Opus when preprocess=False)
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
            valid_len = (len(proc.stdout) // 4) * 4
            audio_arr = np.frombuffer(proc.stdout[:valid_len], dtype=np.float32)
            if audio_arr.size == 0:
                raise ValueError("Decoded audio contains no samples")
            if preprocess:
                audio_arr = apply_audio_dsp(audio_arr, filter_profile=filter_profile)
            return audio_arr
        except Exception as err:
            ffmpeg_err = err
            # 4. Direct raw PCM fallback (headerless float32 or int16 16kHz mono)
            if len(data) % 4 == 0:
                try:
                    raw_float = np.frombuffer(data, dtype=np.float32)
                    if raw_float.size > 0 and np.all(np.isfinite(raw_float)) and np.max(np.abs(raw_float)) <= 1.5:
                        arr = np.ascontiguousarray(raw_float, dtype=np.float32)
                        return apply_audio_dsp(arr, filter_profile=filter_profile) if preprocess else arr
                except Exception:
                    pass
            if len(data) % 2 == 0:
                try:
                    raw_i16 = np.frombuffer(data, dtype=np.int16)
                    if raw_i16.size > 0:
                        raw_float = raw_i16.astype(np.float32) / 32768.0
                        arr = np.ascontiguousarray(raw_float, dtype=np.float32)
                        return apply_audio_dsp(arr, filter_profile=filter_profile) if preprocess else arr
                except Exception:
                    pass
            logger.error("ffmpeg decoding error: %s", ffmpeg_err)
            raise ValueError(f"Unable to decode audio payload: {ffmpeg_err}") from ffmpeg_err

    err_msg = f"Unable to decode audio format: soundfile error ({sf_error})"
    if ffmpeg_err is not None:
        err_msg += f", ffmpeg error ({ffmpeg_err})"
    logger.error(err_msg)
    raise ValueError(err_msg)


def transcribe_audio(
    audio_input: Union[bytes, np.ndarray],
    model_name: str = DEFAULT_MODEL_NAME,
    language: str = "ja",
    temperature: float = 0.0,
    condition_on_previous_text: bool = False,
    no_speech_threshold: float = 0.85,
    logprob_threshold: float = -1.5,
    initial_prompt: Optional[str] = DEFAULT_INITIAL_PROMPT,
    preprocess: bool = True,
    fp16: bool = False,
    word_timestamps: bool = False,
    compression_ratio_threshold: Optional[float] = 2.4,
    hallucination_silence_threshold: Optional[float] = None,
) -> Dict[str, Any]:
    """Transcribe audio using MLX Whisper on Apple Silicon Metal.

    Parameters:
    - audio_input: Raw audio bytes or 16 kHz mono float32 numpy array.
    - model_name: Hugging Face repo or path for mlx_whisper model.
    - language: Target language code (e.g. 'ja').
    - temperature: Sampling temperature (0.0 for deterministic greedy decoding).
    - condition_on_previous_text: Set False to prevent repetition loops on music/noise.
    - no_speech_threshold: Set 0.85 to avoid dropping quiet whisper segments.
    - logprob_threshold: Set -1.5 for speech confidence threshold.
    - initial_prompt: Initial prompt context for Japanese YouTube domain.
    - preprocess: Enable FFmpeg audio DSP filter chain.
    - fp16: Use float16 (True) or float32 (False, recommended to prevent NaN overflow on Metal).
    - word_timestamps: Extract per-word timestamps if needed.
    - compression_ratio_threshold: Whisper compression ratio threshold.
    - hallucination_silence_threshold: Threshold to suppress hallucinations on silence.

    Returns:
    Dict with text, segments (id, start, end, text), durationSec, elapsedSec, rtf, model, ram metrics.
    """
    if isinstance(audio_input, bytes):
        audio = decode_audio_bytes(audio_input, preprocess=preprocess)
    elif isinstance(audio_input, np.ndarray):
        audio = to_mono_float32(audio_input)
        if preprocess:
            audio = apply_audio_dsp(audio)
    else:
        raise ValueError(f"Unsupported audio input type: {type(audio_input)}")

    if audio.size == 0:
        raise ValueError("Audio array contains no samples")

    # Sanitize audio array against NaN / Inf and clamp to [-1.0, 1.0]
    audio = np.nan_to_num(audio, nan=0.0, posinf=0.0, neginf=0.0)
    audio = np.clip(audio, -1.0, 1.0)
    audio = np.ascontiguousarray(audio, dtype=np.float32)

    duration_sec = len(audio) / TARGET_SAMPLE_RATE
    if duration_sec < MIN_AUDIO_DURATION_SEC:
        raise ValueError(f"Audio duration is too short ({duration_sec:.3f}s < {MIN_AUDIO_DURATION_SEC}s)")
    if duration_sec > MAX_AUDIO_DURATION_SEC:
        raise ValueError(f"Audio duration exceeds {int(MAX_AUDIO_DURATION_SEC)} seconds limit ({duration_sec:.1f}s)")

    import mlx_whisper

    rss_before = get_process_rss_bytes()
    start_time = time.perf_counter()

    # Kotoba-Whisper (Distil-Whisper with 2-layer decoder) is highly sensitive to
    # initial prompts on short audio slices; suppress default initial prompt for Kotoba.
    effective_prompt = initial_prompt
    if "kotoba" in model_name.lower() and initial_prompt == DEFAULT_INITIAL_PROMPT:
        effective_prompt = None

    try:
        raw_result = mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=model_name,
            language=language,
            fp16=fp16,
            temperature=temperature,
            condition_on_previous_text=condition_on_previous_text,
            no_speech_threshold=no_speech_threshold,
            logprob_threshold=logprob_threshold,
            initial_prompt=effective_prompt,
            word_timestamps=word_timestamps,
            compression_ratio_threshold=compression_ratio_threshold,
            hallucination_silence_threshold=hallucination_silence_threshold,
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

    # Filter out single-character punctuation / token 0 collapses (e.g. '!')
    if not is_valid_speech_text(full_text):
        full_text = ""

    segments = []
    for idx, seg in enumerate(raw_segments):
        if not isinstance(seg, dict):
            continue
        seg_text = str(seg.get("text", "")).strip()
        if not is_valid_speech_text(seg_text):
            continue
        segments.append({
            "id": int(seg.get("id", idx)),
            "start": round(float(seg.get("start", 0.0)), 3),
            "end": round(float(seg.get("end", 0.0)), 3),
            "text": seg_text,
        })

    if not full_text and segments:
        full_text = " ".join(s["text"] for s in segments)

    rtf = elapsed_time / duration_sec if duration_sec > 0 else 0.0

    return {
        "text": full_text,
        "segments": segments,
        "language": language,
        "durationSec": round(float(duration_sec), 3),
        "elapsedSec": round(float(elapsed_time), 3),
        "rtf": round(float(rtf), 4),
        "model": model_name,
        "preprocess": preprocess,
        "fp16": fp16,
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
