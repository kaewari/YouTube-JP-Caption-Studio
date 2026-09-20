<!-- date: 2026-09-20 -->
<!-- source: chat:current · user: research plan and hook for code-taste migration -->

# Agent code-taste migration — research and plan

## Scope

This is an independent research pass. It does not migrate production code or install a hook. The worktree already contains unrelated user changes; any future migration must start from a cleanly recorded baseline and must not reformat generated output as source.

Current source families observed on disk: JavaScript/TypeScript/TSX, Python, Swift, and Go. No project-local `.codex/hooks.json`, inline hook table, Git hook directory, or formatter configuration was found in the inspected paths.

## Core conclusion

“Code có gu” should be turned into a small set of observable invariants plus representative examples, then enforced mechanically. Do not attempt one aesthetic across languages. Preserve behavior, public names, platform conventions, and existing local consistency unless the migration explicitly changes them.

The house style should have three layers:

1. **Taste rules**: naming by domain, clear control flow, one source of truth, explicit boundaries, small diffs, no speculative abstractions, comments that explain why, and no unrelated cleanup.
2. **Language rules**: the native/established formatter and linter for each language, pinned and run only on eligible source files.
3. **Workflow rules**: Codex hook for immediate feedback, Git pre-commit for local enforcement, and CI as the authoritative gate.

## Migration plan

### Phase 0 — baseline and scope

- Record the current worktree state and identify pre-existing edits before any migration work.
- Classify source, tests, scripts, generated artifacts, vendored files, runtime data, and build output.
- Explicitly exclude generated paths such as built extension/popup output and Next.js output unless a separate generated-artifact task is approved.
- Pick one representative directory per language and run formatters in check/diff mode before changing anything.

### Phase 1 — write the house style

- Keep root `AGENTS.md` as a short index: workflow, taste invariants, source-of-truth links, and required checks.
- Put deeper rules in language/domain-specific documents only where the repository needs them; avoid a monolithic instruction file.
- For every rule, write: bad pattern, preferred pattern, exception, and the check that detects it.
- Convert repeated review comments into either a lint rule, a structural test, or a concise `AGENTS.md` rule.

### Phase 2 — establish tool ownership by language

- JavaScript/TypeScript/TSX/CSS/HTML/JSON/Markdown: use the repository-pinned Prettier configuration for formatting and ESLint/TypeScript checks for semantics and policy.
- Python: use PEP 8 as the style baseline, then the formatter/linter already supported by the project; do not invent a second Python dialect in the migration.
- Swift: use `swift-format` with a checked-in configuration compatible with the installed Swift toolchain; use Swift API naming/documentation guidelines for public API taste.
- Go: use `gofmt`/`go fmt` and Go’s naming/comment conventions.
- If a tool is not installed or pinned, stop that language’s migration at a plan/check-only step; do not add a dependency merely to make the migration look complete.

### Phase 3 — migrate in small, behavior-preserving slices

Recommended order:

1. shared JavaScript/TypeScript utilities and tests;
2. extension source, side panel, and content scripts;
3. Saved Items source (excluding generated `out/` and `.next/` output);
4. local-bridge Python source/tests;
5. iPhone/iPad/macOS Swift source/tests;
6. the Go review tool;
7. docs and configuration.

For each slice: freeze behavior with existing tests/smoke checks, format only that slice, apply semantic cleanup only when a taste rule justifies it, run the relevant checks, inspect `git diff --check`, and obtain an independent review. Never mix a broad formatting rewrite with a behavior fix.

### Phase 4 — acceptance criteria

- No behavior/API change unless explicitly listed in the slice.
- No generated artifact is hand-edited as source of truth.
- Every changed file is covered by the right formatter/linter or has a documented reason for exclusion.
- New rules have a runnable check; subjective preferences remain review guidance, not brittle regex tests.
- The migration reduces duplicate state/helpers and unclear names without introducing speculative abstractions.
- The final diff is attributable by file and language, with no unexplained changes.

## Proposed Codex hook (design only; not installed)

Use both pre- and post-tool hooks. The pre-hook gives the agent the taste contract and can deny clearly out-of-scope edits. The post-hook checks only the files changed by that tool call and returns concise remediation context. It must not auto-format in place: automatic mutation inside a post-hook can hide the actual patch and create edit loops.

Illustrative `.codex/hooks.json`:

```json
{
  "description": "House-style guardrails for Codex edits",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^apply_patch$|^Edit$|^Write$|^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/bin/python3 \"$(git rev-parse --show-toplevel)/.codex/hooks/house_style.py\" --before",
            "timeout": 10,
            "statusMessage": "Checking house-style edit policy"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "^apply_patch$|^Edit$|^Write$|^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/bin/python3 \"$(git rev-parse --show-toplevel)/.codex/hooks/house_style.py\" --after",
            "timeout": 60,
            "statusMessage": "Checking changed files against house style",
            "additionalContextLimit": 2500
          }
        ]
      }
    ]
  }
}
```

The future `house_style.py` should:

- read one JSON object from stdin;
- use the documented `tool_name` and `tool_input` fields;
- keep a short before-edit baseline so pre-existing dirty files are not reported as the current patch;
- on `--before`, inject the relevant rule summary and deny only explicit policy violations (for example, generated-output edits or edits outside the requested scope);
- on `--after`, run `git diff --check` and language-specific **check** commands only for the changed source files;
- return a small JSON `additionalContext` summary; return a blocking PostToolUse decision only when a check fails and the model must fix it;
- never print secrets, dump full files, or rewrite files;
- exit cleanly when a changed file is intentionally excluded, with the exclusion reason visible.

The hook is not the final enforcement boundary. Add a repository Git `pre-commit` check and CI checks using the same commands. Configure Git hooks through a reviewed `core.hooksPath` if a shared hook directory is adopted; document how developers can inspect the effective configuration.

## Evidence table

| Source | Exact claim relevant to the plan | Plan consequence | Hook risk/limitation |
|---|---|---|---|
| [OpenAI Codex Hooks](https://developers.openai.com/ja-JP/docs/hooks) | `PreToolUse` can intercept `Bash`, `apply_patch`, MCP, and other local tools; `apply_patch` may be matched as `apply_patch`, `Edit`, or `Write`. | Match all documented local edit paths and inspect `tool_name`/`tool_input`. | Some specialized tool paths may bypass the default hook path; hooks are guardrails, not complete control. `PostToolUse` cannot undo side effects. |
| [OpenAI Codex Hooks — configuration](https://developers.openai.com/ja-JP/docs/config-file/config-advanced) | Hooks can live in `hooks.json` or inline config; project hooks load only when the project config layer is trusted; multiple matching layers are combined. | Prefer one reviewed project `hooks.json`, verify trust, and avoid duplicate definitions. | An untrusted project silently loses project-local coverage; user/system hooks and other layers may still run, producing surprising behavior. |
| [OpenAI AGENTS.md](https://developers.openai.com/es-419/docs/agent-configuration/agents-md) | Instructions are loaded hierarchically from global to project/subdirectory scope, with nearer files taking precedence; combined instructions have a size limit. | Keep root `AGENTS.md` short and use it as a map to deeper source-of-truth rules. | A giant style manual can be truncated or become stale; instructions alone do not mechanically enforce taste. |
| [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/) | OpenAI describes using repository knowledge, mechanical linters/structural tests, and “taste invariants” to keep agent-generated code coherent. | Encode repeated taste feedback as checks, not only prose; run cleanup incrementally. | Mechanical rules can overconstrain local design and still miss semantic quality; preserve human/independent review. |
| [Git githooks](https://git-scm.com/docs/githooks) and [git-config `core.hooksPath`](https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath) | Git runs executable hooks at Git lifecycle points, with the default directory changeable by `core.hooksPath`; non-executable hooks are ignored. | Use Git pre-commit as a second enforcement layer and verify the effective hook path. | Git hooks run at Git events, not every editor/Codex file edit; they can be uninstalled, ignored, or disabled via configuration. |
| [PEP 8](https://peps.python.org/pep-0008/) | Project-specific style takes precedence; consistency within a project/module/function matters more than blindly following the document. | Use PEP 8 as Python baseline but preserve local compatibility and existing coherent regions. | A whole-repo rewrite can reduce local consistency or break compatibility while appearing stylistically “clean.” |
| [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/) and [swift-format](https://github.com/swiftlang/swift-format) | Swift prioritizes clarity at the point of use over brevity; `swift-format` can lint/format and supports a checked configuration. | Review Swift names/API shape separately from mechanical formatting; pin formatter/toolchain compatibility. | Formatter versions/configuration drift can create noisy diffs or fail to parse newer syntax. |
| [Go Effective Go](https://go.dev/doc/effective_go) | Go uses `gofmt`/`go fmt` for standard formatting and established naming/comment conventions. | Treat Go formatting as deterministic and keep semantic review separate. | `gofmt` does not decide architecture, API taste, or whether a refactor preserves behavior. |
| [Prettier option philosophy](https://prettier.io/docs/option-philosophy), [Prettier API](https://prettier.io/docs/api), and [ESLint configuration](https://eslint.org/docs/latest/use/configure/) | Prettier is intentionally opinionated and provides `check`; ESLint is configurable through rules/config files. | Pin one Prettier config and use ESLint for semantic/project policy rather than endless formatting options. | Prettier rewrites formatting broadly; run it only on scoped source files, never generated output. ESLint can be configured inconsistently across nested directories. |
| [TypeScript Do’s and Don’ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html) | TypeScript warns against `any` outside an intentional migration and recommends safer primitive/`unknown` choices. | Include type-safety cleanup as a separate semantic phase, not as a formatting pass. | A blanket `any` ban may block legitimate boundary/migration code; require documented exceptions. |

## Decision

Proceed with a behavior-preserving, language-aware migration. Install the proposed hook only after its script has a real smoke test covering: `apply_patch`, a Bash command that edits, a read-only Bash command, a generated-file exclusion, a pre-existing dirty file, a formatter failure, and a clean pass. Treat CI and Git checks as the enforcement backstop because no hook system covers every possible file-writing path.
