import json
import sqlite3
import zipfile
from pathlib import Path
import pytest
from app.scripts.build_dict_sqlite import build_sqlite
from app.scripts.import_jmdict_vi import import_yomitan_vi_zip, _vi_glosses_from_raw


def test_dict_sqlite_tables(tmp_path: Path, monkeypatch):
    test_db = tmp_path / "dict.sqlite"
    monkeypatch.setattr("app.scripts.build_dict_sqlite.SQLITE_DB", test_db)
    monkeypatch.setattr("app.scripts.build_dict_sqlite.DATA_DIR", tmp_path)

    build_sqlite()

    assert test_db.exists()
    conn = sqlite3.connect(f"file:{test_db}?mode=ro", uri=True)
    cur = conn.cursor()

    tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "jmdict_vi" in tables
    assert "kanji_hanviet" in tables
    assert "jmdict" in tables
    assert "javi" in tables
    assert "en_vi" not in tables

    # Check user_version
    user_version = cur.execute("PRAGMA user_version;").fetchone()[0]
    assert user_version == 4

    # Check kanji_hanviet has data
    hv_count = cur.execute("SELECT count(*) FROM kanji_hanviet;").fetchone()[0]
    assert hv_count > 1000
    res = cur.execute("SELECT hanviet FROM kanji_hanviet WHERE kanji='約';").fetchone()
    assert res is not None and res[0] == "Ước"

    # Check indices
    indices = {r[1] for r in cur.execute("PRAGMA index_list('jmdict_vi')").fetchall()}
    assert len(indices) >= 1

    conn.close()


def test_dict_sqlite_population(tmp_path: Path, monkeypatch):
    test_db = tmp_path / "dict.sqlite"
    monkeypatch.setattr("app.scripts.build_dict_sqlite.SQLITE_DB", test_db)
    monkeypatch.setattr("app.scripts.build_dict_sqlite.DATA_DIR", tmp_path)

    # Create dummy JSON files
    jmdict_data = {"猫": [{"gloss_en": "cat", "reading": "ねこ"}]}
    javi_data = {"猫": ["con mèo"]}
    jmdict_vi_data = {"猫": {"ねこ": ["con mèo", "mèo"]}}

    (tmp_path / "jmdict_mini.json").write_text(json.dumps(jmdict_data, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "ja_vi.json").write_text(json.dumps(javi_data, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "jmdict_vi.json").write_text(json.dumps(jmdict_vi_data, ensure_ascii=False), encoding="utf-8")

    build_sqlite()

    conn = sqlite3.connect(f"file:{test_db}?mode=ro", uri=True)
    cur = conn.cursor()

    # Verify jmdict
    res = cur.execute("SELECT payload FROM jmdict WHERE expression='猫';").fetchone()
    assert res is not None
    assert "cat" in res[0]

    # Verify javi
    res = cur.execute("SELECT glosses FROM javi WHERE expression='猫';").fetchone()
    assert res is not None
    assert "con mèo" in res[0]

    # Verify jmdict_vi
    res = cur.execute("SELECT glosses FROM jmdict_vi WHERE expression='猫' AND reading='ねこ';").fetchone()
    assert res is not None
    assert "con mèo" in res[0]

    conn.close()


def test_import_yomitan_vi_zip(tmp_path: Path):
    zip_path = tmp_path / "yomitan_vi.zip"
    out_json = tmp_path / "jmdict_vi.json"

    # Create term_bank_1.json inside zip
    term_bank_data = [
        ["約束", "やくそく", "n,vs", "", 0, ["{promise} lời hứa, giao ước", "ước hẹn"], 1, ""],
        ["食べる", "たべる", "v1", "", 0, ["{eat} ăn, xơi"], 2, ""],
    ]

    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("term_bank_1.json", json.dumps(term_bank_data, ensure_ascii=False))

    count = import_yomitan_vi_zip(zip_path, out_json)
    assert count == 2
    assert out_json.exists()

    data = json.loads(out_json.read_text(encoding="utf-8"))
    assert "約束" in data
    assert "やくそく" in data["約束"]
    assert "lời hứa" in data["約束"]["やくそく"] or "giao ước" in data["約束"]["やくそく"]
    assert "食べる" in data
    assert "ăn" in data["食べる"]["たべる"]
