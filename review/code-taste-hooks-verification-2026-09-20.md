<!-- date: 2026-09-20 -->
<!-- source: chat:01a0ba87-89de-7a00-a888-514979ef6a90 · user: research, migration plan and automatic edit hooks for all IDEs -->

# Code-taste hooks: verification and remaining requirements

STATUS: NOT VERIFIED for the full all-IDE requirement.

This is the implementing agent's evidence record, not an independent PASS. Independent reviewer
Curie found three defects; all were repaired and added to behavioral tests. The requested independent
re-check stopped at the account usage limit. No production-code migration was performed: the
deliverable is its [plan](../plan/migrate-codebase-to-house-style-2026-09-20.md) and ongoing edit hooks.

## REQUIREMENTS

| Criterion | Expected | Actual / evidence |
|---|---|---|
| Primary-source research | Multiple authoritative sources and rationale | VERIFIED: [research](../plan/agent-code-taste-migration-research-2026-09-20.md) and plan cite OpenAI, Anthropic, Google, Microsoft, Apple, Cline, Hermes, Git, Fowler, PEP 8 and Swift docs |
| Full migration plan | Inventory all owned source; preserve behavior; per-slice checks and review | VERIFIED as a plan: P0–P4, source-family table, acceptance criteria and execution prompt; future migration not claimed complete |
| Concise agent entrypoints | Keep detailed rules outside AGENTS/CLAUDE | No additions to root guides; CODE_STYLE.md is 27 lines. Existing AGENTS.md remains 256 lines; it was not shortened in this task |
| Native edit hooks | Install and execute supported clients' handlers | VERIFIED configuration/handler execution for Codex, Claude, Gemini, ZCode, Antigravity, Hermes, VS Code, Cline; not full live-session verification |
| Codex trust | Active pre/post hooks | Codex TUI session 01a0bba4-eb90-7890-b4a0-370b0689257d displayed Installed=1, Active=1 for both PreToolUse and PostToolUse after individually reviewing/trusting the commands |
| Hermes | Exact hook approvals and working context injection | Production shell-hook runner returned context; doctor output below confirms current scripts/allowlist |
| Preserve existing config | No lost unrelated hooks; no permission bypass | Regression tests preserve ZCode checksum handler, annotated Hermes YAML, disabled flags; installer compares parsed non-managed YAML before writing; Antigravity no longer installs a PreToolUse permission gate |
| Every installed IDE | Automatic edit hook, including Roo and Xcode | NOT VERIFIED: Roo 3.54.0 only supports global rules in inspected code; Xcode is blocked by Apple agreement dialog and has no initialized agent home |
| Independent final review | No unresolved finding after re-check | NOT VERIFIED: reviewer re-check returned a usage-limit error; first review's three reproductions now covered by passing tests |

## COMMANDS

Working directory: `/Users/hoangson/Projects/YouTube JP Caption Studio`.

Command: `python3 scripts/test_code_taste_hook.py --installed` — exit 0; actual stdout:

```text
code_taste_hook runtime smoke: PASS
Codex: installed Pre/Post handlers executed; exit=0
Claude: installed Pre/Post handlers executed; exit=0
Gemini: installed Pre/Post handlers executed; exit=0
ZCode: installed Pre/Post handlers executed; exit=0
VS Code: installed Pre/Post handlers executed; exit=0
Antigravity: installed model-context handler executed; no permission gate; exit=0
Cline: installed executable Pre/Post hooks executed; exit=0
Roo: shared style link resolves; rules only, no executable hook
```

The suite starts real hook processes and creates a temporary Git repository. It checks dirty/clean
new files, tracked files, nested relative edit paths, actual YAML parsing, and configuration merge
behavior. The installed tests run configured commands directly, not an LLM conversation in each IDE.

Command: `hermes hooks doctor` — exit 0. Actual final stdout line:

```text
All shell hooks look healthy.
```

The full tool output lists six configured hooks; each style hook is allowlisted, unchanged since
approval and produces valid JSON. Only exact style event/command entries were approved; no global
auto-accept flag was enabled.

Command: `git diff --check` — exit 0, stdout/stderr empty.

Command: `python3 -m py_compile scripts/code_taste_hook.py scripts/install_code_taste_hooks.py scripts/test_code_taste_hook.py`
— exit 0, stdout/stderr empty (syntax verification only).

Command: `git diff --exit-code -- AGENTS.md CLAUDE.md` — exit 0, stdout/stderr empty.

Command: `python3 scripts/install_code_taste_hooks.py --dry-run` — exit 0; actual stdout:

```text
EXISTS /Users/hoangson/.codex/hooks.json
EXISTS /Users/hoangson/.claude/settings.json
EXISTS /Users/hoangson/.gemini/settings.json
EXISTS /Users/hoangson/.zcode/cli/config.json
EXISTS /Users/hoangson/.gemini/config/hooks.json
EXISTS /Users/hoangson/.hermes/config.yaml
EXISTS /Users/hoangson/.hermes/shell-hooks-allowlist.json
EXISTS /Users/hoangson/.copilot/hooks/code-taste.json
EXISTS /Users/hoangson/Documents/Cline/Hooks/PreToolUse
EXISTS /Users/hoangson/Documents/Cline/Hooks/PostToolUse
EXISTS /Users/hoangson/.roo/rules/code-taste.md (rules only)
NOT VERIFIED Xcode: isolated coding-agent homes are not initialized on this machine
```

API_CHECKS: Not applicable to these local configuration/script changes. No product HTTP success claimed.

DATABASE_CHECKS: Not applicable; no product database changes.

## PROBLEMS / REQUIRED_FIXES

1. User must handle the Xcode and Apple SDKs Agreement visible in Xcode. Then initialize the chosen
   agent and install/test its Xcode-specific configuration; CLI-global config is not evidence for Xcode.
2. Roo's global style-rule link is not an executable lifecycle hook. Full parity requires a supported
   Roo extension mechanism or a separately scoped integration; no unsupported daemon was installed.
3. Complete final independent re-check once reviewer access is available, and collect actual fresh
   session edit evidence for clients beyond the direct handler checks. Never claim the current tests
   establish that every possible edit, external process or manual keystroke triggers a hook.
4. These hooks give guidance and whitespace feedback; semantic quality still requires the plan's
   language checks and independent review. They do not autonomously run a whole-repo migration.
