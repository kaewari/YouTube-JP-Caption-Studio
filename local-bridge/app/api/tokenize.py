"""Tokenize and vocabulary endpoints."""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Iterator

from fastapi import APIRouter, HTTPException

from app.core.governor import governor
from app.schemas.models import (
    SegmentCueIn,
    TokenizeBatchItem,
    TokenizeBatchRequest,
    TokenizeBatchResponse,
    TokenizeRequest,
    TokenizeResponse,
    VocabBand,
    VocabBandsResponse,
    VocabWord,
)
from app.services.tokenize_ja import is_loaded as sudachi_loaded
from app.services.tokenize_ja import load_tokenizer, tokenize
from app.services.vocab_freq import assessment_bands, load_freq
from app.services.vocab_freq import is_loaded as freq_loaded
from app.services.vocab_freq import sample_preview_text
from app.utils.metrics import record_tokenize_latency

router = APIRouter()


class BusyError(HTTPException):
    pass


@contextmanager
def _governed() -> Iterator[None]:
    """Governor slot for heavy endpoints (Sudachi tokenize) — 503 when saturated."""
    if not governor.try_acquire():
        raise BusyError(status_code=503, detail="bridge busy")
    try:
        yield
    finally:
        governor.release()


@router.post("/tokenize", response_model=TokenizeResponse)
def tokenize_text(body: TokenizeRequest) -> TokenizeResponse:
    """Furigana + JLPT/freq tokens only."""
    with _governed():
        text = (body.text or "").strip()
        if not text:
            return TokenizeResponse(source="", tokens=[])
        if not sudachi_loaded():
            load_tokenizer()
        return TokenizeResponse(source=text, tokens=tokenize(text))


@router.post("/tokenize_batch", response_model=TokenizeBatchResponse)
def tokenize_batch(body: TokenizeBatchRequest) -> TokenizeBatchResponse:
    """Batch Sudachi tokenize for post-import enrich."""
    t0 = time.perf_counter()
    try:
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
    finally:
        ms = (time.perf_counter() - t0) * 1000.0
        record_tokenize_latency(ms)


@router.get("/vocab/bands", response_model=VocabBandsResponse)
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
