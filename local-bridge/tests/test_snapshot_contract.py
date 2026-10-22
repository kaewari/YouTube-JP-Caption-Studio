"""Snapshot v1 vocab contract: `status` carries the vocabulary state, `meaning`
carries the gloss. Before the split both used `meaning`, so the extension's status
overwrote the iPad's gloss and the iPad's gloss was read back as a status.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.snapshot import apply_snapshot, encode_snapshot  # noqa: E402


def test_encode_keeps_the_status_out_of_the_meaning_field() -> None:
    snap = encode_snapshot(user_vocab={"猫": "known", "犬": "ignored"})
    by_word = {v["word"]: v for v in snap["vocab"]}
    assert by_word["猫"]["status"] == "known"
    assert by_word["犬"]["status"] == "ignored"
    assert by_word["猫"]["meaning"] == "", "the bridge has no gloss; it must not borrow the meaning slot"


def test_apply_reads_the_status_field_first() -> None:
    res = apply_snapshot({"version": 1, "vocab": [
        {"word": "猫", "meaning": "con mèo", "status": "known"},
    ]})
    assert res["userVocab"] == {"猫": "known"}


def test_apply_honours_a_legacy_status_in_meaning() -> None:
    """Snapshots written before the split stored the status in `meaning`."""
    res = apply_snapshot({"version": 1, "vocab": [{"word": "猫", "meaning": "learning"}]})
    assert res["userVocab"] == {"猫": "learning"}


def test_apply_does_not_read_an_ios_gloss_as_a_status() -> None:
    """iOS writes Vietnamese glosses into `meaning`; they are not vocabulary states."""
    res = apply_snapshot({"version": 1, "vocab": [{"word": "猫", "meaning": "con mèo"}]})
    assert res["userVocab"] == {"猫": "learning"}, "an unknown gloss must not become a status"


def test_round_trip_preserves_every_status() -> None:
    source = {"猫": "known", "犬": "learning", "鳥": "ignored", "魚": "special", "虫": ""}
    res = apply_snapshot(encode_snapshot(user_vocab=source))
    assert res["userVocab"] == {
        "猫": "known", "犬": "learning", "鳥": "ignored", "魚": "special", "虫": "learning",
    }, "an empty status degrades to learning, the rest survive"


def test_encode_still_parses_as_snapshot_v1() -> None:
    snap = encode_snapshot(user_vocab={"猫": "known"})
    assert snap["version"] == 1
    assert snap["scripts"] == [], "the iPad decoder still expects scripts[]"
    assert isinstance(snap["updatedAt"], str) and snap["updatedAt"]
