"""Japanese lemma frequency ranks + assessment band samples."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.utils.text_utils import _kata_to_hira

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "dict"
FREQ_JSON = DATA_DIR / "freq_ja.json"

JLPT_JSON = DATA_DIR / "jlpt_vocab.json"

# Language Reactor-style frequency checkpoints (rank ceilings).
BANDS = (1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000)
SAMPLES_PER_BAND = 8

_freq: dict[str, int] = {}
_jlpt: dict[str, str] = {}
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
    global _freq, _jlpt, _loaded
    if _loaded:
        return True
    _loaded = True
    if FREQ_JSON.exists():
        try:
            raw = json.loads(FREQ_JSON.read_text(encoding="utf-8"))
            _freq = {str(k): int(v) for k, v in raw.items()}
            logger.info("Loaded freq map (%d lemmas)", len(_freq))
        except Exception as exc:
            logger.warning("Failed to load freq map: %s", exc)
            _freq = {}
    else:
        logger.warning("freq map missing: %s", FREQ_JSON)
        _freq = {}

    if JLPT_JSON.exists():
        try:
            raw_jlpt = json.loads(JLPT_JSON.read_text(encoding="utf-8"))
            _jlpt = {str(k): str(v).lower() for k, v in raw_jlpt.items()}
            logger.info("Loaded JLPT map (%d entries)", len(_jlpt))
        except Exception as exc:
            logger.warning("Failed to load JLPT map: %s", exc)
            _jlpt = {}
    else:
        _jlpt = {}

    return True


def rank_of(lemma: str, surface: str = "", reading: str = "") -> int | None:
    if not _loaded:
        load_freq()
    if lemma and lemma in _freq:
        return _freq[lemma]
    if surface and surface in _freq:
        return _freq[surface]
    if reading:
        if reading in _freq:
            return _freq[reading]
        hira = _kata_to_hira(reading)
        if hira in _freq:
            return _freq[hira]
    return None


# Rough JLPT ceilings by lemma frequency rank (fallback).
_JLPT_CEILINGS = (
    (800, "n5"),
    (1500, "n4"),
    (3000, "n3"),
    (6000, "n2"),
)

_COMMON_JLPT_WORDS = {
    "私": "n5", "わたし": "n5", "わたくし": "n5", "僕": "n5", "ぼく": "n5", "俺": "n5", "おれ": "n5",
    "あなた": "n5", "今": "n5", "いま": "n5", "今日": "n5", "きょう": "n5", "明日": "n5", "あした": "n5",
    "昨日": "n5", "きのう": "n5", "日本": "n5", "にほん": "n5", "日本語": "n5",
    "人": "n5", "ひと": "n5", "何": "n5", "なに": "n5", "なん": "n5",
    "皆さん": "n5", "みなさん": "n5", "みんな": "n5", "先生": "n5", "学生": "n5", "友達": "n5",
    "する": "n5", "いる": "n5", "ある": "n5", "なる": "n5", "行く": "n5", "来る": "n5", "見る": "n5", "食べる": "n5",
    "チョコ": "n5", "チョコレート": "n5",
    "です": "n5", "ます": "n5", "だ": "n5", "た": "n5", "て": "n5",
    "世界": "n4", "自分": "n4", "問題": "n4", "場所": "n4",
    "経験": "n3", "関係": "n3", "状況": "n3", "情報": "n3",
    "可能": "n2", "存在": "n2", "結果": "n2", "原因": "n2",
    "概念": "n1", "本質": "n1", "矛盾": "n1",
}


def jlpt_of(rank: int | None, lemma: str = "", reading: str = "", surface: str = "") -> str | None:
    """Map lemma / reading / surface / freq rank → jlpt band string (n5…n1), or None if unknown."""
    if not _loaded:
        load_freq()

    # 1. Check curated high-priority dictionary
    for k in (lemma, surface, reading):
        if k and k in _COMMON_JLPT_WORDS:
            return _COMMON_JLPT_WORDS[k]

    # 2. Check loaded comprehensive JLPT dataset (14,000+ words)
    candidates = [lemma, surface, reading]
    if reading:
        candidates.append(_kata_to_hira(reading))
    for cand in candidates:
        if cand and cand in _jlpt:
            return _jlpt[cand]

    # 3. Fallback to frequency rank if available
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
