"""Smoke: tokens split/merge, legacy migration, monotonic rev, files mirror.

Run from local-bridge:
  .venv/bin/python -m tests.test_script_store
  # or: PYTHONPATH=. .venv/bin/python tests/test_script_store.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.services import script_store as store  # noqa: E402
from app.services.script_store import (  # noqa: E402
    ScriptRevisionConflict,
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
    # A stale client cannot overwrite content or advance the counter.
    before = {p.name: p.read_bytes() for p in (root / vid).iterdir()}
    try:
        save_script(vid, [], owned=False, rev=3)
        raise AssertionError("stale script revision accepted")
    except ScriptRevisionConflict as exc:
        assert exc.current_rev == 42
    assert {p.name: p.read_bytes() for p in (root / vid).iterdir()} == before

    meta = load_meta(vid)
    assert meta is not None and meta["rev"] == 42
    assert meta["deviceId"] and meta["owned"] is False
    save_script(vid, [cue(1)], owned=True)
    assert load_meta(vid)["owned"] is True, "owned not persisted to meta.json"
    save_script(vid, [cue(1)])
    assert load_meta(vid)["owned"] is True, "owned lost when caller omits it"

    listed = {s["video_id"]: s for s in list_scripts()}
    assert listed[vid]["rev"] == 44 and listed[vid]["owned"] is True


def test_load_and_save_share_revision_lock(root: Path) -> None:
    vid = "loadRace01"
    assert save_script(vid, [cue(1)], rev=4)["rev"] == 5
    (root / vid / "script.txt").write_text(
        render_script_txt([{**cue(1), "source": "TXT edit"}], video_id=vid),
        encoding="utf-8",
    )
    entered, release, writer_started = threading.Event(), threading.Event(), threading.Event()
    original_write = store._atomic_write_text
    reader_thread = None

    def held_write(path: Path, text: str) -> None:
        if threading.current_thread() is reader_thread and path.name == "cues.json":
            entered.set()
            assert release.wait(5), "reader was never released"
        original_write(path, text)

    def read() -> dict:
        nonlocal reader_thread
        reader_thread = threading.current_thread()
        return load_script(vid)

    def write() -> list:
        writer_started.set()
        results = []
        for rev in (5, 6):
            try:
                results.append(save_script(vid, [{**cue(1), "source": f"writer{rev + 1}"}], rev=rev)["rev"])
            except ScriptRevisionConflict as exc:
                results.append(("conflict", exc.current_rev))
        return results

    with mock.patch.object(store, "_atomic_write_text", held_write), ThreadPoolExecutor(max_workers=2) as pool:
        reader = pool.submit(read)
        writer = None
        try:
            assert entered.wait(5), "reader never reached its disk write"
            writer = pool.submit(write)
            assert writer_started.wait(5)
            try:
                early = writer.result(timeout=.1)
            except TimeoutError:
                early = None
        finally:
            release.set()
        assert reader.result(timeout=5)["meta"]["rev"] == 6
        results = writer.result(timeout=5)
    actual = load_meta(vid)["rev"]
    print(f"  load/save race: early={early}, writer results={results}, disk rev={actual}")
    assert early is None, "writer bypassed the reader's per-video lock"
    assert results == [("conflict", 6), 7]
    assert actual == 7
    assert load_script(vid)["cues"][0]["source"] == "writer7"


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

def test_mirror_rejects_cues_json_without_a_cues_array(root: Path) -> None:
    """The structural check used to live inside the rev-comparison branch, so a
    payload that carried cues.json but no meta.json skipped it entirely and any
    valid JSON landed on disk — after which load_script() returned None."""
    save_script(VID, [cue(1)], title="cat")
    before = read_files(VID)
    for bad in (
        {"cues.json": json.dumps({"totally": "not a cues array"})},
        {"cues.json": json.dumps({"cues": "nope"})},
        {"cues.json": json.dumps({"cues": ["not-an-object"]})},
        {"cues.json": json.dumps([1, 2, 3])},
    ):
        try:
            write_files(VID, bad)
        except ValueError:
            continue
        raise AssertionError(f"write_files accepted {bad!r}")
    assert read_files(VID) == before, "a rejected payload must not touch disk"
    assert load_script(VID) is not None, "the existing script must stay readable"


def test_mirror_read_and_delete_share_video_lock(root: Path, *, actions=("read", "delete")) -> None:
    for action in actions:
        vid = "mirrorRace" + action
        save_script(vid, [cue(1)], title="old")
        old_files = read_files(vid)
        save_script(vid, [cue(2)], title="new")
        new_files = read_files(vid)
        # Reset this disposable fixture; a stale mirror must not roll back a real store.
        store.delete_script(vid)
        write_files(vid, old_files)
        entered, release, observer_started = threading.Event(), threading.Event(), threading.Event()
        original_write = store._atomic_write_text
        writer_thread = None

        def held_write(path: Path, text: str) -> None:
            original_write(path, text)
            if threading.current_thread() is writer_thread and path.name == "cues.json":
                entered.set()
                assert release.wait(5), "mirror writer was never released"

        def write() -> dict:
            nonlocal writer_thread
            writer_thread = threading.current_thread()
            return write_files(vid, new_files)

        def observe():
            observer_started.set()
            return read_files(vid) if action == "read" else store.delete_script(vid)

        with mock.patch.object(store, "_atomic_write_text", held_write), ThreadPoolExecutor(max_workers=2) as pool:
            writer = pool.submit(write)
            observer = None
            try:
                assert entered.wait(5)
                observer = pool.submit(observe)
                assert observer_started.wait(5)
                try:
                    early = observer.result(timeout=.1)
                except TimeoutError:
                    early = None
            finally:
                release.set()
            writer.result(timeout=5)
            observed = observer.result(timeout=5)
        print(f"  mirror/{action}: observer blocked={early is None}")
        assert early is None, f"{action} bypassed in-progress mirror write"
        if action == "read":
            assert observed == new_files, "mirror read returned a mixed revision"
        else:
            assert observed["deleted"] and not (root / vid).exists()


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


def test_save_sanitizes_non_finite_times(root: Path) -> None:
    """NaN/Inf/None times must never reach cues.json (breaks JSON parse on clients)."""
    vid = "nanSafe1234"
    save_script(
        vid,
        [
            {"id": "a", "start_media_time": float("nan"), "end_media_time": float("inf"), "source": "あ"},
            {"id": "b", "start_media_time": None, "end_media_time": "oops", "source": "い"},
            {"id": "c", "start_media_time": 1.5, "end_media_time": 2.5, "source": "う"},
        ],
    )
    on_disk = json.loads((root / vid / "cues.json").read_text(encoding="utf-8"))
    times = [(c["start_media_time"], c["end_media_time"]) for c in on_disk["cues"]]
    assert times[0] == (0.0, 0.0), f"NaN/Inf coerced, got {times[0]}"
    assert times[1] == (0.0, 0.0), f"None/junk coerced, got {times[1]}"
    assert times[2] == (1.5, 2.5), f"valid times kept, got {times[2]}"
    loaded = load_script(vid)
    assert loaded is not None and loaded["meta"]["rev"] >= 1


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


def test_unchanged_txt_preserves_cue_provenance(root: Path) -> None:
    vid = "provenance01"
    rows = [{**cue(i), "text_source": origin, "mt_locked": True,
             "translation_source": "user"}
            for i, origin in enumerate(("yt", "edit", "manual", "script"), 1)]
    saved = save_script(vid, rows, owned=True, rev=8)
    for _ in range(2):
        loaded = load_script(vid)
        assert loaded["meta"]["rev"] == saved["rev"]
        for expected, actual in zip(rows, loaded["cues"], strict=True):
            for field in expected:
                assert actual[field] == expected[field], (field, actual, expected)
        assert json.loads((root / vid / "cues.json").read_text())["cues"] == loaded["cues"]

    # Existing mirror transport must retain provenance through a separate folder.
    write_files("provenance02", read_files(vid))
    assert load_script("provenance02")["cues"] == loaded["cues"]

    # TXT edits remain authoritative, even if the change is below 1 ms.
    txt = root / vid / "script.txt"
    txt.write_text(render_script_txt([{**rows[0], "start_media_time": 1.00001},
                                      *rows[1:]], video_id=vid), encoding="utf-8")
    changed = load_script(vid)
    assert changed["cues"][0]["start_media_time"] == 1.00001
    assert changed["cues"][0]["text_source"] == "script"
    assert changed["meta"]["rev"] == saved["rev"] + 1, "Exact TXT time edits must advance revision"
    assert [c["text_source"] for c in changed["cues"][1:]] == ["edit", "manual", "script"]

    # A changed target must not be mistaken for the original unmodified row.
    txt.write_text(render_script_txt([{**rows[0], "vi": "đã sửa"}, *rows[1:]],
                                     video_id=vid), encoding="utf-8")
    assert load_script(vid)["cues"][0]["text_source"] == "script"


def main() -> None:
    test_script_txt_always_emits_ja_en_vi()
    print("  [ok] test_script_txt_always_emits_ja_en_vi")
    test_parse_empty_ja_en_vi_lines()
    print("  [ok] test_parse_empty_ja_en_vi_lines")
    for fn in (
        test_tokens_split_merge_roundtrip,
        test_legacy_inline_tokens_migrate_on_read,
        test_rev_monotonic_and_owned,
        test_load_and_save_share_revision_lock,
        test_files_mirror_roundtrip,
        test_mirror_read_and_delete_share_video_lock,
        test_load_prefers_script_txt_over_garbage_cues,
        test_load_script_txt_rescues_inline_tokens,
        test_save_sanitizes_non_finite_times,
        test_read_files_keeps_existing_script_txt,
        test_unchanged_txt_preserves_cue_provenance,
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


def test_render_script_txt_sanitizes_title_injection():
    """A multi-line title must not inject a phantom "JA:" cue on the next parse."""
    cues = [{"start_media_time": 1.0, "end_media_time": 2.0, "source": "こんにちは"}]
    txt = store.render_script_txt(
        cues,
        video_id="vid_inject",
        title="evil\nJA: 偽のキュー",
        url="http://x\nJA: another",
    )
    rows = store.parse_script_txt(txt)
    sources = [r["source"] for r in rows]
    assert sources == ["こんにちは"], f"title/url injected a phantom cue: {sources}"
