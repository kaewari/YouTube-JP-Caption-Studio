"""Caption-fetch fallback endpoint: mirrors the extension's proven YouTube flow.

Strategy (stdlib urllib only):
  1) ANDROID innertube /player -> captionTracks -> fetch track (srv XML or json3)
  2) watch HTML -> ytInitialPlayerResponse (brace-match) -> same track logic
"""

from __future__ import annotations

import json
import os
import re
import ssl
import time
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.cache import LRUCache
from app.utils.logging_utils import append_errors_log

router = APIRouter()

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
_TIMEOUT = 10

# Successful caption fetches are stable per (video, lang) — serve repeats from
# memory instead of re-hitting YouTube (which throttles bursts per-IP).
_cues_cache: LRUCache[tuple[str, list[dict[str, Any]]]] = LRUCache(256)
_CACHE_TTL_S = 600


def _ssl_context() -> ssl.SSLContext:
    """python.org builds ship no CA bundle; fall back to the system one."""
    if os.environ.get("SSL_CERT_FILE"):
        return ssl.create_default_context()
    for path in ("/etc/ssl/cert.pem", "/opt/homebrew/etc/ca-certificates/cert.pem"):
        if os.path.exists(path):
            return ssl.create_default_context(cafile=path)
    return ssl.create_default_context()


def _http(url: str, *, method: str = "GET", body: dict[str, Any] | None = None) -> bytes:
    data = json.dumps(body).encode() if body is not None else None
    last: Exception = RuntimeError("unreachable")
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                method=method,
                headers={"User-Agent": _UA, **({"Content-Type": "application/json"} if data else {})},
            )
            with urllib.request.urlopen(req, timeout=_TIMEOUT, context=_ssl_context()) as resp:
                status = getattr(resp, "status", resp.getcode())
                # HTTP errors are throttle/blocks — retrying cannot help.
                if status >= 400:
                    raise ValueError(f"HTTP {status} for {url}")
                return resp.read()
        except (ValueError, urllib.error.HTTPError):
            # HTTPError is not a ValueError subclass — must be listed explicitly
            # or the retry loop below re-fires a 429 three times with backoff.
            raise
        except Exception as exc:  # ponytail: transient SSL read timeouts on timedtext; retry 3x linear backoff
            last = exc
            time.sleep(0.5 * (attempt + 1))
    raise last


def _pick_track(tracks: list[dict[str, Any]], lang: str) -> dict[str, Any] | None:
    """Exact languageCode, then base-language prefix, else first."""
    for t in tracks:
        if t.get("languageCode") == lang:
            return t
    base = lang.split("-")[0]
    for t in tracks:
        if str(t.get("languageCode", "")).startswith(base + "-"):
            return t
    # ponytail: falls back to first track when lang has no match; tighten once
    # the extension reports which languages it actually accepts.
    return tracks[0] if tracks else None


def _cues_from_tracks(player_response: dict[str, Any], lang: str) -> list[dict[str, Any]]:
    """Fetch best caption track and normalize to cues; [] when no captions."""
    tracks = (
        player_response.get("captions", {})
        .get("playerCaptionsTracklistRenderer", {})
        .get("captionTracks", [])
    )
    track = _pick_track(tracks, lang)
    if not track or not track.get("baseUrl"):
        return []
    url = track["baseUrl"]
    raw = _http(url)
    cues = _parse_srv_xml(raw)
    if not cues:
        cues = _parse_json3(raw)
    return cues


def _parse_srv_xml(raw: bytes) -> list[dict[str, Any]]:
    """srv1 (<text start dur>) and srv3 (<p t d><s>)."""
    root = ET.fromstring(raw)
    cues: list[dict[str, Any]] = []
    for i, el in enumerate(root.iter()):
        if el.tag == "text":
            start = int(float(el.get("start", "0")) * 1000)
            dur = int(float(el.get("dur", "0")) * 1000)
            text = "".join(el.itertext())
        elif el.tag == "p":
            start = int(el.get("t", "0"))
            dur = int(el.get("d", "0"))
            text = "".join(el.itertext())
        else:
            continue
        text = text.strip()
        if not text:
            continue
        cues.append({"id": f"{start}-{len(cues)}", "start": start, "duration": dur, "text": text})
    return cues


def _parse_json3(raw: bytes) -> list[dict[str, Any]]:
    """fmt=json3 events with tStartMs/dDurationMs/segs[].utf8."""
    data = json.loads(raw)
    cues: list[dict[str, Any]] = []
    for ev in data.get("events", []):
        if "tStartMs" not in ev or not ev.get("segs"):
            continue
        text = "".join(seg.get("utf8", "") for seg in ev["segs"]).strip()
        if not text:
            continue
        start = int(ev["tStartMs"])
        dur = int(ev.get("dDurationMs", 0))
        cues.append({"id": f"{start}-{len(cues)}", "start": start, "duration": dur, "text": text})
    return cues


def _player_response_from_watch_html(video_id: str) -> dict[str, Any]:
    html = _http(f"https://www.youtube.com/watch?v={video_id}").decode("utf-8", "replace")
    marker = "ytInitialPlayerResponse = "
    idx = html.find(marker)
    if idx == -1:
        raise ValueError("ytInitialPlayerResponse not found in watch HTML")
    depth = 0
    start = idx + len(marker)
    end = start
    for pos, ch in enumerate(html[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = pos + 1
                break
    else:
        raise ValueError("unbalanced braces in ytInitialPlayerResponse")
    return json.loads(html[start:end])


def fetch_captions(video_id: str, lang: str) -> tuple[str, list[dict[str, Any]]]:
    """Returns (via, cues); raises ValueError with a short reason on failure."""
    android_body = {
        "context": {
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "20.10.38",
                "androidSdkVersion": 30,
                "hl": "ja",
                "gl": "JP",
            }
        },
        "videoId": video_id,
        "contentCheckOk": True,
        "racyCheckOk": True,
    }
    try:
        player = json.loads(
            _http(
                "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
                method="POST",
                body=android_body,
            )
        )
        cues = _cues_from_tracks(player, lang)
        if cues:
            return "android", cues
    except ValueError:
        raise
    except Exception:
        pass  # ponytail: any android-path failure silently falls through to watch_html

    player = _player_response_from_watch_html(video_id)
    cues = _cues_from_tracks(player, lang)
    if not cues:
        raise ValueError(f"no captions for {video_id} lang={lang}")
    return "watch_html", cues


@router.get("/captions/{video_id}")
def get_captions(video_id: str, lang: str = "ja") -> Any:
    cache_key = f"{video_id}|{lang}"
    cached = _cues_cache.get(cache_key)
    if cached and time.time() - cached[0] < _CACHE_TTL_S:
        via, cues = cached[1]
        return {
            "ok": True,
            "video_id": video_id,
            "lang": lang,
            "count": len(cues),
            "via": f"{via}·cached",
            "cues": cues,
        }
    try:
        via, cues = fetch_captions(video_id, lang)
    except Exception as exc:
        detail = f"{type(exc).__name__}: {exc}"
        append_errors_log("WARNING", f"/captions/{video_id} miss: {detail}")
        return JSONResponse(status_code=502, content={"ok": False, "detail": detail})
    _cues_cache.set(cache_key, (time.time(), (via, cues)))
    return {
        "ok": True,
        "video_id": video_id,
        "lang": lang,
        "count": len(cues),
        "via": via,
        "cues": cues,
    }
