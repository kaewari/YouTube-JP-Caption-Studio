"""Japanese lemma frequency ranks + assessment band samples."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.utils.text_utils import kata_to_hira

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
# A failed load must not be retried on every lookup (one log line per token),
# but an explicit reload (bootstrap) must be able to try again.
_load_failed = False

def is_loaded() -> bool:
    return _loaded


def load_freq(force: bool = False) -> bool:
    """Load the frequency + JLPT maps.

    `_loaded` is set only after a successful read. It used to be set before
    the files were even opened, so a broken freq_ja.json left the process
    "loaded" with an empty map and every rank/JLPT lookup returned None for
    the rest of the process lifetime. A failed load is not retried on every
    lookup (that would log once per token); pass force=True to try again.
    """
    global _freq, _jlpt, _loaded, _load_failed
    if _loaded:
        return True
    if _load_failed and not force:
        return False

    if FREQ_JSON.exists():
        try:
            raw = json.loads(FREQ_JSON.read_text(encoding="utf-8"))
            _freq = {str(k): int(v) for k, v in raw.items()}
            logger.info("Loaded freq map (%d lemmas)", len(_freq))
        except Exception as exc:
            logger.error("Failed to load freq map: %s", exc)
            _freq = {}
            _load_failed = True
            return False
    else:
        logger.error("freq map missing: %s", FREQ_JSON)
        _freq = {}
        _load_failed = True
        return False

    if JLPT_JSON.exists():
        try:
            raw_jlpt = json.loads(JLPT_JSON.read_text(encoding="utf-8"))
            _jlpt = {str(k): str(v).lower() for k, v in raw_jlpt.items()}
            logger.info("Loaded JLPT map (%d entries)", len(_jlpt))
        except Exception as exc:
            logger.error("Failed to load JLPT map: %s", exc)
            _jlpt = {}
    else:
        logger.error("JLPT map missing: %s", JLPT_JSON)
        _jlpt = {}

    _loaded = True
    _load_failed = False
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
        hira = kata_to_hira(reading)
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
    # From extension COMMON_JLPT_WORDS (single source of truth for curated
    # bands; kept equal by tests/test_jlpt_curated_parity.py):
    # --- N5 (191) ---
    "おはよう": "n5", "おはようございます": "n5", "こんにちは": "n5", "こんばんは": "n5", "さようなら": "n5", "じゃあ": "n5",
    "また": "n5", "ありがとう": "n5", "ありがとうございます": "n5", "すみません": "n5", "ごめんなさい": "n5", "どうぞ": "n5",
    "よろしく": "n5", "お願いします": "n5", "はい": "n5", "いいえ": "n5", "うん": "n5", "ううん": "n5", "ください": "n5",
    "くださる": "n5", "皆": "n5", "せんせい": "n5", "がくせい": "n5", "ともだち": "n5", "家族": "n5", "かぞく": "n5",
    "父": "n5", "母": "n5", "兄": "n5", "姉": "n5", "弟": "n5", "妹": "n5", "お父さん": "n5", "お母さん": "n5",
    "子供": "n5", "こども": "n5", "毎日": "n5", "まいにち": "n5", "朝": "n5", "あさ": "n5", "昼": "n5",
    "ひる": "n5", "夜": "n5", "よる": "n5", "晩": "n5", "ばん": "n5", "時間": "n5", "じかん": "n5", "時": "n5",
    "とき": "n5", "分": "n5", "ふん": "n5", "日": "n5", "月": "n5", "年": "n5", "週": "n5", "曜日": "n5",
    "今週": "n5", "来週": "n5", "先週": "n5", "今年": "n5", "来年": "n5", "去年": "n5", "1つ": "n5",
    "ひとつ": "n5", "一つ": "n5", "2つ": "n5", "ふたつ": "n5", "二つ": "n5", "3つ": "n5", "みっつ": "n5",
    "三つ": "n5", "4つ": "n5", "よっつ": "n5", "四つ": "n5", "5つ": "n5", "いつつ": "n5", "五つ": "n5",
    "一": "n5", "二": "n5", "三": "n5", "四": "n5", "五": "n5", "六": "n5", "七": "n5", "八": "n5",
    "九": "n5", "十": "n5", "百": "n5", "千": "n5", "万": "n5", "円": "n5", "にほんご": "n5", "英語": "n5",
    "えいご": "n5", "勉強": "n5", "べんきょう": "n5", "練習": "n5", "れんしゅう": "n5", "本": "n5", "ほん": "n5",
    "辞書": "n5", "じしょ": "n5", "話": "n5", "はなし": "n5", "いく": "n5", "くる": "n5", "帰る": "n5",
    "かえる": "n5", "みる": "n5", "見て": "n5", "見ます": "n5", "聞く": "n5", "きく": "n5", "聞いて": "n5",
    "聞きます": "n5", "たべる": "n5", "食べて": "n5", "食べます": "n5", "飲む": "n5", "のむ": "n5", "飲んで": "n5",
    "飲みます": "n5", "話す": "n5", "はなす": "n5", "話して": "n5", "話します": "n5", "言う": "n5", "いう": "n5",
    "言って": "n5", "言います": "n5", "思う": "n5", "おもう": "n5", "思って": "n5", "思います": "n5", "知る": "n5",
    "しる": "n5", "知って": "n5", "知っています": "n5", "分かる": "n5", "わかる": "n5", "分かって": "n5", "分かります": "n5",
    "して": "n5", "します": "n5", "読む": "n5", "よむ": "n5", "書く": "n5", "かく": "n5", "買う": "n5",
    "かう": "n5", "待つ": "n5", "まつ": "n5", "会う": "n5", "あう": "n5", "いい": "n5", "よい": "n5", "悪い": "n5",
    "わるい": "n5", "大きい": "n5", "おおきい": "n5", "小さい": "n5", "ちいさい": "n5", "新しい": "n5", "あたらしい": "n5",
    "古い": "n5", "ふるい": "n5", "多い": "n5", "おおい": "n5", "少ない": "n5", "すくない": "n5", "高い": "n5",
    "たかい": "n5", "安い": "n5", "やすい": "n5", "速い": "n5", "はやい": "n5", "遅い": "n5", "おそい": "n5",
    "美味しい": "n5", "おいしい": "n5", "面白い": "n5", "おもしろい": "n5", "楽しい": "n5", "たのしい": "n5", "嬉しい": "n5",
    "うれしい": "n5", "とても": "n5", "たくさん": "n5", "少し": "n5", "すこし": "n5",
    # --- N4 (77) ---
    "人間": "n4", "にんげん": "n4", "じぶん": "n4", "彼": "n4", "かれ": "n4", "彼女": "n4", "かのじょ": "n4",
    "秒": "n4", "ビデオ": "n4", "チャンネル": "n4", "テスト": "n4", "試験": "n4", "しけん": "n4", "会話": "n4",
    "かいわ": "n4", "くらい": "n4", "ぐらい": "n4", "素敵": "n4", "すてき": "n4", "週末": "n4", "しゅうまつ": "n4",
    "送る": "n4", "おくる": "n4", "始める": "n4", "はじめる": "n4", "終わる": "n4", "おわる": "n4", "続ける": "n4",
    "つづける": "n4", "考える": "n4", "かんがえる": "n4", "教える": "n4", "おしえる": "n4", "習う": "n4", "ならう": "n4",
    "覚える": "n4", "おぼえる": "n4", "忘れる": "n4", "わすれる": "n4", "手伝う": "n4", "てつだう": "n4", "働く": "n4",
    "はたらく": "n4", "大切": "n4", "たいせつ": "n4", "必要": "n4", "ひつよう": "n4", "簡単": "n4", "かんたん": "n4",
    "難しい": "n4", "むずかしい": "n4", "もっと": "n4", "本当に": "n4", "ほんとうに": "n4", "すごい": "n4", "すっごい": "n4",
    "せかい": "n4", "ばしょ": "n4", "質問": "n4", "しつもん": "n4", "もんだい": "n4", "答え": "n4", "こたえ": "n4",
    "理由": "n4", "りゆう": "n4", "意味": "n4", "いみ": "n4", "心": "n4", "こころ": "n4", "気持ち": "n4",
    "きもち": "n4", "生活": "n4", "せいかつ": "n4", "未来": "n4", "みらい": "n4", "過去": "n4", "かこ": "n4",
    # --- N3 (66) ---
    "動画": "n3", "どうが": "n3", "クリップ": "n3", "字幕": "n3", "じまく": "n3", "JLPT": "n3", "レベル": "n3",
    "最近": "n3", "さいきん": "n3", "出来事": "n3", "できごと": "n3", "最初": "n3", "さいしょ": "n3", "最後": "n3",
    "さいご": "n3", "是非": "n3", "ぜひ": "n3", "びっくり": "n3", "びっくりする": "n3", "驚く": "n3", "おどろく": "n3",
    "かなり": "n3", "非常に": "n3", "ひじょうに": "n3", "現在": "n3", "げんざい": "n3", "けいけん": "n3", "かんけい": "n3",
    "じょうきょう": "n3", "目的": "n3", "もくてき": "n3", "変化": "n3", "へんか": "n3", "自然": "n3", "しぜん": "n3",
    "社会": "n3", "しゃかい": "n3", "文化": "n3", "ぶんか": "n3", "歴史": "n3", "れきし": "n3", "伝統": "n3",
    "でんとう": "n3", "日常": "n3", "にちじょう": "n3", "様子": "n3", "ようす": "n3", "届ける": "n3", "とどける": "n3",
    "お届け": "n3", "おとどけ": "n3", "共有": "n3", "きょうゆう": "n3", "重要": "n3", "じゅうよう": "n3", "環境": "n3",
    "かんきょう": "n3", "技術": "n3", "ぎじゅつ": "n3", "じょうほう": "n3", "説明": "n3", "せつめい": "n3", "紹介": "n3",
    "しょうかい": "n3", "相談": "n3", "そうだん": "n3",
    # --- N2 (12) ---
    "かのう": "n2", "そんざい": "n2", "影響": "n2", "えいきょう": "n2", "効果": "n2", "こうか": "n2", "けっか": "n2",
    "げんいん": "n2", "瞬間": "n2", "しゅんかん": "n2", "現実": "n2", "げんじつ": "n2",
    # --- N1 (4) ---
    "がいねん": "n1", "ほんしつ": "n1", "むじゅん": "n1", "ありのまま": "n1",
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
        candidates.append(kata_to_hira(reading))
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
            return kata_to_hira(reading)

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
