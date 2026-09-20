#!/usr/bin/env python3
"""Build data/dict/jlpt_vocab.json from OpenJLPT (N5..N1 vocabulary).

Fetches official vocabulary datasets for N5, N4, N3, N2, N1, maps each word and reading,
and writes a consolidated dictionary { word_or_reading: "n5"|"n4"|"n3"|"n2"|"n1" }.
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "dict" / "jlpt_vocab.json"

LEVELS = ("n5", "n4", "n3", "n2", "n1")
BASE_URL = "https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab"

# Additional common particles, copulas, and auxiliary words known in JLPT N5/N4
_EXTRA_JLPT = {
    # N5 particles & copulas
    "は": "n5", "が": "n5", "を": "n5", "に": "n5", "へ": "n5", "で": "n5",
    "と": "n5", "も": "n5", "から": "n5", "まで": "n5", "より": "n5",
    "の": "n5", "よ": "n5", "ね": "n5", "わ": "n5", "か": "n5",
    "です": "n5", "だ": "n5", "ます": "n5", "た": "n5", "て": "n5",
    "ない": "n5", "ある": "n5", "いる": "n5", "する": "n5", "なる": "n5",
    "これ": "n5", "それ": "n5", "あれ": "n5", "どれ": "n5",
    "ここ": "n5", "そこ": "n5", "あそこ": "n5", "どこ": "n5",
    "この": "n5", "その": "n5", "あの": "n5", "どの": "n5",
    "こう": "n5", "そう": "n5", "ああ": "n5", "どう": "n5",
    "私": "n5", "わたし": "n5", "わたくし": "n5", "僕": "n5", "ぼく": "n5", "俺": "n5", "おれ": "n5",
    "あなた": "n5", "あんた": "n5", "彼": "n5", "かれ": "n5", "彼女": "n5", "かのじょ": "n5",
    "誰": "n5", "だれ": "n5", "何": "n5", "なに": "n5", "なん": "n5",
    "いつ": "n5", "いくら": "n5", "いくつ": "n5",
    "ご飯": "n5", "ごはん": "n5", "美味しい": "n5", "おいしい": "n5",
    "ありがとう": "n5", "ありがとうございます": "n5", "すみません": "n5",
    "おはよう": "n5", "こんにちは": "n5", "こんばんは": "n5", "さようなら": "n5",
    "はい": "n5", "いいえ": "n5", "うん": "n5", "ううん": "n5",
    "とても": "n5", "たくさん": "n5", "少し": "n5", "すこし": "n5", "ちょっと": "n5",
    "もう": "n5", "まだ": "n5", "いつも": "n5", "よく": "n5", "すぐ": "n5",
    "日本": "n5", "にほん": "n5", "にっぽん": "n5", "日本語": "n5", "にほんご": "n5",
    # Common N4 words
    "自分": "n4", "じぶん": "n4", "世界": "n4", "せかい": "n4", "問題": "n4", "もんだい": "n4",
    "場所": "n4", "ばしょ": "n4", "理由": "n4", "りゆう": "n4", "方法": "n4", "ほうほう": "n4",
    # Common N3 words
    "関係": "n3", "かんけい": "n3", "状況": "n3", "じょうきょう": "n3",
    "情報": "n3", "じょうほう": "n3", "経験": "n3", "けいけん": "n3",
    "必要": "n3", "ひつよう": "n3", "複雑": "n3", "ふくざつ": "n3",
}


def build() -> dict[str, str]:
    jlpt_map: dict[str, str] = {}

    # Priority order: N5 first (most basic), then N4, N3, N2, N1
    # If a word is already in N5, do not overwrite with N1.
    for lvl in LEVELS:
        url = f"{BASE_URL}/{lvl}.json"
        print(f"Fetching {lvl} from {url}...")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            items = json.loads(resp.read().decode("utf-8"))
            print(f"  {lvl}: {len(items)} items")
            for it in items:
                w = str(it.get("word") or "").strip()
                r = str(it.get("reading") or "").strip()
                if w and w not in jlpt_map:
                    jlpt_map[w] = lvl
                if r and r not in jlpt_map:
                    jlpt_map[r] = lvl

    for k, v in _EXTRA_JLPT.items():
        # Extra high-frequency words take priority or fill gaps
        if k not in jlpt_map or LEVELS.index(v) < LEVELS.index(jlpt_map[k]):
            jlpt_map[k] = v

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(jlpt_map, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Successfully wrote {len(jlpt_map)} entries to {OUT}")
    return jlpt_map


if __name__ == "__main__":
    build()
