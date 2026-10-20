"""SQLite database for saved items (words & sentence cues) with WAL mode and trigram FTS5."""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("bridge")

# Max rows one sync response may carry (the client pages with next_since).
SYNC_PAGE_LIMIT = 5000

ROOT = Path(__file__).resolve().parent.parent.parent.parent


def get_db_path() -> Path:
    data_dir = ROOT / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "saved_items.db"


def connect_db(db_path: Optional[Path | str] = None) -> sqlite3.Connection:
    """Open a connection to an already-initialised database.

    Safe to call from several threads: sqlite3 connections are bound to their
    creating thread, so every worker thread gets its own.
    """
    path = str(db_path or get_db_path())
    conn = sqlite3.connect(path, timeout=5.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(db_path: Optional[Path | str] = None) -> sqlite3.Connection:
    """Create the schema (once) and return a connection to it."""
    path = str(db_path or get_db_path())
    conn = connect_db(path)

    # WAL mode & high-concurrency pragmas. journal_mode needs an exclusive
    # lock, so it must not run while another thread is opening the same file.
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")

    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS saved_items (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL, -- 'word' | 'cue'
                video_id TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL,
                reading TEXT NOT NULL DEFAULT '',
                translation_vi TEXT NOT NULL DEFAULT '',
                translation_en TEXT NOT NULL DEFAULT '',
                start_time REAL NOT NULL DEFAULT 0.0,
                end_time REAL NOT NULL DEFAULT 0.0,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                is_deleted INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
        """)

        conn.execute("CREATE INDEX IF NOT EXISTS idx_saved_items_type ON saved_items(type);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_saved_items_video ON saved_items(video_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_saved_items_updated_at ON saved_items(updated_at);")

        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS saved_items_fts USING fts5(
                source,
                reading,
                translation_vi,
                content='saved_items',
                content_rowid='rowid',
                tokenize='trigram'
            );
        """)

        # Triggers to keep FTS index synchronized
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS saved_items_ai AFTER INSERT ON saved_items BEGIN
                INSERT INTO saved_items_fts(rowid, source, reading, translation_vi)
                VALUES (new.rowid, new.source, new.reading, new.translation_vi);
            END;
        """)
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS saved_items_ad AFTER DELETE ON saved_items BEGIN
                INSERT INTO saved_items_fts(saved_items_fts, rowid, source, reading, translation_vi)
                VALUES ('delete', old.rowid, old.source, old.reading, old.translation_vi);
            END;
        """)
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS saved_items_au AFTER UPDATE ON saved_items BEGIN
                INSERT INTO saved_items_fts(saved_items_fts, rowid, source, reading, translation_vi)
                VALUES ('delete', old.rowid, old.source, old.reading, old.translation_vi);
                INSERT INTO saved_items_fts(rowid, source, reading, translation_vi)
                VALUES (new.rowid, new.source, new.reading, new.translation_vi);
            END;
        """)

    return conn


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    if "metadata_json" in d and isinstance(d["metadata_json"], str):
        try:
            d["metadata"] = json.loads(d["metadata_json"])
        except Exception:
            d["metadata"] = {}
    return d


def upsert_item(conn: sqlite3.Connection, item: dict[str, Any]) -> dict[str, Any]:
    now = time.time()
    item_id = str(item.get("id") or "").strip()
    if not item_id:
        raise ValueError("Item id is required")

    item_type = str(item.get("type") or "cue").strip().lower()
    video_id = str(item.get("video_id") or "").strip()
    source = str(item.get("source") or item.get("word") or "").strip()
    reading = str(item.get("reading") or "").strip()
    translation_vi = str(item.get("translation_vi") or item.get("vi") or "").strip()
    translation_en = str(item.get("translation_en") or item.get("en") or "").strip()
    start_time = float(item.get("start_time") or item.get("start_media_time") or 0.0)
    end_time = float(item.get("end_time") or item.get("end_media_time") or 0.0)
    meta = item.get("metadata") or {}
    metadata_json = json.dumps(meta, ensure_ascii=False) if isinstance(meta, dict) else "{}"
    is_deleted = 1 if item.get("is_deleted") else 0
    created_at = float(item.get("created_at") or now)
    updated_at = float(item.get("updated_at") or now)

    with conn:
        conn.execute("""
            INSERT INTO saved_items (
                id, type, video_id, source, reading, translation_vi, translation_en,
                start_time, end_time, metadata_json, is_deleted, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                type = excluded.type,
                video_id = CASE WHEN excluded.video_id != '' THEN excluded.video_id ELSE saved_items.video_id END,
                source = excluded.source,
                reading = excluded.reading,
                translation_vi = excluded.translation_vi,
                translation_en = excluded.translation_en,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                metadata_json = excluded.metadata_json,
                is_deleted = excluded.is_deleted,
                updated_at = excluded.updated_at
            WHERE excluded.updated_at >= saved_items.updated_at;
        """, (
            item_id, item_type, video_id, source, reading, translation_vi, translation_en,
            start_time, end_time, metadata_json, is_deleted, created_at, updated_at
        ))

    cur = conn.execute("SELECT * FROM saved_items WHERE id = ?", (item_id,))
    row = cur.fetchone()
    return row_to_dict(row) if row else item


def upsert_batch(conn: sqlite3.Connection, items: list[dict[str, Any]]) -> int:
    applied = 0
    for item in items:
        if upsert_item(conn, item):
            applied += 1
    return applied


def get_item(conn: sqlite3.Connection, item_id: str) -> Optional[dict[str, Any]]:
    cur = conn.execute("SELECT * FROM saved_items WHERE id = ?", (item_id,))
    row = cur.fetchone()
    return row_to_dict(row) if row else None


def list_items(
    conn: sqlite3.Connection,
    item_type: Optional[str] = None,
    video_id: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = 500,
) -> list[dict[str, Any]]:
    clauses = []
    params: list[Any] = []

    if not include_deleted:
        clauses.append("is_deleted = 0")
    if item_type:
        clauses.append("type = ?")
        params.append(item_type)
    if video_id:
        clauses.append("video_id = ?")
        params.append(video_id)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"SELECT * FROM saved_items {where} ORDER BY updated_at DESC LIMIT ?"
    params.append(limit)

    cur = conn.execute(query, tuple(params))
    return [row_to_dict(r) for r in cur.fetchall()]


def delete_item(conn: sqlite3.Connection, item_id: str, hard: bool = False) -> bool:
    if hard:
        with conn:
            cur = conn.execute("DELETE FROM saved_items WHERE id = ?", (item_id,))
            return cur.rowcount > 0
    else:
        now = time.time()
        with conn:
            cur = conn.execute(
                "UPDATE saved_items SET is_deleted = 1, updated_at = ? WHERE id = ?",
                (now, item_id)
            )
            return cur.rowcount > 0


def search_items(
    conn: sqlite3.Connection,
    query: str,
    item_type: Optional[str] = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    q = query.strip()
    if not q:
        return list_items(conn, item_type=item_type, limit=limit)

    type_clause = "AND s.type = ?" if item_type else ""
    params: list[Any] = []

    if len(q) >= 3:
        # FTS5 trigram search
        sql = f"""
            SELECT s.* FROM saved_items s
            JOIN saved_items_fts f ON s.rowid = f.rowid
            WHERE saved_items_fts MATCH ? AND s.is_deleted = 0 {type_clause}
            ORDER BY s.updated_at DESC LIMIT ?
        """
        params.append(f'"{q}"')
        if item_type:
            params.append(item_type)
        params.append(limit)
    else:
        # Short query fallback with LIKE
        sql = f"""
            SELECT s.* FROM saved_items s
            WHERE s.is_deleted = 0 {type_clause}
            AND (s.source LIKE ? OR s.reading LIKE ? OR s.translation_vi LIKE ?)
            ORDER BY s.updated_at DESC LIMIT ?
        """
        pattern = f"%{q}%"
        if item_type:
            params.append(item_type)
        params.extend([pattern, pattern, pattern, limit])

    try:
        cur = conn.execute(sql, tuple(params))
        return [row_to_dict(r) for r in cur.fetchall()]
    except sqlite3.OperationalError:
        # Fallback if FTS query syntax error
        fallback_sql = f"""
            SELECT s.* FROM saved_items s
            WHERE s.is_deleted = 0 {type_clause}
            AND (s.source LIKE ? OR s.reading LIKE ? OR s.translation_vi LIKE ?)
            ORDER BY s.updated_at DESC LIMIT ?
        """
        fb_params: list[Any] = []
        if item_type:
            fb_params.append(item_type)
        fb_pattern = f"%{q}%"
        fb_params.extend([fb_pattern, fb_pattern, fb_pattern, limit])
        cur = conn.execute(fallback_sql, tuple(fb_params))
        return [row_to_dict(r) for r in cur.fetchall()]


def sync_items(
    conn: sqlite3.Connection,
    client_items: list[dict[str, Any]],
    since_timestamp: float = 0.0,
) -> dict[str, Any]:
    """Two-way sync: upsert client items using Last-Write-Wins, and return all updates since given timestamp."""
    applied_count = 0
    for item in client_items:
        if not item.get("id"):
            continue
        upsert_item(conn, item)
        applied_count += 1

    # Fetch updates from server since timestamp (including deleted items as tombstones).
    # One row more than the limit tells us whether more rows are waiting.
    cur = conn.execute(
        "SELECT * FROM saved_items WHERE updated_at > ? ORDER BY updated_at ASC LIMIT ?",
        (since_timestamp, SYNC_PAGE_LIMIT + 1),
    )
    rows = cur.fetchall()
    has_more = len(rows) > SYNC_PAGE_LIMIT
    server_updates = [row_to_dict(r) for r in rows[:SYNC_PAGE_LIMIT]]
    now = time.time()
    # A client paging on `since` must continue from the last row it received,
    # not from "now" - otherwise the rows behind the page are never delivered.
    next_since = server_updates[-1]["updated_at"] if server_updates else since_timestamp

    return {
        "applied": applied_count,
        "server_items": server_updates,
        "sync_timestamp": now,
        "has_more": has_more,
        "next_since": next_since,
    }
