"""Unit tests for scripts/asr_benchmark.py.

Verifies:
- Japanese normalization invariant (NFKC, bracketed noise stripping, Latin lowercasing, prolonged mark preservation).
- Bug fix regression: Latin letters (A, M, S, etc.) are NOT stripped by character filtering.
- Dynamic programming Levenshtein distance accuracy.
- CER and Normalized CER calculations across all edge cases (empty strings, deletions, punctuation invariance).
- Process RSS memory measurement.
- Manifest evaluation runner over testdata/audio-gold/manifest.json.
"""

from pathlib import Path

import pytest

from scripts.asr_benchmark import (
    compute_cer,
    compute_cer_details,
    compute_normalized_cer,
    evaluate_windows,
    get_metal_peak_memory_bytes,
    get_process_rss_bytes,
    normalize_ja_text,
)


def levenshtein_distance(ref: str, hyp: str) -> int:
    """Edit distance from the production breakdown (subs + dels + insertions)."""
    details = compute_cer_details(ref, hyp)
    return details["substitutions"] + details["deletions"] + details["insertions"]


def test_normalize_ja_text_empty_and_none():
    """Empty and None inputs should return empty string."""
    assert normalize_ja_text(None) == ""
    assert normalize_ja_text("") == ""
    assert normalize_ja_text("   \n\t  ") == ""


def test_normalize_ja_text_brackets_and_noise():
    """Bracketed noise tokens (halfwidth and fullwidth) should be stripped."""
    assert normalize_ja_text("味ちけたら[音楽]です。") == "味ちけたらです"
    assert normalize_ja_text("ありがと(拍手)うございます[ため息]") == "ありがとうございます"
    assert normalize_ja_text("曲の終わり【音楽】です〔拍手〕") == "曲の終わりです"


def test_normalize_ja_text_iteration_mark():
    """Japanese kanji iteration mark 々 (\\u3005) must be preserved."""
    assert normalize_ja_text("時々佐々木様々色々な") == "時々佐々木様々色々な"
    assert normalize_ja_text("人々の日々の努力") == "人々の日々の努力"


def test_normalize_ja_text_latin_preservation():
    """Regression test: Latin characters (e.g., Apple Music, Spotify) must NOT be deleted."""
    # Prior buggy code deleted uppercase letters; ensure proper preservation & lowercasing
    raw = "AppleミッとかSpotifyとかで"
    norm = normalize_ja_text(raw)
    assert "apple" in norm
    assert "spotify" in norm
    assert norm == "appleミッとかspotifyとかで"


def test_normalize_ja_text_prolonged_sound_mark():
    """Katakana prolonged sound mark ー (\\u30FC) must be preserved."""
    assert normalize_ja_text("ありがとー") == "ありがとー"
    assert normalize_ja_text("スーパーマーケット") == "スーパーマーケット"


def test_normalize_ja_text_punctuation_and_whitespace():
    """Punctuation marks and whitespace must be stripped."""
    raw = "おはよう。 早え！ 教室間違えてない？"
    norm = normalize_ja_text(raw)
    assert norm == "おはよう早え教室間違えてない"


def test_normalize_ja_text_fullwidth_ascii():
    """Fullwidth ASCII characters and numbers must normalize to halfwidth via NFKC."""
    raw = "第１弾 Ａｐｐｌｅ"
    norm = normalize_ja_text(raw)
    assert norm == "第1弾apple"


def test_levenshtein_distance_basic():
    """Basic Levenshtein edit distance calculations."""
    assert levenshtein_distance("", "") == 0
    assert levenshtein_distance("abc", "abc") == 0
    assert levenshtein_distance("", "abc") == 3
    assert levenshtein_distance("abc", "") == 3
    assert levenshtein_distance("kitten", "sitting") == 3


def test_levenshtein_distance_japanese_homophones():
    """Levenshtein distance on Japanese kanji strings."""
    # 勘無料 (3 chars) vs 感無量 (3 chars): 勘 vs 感 (1 sub), 料 vs 量 (1 sub) -> dist = 2
    assert levenshtein_distance("勘無料", "感無量") == 2
    assert levenshtein_distance("どんな理由だよ。ああ、勘無料だよ。", "どんな理由だよ。ああ、感無量だよ。") == 2


def test_compute_cer_edge_cases():
    """Edge cases for Character Error Rate."""
    assert compute_cer("", "") == 0.0
    assert compute_cer("abc", "abc") == 0.0
    assert compute_cer("", "abc") == 1.0
    assert compute_cer("abc", "") == 1.0


def test_compute_cer_metric_values():
    """Test CER value calculation with substitutions and deletions."""
    ref = "感無量"
    hyp = "勘無料"
    # 2 substitutions / 3 reference chars = 0.6667
    cer = compute_cer(ref, hyp)
    assert abs(cer - (2.0 / 3.0)) < 1e-4


def test_compute_normalized_cer_punctuation_invariance():
    """Normalized CER should be 0.0 when differences are purely punctuation or whitespace."""
    ref = "おはよう。早え！教室間違えてない？"
    hyp = "おはようはえ教室間違えてない"
    # Notice: '早え' vs 'はえ' has 1 substitution, but punctuation is ignored
    raw_cer = compute_cer(ref, hyp)
    norm_cer = compute_normalized_cer(ref, hyp)

    # Raw CER penalizes the missing punctuation; Normalized CER evaluates only lexical text
    assert norm_cer < raw_cer

    # Pure punctuation difference
    assert compute_normalized_cer("おはよう。", "おはよう") == 0.0
    assert compute_normalized_cer("なんで？", "なんで") == 0.0


def test_get_process_rss_bytes():
    """Process RSS memory must return a positive integer."""
    rss = get_process_rss_bytes()
    assert isinstance(rss, int)
    assert rss > 0
    # Process memory should typically be at least 10 MB (10 * 1024 * 1024 bytes)
    assert rss > 10 * 1024 * 1024


def test_get_metal_peak_memory_bytes():
    """Metal peak memory should return None or an integer >= 0."""
    metal_mem = get_metal_peak_memory_bytes()
    if metal_mem is not None:
        assert isinstance(metal_mem, int)
        assert metal_mem >= 0


def test_evaluate_windows_manifest():
    """Evaluate windows on testdata/audio-gold/manifest.json."""
    manifest_path = Path("testdata/audio-gold/manifest.json")
    assert manifest_path.is_file()

    summary = evaluate_windows(manifest_path=manifest_path)
    assert summary["totalWindows"] == 20
    assert "baselineYouTube" in summary
    assert "meanRawCer" in summary["baselineYouTube"]
    assert "meanNormCer" in summary["baselineYouTube"]
    assert len(summary["windows"]) == 20

    # Test with simulated model predictions (correcting Window #6 homophone error)
    simulated_preds = {
        "gold-06": "どんな理由だよ。ああ、感無量だよ。"
    }
    summary_with_preds = evaluate_windows(
        manifest_path=manifest_path,
        predictions=simulated_preds,
    )
    # Production keys the per-model summaries by model name (modelEvaluations).
    assert "modelEvaluations" in summary_with_preds
    assert summary_with_preds["modelEvaluations"]["default"]["evaluatedWindows"] == 1
    # On Window #6, simulated prediction exactly matches reference -> norm CER = 0.0
    win6 = [w for w in summary_with_preds["windows"] if w["id"] == "gold-06"][0]
    assert win6["models"]["default"]["normCer"] == 0.0
    assert win6["ytNormCer"] > 0.0  # YouTube ASR had 勘無料 error
