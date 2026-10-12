<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Runtime metrics slice

STATUS: PASS for independently reviewed module/production helpers in VM and actual
localhost HTTP protocol. NOT VERIFIED for native benchmark, independent DOM,
browser metrics download and full MVP gates. Worktree changes are not deployed.

## Requirements

Local trace records observed continuous foreground onset windows, sampled
JA/VI/EN readiness, cold/warm (5 seconds after track load), actual HTTP receipt
attempts, P50/P95, and JP paint after a visible rectangle. Trace/event maps are
bounded; missing observations have no verified rate and cost remains null.
Request receipts exclude caption/context/key and cache hits exclude historical
receipts. The metrics JSON export is separate from lossless caption backup.

Readiness bounds depend on sampled state: clearing and restoring the same value
entirely between samples is unobserved. Definition and product docs explicitly
state this ceiling. These bounds do not certify release acceptance.

## Red / Green

Independent production-helper repros confirmed seeking and RAF races. Parent
made the same cases permanent before fixing:

```text
node scripts/sentence_benchmark_sanity.js --seeking-only
exit 1, AssertionError: timeupdate while seeking must not count as continuous playback
actual 1, expected 0

node scripts/sentence_benchmark_sanity.js --paint-only
exit 1, AssertionError: RAF must recheck hidden
actual 123, expected null
```

Content now passes actual video.seeking into the shared sample guard; RAF rechecks
hidden/JP/overlay settings immediately before paint. Parent and independent
reviewer reran the regression:

```text
node scripts/sentence_benchmark_sanity.js
exit 0
PASS: actual content sync excludes seeking onset
PASS: actual paint observer rechecks hidden tab, Japanese and overlay settings inside RAF
PASS: empty metrics remain NOT VERIFIED; cold/warm onset bounds distinguish ready/missing/uncertain; seek/gaps excluded; real receipt IDs deduplicate HTTP attempts; no fabricated cost

git diff --check
exit 0, stdout/stderr empty
```

Independent held-RAF repro: hidden true / jaEnabled false / ttfvMs null, exit 0.
Independent seeking repro: seeking true / onsets [], exit 0. Independent map
instrumentation: four 20001-unit revisions remain 60000 readiness keys; empty
prepared state prunes to zero; 10005 events retain 10000 and report 5 drops.

## HTTP / session checks

`node extension/shared/gemini_translate_test.js` independently exited 0 with six
PASS outputs: actual localhost HTTP200 batching/peak3/cache, wrong revision and
duplicate-ID rejection, HTTP503 failure, stale lock/source/session rejection,
actual HTTP429 cooldown, and shared broker admission. This is not live Gemini.

Independent supplemental production-module localhost HTTP test, exit 0:

```text
{"statuses":[[404,200],[429,429],[503]],"dispatch":5,"requestCount":5,"cacheHasReceipt":false}
PASS: real localhost HTTP404→200 fallback, double429 and503 receipts count five dispatches; duplicate/cached callers deduplicate; exported production receipts omit caption/target/context/key
```

Independent delayed scheduler response test: old trace requestCount1, new trace0,
no new target/paint mutation, exit 0. Parent and reviewer content/scheduler/saved
state regressions exited 0. No production database or Drive mutation occurred.

## Browser scope

Parent isolated real DOM executed the production paint observer: hidden rectangle
0×0; after Show Japanese, rectangle300×60 at left8/top442.375. Fixture TTFV
7068.899999976158ms includes tool/click delay and is not a product KPI. Reset
hidden returned null TTFV and empty events. Reviewer IAB was unavailable, so
independent DOM remains NOT VERIFIED. Native metrics download and measured
readiness/latency/cost are still open. Original remains the per-video default.
