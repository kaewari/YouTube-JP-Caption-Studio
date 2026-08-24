"""Extension state mirroring and backup/snapshot endpoints."""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from app.schemas.models import ExtensionStateRequest, ExtensionStateResponse
from app.services.snapshot import apply_snapshot, encode_snapshot
from app.utils.logging_utils import append_errors_log

logger = logging.getLogger("bridge")
router = APIRouter()

_EXT_STATE_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "config" / "extension_state.json"
_ext_state_lock = threading.Lock()
_ext_state: dict[str, Any] = {
    "userVocab": {},
    "hardsubSettings": None,
    "updatedAt": 0.0,
    "source": "",
}


def load_ext_state_disk() -> None:
    global _ext_state
    try:
        if _EXT_STATE_PATH.is_file():
            raw = json.loads(_EXT_STATE_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                _ext_state = {
                    "userVocab": raw.get("userVocab")
                    if isinstance(raw.get("userVocab"), dict)
                    else {},
                    "hardsubSettings": raw.get("hardsubSettings")
                    if isinstance(raw.get("hardsubSettings"), dict)
                    else None,
                    "updatedAt": float(raw.get("updatedAt") or 0),
                    "source": str(raw.get("source") or ""),
                }
    except Exception:
        logger.exception("Failed to load extension_state.json")


def _save_ext_state_disk() -> None:
    try:
        _EXT_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = _EXT_STATE_PATH.with_name(f"{_EXT_STATE_PATH.name}.{uuid.uuid4().hex}.tmp")
        try:
            tmp.write_text(
                json.dumps(_ext_state, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            tmp.replace(_EXT_STATE_PATH)
        finally:
            tmp.unlink(missing_ok=True)
    except Exception:
        logger.exception("Failed to save extension_state.json")


def _ext_state_response() -> ExtensionStateResponse:
    return ExtensionStateResponse(
        ok=True,
        userVocab=dict(_ext_state.get("userVocab") or {}),
        hardsubSettings=_ext_state.get("hardsubSettings"),
        updatedAt=float(_ext_state.get("updatedAt") or 0),
        source=str(_ext_state.get("source") or ""),
    )


@router.get("/extension_state", response_model=ExtensionStateResponse)
def get_extension_state() -> ExtensionStateResponse:
    """Mirror of chrome.storage for localhost Saved Items (polled ~1.5s)."""
    return _ext_state_response()


@router.post("/extension_state", response_model=ExtensionStateResponse)
def post_extension_state(body: ExtensionStateRequest) -> ExtensionStateResponse:
    """Partial update from extension SW or localhost Saved Items UI."""
    global _ext_state
    with _ext_state_lock:
        if body.userVocab is not None:
            cleaned: dict[str, str] = {}
            for k, v in body.userVocab.items():
                key = str(k).strip()
                if key and v in ("known", "learning", "ignored", "special"):
                    cleaned[key] = v
            _ext_state["userVocab"] = cleaned
        if body.hardsubSettings is not None:
            _ext_state["hardsubSettings"] = dict(body.hardsubSettings)
        _ext_state["updatedAt"] = time.time()
        if body.source:
            _ext_state["source"] = body.source
        elif not _ext_state.get("source"):
            _ext_state["source"] = "api"
        _save_ext_state_disk()
    return _ext_state_response()


@router.get("/backup/snapshot")
def backup_snapshot_get() -> dict[str, Any]:
    """Export Snapshot v1 from data/subtitles/* + extension_state vocab (start+text only)."""
    try:
        with _ext_state_lock:
            user_vocab = dict(_ext_state.get("userVocab") or {})
        return encode_snapshot(user_vocab=user_vocab)
    except Exception as exc:
        logger.exception("backup/snapshot GET failed")
        append_errors_log("ERROR", f"backup/snapshot GET failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/backup/snapshot")
def backup_snapshot_post(body: dict[str, Any]) -> dict[str, Any]:
    """Import Snapshot v1 → disk (derive end from next start; vocab → extension_state)."""
    global _ext_state
    try:
        result = apply_snapshot(body if isinstance(body, dict) else {})
        user_vocab = result.pop("userVocab", None)
        if isinstance(user_vocab, dict):
            with _ext_state_lock:
                _ext_state["userVocab"] = user_vocab
                _ext_state["updatedAt"] = time.time()
                if not _ext_state.get("source"):
                    _ext_state["source"] = "snapshot"
                _save_ext_state_disk()
        return result
    except ValueError as exc:
        append_errors_log("WARNING", f"backup/snapshot POST bad request: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("backup/snapshot POST failed")
        append_errors_log("ERROR", f"backup/snapshot POST failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
