"""meta.json is a union of bridge keys and iOS keys — a save must keep both.

The bridge writes video_id/url/title/updated_at/cue_count/translated_count/owned/rev/deviceId;
iOS merges video_id/rev/deviceId/updated_at/cue_count/owned over whatever is on disk, and reads
back `title` (bridge-written). Neither side may replace the file with only its own keys, or the
other side's data (device identity, titles, future keys) silently disappears.
"""

from __future__ import annotations

import json

from app.services import script_store


def test_save_preserves_foreign_meta_keys(tmp_path, monkeypatch):
    monkeypatch.setattr(script_store, "SCRIPTS_DIR", tmp_path)
    folder = tmp_path / "unionVid"
    folder.mkdir(parents=True)
    (folder / "meta.json").write_text(
        json.dumps(
            {
                "video_id": "unionVid",
                "rev": 4,
                "deviceId": "ipad-1",
                "updated_at": "2026-01-01T00:00:00",
                "cue_count": 1,
                "owned": True,
                "future_key": "must-survive",
            }
        )
    )
    (folder / "cues.json").write_text(json.dumps({"video_id": "unionVid", "cues": []}))

    script_store.save_script(
        "unionVid",
        [{"id": "c1", "start_media_time": 0.0, "end_media_time": 1.0, "source": "あ"}],
    )

    meta = json.loads((folder / "meta.json").read_text())
    # Keys no writer owns are preserved verbatim.
    assert meta["future_key"] == "must-survive", meta
    assert meta["owned"] is True, meta
    # Keys describing the latest write are refreshed by its author: a rev bump
    # restamps deviceId/updated_at instead of keeping the previous writer's.
    assert isinstance(meta["deviceId"], str) and meta["deviceId"], meta
    assert meta["rev"] == 5, f"rev must bump from 4, got {meta}"
    assert meta["cue_count"] == 1, meta
    assert "translated_count" in meta and "url" in meta, f"bridge keys missing: {meta}"
