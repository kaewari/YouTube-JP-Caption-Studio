"""Script store durability: fsync before rename, bounded lock table, no rewrite on GET.

Regression tests for the P1 findings of review/full-codebase-improvement-audit-2026-10-18.md
(services section): no fsync before os.replace, a per-video lock table that grew forever,
and cues.json rewritten on every GET even when nothing changed.
"""

from __future__ import annotations

import os

from app.services import script_store

CUE = {
    "id": "c1",
    "start_media_time": 0.0,
    "end_media_time": 1.5,
    "source": "こんにちは",
    "en": "hello",
    "vi": "xin chào",
}


def _record_fs_calls(monkeypatch) -> list[str]:
    """Record the order of fsync/replace so the durability contract is visible."""
    order: list[str] = []
    real_fsync = os.fsync
    real_replace = os.replace

    def spy_fsync(fd):
        order.append("fsync")
        return real_fsync(fd)

    def spy_replace(src, dst):
        order.append("replace")
        return real_replace(src, dst)

    monkeypatch.setattr(os, "fsync", spy_fsync)
    monkeypatch.setattr(os, "replace", spy_replace)
    return order


def test_atomic_write_fsyncs_before_the_rename(tmp_path, monkeypatch):
    order = _record_fs_calls(monkeypatch)
    script_store._atomic_write_text(tmp_path / "cues.json", "{}")
    assert "replace" in order
    assert "fsync" in order, "the temp file was never flushed to disk"
    assert order.index("fsync") < order.index("replace")


def test_save_script_fsyncs_before_the_rename(root, monkeypatch):
    order = _record_fs_calls(monkeypatch)
    script_store.save_script("abcdefgh", [dict(CUE)])
    assert order.count("replace") >= 4, "the four script files were not renamed"
    assert order.count("fsync") >= 4, "the temp files were not flushed to disk"
    # Every rename must be preceded by a flush of that file.
    first_replace = order.index("replace")
    assert order.index("fsync") < first_replace


def test_video_lock_table_stays_bounded():
    """One lock per video id grew the table forever (one live Lock per id)."""
    before = len(script_store._video_locks)
    for i in range(500):
        script_store._video_lock(f"vid{i:06d}")
    assert len(script_store._video_locks) == before


def test_load_script_does_not_rewrite_unchanged_cues(root):
    script_store.save_script("abcdefgh", [dict(CUE)])
    cues_path = root / "abcdefgh" / "cues.json"
    assert cues_path.is_file()
    before = cues_path.read_bytes()

    # Age the file so a rewrite is unmistakable.
    marker = 1_600_000_000
    os.utime(cues_path, (marker, marker))

    data = script_store.load_script("abcdefgh")
    assert data is not None
    assert data["cue_count"] == 1
    assert cues_path.read_bytes() == before
    assert os.stat(cues_path).st_mtime_ns == marker * 1_000_000_000, (
        "cues.json was rewritten although the content did not change"
    )


def test_load_script_rewrites_cues_when_the_script_changed(root):
    script_store.save_script("abcdefgh", [dict(CUE)])
    cues_path = root / "abcdefgh" / "cues.json"
    marker = 1_600_000_000
    os.utime(cues_path, (marker, marker))

    # Change the canonical script.txt: cues.json must follow.
    txt_path = root / "abcdefgh" / "script.txt"
    txt = txt_path.read_text(encoding="utf-8").replace("こんにちは", "こんばんは")
    txt_path.write_text(txt, encoding="utf-8")

    data = script_store.load_script("abcdefgh")
    assert data is not None
    assert data["cues"][0]["source"] == "こんばんは"
    assert os.stat(cues_path).st_mtime_ns != marker * 1_000_000_000
