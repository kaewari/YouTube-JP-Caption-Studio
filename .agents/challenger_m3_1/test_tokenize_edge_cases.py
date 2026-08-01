"""Edge case empirical test harness for local-bridge tokenize_ja.py."""

import sys
from pathlib import Path

# Add local-bridge to sys.path
BRIDGE_DIR = Path(__file__).resolve().parent.parent.parent / "local-bridge"
sys.path.insert(0, str(BRIDGE_DIR))

from tokenize_ja import load_tokenizer, tokenize, furigana_line

def run_tests():
    print("--- Initializing Tokenizer ---")
    loaded = load_tokenizer()
    print(f"Tokenizer loaded: {loaded}")

    test_cases = [
        ("Empty String", ""),
        ("Whitespace Spaces", "   "),
        ("Whitespace Newlines", "\n\t  \r\n"),
        ("Duplicate Repeating Words 1", "東京東京"),
        ("Duplicate Repeating Words 2", "東京 東京 東京"),
        ("Repeating Single Kanji", "人人人人人人"),
        ("Long Repeating Pattern", "東京" * 20),
        ("English Only", "Hello World, this is a test!"),
        ("Mixed EN + JA", "Hello 日本語 World"),
        ("Vietnamese Only", "Tôi học tiếng Nhật mỗi ngày"),
        ("Mixed VI + JA", "Học 日本語 rất vui"),
        ("Numbers and ASCII Punctuation", "12345 !@#$%^&*() 67890"),
        ("Kanji + Digits", "2026年7月29日"),
        ("Emojis + JA", "こんにちは！😊🌸🚀"),
        ("Half-width Katakana", "ﾃｽﾄ"),
        ("Full-width Romaji/Numbers", "１２３ＡＢＣ"),
        ("HTML Tags", "<b>日本語</b> <i>text</i>"),
        ("Null Byte", "テスト\0nul"),
        ("Surrogate Pairs / Rare Kanji", "𠮷野家𩸽"),
        ("Grammar Conjugations", "食べられなかった"),
        ("Long Text (10,000 chars)", "日本語を勉強するのが楽しいです。" * 625),
    ]

    print("\n--- Running Tokenization Tests ---")
    results = []
    for name, text in test_cases:
        try:
            tokens = tokenize(text)
            furi = furigana_line(text, tokens)
            
            # Sanity checks on output tokens
            start_end_ok = True
            pos_ok = True
            for t in tokens:
                if t.start < 0 or t.end > len(text) or t.start > t.end:
                    start_end_ok = False
                if not isinstance(t.pos, str):
                    pos_ok = False
            
            status = "PASS" if (start_end_ok and pos_ok) else "FAIL"
            res_summary = {
                "name": name,
                "status": status,
                "input_len": len(text),
                "token_count": len(tokens),
                "sample_tokens": [
                    {
                        "surface": t.surface,
                        "reading": t.reading,
                        "lemma": t.lemma,
                        "start": t.start,
                        "end": t.end,
                        "pos": t.pos,
                        "jlpt": t.jlpt,
                        "freq_rank": t.freq_rank,
                    }
                    for t in tokens[:5] # first 5
                ],
                "furigana_sample": furi[:100],
            }
            results.append(res_summary)
            print(f"[{status}] {name} (len={len(text)}) -> {len(tokens)} tokens")
            if len(tokens) > 0 and len(text) <= 50:
                print(f"  Furigana: {furi}")
                for t in tokens:
                    print(f"    Token: surf={t.surface!r}, read={t.reading!r}, lemma={t.lemma!r}, range=[{t.start}:{t.end}], pos={t.pos!r}, jlpt={t.jlpt}, freq={t.freq_rank}")
        except Exception as exc:
            print(f"[FAIL] {name} raised exception: {exc}")
            results.append({"name": name, "status": "EXCEPT", "error": str(exc)})

    return results

if __name__ == "__main__":
    run_tests()
