"""FastAPI routes for saved items database (words & sentence cues)."""

from __future__ import annotations

import logging
import threading
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.db.saved_items_db import (
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

# One SQLite connection per worker thread (sqlite3 connections are not
# thread-safe, and FastAPI runs sync endpoints in a thread pool).
_local = threading.local()


def db_conn():
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = init_db()
        _local.conn = conn
    return conn


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


class SyncResponse(BaseModel):
    applied: int
    server_items: list[dict[str, Any]]
    sync_timestamp: float


MAX_SYNC_ITEMS = 5000


@router.post("/saved/sync", response_model=SyncResponse)
def api_sync_saved(body: SyncRequest) -> SyncResponse:
    if len(body.items) > MAX_SYNC_ITEMS:
        raise HTTPException(
            status_code=413,
            detail=f"Too many items in sync payload (max {MAX_SYNC_ITEMS})",
        )
    try:
        conn = db_conn()
        res = sync_items(conn, body.items, since_timestamp=body.since)
        return SyncResponse(**res)
    except Exception as exc:
        logger.exception("api_sync_saved error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/saved/items")
def api_list_saved(
    type: Optional[str] = Query(None, description="Item type: 'word' or 'cue'"),
    video_id: Optional[str] = Query(None, description="Filter by video ID"),
    include_deleted: bool = Query(False, description="Include soft-deleted items"),
    limit: int = Query(500, ge=1, le=2000),
) -> list[dict[str, Any]]:
    try:
        conn = db_conn()
        return list_items(conn, item_type=type, video_id=video_id, include_deleted=include_deleted, limit=limit)
    except Exception as exc:
        logger.exception("api_list_saved error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/saved/items/{item_id}")
def api_get_saved(item_id: str) -> dict[str, Any]:
    conn = db_conn()
    item = get_item(conn, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("/saved/items")
def api_upsert_saved(body: SavedItemPayload) -> dict[str, Any]:
    try:
        conn = db_conn()
        return upsert_item(conn, body.model_dump())
    except Exception as exc:
        logger.exception("api_upsert_saved error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/saved/items/{item_id}")
def api_delete_saved(item_id: str, hard: bool = Query(False)) -> dict[str, Any]:
    try:
        conn = db_conn()
        ok = delete_item(conn, item_id, hard=hard)
        if not ok:
            raise HTTPException(status_code=404, detail="Item not found")
        return {"ok": True, "id": item_id, "hard": hard}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("api_delete_saved error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/saved/search")
def api_search_saved(
    q: str = Query(..., min_length=1),
    type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict[str, Any]]:
    try:
        conn = db_conn()
        return search_items(conn, query=q, item_type=type, limit=limit)
    except Exception as exc:
        logger.exception("api_search_saved error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
