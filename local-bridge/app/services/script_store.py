"""Per-video caption script persistence under data/subtitles/{videoId}/.

Files per video:
  cues.json   — cues WITHOUT tokens (+ embedded meta); rebuilt from script.txt on load
  tokens.json — {cueId: [token, ...]}; local only, never mirrored to Drive
  meta.json   — video_id/url/title/updated_at/cue_count/translated_count/owned/rev/deviceId
  script.txt  — canonical human-readable script (load source + written on save)
"""

from __future__ import annotations

import json
import logging
import math
import re
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Project root (repo root after flatten)
ROOT = Path(__file__).resolve().parent.parent.parent.parent
SCRIPTS_DIR = ROOT / "data" / "subtitles"
_DEVICE_ID_PATH = ROOT / "data" / "config" / "device_id.txt"

FILE_NAMES = ("cues.json", "meta.json", "script.txt")

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,64}$")
_TIME_TOKEN = r"\d+(?::\d{1,2})?(?:\.\d+)?"
_HEAD_RE = re.compile(
    rf"^\[(\d+(?:-\d+)?)\]\s+({_TIME_TOKEN})(?:\s*(?:→|->|–|—|-)\s*({_TIME_TOKEN}))?"
)
_device_id: str = ""


def _finite_time(value: Any, fallback: float = 0.0) -> float:
    """Coerce cue times to a finite float — NaN/Inf/None break JSON and sort order."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        v = fallback
    return v if math.isfinite(v) else fallback


def scripts_root() -> Path:
    SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    return SCRIPTS_DIR


def _safe_video_id(video_id: str) -> str:
    vid = (video_id or "").strip()
    if not _VIDEO_ID_RE.match(vid):
        raise ValueError(f"invalid video_id: {video_id!r}")
    return vid


def video_dir(video_id: str) -> Path:
    d = scripts_root() / _safe_video_id(video_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def device_id() -> str:
    """Stable id for this machine — Lamport tie-break, not identity."""
    global _device_id
    if _device_id:
        return _device_id
    try:
        _device_id = _DEVICE_ID_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        _device_id = ""
    if not _device_id:
        _device_id = f"pc-{uuid.uuid4().hex[:8]}"
        _atomic_write_text(_DEVICE_ID_PATH, _device_id)
    return _device_id


def _format_time_plain(sec: float) -> str:
    s = max(0.0, float(sec or 0.0))
    total = int(s)
    m, r = divmod(total, 60)
    frac = s - total
    if frac >= 0.05:
        return f"{m}:{r:02d}.{int(round(frac * 10))}"
    return f"{m}:{r:02d}"


def render_script_txt(
    cues: list[dict[str, Any]],
    *,
    video_id: str,
    url: str = "",
    title: str = "",
    tokens: dict[str, list[Any]] | None = None,
) -> str:
    # Avoid bare ===== lines — IDEs treat ======= as git conflict markers.
    # Cue separators keep 10+ dashes so import_parse.split(/-{10,}/) still works.
    lines: list[str] = [
        "# ----------------------------------------",
        "# Caption Script",
        f"video_id: {video_id}",
    ]
    if title:
        lines.append(f"title: {title}")
    if url:
        lines.append(f"URL: {url}")
    lines.append(f"Updated: {time.strftime('%Y-%m-%d %H:%M')}")
    lines.append("# ----------------------------------------")
    lines.append("")

    for i, cue in enumerate(cues or [], start=1):
        start = float(cue.get("start_media_time") or cue.get("start") or 0)
        end = float(cue.get("end_media_time") or cue.get("end") or start)
        source = str(cue.get("source") or cue.get("text") or "").strip()
        en = str(cue.get("en") or "").strip()
        vi = str(cue.get("vi") or "").strip()
        cue_tokens = cue.get("tokens")
        if not cue_tokens and tokens:
            cue_tokens = tokens.get(_token_key(cue, i - 1))
        furi = ""
        if isinstance(cue_tokens, list) and cue_tokens:
            parts = []
            for t in cue_tokens:
                if not isinstance(t, dict):
                    continue
                surf = str(t.get("surface") or "")
                reading = str(t.get("reading") or "")
                parts.append(f"{surf}({reading})" if reading else surf)
            furi = "".join(parts)

        lines.append(
            f"[{str(i).zfill(3)}] {_format_time_plain(start)} → {_format_time_plain(end)}"
        )
        # Always emit JA/EN/VI (empty allowed) so script.txt mirrors all columns.
        lines.append(f"JA: {source}" if source else "JA:")
        if furi:
            lines.append(f"    ({furi})")
        lines.append(f"EN: {en}" if en else "EN:")
        lines.append(f"VI: {vi}" if vi else "VI:")
        lines.append("")
        lines.append("# ----------------------------------------")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _parse_time_token(raw: str) -> float:
    """m:ss(.frac) or plain seconds — port of import_parse.parseTimeToken."""
    s = str(raw or "").strip().replace(",", ".")
    if not s:
        return float("nan")
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return float(s)
    m = re.fullmatch(r"(\d+):(\d{1,2})(?:\.(\d+))?", s)
    if not m:
        return float("nan")
    frac = float(f"0.{m.group(3)}") if m.group(3) else 0.0
    return int(m.group(1)) * 60 + int(m.group(2)) + frac


def parse_script_txt(text: str) -> list[dict[str, Any]]:
    """Port of extension import_parse.parseExportTxt — blocks -{10,}, head, JA/EN/VI."""
    out: list[dict[str, Any]] = []
    for block in re.split(r"-{10,}", str(text or "")):
        start = float("nan")
        end = float("nan")
        source = ""
        en: str | None = None
        vi: str | None = None

        def flush() -> None:
            nonlocal start, end, source, en, vi
            if not math.isfinite(start) and not source and en is None and vi is None:
                return
            if not math.isfinite(start) and not source:
                return
            out.append(
                {
                    "start_media_time": start if math.isfinite(start) else 0.0,
                    "end_media_time": (
                        end if math.isfinite(end) else (start if math.isfinite(start) else 0.0)
                    ),
                    "source": source,
                    "en": en if en is not None else "",
                    "vi": vi if vi is not None else "",
                }
            )

        for line in block.splitlines():
            t = line.strip()
            if not t:
                continue
            head = _HEAD_RE.match(t)
            if head:
                flush()
                start = _parse_time_token(head.group(2))
                end = _parse_time_token(head.group(3)) if head.group(3) else float("nan")
                source, en, vi = "", None, None
                continue
            if re.match(r"^JA:\s*", t, re.I):
                source = re.sub(r"^JA:\s*", "", t, count=1, flags=re.I)
                continue
            if re.match(r"^EN:\s*", t, re.I):
                en = re.sub(r"^EN:\s*", "", t, count=1, flags=re.I)
                continue
            if re.match(r"^VI:\s*", t, re.I):
                vi = re.sub(r"^VI:\s*", "", t, count=1, flags=re.I)
                continue
        flush()
    out.sort(
        key=lambda c: (
            float(c.get("start_media_time") or 0),
            float(c.get("end_media_time") or 0),
        )
    )
    return out


def _cue_content_sig(cues: list[dict[str, Any]]) -> list[tuple[Any, ...]]:
    return [
        (
            round(float(c.get("start_media_time") or c.get("start") or 0), 3),
            round(float(c.get("end_media_time") or c.get("end") or 0), 3),
            str(c.get("source") or c.get("text") or "").strip(),
            str(c.get("en") or "").strip(),
            str(c.get("vi") or "").strip(),
        )
        for c in cues
    ]


def _cues_from_txt(
    parsed: list[dict[str, Any]], old_cues: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Normalize TXT rows to cues.json shape; keep old ids by index when possible."""
    cleaned: list[dict[str, Any]] = []
    for i, c in enumerate(parsed):
        start = _finite_time(c.get("start_media_time") or 0)
        end = _finite_time(c.get("end_media_time") or start, start)
        source = str(c.get("source") or "").strip()
        en = str(c.get("en") or "")
        vi = str(c.get("vi") or "")
        old = old_cues[i] if i < len(old_cues) else {}
        cue_id = str(old.get("id") or "").strip() or f"{int(start * 1000)}-txt-{i}"
        cleaned.append(
            {
                "id": cue_id,
                "start_media_time": start,
                "end_media_time": end,
                "source": source,
                "en": en,
                "vi": vi,
                "translated": bool(en.strip() or vi.strip()),
                "text_source": "script",
                "mt_locked": bool(old.get("mt_locked")),
                "translation_source": str(old.get("translation_source") or ""),
            }
        )
    return cleaned


def _atomic_write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Unique tmp per write so concurrent save_script calls never share one .tmp.
    tmp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        tmp_path.write_text(content, encoding=encoding)
        tmp_path.replace(path)
    finally:
        tmp_path.unlink(missing_ok=True)


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except Exception as exc:
        logger.warning("Failed reading %s: %s", path, exc)
        return None


def _token_key(cue: dict[str, Any], index: int) -> str:
    """Cue id, or positional fallback for legacy cues saved without one."""
    return str(cue.get("id") or "").strip() or f"#{index}"


def _split_tokens(cues: list[dict[str, Any]]) -> dict[str, list[Any]]:
    """Pop `tokens` off each cue (mutates) → {cueId: tokens}."""
    tokens: dict[str, list[Any]] = {}
    for i, c in enumerate(cues):
        t = c.pop("tokens", None)
        if isinstance(t, list) and t:
            tokens[_token_key(c, i)] = t
    return tokens


def merge_tokens(
    cues: list[dict[str, Any]], tokens: dict[str, list[Any]]
) -> list[dict[str, Any]]:
    """Inverse of _split_tokens — used by script.txt render and tests."""
    for i, c in enumerate(cues):
        c["tokens"] = tokens.get(_token_key(c, i)) or []
    return cues


# Per-video serialization: concurrent saves (extension + app) must not interleave
# cues.json/tokens.json/meta.json/script.txt writes into mixed revisions.
_video_locks: dict[str, threading.Lock] = {}
_video_locks_guard = threading.Lock()


def _video_lock(video_id: str) -> threading.Lock:
    vid = _safe_video_id(video_id)
    with _video_locks_guard:
        lock = _video_locks.get(vid)
        if lock is None:
            lock = _video_locks[vid] = threading.Lock()
        return lock


def save_script(
    video_id: str,
    cues: list[dict[str, Any]],
    *,
    url: str = "",
    title: str = "",
    owned: bool | None = None,
    rev: int | None = None,
) -> dict[str, Any]:
    vid = _safe_video_id(video_id)
    with _video_lock(vid):
        return _save_script_locked(
            vid, cues, url=url, title=title, owned=owned, rev=rev
        )


def _save_script_locked(
    vid: str,
    cues: list[dict[str, Any]],
    *,
    url: str = "",
    title: str = "",
    owned: bool | None = None,
    rev: int | None = None,
) -> dict[str, Any]:
    folder = video_dir(vid)
    cleaned: list[dict[str, Any]] = []
    for c in cues or []:
        if not isinstance(c, dict):
            continue
        start = _finite_time(c.get("start_media_time") or c.get("start") or 0)
        end = _finite_time(c.get("end_media_time") or c.get("end") or start, start)
        source = str(c.get("source") or c.get("text") or "").strip()
        cue_id = str(c.get("id") or "").strip()
        text_source = str(c.get("text_source") or "yt")
        # Keep empty draft cues (manual + / timeline) — they have a stable id.
        if not source and not (c.get("vi") or c.get("en")):
            if not cue_id and text_source not in ("manual", "edit", "script"):
                continue
        cleaned.append(
            {
                "id": cue_id,
                "start_media_time": start,
                "end_media_time": end,
                "source": source,
                "en": str(c.get("en") or ""),
                "vi": str(c.get("vi") or ""),
                "tokens": c.get("tokens") if isinstance(c.get("tokens"), list) else [],
                "translated": bool(
                    c.get("translated")
                    or str(c.get("vi") or "").strip()
                    or str(c.get("en") or "").strip()
                ),
                "text_source": text_source,
                "mt_locked": bool(c.get("mt_locked")),
                "translation_source": str(c.get("translation_source") or ""),
            }
        )

    cues_path = folder / "cues.json"
    meta_path = folder / "meta.json"
    tokens_path = folder / "tokens.json"

    prev = _read_json(meta_path)
    prev = prev if isinstance(prev, dict) else {}
    new_tokens = _split_tokens(cleaned)
    old_tokens = _read_json(tokens_path)
    if isinstance(old_tokens, dict):
        # Callers may omit tokens (slim payload) — keep what we had, drop dead cues.
        live = {_token_key(c, i) for i, c in enumerate(cleaned)}
        new_tokens = {k: v for k, v in {**old_tokens, **new_tokens}.items() if k in live}

    meta = {
        "video_id": vid,
        "url": url or str(prev.get("url") or ""),
        "title": title or str(prev.get("title") or ""),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "cue_count": len(cleaned),
        "translated_count": sum(1 for c in cleaned if c.get("translated")),
        "owned": bool(prev.get("owned")) if owned is None else bool(owned),
        "rev": max(int(prev.get("rev") or 0), int(rev or 0)) + 1,
        "deviceId": device_id(),
    }

    cues_content = _dump({"video_id": vid, "cues": cleaned, "meta": meta})
    tokens_content = _dump(new_tokens)
    meta_content = _dump(meta)
    txt_content = render_script_txt(
        cleaned,
        video_id=vid,
        url=str(meta.get("url") or ""),
        title=str(meta.get("title") or ""),
        tokens=new_tokens,
    )

    # Atomic multi-file write: write all files to temporary files in target folder first.
    # Only replace final files once all temp files are successfully written.
    files_to_write = {
        cues_path: cues_content,
        tokens_path: tokens_content,
        meta_path: meta_content,
        folder / "script.txt": txt_content,
    }
    temp_files: list[tuple[Path, Path]] = []
    try:
        for final_path, content in files_to_write.items():
            tmp_path = final_path.with_name(f"{final_path.name}.{uuid.uuid4().hex}.tmp")
            tmp_path.write_text(content, encoding="utf-8")
            temp_files.append((tmp_path, final_path))
        for tmp_path, final_path in temp_files:
            tmp_path.replace(final_path)
    finally:
        for tmp_path, _ in temp_files:
            tmp_path.unlink(missing_ok=True)

    logger.info(
        "Saved script %s cues=%d translated=%d rev=%d → %s",
        vid,
        len(cleaned),
        meta["translated_count"],
        meta["rev"],
        folder,
    )
    return {
        "ok": True,
        "video_id": vid,
        "path": str(folder),
        "txt_path": str(folder / "script.txt"),
        "cue_count": len(cleaned),
        "translated_count": meta["translated_count"],
        "rev": meta["rev"],
    }


def load_tokens(video_id: str) -> dict[str, list[Any]]:
    """{cueId: [token, ...]} — empty when the video has none."""
    try:
        vid = _safe_video_id(video_id)
    except ValueError:
        return {}
    raw = _read_json(scripts_root() / vid / "tokens.json")
    return raw if isinstance(raw, dict) else {}


def load_script(video_id: str) -> dict[str, Any] | None:
    """Prefer script.txt when present; else cues.json. Cues WITHOUT tokens."""
    try:
        vid = _safe_video_id(video_id)
    except ValueError:
        return None
    folder = scripts_root() / vid
    cues_path = folder / "cues.json"
    meta_path = folder / "meta.json"
    txt_path = folder / "script.txt"

    # script.txt is the load source when it parses to ≥1 cue.
    if txt_path.is_file():
        try:
            parsed = parse_script_txt(txt_path.read_text(encoding="utf-8"))
        except OSError as exc:
            logger.warning("Failed reading %s: %s", txt_path, exc)
            parsed = []
        if parsed:
            old_raw = _read_json(cues_path)
            old_cues = (
                [c for c in old_raw["cues"] if isinstance(c, dict)]
                if isinstance(old_raw, dict) and isinstance(old_raw.get("cues"), list)
                else []
            )
            # TXT rewrite drops cue fields — migrate inline tokens before they vanish.
            if any("tokens" in c for c in old_cues):
                inline = _split_tokens([dict(c) for c in old_cues])
                if inline:
                    existing = load_tokens(vid)
                    _atomic_write_text(
                        folder / "tokens.json", _dump({**existing, **inline})
                    )
                    logger.info(
                        "load_script %s: rescued %d cue token lists before script.txt sync",
                        vid,
                        len(inline),
                    )
            prev = _read_json(meta_path)
            if not isinstance(prev, dict):
                prev = (
                    old_raw.get("meta")
                    if isinstance(old_raw, dict) and isinstance(old_raw.get("meta"), dict)
                    else {}
                )
            cues = _cues_from_txt(parsed, old_cues)
            changed = _cue_content_sig(cues) != _cue_content_sig(old_cues)
            translated_count = sum(
                1
                for c in cues
                if c.get("translated")
                or str(c.get("vi") or "").strip()
                or str(c.get("en") or "").strip()
            )
            meta = {
                "video_id": vid,
                "url": str(prev.get("url") or ""),
                "title": str(prev.get("title") or ""),
                "updated_at": (
                    time.strftime("%Y-%m-%dT%H:%M:%S")
                    if changed
                    else str(prev.get("updated_at") or "")
                ),
                "cue_count": len(cues),
                "translated_count": translated_count,
                "owned": bool(prev.get("owned")),
                "rev": int(prev.get("rev") or 0) + (1 if changed else 0),
                "deviceId": str(prev.get("deviceId") or device_id()),
            }
            _atomic_write_text(
                cues_path, _dump({"video_id": vid, "cues": cues, "meta": meta})
            )
            if changed or not meta_path.is_file():
                _atomic_write_text(meta_path, _dump(meta))
            if changed:
                logger.info(
                    "load_script %s: synced cues.json from script.txt (%d cues, rev=%d)",
                    vid,
                    len(cues),
                    meta["rev"],
                )
            return {
                "ok": True,
                "video_id": vid,
                "path": str(folder),
                "cues": cues,
                "meta": meta,
                "cue_count": len(cues),
                "translated_count": translated_count,
            }

    raw = _read_json(cues_path)
    cues = raw.get("cues") if isinstance(raw, dict) else None
    if not isinstance(cues, list):
        return None
    cues = [c for c in cues if isinstance(c, dict)]
    meta = raw.get("meta") if isinstance(raw.get("meta"), dict) else {}

    if any("tokens" in c for c in cues):
        inline = _split_tokens(cues)
        if inline:
            existing = load_tokens(vid)
            _atomic_write_text(folder / "tokens.json", _dump({**existing, **inline}))
        _atomic_write_text(cues_path, _dump({"video_id": vid, "cues": cues, "meta": meta}))
        logger.info("Migrated inline tokens out of %s (%d cues)", cues_path, len(inline))

    return {
        "ok": True,
        "video_id": vid,
        "path": str(folder),
        "cues": cues,
        "meta": meta,
        "cue_count": len(cues),
        "translated_count": sum(
            1
            for c in cues
            if c.get("translated")
            or str(c.get("vi") or "").strip()
            or str(c.get("en") or "").strip()
        ),
    }


def load_meta(video_id: str) -> dict[str, Any] | None:
    """Cheap freshness probe: {video_id, rev, deviceId, updated_at, cue_count, owned}."""
    try:
        vid = _safe_video_id(video_id)
    except ValueError:
        return None
    folder = scripts_root() / vid
    meta = _read_json(folder / "meta.json")
    if not isinstance(meta, dict):
        if not (folder / "cues.json").is_file():
            return None
        raw = _read_json(folder / "cues.json")
        meta = raw.get("meta") if isinstance(raw, dict) and isinstance(raw.get("meta"), dict) else {}
    return {
        "video_id": vid,
        "rev": int(meta.get("rev") or 0),
        "deviceId": str(meta.get("deviceId") or ""),
        "updated_at": str(meta.get("updated_at") or ""),
        "cue_count": int(meta.get("cue_count") or 0),
        "owned": bool(meta.get("owned")),
        "title": str(meta.get("title") or ""),
    }


def list_scripts() -> list[dict[str, Any]]:
    """[{video_id, title, updated_at, rev, cue_count, owned}] sorted by video id."""
    out: list[dict[str, Any]] = []
    for p in sorted(scripts_root().iterdir()):
        if not (p.is_dir() and _VIDEO_ID_RE.match(p.name) and (p / "cues.json").is_file()):
            continue
        meta = load_meta(p.name)
        if meta:
            out.append(meta)
    return out


def read_files(video_id: str) -> dict[str, str] | None:
    """The 3 mirrorable files as text. Existing script.txt is returned as-is (never overwritten)."""
    data = load_script(video_id)
    if not data:
        return None
    vid = data["video_id"]
    folder = Path(data["path"])
    full_meta = _read_json(folder / "meta.json")
    full_meta = full_meta if isinstance(full_meta, dict) else data.get("meta") or {}
    cues = data["cues"]
    txt_path = folder / "script.txt"
    if txt_path.is_file():
        txt = txt_path.read_text(encoding="utf-8")
    else:
        txt = render_script_txt(
            cues,
            video_id=vid,
            url=str(full_meta.get("url") or ""),
            title=str(full_meta.get("title") or ""),
            tokens=load_tokens(vid),
        )
        _atomic_write_text(txt_path, txt)
    return {
        "cues.json": _dump({"video_id": vid, "cues": cues, "meta": full_meta}),
        "meta.json": _dump(full_meta),
        "script.txt": txt,
    }


def write_files(video_id: str, files: dict[str, Any]) -> dict[str, Any]:
    """Drive → disk. JSON files are parsed first so a bad mirror cannot corrupt disk."""
    vid = _safe_video_id(video_id)
    folder = video_dir(vid)
    written: list[str] = []
    for name in FILE_NAMES:
        content = files.get(name)
        if not isinstance(content, str) or not content.strip():
            continue
        if name.endswith(".json"):
            try:
                json.loads(content)
            except ValueError as exc:
                raise ValueError(f"{name} is not valid JSON: {exc}") from exc
        _atomic_write_text(folder / name, content)
        written.append(name)
    if not written:
        raise ValueError("no known files in payload")
    logger.info("Wrote %s from mirror → %s", ", ".join(written), folder)
    return {"ok": True, "video_id": vid, "path": str(folder), "written": written}


def delete_script(video_id: str) -> dict[str, Any]:
    """Remove data/subtitles/{videoId}/ (cues/tokens/meta/script.txt)."""
    vid = _safe_video_id(video_id)
    folder = scripts_root() / vid
    if not folder.exists():
        return {
            "ok": True,
            "video_id": vid,
            "deleted": False,
            "path": str(folder),
            "message": "not found",
        }
    shutil.rmtree(folder)
    logger.info("Deleted script folder %s", folder)
    return {
        "ok": True,
        "video_id": vid,
        "deleted": True,
        "path": str(folder),
        "message": "deleted",
    }
