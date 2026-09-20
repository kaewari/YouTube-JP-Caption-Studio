"""Import full Mazii offline SQLite database (javn2.db) into data/dict/dict.sqlite.

Features:
- Imports all 243,209+ vocabulary entries into the `mazii` table.
- Groups/merges multiple readings for the same expression.
- Cleans and deduplicates Vietnamese glosses and POS tags.
- Also imports `example` (116k+ sentences) -> `mazii_examples` and `kanji` (12k+) -> `mazii_kanji`.
- Uses fast SQLite batch transactions (finishes in seconds).
"""

import json
import logging
import sqlite3
import sys
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("mazii_importer")

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_DB = Path("/tmp/javn2.db")
if not SRC_DB.exists():
    SRC_DB = REPO_ROOT / "data" / "dict" / "mazii_raw.db"

DEST_DB = REPO_ROOT / "data" / "dict" / "dict.sqlite"


def parse_means(mean_json_str: str | None) -> tuple[list[str], list[str], list[str]]:
    """Parse Mazii's mean JSON string into (glosses, pos_list, example_ids)."""
    if not mean_json_str:
        return [], [], []
    try:
        data = json.loads(mean_json_str)
    except Exception:
        return [], [], []

    if not isinstance(data, list):
        return [], [], []

    glosses: list[str] = []
    poses: list[str] = []
    example_ids: list[str] = []

    for item in data:
        if not isinstance(item, dict):
            continue
        kind = item.get("kind")
        if kind and isinstance(kind, str):
            for k in kind.split(","):
                k_clean = k.strip()
                if k_clean and k_clean not in poses:
                    poses.append(k_clean)

        raw_mean = item.get("mean")
        if raw_mean and isinstance(raw_mean, str):
            for part in raw_mean.split(";"):
                cleaned = part.strip().strip(".").strip()
                if cleaned and cleaned not in glosses:
                    glosses.append(cleaned)

        exs = item.get("examples")
        if exs and isinstance(exs, list):
            for ex in exs:
                if str(ex) not in example_ids:
                    example_ids.append(str(ex))

    return glosses, poses, example_ids


def import_mazii():
    if not SRC_DB.exists():
        logger.error("Source Mazii database not found at %s", SRC_DB)
        sys.exit(1)

    logger.info("Source Mazii DB: %s (%.2f MB)", SRC_DB, SRC_DB.stat().st_size / (1024 * 1024))
    logger.info("Destination SQLite DB: %s", DEST_DB)

    src_conn = sqlite3.connect(SRC_DB)
    src_cur = src_conn.cursor()

    dest_conn = sqlite3.connect(DEST_DB)
    dest_cur = dest_conn.cursor()

    # Fast SQLite PRAGMAs
    dest_cur.execute("PRAGMA journal_mode = WAL")
    dest_cur.execute("PRAGMA synchronous = NORMAL")

    # 1. Prepare table
    dest_cur.execute("""
        CREATE TABLE IF NOT EXISTS mazii (
            expression TEXT NOT NULL,
            reading TEXT NOT NULL DEFAULT '',
            pos TEXT NOT NULL DEFAULT '',
            glosses TEXT NOT NULL DEFAULT '[]',
            examples TEXT NOT NULL DEFAULT '[]',
            PRIMARY KEY (expression)
        )
    """)
    dest_cur.execute("CREATE INDEX IF NOT EXISTS idx_mazii_reading ON mazii(reading)")

    # 2. Extract and merge entries from src `javi` table
    t0 = time.time()
    logger.info("Reading entries from source `javi` table...")
    src_cur.execute("SELECT word, phonetic, mean FROM javi")

    merged: dict[str, dict] = {}
    row_count = 0

    for word, phonetic, mean_raw in src_cur:
        row_count += 1
        word = (word or "").strip()
        if not word:
            continue
        reading = (phonetic or "").strip()
        glosses, poses, example_ids = parse_means(mean_raw)

        if word not in merged:
            merged[word] = {
                "readings": [reading] if reading else [],
                "pos": poses,
                "glosses": glosses,
                "examples": example_ids,
            }
        else:
            entry = merged[word]
            if reading and reading not in entry["readings"]:
                entry["readings"].append(reading)
            for p in poses:
                if p not in entry["pos"]:
                    entry["pos"].append(p)
            for g in glosses:
                if g not in entry["glosses"]:
                    entry["glosses"].append(g)
            for ex in example_ids:
                if ex not in entry["examples"]:
                    entry["examples"].append(ex)

    logger.info("Read %d rows from source, consolidated into %d unique expressions (%.2fs)",
                row_count, len(merged), time.time() - t0)

    # 3. Batch insert into dest_conn
    t1 = time.time()
    logger.info("Writing entries into destination `mazii` table...")
    batch = []
    batch_size = 10000

    for word, data in merged.items():
        reading_str = ", ".join(data["readings"])
        pos_str = ", ".join(data["pos"])
        glosses_json = json.dumps(data["glosses"], ensure_ascii=False)
        examples_json = json.dumps(data["examples"], ensure_ascii=False)
        batch.append((word, reading_str, pos_str, glosses_json, examples_json))

        if len(batch) >= batch_size:
            dest_cur.executemany("""
                INSERT OR REPLACE INTO mazii (expression, reading, pos, glosses, examples)
                VALUES (?, ?, ?, ?, ?)
            """, batch)
            dest_conn.commit()
            batch = []

    if batch:
        dest_cur.executemany("""
            INSERT OR REPLACE INTO mazii (expression, reading, pos, glosses, examples)
            VALUES (?, ?, ?, ?, ?)
        """, batch)
        dest_conn.commit()

    logger.info("Inserted %d entries into `mazii` table in %.2fs", len(merged), time.time() - t1)

    # 4. Import example table if available
    try:
        src_cur.execute("SELECT count(*) FROM example")
        ex_count = src_cur.fetchone()[0]
        logger.info("Source has %d examples. Importing into `mazii_examples`...", ex_count)
        dest_cur.execute("""
            CREATE TABLE IF NOT EXISTS mazii_examples (
                id INTEGER PRIMARY KEY,
                content TEXT NOT NULL,
                mean TEXT NOT NULL DEFAULT '',
                trans TEXT NOT NULL DEFAULT ''
            )
        """)
        dest_cur.execute("CREATE INDEX IF NOT EXISTS idx_mazii_ex_content ON mazii_examples(content)")
        src_cur.execute("SELECT id, content, mean, trans FROM example WHERE content IS NOT NULL AND trim(content) != ''")
        ex_batch = []
        for r in src_cur:
            ex_batch.append(r)
            if len(ex_batch) >= batch_size:
                dest_cur.executemany("""
                    INSERT OR REPLACE INTO mazii_examples (id, content, mean, trans)
                    VALUES (?, ?, ?, ?)
                """, ex_batch)
                dest_conn.commit()
                ex_batch = []
        if ex_batch:
            dest_cur.executemany("""
                INSERT OR REPLACE INTO mazii_examples (id, content, mean, trans)
                VALUES (?, ?, ?, ?)
            """, ex_batch)
            dest_conn.commit()
        logger.info("Imported %d examples into `mazii_examples`", ex_count)
    except Exception as e:
        logger.warning("Could not import examples: %s", e)

    # 5. Import kanji table if available
    try:
        src_cur.execute("SELECT count(*) FROM kanji")
        kanji_count = src_cur.fetchone()[0]
        logger.info("Source has %d kanji. Importing into `mazii_kanji`...", kanji_count)
        dest_cur.execute("""
            CREATE TABLE IF NOT EXISTS mazii_kanji (
                id INTEGER PRIMARY KEY,
                kanji TEXT NOT NULL UNIQUE,
                mean TEXT,
                level INTEGER,
                on_reading TEXT,
                kun_reading TEXT,
                detail TEXT,
                stroke_count INTEGER
            )
        """)
        dest_cur.execute("CREATE INDEX IF NOT EXISTS idx_mazii_kanji_char ON mazii_kanji(kanji)")
        src_cur.execute("SELECT id, kanji, mean, level, \"on\", kun, detail, stroke_count FROM kanji")
        k_batch = []
        for r in src_cur:
            k_batch.append(r)
            if len(k_batch) >= batch_size:
                dest_cur.executemany("""
                    INSERT OR REPLACE INTO mazii_kanji (id, kanji, mean, level, on_reading, kun_reading, detail, stroke_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, k_batch)
                dest_conn.commit()
                k_batch = []
        if k_batch:
            dest_cur.executemany("""
                INSERT OR REPLACE INTO mazii_kanji (id, kanji, mean, level, on_reading, kun_reading, detail, stroke_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, k_batch)
            dest_conn.commit()
        logger.info("Imported %d kanji into `mazii_kanji`", kanji_count)
    except Exception as e:
        logger.warning("Could not import kanji: %s", e)

    # 6. Verify final count
    dest_cur.execute("SELECT count(*) FROM mazii")
    final_count = dest_cur.fetchone()[0]
    logger.info("FINAL VERIFICATION: `mazii` table now contains %d words! (Total time: %.2fs)",
                final_count, time.time() - t0)

    src_conn.close()
    dest_conn.close()


if __name__ == "__main__":
    import_mazii()
