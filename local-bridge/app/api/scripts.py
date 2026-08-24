"""Caption script management and file persistence routes."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from app.schemas.models import (
    ScriptCue,
    ScriptFilesRequest,
    ScriptLoadResponse,
    ScriptSaveRequest,
    ScriptSaveResponse,
)
from app.services.script_store import (
    delete_script,
    list_scripts,
    load_meta,
    load_script,
    load_tokens,
    read_files,
    save_script,
    scripts_root,
    write_files,
)
from app.utils.logging_utils import append_errors_log

logger = logging.getLogger("bridge")
router = APIRouter()


@router.post("/scripts/save", response_model=ScriptSaveResponse)
def scripts_save(body: ScriptSaveRequest) -> ScriptSaveResponse:
    try:
        result = save_script(
            body.video_id,
            [c.model_dump() for c in body.cues],
            url=body.url or "",
            title=body.title or "",
            owned=body.owned,
            rev=body.rev,
        )
        return ScriptSaveResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("scripts/save failed")
        append_errors_log("ERROR", f"scripts/save failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/scripts")
def scripts_list() -> list[dict[str, Any]]:
    """Library index for the Drive mirror: [{video_id, title, updated_at, rev, cue_count, owned}]."""
    try:
        return [
            {
                "video_id": m["video_id"],
                "title": m["title"],
                "updated_at": m["updated_at"],
                "rev": m["rev"],
                "cue_count": m["cue_count"],
                "owned": m["owned"],
            }
            for m in list_scripts()
        ]
    except Exception as exc:
        logger.exception("scripts list failed")
        append_errors_log("ERROR", f"scripts list failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/scripts/{video_id}/meta")
def scripts_meta(video_id: str) -> dict[str, Any]:
    """Few-hundred-byte freshness probe — compare rev before fetching a body."""
    try:
        meta = load_meta(video_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not meta:
        raise HTTPException(status_code=404, detail="not found")
    return {
        k: meta[k]
        for k in ("video_id", "rev", "deviceId", "updated_at", "cue_count", "owned")
    }


@router.get("/scripts/{video_id}/tokens")
def scripts_tokens(video_id: str) -> dict[str, Any]:
    """{cueId: [token, ...]} — Sudachi output, loaded after cues render."""
    return load_tokens(video_id)


@router.get("/scripts/{video_id}/files")
def scripts_files_get(video_id: str) -> dict[str, Any]:
    """The 3 mirrorable files as text (script.txt rendered here, not on save)."""
    try:
        files = read_files(video_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("scripts/files GET failed")
        append_errors_log("ERROR", f"scripts/files GET failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if files is None:
        raise HTTPException(status_code=404, detail="not found")
    return {"video_id": video_id, "files": files}


@router.post("/scripts/{video_id}/files")
def scripts_files_post(video_id: str, body: ScriptFilesRequest) -> dict[str, Any]:
    """Drive → disk, straight file write (no lossy snapshot path)."""
    try:
        return write_files(video_id, body.files or {})
    except ValueError as exc:
        append_errors_log("WARNING", f"scripts/files POST bad request: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("scripts/files POST failed")
        append_errors_log("ERROR", f"scripts/files POST failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/scripts/{video_id}", response_model=ScriptLoadResponse)
def scripts_load(video_id: str) -> ScriptLoadResponse:
    try:
        scripts_root()
        data = load_script(video_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not data:
        return ScriptLoadResponse(
            ok=True,
            found=False,
            video_id=video_id,
            message="not found",
        )
    cues = [
        ScriptCue(**c) if isinstance(c, dict) else ScriptCue()
        for c in (data.get("cues") or [])
        if isinstance(c, dict)
    ]
    return ScriptLoadResponse(
        ok=True,
        found=True,
        video_id=data.get("video_id") or video_id,
        path=str(data.get("path") or ""),
        cues=cues,
        meta=data.get("meta") or {},
        cue_count=int(data.get("cue_count") or len(cues)),
        translated_count=int(data.get("translated_count") or 0),
    )


@router.delete("/scripts/{video_id}")
def scripts_delete(video_id: str) -> dict[str, Any]:
    """Wipe saved script folder for a video (cues.json / script.txt / meta)."""
    try:
        return delete_script(video_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("scripts/delete failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
