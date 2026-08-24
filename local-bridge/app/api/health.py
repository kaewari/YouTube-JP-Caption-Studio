"""Health, bootstrap, and client logging routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.core.cache import dict_cache
from app.core.governor import governor
from app.schemas.models import HealthResponse
from app.scripts.bootstrap import bootstrap_async, get_progress
from app.services.dictionary import is_loaded as dict_loaded
from app.services.tokenize_ja import is_loaded as sudachi_loaded
from app.services.vocab_freq import is_loaded as freq_loaded
from app.utils.logging_utils import append_errors_log
from app.utils.metrics import p50_latency, p95_latency

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
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
        latency_p50_ms=p50_latency(),
        tokenize_batch_p95_ms=p95_latency(),
        cache_hit_ratio=dict_cache.hit_ratio,
        active_slots=governor.active_slots,
        bootstrap=progress.model_dump(),
    )


@router.post("/bootstrap")
def bootstrap() -> dict[str, Any]:
    bootstrap_async()
    return get_progress().model_dump()


@router.post("/log")
def client_log(body: dict[str, Any]) -> dict[str, bool]:
    """Extension/runtime one-liner into errors.log (silent YT secondary miss, etc.)."""
    level = str(body.get("level") or "WARNING").upper()
    if level not in ("ERROR", "WARNING", "INFO"):
        level = "WARNING"
    msg = str(body.get("message") or "").strip() or "empty"
    append_errors_log(level, msg)
    return {"ok": True}
