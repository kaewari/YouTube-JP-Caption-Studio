"""Errors logging helper for local bridge."""

from __future__ import annotations

import logging
from pathlib import Path

_ERRORS_LOG = Path(__file__).resolve().parent.parent.parent / "errors.log"

logger = logging.getLogger(__name__)


def append_errors_log(level: str, message: str) -> None:
    try:
        with _ERRORS_LOG.open("a", encoding="utf-8") as f:
            f.write(f"{level}:bridge:{message}\n")
    except Exception as exc:
        # Logging must never break the caller, but the failure is not silent.
        logger.debug("Could not append to errors.log: %s", exc)
