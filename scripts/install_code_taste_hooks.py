#!/usr/bin/env python3
"""Install the shared hook into supported agent clients without clobbering config."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / "scripts" / "code_taste_hook.py"
PYTHON = str(Path(sys.executable).resolve())
COMMAND = f'{shlex.quote(PYTHON)} {shlex.quote(str(HOOK))}'
LEGACY_COMMAND = f'python3 "{HOOK}"'
ANTIGRAVITY_HOOK_NAME = "code-taste-house-style"


def _handler(timeout: int) -> dict[str, Any]:
    return {"type": "command", "command": COMMAND, "timeout": timeout}


def _process_handler(timeout: int) -> dict[str, Any]:
    return {
        "type": "process",
        "command": PYTHON,
        "args": [str(HOOK)],
        "enabled": True,
        "timeoutMs": timeout,
    }


def _antigravity_handler(event: str, timeout: int) -> dict[str, Any]:
    return {
        "type": "command",
        "command": f'{COMMAND} --event {event}',
        "timeout": timeout,
    }


def _append(config: dict[str, Any], event: str, matcher: str, timeout: int) -> bool:
    hooks = config.setdefault("hooks", {})
    groups = hooks.setdefault(event, [])
    return _upsert(groups, matcher, _handler(timeout))


def _upsert(groups: list, matcher: str, desired: dict) -> bool:
    """Replace only our handler, preserving other handlers and their original matcher."""
    original = json.dumps(groups, sort_keys=True)
    kept = []
    for group in groups:
        others = []
        for handler in group.get("hooks", []):
            commands = {desired["command"], desired["command"].replace(COMMAND, LEGACY_COMMAND)}
            ours = (handler.get("command") in commands and handler.get("args") == desired.get("args"))
            ours = ours or (desired.get("args") == [str(HOOK)] and handler.get("args") == [str(HOOK)]
                            and handler.get("command") in {"python3", PYTHON})
            if ours:
                if "enabled" in handler:
                    desired["enabled"] = handler["enabled"]
            else:
                others.append(handler)
        if others:
            kept.append({**group, "hooks": others})
    kept.append({"matcher": matcher, "hooks": [desired]})
    groups[:] = kept
    return original != json.dumps(groups, sort_keys=True)


def _append_zcode(config: dict[str, Any], event: str, matcher: str, timeout: int) -> bool:
    hooks = config.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        raise SystemExit("Refusing to overwrite non-object hooks in ZCode config")
    hooks.setdefault("enabled", True)
    events = hooks.setdefault("events", {})
    if not isinstance(events, dict):
        raise SystemExit("Refusing to overwrite non-object ZCode hook events")
    groups = events.setdefault(event, [])
    return _upsert(groups, matcher, _process_handler(timeout))


def _append_antigravity(config: dict[str, Any], event: str, matcher: str, timeout: int) -> bool:
    definition = config.setdefault(ANTIGRAVITY_HOOK_NAME, {"enabled": True})
    if not isinstance(definition, dict):
        raise SystemExit("Refusing to overwrite non-object Antigravity hook definition")
    definition.setdefault("enabled", True)
    groups = definition.setdefault(event, [])
    if not isinstance(groups, list):
        raise SystemExit(f"Refusing to overwrite non-list Antigravity {event} hooks")
    handler = _antigravity_handler(event, timeout)
    if event == "PreInvocation":
        if handler in groups:
            return False
        groups[:] = [h for h in groups if h.get("command") != f"{LEGACY_COMMAND} --event {event}"]
        groups.append(handler)
        return True
    return _upsert(groups, matcher, handler)


def _load(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"Refusing to overwrite invalid config {path}: {error}")
    if not isinstance(value, dict):
        raise SystemExit(f"Refusing to overwrite non-object config {path}")
    return value


def _write(path: Path, config: dict[str, Any], dry_run: bool) -> None:
    if dry_run:
        print(f"DRY-RUN {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = path.with_name(path.name + f".before-code-taste.{stamp}.bak")
        shutil.copy2(path, backup)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n")
    print(f"INSTALLED {path}")


def install(path: Path, events: list[tuple[str, str, int]], dry_run: bool) -> None:
    config = _load(path)
    added = sum(_append(config, event, matcher, timeout) for event, matcher, timeout in events)
    if added:
        _write(path, config, dry_run)
    else:
        print(f"EXISTS {path}")


def install_zcode(path: Path, events: list[tuple[str, str, int]], dry_run: bool) -> None:
    config = _load(path)
    added = sum(_append_zcode(config, event, matcher, timeout) for event, matcher, timeout in events)
    if added:
        _write(path, config, dry_run)
    else:
        print(f"EXISTS {path}")


def install_antigravity(path: Path, events: list[tuple[str, str, int]], dry_run: bool) -> None:
    config = _load(path)
    original = json.dumps(config, sort_keys=True)
    definition = config.get(ANTIGRAVITY_HOOK_NAME, {})
    # Remove only our obsolete permission-gating handler; retain any user additions.
    if "PreToolUse" in definition:
        groups = definition["PreToolUse"]
        kept = []
        for group in groups:
            handlers = [h for h in group.get("hooks", [])
                        if h.get("command") not in {f"{COMMAND} --event PreToolUse", f"{LEGACY_COMMAND} --event PreToolUse"}]
            if handlers:
                kept.append({**group, "hooks": handlers})
        if kept:
            definition["PreToolUse"] = kept
        else:
            del definition["PreToolUse"]
    added = sum(_append_antigravity(config, event, matcher, timeout) for event, matcher, timeout in events)
    if added or original != json.dumps(config, sort_keys=True):
        _write(path, config, dry_run)
    else:
        print(f"EXISTS {path}")


def _yaml_command(command: str) -> str:
    return json.dumps(command, ensure_ascii=False)


def _hermes_entry(event: str, matcher: str, timeout: int) -> str:
    match_line = f"      matcher: {_yaml_command(matcher)}\n" if matcher else ""
    return (
        f"    - command: {_yaml_command(COMMAND)}\n"
        f"{match_line}"
        f"      timeout: {timeout}\n"
    )


def _insert_hermes_event(text: str, event: str, matcher: str, timeout: int) -> tuple[str, bool]:
    lines = text.splitlines(keepends=True)
    hooks_index = next((i for i, line in enumerate(lines) if re.fullmatch(r"hooks:\s*(?:#.*)?", line.rstrip())), None)
    if hooks_index is None:
        suffix = "\n" if text and not text.endswith("\n") else ""
        block = (
            f"{suffix}hooks:\n"
            f"  {event}:\n"
            f"{_hermes_entry(event, matcher, timeout)}"
        )
        return text + block, True

    section_end = len(lines)
    for i in range(hooks_index + 1, len(lines)):
        if lines[i] and not lines[i][0].isspace() and not lines[i].lstrip().startswith("#"):
            section_end = i
            break

    event_pattern = re.compile(rf"^  {re.escape(event)}:\s*$")
    event_index = next(
        (i for i in range(hooks_index + 1, section_end) if event_pattern.match(lines[i].rstrip("\n"))),
        None,
    )
    entry = _hermes_entry(event, matcher, timeout)
    if event_index is not None:
        event_end = event_index + 1
        while event_end < section_end and (
            lines[event_end].startswith("    ") or not lines[event_end].strip()
        ):
            event_end += 1
        markers = (_yaml_command(COMMAND), _yaml_command(LEGACY_COMMAND))
        matches = [
            i
            for i in range(event_index + 1, event_end)
            if lines[i].startswith("    - command: ") and any(marker in lines[i] for marker in markers)
        ]
        if matches:
            kept: list[str] = []
            seen = False
            i = event_index + 1
            while i < event_end:
                line = lines[i]
                is_ours = line.startswith("    - command: ") and any(marker in line for marker in markers)
                if is_ours:
                    if not seen:
                        kept.append(entry)
                        seen = True
                    i += 1
                    while i < event_end and lines[i].startswith("      "):
                        i += 1
                    continue
                kept.append(line)
                i += 1
            lines[event_index + 1:event_end] = kept
            updated = "".join(lines)
            return updated, updated != text
        lines.insert(event_end, entry)
        return "".join(lines), True

    insert_at = section_end
    lines[insert_at:insert_at] = [f"  {event}:\n", entry]
    return "".join(lines), True


def install_hermes(path: Path, dry_run: bool) -> None:
    original = path.read_text() if path.exists() else ""
    updated = original
    changed = False
    for event, matcher, timeout in (
        ("pre_llm_call", "", 10),
        ("pre_tool_call", "write_file|patch|terminal", 10),
        ("post_tool_call", "write_file|patch|terminal", 30),
    ):
        updated, event_changed = _insert_hermes_event(updated, event, matcher, timeout)
        changed = changed or event_changed
    # Use the already installed platform YAML parser before touching user config.
    parsed = []
    for content in (original, updated):
        result = subprocess.run(
            ["ruby", "-ryaml", "-rjson", "-e",
             "puts JSON.generate(YAML.safe_load(STDIN.read, permitted_classes: [Symbol], aliases: true))"],
            input=content, text=True, capture_output=True, check=True,
        )
        config = json.loads(result.stdout) or {}
        if not isinstance(config, dict):
            raise SystemExit("Refusing non-mapping Hermes config")
        parsed.append(config)
    for event in ("pre_llm_call", "pre_tool_call", "post_tool_call"):
        entries = parsed[1].get("hooks", {}).get(event, [])
        if sum(isinstance(h, dict) and h.get("command") == COMMAND for h in entries) != 1:
            raise SystemExit(f"Unsupported Hermes YAML layout for {event}; config left unchanged")
    for config in parsed:
        hooks = config.get("hooks", {})
        for event, entries in list(hooks.items()):
            if isinstance(entries, list):
                hooks[event] = [h for h in entries if not (isinstance(h, dict)
                                and h.get("command") in {COMMAND, LEGACY_COMMAND})]
                if not hooks[event]:
                    del hooks[event]
        if not hooks:
            config.pop("hooks", None)
    if parsed[0] != parsed[1]:
        raise SystemExit("Unsupported Hermes YAML layout would alter existing config; left unchanged")
    if not changed:
        print(f"EXISTS {path}")
        return
    if dry_run:
        print(f"DRY-RUN {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = path.with_name(path.name + f".before-code-taste.{stamp}.bak")
        shutil.copy2(path, backup)
    path.write_text(updated)
    print(f"INSTALLED {path}")


def install_hermes_allowlist(path: Path, dry_run: bool) -> None:
    config = _load(path)
    approvals = config.setdefault("approvals", [])
    if not isinstance(approvals, list):
        raise SystemExit("Refusing to overwrite non-list Hermes hook approvals")
    events = {"pre_llm_call", "pre_tool_call", "post_tool_call"}
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    mtime = datetime.fromtimestamp(HOOK.stat().st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")
    refreshed = False
    for entry in approvals:
        if (isinstance(entry, dict) and entry.get("event") in events
                and entry.get("command") in {COMMAND, LEGACY_COMMAND}
                and (entry.get("command") != COMMAND or entry.get("script_mtime_at_approval") != mtime)):
            entry.update(command=COMMAND, approved_at=now, script_mtime_at_approval=mtime)
            refreshed = True
    existing = {
        (entry.get("event"), entry.get("command"))
        for entry in approvals
        if isinstance(entry, dict)
    }
    present_events = {event for event, command in existing if command == COMMAND}
    missing = events - present_events
    normalized: list[Any] = []
    seen_ours: set[tuple[Any, Any]] = set()
    changed = refreshed
    for entry in approvals:
        key = (
            entry.get("event"),
            entry.get("command"),
        ) if isinstance(entry, dict) else (None, None)
        if key in {(event, COMMAND) for event in events}:
            if key in seen_ours:
                changed = True
                continue
            seen_ours.add(key)
        normalized.append(entry)
    config["approvals"] = normalized
    if not missing and not changed:
        print(f"EXISTS {path}")
        return
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    mtime = datetime.fromtimestamp(HOOK.stat().st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")
    new_approvals = list(normalized)
    for event in sorted(missing):
        new_approvals.append(
            {
                "event": event,
                "command": COMMAND,
                "approved_at": now,
                "script_mtime_at_approval": mtime,
            }
        )
    config["approvals"] = new_approvals
    _write(path, config, dry_run)


def install_vscode(home: Path, dry_run: bool) -> None:
    path = home / ".copilot/hooks/code-taste.json"
    config = _load(path)
    original = json.dumps(config, sort_keys=True)
    for event in ("PreToolUse", "PostToolUse"):
        handler = {"type": "command", "command": f"{COMMAND} --client vscode", "timeout": 30}
        entries = config.setdefault("hooks", {}).setdefault(event, [])
        if handler not in entries:
            entries.append(handler)
    if json.dumps(config, sort_keys=True) != original:
        _write(path, config, dry_run)
    else:
        print(f"EXISTS {path}")


def install_cline(home: Path, dry_run: bool) -> None:
    for event in ("PreToolUse", "PostToolUse"):
        path = home / "Documents/Cline/Hooks" / event
        content = f"#!/bin/sh\n# code-taste-managed\nexec {COMMAND} --client cline --event {event}\n"
        if path.exists() and path.read_text() != content:
            raise SystemExit(f"Refusing to replace existing Cline hook: {path}")
        if path.exists() and path.stat().st_mode & 0o111:
            print(f"EXISTS {path}")
        elif dry_run:
            print(f"DRY-RUN {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
            path.chmod(0o755)
            print(f"INSTALLED {path}")


def install_roo(home: Path, dry_run: bool) -> None:
    path = home / ".roo/rules/code-taste.md"
    target = ROOT / "CODE_STYLE.md"
    if path.is_symlink() and path.resolve() == target:
        print(f"EXISTS {path} (rules only)")
    elif path.exists() or path.is_symlink():
        raise SystemExit(f"Refusing to replace existing Roo rule: {path}")
    elif dry_run:
        print(f"DRY-RUN {path} (rules only)")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.symlink_to(target)
        print(f"INSTALLED {path} (rules only; no native edit hook)")


def install_xcode(home: Path, dry_run: bool) -> None:
    """Prepare documented isolated agent homes; do not copy auth or claim activation."""
    base = home / "Library/Developer/Xcode/CodingAssistant"
    for relative in ("ClaudeAgentConfig/settings.json", "codex/hooks.json"):
        path = base / relative
        config = _load(path)
        changed = False
        for event in ("PreToolUse", "PostToolUse"):
            groups = config.setdefault("hooks", {}).setdefault(event, [])
            # Xcode editing can use MCP tools rather than built-in Edit/Write aliases.
            handler = {"type": "command", "command": f"{COMMAND} --client all-tools", "timeout": 30}
            changed = _upsert(groups, ".*", handler) or changed
        if changed:
            _write(path, config, dry_run)
        else:
            print(f"EXISTS {path}")
    print("NOT VERIFIED Xcode: prepared Claude/Codex config; agent installation, login and hook trust still required")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    home = Path.home()

    install(
        home / ".codex" / "hooks.json",
        [
            ("PreToolUse", "Bash|apply_patch|Edit|Write|MultiEdit", 10),
            ("PostToolUse", "Bash|apply_patch|Edit|Write|MultiEdit", 30),
        ],
        args.dry_run,
    )
    install(
        home / ".claude" / "settings.json",
        [
            ("PreToolUse", "Bash|Edit|Write|MultiEdit", 10),
            ("PostToolUse", "Bash|Edit|Write|MultiEdit", 30),
        ],
        args.dry_run,
    )
    install(
        home / ".gemini" / "settings.json",
        [
            ("BeforeAgent", "", 10000),
            ("BeforeTool", "write_file|replace|run_shell_command", 30000),
            ("AfterTool", "write_file|replace|run_shell_command", 30000),
        ],
        args.dry_run,
    )
    install_zcode(
        home / ".zcode" / "cli" / "config.json",
        [
            ("PreToolUse", "Bash|Write|Edit|MultiEdit|ApplyPatch", 10000),
            ("PostToolUse", "Bash|Write|Edit|MultiEdit|ApplyPatch", 30000),
        ],
        args.dry_run,
    )
    install_antigravity(
        home / ".gemini" / "config" / "hooks.json",
        [
            (
                "PreInvocation",
                "",
                10,
            ),
            (
                "PostToolUse",
                "write_to_file|replace_file_content|multi_replace_file_content|run_command",
                30,
            ),
        ],
        args.dry_run,
    )
    install_hermes(home / ".hermes" / "config.yaml", args.dry_run)
    install_hermes_allowlist(home / ".hermes" / "shell-hooks-allowlist.json", args.dry_run)
    install_vscode(home, args.dry_run)
    install_cline(home, args.dry_run)
    install_roo(home, args.dry_run)
    if Path("/Applications/Xcode.app").is_dir():
        install_xcode(home, args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
