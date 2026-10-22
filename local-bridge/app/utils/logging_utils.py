"""Errors logging helper for local bridge."""

from __future__ import annotations

import logging
import re
from pathlib import Path

_ERRORS_LOG = Path(__file__).resolve().parent.parent.parent / "errors.log"

logger = logging.getLogger(__name__)


_LINE_BREAKS = re.compile(r"\s+")


def append_errors_log(level: str, message: str) -> None:
    # One physical line per entry: a message carrying newlines would forge
    # extra log lines (the /log route takes client text verbatim).
    safe = _LINE_BREAKS.sub(" ", str(message)).strip() or "empty"
    try:
        with _ERRORS_LOG.open("a", encoding="utf-8") as f:
            f.write(f"{level}:bridge:{safe}\n")
    except Exception as exc:
        # Logging must never break the caller, but the failure is not silent.
        logger.debug("Could not append to errors.log: %s", exc)
