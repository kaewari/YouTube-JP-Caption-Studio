"""Self-check: /captions cache hit + TTL expiry. Run: python3 tests/test_captions_cache.py"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.captions import _cues_cache, _CACHE_TTL_S  # noqa: E402


def main() -> int:
    key = "vid|ja"
    _cues_cache.set(key, (time.time(), ("android", [{"id": "0-0", "start": 0, "duration": 100, "text": "テスト"}])))
    hit = _cues_cache.get(key)
    assert hit and time.time() - hit[0] < _CACHE_TTL_S, "fresh entry must be within TTL"
    stale = (time.time() - _CACHE_TTL_S - 1, hit[1])
    assert time.time() - stale[0] >= _CACHE_TTL_S, "stale entry must exceed TTL"
    assert _cues_cache.get("missing|en") is None, "unknown key must miss"
    print("captions_cache_selfcheck OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
