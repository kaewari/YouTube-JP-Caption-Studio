# P0 data-loss (Drive cue-merge)

Status: **done** (2026-08-05)  
Priority: user data must not be overwritten by Drive / restore / YouTube merge.

## Sources

- Plan: [plan/p0-data-loss-fixes-2026-08-05.md](../../plan/p0-data-loss-fixes-2026-08-05.md)
- Review (verified): [review/p0-data-loss-fixes-review-2026-08-05.md](../../review/p0-data-loss-fixes-review-2026-08-05.md)
- Prior DeepSeek P0 (vocab/rev DTO): [plan/p0-data-loss-fixes-2026-08-04.md](../../plan/p0-data-loss-fixes-2026-08-04.md)
- Origin findings: [review/codebase-review-2026-08-04.md](../../review/codebase-review-2026-08-04.md)

## What shipped

| Todo | Result |
|------|--------|
| `drive-cue-merge` | Dirty per-cue UserDefaults; Drive base + overlay; tombstones; push-after-merge; pull-only no bump; clearDirty after successful put; `pull` clears stale dirty from replace-import |
| `backup-single-save` | One `context.save()` after wipe+insert (iPad+iPhone) |
| `ext-drive-restored-guard` | Skip remove+apply when **raw** chrome.storage rev ≥ disk rev + owned cues |

## Sync behavior (canonical)

- Dirty cue id → local wins (incl. soft-delete)
- Non-dirty → Drive wins
- Same cue id, two editors → LWW that cue
- Different cue ids → both survive

## Still open (not this plan)

- Extension: no per-cue merge yet
- `try? context.save()` after Drive push still swallows errors
- iPhone fullscreen pinning; postMessage / OAuth / ATS / Dictionary crash

## Code anchors

- `ipad-app/Services/DriveScriptsService.swift` (+ iPhone twin)
- `ipad-app/Models/ScriptStore.swift` — `DriveDirty`
- `ipad-app/Services/BackupService.swift` — `apply`
- `extension/content/content.js` — `DRIVE_RESTORED` (path phẳng sau flatten)
