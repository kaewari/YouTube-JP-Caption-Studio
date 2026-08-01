"""Self-check parity test for SQLite-backed dictionary.py."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# Add local-bridge to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dictionary import lookup

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_parity")


def main() -> None:
    words = ["猫", "ゴミ", "あいつ", "学校", "本", "食べる", "nonexistentword12345"]
    for w in words:
        res = lookup(w)
        logger.info("Lookup '%s': found=%s, matched='%s', reading='%s', senses_count=%d", 
                    w, res.found, res.matched, res.reading, len(res.senses))
        if res.found:
            for i, s in enumerate(res.senses[:2]):
                logger.info("   sense %d: reading='%s', gloss_vi=%s, gloss_en=%s", 
                            i, s.reading, s.gloss_vi, s.gloss_en)

    # Specific assertions
    assert lookup("猫").found, "猫 should be found"
    assert lookup("ゴミ").found, "ゴミ should be found"
    assert lookup("あいつ").found, "あいつ should be found"
    assert not lookup("nonexistentword12345").found, "nonexistent word should not be found"
    print("\n✅ Parity test passed successfully!")


if __name__ == "__main__":
    main()
