"""Shared API contract types for the caption bridge."""

from __future__ import annotations

import math
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator


class Token(BaseModel):
    surface: str
    reading: str = ""
    lemma: str = ""
    start: int = 0
    end: int = 0
    freq_rank: Optional[int] = None
    pos: str = ""
    # Approximate JLPT band from frequency (n5…n1); None → UI uses level-unknown
    jlpt: Optional[str] = None


class VocabWord(BaseModel):
    surface: str
    lemma: str = ""
    reading: str = ""
    freq_rank: int = 0


class VocabBand(BaseModel):
    band: int
    words: list[VocabWord] = Field(default_factory=list)


class VocabBandsResponse(BaseModel):
    bands: list[VocabBand] = Field(default_factory=list)
    preview_source: str = ""
    preview_tokens: list[Token] = Field(default_factory=list)


class Caps(BaseModel):
    max_in_flight: int = 3
    max_fps: int = 10
    w_ocr: int = 0
    w_mt: int = 0


class HealthResponse(BaseModel):
    ready: bool
    ocr_engine: str = ""
    models_loaded: dict[str, bool] = Field(default_factory=dict)
    mt_engine: str = ""
    glossary_forms: int = 0
    caps: Caps = Field(default_factory=Caps)
    pressure: Literal["low", "high"] = "low"
    latency_p50_ms: float = 0.0
    tokenize_batch_p95_ms: float = 0.0
    bootstrap: Optional[dict[str, Any]] = None


class TokenizeRequest(BaseModel):
    """Sudachi + JLPT/freq only (import enrich / furigana)."""

    text: str = ""


class TokenizeResponse(BaseModel):
    source: str = ""
    tokens: list[Token] = Field(default_factory=list)


class SegmentCueIn(BaseModel):
    id: str = ""
    text: str


class TokenizeBatchRequest(BaseModel):
    cues: list[SegmentCueIn] = Field(default_factory=list)


class TokenizeBatchItem(BaseModel):
    id: str = ""
    source: str = ""
    tokens: list[Token] = Field(default_factory=list)


class TokenizeBatchResponse(BaseModel):
    results: list[TokenizeBatchItem] = Field(default_factory=list)


class DictRequest(BaseModel):
    surface: str
    lemma: str = ""
    sentence_id: str = ""


class DictSense(BaseModel):
    gloss_en: list[str] = Field(default_factory=list)
    gloss_vi: list[str] = Field(default_factory=list)
    reading: str = ""
    pos: list[str] = Field(default_factory=list)


class DictResponse(BaseModel):
    surface: str
    matched: str = ""
    reading: str = ""
    found: bool = False
    senses: list[DictSense] = Field(default_factory=list)
    message: str = ""


class BootstrapProgress(BaseModel):
    stage: str
    percent: float
    message: str = ""
    done: bool = False


class ScriptCue(BaseModel):
    """Wire cue — no tokens; those live in tokens.json / GET /scripts/{id}/tokens."""

    id: str = ""
    start_media_time: float = 0.0
    end_media_time: float = 0.0
    source: str = ""
    en: str = ""
    vi: str = ""
    translated: bool = False
    text_source: str = "yt"
    # User/import owns EN/VI (token enrich OK).
    mt_locked: bool = False
    translation_source: str = ""  # "" | "user" | "import"

    @model_validator(mode="after")
    def _times_sane(self) -> ScriptCue:
        # NaN/Inf/-∞ break JSON, sort order and the player; reject at the boundary.
        for name in ("start_media_time", "end_media_time"):
            v = getattr(self, name)
            if not math.isfinite(v) or v < 0:
                raise ValueError(f"{name} must be finite and >= 0, got {v!r}")
        if self.end_media_time < self.start_media_time:
            raise ValueError("end_media_time must not be before start_media_time")
        return self


class ScriptCueIn(ScriptCue):
    """Save side still accepts inline tokens; the store splits them out."""

    tokens: list[Any] = Field(default_factory=list)


class ScriptSaveRequest(BaseModel):
    video_id: str
    cues: list[ScriptCueIn] = Field(default_factory=list)
    url: str = ""
    title: str = ""
    owned: Optional[bool] = None
    rev: Optional[int] = None


class ScriptSaveResponse(BaseModel):
    ok: bool = True
    video_id: str = ""
    path: str = ""
    txt_path: str = ""
    cue_count: int = 0
    translated_count: int = 0
    rev: int = 0
    message: str = ""


class ScriptFilesRequest(BaseModel):
    """Drive → disk mirror: {"files": {"cues.json": "...", ...}}."""

    files: dict[str, str] = Field(default_factory=dict)


class ScriptLoadResponse(BaseModel):
    ok: bool = True
    found: bool = False
    video_id: str = ""
    path: str = ""
    cues: list[ScriptCue] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
    cue_count: int = 0
    translated_count: int = 0
    message: str = ""


class ImeSwitchRequest(BaseModel):
    """macOS Input Source: ja on JA focus; restore/abc on blur/Enter."""

    to: Literal["ja", "abc", "restore"]


class ExtensionStateRequest(BaseModel):
    """Mirror of chrome.storage.local keys for localhost Saved Items sync."""

    userVocab: Optional[dict[str, str]] = None
    hardsubSettings: Optional[dict[str, Any]] = None
    source: str = ""


class ExtensionStateResponse(BaseModel):
    ok: bool = True
    userVocab: dict[str, str] = Field(default_factory=dict)
    hardsubSettings: Optional[dict[str, Any]] = None
    updatedAt: float = 0.0
    source: str = ""
