"""Smoke: Snapshot v1 is vocab-only — scripts travel via /scripts/{id}/files.

Run from local-bridge:
  .venv/bin/python -m tests.test_snapshot_roundtrip
  # or: PYTHONPATH=. .venv/bin/python tests/test_snapshot_roundtrip.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest import mock

# local-bridge on path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.services.snapshot import apply_snapshot, encode_snapshot  # noqa: E402


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        with mock.patch("app.services.script_store.scripts_root", lambda: root):
            with mock.patch("app.services.script_store.SCRIPTS_DIR", root):
                from app.services.script_store import list_scripts, load_script, save_script

                save_script(
                    "dQw4w9WgXcQ",
                    [{"id": "1", "start_media_time": 0.0, "source": "こんにちは", "vi": "Xin chào"}],
                    title="smoke",
                )

                body = {
                    "version": 1,
                    "updatedAt": "2026-08-02T03:40:00Z",
                    "scripts": [
                        {
                            "videoId": "dQw4w9WgXcQ",
                            "title": "stale drive copy",
                            "owned": True,
                            "cues": [{"id": "1", "startTime": 0, "textJA": "こんにちは"}],
                        }
                    ],
                    "vocab": [
                        {
                            "word": "世界",
                            "reading": "せかい",
                            "meaning": "learning",
                            "jlptLevel": 5,
                            "frequencyCount": 1,
                            "savedAt": "2026-08-02T03:40:00Z",
                        }
                    ],
                }
                applied = apply_snapshot(body)
                assert applied["ok"] is True
                assert applied["userVocab"].get("世界") == "learning"
                assert applied["script_count"] == 0, "snapshot must not import scripts"

                # A snapshot must never rewrite (or delete) a local script folder.
                data = load_script("dQw4w9WgXcQ")
                assert data is not None
                assert data["meta"]["title"] == "smoke", "snapshot overwrote disk script"
                assert data["meta"]["rev"] == 1, "snapshot bumped rev"
                assert [s["video_id"] for s in list_scripts()] == ["dQw4w9WgXcQ"]

                empty = apply_snapshot(
                    {"version": 1, "updatedAt": "2026-08-02T03:41:00Z", "scripts": [], "vocab": []}
                )
                assert empty["ok"] is True
                assert load_script("dQw4w9WgXcQ") is not None, "empty snapshot deleted local script"

                out = encode_snapshot(user_vocab=applied["userVocab"], updated_at=body["updatedAt"])
                assert out["version"] == 1
                assert out["updatedAt"] == "2026-08-02T03:40:00Z"
                assert out["scripts"] == [], "snapshot must not export scripts"
                assert out["vocab"][0]["word"] == "世界"

    print("[test_snapshot_roundtrip] ok")


if __name__ == "__main__":
    main()
