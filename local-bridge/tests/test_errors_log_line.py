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
