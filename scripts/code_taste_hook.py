#!/usr/bin/env python3
"""Cross-agent house-style hook with a JSON-over-stdin contract."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from argparse import ArgumentParser
from pathlib import Path
from typing import Any


EDIT_TOOLS = {
    "apply_patch",
    "ApplyPatch",
    "Edit",
    "Write",
    "MultiEdit",
    "write_file",
    "replace",
    "patch",
    "write_to_file",
    "replace_file_content",
    "multi_replace_file_content",
    "replace_in_file",
    "apply_diff",
}
SHELL_TOOLS = {"Bash", "run_shell_command", "terminal", "run_command", "execute_command"}
PATCH_PATH_RE = re.compile(r"^\*\*\* (?:Update|Add|Delete) File: (.+)$", re.MULTILINE)
ROOT = Path(__file__).resolve().parents[1]
GUIDANCE = (
    "Code taste: preserve behavior; trace the real flow and callers before editing; reuse "
    "existing helpers and standard libraries; prefer clear names, guard clauses and one source "
    "of truth; avoid speculative abstractions, dependencies and unrelated cleanup. Never hand-edit "
    "generated output. After each edit, review the diff and run the smallest real behavioral check "
    "for non-trivial logic. A whitespace check alone does not verify correctness. When asked to "
    "migrate the whole codebase, follow the migration plan in small behavior-preserving slices; "
    "do not start a migration during an unrelated task."
)


def _repo_root(cwd: str | None) -> Path | None:
    start = Path(cwd or ".").expanduser().resolve()
    for candidate in (start, *start.parents):
        if (candidate / ".git").exists():
            return candidate
    return None


def _tool_input(payload: dict[str, Any]) -> dict[str, Any]:
    value = payload.get("tool_input")
    if isinstance(value, dict):
        return value
    tool_call = payload.get("toolCall")
    if isinstance(tool_call, dict) and isinstance(tool_call.get("args"), dict):
        return tool_call["args"]
    return {}


def _tool_name(payload: dict[str, Any]) -> str:
    value = payload.get("tool_name")
    if isinstance(value, str) and value:
        return value
    tool_call = payload.get("toolCall")
    if isinstance(tool_call, dict) and isinstance(tool_call.get("name"), str):
        return tool_call["name"]
    return ""


def _working_directory(payload: dict[str, Any]) -> str | None:
    cwd = payload.get("cwd")
    if isinstance(cwd, str) and cwd:
        return cwd
    tool_input = _tool_input(payload)
    for key in ("Cwd", "cwd", "WorkingDirectory"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            return value
    workspace_paths = payload.get("workspacePaths")
    if isinstance(workspace_paths, list):
        for value in workspace_paths:
            if isinstance(value, str) and value:
                return value
    return None


def _command(payload: dict[str, Any]) -> str:
    tool_input = _tool_input(payload)
    for key in ("command", "CommandLine"):
        value = tool_input.get(key)
        if isinstance(value, str):
            return value
    return ""


def _touched_paths(payload: dict[str, Any]) -> list[str]:
    tool_input = _tool_input(payload)
    paths: set[str] = set()

    command = _command(payload)
    paths.update(match.strip() for match in PATCH_PATH_RE.findall(command))

    for key in (
        "file_path",
        "path",
        "filename",
        "filePath",
        "TargetFile",
        "AbsolutePath",
    ):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            paths.add(value)

    response = payload.get("tool_response")
    if isinstance(response, dict):
        for key in ("file_path", "path", "filename", "filePath", "TargetFile", "AbsolutePath"):
            value = response.get(key)
            if isinstance(value, str) and value:
                paths.add(value)

    return sorted(paths)


def _is_edit(payload: dict[str, Any]) -> bool:
    # Every shell may edit via a script, formatter or redirection; no lexical heuristic.
    return _tool_name(payload) in (EDIT_TOOLS | SHELL_TOOLS)


def _diff_check(root: Path, paths: list[str]) -> str:
    command = ["git", "-C", str(root), "diff", "--check", "--", *paths]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            # git diff omits new files. Check only exposed new paths, never ignored data.
            for name in paths:
                path = Path(name)
                path = path if path.is_absolute() else root / path
                path = path.resolve()
                if not path.is_relative_to(root) or not path.is_file():
                    continue
                relative = str(path.relative_to(root))
                listed = subprocess.run(
                    ["git", "-C", str(root), "ls-files", "--others", "--exclude-standard", "--", relative],
                    capture_output=True, text=True, timeout=10,
                )
                if listed.stdout:
                    result = subprocess.run(
                        ["git", "diff", "--no-index", "--check", "--", "/dev/null", str(path)],
                        capture_output=True, text=True, timeout=10,
                    )
                    # --no-index implies --exit-code: 1 can mean a clean file differs.
                    if result.returncode == 1 and not result.stdout and not result.stderr:
                        result.returncode = 0
                    if result.returncode:
                        break
    except (OSError, subprocess.SubprocessError) as error:
        return f"not-run ({type(error).__name__})"
    if result.returncode == 0:
        return "pass"
    detail = (result.stdout or result.stderr).strip().splitlines()[0:2]
    return "fail: " + " | ".join(detail)


def _guidance(payload: dict[str, Any]) -> str:
    root = _repo_root(_working_directory(payload))
    style = root / "CODE_STYLE.md" if root else ROOT / "CODE_STYLE.md"
    if not style.is_file():
        style = ROOT / "CODE_STYLE.md"
    return f"{GUIDANCE} Detailed criteria: {style}. Respect the current project's conventions."


def _context(payload: dict[str, Any], event: str, paths: list[str]) -> str:
    tool_name = _tool_name(payload) or "unknown"
    base = Path(_working_directory(payload) or ".").expanduser().resolve()
    paths = [str((base / name).resolve()) for name in paths]
    path_text = ", ".join(paths) if paths else "path not exposed by the tool"
    root = _repo_root(_working_directory(payload))

    if event in {"PostToolUse", "AfterTool", "post_tool_call"}:
        check = _diff_check(root, paths) if root else "not-run (no Git repository)"
        return (
            "House-style gate ran after a tool that may edit files. "
            f"Tool={tool_name}; touched={path_text}; diff-check={check}. "
            "Before continuing, do a micro-review: preserve behavior, remove accidental "
            "duplication, keep names clear at the call site, avoid speculative abstraction, "
            "and run the smallest real check for non-trivial logic. "
            "A passing diff-check verifies whitespace only. " + _guidance(payload)
        )

    return (
        "House-style gate ran before a tool that may edit files. "
        f"Tool={tool_name}; intended={path_text}. " + _guidance(payload)
    )


def main() -> int:
    parser = ArgumentParser(add_help=False)
    parser.add_argument("--event", choices=("PreToolUse", "PostToolUse", "PreInvocation"))
    parser.add_argument("--client", choices=("cline", "vscode", "all-tools"))
    args, _ = parser.parse_known_args()
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, TypeError):
        print(json.dumps({"systemMessage": "House-style hook skipped invalid JSON input."}))
        return 0

    if not isinstance(payload, dict):
        print(json.dumps({}))
        return 0

    if args.client == "cline":
        event = args.event or payload.get("hookName", "PostToolUse")
        call = payload.get("preToolUse" if event == "PreToolUse" else "postToolUse", {})
        roots = payload.get("workspaceRoots", [])
        normalized = {"tool_name": call.get("toolName"), "tool_input": call.get("parameters", {}),
                      "cwd": roots[0] if roots else None}
        context = _context(normalized, event, _touched_paths(normalized)) if _is_edit(normalized) else ""
        print(json.dumps({"cancel": False, "contextModification": context}))
        return 0

    event = args.event or str(payload.get("hook_event_name") or "PostToolUse")
    if event == "PreInvocation":
        root = _repo_root(_working_directory(payload))
        check = _diff_check(root, []) if root else "not-run (no Git repository)"
        print(json.dumps({"injectSteps": [{"ephemeralMessage": _guidance(payload) + f" Current diff-check={check}."}]}))
        return 0
    if event == "pre_llm_call":
        print(json.dumps({"context": _guidance(payload)}))
        return 0
    if event == "BeforeAgent":
        print(json.dumps({"hookSpecificOutput": {"hookEventName": event, "additionalContext": _guidance(payload)}}))
        return 0
    if not _is_edit(payload) and args.client not in {"vscode", "all-tools"}:
        print(json.dumps({}))
        return 0

    if event in {"pre_tool_call", "post_tool_call"}:
        print(_context(payload, event, _touched_paths(payload)), file=sys.stderr)
        print(json.dumps({}))
        return 0

    if "toolCall" in payload:
        if event == "PreToolUse":
            # Compatibility with the old installed PreToolUse entry until reinstallation.
            # Never grant permissions: the installer replaces this with PreInvocation.
            print(json.dumps({"decision": "ask", "reason": _context(payload, event, _touched_paths(payload))}))
        else:
            print(_context(payload, event, _touched_paths(payload)), file=sys.stderr)
            print(json.dumps({}))
        return 0

    output = {
        "hookSpecificOutput": {
            "hookEventName": event,
            "additionalContext": _context(payload, event, _touched_paths(payload)),
        }
    }
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
