#!/usr/bin/env python3
"""DATA-01: Build and catalog Gold set fixtures for 5 @parako videos."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "local-bridge"))

from app.api.captions import fetch_captions

PARAKO_VIDEOS = [
    {
        "videoId": "ylnxFdPhLCo",
        "title": "ドライブで本音トークするやつ",
        "url": "https://www.youtube.com/watch?v=ylnxFdPhLCo",
        "category": "drive_dialogue",
        "keyExcerpts": [
            {"time": "1:00-1:09", "note": "乗せて + ないんですか？ (broken sentence across cues)"},
            {"time": "1:09-1:18", "note": "どこ + 行くんですか？ (question split across cues)"},
        ],
    },
    {
        "videoId": "MNGOykySDto",
        "title": "身体測定で見栄はりすぎるやつ",
        "url": "https://www.youtube.com/watch?v=MNGOykySDto",
        "category": "classroom_comedy",
        "keyExcerpts": [
            {"time": "0:00-0:10", "note": "身体測定って気合い入るよな (school comedy dialogue)"},
        ],
    },
    {
        "videoId": "H3p-NUAaaB8",
        "title": "不思議の国編 総集編",
        "url": "https://www.youtube.com/watch?v=H3p-NUAaaB8",
        "category": "long_story_arc",
        "keyExcerpts": [
            {"time": "0:06-0:15", "note": "なんでもない日。おめでとう。 (fast dialogue arc)"},
        ],
    },
    {
        "videoId": "fYSHkuI8t-k",
        "title": "どっかで見たことあるやつしかいないクラス",
        "url": "https://www.youtube.com/watch?v=fYSHkuI8t-k",
        "category": "rapid_speech",
        "keyExcerpts": [
            {"time": "0:00-0:10", "note": "おはようはえ教室間違えてない (rapid greeting without punctuation)"},
        ],
    },
    {
        "videoId": "2GjTe4uQyX8",
        "title": "野生の動物が荒らしたやつ",
        "url": "https://www.youtube.com/watch?v=2GjTe4uQyX8",
        "category": "exclamatory_banter",
        "keyExcerpts": [
            {"time": "0:00-0:10", "note": "上下段荒れてる本当だ野生の動物が (exclamation dialogue)"},
        ],
    },
]


def main() -> None:
    dest_dir = ROOT / "testdata" / "sentence-mvp"
    dest_dir.mkdir(parents=True, exist_ok=True)
    manifest = []

    for item in PARAKO_VIDEOS:
        vid = item["videoId"]
        via, cues = fetch_captions(vid, "ja")
        raw_json = json.dumps(cues, ensure_ascii=False, indent=2)
        sha256 = hashlib.sha256(raw_json.encode("utf-8")).hexdigest()

        fixture_file = dest_dir / f"parako-{vid}-cues.json"
        fixture_file.write_text(raw_json, encoding="utf-8")

        entry = {
            **item,
            "transport": via,
            "cueCount": len(cues),
            "sha256": sha256,
            "fixturePath": f"testdata/sentence-mvp/parako-{vid}-cues.json",
            "firstCue": cues[0] if cues else None,
            "lastCue": cues[-1] if cues else None,
        }
        manifest.append(entry)
        print(f"[{vid}] {item['title']}: {len(cues)} cues saved -> {fixture_file.name}")

    manifest_file = dest_dir / "parako-5-videos-manifest.json"
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nManifest written with {len(manifest)} videos to {manifest_file.name}")


if __name__ == "__main__":
    main()
