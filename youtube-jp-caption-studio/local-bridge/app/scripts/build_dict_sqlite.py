"""Compile JSON dictionary files into a single optimized SQLite database (dict.sqlite).

Usage:
    python3 local-bridge/scripts/build_dict_sqlite.py
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("build_dict_sqlite")

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "dict"
JMDICT_JSON = DATA_DIR / "jmdict_mini.json"
JAVI_JSON = DATA_DIR / "ja_vi.json"
JMDICT_VI_JSON = DATA_DIR / "jmdict_vi.json"
EN_VI_JSON = DATA_DIR / "en_vi.json"
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

    # Table 4: en_vi (lemma -> list of VI gloss strings)
    cur.execute("""
        CREATE TABLE en_vi (
            lemma TEXT PRIMARY KEY,
            glosses TEXT NOT NULL
        );
    """)

    conn.commit()

    # 1. Populate jmdict
    if JMDICT_JSON.is_file():
        logger.info("Loading %s...", JMDICT_JSON.name)
        with open(JMDICT_JSON, "r", encoding="utf-8") as f:
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
        logger.warning("%s not found, skipping.", JMDICT_JSON.name)

    # 2. Populate javi
    if JAVI_JSON.is_file():
        logger.info("Loading %s...", JAVI_JSON.name)
        with open(JAVI_JSON, "r", encoding="utf-8") as f:
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

    # 3. Populate jmdict_vi
    if JMDICT_VI_JSON.is_file():
        logger.info("Loading %s...", JMDICT_VI_JSON.name)
        with open(JMDICT_VI_JSON, "r", encoding="utf-8") as f:
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

    # 4. Populate en_vi
    if EN_VI_JSON.is_file():
        logger.info("Loading %s...", EN_VI_JSON.name)
        with open(EN_VI_JSON, "r", encoding="utf-8") as f:
            raw_en = json.load(f)
        if isinstance(raw_en, dict):
            en_rows = [
                (str(k).lower(), json.dumps([str(x) for x in (v if isinstance(v, list) else [v]) if str(x).strip()], ensure_ascii=False))
                for k, v in raw_en.items()
                if k
            ]
            cur.executemany("INSERT OR REPLACE INTO en_vi (lemma, glosses) VALUES (?, ?)", en_rows)
            conn.commit()
            del raw_en, en_rows
            logger.info("EN-VI inserted.")

    # Reset pragmas and vacuum
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
