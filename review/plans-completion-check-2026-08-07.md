<!-- date: 2026-08-07 -->
<!-- source: chat:plans-completion · user: check all plans done; finish remaining; commit+push -->
<!-- title: Plans completion check (disk vs wiki) -->

# Plans completion check — 2026-08-07

Disk wins. Spot-checked symbols/files; updated stale plan frontmatter where code already shipped.

## Matrix

| Plan | Status | Evidence |
|------|--------|----------|
| `flatten-repo-layout-2026-08-05` | **done** | Flat `extension/` `local-bridge/` …; execute review 08-05; bottom checklist ticked |
| `p0-data-loss-fixes-2026-08-04` | **done** | `Vocabulary.upsert`, `ScriptDTO.rev/deviceId`, `caption-studio-vocab.json`, UUID cue ids, `project.yml` |
| `p0-data-loss-fixes-2026-08-05` | **done** | `DriveScriptsService.mergedCues` + dirty; Backup single-save; `DRIVE_RESTORED` rev guard |
| `auto-dich-sau-edit-2026-07-28` | **partial** | Ownership / Enter-only / autoOpen / tombstones live. **Gap:** JA Enter → `enrichTokensAfterImport` (`/tokenize_batch`) only — no `/translate` / `/translate_segment` on bridge; NLLB path absent on disk |
| `drive-folder-mirror-2026-08-02` | **done** | `mirrorToDrive`; iPad `DriveScriptsService` |
| `overlay-multi-sub-2026-08-02` | **done** | `setShowOnVideo` OFF no longer closes panel; `enCues`/`viCues` fill |
| `timeline-yt-multi-sub-2026-08-02` | **done** | todos completed; secondary enrich + scroll parity |
| `yt-write-all-subs-2026-08-02` | **done** | SW multi-track + union merge path |
| `next-prev-settings-drive-2026-08-02` | **done** | `goBack`/`goForward`; `SettingsSync`; `scrollActiveIntoView` |
| `normalize-docs-and-errors-2026-08-02` | **done** | walkthrough + errors.log todos completed |
| `iphone-app-normalized-2026-08-02` | **done** | FS path shipped; later iPad-style app-maximize preferred on device (intentional) |
| `ipad-build-run-signing-2026-08-02` | **done** (ops) | renew/backup/UI done; first Xcode Trust = manual (`FIRST_RUN.md`) |
| `bridge-ram-sqlite-2026-08-01` | **done** | Was pending in YAML — code already: SQLite `dictionary.py`, `build_dict_sqlite.py`, passive `/health`, lazy Sudachi, `mem_limit: 512m`. Smoke: `PYTHONPATH=. python tests/test_sqlite_parity.py` ✅ |
| `ipad-mvp-feature-parity-2026-08-02` | **done** | Was pending — watch-page clock/`__csSeek`, SFX normalize, `scheduleSave`, bundled `dict.sqlite` + UI lookup |
| `master-caption-translate-2026-07-28` | **core done / backlog cancelled** | Remaining = YAGNI (edits.jsonl, undo, skills-meta ceremony) |
| `multi-agent-review-plan-2026-07-29` | **obsolete** | Process-only; reviews under `review/*-2026-07-29.md`; `.agents/` removed |
| `ipad-app-review-and-fix-plan-2026-08-04` | **P0 done / polish open** | #1–#5 via P0 08-04; #6–#24 polish left (YAGNI this pass) |

## Not in plan scope (still open)

- `review/local-bridge-audit-2026-08-06.md` — 10/10 ALIVE; **no plan** asks for fixes → left open.
- Wiki “Open gaps” from Fable: extension cue-merge depth, silent `try? save`, ATS, etc.

## This pass coded?

No product feature code — inventory found remaining “pending” plans already implemented. Updated plan tickboxes/status + wiki + this review only.

## Smoke

```bash
cd local-bridge && PYTHONPATH=. .venv/bin/python tests/test_sqlite_parity.py
# ✅ Parity test passed
```
