#!/usr/bin/env python3
"""Runtime smoke checks for the cross-agent hook."""

from __future__ import annotations

import json
import importlib.util
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / "scripts" / "code_taste_hook.py"
INSTALLER = ROOT / "scripts" / "install_code_taste_hooks.py"


def run(payload: dict, args: list[str] | None = None) -> dict:
    result = subprocess.run(
        [sys.executable, str(HOOK), *(args or [])],
        cwd=ROOT,
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
    )
    if result.stderr:
        assert result.stderr.startswith("House-style gate ran"), result.stderr
    return json.loads(result.stdout)


def installed_checks() -> None:
    """Execute installed handlers; this is not an end-to-end IDE/model session test."""
    home = Path.home()
    cases = (
        ("Codex", home / ".codex/hooks.json", "Edit", ("PreToolUse", "PostToolUse")),
        ("Claude", home / ".claude/settings.json", "Write", ("PreToolUse", "PostToolUse")),
        ("Gemini", home / ".gemini/settings.json", "write_file", ("BeforeTool", "AfterTool")),
        ("ZCode", home / ".zcode/cli/config.json", "ApplyPatch", ("PreToolUse", "PostToolUse")),
        ("VS Code", home / ".copilot/hooks/code-taste.json", "create_file", ("PreToolUse", "PostToolUse")),
        ("Xcode Claude", home / "Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig/settings.json", "mcp__Xcode__XcodeUpdate", ("PreToolUse", "PostToolUse")),
        ("Xcode Codex", home / "Library/Developer/Xcode/CodingAssistant/codex/hooks.json", "mcp__Xcode__XcodeWrite", ("PreToolUse", "PostToolUse")),
    )
    for name, path, tool, events in cases:
        config = json.loads(path.read_text())["hooks"]
        if name == "ZCode":
            assert config.get("enabled") is True
            config = config["events"]
        for event in events:
            found = []
            for group in config[event]:
                if not re.search(group.get("matcher", ".*"), tool):
                    continue
                for handler in group.get("hooks", [group]):
                    argv = ([handler["command"], *handler["args"]] if "args" in handler
                            else shlex.split(handler["command"]))
                    if str(HOOK) in argv:
                        assert handler.get("enabled", True)
                        found.append(argv)
            assert len(found) == 1, (name, event, found)
            payload = {"hook_event_name": event, "tool_name": tool, "cwd": str(ROOT),
                       "tool_input": {"file_path": str(ROOT / "CODE_STYLE.md")}}
            result = subprocess.run(found[0], input=json.dumps(payload), capture_output=True, text=True, check=True)
            output = json.loads(result.stdout)
            assert output["hookSpecificOutput"]["additionalContext"]
            assert "permissionDecision" not in output["hookSpecificOutput"]
        print(f"{name}: installed Pre/Post handlers executed; exit=0")

    config = json.loads((home / ".gemini/config/hooks.json").read_text())["code-taste-house-style"]
    assert config.get("enabled", True)
    assert not config.get("PreToolUse"), "Style hook must not override tool permissions"
    invocation = config["PreInvocation"][0]
    result = subprocess.run(shlex.split(invocation["command"]), input=json.dumps({"workspacePaths": [str(ROOT)]}),
                            capture_output=True, text=True, check=True)
    assert json.loads(result.stdout)["injectSteps"][0]["ephemeralMessage"]
    print("Antigravity: installed model-context handler executed; no permission gate; exit=0")

    for event, field in (("PreToolUse", "preToolUse"), ("PostToolUse", "postToolUse")):
        path = home / "Documents/Cline/Hooks" / event
        payload = {"hookName": event, "workspaceRoots": [str(ROOT)],
                   field: {"toolName": "write_to_file", "parameters": {"path": "CODE_STYLE.md"}}}
        result = subprocess.run([str(path)], input=json.dumps(payload), capture_output=True, text=True, check=True)
        output = json.loads(result.stdout)
        assert output["cancel"] is False and output["contextModification"]
    print("Cline: installed executable Pre/Post hooks executed; exit=0")
    assert (home / ".roo/rules/code-taste.md").resolve() == ROOT / "CODE_STYLE.md"
    print("Roo: shared style link resolves; rules only, no executable hook")


def main() -> None:
    before = run(
        {
            "hook_event_name": "PreToolUse",
            "tool_name": "apply_patch",
            "tool_input": {"command": "*** Update File: extension/content/content.js\n"},
            "cwd": str(ROOT),
        }
    )
    before_context = before["hookSpecificOutput"]["additionalContext"]
    assert before["hookSpecificOutput"]["hookEventName"] == "PreToolUse"
    assert "extension/content/content.js" in before_context
    assert "preserve behavior" in before_context

    after = run(
        {
            "hook_event_name": "PostToolUse",
            "tool_name": "Write",
            "tool_input": {"file_path": str(ROOT / "CODE_STYLE.md")},
            "tool_response": {"filePath": str(ROOT / "CODE_STYLE.md")},
            "cwd": str(ROOT),
        }
    )
    after_context = after["hookSpecificOutput"]["additionalContext"]
    assert after["hookSpecificOutput"]["hookEventName"] == "PostToolUse"
    assert "diff-check=" in after_context
    assert "micro-review" in after_context

    zcode_after = run(
        {
            "hook_event_name": "AfterTool",
            "tool_name": "replace",
            "tool_input": {"path": str(ROOT / "CODE_STYLE.md")},
            "cwd": str(ROOT),
        }
    )
    zcode_context = zcode_after["hookSpecificOutput"]["additionalContext"]
    assert zcode_after["hookSpecificOutput"]["hookEventName"] == "AfterTool"
    assert "Tool=replace" in zcode_context

    antigravity_before = run(
        {
            "toolCall": {
                "name": "replace_file_content",
                "args": {"TargetFile": str(ROOT / "CODE_STYLE.md")},
            },
            "workspacePaths": [str(ROOT)],
        },
        ["--event", "PreToolUse"],
    )
    assert antigravity_before["decision"] == "ask"
    assert "replace_file_content" in antigravity_before["reason"]

    antigravity_after = run(
        {
            "toolCall": {
                "name": "replace_file_content",
                "args": {"TargetFile": str(ROOT / "CODE_STYLE.md")},
            },
            "workspacePaths": [str(ROOT)],
        },
        ["--event", "PostToolUse"],
    )
    assert antigravity_after == {}

    hermes_before = run(
        {
            "hook_event_name": "pre_tool_call",
            "tool_name": "write_file",
            "tool_input": {"path": str(ROOT / "CODE_STYLE.md")},
            "cwd": str(ROOT),
        }
    )
    assert hermes_before == {}

    hermes_after = run(
        {
            "hook_event_name": "post_tool_call",
            "tool_name": "patch",
            "tool_input": {"path": str(ROOT / "CODE_STYLE.md")},
            "cwd": str(ROOT),
        }
    )
    assert hermes_after == {}

    # Shells can modify files through arbitrary scripts: never guess from command text.
    for command in ("printf text > new.py", "python3 migrate.py", "npm run format"):
        output = run({"hook_event_name": "PostToolUse", "tool_name": "Bash",
                      "tool_input": {"command": command}, "cwd": str(ROOT)})
        assert output.get("hookSpecificOutput"), command

    reminder = run({"workspacePaths": [str(ROOT)]}, ["--event", "PreInvocation"])
    assert reminder["injectSteps"][0]["ephemeralMessage"]
    assert "decision" not in reminder
    reminder = run({"hook_event_name": "pre_llm_call", "cwd": str(ROOT)})
    assert reminder["context"]

    for event, field in (("PreToolUse", "preToolUse"), ("PostToolUse", "postToolUse")):
        cline = run({"hookName": event, "workspaceRoots": [str(ROOT)],
                     field: {"toolName": "write_to_file", "parameters": {"path": "CODE_STYLE.md"}}},
                    ["--client", "cline"])
        assert cline["cancel"] is False
        assert "CODE_STYLE.md" in cline["contextModification"]
    vscode = run({"hook_event_name": "PostToolUse", "tool_name": "replace_string_in_file",
                  "cwd": str(ROOT), "tool_input": {"filePath": str(ROOT / "CODE_STYLE.md")}},
                 ["--client", "vscode"])
    assert "diff-check=pass" in vscode["hookSpecificOutput"]["additionalContext"]
    xcode = run({"hook_event_name": "PostToolUse", "tool_name": "mcp__Xcode__XcodeUpdate",
                 "cwd": str(ROOT), "tool_input": {"filePath": str(ROOT / "CODE_STYLE.md")}},
                ["--client", "all-tools"])
    assert "diff-check=pass" in xcode["hookSpecificOutput"]["additionalContext"]

    spec = importlib.util.spec_from_file_location("installer", INSTALLER)
    assert spec and spec.loader
    installer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(installer)
    config = {"hooks": {"PreToolUse": [{"matcher": "Read", "hooks": [installer._handler(10)]}]}}
    assert installer._append(config, "PreToolUse", "Bash|Edit", 10)
    assert config["hooks"]["PreToolUse"][0]["matcher"] == "Bash|Edit"
    assert not installer._append(config, "PreToolUse", "Bash|Edit", 10)
    config = {"hooks": {"enabled": False}}
    installer._append_zcode(config, "PreToolUse", "Write", 10)
    assert config["hooks"]["enabled"] is False
    checksum = {"type": "process", "command": "/usr/bin/shasum", "args": [str(HOOK)]}
    config = {"hooks": {"events": {"PreToolUse": [{"matcher": "Write", "hooks": [checksum]}]}}}
    installer._append_zcode(config, "PreToolUse", "Write", 10)
    assert any(checksum in group["hooks"] for group in config["hooks"]["events"]["PreToolUse"])
    hermes_yaml = (
        "hooks:\n"
        "  pre_tool_call:\n"
        "    - command: existing-hook\n"
        "  post_tool_call:\n"
        "    - command: \"python3 \\\"/tmp/code_taste_hook.py\\\"\"\n"
        "      matcher: \"write_file\"\n"
        "      timeout: 30\n"
    )
    hermes_yaml, changed = installer._insert_hermes_event(
        hermes_yaml, "pre_tool_call", "write_file|patch|terminal", 10
    )
    assert changed
    assert hermes_yaml.count(installer._yaml_command(installer.COMMAND)) == 1
    hermes_yaml, changed = installer._insert_hermes_event(
        hermes_yaml, "post_tool_call", "write_file|patch|terminal", 30
    )
    assert changed
    hermes_yaml, changed = installer._insert_hermes_event(
        hermes_yaml, "post_tool_call", "write_file|patch|terminal", 30
    )
    assert not changed

    annotated = "hooks: # existing user hooks\n  pre_tool_call:\n    - command: user-safety-hook\n"
    updated, changed = installer._insert_hermes_event(annotated, "pre_tool_call", "write_file", 10)
    parsed = subprocess.run(["ruby", "-ryaml", "-rjson", "-e", "puts JSON.generate(YAML.safe_load(STDIN.read))"],
                            input=updated, capture_output=True, text=True, check=True)
    entries = json.loads(parsed.stdout)["hooks"]["pre_tool_call"]
    assert any(entry["command"] == "user-safety-hook" for entry in entries)
    assert len(entries) == 2

    assert run({"hook_event_name": "PostToolUse", "tool_name": "Read"}) == {}

    # Exercise real Git whitespace detection for both tracked changes and new files.
    with tempfile.TemporaryDirectory(prefix="code-taste-check-") as directory:
        root = Path(directory)
        subprocess.run(["git", "init", "-q", directory], check=True)
        file = root / "sample.py"
        payload = {"hook_event_name": "PostToolUse", "tool_name": "Write",
                   "tool_input": {"file_path": str(file)}, "cwd": directory}
        file.write_text("value = 1  \n")
        output = run(payload)["hookSpecificOutput"]["additionalContext"]
        assert "diff-check=fail" in output, output
        nested = root / "nested"
        nested.mkdir()
        (nested / "relative.py").write_text("answer = 42  \n")
        nested_payload = {"hook_event_name": "PostToolUse", "tool_name": "apply_patch", "cwd": str(nested),
                   "tool_input": {"command": "*** Update File: relative.py\n"}}
        output = run(nested_payload)["hookSpecificOutput"]["additionalContext"]
        assert "diff-check=fail" in output, output
        file.write_text("value = 1\n")
        output = run(payload)["hookSpecificOutput"]["additionalContext"]
        assert "diff-check=pass" in output, output
        subprocess.run(["git", "-C", directory, "add", "sample.py"], check=True)
        file.write_text("value = 2  \n")
        output = run(payload)["hookSpecificOutput"]["additionalContext"]
        assert "diff-check=fail" in output, output
    print("code_taste_hook runtime smoke: PASS")


if __name__ == "__main__":
    main()
    if "--installed" in sys.argv:
        installed_checks()
