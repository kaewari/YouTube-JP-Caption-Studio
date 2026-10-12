<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Sentence MVP — broker lifecycle and first native preview

STATUS: **PASS for the independently reviewed broker lifecycle slice; full MVP NOT VERIFIED.**

This follows the [queue/NLP/restore review](youtube-sentence-mvp-queue-nlp-backup-2026-10-10.md).
The active goal remains the [supplied plan](../plan/youtube-sentence-enhancement-mvp-2026-10-09.md)
with its [execution decisions](../plan/youtube-sentence-mvp-execution-decisions-2026-10-09.md).
Original remains the default. Neither HTTP fixture responses nor this review establish
translation quality, measured readiness or release completion.

## Broker change and limits

The shared worker persists sentence MT in one disposable bundle, limited to 512
entries and 4 MiB. Existing exact SHA cache keys migrate into the bundle; unrelated
keys, scripts and saved items are retained. A cold worker loads the bundle before a
forced request as well as an ordinary request. Invalid result contracts are misses.
Byte eviction sums each serialized entry once rather than repeatedly serializing
the full bundle while deleting entries. No write-latency KPI is claimed.

Automatic lookahead interests carry an owner and epoch. Seek, navigation, mode
change, Undo and restore send cancellation. Queued jobs disappear only after all
owners have dropped their older interest; sibling tabs and manual preparation retain
their own interest. In-flight work can finish into validated cache. A delayed cancel
at epoch E cannot cancel interest renewed at E.

Retry-After accepts an HTTP date as well as seconds. A delay longer than 30 seconds
returns a deferred error for the active request while retaining the full shared
cooldown for later work. The date form is specified in
[RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after).

## Reproduced defects and fixes

Parent and read-only independent review reproduced two defects before the fix:

- `node scripts/sentence_broker_lifecycle_sanity.js --cache-contract`, exit 1:
  persisted `id: wrong-group` was returned ready for expected `g-0`, without HTTP.
- `node scripts/sentence_broker_lifecycle_sanity.js --epoch-race`, exit 1:
  a fresh epoch-1 queued job was cancelled by a delayed epoch-1 cancellation.

Raw assertion excerpts from the parent commands:

```text
AssertionError [ERR_ASSERTION]: corrupt cached ID must be rejected and recomputed
+ actual - expected

+ 'wrong-group'
- 'g-0'
```

```text
AssertionError [ERR_ASSERTION]: new epoch work dispatched ahead of delayed cancellation must survive
+ actual - expected

+ 'cancelled'
- 'ready'
```

`validCache` now checks ID, ready status and text length in addition to the prior
revision/language/model checks. Per-entry owner interests are a Map of epochs;
cancellation removes only older interests. These fixes retain permanent behavioral
regressions. Distinct product and harness errors were appended to the bridge error log.

## Commands, exit codes and actual output after fixes

Parent and independent reviewer ran all five lifecycle commands, each exit 0:

```text
$ node scripts/sentence_broker_lifecycle_sanity.js --cache-contract
PASS: persisted wrong ID/status are rejected after worker restart and recomputed over real HTTP

$ node scripts/sentence_broker_lifecycle_sanity.js --epoch-race
PASS: queued current-epoch interest survives delayed same-epoch cancel through production worker transport

$ node scripts/sentence_broker_lifecycle_sanity.js --cancel-only
PASS: cancelled queued owner-only jobs never reach HTTP; sibling dedup interest survives, in-flight45 retain cacheable results

$ node scripts/sentence_broker_lifecycle_sanity.js --transport-only
PASS: two production clients→worker cancel message preserves sibling and explicit manual scope; owner-only15 never dispatch, foreign cancel rejected

$ node scripts/sentence_broker_lifecycle_sanity.js
PASS: 530 translations bounded persistent cache to512 /4MiB; worker restart warm hit uses0HTTP, eviction recomputes and unrelated storage survives
PASS: legacy SHA entries migrate without HTTP/loss of saved data;30 large revisions force byte-limit eviction below512
PASS: real HTTP429 date header delays retry until advertised UTC timestamp
```

Related parent and independent checks also exited 0:

```text
$ node extension/shared/gemini_translate_test.js
PASS: localhost HTTP200, 90 jobs / concurrent duplicate callers / 6 batches / peak 3; immutable inputs and cache
PASS: context/language invalidation; HTTP200 wrong revision/duplicate IDs and HTTP503 are failures, never completion
PASS: results after user lock, source edit or session change never mutate current cues
PASS: key probe shares three-request admission; actual HTTP429 without Retry-After waits >=1000ms then retries once
PASS: concurrent HTTP429 retries honor the longer shared cooldown
PASS: two production clients share one broker; 90 jobs HTTP peak 3, valid Settings probe admitted, oversized/foreign/unsupported rejected

$ node scripts/sentence_scheduler_sanity.js
PASS: production content applies group HTTP200 without changing originals; new-session debounce publishes once
PASS: neighbor edit/lock rejects stale target translation; valid late result paints current playhead, never rewinds
PASS: real HTTP503 becomes per-language content error and suppresses automatic retry for 30s

$ git diff --check
(stdout/stderr empty; exit 0)
```

Parent content regression returned seven PASS with deliberate duplicate-ID rejection
warning; actual bridge NLP returned three PASS with parsed `/tokenize_batch` HTTP200.
Those bounded checks do not establish native HTMLVideoElement interactions.

## Independent review evidence

The read-only reviewer read current source/diff and reported **PASS** for this slice,
with no blocking finding. Its additional production worker-listener/held-HTTP stdin
harness exited 0 and printed:

```text
{"cancel":{"ok":true,"cancelled":0},"statuses":["ready","ready","ready"],"requests":4,"foreign":false,"unsupported":false}
PASS: actual service-worker listener returns async response; renewed dedup same-epoch interest/manual survive; foreign/unsupported cancel rejected
```

Production seek callback/navigation entry in an EventTarget/message adapter exited 0:

```text
{"messages":[{"type":"GEMINI_TRANSLATE_CANCEL","scope":"automatic","epoch":1},{"type":"GEMINI_TRANSLATE_CANCEL","scope":"automatic","epoch":2}],"calls":[["sync",8],["trigger"],["teardown"]]}
PASS: executed production seek handler and navigation entry send automatic cancellation with increasing client epoch before sync/reset (EventTarget/message adapter; no DOM or installed Chrome claim)
```

Its separate long-cooldown actual HTTP check exited 0:

```text
{"deferred":"error","httpStatus":429,"dispatchDelayMs":31010,"requests":2}
PASS: real HTTP429 >30s defers active response and retains full31s shared cooldown before later queued HTTP
```

## First installed Chrome preview and open defect

Native Chrome Details confirmed enabled unpacked extension 0.11.2, ID
`oiocgalcdfmkbcikemohekbjjmlbpoll`, from the main project `extension/` directory.
The main extension was clean before updating. Permission and host-access lists
matched; 79 original files were backed up and hashed under the ignored
`.tmp-sentence-mvp/chrome-update-before-2026-10-10/` directory.
The update copied 64 extension files, including generated popup assets, and checked
their SHA-256 equality with the reviewed worktree. Python command exit 0. Native
Chrome displayed `Reloaded`; after video reload, the new Original button and intact
source rows appeared. Main `git diff --check -- extension` exited 0 with empty output.

The attempted read-only worker-console baseline paste was blocked by Chrome's
self-XSS warning. No allow-pasting or alternate execution was attempted. Numeric
native baseline is unavailable from that attempt.

On `ylnxFdPhLCo`, Enhanced remained Original. The ordinary backup UI and native
Save dialog successfully delivered:
`/Users/hoangson/Downloads/yt-caption-ylnxFdPhLCo-native-2026-10-10.json`.
Parsed bytes: **968693**; SHA-256:
`6e596a339a8d8a16ea3634f27d80987e9691c444a8294030ff3f47cdc4c0eec4`.
Format/version match the backup contract; 102 cues contain only 101 unique IDs,
while rawTrack contains 109 source cues. Executing the production engine on that
exact file exited 1 with `Sentence projection requires unique cue IDs`.

Two unowned source occurrences of `返してください。` at 333.36 and 333.84 seconds
share the old ID `c-333.360-返してください。`. Root cause: non-owned reconciliation
reuses the first cache hit for adjacent repeated text. A separate correction and
regression are underway; this historical review does not claim native Enhanced PASS.
Chrome's error inventory also contains historical quota, CSP and invalidated-context
errors; their current causal scope has not been established.

API_CHECKS: real localhost HTTP and real bridge HTTP; no live Gemini quality/cost claim.
DATABASE_CHECKS: NOT VERIFIED; no database/Drive restore or destructive data operation.
Open: cache identity correction and native recheck, selected-track fingerprint,
instrumentation, gold/tune/holdout and cold/warm quality/readiness/cost measurements,
installed persistence and script-store/Drive regression. **Full goal remains active.**
