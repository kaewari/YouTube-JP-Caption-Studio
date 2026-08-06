# Plans completion (inventory)

Status: **all product plans done or cancelled/YAGNI** (verified disk 2026-08-07). Polish leftovers + bridge audit findings remain as open gaps (no execute plan).

## Nguồn

- Review: [review/plans-completion-check-2026-08-07.md](../../review/plans-completion-check-2026-08-07.md)
- Plans: all 17 files under [`plan/`](../../plan/)

## Verdict

| Bucket | Plans |
|--------|-------|
| Done (code + todos) | flatten, P0×2, auto-dịch, drive-mirror, overlay, timeline, yt-write-all, next-prev, normalize-docs, iphone-normalized, ipad-build (ops), bridge-ram-sqlite, ipad-mvp |
| Cancelled / obsolete | master backlog nice-to-haves; multi-agent ceremony |
| Partial polish only | ipad-app-review #6–#24 (P0 #1–#5 done) |
| Review-only open (no plan) | local-bridge audit 10 findings |

## Code anchors (spot-check)

- Bridge SQLite: `local-bridge/app/services/dictionary.py`, `app/scripts/build_dict_sqlite.py`, `docker-compose.yml` `mem_limit: 512m`
- P0 cue-merge: `ipad-app/Services/DriveScriptsService.swift` `mergedCues`
- Ext rev guard: `extension/content/content.js` `DRIVE_RESTORED`
- iPad dict/clock: `ipad-app/Resources/dict.sqlite`, `Scripts/user_script.js` `__csSeek`
