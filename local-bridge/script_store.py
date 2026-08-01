"""Per-video caption script persistence under project scripts/{videoId}/."""

from __future__ import annotations

import json
import logging
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Project root: …/Translate realtime OCR youtube video/
ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ROOT / "scripts"

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,64}$")


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
) -> str:
    # Avoid bare ===== lines — IDEs treat ======= as git conflict markers.
    # Cue separators keep 10+ dashes so import_parse.split(/-{10,}/) still works.
    lines: list[str] = [
        "# ----------------------------------------",
        "# YouTube Caption Script",
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
        tokens = cue.get("tokens") or []
        furi = ""
        if isinstance(tokens, list) and tokens:
            parts = []
            for t in tokens:
                if not isinstance(t, dict):
                    continue
                surf = str(t.get("surface") or "")
                reading = str(t.get("reading") or "")
                parts.append(f"{surf}({reading})" if reading else surf)
            furi = "".join(parts)

        lines.append(
            f"[{str(i).zfill(3)}] {_format_time_plain(start)} → {_format_time_plain(end)}"
        )
        if source:
            lines.append(f"JA: {source}")
            if furi:
                lines.append(f"    ({furi})")
        if en:
            lines.append(f"EN: {en}")
        if vi:
            lines.append(f"VI: {vi}")
        lines.append("")
        lines.append("# ----------------------------------------")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _atomic_write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Unique tmp per write so concurrent save_script calls never share one .tmp.
    tmp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        tmp_path.write_text(content, encoding=encoding)
        tmp_path.replace(path)
    finally:
        tmp_path.unlink(missing_ok=True)


def save_script(
    video_id: str,
    cues: list[dict[str, Any]],
    *,
    url: str = "",
    title: str = "",
) -> dict[str, Any]:
    vid = _safe_video_id(video_id)
    folder = video_dir(vid)
    cleaned: list[dict[str, Any]] = []
    for c in cues or []:
        if not isinstance(c, dict):
            continue
        start = float(c.get("start_media_time") or c.get("start") or 0)
        end = float(c.get("end_media_time") or c.get("end") or start)
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

    meta = {
        "video_id": vid,
        "url": url or "",
        "title": title or "",
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "cue_count": len(cleaned),
        "translated_count": sum(1 for c in cleaned if c.get("translated")),
    }

    cues_path = folder / "cues.json"
    txt_path = folder / "script.txt"
    meta_path = folder / "meta.json"

    _atomic_write_text(
        cues_path,
        json.dumps({"video_id": vid, "cues": cleaned, "meta": meta}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _atomic_write_text(
        txt_path,
        render_script_txt(cleaned, video_id=vid, url=url, title=title),
        encoding="utf-8",
    )
    _atomic_write_text(
        meta_path,
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    logger.info(
        "Saved script %s cues=%d translated=%d → %s",
        vid,
        len(cleaned),
        meta["translated_count"],
        folder,
    )
    return {
        "ok": True,
        "video_id": vid,
        "path": str(folder),
        "txt_path": str(txt_path),
        "cue_count": len(cleaned),
        "translated_count": meta["translated_count"],
    }


def load_script(video_id: str) -> dict[str, Any] | None:
    try:
        vid = _safe_video_id(video_id)
    except ValueError:
        return None
    folder = scripts_root() / vid
    cues_path = folder / "cues.json"
    if not cues_path.exists():
        return None
    try:
        raw = json.loads(cues_path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Failed reading %s: %s", cues_path, exc)
        return None

    cues = raw.get("cues") if isinstance(raw, dict) else None
    if not isinstance(cues, list):
        return None
    meta = raw.get("meta") if isinstance(raw, dict) else {}
    if not isinstance(meta, dict):
        meta = {}
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
            if isinstance(c, dict)
            and (
                c.get("translated")
                or str(c.get("vi") or "").strip()
                or str(c.get("en") or "").strip()
            )
        ),
    }


def delete_script(video_id: str) -> dict[str, Any]:
    """Remove scripts/{videoId}/ (cues.json, script.txt, meta.json)."""
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
