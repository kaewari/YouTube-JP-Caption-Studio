"""Japanese tokenization + furigana readings via SudachiPy."""

from __future__ import annotations

import logging
import re
import threading

from app.schemas.models import Token
from app.utils.text_utils import _kata_to_hira
from app.services.vocab_freq import is_loaded as freq_loaded
from app.services.vocab_freq import jlpt_of, load_freq, rank_of

logger = logging.getLogger(__name__)

_tokenizer = None
_loaded = False
_tokenize_lock = threading.Lock()


def is_loaded() -> bool:
    return _loaded and _tokenizer is not None


def load_tokenizer() -> bool:
    global _tokenizer, _loaded
    if _loaded:
        return True
    try:
        from sudachipy import Dictionary, SplitMode

        # Mode B: better dictionary units for hover lookup than C (too coarse) / A (too fine)
        _tokenizer = Dictionary().create(mode=SplitMode.B)
        _loaded = True
        logger.info("Sudachi tokenizer loaded (SplitMode.B)")
        if not freq_loaded():
            load_freq()
        return True
    except Exception as exc:
        logger.warning("Sudachi unavailable: %s", exc)
        _loaded = False
        return False


_KANJI_RE = re.compile(r"[\u3400-\u9fff]")


def _pos_label(morpheme) -> str:
    try:
        parts = morpheme.part_of_speech()
        if not parts:
            return ""
        # Sudachi: [pos1, pos2, pos3, pos4, conjugation_type, conjugation_form]
        return str(parts[0] or "")
    except Exception:
        return ""


def iter_morphemes(text: str):
    """Yield Sudachi morphemes (empty if tokenizer unavailable)."""
    if not text:
        return
    if not is_loaded():
        load_tokenizer()
    if _tokenizer is None:
        return
    yield from _tokenizer.tokenize(text)


def tokenize(text: str) -> list[Token]:
    if not text:
        return []
    if not freq_loaded():
        load_freq()
    if not is_loaded():
        lemma = text
        rank = rank_of(lemma, text)
        return [
            Token(
                surface=text,
                reading="",
                lemma=lemma,
                start=0,
                end=len(text),
                freq_rank=rank,
                pos="",
                jlpt=jlpt_of(rank),
            )
        ]

    assert _tokenizer is not None
    tokens: list[Token] = []
    with _tokenize_lock:
        morphemes = list(_tokenizer.tokenize(text))
    for m in morphemes:
        surface = m.surface()
        start = m.begin()
        end = m.end()
        lemma = m.dictionary_form() or surface
        reading = ""
        if _KANJI_RE.search(surface):
            reading = _kata_to_hira(m.reading_form() or "")
        pos = _pos_label(m)
        rank = rank_of(lemma, surface)
        tokens.append(
            Token(
                surface=surface,
                reading=reading,
                lemma=lemma,
                start=start,
                end=end,
                freq_rank=rank,
                pos=pos,
                jlpt=jlpt_of(rank),
            )
        )
    return tokens


def furigana_line(text: str, tokens: list[Token] | None = None) -> str:
    toks = tokens if tokens is not None else tokenize(text)
    parts: list[str] = []
    for t in toks:
        if t.reading and _KANJI_RE.search(t.surface):
            parts.append(f"{t.surface}({t.reading})")
        else:
            parts.append(t.surface)
    return "".join(parts)
