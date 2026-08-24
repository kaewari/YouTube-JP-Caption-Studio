"""Local bridge FastAPI: tokenize + dict + scripts for YouTube caption extension."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.captions import router as captions_router
from app.api.dict import router as dict_router
from app.api.health import router as health_router
from app.api.ime import router as ime_router
from app.api.scripts import router as scripts_router
from app.api.state import load_ext_state_disk
from app.api.state import router as state_router
from app.api.tokenize import router as tokenize_router
from app.core.governor import governor
from app.services.dictionary import load_dictionary
from app.services.vocab_freq import load_freq

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

app.include_router(health_router)
app.include_router(captions_router)
app.include_router(tokenize_router)
app.include_router(dict_router)
app.include_router(scripts_router)
app.include_router(ime_router)
app.include_router(state_router)


@app.on_event("startup")
def on_startup() -> None:
    governor.start()
    load_ext_state_disk()
    try:
        load_dictionary()
        load_freq()
    except Exception:
        logger.exception("Warm load partial failure")


@app.on_event("shutdown")
def on_shutdown() -> None:
    governor.stop()


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "youtube-caption-bridge", "docs": "/docs"}
