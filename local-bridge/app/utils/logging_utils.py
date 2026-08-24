"""Errors logging helper for local bridge."""

from __future__ import annotations

from pathlib import Path

_ERRORS_LOG = Path(__file__).resolve().parent.parent.parent / "errors.log"


def append_errors_log(level: str, message: str) -> None:
    try:
        with _ERRORS_LOG.open("a", encoding="utf-8") as f:
            f.write(f"{level}:bridge:{message}\n")
    except Exception:
        pass
