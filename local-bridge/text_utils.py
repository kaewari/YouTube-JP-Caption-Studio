"""Shared text processing and normalization utilities for local bridge."""

from __future__ import annotations


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


_kata_to_hira = kata_to_hira
