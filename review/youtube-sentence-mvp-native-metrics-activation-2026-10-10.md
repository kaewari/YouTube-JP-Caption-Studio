<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Chrome đã sẵn sàng, tôi sẽ để nguyên 2 phút -->
# Native Chrome — selected-track and metric activation

STATUS: PASS for native export activation and artifact integrity; release KPI, Enhanced translation and protected-state round trips NOT VERIFIED.

## Actual UI actions

User explicitly made Chrome available. Native Chrome profile Katou Details confirmed Caption Studio enabled, version0.11.2, loading `~/Projects/YouTube JP Caption Studio/extension`. Click Reload returned Reloaded. Opened a fresh full YouTube document for `ylnxFdPhLCo` (not a SPA-only transition), enabled LR overlay, opened sidepanel and used ordinary ⋯ → Sao lưu JSON and Xuất số đo. Save As sheets were dismissed after saving exact unique filenames below. Subsequently Chrome switched to a different page; browser interaction stopped. No fresh Enhanced/key test or new screenshot was completed in this interval. UI control is evidence from native accessibility state; artifact bytes independently audited below.

## Delivered files and preservation

| File in Downloads | Bytes | SHA-256 |
|---|---:|---|
| `yt-caption-ylnxFdPhLCo-track-metrics-2026-10-10.json` |970408|8366a4e116188562f0416db4b971c532b09ea54c04a87a528498737459de3914|
| `yt-caption-ylnxFdPhLCo-native-benchmark-2026-10-10.json` |32214|47fe86c3b19570ea177e771460b43afd3d113207c4ace24bb74baca6f59bcba1|
| previous `yt-caption-ylnxFdPhLCo-source-anchors-2026-10-10.json` |969614|10c9e505a3c49d59729d41b20afd9a8fe9a9e74916c88c7f99d2559f7a00a600|

102 Original cues, 102 unique IDs, 109 raw cues, 101 normalized source rows. Raw selected-track metadata is a.ja/ja/asr/xml; raw fingerprint matches metrics context. Source/timing/IDs/targets/locks/ownership/raw refs and all cue fields except tokens deep-equal previous backup. Only token indices6,7,16,20 changed; surface joins exactly match source. Metadata, saved snapshots, undo/translation/sentence-token sidecar values equal previous backup. Owned false, protected cues0, saved snapshots0 and tombstones0: equality cannot establish preservation with these states present.

Production fingerprint recomputation returns a2bd3ca49f44a4f406afe68a1fbaedaff3762f8cca302f0e48b2b70d86a56161. Production normalization reproduces all101 rows' source, exact clocks, rawSource and spans. XML export has zero word anchors; this resolves the earlier ambiguous zero-anchor artifact, but does not verify native JSON3 segment propagation. Metadata contract is verified in the artifact; no saved raw HTTP selection receipt accompanies this session.

## Observed metrics and limits

Trace c5d9e3a2-c87e-4c83-adf2-e2a2950f5f7c, network hint4g, warmup5000ms. 258 events:237 discontinuities,10track_loaded,10onset,1jp_paint, dropped0. First track load2692.7ms and JP first paint13277.2ms after trace open; TTFV includes waiting to turn overlay ON. Positive native exported paint rect632.5859375×121.5703125px at top349.84375,left185.2109375.

Readiness has only Original JA: cold2/2 ready and warm8/8 ready, bounds1/1. All observed onset windows >0 and ≤500ms and match source anchors/first-load phase. This is prepared text readiness in sampled continuous windows, not proof of paint at every onset. First paint occurs later than some ready samples. Clear/restore between samples remains unobserved. Raw foreground/paused/seeking flags were not exported, so reviewer cannot reverify those real session flags from this file. Event range2689.4–44998ms does not prove two minutes continuous playback.

Request count0, P50/P95 null, actual billing null, no Enhanced/VI/EN onset. These ten JP samples do not certify the release ≥99% JP or ≥95% translation gates or performance across videos. User key location remains unknown; no credentials were read/entered/saved, and no new live Gemini evidence was produced.

The cost-instrumentation modules were copied AFTER this export; this file correctly has no apiCostEstimate. Filesystem copy of those newer modules is verified separately; another Chrome Reload is still needed to verify their activation. See [cost review](youtube-sentence-mvp-cost-instrumentation-2026-10-10.md).

## Commands and independent review

Parent exact runnable ignored artifact audit:

```text
COMMAND: node .tmp-sentence-mvp/native-export-audit-2026-10-10.cjs
EXIT: 0
{"bytesAndHashes":"exact","originalCues":102,"uniqueIds":102,"rawCues":109,"sourceCues":101,"changedTokenIndices":[6,7,16,20],"sourceClockTargetsFlagsPreserved":true,"fingerprint":"a2bd3ca49f44a4f406afe68a1fbaedaff3762f8cca302f0e48b2b70d86a56161","selectedTrack":{"trackId":"a.ja","language":"ja","kind":"asr","format":"xml"},"readiness":{"original:cold:ja":{"total":2,"ready":2,"uncertain":0,"missing":0,"lowerBound":1,"upperBound":1},"original:warm:ja":{"total":8,"ready":8,"uncertain":0,"missing":0,"lowerBound":1,"upperBound":1}},"ttfvMs":13277.199999988079,"trackLoadedMs":2692.699999988079,"paintRect":{"width":632.5859375,"height":121.5703125,"top":349.84375,"left":185.2109375},"requestCount":0,"cost":null,"costEstimatePresent":false}
PASS: exact native files, source/clock/targets/metadata preservation, production fingerprint, normalization mapping and observed metric contracts; no release KPI assertion
```

Independent read-only reviewer `/root/independent_audit` parsed all three exact files, hashed bytes, executed production normalization and fingerprint via a separate Node stdin assertion probe, recalculated onset windows, phases, source anchors and metric totals. Exit0; stdout confirms exact files, changedTokenIndices[6,7,16,20],102unique/source101/raw109, same fingerprints/readiness/positive rect and request0/costnull. It did not rerun native UI. No blocking artifact finding. Static/filename lookup errors were corrected and logged; they are not production defects.

REQUIREMENTS: native metric export and selected-track/fingerprint activation VERIFIED by UI export plus exact-file/production-function evidence; native JSON3 anchors, translation, protected-data compatibility and release gates NOT VERIFIED.
API_CHECKS: no independent native HTTP capture/live Gemini request in this audit.
DATABASE_CHECKS: no mutation/check in this audit.
PROBLEMS / REQUIRED_FIXES: controlled multi-video language/rate/seek/background benchmark, gold audio review, protected storage/Drive checks and cost activation remain open. Original stays default; full goal remains active.
