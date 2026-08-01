"""EN→VI gloss bridge (VNEDICT inverted) — no MT."""

from __future__ import annotations

from pathlib import Path

from import_en_vi import EN_VI_JSON, ensure_en_vi, parse_vnedict_text
import dictionary as d


def test_parse_vnedict_primary_senses():
    sample = """
# comment
ăn : (1) to eat (away at); (2) to cost
miệng : mouth, opening
mặt : (1) right; (2) face, surface; (3) side
"""
    idx = parse_vnedict_text(sample)
    assert "ăn" in idx["eat"]
    assert "miệng" in idx["mouth"]
    assert "mặt" in idx["face"]


def test_ensure_and_bridge_lookup():
    assert ensure_en_vi() >= 5000
    assert EN_VI_JSON.exists()
    d._loaded = False
    d.load_dictionary()
    assert len(d._en_vi) >= 5000
    assert "ăn" in d._vi_from_en_glosses(["to eat"])
    assert "mặt" in d._vi_from_en_glosses(["face"])
    # Seed still wins for curated JA
    r = d.lookup("食べる")
    assert r.found and r.senses and "ăn" in r.senses[0].gloss_vi


if __name__ == "__main__":
    test_parse_vnedict_primary_senses()
    test_ensure_and_bridge_lookup()
    print("ok", Path(__file__).name)
