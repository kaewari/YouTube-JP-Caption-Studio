"""The mazii lookup must not run one SQL statement per kanji.

`_get_mazii_details` used to query the kanji table once per character, so a
four-kanji entry cost four round trips to the same table.
"""

from __future__ import annotations

import sqlite3

from app.services import dictionary


def _fixture_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE mazii (expression TEXT, reading TEXT, pos TEXT, glosses TEXT, examples TEXT)"
    )
    conn.execute("CREATE TABLE mazii_kanji (kanji TEXT, mean TEXT)")
    conn.execute("CREATE TABLE mazii_examples (id TEXT, content TEXT, mean TEXT, trans TEXT)")
    conn.execute(
        "INSERT INTO mazii VALUES ('約束', 'やくそく', '名詞', '[\"lời hứa\"]', '[]')"
    )
    conn.execute("INSERT INTO mazii_kanji VALUES ('約', 'yuế, thoa:1')")
    conn.execute("INSERT INTO mazii_kanji VALUES ('束', 'thuộc')")
    return conn


def _patched(monkeypatch, conn: sqlite3.Connection) -> list[str]:
    statements: list[str] = []
    conn.set_trace_callback(statements.append)
    monkeypatch.setattr(dictionary, "_get_db", lambda: conn)
    monkeypatch.setattr(
        dictionary, "_db_tables", frozenset({"mazii", "mazii_kanji", "mazii_examples"})
    )
    return statements


def test_kanji_meanings_come_from_one_query(monkeypatch):
    conn = _fixture_db()
    statements = _patched(monkeypatch, conn)

    details = dictionary._get_mazii_details("約束")

    assert details is not None, details
    assert details["hanviet"] == "YUẾ THUỘC", details["hanviet"]
    kanji_queries = [s for s in statements if "mazii_kanji" in s]
    assert len(kanji_queries) == 1, f"one query per kanji: {kanji_queries}"


def test_a_missing_kanji_mean_is_skipped(monkeypatch):
    conn = _fixture_db()
    conn.execute("DELETE FROM mazii_kanji WHERE kanji = '束'")
    _patched(monkeypatch, conn)

    details = dictionary._get_mazii_details("約束")

    assert details is not None
    assert details["hanviet"] == "YUẾ", details["hanviet"]
