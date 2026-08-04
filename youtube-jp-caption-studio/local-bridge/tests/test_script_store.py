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
    parse_script_txt,
    read_files,
    render_script_txt,
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

    assert (folder / "script.txt").exists(), "save_script should write script.txt"
    assert "猫だ1" in (folder / "script.txt").read_text(encoding="utf-8")

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


def test_script_txt_always_emits_ja_en_vi() -> None:
    """Empty EN/VI/JA still get their lines; furigana only when tokens exist."""
    txt = render_script_txt(
        [
            {
                "id": "a",
                "start_media_time": 0,
                "end_media_time": 13,
                "source": "私は毒島すみれ、図書委員です。",
                "en": "I am Sumire Busujima, a library committee member.",
                "vi": "",
            },
            {
                "id": "b",
                "start_media_time": 20,
                "end_media_time": 24,
                "source": "",
                "en": "(extra English line with no Japanese match)",
                "vi": "",
            },
            {
                "id": "c",
                "start_media_time": 30,
                "end_media_time": 32,
                "source": "猫",
                "en": "",
                "vi": "",
                "tokens": [{"surface": "猫", "reading": "ねこ"}],
            },
        ],
        video_id=VID,
    )
    assert "JA: 私は毒島すみれ、図書委員です。\nEN: I am Sumire Busujima, a library committee member.\nVI:" in txt
    assert "JA:\nEN: (extra English line with no Japanese match)\nVI:" in txt
    assert "JA: 猫\n    (猫(ねこ))\nEN:\nVI:" in txt
    assert txt.count("JA:") == 3 and txt.count("EN:") == 3 and txt.count("VI:") == 3


def test_parse_empty_ja_en_vi_lines() -> None:
    txt = """
# ----------------------------------------
[001] 0:00 → 0:02
JA:
EN:
VI:

# ----------------------------------------
[002] 0:03 → 0:05
JA: 猫
EN:
VI: mèo

# ----------------------------------------
"""
    rows = parse_script_txt(txt)
    assert len(rows) == 2
    assert rows[0]["start_media_time"] == 0.0 and rows[0]["end_media_time"] == 2.0
    assert rows[0]["source"] == "" and rows[0]["en"] == "" and rows[0]["vi"] == ""
    assert rows[1]["source"] == "猫" and rows[1]["en"] == "" and rows[1]["vi"] == "mèo"


def test_load_prefers_script_txt_over_garbage_cues(root: Path) -> None:
    vid = "txtPrefer99"
    folder = root / vid
    folder.mkdir(parents=True)
    good_txt = render_script_txt(
        [
            {
                "id": "real",
                "start_media_time": 0,
                "end_media_time": 3.1,
                "source": "なーヒカル、リコちゃんと喋ったことある？",
                "en": "Hey Hikaru",
                "vi": "Này Hikaru",
            }
        ],
        video_id=vid,
    )
    (folder / "script.txt").write_text(good_txt, encoding="utf-8")
    (folder / "cues.json").write_text(
        json.dumps(
            {
                "video_id": vid,
                "cues": [
                    {
                        "id": "junk",
                        "start_media_time": 0,
                        "end_media_time": 0.5,
                        "source": "あ",
                        "en": "en0",
                        "vi": "vi0",
                    }
                ],
                "meta": {"rev": 5, "owned": True},
            }
        ),
        encoding="utf-8",
    )
    (folder / "meta.json").write_text(
        json.dumps({"video_id": vid, "rev": 5, "owned": True, "deviceId": "pc-test"}),
        encoding="utf-8",
    )
    before_txt = (folder / "script.txt").read_text(encoding="utf-8")

    loaded = load_script(vid)
    assert loaded is not None
    assert loaded["cues"][0]["source"] == "なーヒカル、リコちゃんと喋ったことある？"
    assert loaded["cues"][0]["vi"] == "Này Hikaru"
    assert loaded["meta"]["rev"] == 6, "content change must bump Lamport rev"
    disk = json.loads((folder / "cues.json").read_text(encoding="utf-8"))
    assert disk["cues"][0]["source"].startswith("なーヒカル")
    assert (folder / "script.txt").read_text(encoding="utf-8") == before_txt


def test_load_script_txt_rescues_inline_tokens(root: Path) -> None:
    """script.txt prefer must not discard tokens still sitting inline on cues.json."""
    vid = "tokRescue1"
    folder = root / vid
    folder.mkdir(parents=True)
    good_txt = render_script_txt(
        [
            {
                "id": "keep-me",
                "start_media_time": 0,
                "end_media_time": 2,
                "source": "猫だ",
                "en": "cat",
                "vi": "mèo",
            }
        ],
        video_id=vid,
    )
    (folder / "script.txt").write_text(good_txt, encoding="utf-8")
    (folder / "cues.json").write_text(
        json.dumps(
            {
                "video_id": vid,
                "cues": [
                    {
                        "id": "keep-me",
                        "start_media_time": 0,
                        "end_media_time": 2,
                        "source": "あ",
                        "en": "en0",
                        "vi": "vi0",
                        "tokens": TOKENS,
                    }
                ],
                "meta": {"rev": 1, "owned": True},
            }
        ),
        encoding="utf-8",
    )
    (folder / "meta.json").write_text(
        json.dumps({"video_id": vid, "rev": 1, "owned": True, "deviceId": "pc-test"}),
        encoding="utf-8",
    )
    (folder / "tokens.json").write_text("{}", encoding="utf-8")

    loaded = load_script(vid)
    assert loaded is not None
    assert loaded["cues"][0]["source"] == "猫だ"
    assert "tokens" not in loaded["cues"][0]
    assert load_tokens(vid) == {"keep-me": TOKENS}, "TXT prefer dropped inline tokens"


def test_read_files_keeps_existing_script_txt(root: Path) -> None:
    vid = "keepTxt1234"
    folder = root / vid
    folder.mkdir(parents=True)
    custom = "# CUSTOM SCRIPT\n[001] 0:00 → 0:01\nJA: 残す\nEN: keep\nVI: giữ\n\n# ----------------------------------------\n"
    (folder / "script.txt").write_text(custom, encoding="utf-8")
    (folder / "cues.json").write_text(
        json.dumps(
            {
                "video_id": vid,
                "cues": [
                    {
                        "id": "c0",
                        "start_media_time": 0,
                        "end_media_time": 1,
                        "source": "残す",
                        "en": "keep",
                        "vi": "giữ",
                    }
                ],
                "meta": {"rev": 1},
            }
        ),
        encoding="utf-8",
    )
    (folder / "meta.json").write_text(
        json.dumps({"video_id": vid, "rev": 1, "deviceId": "pc-test"}),
        encoding="utf-8",
    )

    files = read_files(vid)
    assert files is not None
    assert files["script.txt"] == custom
    assert (folder / "script.txt").read_text(encoding="utf-8") == custom


def main() -> None:
    test_script_txt_always_emits_ja_en_vi()
    print("  [ok] test_script_txt_always_emits_ja_en_vi")
    test_parse_empty_ja_en_vi_lines()
    print("  [ok] test_parse_empty_ja_en_vi_lines")
    for fn in (
        test_tokens_split_merge_roundtrip,
        test_legacy_inline_tokens_migrate_on_read,
        test_rev_monotonic_and_owned,
        test_files_mirror_roundtrip,
        test_load_prefers_script_txt_over_garbage_cues,
        test_load_script_txt_rescues_inline_tokens,
        test_read_files_keeps_existing_script_txt,
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
