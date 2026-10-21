"""Service-level robustness: freq loading, tokenize fallback, dictionary queries.

Regression tests for the P1 findings of review/full-codebase-improvement-audit-2026-10-18.md
(services section): `_loaded` set before the files were read, a whole-sentence token
fallback when Sudachi is missing, an unguarded tokenizer load, a per-character SELECT
loop and a warning per query against a half-built dictionary.
"""

from __future__ import annotations

import logging
import sqlite3
import sys
import threading
import time
import types

import pytest

from app.services import dictionary as dictionary_service
from app.services import tokenize_ja
from app.services import vocab_freq


# ---------------------------------------------------------------------------
# vocab_freq
# ---------------------------------------------------------------------------


def test_broken_freq_file_does_not_mark_the_process_loaded(tmp_path, monkeypatch):
    broken = tmp_path / "freq_ja.json"
    broken.write_text("{not json", encoding="utf-8")
    monkeypatch.setattr(vocab_freq, "FREQ_JSON", broken)
    monkeypatch.setattr(vocab_freq, "JLPT_JSON", tmp_path / "missing.json")
    monkeypatch.setattr(vocab_freq, "_loaded", False)
    monkeypatch.setattr(vocab_freq, "_load_failed", False, raising=False)

    assert vocab_freq.load_freq() is False
    assert vocab_freq.is_loaded() is False, "a failed read left the process 'loaded'"


def test_missing_freq_file_does_not_mark_the_process_loaded(tmp_path, monkeypatch):
    monkeypatch.setattr(vocab_freq, "FREQ_JSON", tmp_path / "missing.json")
    monkeypatch.setattr(vocab_freq, "JLPT_JSON", tmp_path / "missing.json")
    monkeypatch.setattr(vocab_freq, "_loaded", False)
    monkeypatch.setattr(vocab_freq, "_load_failed", False, raising=False)

    assert vocab_freq.load_freq() is False
    assert vocab_freq.is_loaded() is False


def test_load_freq_retries_after_the_file_is_repaired(tmp_path, monkeypatch):
    freq_file = tmp_path / "freq_ja.json"
    freq_file.write_text("{broken", encoding="utf-8")
    jlpt_file = tmp_path / "jlpt_vocab.json"
    jlpt_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(vocab_freq, "FREQ_JSON", freq_file)
    monkeypatch.setattr(vocab_freq, "JLPT_JSON", jlpt_file)
    monkeypatch.setattr(vocab_freq, "_loaded", False)
    monkeypatch.setattr(vocab_freq, "_load_failed", False, raising=False)

    assert vocab_freq.load_freq() is False

    freq_file.write_text('{"猫": 12}', encoding="utf-8")
    assert vocab_freq.load_freq(force=True) is True
    assert vocab_freq.is_loaded() is True
    assert vocab_freq.rank_of("猫") == 12


# ---------------------------------------------------------------------------
# tokenize_ja
# ---------------------------------------------------------------------------


def test_tokenize_emits_no_token_when_sudachi_is_unavailable(monkeypatch):
    """A single token covering the whole sentence breaks the anti-clumping
    invariant (AGENTS.md §2) and fakes a full-string lemma."""
    monkeypatch.setattr(tokenize_ja, "_loaded", False)
    monkeypatch.setattr(tokenize_ja, "_tokenizer", None)
    monkeypatch.setattr(tokenize_ja, "_load_failed", True, raising=False)

    tokens = tokenize_ja.tokenize("これはテストの文です")
    assert tokens == [], tokens


def test_concurrent_load_tokenizer_builds_one_dictionary(monkeypatch):
    state = {"builds": 0}

    class FakeDictionary:
        def __init__(self):
            state["builds"] += 1
            time.sleep(0.05)  # widen the race window

        def create(self, mode=None):
            return object()

    fake = types.ModuleType("sudachipy")
    fake.Dictionary = FakeDictionary  # type: ignore[attr-defined]
    fake.SplitMode = types.SimpleNamespace(B="B")  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "sudachipy", fake)
    monkeypatch.setattr(tokenize_ja, "_loaded", False)
    monkeypatch.setattr(tokenize_ja, "_tokenizer", None)
    monkeypatch.setattr(tokenize_ja, "_load_failed", False, raising=False)

    threads = [threading.Thread(target=tokenize_ja.load_tokenizer) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert state["builds"] == 1, f"the tokenizer was built {state['builds']} times"


# ---------------------------------------------------------------------------
# dictionary
# ---------------------------------------------------------------------------


def test_query_hanviet_uses_one_query_for_the_whole_word(monkeypatch):
    executed: list[str] = []

    class FakeCursor:
        def execute(self, sql, params=()):
            executed.append(sql)

        def fetchall(self):
            return []

        def fetchone(self):
            return None

    class FakeConn:
        def cursor(self):
            return FakeCursor()

    monkeypatch.setattr(dictionary_service, "get_hanviet_reading", lambda text: "")
    monkeypatch.setattr(dictionary_service, "_get_db", lambda: FakeConn())
    monkeypatch.setattr(
        dictionary_service, "_db_tables", frozenset({"kanji_hanviet"}), raising=False
    )

    dictionary_service._query_hanviet("日本語")
    assert len(executed) == 1, f"{len(executed)} queries for 3 characters"


def test_lookup_on_a_half_built_dictionary_does_not_log_warnings(tmp_path, monkeypatch, caplog):
    db = tmp_path / "dict.sqlite"
    conn = sqlite3.connect(str(db))
    conn.execute("CREATE TABLE jmdict (expression TEXT, payload TEXT)")
    conn.commit()
    conn.close()

    monkeypatch.setattr(dictionary_service, "SQLITE_DB", db)
    dictionary_service.close_dictionary()
    try:
        caplog.set_level(logging.WARNING)
        # A key that is not in the curated seed, so every table is consulted.
        key = "𠮷野家"
        assert dictionary_service._query_jmdict(key) == []
        assert dictionary_service._query_mazii(key) == []
        assert dictionary_service._query_javi(key) == []
        assert dictionary_service._query_jmdict_vi(key) == {}
        assert dictionary_service._has_key(key) is False
        warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
        assert not warnings, [r.getMessage() for r in warnings]
    finally:
        dictionary_service.close_dictionary()
