<!-- date: 2026-09-20 -->
<!-- source: chat:01a0ba87-89de-7a00-a888-514979ef6a90 · user: continue all-IDE code-taste hooks -->

# Hook verification follow-up — 11:56 JST

STATUS: NOT VERIFIED for all live IDE sessions; independent three-fix re-check PASS.

This updates the state recorded in [the earlier verification](code-taste-hooks-verification-2026-09-20.md).

## REQUIREMENTS

- Xcode first-launch blocker has cleared: `/usr/bin/xcodebuild -checkFirstLaunchStatus` returned 0,
  with empty stdout/stderr. Its CodingAssistant directory initially contained only `mcp-servers.json`.
- Prepared hook configuration in the isolated `ClaudeAgentConfig/settings.json` and `codex/hooks.json`
  directories documented by [Apple](https://developer.apple.com/documentation/Xcode/extending-and-customizing-agents).
  These contain no copied credentials and make no permission grants. All tools are matched because
  Xcode agents can edit via MCP tools rather than just built-in Edit/Write aliases.
- Installed-handler tests execute both configurations successfully. This proves command/protocol
  readiness, not automatic activation in an Xcode conversation. Agent installation, authentication
  and any hook trust required by that agent still need completion in Xcode.
- Xcode's installed AgentVersions.plist advertises Claude 2.1.220 and Codex 0.145.0 downloads; this is
  not evidence that either runtime is installed or that it loads hooks. Google integration has a
  separate Antigravity ACP download. Its isolated customization location has not been verified;
  no guessed Gemini/Antigravity configuration was written for Xcode.
- Roo remains rules-only. Other clients retain the earlier live-session verification limitations.

## Independent re-check

Reviewer Curie, agent `01a0baba-2716-7200-b946-6cd02c6cb9b5`, returned **PASS limited to the three fixes**.
Its inline runtime reproducer command was `PYTHONDONTWRITEBYTECODE=1 python3 -B -`, exit 0.
Reported actual stdout:

```text
Hermes: real Ruby YAML exit=0; existing user-safety-hook preserved=True
ZCode: unrelated checksum hook preserved=True
Nested cwd: hook reports fail; git diff --check exit=2 (expected whitespace violation)
Original three reproducers: PASS
```

The reviewer made no edits. Its note that Hermes approval refresh remained unapplied was stale:
the main agent's subsequent authorized installer output confirmed the exact style allowlist entries
were updated. This review does not cover the later two Xcode configuration additions.

## COMMANDS

From `/Users/hoangson/Projects/YouTube JP Caption Studio`:

`python3 scripts/test_code_taste_hook.py --installed` — exit 0; actual stdout:

```text
code_taste_hook runtime smoke: PASS
Codex: installed Pre/Post handlers executed; exit=0
Claude: installed Pre/Post handlers executed; exit=0
Gemini: installed Pre/Post handlers executed; exit=0
ZCode: installed Pre/Post handlers executed; exit=0
VS Code: installed Pre/Post handlers executed; exit=0
Xcode Claude: installed Pre/Post handlers executed; exit=0
Xcode Codex: installed Pre/Post handlers executed; exit=0
Antigravity: installed model-context handler executed; no permission gate; exit=0
Cline: installed executable Pre/Post hooks executed; exit=0
Roo: shared style link resolves; rules only, no executable hook
```

`git diff --check` — exit 0, stdout/stderr empty.

API_CHECKS: not applicable; no product/API code changed.

DATABASE_CHECKS: not applicable; no product data changed.

PROBLEMS / REQUIRED_FIXES: initialize and authenticate the chosen Xcode agent, review its hooks,
then collect actual edit-event evidence. Obtain live-session evidence for remaining clients. Roo
needs a supported lifecycle integration for executable parity; its current rules are not that.
