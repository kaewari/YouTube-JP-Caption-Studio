"""Japanese lemma frequency ranks + assessment band samples."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from text_utils import _kata_to_hira

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent / "data" / "dict"
FREQ_JSON = DATA_DIR / "freq_ja.json"

# Language Reactor-style frequency checkpoints (rank ceilings).
BANDS = (1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000)
SAMPLES_PER_BAND = 8

_freq: dict[str, int] = {}
_loaded = False

# POS prefixes that should not be highlighted as vocab.
_SKIP_POS_PREFIXES = (
    "助詞",
    "助動詞",
    "補助記号",
    "記号",
    "空白",
)


def is_loaded() -> bool:
    return _loaded


def load_freq() -> bool:
    global _freq, _loaded
    if _loaded:
        return True
    if not FREQ_JSON.exists():
        logger.warning("freq map missing: %s", FREQ_JSON)
        _freq = {}
        _loaded = True
        return False
    try:
        raw = json.loads(FREQ_JSON.read_text(encoding="utf-8"))
        _freq = {str(k): int(v) for k, v in raw.items()}
        _loaded = True
        logger.info("Loaded freq map (%d lemmas)", len(_freq))
        return True
    except Exception as exc:
        logger.warning("Failed to load freq map: %s", exc)
        _freq = {}
        _loaded = True
        return False


def rank_of(lemma: str, surface: str = "") -> int | None:
    if not _loaded:
        load_freq()
    if lemma and lemma in _freq:
        return _freq[lemma]
    if surface and surface in _freq:
        return _freq[surface]
    return None


# Rough JLPT ceilings by lemma frequency rank (no JMdict JLPT tags in index).
_JLPT_CEILINGS = (
    (800, "n5"),
    (1500, "n4"),
    (3000, "n3"),
    (6000, "n2"),
)


def jlpt_of(rank: int | None) -> str | None:
    """Map frequency rank → jlpt band string (n5…n1), or None if unknown."""
    if rank is None:
        return None
    try:
        r = int(rank)
    except (TypeError, ValueError):
        return None
    if r <= 0:
        return None
    for ceiling, level in _JLPT_CEILINGS:
        if r <= ceiling:
            return level
    return "n1"


def is_skip_pos(pos: str) -> bool:
    if not pos:
        return False
    return any(pos.startswith(p) for p in _SKIP_POS_PREFIXES)


def assessment_bands(samples_per: int = SAMPLES_PER_BAND) -> list[dict[str, Any]]:
    """Return sample words grouped by frequency band for the level picker UI."""
    if not _loaded:
        load_freq()

    # Sort lemmas by rank ascending
    items = sorted(_freq.items(), key=lambda kv: kv[1])
    by_band: dict[int, list[tuple[str, int]]] = {b: [] for b in BANDS}
    for band in BANDS:
        lo = 0 if band == BANDS[0] else BANDS[BANDS.index(band) - 1]
        candidates = [(lemma, rank) for lemma, rank in items if lo < rank <= band]
        # Prefer hardest words in the band (near the ceiling) for assessment.
        by_band[band] = candidates[-samples_per:] if candidates else []

    # Attach readings via Sudachi when available
    reading_fn = _reading_lookup()

    out: list[dict[str, Any]] = []
    for band in BANDS:
        words = []
        for lemma, rank in by_band[band]:
            reading = reading_fn(lemma) if reading_fn else ""
            words.append(
                {
                    "surface": lemma,
                    "lemma": lemma,
                    "reading": reading,
                    "freq_rank": rank,
                }
            )
        out.append({"band": band, "words": words})
    return out


def _reading_lookup():
    try:
        from sudachipy import Dictionary, SplitMode

        tok = Dictionary().create(mode=SplitMode.B)

        def lookup(lemma: str) -> str:
            ms = tok.tokenize(lemma)
            if not ms:
                return ""
            reading = ms[0].reading_form() or ""
            return _kata_to_hira(reading)

        return lookup
    except Exception:
        return None


# Fixed JA sample sentence for level-modal preview (tokenized on demand).
SAMPLE_PREVIEW_JA = (
    "初めて夜、砂の上で眠りについた。人間の住まいから何千マイルも離れていた。"
    "海の真ん中のいかだの上で遭難した船乗りよりも、もっと孤独だった。"
)


def sample_preview_text() -> str:
    return SAMPLE_PREVIEW_JA
