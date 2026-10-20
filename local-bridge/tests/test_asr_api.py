"""Unit and integration tests for local-bridge ASR API and service."""

from __future__ import annotations

import io
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import app
from app.services.asr import (
    DEFAULT_MODEL_NAME,
    MAX_AUDIO_BYTES,
    TARGET_SAMPLE_RATE,
    decode_audio_bytes,
    get_asr_status,
    resample_to_16k,
    to_mono_float32,
    transcribe_audio,
)

client = TestClient(app)


def make_sine_wav(duration_sec: float = 1.0, sr: int = 16000, channels: int = 1) -> bytes:
    """Helper to generate in-memory synthetic sine wave WAV bytes."""
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False, dtype=np.float32)
    # 440 Hz standard tone
    sig = 0.2 * np.sin(2 * np.pi * 440 * t)
    if channels == 2:
        sig = np.column_stack([sig, sig])
    buf = io.BytesIO()
    sf.write(buf, sig, sr, format="WAV", subtype="FLOAT")
    return buf.getvalue()


# -------------------------------------------------------------------------
# Unit Tests: Services
# -------------------------------------------------------------------------


def test_to_mono_float32_1d():
    """1D float array should remain unchanged."""
    arr = np.array([0.1, -0.2, 0.5], dtype=np.float32)
    mono = to_mono_float32(arr)
    assert mono.ndim == 1
    np.testing.assert_allclose(mono, arr)


def test_to_mono_float32_stereo():
    """Stereo 2D array should downmix by channel averaging."""
    stereo = np.array([[0.2, 0.4], [-0.1, 0.3]], dtype=np.float32)
    mono = to_mono_float32(stereo)
    assert mono.ndim == 1
    assert len(mono) == 2
    np.testing.assert_allclose(mono, [0.3, 0.1])


def test_to_mono_float32_empty_raises():
    """Empty array should raise ValueError."""
    with pytest.raises(ValueError, match="cannot be empty"):
        to_mono_float32(np.array([], dtype=np.float32))


def test_resample_to_16k_identical():
    """16kHz array should return unchanged copy."""
    arr = np.ones(16000, dtype=np.float32)
    res = resample_to_16k(arr, 16000)
    assert len(res) == 16000


def test_resample_to_16k_from_48k():
    """48kHz array should resample to 16kHz (1/3 length)."""
    arr = np.ones(48000, dtype=np.float32)
    res = resample_to_16k(arr, 48000)
    assert len(res) == 16000


def test_decode_audio_bytes_wav():
    """Decodes valid 1s WAV to 16,000 float32 samples."""
    wav_bytes = make_sine_wav(duration_sec=1.0, sr=16000)
    decoded = decode_audio_bytes(wav_bytes)
    assert decoded.ndim == 1
    assert len(decoded) == 16000
    assert decoded.dtype == np.float32


def test_decode_audio_bytes_empty_raises():
    """0-byte payload should raise ValueError."""
    with pytest.raises(ValueError, match="cannot be empty"):
        decode_audio_bytes(b"")


def test_decode_audio_bytes_oversize_raises():
    """Payload over 50 MB should raise ValueError."""
    huge = b"0" * (MAX_AUDIO_BYTES + 10)
    with pytest.raises(ValueError, match="maximum size limit"):
        decode_audio_bytes(huge)


# -------------------------------------------------------------------------
# Integration Tests: Endpoints
# -------------------------------------------------------------------------


def test_asr_status_endpoint():
    """GET /asr/status should return engine availability and specs."""
    response = client.get("/asr/status")
    assert response.status_code == 200
    data = response.json()
    assert "available" in data
    assert data["targetSampleRate"] == 16000
    assert data["defaultModel"] == DEFAULT_MODEL_NAME


def test_asr_transcribe_empty_body_rejected():
    """POST /asr/transcribe with empty body returns 400."""
    response = client.post("/asr/transcribe", content=b"")
    assert response.status_code == 400
    assert "cannot be empty" in response.json()["detail"]


def test_asr_transcribe_invalid_bytes_rejected():
    """POST /asr/transcribe with invalid non-audio bytes returns 400."""
    response = client.post("/asr/transcribe", content=b"NOT_REAL_AUDIO_BYTES_12345")
    assert response.status_code == 400


def test_asr_transcribe_raw_body_wav():
    """POST /asr/transcribe with raw body WAV should transcribe successfully."""
    pytest.importorskip("mlx_whisper")
    wav_bytes = make_sine_wav(duration_sec=1.0, sr=16000)
    response = client.post(
        "/asr/transcribe",
        content=wav_bytes,
        headers={"Content-Type": "audio/wav"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "text" in data
    assert "segments" in data
    assert isinstance(data["segments"], list)
    assert data["durationSec"] == 1.0
    assert "rtf" in data
    assert "elapsedSec" in data
    assert data["model"] == DEFAULT_MODEL_NAME


def test_asr_transcribe_multipart_upload():
    """POST /asr/transcribe with multipart/form-data upload."""
    pytest.importorskip("mlx_whisper")
    wav_bytes = make_sine_wav(duration_sec=1.5, sr=48000, channels=2)
    files = {"file": ("test_stereo.wav", wav_bytes, "audio/wav")}
    response = client.post("/asr/transcribe", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "text" in data
    assert "segments" in data
    assert data["durationSec"] == 1.5


def test_asr_transcribe_duration_too_short():
    """POST /asr/transcribe with audio shorter than 0.05s returns 400."""
    # 0.01 seconds = 160 samples
    tiny_wav = make_sine_wav(duration_sec=0.01, sr=16000)
    response = client.post("/asr/transcribe", content=tiny_wav)
    assert response.status_code == 400
    assert "too short" in response.json()["detail"]


def test_asr_transcribe_fp16_parameter():
    """POST /asr/transcribe should accept fp16 query parameter."""
    pytest.importorskip("mlx_whisper")
    wav_bytes = make_sine_wav(duration_sec=1.0, sr=16000)
    response = client.post(
        "/asr/transcribe",
        params={"fp16": "false"},
        content=wav_bytes,
        headers={"Content-Type": "audio/wav"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "fp16" in data
    assert data["fp16"] is False
