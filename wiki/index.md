# Wiki index — plans & reviews

LLM-maintained layer over immutable `plan/` and `review/` (Karpathy LLM-wiki pattern).  
**You read; the LLM writes.** Schema: root [`CLAUDE.md`](../CLAUDE.md).

## Navigation

| Page | Summary |
|------|---------|
| [log.md](log.md) | Append-only ingest / query / lint timeline |
| [topics/repo-layout.md](topics/repo-layout.md) | Folder map + skill catalog + knowledge map §G — **xong** (flatten 2026-08-05) |
| [topics/p0-data-loss.md](topics/p0-data-loss.md) | Drive cue-merge + backup + extension rev guard — **done** (2026-08-05) |
| [topics/local-bridge-audit.md](topics/local-bridge-audit.md) | Bridge audit 2026-08-06 — **5/10 fixed, LB-6 tracked in perf audit, 4/10 open** |
| [topics/plans-completion.md](topics/plans-completion.md) | Inventory 17 plans — **product plans done / YAGNI cancelled** (2026-08-07) |
| [topics/codebase-review-2026-08-07.md](topics/codebase-review-2026-08-07.md) | Full source review — **closed** (2026-08-07): C1/H1–H8/M1–M10 all fixed |
| [topics/sub-load-furigana-100ms.md](topics/sub-load-furigana-100ms.md) | Sub load nhanh + furigana/level ≤100 ms — **done** (T1–T5 verified 2026-08-20) |
| [topics/netflix-support.md](topics/netflix-support.md) | Netflix subtitle support (DFXP/TTML + player hooks) — **shipped** (2026-08-19) |
| [topics/vietnamese-caption-loading.md](topics/vietnamese-caption-loading.md) | VI caption load fixes + Netflix parallel fetch — **shipped code, chờ test thật** (2026-08-21) |
| [topics/codebase-improvements-2026-08-22.md](topics/codebase-improvements-2026-08-22.md) | Codebase improvement plan (behavior-preserving) — **partial** (2026-08-23) |
| [topics/perf-ux-audit-2026-08-23.md](topics/perf-ux-audit-2026-08-23.md) | Multi-agent perf sweep + UX benchmark — **open** (2026-08-23) |
| [topics/overlay-resize-and-dual-subtitles.md](topics/overlay-resize-and-dual-subtitles.md) | Overlay resize + dual subtitles — **done** (2026-09-19) |
| [topics/studio-caption-fixes-and-ux-optimization.md](topics/studio-caption-fixes-and-ux-optimization.md) | Studio caption fixes, performance & UX optimization — **done** (2026-09-19) |
| [upstream/karpathy-llm-wiki.md](upstream/karpathy-llm-wiki.md) | Karpathy LLM-wiki gist (concept) |

## Active / recent work

| Status | Topic | Plan | Review |
|--------|-------|------|--------|
| done | Studio Caption Fixes, Performance & UX Optimization | [plan/studio-caption-fixes-and-ux-optimization-2026-09-19.md](../plan/studio-caption-fixes-and-ux-optimization-2026-09-19.md) | [review/code-review-2026-09-19.md](../review/code-review-2026-09-19.md) |

## Raw catalogs (immutable)

Do not rewrite these from the wiki. Link only.

### Plans (`plan/`)

- [auto-dich-sau-edit-2026-07-28.md](../plan/auto-dich-sau-edit-2026-07-28.md)
- [bridge-ram-sqlite-2026-08-01.md](../plan/bridge-ram-sqlite-2026-08-01.md)
- [codebase-improvement-plan-2026-08-22.md](../plan/codebase-improvement-plan-2026-08-22.md)
- [codebase-improvement-plan-2026-08-23.md](../plan/codebase-improvement-plan-2026-08-23.md)
- [codebase-improvement-plan-2026-08-26.md](../plan/codebase-improvement-plan-2026-08-26.md)
- [drive-folder-mirror-2026-08-02.md](../plan/drive-folder-mirror-2026-08-02.md)
- [fix-caption-throttle-stall-2026-08-24.md](../plan/fix-caption-throttle-stall-2026-08-24.md)
- [fix-missing-netflix-subs-2026-08-21.md](../plan/fix-missing-netflix-subs-2026-08-21.md)
- [fix-sidepanel-format-and-jp-only-overlay-2026-09-19.md](../plan/fix-sidepanel-format-and-jp-only-overlay-2026-09-19.md)
- [fix-sub-loading-blackout-2026-08-21.md](../plan/fix-sub-loading-blackout-2026-08-21.md)
- [fix-sub-loading-multitab-sidepanel-ui-2026-08-21.md](../plan/fix-sub-loading-multitab-sidepanel-ui-2026-08-21.md)
- [fix-yt-timedtext-empty-caption-2026-08-24.md](../plan/fix-yt-timedtext-empty-caption-2026-08-24.md)
- [flatten-repo-layout-2026-08-05.md](../plan/flatten-repo-layout-2026-08-05.md)
- [ipad-app-review-and-fix-plan-2026-08-04.md](../plan/ipad-app-review-and-fix-plan-2026-08-04.md)
- [ipad-build-run-signing-2026-08-02.md](../plan/ipad-build-run-signing-2026-08-02.md)
- [ipad-mvp-feature-parity-2026-08-02.md](../plan/ipad-mvp-feature-parity-2026-08-02.md)
- [iphone-app-normalized-2026-08-02.md](../plan/iphone-app-normalized-2026-08-02.md)
- [master-caption-translate-2026-07-28.md](../plan/master-caption-translate-2026-07-28.md)
- [multi-agent-review-plan-2026-07-29.md](../plan/multi-agent-review-plan-2026-07-29.md)
- [netflix-caption-fixes-2026-08-19.md](../plan/netflix-caption-fixes-2026-08-19.md)
- [netflix-caption-support-2026-08-19.md](../plan/netflix-caption-support-2026-08-19.md)
- [netflix-en-vi-caption-fix-2026-08-21.md](../plan/netflix-en-vi-caption-fix-2026-08-21.md)
- [netflix-replay-and-edit-fixes-2026-08-20.md](../plan/netflix-replay-and-edit-fixes-2026-08-20.md)
- [next-prev-settings-drive-2026-08-02.md](../plan/next-prev-settings-drive-2026-08-02.md)
- [normalize-docs-and-errors-2026-08-02.md](../plan/normalize-docs-and-errors-2026-08-02.md)
- [optimize-sub-loading-speed-2026-08-21.md](../plan/optimize-sub-loading-speed-2026-08-21.md)
- [overlay-multi-sub-2026-08-02.md](../plan/overlay-multi-sub-2026-08-02.md)
- [p0-data-loss-fixes-2026-08-04.md](../plan/p0-data-loss-fixes-2026-08-04.md)
- [p0-data-loss-fixes-2026-08-05.md](../plan/p0-data-loss-fixes-2026-08-05.md)
- [studio-caption-fixes-and-ux-optimization-2026-09-19.md](../plan/studio-caption-fixes-and-ux-optimization-2026-09-19.md)
- [sub-load-furigana-100ms-2026-08-08.md](../plan/sub-load-furigana-100ms-2026-08-08.md)
- [timeline-yt-multi-sub-2026-08-02.md](../plan/timeline-yt-multi-sub-2026-08-02.md)
- [vietnamese-caption-fixes-2026-08-21.md](../plan/vietnamese-caption-fixes-2026-08-21.md)
- [yt-write-all-subs-2026-08-02.md](../plan/yt-write-all-subs-2026-08-02.md)

### Reviews (`review/`)

- [bridge-refactor-review-pass-2026-07-29.md](../review/bridge-refactor-review-pass-2026-07-29.md)
- [bugbot-review-2026-08-01.md](../review/bugbot-review-2026-08-01.md)
- [code-review-2026-09-19.md](../review/code-review-2026-09-19.md)
- [codebase-review-2026-07-29.md](../review/codebase-review-2026-07-29.md)
- [codebase-review-2026-08-04.md](../review/codebase-review-2026-08-04.md)
- [codebase-review-2026-08-07.md](../review/codebase-review-2026-08-07.md)
- [codebase-review-2026-08-23.md](../review/codebase-review-2026-08-23.md)
- [deepseek-ipad-code-review-2026-08-04.md](../review/deepseek-ipad-code-review-2026-08-04.md)
- [deepseek-ipad-review-eval-2026-08-04.md](../review/deepseek-ipad-review-eval-2026-08-04.md)
- [extension-web-refactor-review-pass-2026-07-29.md](../review/extension-web-refactor-review-pass-2026-07-29.md)
- [fix-missing-netflix-subs-review-2026-08-21.md](../review/fix-missing-netflix-subs-review-2026-08-21.md)
- [fix-sub-loading-blackout-review-2026-08-21.md](../review/fix-sub-loading-blackout-review-2026-08-21.md)
- [flatten-repo-layout-execute-2026-08-05.md](../review/flatten-repo-layout-execute-2026-08-05.md)
- [local-bridge-audit-2026-08-06.md](../review/local-bridge-audit-2026-08-06.md)
- [multi-model-desktop-bugs-perf-2026-08-03.md](../review/multi-model-desktop-bugs-perf-2026-08-03.md)
- [netflix-en-vi-caption-fix-review-2026-08-21.md](../review/netflix-en-vi-caption-fix-review-2026-08-21.md)
- [netflix-replay-edit-verify-2026-08-20.md](../review/netflix-replay-edit-verify-2026-08-20.md)
- [netflix-vi-caption-fix-review-2026-08-21.md](../review/netflix-vi-caption-fix-review-2026-08-21.md)
- [optimize-sub-loading-speed-review-2026-08-21.md](../review/optimize-sub-loading-speed-review-2026-08-21.md)
- [p0-data-loss-fixes-review-2026-08-05.md](../review/p0-data-loss-fixes-review-2026-08-05.md)
- [p0-fixes-report-2026-08-04.md](../review/p0-fixes-report-2026-08-04.md)
- [perf-ux-audit-2026-08-23.md](../review/perf-ux-audit-2026-08-23.md)
- [plans-completion-check-2026-08-07.md](../review/plans-completion-check-2026-08-07.md)

## Open gaps

Tracked lightly until ingested into their own topic pages:

- Extension cue-merge (only rev-skip today)
- iPhone fullscreen pinning drift
