# Code-taste migration and edit hooks

Status: plan and supported native hooks installed; full all-IDE execution **NOT VERIFIED**.

Sources: [migration plan](../../plan/migrate-codebase-to-house-style-2026-09-20.md),
[independent research](../../plan/agent-code-taste-migration-research-2026-09-20.md).
Evidence and open requirements: [verification](../../review/code-taste-hooks-verification-2026-09-20.md).
Latest state: [live Codex probe](../../review/code-taste-codex-live-probe-2026-09-20.md) and
[other-client probes](../../review/code-taste-other-clients-live-2026-09-20.md), with
[configuration follow-up](../../review/code-taste-hooks-followup-2026-09-20.md).
Criteria: [CODE_STYLE.md](../../CODE_STYLE.md). This task adds no style detail to root AGENTS/CLAUDE.

Implemented: shared [hook](../../scripts/code_taste_hook.py),
[installer](../../scripts/install_code_taste_hooks.py),
[behavioral and installed-handler checks](../../scripts/test_code_taste_hook.py).
Native configurations: Codex, Claude, Gemini, ZCode, Antigravity, Hermes, VS Code, Cline.
Roo has a link to shared style rules, not an executable edit hook.

One real Codex CLI apply_patch event now has native before/after hook delivery evidence in the
session log, with sandbox and persisted hook trust intact. This supersedes the earlier lack of
live Codex evidence, but does not prove every client or every editing mechanism.
Claude CLI now also has native before/after Write context in its real session log. Hermes wrote
the probe and quoted style guidance, but per-edit observer dispatch remains unverified. Gemini
cannot start without configured authentication and trust; ZCode fails before editing due to an
invalid signing credential. Neither client's credentials or trust were changed.

Xcode first-launch check now passes. Isolated Claude/Codex hook configs are prepared and their
commands pass runtime checks; agent installation, login/trust and real session activation remain
unverified. Google/Xcode's isolated hook location remains unverified. Roo still has no native hook.
Independent re-check now reports PASS for the three repaired defects, not for the entire all-IDE
requirement. The older review's agreement/usage-limit blockers are historical, superseded here.
Production-code migration is future work specified by the plan, not performed in this task.

Research reconciliation: the early research's project-hook example is illustrative, not installed.
The live installer uses user-level hooks and Antigravity PreInvocation to avoid granting permissions.
No project Prettier dependency or tracked Go source was found in the inspected manifests/inventory;
those research suggestions are conditional. Tests prove protocol behavior and whitespace handling,
not subjective design quality or a completed codebase migration.
