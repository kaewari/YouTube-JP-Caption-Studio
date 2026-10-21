"""ASR trust boundary: model allowlist, sanitized errors, governor slot, per-request Metal peak.

Regression tests for the P1 findings of review/full-codebase-improvement-audit-2026-10-18.md
(services section): the `model` query param reached `path_or_hf_repo` unchecked, the
endpoint echoed raw ffmpeg/MLX internals, the heavy path skipped the governor and the
Metal peak counter was never reset.
"""

from __future__ import annotations

import io
import sys
import threading
import time
import types

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import app
from app.services import asr as asr_service

client = TestClient(app)


def make_wav(duration_sec: float = 1.0, sr: int = 16000) -> bytes:
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, 0.2 * np.sin(2 * np.pi * 440 * t), sr, format="WAV", subtype="FLOAT")
    return buf.getvalue()


@pytest.fixture
def fake_mlx(monkeypatch):
    """Stand-ins for mlx_whisper / mlx.core so the ASR path runs without Metal."""
    state = {"peak": 0, "resets": 0, "calls": [], "in_flight": 0, "max_in_flight": 0}

    mlx = types.ModuleType("mlx")
    mlx.__path__ = []  # type: ignore[attr-defined]
    core = types.ModuleType("mlx.core")

    def get_peak_memory():
        return state["peak"]

    def reset_peak_memory():
        state["resets"] += 1
        state["peak"] = 0

    core.get_peak_memory = get_peak_memory
    core.reset_peak_memory = reset_peak_memory
    mlx.core = core  # type: ignore[attr-defined]

    def transcribe(audio, **kwargs):
        state["calls"].append(kwargs)
        state["in_flight"] += 1
        state["max_in_flight"] = max(state["max_in_flight"], state["in_flight"])
        try:
            time.sleep(0.05)
            state["peak"] = 1234
            return {
                "text": "テスト",
                "segments": [{"id": 0, "start": 0.0, "end": 1.0, "text": "テスト"}],
            }
        finally:
            state["in_flight"] -= 1

    whisper = types.ModuleType("mlx_whisper")
    whisper.transcribe = transcribe  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "mlx", mlx)
    monkeypatch.setitem(sys.modules, "mlx.core", core)
    monkeypatch.setitem(sys.modules, "mlx_whisper", whisper)
    return state


# ---------------------------------------------------------------------------
# model allowlist
# ---------------------------------------------------------------------------


def test_service_rejects_an_unknown_model_without_downloading(fake_mlx):
    """An unknown repo must never reach path_or_hf_repo."""
    audio = np.zeros(16000, dtype=np.float32)
    with pytest.raises(ValueError, match="unsupported model"):
        asr_service.transcribe_audio(
            audio, model_name="attacker/arbitrary-repo", preprocess=False
        )
    assert fake_mlx["calls"] == [], "the model was handed to the engine anyway"


def test_service_accepts_the_allowlisted_models(fake_mlx):
    audio = np.zeros(16000, dtype=np.float32)
    for name in asr_service.ALLOWED_MODELS:
        out = asr_service.transcribe_audio(audio, model_name=name, preprocess=False)
        assert out["model"] == name


def test_endpoint_rejects_an_unknown_model(fake_mlx):
    resp = client.post(
        "/asr/transcribe",
        params={"model": "attacker/arbitrary-repo"},
        content=make_wav(),
        headers={"Content-Type": "audio/wav"},
    )
    assert resp.status_code == 400
    assert "unsupported model" in resp.json()["detail"]
    assert fake_mlx["calls"] == []


def test_endpoint_serves_an_allowlisted_model(fake_mlx):
    resp = client.post(
        "/asr/transcribe",
        params={"model": "mlx-community/whisper-large-v3-turbo", "preprocess": "false"},
        content=make_wav(),
        headers={"Content-Type": "audio/wav"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["model"] == "mlx-community/whisper-large-v3-turbo"


# ---------------------------------------------------------------------------
# sanitized error details
# ---------------------------------------------------------------------------


def test_decode_failure_does_not_leak_ffmpeg_internals(monkeypatch):
    """A decode failure must answer with a stable message, not the tool output."""
    # No ffmpeg on PATH: the decoder ends in its "cannot decode" branch.
    monkeypatch.setattr(asr_service.shutil, "which", lambda name: None)
    with pytest.raises(ValueError) as exc:
        asr_service.decode_audio_bytes(b"NOT_REAL_AUDIO_BYTES_12345")
    assert str(exc.value) == "Unable to decode audio format"


def test_decode_failure_message_has_no_tool_output(monkeypatch):
    """The ffmpeg error text stays in the log, not in the exception message."""
    calls: list[str] = []
    monkeypatch.setattr(asr_service.shutil, "which", lambda name: None)
    with pytest.raises(ValueError) as exc:
        asr_service.decode_audio_bytes(b"NOT_REAL_AUDIO_BYTES_12345")
    detail = str(exc.value)
    for leak in ("soundfile", "ffmpeg", "error (", "sndfile"):
        assert leak not in detail.lower(), detail


def test_engine_failure_does_not_leak_mlx_internals(monkeypatch, fake_mlx):
    def boom(*a, **k):
        raise RuntimeError("mlx internal detail /Users/me/private")

    monkeypatch.setattr(asr_service, "get_metal_peak_memory_bytes", lambda: None)
    monkeypatch.setitem(sys.modules, "mlx_whisper", types.SimpleNamespace(transcribe=boom))
    resp = client.post(
        "/asr/transcribe",
        params={"preprocess": "false"},
        content=make_wav(),
        headers={"Content-Type": "audio/wav"},
    )
    assert resp.status_code == 500
    body = resp.text
    assert "mlx internal detail" not in body
    assert "/Users/me/private" not in body


# ---------------------------------------------------------------------------
# governor slot on the heavy path
# ---------------------------------------------------------------------------


def test_endpoint_returns_503_when_the_governor_is_saturated(monkeypatch, fake_mlx):
    from app.core.governor import governor

    monkeypatch.setattr(governor, "try_acquire", lambda: False)
    resp = client.post(
        "/asr/transcribe",
        params={"preprocess": "false"},
        content=make_wav(),
        headers={"Content-Type": "audio/wav"},
    )
    assert resp.status_code == 503
    assert fake_mlx["calls"] == []


def test_endpoint_releases_the_governor_slot(monkeypatch, fake_mlx):
    from app.core.governor import governor

    released = []
    monkeypatch.setattr(governor, "release", lambda: released.append(True))
    resp = client.post(
        "/asr/transcribe",
        params={"preprocess": "false"},
        content=make_wav(),
        headers={"Content-Type": "audio/wav"},
    )
    assert resp.status_code == 200
    assert released, "the governor slot was not released"


def test_concurrent_transcriptions_do_not_overlap(fake_mlx):
    """Two first-loads would allocate the Metal model twice."""
    audio = np.zeros(16000, dtype=np.float32)
    errors: list[Exception] = []

    def run():
        try:
            asr_service.transcribe_audio(audio, preprocess=False)
        except Exception as exc:  # pragma: no cover - surfaced by the assert
            errors.append(exc)

    threads = [threading.Thread(target=run) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors, errors
    assert fake_mlx["max_in_flight"] == 1, "two transcriptions ran at the same time"


# ---------------------------------------------------------------------------
# per-request Metal peak
# ---------------------------------------------------------------------------


def test_metal_peak_is_reset_before_every_transcription(fake_mlx):
    audio = np.zeros(16000, dtype=np.float32)
    first = asr_service.transcribe_audio(audio, preprocess=False)
    assert first["metalPeakBytes"] == 1234

    # An unrelated allocation after the first request must not leak into the
    # next reading: the counter is process-wide.
    fake_mlx["peak"] = 999_999
    second = asr_service.transcribe_audio(audio, preprocess=False)
    assert second["metalPeakBytes"] == 1234
    assert fake_mlx["resets"] >= 2
