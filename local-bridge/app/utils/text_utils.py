"""Shared text processing and normalization utilities for local bridge."""

from __future__ import annotations

import unicodedata

# Punctuation stripped when a lookup key is normalized.
PUNCT_STRIP = "。、.!?,！？「」『』（）()[]【】…・〜～『』「」〈〉《》""''\""


def kata_to_hira(text: str) -> str:
    """Convert Katakana characters in text to Hiragana."""
    out = []
    for ch in text:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def hira_to_kata(text: str) -> str:
    """Convert Hiragana characters in text to Katakana."""
    out = []
    for ch in text:
        code = ord(ch)
        if 0x3041 <= code <= 0x3096:
            out.append(chr(code + 0x60))
        else:
            out.append(ch)
    return "".join(out)


def nfkc(text: str) -> str:
    """Compatibility-normalize and trim a lookup key."""
    return unicodedata.normalize("NFKC", text or "").strip()


def strip_punct(text: str) -> str:
    """Drop leading/trailing punctuation from a lookup key."""
    return text.strip(PUNCT_STRIP).strip()
