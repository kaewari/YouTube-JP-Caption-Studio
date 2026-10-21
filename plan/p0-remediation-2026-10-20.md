<!-- date: 2026-10-20 -->
<!-- source: chat:audit-p0-remediation · user: spawn agents to understand the project, remember it, fix the P0 findings; new worktree, never master -->

# P0 remediation plan — 2026-10-20

Scope: every P0 of [review/full-codebase-improvement-audit-2026-10-18.md](../review/full-codebase-improvement-audit-2026-10-18.md),
verified against the code before patching. The audit itself is a hypothesis list — two of its
findings were already wrong and one was only half right, so every item was re-checked on disk.

## Worktree

`.claude/worktrees/audit-p0-remediation-20261020`, branch `fix/audit-p0-remediation-20261020`,
based on `fix/audit-p0-20261020` (378e2aeb6). `master` is never a base of this branch.

## Verification commands

| Area | Command |
|---|---|
| Extension unit suites | `node extension/shared/*_test.js`, `node extension/offscreen/audio_capture_test.js`, `node extension/sidepanel/sidepanel_pure_test.js` |
| Bridge | `cd local-bridge && python -m pytest -q tests/ -k "not test_live_ja_android and not test_live_en_watch_html"` |
| Repo root | `python -m pytest -q tests/` |
| Web | `cd web/saved-items && npm run check` |
| Anti-fake gate | `node scripts/verify_no_fake_tests.js` |

`local-bridge` needs the gitignored `data/dict/dict.sqlite` (copy it from the main checkout) —
without it 19 dictionary tests fail for environment reasons, not code reasons.

## Items

### local-bridge

| P0 | Fix |
|---|---|
| Shared SQLite connection across threads → intermittent HTTP 500 | One connection per worker thread; the schema is created once per process (a `PRAGMA journal_mode=WAL` needs an exclusive lock) |
| `/saved/sync` response unbounded | `LIMIT 5000` plus `has_more` / `next_since` so every row stays reachable |
| `/saved/sync` payload unbounded | 413 above 5000 items |
| `DictResponse.hanviet` declared twice | Second declaration removed |
| `Any` used but never imported in `dictionary.py` | Import added |
| `close_dictionary()` only closed the caller's handle | All thread handles are closed |
| ffmpeg decode/DSP without a timeout | `timeout=60` on every `subprocess.run` |
| Caller-supplied title/url could inject a `JA:` cue into the next parse | Title and URL are collapsed onto one line |

### Extension

| P0 | Fix |
|---|---|
| `romaji_kana.js` used an undefined `nextCursor` → every latin keystroke threw | Declared; regression test added |
| Duplicate `BILINGUAL_MAP` keys wiped the JLPT level of だす/たい/欲しい/ほしい | Duplicate entries removed |
| Drive mirror queue lost after a service-worker idle-kill | Persisted list is unioned on write, restored at start, and only really mirrored IDs are dropped |
| Offscreen capture failure was swallowed (`ASR_CAPTURE_ERROR` had no receiver) | The offscreen document rethrows, the worker returns `{ok:false}`, and the content script handles the message |
| Slice timer lost when the offscreen document was suspended | The MediaRecorder timeslice event drives the slice boundary (page timers are throttled there) |
| Offscreen document never closed | Closed after the stop is acknowledged |
| Layout interval never cleared | Cleared on teardown, skipped on hidden tabs and disabled platforms |
| `ev.data` primitives destructured | `typeof` guard |
| `play` listener leaked on every new video element | Removed when the element is replaced |
| Capture started without a tab id | Fail-closed with `no_tab_id` |
| `clear_translations` promised `awaitDisk` | A skipped write no longer reports success |
| Side panel: rows never reordered | Rows are re-appended in cue order when the order drifts |
| Side panel: read-modify-write of the whole settings blob | Only the four owned keys are merged, with a re-read/verify loop |
| Side panel: slider persisted on every tick | Preview on `input`, persist on `change` |
| Side panel: settings modal sections nested | Missing `</div>` added |
| Side panel: Words/Saved tabs wiped on every state push | Re-render is gated on a data signature |
| Side panel: `tabStates` grew forever | Capped and cleaned on tab close |
| Side panel: context highlight could break an HTML entity | The match is located in the raw text, then the pieces are escaped |
| `sentence_candidates_test.js` tested copies of the production code | The test now executes the real functions out of `content.js` |

### Web companion

| P0 | Fix |
|---|---|
| Hydration mismatch in the popup | Server-stable snapshot (`useSyncExternalStore`) |
| Deleted words resurrected by the bridge poll | Tombstones until the upstream map confirms the delete |
| Failed writes reported as "Đã lưu" | The write rejects; a failed bridge push is shown in the note |

### CI and tests

| P0 | Fix |
|---|---|
| Required `bridge-test-suite` structurally red on Linux | The mlx-only endpoint tests skip cleanly; the three pure-logic ASR tests run through a stubbed `mlx_whisper` |
| Handshake integration ignored `BRIDGE_URL` | Read from the environment, default unchanged |
| No CI for the extension suites | New `extension-tests` job runs all of them |
| Repo-root `tests/` orphaned by CI | New `root-tests` job; the drifted benchmark test was repaired |
| Anti-fake gate missed whole directories | `extension/offscreen`, `extension/sidepanel`, `local-bridge/tests` added |

### Housekeeping (audit "deceptive or broken")

No machine-specific paths left (screenshot scripts write to the OS temp dir, the launchd plists
use `~`), the walkthrough only links to screenshots that exist, the 0-byte capture is gone and the
real TTML fixture moved to `testdata/`.
