#!/usr/bin/env python3
"""Build local-bridge/data/dict/freq_ja.json from FrequencyWords ja list.

Source: https://github.com/hermitdave/FrequencyWords (OpenSubtitles-derived).
Usage:
  curl -fsSL -o /tmp/ja_full.txt \\
    https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ja/ja_full.txt
  python3 scripts/build_freq_ja.py /tmp/ja_full.txt
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "local-bridge" / "data" / "dict" / "freq_ja.json"
MAX_RANK = 15000
# Skip pure punctuation / symbols / single latin digits
_SKIP = re.compile(r"^[\W\d_]+$", re.UNICODE)
_HAS_JA = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]")


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/ja_full.txt")
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT
    if not src.exists():
        raise SystemExit(f"missing frequency source: {src}")

    ranks: dict[str, int] = {}
    rank = 0
    for line in src.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if not parts:
            continue
        word = parts[0]
        if _SKIP.match(word) or not _HAS_JA.search(word):
            continue
        if word in ranks:
            continue
        rank += 1
        ranks[word] = rank
        if rank >= MAX_RANK:
            break

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(ranks, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out_path} ({len(ranks)} lemmas)")


if __name__ == "__main__":
    main()
