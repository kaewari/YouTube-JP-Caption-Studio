# Wiki index — plans & reviews

LLM-maintained layer over immutable `plan/` and `review/` (Karpathy LLM-wiki pattern).  
**You read; the LLM writes.** Schema: root [`AGENTS.md`](../AGENTS.md) §4.

## Navigation

| Page | Summary |
|------|---------|
| [log.md](log.md) | Append-only ingest / query / lint timeline |
| [topics/repo-layout.md](topics/repo-layout.md) | Folder map + skill catalog + knowledge map §G — **xong** (flatten 2026-08-05) |
| [topics/flatten-repo-layout.md](topics/flatten-repo-layout.md) | Flatten + skills keep (ponytail, codegraph, 3 domain) — **xong** (2026-08-05) |
| [topics/p0-data-loss.md](topics/p0-data-loss.md) | Drive cue-merge + backup + extension rev guard — **done** (2026-08-05) |
| [topics/local-bridge-audit.md](topics/local-bridge-audit.md) | Bridge audit 2026-08-06 — **10/10 findings còn ALIVE, chưa fix** |
| [topics/plans-completion.md](topics/plans-completion.md) | Inventory 17 plans — **product plans done / YAGNI cancelled** (2026-08-07) |
| [upstream/karpathy-llm-wiki.md](upstream/karpathy-llm-wiki.md) | Karpathy LLM-wiki gist (concept) |

## Active / recent work

| Status | Topic | Plan | Review |
|--------|-------|------|--------|
| done | Plans completion inventory | all `plan/*.md` | [review/plans-completion-check-2026-08-07.md](../review/plans-completion-check-2026-08-07.md) |
| open | Local-bridge audit (10/10 ALIVE, chưa fix — no plan) | — | [review/local-bridge-audit-2026-08-06.md](../review/local-bridge-audit-2026-08-06.md) |
| done | Flatten repo layout | [plan/flatten-repo-layout-2026-08-05.md](../plan/flatten-repo-layout-2026-08-05.md) | [review/flatten-repo-layout-execute-2026-08-05.md](../review/flatten-repo-layout-execute-2026-08-05.md) |
| done | P0 data-loss (cue-merge) | [plan/p0-data-loss-fixes-2026-08-05.md](../plan/p0-data-loss-fixes-2026-08-05.md) | [review/p0-data-loss-fixes-review-2026-08-05.md](../review/p0-data-loss-fixes-review-2026-08-05.md) |
| done | P0 DeepSeek vocab/rev DTO | [plan/p0-data-loss-fixes-2026-08-04.md](../plan/p0-data-loss-fixes-2026-08-04.md) | [review/p0-fixes-report-2026-08-04.md](../review/p0-fixes-report-2026-08-04.md) |
| source | Full codebase review (Fable) | — | [review/codebase-review-2026-08-04.md](../review/codebase-review-2026-08-04.md) |

## Raw catalogs (immutable)

Do not rewrite these from the wiki. Link only.

### Plans (`plan/`)

- [auto-dich-sau-edit-2026-07-28.md](../plan/auto-dich-sau-edit-2026-07-28.md)
- [bridge-ram-sqlite-2026-08-01.md](../plan/bridge-ram-sqlite-2026-08-01.md)
- [drive-folder-mirror-2026-08-02.md](../plan/drive-folder-mirror-2026-08-02.md)
- [flatten-repo-layout-2026-08-05.md](../plan/flatten-repo-layout-2026-08-05.md)
- [ipad-app-review-and-fix-plan-2026-08-04.md](../plan/ipad-app-review-and-fix-plan-2026-08-04.md)
- [ipad-build-run-signing-2026-08-02.md](../plan/ipad-build-run-signing-2026-08-02.md)
- [ipad-mvp-feature-parity-2026-08-02.md](../plan/ipad-mvp-feature-parity-2026-08-02.md)
- [iphone-app-normalized-2026-08-02.md](../plan/iphone-app-normalized-2026-08-02.md)
- [master-caption-translate-2026-07-28.md](../plan/master-caption-translate-2026-07-28.md)
- [multi-agent-review-plan-2026-07-29.md](../plan/multi-agent-review-plan-2026-07-29.md)
- [next-prev-settings-drive-2026-08-02.md](../plan/next-prev-settings-drive-2026-08-02.md)
- [normalize-docs-and-errors-2026-08-02.md](../plan/normalize-docs-and-errors-2026-08-02.md)
- [overlay-multi-sub-2026-08-02.md](../plan/overlay-multi-sub-2026-08-02.md)
- [p0-data-loss-fixes-2026-08-04.md](../plan/p0-data-loss-fixes-2026-08-04.md)
- [p0-data-loss-fixes-2026-08-05.md](../plan/p0-data-loss-fixes-2026-08-05.md)
- [timeline-yt-multi-sub-2026-08-02.md](../plan/timeline-yt-multi-sub-2026-08-02.md)
- [yt-write-all-subs-2026-08-02.md](../plan/yt-write-all-subs-2026-08-02.md)

### Reviews (`review/`)

- [bridge-refactor-review-pass-2026-07-29.md](../review/bridge-refactor-review-pass-2026-07-29.md)
- [bugbot-review-2026-08-01.md](../review/bugbot-review-2026-08-01.md)
- [codebase-review-2026-07-29.md](../review/codebase-review-2026-07-29.md)
- [codebase-review-2026-08-04.md](../review/codebase-review-2026-08-04.md)
- [deepseek-ipad-code-review-2026-08-04.md](../review/deepseek-ipad-code-review-2026-08-04.md)
- [deepseek-ipad-review-eval-2026-08-04.md](../review/deepseek-ipad-review-eval-2026-08-04.md)
- [extension-web-refactor-review-pass-2026-07-29.md](../review/extension-web-refactor-review-pass-2026-07-29.md)
- [multi-model-desktop-bugs-perf-2026-08-03.md](../review/multi-model-desktop-bugs-perf-2026-08-03.md)
- [p0-data-loss-fixes-review-2026-08-05.md](../review/p0-data-loss-fixes-review-2026-08-05.md)
- [p0-fixes-report-2026-08-04.md](../review/p0-fixes-report-2026-08-04.md)
- [flatten-repo-layout-execute-2026-08-05.md](../review/flatten-repo-layout-execute-2026-08-05.md)
- [local-bridge-audit-2026-08-06.md](../review/local-bridge-audit-2026-08-06.md)
- [plans-completion-check-2026-08-07.md](../review/plans-completion-check-2026-08-07.md)

## Open gaps (from Fable review, not in closed P0)

Tracked lightly until ingested into their own topic pages:

- Extension cue-merge (only rev-skip today)
- `try? context.save()` silent fail after Drive push
- iPhone fullscreen pinning drift
- postMessage / OAuth state / ATS / cue-id Dictionary crash
