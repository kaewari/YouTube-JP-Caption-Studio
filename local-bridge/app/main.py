"""Local bridge FastAPI: tokenize + dict + scripts for YouTube caption extension."""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from contextlib import contextmanager
from collections import deque
from pathlib import Path
from typing import Any, Iterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.scripts.bootstrap import bootstrap_async, get_progress
from app.services.dictionary import is_loaded as dict_loaded
from app.services.dictionary import load_dictionary, lookup
from app.core.governor import governor
from app.services.ime_switch import status as ime_status
from app.services.ime_switch import switch_to as ime_switch_to
from app.schemas.models import (
    DictRequest,
    DictResponse,
    ExtensionStateRequest,
    ExtensionStateResponse,
    HealthResponse,
    ImeSwitchRequest,
    ScriptCue,
    ScriptFilesRequest,
    ScriptLoadResponse,
    ScriptSaveRequest,
    ScriptSaveResponse,
    TokenizeBatchItem,
    TokenizeBatchRequest,
    TokenizeBatchResponse,
    TokenizeRequest,
    TokenizeResponse,
    VocabBand,
    VocabBandsResponse,
    VocabWord,
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
from app.services.snapshot import apply_snapshot, encode_snapshot
from app.services.tokenize_ja import is_loaded as sudachi_loaded
from app.services.tokenize_ja import load_tokenizer, tokenize
from app.services.vocab_freq import assessment_bands, load_freq
from app.services.vocab_freq import is_loaded as freq_loaded
from app.services.vocab_freq import sample_preview_text

_ERRORS_LOG = Path(__file__).resolve().parent.parent / "errors.log"


class BusyError(HTTPException):
    pass


@contextmanager
def _governed() -> Iterator[None]:
    """Governor slot for heavy endpoints (Sudachi tokenize / dict) — 503 when saturated."""
    if not governor.try_acquire():
        raise BusyError(status_code=503, detail="bridge busy")
    try:
        yield
    finally:
        governor.release()


def _append_errors_log(level: str, message: str) -> None:
    try:
        with _ERRORS_LOG.open("a", encoding="utf-8") as f:
            f.write(f"{level}:bridge:{message}\n")
    except Exception:
        pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bridge")

app = FastAPI(title="YouTube JP Caption Studio Bridge", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://[a-z0-9]{32}|http://(localhost|127\.0\.0\.1)(:\d+)?)$",
    # No cookies/sessions — credentials would let any localhost page send
    # credentialed mutation requests; auth is per-request (or loopback-only).
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_latencies: deque[float] = deque(maxlen=50)

_EXT_STATE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "config" / "extension_state.json"
_ext_state_lock = threading.Lock()
_ext_state: dict[str, Any] = {
    "userVocab": {},
    "hardsubSettings": None,
    "updatedAt": 0.0,
    "source": "",
}


def _load_ext_state_disk() -> None:
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


def _p50_latency() -> float:
    if not _latencies:
        return 0.0
    s = sorted(_latencies)
    return s[len(s) // 2]


@app.on_event("startup")
def on_startup() -> None:
    governor.start()
    _load_ext_state_disk()
    try:
        load_dictionary()
        load_freq()
    except Exception:
        logger.exception("Warm load partial failure")


@app.on_event("shutdown")
def on_shutdown() -> None:
    governor.stop()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    snap = governor.snapshot()
    progress = get_progress()
    return HealthResponse(
        ready=True,
        ocr_engine="",
        models_loaded={
            "ocr": False,
            "mt": False,
            "sudachi": sudachi_loaded(),
            "dict": dict_loaded(),
            "freq": freq_loaded(),
        },
        mt_engine="",
        glossary_forms=0,
        caps=governor.state.caps,
        pressure=snap["pressure"],
        latency_p50_ms=_p50_latency(),
        bootstrap=progress.model_dump(),
    )


@app.post("/bootstrap")
def bootstrap() -> dict[str, Any]:
    bootstrap_async()
    return get_progress().model_dump()


@app.post("/log")
def client_log(body: dict[str, Any]) -> dict[str, bool]:
    """Extension/runtime one-liner into errors.log (silent YT secondary miss, etc.)."""
    level = str(body.get("level") or "WARNING").upper()
    if level not in ("ERROR", "WARNING", "INFO"):
        level = "WARNING"
    msg = str(body.get("message") or "").strip() or "empty"
    _append_errors_log(level, msg)
    return {"ok": True}


@app.post("/tokenize", response_model=TokenizeResponse)
def tokenize_text(body: TokenizeRequest) -> TokenizeResponse:
    """Furigana + JLPT/freq tokens only."""
    with _governed():
        text = (body.text or "").strip()
        if not text:
            return TokenizeResponse(source="", tokens=[])
        if not sudachi_loaded():
            load_tokenizer()
        return TokenizeResponse(source=text, tokens=tokenize(text))


@app.post("/tokenize_batch", response_model=TokenizeBatchResponse)
def tokenize_batch(body: TokenizeBatchRequest) -> TokenizeBatchResponse:
    """Batch Sudachi tokenize for post-import enrich."""
    with _governed():
        if not sudachi_loaded():
            load_tokenizer()
        results: list[TokenizeBatchItem] = []
        for cue in body.cues or []:
            src = (cue.text or "").strip()
            results.append(
                TokenizeBatchItem(
                    id=cue.id or "",
                    source=src,
                    tokens=tokenize(src) if src else [],
                )
            )
        return TokenizeBatchResponse(results=results)


@app.post("/dict", response_model=DictResponse)
def dict_lookup(body: DictRequest) -> DictResponse:
    with _governed():
        if not dict_loaded():
            load_dictionary()
        return lookup(body.surface, lemma=body.lemma or "")


@app.post("/scripts/save", response_model=ScriptSaveResponse)
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
        _append_errors_log("ERROR", f"scripts/save failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/scripts")
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
        _append_errors_log("ERROR", f"scripts list failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/scripts/{video_id}/meta")
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


@app.get("/scripts/{video_id}/tokens")
def scripts_tokens(video_id: str) -> dict[str, Any]:
    """{cueId: [token, ...]} — Sudachi output, loaded after cues render."""
    return load_tokens(video_id)


@app.get("/scripts/{video_id}/files")
def scripts_files_get(video_id: str) -> dict[str, Any]:
    """The 3 mirrorable files as text (script.txt rendered here, not on save)."""
    try:
        files = read_files(video_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("scripts/files GET failed")
        _append_errors_log("ERROR", f"scripts/files GET failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if files is None:
        raise HTTPException(status_code=404, detail="not found")
    return {"video_id": video_id, "files": files}


@app.post("/scripts/{video_id}/files")
def scripts_files_post(video_id: str, body: ScriptFilesRequest) -> dict[str, Any]:
    """Drive → disk, straight file write (no lossy snapshot path)."""
    try:
        return write_files(video_id, body.files or {})
    except ValueError as exc:
        _append_errors_log("WARNING", f"scripts/files POST bad request: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("scripts/files POST failed")
        _append_errors_log("ERROR", f"scripts/files POST failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/scripts/{video_id}", response_model=ScriptLoadResponse)
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


@app.delete("/scripts/{video_id}")
def scripts_delete(video_id: str) -> dict[str, Any]:
    """Wipe saved script folder for a video (cues.json / script.txt / meta)."""
    try:
        return delete_script(video_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("scripts/delete failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/ime/status")
def ime_status_endpoint() -> dict[str, Any]:
    """macOS Input Source helper availability (best-effort; non-mac → no_helper)."""
    return ime_status()


@app.post("/ime/switch")
def ime_switch_endpoint(body: ImeSwitchRequest) -> dict[str, Any]:
    """Switch macOS Input Source: ja | abc | restore (previous / ABC)."""
    return ime_switch_to(body.to)


@app.post("/ime/ja")
def ime_ja() -> dict[str, Any]:
    return ime_switch_to("ja")


@app.post("/ime/abc")
def ime_abc() -> dict[str, Any]:
    return ime_switch_to("abc")


@app.get("/vocab/bands", response_model=VocabBandsResponse)
def vocab_bands() -> VocabBandsResponse:
    if not freq_loaded():
        load_freq()
    if not sudachi_loaded():
        load_tokenizer()
    raw_bands = assessment_bands()
    bands = [
        VocabBand(
            band=int(b["band"]),
            words=[VocabWord(**w) for w in b.get("words") or []],
        )
        for b in raw_bands
    ]
    preview = sample_preview_text()
    preview_tokens = tokenize(preview) if sudachi_loaded() else []
    return VocabBandsResponse(
        bands=bands,
        preview_source=preview,
        preview_tokens=preview_tokens,
    )


@app.get("/extension_state", response_model=ExtensionStateResponse)
def get_extension_state() -> ExtensionStateResponse:
    """Mirror of chrome.storage for localhost Saved Items (polled ~1.5s)."""
    return _ext_state_response()


@app.post("/extension_state", response_model=ExtensionStateResponse)
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


@app.get("/backup/snapshot")
def backup_snapshot_get() -> dict[str, Any]:
    """Export Snapshot v1 from data/subtitles/* + extension_state vocab (start+text only)."""
    try:
        with _ext_state_lock:
            user_vocab = dict(_ext_state.get("userVocab") or {})
        return encode_snapshot(user_vocab=user_vocab)
    except Exception as exc:
        logger.exception("backup/snapshot GET failed")
        _append_errors_log("ERROR", f"backup/snapshot GET failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/backup/snapshot")
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
        _append_errors_log("WARNING", f"backup/snapshot POST bad request: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("backup/snapshot POST failed")
        _append_errors_log("ERROR", f"backup/snapshot POST failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "youtube-caption-bridge", "docs": "/docs"}
