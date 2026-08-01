"""Local bridge FastAPI: tokenize + dict + scripts for YouTube caption extension."""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from bootstrap import bootstrap_async, get_progress
from dictionary import is_loaded as dict_loaded
from dictionary import load_dictionary, lookup
from governor import governor
from ime_switch import status as ime_status
from ime_switch import switch_to as ime_switch_to
from models import (
    DictRequest,
    DictResponse,
    ExtensionStateRequest,
    ExtensionStateResponse,
    HealthResponse,
    ImeSwitchRequest,
    ScriptCue,
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
from script_store import delete_script, load_script, save_script, scripts_root
from tokenize_ja import is_loaded as sudachi_loaded
from tokenize_ja import load_tokenizer, tokenize
from vocab_freq import assessment_bands, load_freq
from vocab_freq import is_loaded as freq_loaded
from vocab_freq import sample_preview_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bridge")

app = FastAPI(title="YouTube Caption Bridge", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://[a-z0-9]{32}|http://(localhost|127\.0\.0\.1)(:\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_latencies: deque[float] = deque(maxlen=50)

_EXT_STATE_PATH = Path(__file__).resolve().parent / "data" / "extension_state.json"
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
        _EXT_STATE_PATH.write_text(
            json.dumps(_ext_state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
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


@app.post("/tokenize", response_model=TokenizeResponse)
def tokenize_text(body: TokenizeRequest) -> TokenizeResponse:
    """Furigana + JLPT/freq tokens only."""
    text = (body.text or "").strip()
    if not text:
        return TokenizeResponse(source="", tokens=[])
    if not sudachi_loaded():
        load_tokenizer()
    return TokenizeResponse(source=text, tokens=tokenize(text))


@app.post("/tokenize_batch", response_model=TokenizeBatchResponse)
def tokenize_batch(body: TokenizeBatchRequest) -> TokenizeBatchResponse:
    """Batch Sudachi tokenize for post-import enrich."""
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
        )
        return ScriptSaveResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("scripts/save failed")
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


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "youtube-caption-bridge", "docs": "/docs"}
