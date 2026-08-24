"""macOS Input Method Editor (IME) switching routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.schemas.models import ImeSwitchRequest
from app.services.ime_switch import status as ime_status
from app.services.ime_switch import switch_to as ime_switch_to

router = APIRouter()


@router.get("/ime/status")
def ime_status_endpoint() -> dict[str, Any]:
    """macOS Input Source helper availability (best-effort; non-mac → no_helper)."""
    return ime_status()


@router.post("/ime/switch")
def ime_switch_endpoint(body: ImeSwitchRequest) -> dict[str, Any]:
    """Switch macOS Input Source: ja | abc | restore (previous / ABC)."""
    return ime_switch_to(body.to)


@router.post("/ime/ja")
def ime_ja() -> dict[str, Any]:
    return ime_switch_to("ja")


@router.post("/ime/abc")
def ime_abc() -> dict[str, Any]:
    return ime_switch_to("abc")
