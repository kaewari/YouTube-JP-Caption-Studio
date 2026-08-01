#!/usr/bin/env python3
"""Chrome Native Messaging host — switch macOS input source JA ↔ ABC.

Protocol: length-prefixed JSON on stdin/stdout (Chrome native messaging).
Commands:
  {"cmd":"activate"}   → save current, select Japanese IME
  {"cmd":"deactivate"} → restore saved (or ABC)
  {"cmd":"status"}     → current source + helper availability
"""

from __future__ import annotations

import json
import os
import shutil
import struct
import subprocess
import sys
from pathlib import Path

HOST_DIR = Path(__file__).resolve().parent
STATE_DIR = Path.home() / ".cache" / "ytcaption-ime"
PREV_FILE = STATE_DIR / "prev_source"

JA_CANDIDATES = [
    "com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese",
    "com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese.Hiragana",
    "com.apple.inputmethod.Kotoeri.Japanese",
    "com.apple.inputmethod.Japanese.Hiragana",
    "com.apple.inputmethod.Japanese",
]

ABC_CANDIDATES = [
    "com.apple.keylayout.ABC",
    "com.apple.keylayout.US",
]


def _read_msg() -> dict | None:
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len or len(raw_len) < 4:
        return None
    (n,) = struct.unpack("<I", raw_len)
    if n <= 0 or n > 1024 * 1024:
        return None
    data = sys.stdin.buffer.read(n)
    if not data:
        return None
    return json.loads(data.decode("utf-8"))


def _write_msg(obj: dict) -> None:
    payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def _helper() -> tuple[str, list[str]] | None:
    """Return (kind, argv_prefix) for current/list/set."""
    local = HOST_DIR / "ime-select"
    if local.is_file() and os.access(local, os.X_OK):
        return ("swift", [str(local)])
    brew = shutil.which("im-select")
    if brew:
        return ("im-select", [brew])
    return None


def _run(argv: list[str], timeout: float = 3.0) -> tuple[int, str, str]:
    try:
        p = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
    except Exception as exc:
        return 1, "", str(exc)


def get_current(helper: tuple[str, list[str]]) -> str:
    kind, base = helper
    if kind == "swift":
        code, out, _ = _run(base + ["current"])
        return out if code == 0 else ""
    # brew im-select: no args → current
    code, out, _ = _run(base)
    return out if code == 0 else ""


def list_ids(helper: tuple[str, list[str]]) -> list[str]:
    kind, base = helper
    if kind == "swift":
        code, out, _ = _run(base + ["list"])
        if code != 0:
            return []
        return [ln.strip() for ln in out.splitlines() if ln.strip()]
    # brew im-select has no list; try candidates blindly
    return []


def set_id(helper: tuple[str, list[str]], source_id: str) -> bool:
    kind, base = helper
    if kind == "swift":
        code, _, _ = _run(base + ["set", source_id])
        return code == 0
    code, _, _ = _run(base + [source_id])
    return code == 0


def pick_first(helper: tuple[str, list[str]], candidates: list[str]) -> str | None:
    available = set(list_ids(helper))
    for cid in candidates:
        if available and cid not in available:
            continue
        if set_id(helper, cid):
            return cid
    # If list failed (im-select), try candidates anyway
    if not available:
        for cid in candidates:
            if set_id(helper, cid):
                return cid
    return None


def save_prev(source_id: str) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    PREV_FILE.write_text(source_id or "", encoding="utf-8")


def load_prev() -> str:
    try:
        return PREV_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def is_ja_id(source_id: str) -> bool:
    s = source_id or ""
    if s in JA_CANDIDATES:
        return True
    low = s.lower()
    return "japanese" in low or "kotoeri" in low


def handle(msg: dict) -> dict:
    cmd = str(msg.get("cmd") or "").strip().lower()
    helper = _helper()
    if not helper:
        return {
            "ok": False,
            "error": "no_helper",
            "hint": "Run local-bridge/start.sh (builds bin/ime-select) or POST /ime builds lazily",
        }

    if cmd == "status":
        cur = get_current(helper)
        return {
            "ok": True,
            "available": True,
            "helper": helper[0],
            "current": cur,
            "sources": list_ids(helper),
        }

    if cmd == "activate":
        cur = get_current(helper)
        # Keep the first non-JA source for this edit session.
        prev = load_prev()
        if not prev or is_ja_id(prev):
            if cur and not is_ja_id(cur):
                save_prev(cur)
            else:
                save_prev(ABC_CANDIDATES[0])
        chosen = pick_first(helper, JA_CANDIDATES)
        if not chosen:
            return {"ok": False, "error": "ja_unavailable", "prev": load_prev(), "current": cur}
        return {"ok": True, "cmd": "activate", "prev": load_prev(), "current": get_current(helper)}

    if cmd == "deactivate":
        prev = load_prev()
        target = None
        if prev and not is_ja_id(prev):
            if set_id(helper, prev):
                target = prev
        if not target:
            target = pick_first(helper, ABC_CANDIDATES)
        try:
            PREV_FILE.unlink(missing_ok=True)
        except OSError:
            pass
        if not target:
            return {"ok": False, "error": "abc_unavailable", "current": get_current(helper)}
        return {"ok": True, "cmd": "deactivate", "restored": target, "current": get_current(helper)}

    return {"ok": False, "error": "unknown_cmd", "cmd": cmd}


def main() -> int:
    while True:
        msg = _read_msg()
        if msg is None:
            break
        try:
            _write_msg(handle(msg if isinstance(msg, dict) else {}))
        except Exception as exc:
            _write_msg({"ok": False, "error": str(exc)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
