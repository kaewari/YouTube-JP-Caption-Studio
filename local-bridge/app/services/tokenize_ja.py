"""Japanese tokenization + furigana readings via SudachiPy."""

from __future__ import annotations

import logging
import re
import threading

from app.schemas.models import Token
from app.utils.text_utils import kata_to_hira
from app.services.vocab_freq import is_loaded as freq_loaded
from app.services.vocab_freq import jlpt_of, load_freq, rank_of

logger = logging.getLogger(__name__)

_tokenizer = None
_loaded = False
# A failed load is not retried on every request (one warning per request
# would flood the log); pass force=True to try again.
_load_failed = False
# Re-entrant: load_tokenizer() and tokenize() both take this lock, and
# tokenize() may call load_tokenizer() while holding it.
_tokenize_lock = threading.RLock()


def is_loaded() -> bool:
    return _loaded and _tokenizer is not None


def load_tokenizer(force: bool = False) -> bool:
    global _tokenizer, _loaded, _load_failed
    if _loaded:
        return True
    if _load_failed and not force:
        return False
    # The lock keeps two concurrent callers from building two Dictionaries.
    with _tokenize_lock:
        if _loaded:
            return True
        try:
            from sudachipy import Dictionary, SplitMode

            # Mode B: better dictionary units for hover lookup than C (too coarse) / A (too fine)
            _tokenizer = Dictionary().create(mode=SplitMode.B)
            _loaded = True
            _load_failed = False
            logger.info("Sudachi tokenizer loaded (SplitMode.B)")
            if not freq_loaded():
                load_freq()
            return True
        except Exception as exc:
            logger.warning("Sudachi unavailable: %s", exc)
            _loaded = False
            _tokenizer = None
            _load_failed = True
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


def tokenize(text: str) -> list[Token]:
    if not text:
        return []
    if not freq_loaded():
        load_freq()
    if not is_loaded():
        load_tokenizer()
    tokenizer = _tokenizer
    if tokenizer is None:
        # Sudachi is unavailable: emit nothing so the caller degrades. A single
        # token covering the whole sentence would break the anti-clumping
        # invariant (AGENTS.md §2) and fake a full-string lemma.
        logger.debug("Sudachi unavailable — no tokens for %d chars", len(text))
        return []

    tokens: list[Token] = []
    with _tokenize_lock:
        morphemes = list(tokenizer.tokenize(text))
    for m in morphemes:
        surface = m.surface()
        start = m.begin()
        end = m.end()
        lemma = m.dictionary_form() or surface
        # Kanji and kana both need the phonetic reading (kata → hira).
        reading = kata_to_hira(m.reading_form() or "")
        pos = _pos_label(m)
        rank = rank_of(lemma, surface, reading)
        tokens.append(
            Token(
                surface=surface,
                reading=reading,
                lemma=lemma,
                start=start,
                end=end,
                freq_rank=rank,
                pos=pos,
                jlpt=jlpt_of(rank, lemma=lemma, reading=reading, surface=surface),
            )
        )
    return tokens
