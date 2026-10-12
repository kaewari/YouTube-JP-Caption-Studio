<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Chrome đang sẵn sàng thêm 2 phút -->
# Native warning/cost confirmation and benchmark source guard

STATUS: PASS for exact exported artifact arithmetic, visible TXT warning and independently reviewed source guard. Exported native fingerprint lineage and native activation of the new guard: NOT VERIFIED. Full MVP remains active.

## Actual native interval

Used native CUA on the existing Katou Chrome tab `65Ovd7t8sNw`. The TXT warning was already visible. Toggled LR from OFF to ON, exported metrics through Save As with a unique filename, observed download Done, dismissed download history and returned LR to OFF. No additional Chrome operation after returning it. This turn did not reload the extension or navigate to a fresh document, and did not access credentials, OAuth or the live bridge process.

Native file: `/Users/hoangson/Downloads/yt-caption-65Ovd7t8sNw-clock-cost-confirmation-2026-10-10.json`, 355217 bytes, SHA-256 `481eb5a064a5555438f38b620555a7ccc78e779aa34df17a8c8ee9144ef5972e`.

Screenshot: `.tmp-sentence-mvp/native-confirmation-2026-10-10/chrome-returned.png`, 788102 bytes, SHA-256 `7f7707f060b655d719d640c173e4d14492fa3619db92085dfc951ea39562aad6`. It shows the complete TXT loss warning and Dịch OFF. Saved AX output is a differential OFF-state receipt, not a full tree containing the warning.

## Observations and limits

1607 events = 1584 preparation revision ordinals + 22 distinct Original JA onsets + one JP paint. There are 1196 distinct prepared clock tuples and one protected preparation marker; these are not 1584 independent sentences or proof of protected-state persistence. No dropped events or discontinuity events. Exported onset windows are 5–38.8 ms, all 22 sampled JA states ready. Event timestamp range is about 58.6991 seconds, not two minutes of continuous playback.

No track-loaded event and `timeToTrackLoadedMs:null`; all onset phases use the implementation's cold fallback. This does not establish a cold network cache. TTFV 50318.6 ms includes waiting to enable the overlay. The measured paint rectangle is 643.5234375 × 123.6640625 px, top350.2421875/left188.171875. Readiness is sampled prepared text, not proof of paint for each onset or a release KPI.

`apiCostEstimate` is present, establishing native cost-schema activation. Request count0, latency P50/P95 null, estimate amount null/status NOT VERIFIED and actual billing null. This is not zero-cost or live Gemini evidence. No translation lifecycle event occurred.

## Confirmed source defect and smallest correction

The current video export carries the same fingerprint as the earlier `TJ2zrbH0BB4` export. Reviewer traced the actual export command: navigation retains the old raw-track object while current source changes; state serialization and group revision already check sourceKey, but benchmark export did not. A separate production-command VM reproduced old fingerprint contamination, so native fingerprint lineage is invalid/unverified even though artifact bytes and arithmetic remain usable.

The fix reuses the existing sourceKey check only in benchmark context. Matching raw source keeps its fingerprint; stale/missing source emits null. No rendering, caption state, navigation reset, network or database behavior changes. Permanent regression extends `scripts/sentence_source_fingerprint_sanity.js` by executing the actual command branch and parsing the downloaded JSON; it does not test source-string presence.

## Parent commands and actual output

```text
COMMAND: python3 .tmp-sentence-mvp/native-confirmation-2026-10-10/audit.py
EXIT: 0
Observed recomputation: bytes355217, events1607, prepared1584, distinctPreparedClocks1196, protected1, distinctOnsets22, windowMs[5,38.80000001192093], eventRangeSeconds58.69909999996424, requestCount0, costEstimateStatus NOT VERIFIED, exact SHA above.
PASS: native artifact integrity and exported arithmetic only; no release or causal clock claim
```

```text
COMMAND: node scripts/sentence_source_fingerprint_sanity.js
RED EXIT: 1
AssertionError [ERR_ASSERTION]: benchmark after navigation cannot export the previous video fingerprint
actual: 1ed274d213df8482e9846ca3eecaae9445e966ca37649ed4289b3fef39d0cfab
expected: null
GREEN EXIT: 0
PASS: actual benchmark command excludes another video fingerprint, retains current source and exports null for missing raw source
PASS: SHA256 source fingerprint is stable across target edits, changes with raw text/anchors/source selection, and invalidates production group cache identity
```

```text
COMMAND: node scripts/sentence_benchmark_sanity.js
EXIT: 0
PASS: actual content sync excludes seeking onset
PASS: actual paint observer rechecks hidden tab, Japanese and overlay settings inside RAF
PASS: production sync measures one player clock across interleaved frame/timeupdate/tick calls; one onset, no artificial discontinuity, renderer timestamps preserved
PASS: lifecycle uses private revision ordinals, dedups prepared groups, distinguishes accepted/cache/discard/error/cancel; identity/event caps stay unverified without caption/key export
PASS: empty metrics remain NOT VERIFIED; cold/warm onset bounds distinguish ready/missing/uncertain; seek/gaps excluded; real receipt IDs deduplicate HTTP attempts; no fabricated cost
COMMAND: node --check extension/content/content.js
EXIT: 0 (no output)
COMMAND: git diff --check
EXIT: 0 (no output)
```

## Independent review and main delivery

Read-only reviewer independently parsed and hashed exact artifact/screenshot, recomputed event arithmetic/windows/paint, read current affected code and compared today's scope against main. It independently reproduced Red in the actual old export branch and tested five current cases: matching, previous, null track, missing fingerprint and missing sourceKey. Network, raw state, filename, MIME and success result remained unchanged. Permanent fingerprint/benchmark, syntax and diff checks exited0. Bounded source fix PASS; native causal clock/source-runtime linkage and release claims remain NOT VERIFIED. One reviewer fixture initially expected application/json instead of the existing application/json;charset=utf-8; corrected expectation and rerun were logged, not treated as a production failure.

After independent bounded PASS, guarded main copy required previous content SHA `5f5335d85454f21b911afb49c7c3a058261b1d03867452ea4af1b034349d9db0`, exactly one expected line replacement and equality with reviewed source. Backup preserved and mode0644 retained. Copy command exit0:

```text
GUARDED COPY extension/content/content.js SHA256 dbbf78614595e332b338806c4262bb7a6598bb6ab413fc217a77b0be2cb5e972 mode 0o644 backup exact; no native reload
```

Receipt: `.tmp-sentence-mvp/native-confirmation-2026-10-10/main-copy-receipt.json`; backup `main-content.before.js`. Main staging is not native activation; the new guard was copied after the Chrome window ended. Existing raw reviews remain immutable.

REQUIREMENTS: native readable TXT warning/cost schema VERIFIED; artifact bytes/arithmetic VERIFIED; current-source export guard VERIFIED in production VM; native guard activation, source fingerprint provenance of this trace, full clock causal replay, live translation/billing, protected storage and release KPI NOT VERIFIED.
API_CHECKS: no live Gemini or new backend call in this turn.
DATABASE_CHECKS: not applicable; no mutation.
PROBLEMS / REQUIRED_FIXES: controlled native replay after future reload, 50-segment reference review, translation and playback matrix, bridge data-authority transition and Drive remain open. User's Chrome grant does not answer the pending bridge data-authority preference.
