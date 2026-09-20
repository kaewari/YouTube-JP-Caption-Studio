<!-- date: 2026-09-20 -->
<!-- source: chat:01a0ba87-89de-7a00-a888-514979ef6a90 · user: native edit hooks across installed IDEs -->

# Claude, Hermes, Gemini and ZCode live probes

STATUS: NOT VERIFIED for all clients. Claude native Write hook delivery is VERIFIED.

## REQUIREMENTS and evidence

| Client | Actual result | Remaining gap |
|---|---|---|
| Claude Code CLI | Native PreToolUse and PostToolUse delivered house-style context for Write; both hook responses exit 0; file created | Other editing tools and IDE extension sessions not tested here |
| Hermes CLI | Real write_file created six-byte file; agent quoted actual style guidance | Per-edit observer execution was not directly logged; not claimed verified |
| Gemini CLI | Exit 41 before tool execution: missing auth method; temporary folder untrusted | User must configure authentication and review workspace trust |
| ZCode CLI | Exit 1 before tool execution: invalid client signing credential | User must repair/sign in to ZCode; no credential modified by this task |

## COMMANDS

Working directory for Claude and Gemini: `/private/tmp/code-taste-live.tEJESw`.
Exact Claude command (exit 0):

```sh
claude -p --output-format stream-json --verbose --include-hook-events --tools Write,Read --strict-mcp-config --permission-mode acceptEdits --max-budget-usd 0.50 'Integration probe only. Create claude-probe.txt in the current temporary directory containing exactly probe followed by a newline. Do not edit any other file. Use the Write tool. After writing, report whether a house-style hook message was actually delivered before or after the Write call. Quote its first sentence if present, otherwise say NOT OBSERVED. Then stop.'
```

Native stream included `hook_response` for PreToolUse:Write and PostToolUse:Write, with
`exit_code: 0`, `outcome: success`, and the real house-style JSON context. Session:
`e0bebce9-921f-4d63-bbf5-e88bb201fcbf`.

Independent inspection command (exit 0):

```sh
jq -c 'select(.type == "attachment" and .attachment.type == "hook_additional_context" and (.attachment.hookEvent == "PreToolUse" or .attachment.hookEvent == "PostToolUse")) | {hookEvent:.attachment.hookEvent,toolUseID:.attachment.toolUseID,context:.attachment.content}' /Users/hoangson/.claude/projects/-private-tmp-code-taste-live-tEJESw/e0bebce9-921f-4d63-bbf5-e88bb201fcbf.jsonl
```

Actual output contains two context records for `call_608942`, beginning respectively:

```text
House-style gate ran before a tool that may edit files. Tool=Write; intended=/private/tmp/code-taste-live.tEJESw/claude-probe.txt.
House-style gate ran after a tool that may edit files. Tool=Write; touched=/private/tmp/code-taste-live.tEJESw/claude-probe.txt; diff-check=not-run (no Git repository).
```

`cat /private/tmp/code-taste-live.tEJESw/claude-probe.txt` — exit 0, stdout `probe` followed by newline.

Exact Hermes command (exit 0):

```sh
hermes --in /private/tmp/code-taste-live.tEJESw -t file -z 'Integration probe only. Use write_file to create hermes-probe.txt in the current temporary directory containing exactly probe followed by a newline. Do not edit other files or run shell commands. Report whether the model context actually contains code-taste guidance and quote its first sentence if present, otherwise say NOT OBSERVED. Then stop.'
```

Actual stdout:

```text
The model context contains code-taste guidance:

"Code taste: preserve behavior; trace the real flow and callers before editing; reuse existing helpers and standard libraries; prefer clear names, guard clauses and one source of truth; avoid speculative abstractions, dependencies and unrelated cleanup."
```

`cat /private/tmp/code-taste-live.tEJESw/hermes-probe.txt` — exit 0, stdout `probe` followed by newline.
Read-only session-store inspection identified session `20260920_120530_79fc24`, one tool call,
`end_reason: agent_close`. Its real write_file tool response reports `bytes_written: 6`,
`resolved_path: /private/tmp/code-taste-live.tEJESw/hermes-probe.txt`. A successful write and an
agent quote do not by themselves prove execution of both observer hooks.

Exact Gemini command (exit 41):

```sh
gemini --sandbox --approval-mode auto_edit --output-format stream-json --prompt 'Integration probe only. Use write_file to create gemini-probe.txt in the current temporary directory containing exactly probe followed by a newline. Do not edit other files or run shell commands. After writing, report whether a house-style hook message was actually delivered for the edit, quote its first sentence if present, otherwise say NOT OBSERVED. Then stop.'
```

Actual output:

```text
Approval mode overridden to "default" because the current folder is not trusted.
Please set an Auth method in your /Users/hoangson/.gemini/settings.json or specify one of the following environment variables before running: GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA
```

Exact ZCode retry command (exit 1):

```sh
zcode --cwd /private/tmp/code-taste-live.tEJESw --mode edit --disallowed-tools Bash --json --prompt 'Integration probe only. Use Write to create zcode-probe.txt in the current temporary directory containing exactly probe followed by a newline. Do not edit other files or run shell commands. Report whether a house-style hook message was actually delivered before or after Write. Quote its first sentence if present, otherwise say NOT OBSERVED. Then stop.'
```

Actual stderr excerpts:

```text
ClientRequestSigningV4Error: Client signing credential must contain one separator.
Error: Turn execution failed (traceId: 66b5ad7a-4686-4c1b-8bf4-149e553c667c)
```

The initial ZCode attempt additionally supplied `--max-turns 3 --allowed-tools Write,Read`;
the installed 0.16.3 parser rejected `--max-turns` despite advertising it in help. The retry used
only observed supported flags, explicitly edit mode and Bash denied; no yolo or trust bypass.

API_CHECKS: no product API changed. DATABASE_CHECKS: Hermes session database queried read-only;
no product database changed. PROBLEMS / REQUIRED_FIXES: authentication/trust prerequisites above,
Xcode agent setup, remaining UI-client live dispatch, and Roo's lack of native lifecycle hooks.
See [Codex evidence](code-taste-codex-live-probe-2026-09-20.md) and
[configuration follow-up](code-taste-hooks-followup-2026-09-20.md).
