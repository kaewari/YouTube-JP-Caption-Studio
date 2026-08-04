"""macOS Input Source switch for the local bridge (no Chrome Native Messaging).

Uses the Swift `ime-select` helper (Carbon TIS). Built into `local-bridge/bin/`
by `start.sh`, or compiled lazily on the first `/ime` call.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import threading
from pathlib import Path

logger = logging.getLogger("bridge.ime")

BRIDGE_ROOT = Path(__file__).resolve().parent.parent.parent
REPO_ROOT = BRIDGE_ROOT.parent
BIN_DIR = BRIDGE_ROOT / "bin"
BIN_HELPER = BIN_DIR / "ime-select"
SCRIPT_DIR = REPO_ROOT / "tools" / "ime-switch"
SCRIPT_HELPER = SCRIPT_DIR / "ime-select"
SWIFT_SRC = SCRIPT_DIR / "ime_select.swift"

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

_build_lock = threading.Lock()


def _run(argv: list[str], timeout: float = 5.0) -> tuple[int, str, str]:
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


def ensure_helper() -> tuple[str, list[str]] | None:
    """Return (kind, argv_prefix) for current/list/set, building if needed."""
    for path in (BIN_HELPER, SCRIPT_HELPER):
        if path.is_file() and os.access(path, os.X_OK):
            return ("swift", [str(path)])

    with _build_lock:
        for path in (BIN_HELPER, SCRIPT_HELPER):
            if path.is_file() and os.access(path, os.X_OK):
                return ("swift", [str(path)])
        if SWIFT_SRC.is_file() and shutil.which("swiftc"):
            BIN_DIR.mkdir(parents=True, exist_ok=True)
            code, _, err = _run(
                [
                    "swiftc",
                    "-O",
                    "-o",
                    str(BIN_HELPER),
                    str(SWIFT_SRC),
                    "-framework",
                    "Carbon",
                    "-framework",
                    "AppKit",
                ],
                timeout=120.0,
            )
            if code == 0 and BIN_HELPER.is_file():
                try:
                    BIN_HELPER.chmod(BIN_HELPER.stat().st_mode | 0o111)
                except OSError:
                    pass
                _run(
                    [
                        "codesign",
                        "--force",
                        "--sign",
                        "-",
                        "--identifier",
                        "com.ytcaption.ime-select",
                        str(BIN_HELPER),
                    ],
                    timeout=10.0,
                )
                logger.info("Built ime-select → %s", BIN_HELPER)
                return ("swift", [str(BIN_HELPER)])
            logger.warning("ime-select build failed: %s", (err or "")[-400:])

    brew = shutil.which("im-select")
    if brew:
        return ("im-select", [brew])
    return None


def get_current(helper: tuple[str, list[str]]) -> str:
    kind, base = helper
    if kind == "swift":
        code, out, _ = _run(base + ["current"])
        return out if code == 0 else ""
    code, out, _ = _run(base)
    return out if code == 0 else ""


def list_ids(helper: tuple[str, list[str]]) -> list[str]:
    kind, base = helper
    if kind == "swift":
        code, out, _ = _run(base + ["list"])
        if code != 0:
            return []
        return [ln.strip() for ln in out.splitlines() if ln.strip()]
    return []


def set_id(helper: tuple[str, list[str]], source_id: str) -> bool:
    kind, base = helper
    if kind == "swift":
        code, _out, err = _run(base + ["set", source_id])
        if "needs_accessibility" in (err or ""):
            logger.warning(
                "ime-select: Accessibility not granted — menu bar may flip but Chrome "
                "can keep typing Latin. Enable local-bridge/bin/ime-select under "
                "System Settings → Privacy & Security → Accessibility (side panel "
                "also converts romaji→kana as fallback)."
            )
        return code == 0
    code, _, _ = _run(base + [source_id])
    return code == 0


def accessibility_status(helper: tuple[str, list[str]] | None = None) -> dict:
    """Probe whether ime-select may post Kana/Eisu HID events."""
    h = helper or ensure_helper()
    if not h or h[0] != "swift":
        return {"trusted": None, "required_for_ja": True}
    code, out, _ = _run(h[1] + ["ax"])
    trusted = code == 0 and (out or "").strip() == "trusted"
    return {
        "trusted": trusted,
        "required_for_ja": True,
        "hint": (
            None
            if trusted
            else "System Settings → Privacy & Security → Accessibility → enable ime-select "
            "(local-bridge/bin/ime-select), then retry JA focus"
        ),
    }


def pick_first(helper: tuple[str, list[str]], candidates: list[str]) -> str | None:
    available = set(list_ids(helper))
    for cid in candidates:
        if available and cid not in available:
            continue
        if set_id(helper, cid):
            return cid
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


def clear_prev() -> None:
    try:
        PREV_FILE.unlink(missing_ok=True)
    except OSError:
        pass


def is_ja_id(source_id: str) -> bool:
    s = source_id or ""
    if s in JA_CANDIDATES:
        return True
    low = s.lower()
    return "japanese" in low or "kotoeri" in low


def status() -> dict:
    helper = ensure_helper()
    if not helper:
        return {
            "ok": False,
            "available": False,
            "error": "no_helper",
            "hint": "Run local-bridge/start.sh (builds bin/ime-select) or install Japanese Input Sources",
        }
    cur = get_current(helper)
    ax = accessibility_status(helper)
    return {
        "ok": True,
        "available": True,
        "helper": helper[0],
        "current": cur,
        "sources": list_ids(helper),
        "accessibility": ax,
    }


def switch_to(target: str) -> dict:
    """Switch Input Source. target: ja | abc | restore."""
    to = str(target or "").strip().lower()
    if to not in ("ja", "abc", "restore"):
        return {"ok": False, "error": "bad_to", "to": to}

    helper = ensure_helper()
    if not helper:
        return {
            "ok": False,
            "error": "no_helper",
            "hint": "Run local-bridge/start.sh once to build ime-select",
        }

    if to == "ja":
        cur = get_current(helper)
        prev = load_prev()
        if not prev or is_ja_id(prev):
            if cur and not is_ja_id(cur):
                save_prev(cur)
            else:
                save_prev(ABC_CANDIDATES[0])
        chosen = pick_first(helper, JA_CANDIDATES)
        if not chosen:
            return {
                "ok": False,
                "error": "ja_unavailable",
                "prev": load_prev(),
                "current": cur,
                "accessibility": accessibility_status(helper),
            }
        ax = accessibility_status(helper)
        return {
            "ok": True,
            "to": "ja",
            "prev": load_prev(),
            "current": get_current(helper),
            "accessibility": ax,
            "needs_accessibility": not bool(ax.get("trusted")),
        }

    if to == "abc":
        chosen = pick_first(helper, ABC_CANDIDATES)
        clear_prev()
        if not chosen:
            return {"ok": False, "error": "abc_unavailable", "current": get_current(helper)}
        return {
            "ok": True,
            "to": "abc",
            "restored": chosen,
            "current": get_current(helper),
        }

    # restore
    prev = load_prev()
    target_id = None
    if prev and not is_ja_id(prev):
        if set_id(helper, prev):
            target_id = prev
    if not target_id:
        target_id = pick_first(helper, ABC_CANDIDATES)
    clear_prev()
    if not target_id:
        return {"ok": False, "error": "abc_unavailable", "current": get_current(helper)}
    return {
        "ok": True,
        "to": "restore",
        "restored": target_id,
        "current": get_current(helper),
    }
