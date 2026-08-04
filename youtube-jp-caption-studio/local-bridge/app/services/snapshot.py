"""Snapshot v1 encode/decode — vocab only.

Scripts no longer travel through the snapshot: they are mirrored folder-by-folder
via /scripts/{id}/files, which keeps tokens, mt_locked and translation_source.
`scripts: []` stays on the wire so the iPad's Snapshot v1 decoder still parses.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

_VOCAB_STATUS = frozenset({"known", "learning", "ignored", "special"})


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _vocab_from_ext(user_vocab: dict[str, Any] | None, *, saved_at: str) -> list[dict[str, Any]]:
    """Best-effort: extension_state userVocab {word: status} → Snapshot vocab[]."""
    out: list[dict[str, Any]] = []
    if not isinstance(user_vocab, dict):
        return out
    for word, status in user_vocab.items():
        w = str(word or "").strip()
        if not w:
            continue
        st = str(status or "").strip()
        out.append(
            {
                "word": w,
                "reading": "",
                "meaning": st if st in _VOCAB_STATUS else "",
                "jlptLevel": None,
                "frequencyCount": 0,
                "savedAt": saved_at,
            }
        )
    return out


def _vocab_to_ext(vocab: list[Any] | None) -> dict[str, str]:
    """Best-effort: Snapshot vocab[] → userVocab {word: status}."""
    cleaned: dict[str, str] = {}
    for v in vocab or []:
        if not isinstance(v, dict):
            continue
        w = str(v.get("word") or "").strip()
        if not w:
            continue
        meaning = str(v.get("meaning") or "").strip()
        cleaned[w] = meaning if meaning in _VOCAB_STATUS else "learning"
    return cleaned


def encode_snapshot(
    *,
    user_vocab: dict[str, Any] | None = None,
    updated_at: str | None = None,
) -> dict[str, Any]:
    """Build Snapshot v1 from extension_state vocab."""
    ts = updated_at or _utc_now_iso()
    return {
        "version": 1,
        "updatedAt": ts,
        "scripts": [],
        "vocab": _vocab_from_ext(user_vocab, saved_at=ts),
    }


def apply_snapshot(body: dict[str, Any]) -> dict[str, Any]:
    """Apply Snapshot v1 vocab. Scripts in the body are ignored — mirror owns them."""
    if not isinstance(body, dict):
        raise ValueError("snapshot body must be an object")
    version = int(body.get("version") or 1)
    if version != 1:
        raise ValueError(f"unsupported snapshot version: {version}")
    scripts_in = body.get("scripts")
    if scripts_in is not None and not isinstance(scripts_in, list):
        raise ValueError("scripts must be an array")

    return {
        "ok": True,
        "version": 1,
        "updatedAt": str(body.get("updatedAt") or "").strip() or _utc_now_iso(),
        "script_count": 0,
        "cue_count": 0,
        "userVocab": _vocab_to_ext(body.get("vocab")),
    }
