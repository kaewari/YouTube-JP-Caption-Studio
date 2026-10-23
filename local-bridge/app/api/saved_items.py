"""FastAPI routes for saved items database (words & sentence cues)."""

from __future__ import annotations

import logging
import threading
from contextlib import contextmanager
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.utils.logging_utils import append_errors_log
from app.db.saved_items_db import (
    connect_db,
    delete_item,
    get_item,
    init_db,
    list_items,
    search_items,
    sync_items,
    upsert_item,
)

logger = logging.getLogger("bridge")
router = APIRouter()



def _failed(where: str, exc: Exception) -> HTTPException:
    """Log one line for errors.log (AGENTS.md §6) and answer generically.

    The raw exception text can carry SQL and file paths, so it stays in the
    traceback: the log line records where it failed and the exception type.
    """
    logger.exception(f"{where} error")
    append_errors_log("ERROR", f"{where} error: {type(exc).__name__}")
    return HTTPException(status_code=500, detail="saved items request failed")

# The schema is created once per process: journal_mode=WAL needs an exclusive
# lock, so concurrent first requests must not run it at the same time.
_schema_lock = threading.Lock()
_schema_ready = False


def _ensure_schema() -> None:
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        init_db().close()
        _schema_ready = True


def _has_table(conn) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='saved_items'"
    ).fetchone()
    return row is not None


@contextmanager
def db_conn():
    """A connection for one request.

    Every request gets its own connection: a sqlite3 connection belongs to the
    thread that opened it, and a handle to a database file that was replaced
    (a restore, a wipe) keeps a lock on the old file and blocks every write to
    the new one. Opening per request makes both problems impossible.

    ponytail: a request that is still writing when the file is replaced keeps
    the old lock until it finishes; upgrade path = one process-wide connection
    guarded by a lock, if a restore ever happens mid-request.
    """
    _ensure_schema()
    conn = connect_db()
    try:
        if not _has_table(conn):
            # The database file was replaced by a file without the schema.
            conn.close()
            with _schema_lock:
                init_db().close()
            conn = connect_db()
        yield conn
    finally:
        try:
            conn.close()
        except Exception:
            pass



class SavedItemPayload(BaseModel):
    id: str
    type: str = "cue"  # "word" | "cue"
    video_id: str = ""
    source: str = ""
    reading: str = ""
    translation_vi: str = ""
    translation_en: str = ""
    start_time: float = 0.0
    end_time: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)
    is_deleted: bool = False
    created_at: Optional[float] = None
    updated_at: Optional[float] = None


class SyncRequest(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
    since: float = 0.0
    # Second half of the keyset cursor: the rowid of the last row of the
    # previous page. Without it rows sharing a timestamp would be skipped.
    since_rowid: int = 0


class SyncResponse(BaseModel):
    applied: int
    server_items: list[dict[str, Any]]
    sync_timestamp: float
    # True when more rows are waiting; the client continues with
    # (next_since, next_rowid).
    has_more: bool = False
    next_since: float = 0.0
    next_rowid: int = 0


# Max items one sync request may carry (the client's payload).
MAX_SYNC_ITEMS = 5000


@router.post("/saved/sync", response_model=SyncResponse)
def api_sync_saved(body: SyncRequest) -> SyncResponse:
    """Two-way sync.

    Cursor contract: the response carries at most 5000 rows, ordered by
    (updated_at, rowid). A client that receives `has_more: true` must send the
    returned `next_since` / `next_rowid` back as `since` / `since_rowid` to get
    the next page - `sync_timestamp` is the server clock, not a cursor.
    The request payload is capped at 5000 items (HTTP 413 above that).
    """
    if len(body.items) > MAX_SYNC_ITEMS:
        raise HTTPException(
            status_code=413,
            detail=f"Too many items in sync payload (max {MAX_SYNC_ITEMS})",
        )
    try:
        with db_conn() as conn:
            res = sync_items(
                conn,
                body.items,
                since_timestamp=body.since,
                since_rowid=body.since_rowid,
            )
        return SyncResponse(**res)
    except Exception as exc:
        raise _failed("api_sync_saved", exc) from exc


@router.get("/saved/items")
def api_list_saved(
    type: Optional[str] = Query(None, description="Item type: 'word' or 'cue'"),
    video_id: Optional[str] = Query(None, description="Filter by video ID"),
    include_deleted: bool = Query(False, description="Include soft-deleted items"),
    limit: int = Query(500, ge=1, le=2000),
) -> list[dict[str, Any]]:
    try:
        with db_conn() as conn:
            return list_items(conn, item_type=type, video_id=video_id, include_deleted=include_deleted, limit=limit)
    except Exception as exc:
        raise _failed("api_list_saved", exc) from exc


@router.get("/saved/items/{item_id}")
def api_get_saved(item_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        item = get_item(conn, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("/saved/items")
def api_upsert_saved(body: SavedItemPayload) -> dict[str, Any]:
    try:
        with db_conn() as conn:
            return upsert_item(conn, body.model_dump())
    except Exception as exc:
        raise _failed("api_upsert_saved", exc) from exc


@router.delete("/saved/items/{item_id}")
def api_delete_saved(item_id: str, hard: bool = Query(False)) -> dict[str, Any]:
    try:
        with db_conn() as conn:
            ok = delete_item(conn, item_id, hard=hard)
        if not ok:
            raise HTTPException(status_code=404, detail="Item not found")
        return {"ok": True, "id": item_id, "hard": hard}
    except HTTPException:
        raise
    except Exception as exc:
        raise _failed("api_delete_saved", exc) from exc


@router.get("/saved/search")
def api_search_saved(
    q: str = Query(..., min_length=1),
    type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict[str, Any]]:
    try:
        with db_conn() as conn:
            return search_items(conn, query=q, item_type=type, limit=limit)
    except Exception as exc:
        raise _failed("api_search_saved", exc) from exc
