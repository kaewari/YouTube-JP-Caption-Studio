"""Smoke: tokens split/merge, legacy migration, monotonic rev, files mirror.

Run from local-bridge:
  .venv/bin/python -m tests.test_script_store
  # or: PYTHONPATH=. .venv/bin/python tests/test_script_store.py
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.services.script_store import (  # noqa: E402
    list_scripts,
    load_meta,
    load_script,
    load_tokens,
    merge_tokens,
    read_files,
    save_script,
    write_files,
)

VID = "dQw4w9WgXcQ"
TOKENS = [{"surface": "猫", "reading": "ねこ"}, {"surface": "だ"}]


def cue(i: int, *, tokens: list | None = None) -> dict:
    c = {
        "id": f"c{i}",
        "start_media_time": float(i),
        "end_media_time": float(i) + 1.0,
        "source": f"猫だ{i}",
        "en": f"cat {i}",
        "vi": f"mèo {i}",
    }
    if tokens is not None:
        c["tokens"] = tokens
    return c


def test_tokens_split_merge_roundtrip(root: Path) -> None:
    save_script(VID, [cue(1, tokens=TOKENS), cue(2)], title="猫", url="http://x")
    folder = root / VID

    on_disk = json.loads((folder / "cues.json").read_text(encoding="utf-8"))
    assert all("tokens" not in c for c in on_disk["cues"]), "cues.json still carries tokens"
    assert json.loads((folder / "tokens.json").read_text(encoding="utf-8")) == {"c1": TOKENS}

    loaded = load_script(VID)
    assert loaded is not None and all("tokens" not in c for c in loaded["cues"])
    merged = merge_tokens([dict(c) for c in loaded["cues"]], load_tokens(VID))
    assert merged[0]["tokens"] == TOKENS, "split → merge lost tokens"
    assert merged[1]["tokens"] == []

    # Re-saving without tokens must not drop the ones we already have.
    save_script(VID, [cue(1), cue(2)])
    assert load_tokens(VID) == {"c1": TOKENS}

    # …but tokens of deleted cues do not linger.
    save_script(VID, [cue(2)])
    assert load_tokens(VID) == {}


def test_legacy_inline_tokens_migrate_on_read(root: Path) -> None:
    legacy = "aBcDeF12345"
    folder = root / legacy
    folder.mkdir(parents=True)
    (folder / "cues.json").write_text(
        json.dumps({"video_id": legacy, "cues": [cue(1, tokens=TOKENS), cue(2, tokens=[])]}),
        encoding="utf-8",
    )

    loaded = load_script(legacy)
    assert loaded is not None
    assert all("tokens" not in c for c in loaded["cues"]), "read still returns tokens"
    assert load_tokens(legacy) == {"c1": TOKENS}, "migration lost tokens"
    rewritten = json.loads((folder / "cues.json").read_text(encoding="utf-8"))
    assert all("tokens" not in c for c in rewritten["cues"]), "cues.json not rewritten"
    assert load_script(legacy) is not None  # second read is a no-op


def test_rev_monotonic_and_owned(root: Path) -> None:
    vid = "revTest1234"
    assert save_script(vid, [cue(1)])["rev"] == 1
    assert save_script(vid, [cue(1)])["rev"] == 2
    # A client echoing a higher rev (seen on Drive/iPad) pulls the counter up…
    assert save_script(vid, [cue(1)], rev=41)["rev"] == 42
    # …and a stale client can never push it back down.
    assert save_script(vid, [cue(1)], rev=3)["rev"] == 43

    meta = load_meta(vid)
    assert meta is not None and meta["rev"] == 43
    assert meta["deviceId"] and meta["owned"] is False
    save_script(vid, [cue(1)], owned=True)
    assert load_meta(vid)["owned"] is True, "owned not persisted to meta.json"
    save_script(vid, [cue(1)])
    assert load_meta(vid)["owned"] is True, "owned lost when caller omits it"

    listed = {s["video_id"]: s for s in list_scripts()}
    assert listed[vid]["rev"] == 45 and listed[vid]["owned"] is True


def test_files_mirror_roundtrip(root: Path) -> None:
    save_script(VID, [cue(1, tokens=TOKENS)], title="猫", url="http://x")
    folder = root / VID
    (folder / "script.txt").unlink(missing_ok=True)

    save_script(VID, [cue(1, tokens=TOKENS)])
    assert not (folder / "script.txt").exists(), "save_script still writes script.txt"

    files = read_files(VID)
    assert files is not None and set(files) == {"cues.json", "meta.json", "script.txt"}
    assert "tokens.json" not in files
    assert "猫(ねこ)" in files["script.txt"], "furigana lost — tokens not merged for render"
    assert (folder / "script.txt").exists(), "files GET did not persist script.txt"

    other = "mirror12345"
    write_files(other, files)
    assert load_script(other)["cues"][0]["vi"] == "mèo 1"
    assert load_meta(other)["rev"] == load_meta(VID)["rev"]

    for bad in ({}, {"cues.json": "{oops"}):
        try:
            write_files(other, bad)
            raise AssertionError(f"write_files accepted {bad!r}")
        except ValueError:
            pass


def main() -> None:
    for fn in (
        test_tokens_split_merge_roundtrip,
        test_legacy_inline_tokens_migrate_on_read,
        test_rev_monotonic_and_owned,
        test_files_mirror_roundtrip,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with mock.patch("app.services.script_store.scripts_root", lambda: root):
                with mock.patch("app.services.script_store.SCRIPTS_DIR", root):
                    fn(root)
        print(f"  [ok] {fn.__name__}")
    print("[test_script_store] ok")


if __name__ == "__main__":
    main()
