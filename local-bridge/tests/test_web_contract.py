"""Wire contract between the bridge routes and the extension/web clients.

The extension and the Savings Items page read `/scripts/{id}` and expect the
cue to carry `start_media_time` in **seconds** plus a `meta.rev`. Nothing asserted
that shape, so a rename or a unit change on either side would only show up as a
silently mis-timed cue in the browser.

This runs the real routes against a disposable scripts directory: no production
data is touched.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services import script_store

client = TestClient(app)


def _save(tmp_path, monkeypatch, cues):
    monkeypatch.setattr(script_store, "SCRIPTS_DIR", tmp_path)
    resp = client.post(
        "/scripts/save",
        json={"video_id": "contractVid", "cues": cues, "title": "t", "owned": True},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_load_returns_the_cue_fields_the_web_reader_uses(tmp_path, monkeypatch):
    saved = _save(
        tmp_path,
        monkeypatch,
        [
            {
                "id": "c1",
                "start_media_time": 1.25,
                "end_media_time": 3.5,
                "source": "日本語",
                "en": "Japanese",
                "vi": "tiếng Nhật",
            }
        ],
    )
    assert saved["ok"] is True

    resp = client.get("/scripts/contractVid")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["found"] is True
    assert body["cue_count"] == 1
    cue = body["cues"][0]

    # web/saved-items normalizes `startTime || start_media_time`; the seconds unit
    # is the contract (a ms value here would show every cue at 0:00).
    assert cue["start_media_time"] == 1.25, cue
    assert cue["end_media_time"] == 3.5, cue
    # The reader keys words/cues off these exact names.
    for field in ("id", "source", "en", "vi"):
        assert field in cue, f"{field} missing from the wire cue: {cue}"
    assert "startTime" not in cue, "the bridge must keep the extension's snake_case wire"

    # Drive freshness checks read meta.rev; a save must stamp it.
    assert isinstance(body["meta"].get("rev"), int), body["meta"]


def test_meta_route_exposes_rev_for_the_drive_check(tmp_path, monkeypatch):
    _save(
        tmp_path,
        monkeypatch,
        [{"id": "c1", "start_media_time": 0.0, "end_media_time": 1.0, "source": "あ"}],
    )
    resp = client.get("/scripts/contractVid/meta")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body.get("rev"), int), body
    assert body.get("video_id") == "contractVid", body


def test_bad_timing_is_rejected_at_the_boundary(tmp_path, monkeypatch):
    monkeypatch.setattr(script_store, "SCRIPTS_DIR", tmp_path)
    resp = client.post(
        "/scripts/save",
        json={
            "video_id": "contractVid",
            "cues": [{"id": "bad", "start_media_time": 5.0, "end_media_time": 1.0, "source": "x"}],
        },
    )
    assert resp.status_code == 422, resp.text
