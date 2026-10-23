"""errors.log must stay one physically line per entry.

The /log route takes client text verbatim, so a message carrying newlines could
forge extra log lines (and fake ERROR:bridge: entries).
"""

from __future__ import annotations

from app.utils import logging_utils


def test_newlines_in_a_message_do_not_forge_extra_lines(tmp_path, monkeypatch):
    log = tmp_path / "errors.log"
    monkeypatch.setattr(logging_utils, "_ERRORS_LOG", log)

    logging_utils.append_errors_log("WARNING", "first\nERROR:bridge:forged\nthird")

    lines = log.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1, lines
    # The forged text survives inline, but it can no longer start a line of its own.
    assert lines[0].startswith("WARNING:bridge:first ")
    assert not lines[0].startswith("ERROR:bridge:")


def test_a_blank_message_still_produces_one_line(tmp_path, monkeypatch):
    log = tmp_path / "errors.log"
    monkeypatch.setattr(logging_utils, "_ERRORS_LOG", log)

    logging_utils.append_errors_log("ERROR", "   \n\t ")

    lines = log.read_text(encoding="utf-8").splitlines()
    assert lines == ["ERROR:bridge:empty"], lines


def test_the_log_route_keeps_one_line(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    log = tmp_path / "errors.log"
    monkeypatch.setattr(logging_utils, "_ERRORS_LOG", log)
    client = TestClient(app)

    resp = client.post("/log", json={"level": "ERROR", "message": "boom\nERROR:bridge:fake"})

    assert resp.status_code == 200, resp.text
    lines = log.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1, lines
    assert lines[0] == "ERROR:bridge:boom ERROR:bridge:fake", lines


def test_asr_runtime_failure_is_written_to_errors_log(tmp_path, monkeypatch):
    """AGENTS.md §6: a 500 must land in errors.log, not only on stderr."""
    import sys
    import types

    from fastapi.testclient import TestClient

    from app.api import asr as asr_api
    from app.main import app

    log = tmp_path / "errors.log"
    monkeypatch.setattr(logging_utils, "_ERRORS_LOG", log)
    monkeypatch.setattr(asr_api, "MAX_AUDIO_BYTES", 10_000)

    def boom(**kwargs):
        raise RuntimeError("metal exploded")

    monkeypatch.setattr(asr_api, "transcribe_audio", boom)
    monkeypatch.setattr(asr_api.governor, "try_acquire", lambda: True)
    monkeypatch.setattr(asr_api.governor, "release", lambda: None)

    resp = TestClient(app).post(
        "/asr/transcribe",
        params={"preprocess": "false"},
        content=b"RIFFnot-really-wav" * 10,
        headers={"Content-Type": "audio/wav"},
    )

    assert resp.status_code == 500, resp.text
    text = log.read_text(encoding="utf-8")
    assert "asr transcribe runtime failure" in text, text
    assert "RuntimeError" in text, text
