# P0 remediation — 2026-10-20

Status: **shipped and merged into `master`** (merge commit 2fff75c48). Developed on
`fix/audit-p0-remediation-20261020` (worktree `.claude/worktrees/audit-p0-remediation-20261020`,
base `fix/audit-p0-20261020` @ 378e2aeb6) - `master` was never a base of that branch, it only
received the finished result.

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

## P1 / P2 (same branch)

The remaining audit rows were closed in `63f514f72`:

- **local-bridge**: the ASR model is allowlisted (an arbitrary HF repo or local
  path could trigger an unauthenticated download), the heavy ASR path takes a governor
  slot, the error bodies no longer echo ffmpeg/MLX internals, `vocab_freq` only
  reports "loaded" after a successful read, `tokenize_ja` creates the tokenizer under a
  lock and emits no sentence-wide token when Sudachi is missing (the repo forbids
  clumping), `script_store` fsyncs before the atomic replace and no longer rewrites
  `cues.json` on every GET, the dictionary queries the Han-Viet characters in one go
  and probes a half-built dictionary once, and the app uses a lifespan context manager.
- **extension**: the Gemini API key moved from `chrome.storage.sync` to
  `chrome.storage.local` (sync replicated it to every signed-in Google account) and the
  legacy copy is migrated and purged once; the model chain uses models that exist; the
  entity decoders share one correct implementation; the worker aborts its fetches,
  evicts its maps, filters the cookies it sends and allowlists the proxied commands;
  the manifest pins the Chrome version; the content script rejects invalid cue indices,
  reports the caption mode it applied and only rebuilds the sentence engine when the
  cues changed; the side panel has one source for the JLPT colours and accessible
  header/toast.
- **web companion**: the settings write no longer happens inside a state updater, the
  local records survive a merge, the stored payload carries a schema version, an
  unknown version is never overwritten, the unused dependencies are gone and a first
  `node --test` suite covers the store.
- **docs / tools**: the ASR test case names the model in use, the test plan matrix
  covers the shipped apps, the README makes no unverifiable claim, the launchd plists
  resolve their path through the shell, and the machine-specific paths are gone.
- **tests**: the stale sanity harnesses now assert the behaviour the product has, the
  drivers skip with a clear message, and the scheduler harness found that a failed
  translation was retried immediately when the revision changed (the 30 s backoff no
  longer depends on the revision).

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

## Corrections to the filed plan

`plan/p0-remediation-2026-10-20.md` is immutable once filed (AGENTS.md §4), so the two facts
learned while executing it live here instead:

- **`/saved/sync` cursor**: the response carries `has_more` / `next_since` / `next_rowid`; the
  cursor is the pair `(updated_at, rowid)`, so rows that share a timestamp are never skipped.
  A client pages with `since` + `since_rowid` (the contract is documented on the endpoint);
  `sync_timestamp` is the server clock, not a cursor.
- **Verification commands**: the bridge suite is `cd local-bridge && python -m pytest -q tests/`
  (123 passed / 15 skipped on a clean checkout - the skips need the dictionary corpus), and the
  CI handshake step is `cd local-bridge && BRIDGE_URL=… python tests/test_tokenize_import_enrich.py`
  (needs a running bridge).

## Merge

Merged into `master` with `git merge --no-ff` (2fff75c48, no conflicts: master's tree was
identical to the branch base). After the merge the whole suite was re-run **on master**:
15 extension suites, 133 bridge tests, 30 repo-root tests, 25 sanity scripts, the web suite
and all four CI jobs simulated on a clean `git archive master` tree - all green.

## Post-merge verification (2026-10-21)

After the merge an independent read-only review re-ran every suite on `master` and simulated
the CI jobs **in clean virtualenvs** (the local venv has extra packages and hides missing
dependencies). That found and fixed:

- **`root-tests` was structurally red in CI**: the job installed `pytest numpy soundfile`, but
  `scripts/slice_gold_audio.py` imports `scipy` at module level, so `pytest -q tests/` could
  not even be collected on a clean runner. The job now installs `scipy>=1.11.0` (verified in a
  fresh venv: 30 passed, exit 0).
- **The iOS apps were never compiled by CI**, so a Swift change that does not build could
  reach master unnoticed. The new `ios-build` job builds both apps for the simulator;
  `Resources/dict.sqlite` is runtime data and not in git, so the job stages an empty
  placeholder and `ipad-app/Scripts/COMMANDS.md` + the iPhone twin now say where the real
  dictionary comes from. Both apps build: `** BUILD SUCCEEDED **`.
- The macOS menu-bar bridge compiles (`swiftc -O -parse-as-library`): the agent's change there
  is a comment clarification of the process-group reality, no behaviour change.
- `tests/unit/test_player_ui_runtime.js` hardcoded the macOS Chrome path - it now honours
  `CHROME_PATH`, so another machine or a CI runner can execute it.
- The pre-existing test files that no CI job runs (`scripts/hook_anti_fake_test.js`,
  `scripts/tdd_bugfix_test.js`, `scripts/tdd_pixel_and_timing_test.js`,
  `scripts/test_code_taste_hook.py`, the `tools/open-code-review` Go suite) were executed
  manually: all pass.

## Open gaps

- The `bridgeJson()` helper still reports success on a 5xx, so a failed Drive mirror leaves
  its ID in the queue (needs a status-aware helper).
- The extension suites run under `file://` with a `chrome.*` stub in the local browser
  harness; the extension-origin context was not exercised here.
- The dictionary corpus (JMdict / Mazii) is downloaded by `POST /bootstrap` and is not
  committed, so the 10 corpus-backed dictionary tests skip in a clean CI checkout. The two
  dictionary concurrency tests that guard the P0 connection fix DO run there.
- The 61% duplication between the iPad and iPhone apps is documented, not removed: a shared
  Swift package is a large refactor and the mirrored files stay byte-identical so the next
  fix is one diff.
