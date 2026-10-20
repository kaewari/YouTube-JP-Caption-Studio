# P0 remediation — 2026-10-20

Status: **shipped** on `fix/audit-p0-remediation-20261020` (worktree
`.claude/worktrees/audit-p0-remediation-20261020`, base `fix/audit-p0-20261020` @ 378e2aeb6).
`master` was never a base of this branch.

Raw: [plan/p0-remediation-2026-10-20.md](../../plan/p0-remediation-2026-10-20.md) ·
[review/full-codebase-improvement-audit-2026-10-18.md](../../review/full-codebase-improvement-audit-2026-10-18.md)

## What shipped

Every P0 of the 2026-10-18 full-codebase audit, after re-verifying each claim on disk
(the audit is a hypothesis list — two of its findings were already wrong, one was half right).

- **local-bridge**: the saved-items API gives every request its own connection (the
  previous shared connection raised `ProgrammingError` on any other worker thread) and
  creates the schema once per process; `/saved/sync` is capped at 5000 rows with a
  lossless `(updated_at, rowid)` cursor plus `has_more`/`next_since`/`next_rowid`; 413
  above 5000 incoming items; the dictionary uses **one** process-wide read-only handle
  under a lock (a per-thread handle had to be closed by another thread after a rebuild,
  which segfaults CPython); duplicate `DictResponse.hanviet` removed; missing `Any` import
  added; ffmpeg subprocesses get a timeout; caller-supplied title/url can no longer inject
  a `JA:` cue into the rendered script.
- **extension**: `romaji_kana.js` no longer throws `ReferenceError` on every latin keystroke;
  duplicate `BILINGUAL_MAP` keys no longer wipe the JLPT level of だす/たい/欲しい/ほしい;
  the Drive mirror queue survives a service-worker idle-kill; a failed offscreen capture
  reaches the UI; slice boundaries ride on the MediaRecorder timeslice (page timers are
  throttled in an offscreen document); the offscreen document is closed after a stop;
  the layout interval is cleared and skipped on hidden tabs; primitives in `ev.data`,
  a missing tab id and a leaked `play` listener are handled; `clear_translations` no
  longer claims success when the write was skipped.
- **side panel**: rows follow the cue order, only the four owned settings keys are merged
  into the shared blob, sliders persist on release, the settings modal nests correctly,
  the Words/Saved tabs are not wiped on every state push, `tabStates` is bounded and
  cleaned on tab close, and the saved-word context can no longer break an HTML entity.
- **web companion**: the popup no longer has a hydration mismatch, a deleted word is not
  resurrected by the bridge poll, and a failed write is reported instead of "Đã lưu".
- **CI**: the required `bridge-test-suite` is honestly green on Linux (the mlx-only
  endpoint tests skip, the three pure-logic ASR regressions run through a stubbed
  `mlx_whisper`); the handshake test honours `BRIDGE_URL`; new `extension-tests` and
  `root-tests` jobs gate the extension suites and the previously orphaned repo-root tests.
- **housekeeping**: no machine-specific paths left; the walkthrough only links to
  screenshots that exist; the 0-byte capture is gone and the real TTML fixture moved to
  `testdata/`.

## Verification

| Check | Result |
|---|---|
| `node extension/shared/*_test.js` + offscreen + sidepanel suites | 11/11 exit 0 |
| `cd local-bridge && python -m pytest -q tests/ -k "not test_live_…"` | 89 passed, 5 skipped (with the local dictionary corpus) / 79 passed, 15 skipped (clean checkout) |
| `python -m pytest -q tests/` (repo root) | 30 passed |
| the CI handshake step (uvicorn + `test_tokenize_import_enrich.py`) | exit 0 |
| `cd web/saved-items && npm run check` | exit 0 |
| `node scripts/verify_no_fake_tests.js` | PASSED |
| `git diff --check` | clean |

All four CI jobs (`bridge-test-suite`, `root-tests`, `extension-tests`, `saved-items-check`)
were simulated on a clean `git archive` of the branch: all green. The base commit was red
(8 failed on Linux, and the root tests did not even collect).

`local-bridge` needs the gitignored `data/dict/dict.sqlite` — without it 19 dictionary
tests fail for environment reasons.

## Commits

| Commit | Content |
|---|---|
| `a4e9e448a` | The P0 remediation itself |
| `769f501a6` | First review: cold-start SQLite race, sync cursor, mock-mlx tests, the capture-error listener, the bridge write error, `close_dictionary` |
| `47cfc0ebb` | The plan file and this wiki ingest |
| `a67e3faf9` | The dictionary corpus tests skip when the corpus is absent (the required CI check was red for a missing-data reason) |
| `7791f9a75` | Second review: `close_dictionary` was a no-op, the sync cursor dropped tied rows, the CI job was still red |
| `318298cd5` | The review round and the green CI simulation |
| `817ed65fd` | Dropped the redundant `awaitDisk` option |
| `141387fd3` | The capture error is scoped to the tab that asked for it and reported once |
| `6127faf08` | Every saved-items request opens its own connection (no stale handle to a replaced file) |
| `4a6b64b2f` | Third and fourth review: the dictionary uses one process-wide connection under a lock (closing it from another thread segfaults), the WAL pragma only runs for a new file, and the vacuous tests became meaningful |
| `aeaf8ed8b` | The `/saved/sync` cursor contract in the plan |
| `d1175a2eb` | The final review rounds in this topic |

## Review rounds

Four independent read-only reviews ran against the change set. They found, and every fix
has a test that fails on the old code:

1. The per-thread connection still ran `PRAGMA journal_mode=WAL`, so a fresh database raced
   into "database is locked" → HTTP 500; the sync cursor was missing; the mlx-only ASR
   tests skipped instead of running; the capture error had no receiver; the bridge write
   error was swallowed; `close_dictionary()` did nothing.
2. `close_dictionary()` was a no-op (sqlite3 forbids `close()` from a non-owning thread
   and the bare `except` hid it); the sync cursor still dropped rows sharing a timestamp;
   the required CI job stayed red (the handshake script asserted `sudachi` before the
   `/tokenize` call that loads it).
3. Closing a sqlite3 connection from another thread **segfaults** the interpreter - the
   per-thread dictionary handle was unfixable that way. The dictionary now uses one
   process-wide connection under a lock.
4. Two new tests were vacuous (they passed with the fix reverted) and the headline fix
   (one connection per request) had no behavioural test. Both are fixed.

The reviews also confirmed: no scope creep, no weakened assertions, no machine-specific
paths, and the 25 `scripts/*sanity*.js` suites behave identically on the base and on the
branch.

## Open gaps

- The audit's P1/P2 lists are untouched (they are not P0).
- `scripts/*sanity*.js`: 5 suites fail — `sentence_drive_mirror`, `sentence_native_backup`,
  `sentence_saved_state`, `sentence_scheduler`, `sidepanel_open`. They fail identically on a
  pristine `git archive 378e2aeb6` tree, so they are pre-existing, not regressions.
- The `bridgeJson()` helper still reports success on a 5xx, so a failed Drive mirror leaves
  its ID in the queue (needs a status-aware helper).
- The extension suites run under `file://` with a `chrome.*` stub in the local browser
  harness; the extension-origin context was not exercised here.
