"""ASR router: audio transcription endpoints using MLX Whisper."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile

from app.services.asr import (
    DEFAULT_INITIAL_PROMPT,
    DEFAULT_MODEL_NAME,
    MAX_AUDIO_BYTES,
    get_asr_status,
    transcribe_audio,
)

logger = logging.getLogger("bridge.asr_api")

router = APIRouter(prefix="/asr", tags=["asr"])


@router.get("/status")
def asr_status() -> Dict[str, Any]:
    """Get runtime status and memory statistics of the ASR engine."""
    return get_asr_status()


@router.post("/transcribe")
async def transcribe(
    request: Request,
    file: Optional[UploadFile] = File(None),
    model: str = Query(DEFAULT_MODEL_NAME, description="Model repository or local path"),
    language: str = Query("ja", description="Target language code"),
    temperature: float = Query(0.0, description="Decoding temperature"),
    condition_on_previous_text: bool = Query(False, description="Condition on previous text"),
    no_speech_threshold: float = Query(0.85, description="No speech threshold"),
    logprob_threshold: float = Query(-1.5, description="Average logprob threshold"),
    initial_prompt: Optional[str] = Query(DEFAULT_INITIAL_PROMPT, description="Initial prompt context"),
    preprocess: bool = Query(True, description="Enable audio DSP preprocessing filter chain"),
) -> Dict[str, Any]:
    """Transcribe audio slice and return text and segment timestamps.

    Supports:
    - Multipart form upload with field `file`.
    - Raw binary body payload (e.g., audio/webm, audio/wav, application/octet-stream).
    """
    audio_bytes: bytes = b""

    # 1. Read from uploaded file if present
    if file is not None:
        try:
            audio_bytes = await file.read()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read audio file: {e}")
    else:
        # 2. Otherwise read raw request body
        try:
            audio_bytes = await request.body()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read request body: {e}")

    # Validate non-empty payload
    if not audio_bytes or len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Audio data cannot be empty")

    # Validate maximum size limit
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Audio payload exceeds maximum size limit ({MAX_AUDIO_BYTES // (1024 * 1024)} MB)",
        )

    try:
        result = await asyncio.to_thread(
            transcribe_audio,
            audio_input=audio_bytes,
            model_name=model,
            language=language,
            temperature=temperature,
            condition_on_previous_text=condition_on_previous_text,
            no_speech_threshold=no_speech_threshold,
            logprob_threshold=logprob_threshold,
            initial_prompt=initial_prompt,
            preprocess=preprocess,
        )
        return result
    except ValueError as e:
        logger.warning("Invalid audio payload for ASR: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error("ASR runtime failure: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected ASR error: %s", e)
        raise HTTPException(status_code=500, detail=f"ASR transcription failed: {e}")
