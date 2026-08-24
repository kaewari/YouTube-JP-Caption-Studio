"""Captions fallback endpoint: parser unit tests + optional live network check.

Run from local-bridge (system python3 has fastapi+httpx; venv symlink is broken):
  PYTHONPATH=. python3 tests/test_captions_api.py

Offline-safe: only parsers run without network; live tests skip gracefully.
"""

from __future__ import annotations

import ssl
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.api.captions import (  # noqa: E402
    _cues_from_tracks,
    _parse_json3,
    _parse_srv_xml,
    _pick_track,
    fetch_captions,
)


def _network_available() -> bool:
    """Probe with the same CA fallback the endpoint uses (python.org builds
    ship no CA bundle, so a bare urlopen probe always fails SSL)."""
    for cafile in ("/etc/ssl/cert.pem", "/opt/homebrew/etc/ca-certificates/cert.pem", None):
        try:
            ctx = ssl.create_default_context(cafile=cafile)
            urllib.request.urlopen("https://www.youtube.com", timeout=5, context=ctx).close()
            return True
        except Exception:
            continue
    return False

SRV1 = b"""<?xml version="1.0" encoding="utf-8"?>
<transcript>
  <text start="12.34" dur="2.5">\xe3\x81\x93\xe3\x82\x93\xe3\x81\xab\xe3\x81\xa1\xe3\x81\xaf</text>
  <text start="15.0" dur="1.25">\xe4\xb8\x96\xe7\x95\x8c &amp; \xe3\x81\xbf\xe3\x82\x93\xe3\x81\xaa</text>
</transcript>
"""

SRV3 = b"""<?xml version="1.0" encoding="utf-8"?>
<timedtext format="3">
  <body>
    <p t="1234" d="5678"><s>\xe3\x83\x86\xe3\x82\xb9\xe3\x83\x88</s><s>\xe3\x81\xa7\xe3\x81\x99</s></p>
    <p t="8000" d="1500"><s>\xe4\xba\x8c\xe8\xa1\x8c\xe7\x9b\xae</s></p>
  </body>
</timedtext>
"""

JSON3 = b"""{"events": [
  {"tStartMs": 1000, "dDurationMs": 2500,
   "segs": [{"utf8": "hello "}, {"utf8": "world"}]},
  {"tStartMs": 5000, "dDurationMs": 1000, "segs": [{"utf8": "second"}]},
  {"aAppend": 1, "segs": [{"utf8": "rolling"}]},
  {"tStartMs": 9000}
]}"""


def test_srv1_parsing() -> None:
    cues = _parse_srv_xml(SRV1)
    assert cues == [
        {"id": "12340-0", "start": 12340, "duration": 2500, "text": "こんにちは"},
        {"id": "15000-1", "start": 15000, "duration": 1250, "text": "世界 & みんな"},
    ], cues


def test_srv3_parsing() -> None:
    cues = _parse_srv_xml(SRV3)
    assert cues == [
        {"id": "1234-0", "start": 1234, "duration": 5678, "text": "テストです"},
        {"id": "8000-1", "start": 8000, "duration": 1500, "text": "二行目"},
    ], cues


def test_json3_parsing() -> None:
    cues = _parse_json3(JSON3)
    assert cues == [
        {"id": "1000-0", "start": 1000, "duration": 2500, "text": "hello world"},
        {"id": "5000-1", "start": 5000, "duration": 1000, "text": "second"},
    ], cues


def test_pick_track_prefers_exact_then_prefix() -> None:
    tracks = [
        {"languageCode": "en", "baseUrl": "u-en"},
        {"languageCode": "ja-JP", "baseUrl": "u-jaJP"},
        {"languageCode": "ko", "baseUrl": "u-ko"},
    ]
    assert _pick_track(tracks, "ja")["baseUrl"] == "u-jaJP"
    assert _pick_track(tracks, "ja-JP")["baseUrl"] == "u-jaJP"
    assert _pick_track(tracks, "en-US")["baseUrl"] == "u-en"
    assert _pick_track([], "ja") is None


def test_cues_from_tracks_no_captions() -> None:
    assert _cues_from_tracks({"captions": {"playerCaptionsTracklistRenderer": {}}}, "ja") == []
    assert _cues_from_tracks({}, "ja") == []


def test_live_ja_android() -> None:
    via, cues = fetch_captions("oqPcaOYwZ_4", "ja")
    assert via in ("android", "watch_html"), via
    assert len(cues) > 0, "expected ja cues"
    assert all(isinstance(c["start"], int) and isinstance(c["duration"], int) for c in cues)


def test_live_en_watch_html() -> None:
    via, cues = fetch_captions("neHAJF19YXY", "en")
    assert via in ("android", "watch_html"), via
    assert len(cues) > 0, "expected en cues"


def main() -> None:
    test_srv1_parsing()
    test_srv3_parsing()
    test_json3_parsing()
    test_pick_track_prefers_exact_then_prefix()
    test_cues_from_tracks_no_captions()
    print("[test_captions_api] offline parsers ok")
    if _network_available():
        test_live_ja_android()
        test_live_en_watch_html()
        print("[test_captions_api] live network ok")
    else:
        print("[test_captions_api] no network — live tests skipped")


if __name__ == "__main__":
    main()
