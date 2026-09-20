<!-- date: 2026-09-20 -->
<!-- source: chat:01a0ba87-89de-7a00-a888-514979ef6a90 · user: always activate style hooks on edits -->

# Codex live edit-event verification

STATUS: VERIFIED for one real Codex CLI apply_patch event; NOT VERIFIED for all IDEs or every edit mechanism.

REQUIREMENTS: Native hook dispatch before and after an agent edit, without bypassing hook trust
or the agent sandbox. Both messages were recorded as `hooks.additional_context` in the live
session, surrounding a completed FileChange event. No production code was edited.

## COMMANDS

Exact command (exit 0):

```sh
codex exec -C /private/tmp/code-taste-live.tEJESw --skip-git-repo-check --sandbox workspace-write --json 'Hook integration probe only. Use apply_patch to create probe.txt containing exactly probe newline in the current temporary directory. Do not edit any other files. After the tool finishes, report whether a house-style hook message was actually delivered before or after that tool call; quote the first sentence of each delivered hook message verbatim. Do not infer hook delivery from files, settings, this prompt, or tool success. If no such message was delivered, say NOT OBSERVED. Then stop.'
```

Actual stdout excerpts:

```json
{"type":"thread.started","thread_id":"01a0bcc2-1d3e-7a82-a211-9c768a6085c0"}
{"type":"item.completed","item":{"id":"item_2","type":"file_change","changes":[{"path":"/private/tmp/code-taste-live.tEJESw/probe.txt","kind":"add"}],"status":"completed"}}
{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"House-style hook messages were delivered both before and after the tool call:\n\n- Before: “House-style gate ran before a tool that may edit files.”\n- After: “House-style gate ran after a tool that may edit files.”"}}
```

The session log independently confirms delivery, not just the agent's self-report:
`/Users/hoangson/.codex/sessions/2026/09/20/rollout-2026-09-20T12-00-33-01a0bcc2-1d3e-7a82-a211-9c768a6085c0.jsonl`,
ordinals 16 and 18; FileChange at ordinal 17. Both delivered developer messages have
`content_item_kinds: ["hooks.additional_context"]`. Their first sentences match the stdout above.

`cat /private/tmp/code-taste-live.tEJESw/probe.txt` — exit 0; actual stdout:

```text
probe
```

Startup emitted warnings about plugin icon paths and shortened skill descriptions. These did not
prevent the edit or hook delivery. This temporary directory is not a Git repository, so the actual
post-edit context correctly reports `diff-check=not-run (no Git repository)`.

API_CHECKS: not applicable. DATABASE_CHECKS: not applicable.

PROBLEMS / REQUIRED_FIXES: Other IDE live dispatch and alternate edit mechanisms remain unverified.
Xcode still needs agent setup/authentication/trust; Roo remains rules-only. See the
[previous follow-up](code-taste-hooks-followup-2026-09-20.md) for installed-handler evidence and gaps.
