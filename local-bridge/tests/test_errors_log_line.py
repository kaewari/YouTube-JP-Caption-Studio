"""errors.log must stay one physically line per entry.

The /log route takes client text verbatim, so a message carrying newlines could
forge extra log lines (and fake ERROR:bridge: entries).
"""

from __future__ import annotations

import sqlite3

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


def test_saved_items_500_is_written_to_errors_log(tmp_path, monkeypatch):
    """A failed saved-items request must land in errors.log (AGENTS.md §6)."""
    from fastapi.testclient import TestClient

    from app.api import saved_items as saved_api
    from app.main import app

    log = tmp_path / "errors.log"
    monkeypatch.setattr(logging_utils, "_ERRORS_LOG", log)

    def broken(*args, **kwargs):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(saved_api, "list_items", broken)
    resp = TestClient(app).get("/saved/items")

    assert resp.status_code == 500, resp.text
    text = log.read_text(encoding="utf-8")
    assert "api_list_saved error" in text, text
    assert "OperationalError" in text, text
    # The SQL/path detail must stay out of the log line.
    assert "database is locked" not in text, text


def test_bootstrap_failure_is_logged_without_touching_real_data(tmp_path, monkeypatch):
    """AGENTS.md §6 for the bootstrap worker, sandboxed to tmp.

    `_bootstrap_worker()` writes into the real `data/dict`, so the fixture points
    DICT at tmp first: the test must never touch the developer's dictionary.
    """
    from app.scripts import bootstrap as bootstrap_mod

    log = tmp_path / "errors.log"
    monkeypatch.setattr(logging_utils, "_ERRORS_LOG", log)
    monkeypatch.setattr(bootstrap_mod, "DICT", tmp_path / "dict")
    monkeypatch.setattr(bootstrap_mod, "MIN_JMDICT_KEYS", 1)
    monkeypatch.setattr(bootstrap_mod, "_jmdict_key_count", lambda path: 0)

    def offline(url, dest):
        raise OSError("network is down")

    monkeypatch.setattr(bootstrap_mod, "_download", offline)

    bootstrap_mod._bootstrap_worker()

    text = log.read_text(encoding="utf-8")
    assert "bootstrap" in text, text
    # The offline download lands in the "JMdict incomplete" exit, which is the one
    # this test can reach without a real network.
    assert "jmdict incomplete" in text, text
    assert bootstrap_mod._progress.done is True
    assert (tmp_path / "dict").exists(), "the worker must be sandboxed to tmp"
