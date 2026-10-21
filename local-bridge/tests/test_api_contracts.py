"""API contracts: status codes, size caps, lifespan, governor, sanitized errors.

Regression tests for the P1/P2 findings of review/full-codebase-improvement-audit-2026-10-18.md
(API/DB/schemas section): a "no captions" miss answered 502, inconsistent status codes for
a malformed video id, unbounded cue lists and log messages, the deprecated on_event
handlers and a worker budget that grew under memory pressure.
"""

from __future__ import annotations

import asyncio
import sys
import types

import pytest
from fastapi.testclient import TestClient

from app.api import captions as captions_api
from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# captions
# ---------------------------------------------------------------------------


def test_fetch_captions_raises_no_captions_error(monkeypatch):
    monkeypatch.setattr(captions_api, "_http", lambda *a, **k: b"{}")
    monkeypatch.setattr(captions_api, "_player_response_from_watch_html", lambda vid: {})
    with pytest.raises(captions_api.NoCaptionsError):
        captions_api.fetch_captions("abcdefgh", "ja")


def test_captions_endpoint_answers_404_when_there_are_no_captions(monkeypatch):
    def no_captions(video_id, lang):
        raise captions_api.NoCaptionsError("no captions for x lang=ja")

    monkeypatch.setattr(captions_api, "fetch_captions", no_captions)
    resp = client.get("/captions/abcdefgh")
    assert resp.status_code == 404
    assert resp.json()["ok"] is False


def test_captions_endpoint_does_not_echo_the_raw_exception(monkeypatch):
    def boom(video_id, lang):
        raise RuntimeError("upstream detail /Users/me/secret")

    monkeypatch.setattr(captions_api, "fetch_captions", boom)
    resp = client.get("/captions/abcdefgh")
    assert resp.status_code == 502
    assert "secret" not in resp.text
    assert resp.json()["detail"] == "caption fetch failed"


# ---------------------------------------------------------------------------
# scripts: one status code for a malformed video id
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    [
        "/scripts/bad",
        "/scripts/bad/meta",
        "/scripts/bad/tokens",
        "/scripts/bad/files",
    ],
)
def test_scripts_endpoints_answer_400_for_a_malformed_video_id(path):
    resp = client.get(path)
    assert resp.status_code == 400, f"{path} → {resp.status_code} {resp.text}"


def test_scripts_endpoints_answer_400_for_a_dotted_video_id():
    resp = client.get("/scripts/abc.def")
    assert resp.status_code == 400


def test_scripts_endpoints_still_serve_a_valid_video_id(root):
    from app.services import script_store

    script_store.save_script("abcdefgh", [])
    assert client.get("/scripts/abcdefgh").status_code == 200
    assert client.get("/scripts/abcdefgh/meta").status_code in (200, 404)


# ---------------------------------------------------------------------------
# size caps
# ---------------------------------------------------------------------------


def test_tokenize_batch_rejects_an_oversized_cue_list():
    body = {"cues": [{"id": str(i), "text": "テスト"} for i in range(2001)]}
    resp = client.post("/tokenize_batch", json=body)
    assert resp.status_code == 422


def test_tokenize_batch_accepts_a_cue_list_within_the_cap():
    body = {"cues": [{"id": str(i), "text": "テスト"} for i in range(10)]}
    resp = client.post("/tokenize_batch", json=body)
    assert resp.status_code == 200


def test_client_log_caps_the_message_length(monkeypatch):
    from app.api import health as health_api

    logged: list[str] = []
    monkeypatch.setattr(
        health_api, "append_errors_log", lambda level, message: logged.append(message)
    )
    resp = client.post("/log", json={"level": "WARNING", "message": "x" * 5000})
    assert resp.status_code == 200
    assert logged and len(logged[0]) == health_api.MAX_LOG_MESSAGE_CHARS


# ---------------------------------------------------------------------------
# lifespan + single worker
# ---------------------------------------------------------------------------


def test_lifespan_warms_the_tokenizer_and_the_ime_helper(monkeypatch):
    import app.main as main

    calls: list[str] = []
    monkeypatch.setattr(main, "load_ext_state_disk", lambda: None)
    monkeypatch.setattr(main, "load_dictionary", lambda: calls.append("dict"))
    monkeypatch.setattr(main, "load_freq", lambda *a, **k: calls.append("freq"))
    monkeypatch.setattr(main, "load_tokenizer", lambda *a, **k: calls.append("sudachi"))
    monkeypatch.setattr(main, "ensure_helper", lambda: calls.append("ime"))

    async def _run():
        async with main.lifespan(main.app):
            pass

    asyncio.run(_run())
    assert {"dict", "freq", "sudachi", "ime"} <= set(calls), calls


def test_check_single_worker_refuses_more_than_one_worker(monkeypatch):
    import app.main as main

    monkeypatch.setenv("WEB_CONCURRENCY", "4")
    with pytest.raises(RuntimeError):
        main.check_single_worker()


def test_check_single_worker_accepts_one_worker(monkeypatch):
    import app.main as main

    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    main.check_single_worker()


def test_check_single_worker_accepts_an_unset_environment(monkeypatch):
    import app.main as main

    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    monkeypatch.delenv("UVICORN_WORKERS", raising=False)
    main.check_single_worker()


def test_start_script_refuses_more_than_one_worker():
    """start.sh must fail fast instead of starting a second uvicorn worker."""
    import os
    import subprocess
    from pathlib import Path

    start_sh = Path(__file__).resolve().parent.parent / "start.sh"
    env = {**os.environ, "WEB_CONCURRENCY": "4"}
    proc = subprocess.run(
        ["bash", str(start_sh)], capture_output=True, text=True, env=env, timeout=60
    )
    assert proc.returncode == 1, proc.stdout + proc.stderr
    assert "single uvicorn worker" in (proc.stdout + proc.stderr)


# ---------------------------------------------------------------------------
# governor: memory pressure may only lower the budget
# ---------------------------------------------------------------------------


def test_memory_pressure_never_increases_the_worker_budget(monkeypatch):
    from app.core import governor as governor_module

    class _Memory:
        total = 16 * 1024**3
        available = 1 * 1024**3  # tight → high pressure

    class _Info:
        rss = 0

    class _Process:
        def memory_info(self):
            return _Info()

    fake_psutil = types.ModuleType("psutil")
    fake_psutil.virtual_memory = lambda: _Memory()  # type: ignore[attr-defined]
    fake_psutil.Process = lambda *a, **k: _Process()  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)

    gov = governor_module.Governor()
    gov._refresh_pressure()
    assert gov.state.pressure == "high"
    assert gov.state.caps.w_ocr == 0, "memory pressure raised the OCR worker budget"
    assert gov.state.caps.w_mt == 0, "memory pressure raised the MT worker budget"
    assert gov.state.caps.w_ocr <= gov.state._base_caps.w_ocr
    assert gov.state.caps.w_mt <= gov.state._base_caps.w_mt


# ---------------------------------------------------------------------------
# sanitized 500 details
# ---------------------------------------------------------------------------


def test_saved_items_500_does_not_echo_the_exception(monkeypatch):
    from app.api import saved_items as saved_items_api

    def boom(*a, **k):
        raise RuntimeError("secret /Users/me/private")

    monkeypatch.setattr(saved_items_api, "list_items", boom)
    resp = client.get("/saved/items")
    assert resp.status_code == 500
    assert "secret" not in resp.text


def test_snapshot_500_does_not_echo_the_exception(monkeypatch):
    from app.api import state as state_api

    def boom(*a, **k):
        raise RuntimeError("secret /Users/me/private")

    monkeypatch.setattr(state_api, "encode_snapshot", boom)
    resp = client.get("/backup/snapshot")
    assert resp.status_code == 500
    assert "secret" not in resp.text


# ---------------------------------------------------------------------------
# metrics: one sample series
# ---------------------------------------------------------------------------


def test_metrics_keep_one_sample_series():
    """One series is the single source of truth (the old code kept two)."""
    from collections import deque

    from app.utils import metrics

    for series in vars(metrics).values():
        if isinstance(series, deque):
            series.clear()
    metrics.record_tokenize_latency(10.0)
    metrics.record_tokenize_latency(20.0)
    assert metrics.p50_latency() == 20.0
    assert metrics.p95_latency() == 20.0

    series = [v for v in vars(metrics).values() if isinstance(v, deque)]
    assert len(series) == 1, "the metrics module keeps more than one sample series"
