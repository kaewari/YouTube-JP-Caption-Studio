"""Compile JSON dictionary files into a single optimized SQLite database (dict.sqlite).

Usage:
    python3 local-bridge/app/scripts/build_dict_sqlite.py
"""

from __future__ import annotations

import json
import logging
import sqlite3
import sys
import time
from pathlib import Path

# Ensure local-bridge root is in sys.path when script is executed directly
_BRIDGE_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_BRIDGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_BRIDGE_ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("build_dict_sqlite")

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "dict"
JMDICT_JSON = DATA_DIR / "jmdict_mini.json"
JAVI_JSON = DATA_DIR / "ja_vi.json"
JMDICT_VI_JSON = DATA_DIR / "jmdict_vi.json"
SQLITE_DB = DATA_DIR / "dict.sqlite"


def build_sqlite() -> None:
    t0 = time.time()
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    tmp_db = SQLITE_DB.with_suffix(".sqlite.tmp")
    if tmp_db.exists():
        tmp_db.unlink()

    conn = sqlite3.connect(tmp_db)
    cur = conn.cursor()

    # Optimization pragmas for initial bulk insertion
    cur.execute("PRAGMA synchronous = OFF;")
    cur.execute("PRAGMA journal_mode = OFF;")

    # Table 1: jmdict (expression -> list of sense dicts)
    cur.execute("""
        CREATE TABLE jmdict (
            expression TEXT PRIMARY KEY,
            payload TEXT NOT NULL
        );
    """)

    # Table 2: javi (expression -> list of VI gloss strings)
    cur.execute("""
        CREATE TABLE javi (
            expression TEXT PRIMARY KEY,
            glosses TEXT NOT NULL
        );
    """)

    # Table 3: jmdict_vi (expression, reading -> list of VI gloss strings)
    cur.execute("""
        CREATE TABLE jmdict_vi (
            expression TEXT NOT NULL,
            reading TEXT NOT NULL,
            glosses TEXT NOT NULL,
            PRIMARY KEY (expression, reading)
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_jmdict_vi_expr ON jmdict_vi (expression);")

    # Table 4: kanji_hanviet (kanji -> Sino-Vietnamese Han-Viet reading)
    cur.execute("""
        CREATE TABLE kanji_hanviet (
            kanji TEXT PRIMARY KEY,
            hanviet TEXT NOT NULL
        );
    """)

    conn.commit()

    # 1. Populate jmdict
    jmdict_path = DATA_DIR / "jmdict_mini.json"
    if jmdict_path.is_file():
        logger.info("Loading %s...", jmdict_path.name)
        with open(jmdict_path, "r", encoding="utf-8") as f:
            raw_jmdict = json.load(f)
        logger.info("Inserting %d JMdict entries into SQLite...", len(raw_jmdict))
        rows = [
            (str(expr), json.dumps(val, ensure_ascii=False))
            for expr, val in raw_jmdict.items()
            if expr and isinstance(val, list)
        ]
        cur.executemany("INSERT OR REPLACE INTO jmdict (expression, payload) VALUES (?, ?)", rows)
        conn.commit()
        del raw_jmdict, rows
        logger.info("JMdict inserted.")
    else:
        logger.warning("%s not found, skipping.", jmdict_path.name)

    # 2. Populate javi
    javi_path = DATA_DIR / "ja_vi.json"
    if javi_path.is_file():
        logger.info("Loading %s...", javi_path.name)
        with open(javi_path, "r", encoding="utf-8") as f:
            raw_javi = json.load(f)
        if isinstance(raw_javi, dict):
            rows = [
                (str(k), json.dumps(v if isinstance(v, list) else [str(v)], ensure_ascii=False))
                for k, v in raw_javi.items()
                if k
            ]
            cur.executemany("INSERT OR REPLACE INTO javi (expression, glosses) VALUES (?, ?)", rows)
            conn.commit()
            del raw_javi, rows
            logger.info("JA-VI inserted.")
    else:
        try:
            from app.services.dictionary import _SEED_JA_VI
            if _SEED_JA_VI:
                rows = [
                    (str(k), json.dumps(v if isinstance(v, list) else [str(v)], ensure_ascii=False))
                    for k, v in _SEED_JA_VI.items()
                    if k
                ]
                cur.executemany("INSERT OR REPLACE INTO javi (expression, glosses) VALUES (?, ?)", rows)
                conn.commit()
                logger.info("JA-VI seeded from _SEED_JA_VI (%d entries).", len(rows))
        except Exception as exc:
            logger.warning("Could not seed _SEED_JA_VI: %s", exc)

    # 3. Populate jmdict_vi
    jmdict_vi_path = DATA_DIR / "jmdict_vi.json"
    if jmdict_vi_path.is_file():
        logger.info("Loading %s...", jmdict_vi_path.name)
        with open(jmdict_vi_path, "r", encoding="utf-8") as f:
            raw_vi = json.load(f)
        if isinstance(raw_vi, dict):
            vi_rows = []
            for expr, val in raw_vi.items():
                if not expr:
                    continue
                if isinstance(val, list):
                    cleaned = [str(x).strip() for x in val if str(x).strip()]
                    if cleaned:
                        vi_rows.append((str(expr), "", json.dumps(cleaned, ensure_ascii=False)))
                elif isinstance(val, dict):
                    for reading, glosses in val.items():
                        if isinstance(glosses, list):
                            cleaned = [str(x).strip() for x in glosses if str(x).strip()]
                            if cleaned:
                                vi_rows.append((str(expr), str(reading or ""), json.dumps(cleaned, ensure_ascii=False)))
            cur.executemany("INSERT OR REPLACE INTO jmdict_vi (expression, reading, glosses) VALUES (?, ?, ?)", vi_rows)
            conn.commit()
            del raw_vi, vi_rows
            logger.info("JMdict-VI inserted.")

    # 4. Populate kanji_hanviet
    try:
        from app.data.hanviet_data import KANJI_HANVIET_TABLE
        if KANJI_HANVIET_TABLE:
            logger.info("Inserting %d Kanji Han-Viet entries into SQLite...", len(KANJI_HANVIET_TABLE))
            hv_rows = [(str(k), str(v)) for k, v in KANJI_HANVIET_TABLE.items() if k and v]
            cur.executemany("INSERT OR REPLACE INTO kanji_hanviet (kanji, hanviet) VALUES (?, ?)", hv_rows)
            conn.commit()
            del hv_rows
            logger.info("Kanji Han-Viet inserted.")
    except Exception as exc:
        logger.warning("Could not populate kanji_hanviet: %s", exc)

    # Set user_version pragma and clean up
    cur.execute("PRAGMA user_version = 4;")
    cur.execute("PRAGMA synchronous = NORMAL;")
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("VACUUM;")
    conn.commit()
    conn.close()

    if SQLITE_DB.exists():
        SQLITE_DB.unlink()
    tmp_db.rename(SQLITE_DB)
    logger.info("Finished building SQLite DB at %s in %.2fs (size: %.2f MB)", SQLITE_DB, time.time() - t0, SQLITE_DB.stat().st_size / (1024 * 1024))


if __name__ == "__main__":
    build_sqlite()
