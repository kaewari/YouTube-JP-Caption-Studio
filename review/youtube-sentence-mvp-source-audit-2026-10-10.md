<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# YouTube sentence MVP — source audit and pure projection slice

STATUS: **NOT VERIFIED for the MVP/release**. Independent bounded pure-function
review: **PASS** after resolving four reproduced defects. Installed-extension,
Gemini, storage/Drive and gold/KPI gates remain open. This is a filed snapshot;
ongoing implementation status belongs in the [topic](../wiki/topics/youtube-sentence-enhancement-mvp.md).

Related: [supplied plan](../plan/youtube-sentence-enhancement-mvp-2026-10-09.md),
[execution decisions](../plan/youtube-sentence-mvp-execution-decisions-2026-10-09.md).

## Checkout and actual Chrome version

- Worktree: `/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio`.
- HEAD: `b37a46acf66d3f8027aa89a21c27ac6e52e8e3ca`, detached.
- Native Chrome extension Details showed enabled version `0.11.2`, unpacked from
  `/Users/hoangson/Projects/YouTube JP Caption Studio/extension`.
- Main project's manifest, content, Gemini and timedtext modules matched worktree
  baseline byte hashes. Main sidepanel still contained the old stitch helper;
  worktree has the bounded Original-row fix. Main has unrelated hook work, preserved.
- No deployment/reload of this new implementation or new permissions is claimed.

## Real source evidence

Five `@parako` player responses were captured through the browser, each real HTTP
**200**, `application/json`, JSON3. Full snapshots are runtime data under
`data/subtitles/parako-sentence-mvp-2026-10-09/` and ignored by Git.

| Video ID | Transcript rows | JSON3 events | Parsed nonempty cues | Normalized cues |
|---|---:|---:|---:|---:|
| `ylnxFdPhLCo` | 109 | 218 | 109 | 101 |
| `rraWPrKKwRc` | 98 | 196 | 98 | 95 |
| `CLs0YSeggXk` | 91 | 182 | 91 | 88 |
| `_aMBGfcwtGY` | 118 | 236 | 118 | 112 |
| `oLYBgoeslnk` | 116 | 232 | 116 | 116 |

Manifest records source URLs, SHA-256, HTTP status and timing limitations. Rounded
transcript exports alone were not used as cue-end timing. `tOffsetMs` is a segment
**start** offset; `isSpeakerChange` is a hint, not verified speaker identity;
`acAsrConf:0` was not interpreted as a confidence measurement.

A small source excerpt at 60–84 seconds is copied without word/timing edits into
`testdata/sentence-mvp/parako-continuation-source.json3.json`, with provenance.
It verifies structural cases, **not ground truth or recognition accuracy**.

Native Chrome warm observation at ~1:55 showed VI in sidepanel and JA-only overlay.
The video already had stored data; this does not measure cold translation readiness.
No numerical readiness/latency/CPU baseline is claimed from that observation.

## Request → source → projection → persistence flow

1. MAIN page capture / SW timedtext fetch → shared or page-world JSON3 parser.
2. `content.applyLoadedCues` → normalize → local/disk metadata/cache reconciliation.
3. Owned/import scripts and tombstones win → effective mutable cue array.
4. Playhead `findActiveCue` → overlay and SP_STATE → sidepanel renderer.
5. Gemini full-track translation and five-cue prefetch are separate callers today.
6. `saveTranscript` → chrome transcript/meta + bridge script store → legacy Drive mirror.

Grouping must run after step 3. A raw-track projection must not reintroduce deleted
or replaced script cues. Existing serializers whitelist fields; metadata cannot be
quietly appended to a cue and assumed to survive legacy disk/Drive/export paths.

## Confirmed baseline defect and bounded fix

Sidepanel `stitchMultiCueSentences` read `text/start/end`, while publisher sends
`source/start_media_time/end_media_time`. It merged across real silence/locks,
produced blank source text and collapsed IDs. Dictionary index and edit/delete
could target a different raw cue. The helper was removed; Original now renders
the actual source rows. Enhanced has to arrive as one explicitly mapped projection.

Original Red command executed the extracted production helper, exit **1**:

```text
pure extracted production helper result: [{"id":"a","source":"","start_media_time":60,"end_media_time":75,"mt_locked":true,"cueIds":["a","b"],"tokens":[],"end":0,"text":""}]
AssertionError: locked cue and 4-second silence must remain two display rows
1 !== 2
```

Real-browser isolated transport also reproduced four inputs → two blank rows:
first row 1:00–1:15 and second 1:20–1:22. After fix it rendered four intact rows
`a/b/c/d` with their original clocks, locked VI text and positive measured geometry.
Latest measurement: each row width **1252 px**, height **141.984375 px**.

Browser checks dispatched `play` with `mediaTime:81`, and `edit_ja` with cue `d`
after Enter. Transport is deliberately isolated and does not persist edits. Its
active-row reply is synthetic; this is command/DOM proof, not media-clock or
installed-extension/Drive/Gemini proof. Child reviewer had no browser connection,
so independent browser verification remains **NOT VERIFIED**.

Reproduce: `python3 scripts/sidepanel_original_runtime_fixture.py`, then open
`http://127.0.0.1:18865/extension/sidepanel/sidepanel.html`. Real DOM assertion:

```text
PASS: 4 Original rows, IDs, source, play anchors, locked text and actual dimensions
```

## Pure projection implemented and independently reviewed

- `normalize_cues.js`: optional source mapping. Default `{start,end,text}` output
  remains unchanged. Half-open UTF-16 spans preserve repeated words, surrogate pairs,
  discontinuous retained text and collapsed whitespace. Coordinate domain is explicit.
- `timedtext_parse.js`: optional `includeSource` preserves joined raw JSON3 text
  and original segment start offsets. Default output remains unchanged. No fabricated
  per-character timing is introduced.
- `sentence_groups.js`: pure groups over effective cues. Both-sided owned/locks,
  source/speaker/silence/removed-row boundaries, continuation evidence, size ceilings,
  explicit source refs, deterministic source/timing/raw revision identity and undo
  exclusion. Duplicate/missing stable IDs are rejected for caller Original fallback.
- Logical groups and display units are distinct. Without exact child anchors, one
  source-window display contains all logical groups; it is not two overlapping rows
  where the renderer would select only the last sentence. Exact valid anchors may
  split display units. Invalid/duplicate/decreasing anchors fall back.
- Unknown overlaps keep source. Close real segment start plus dangling grammar can
  support an overlap continuation, labelled separately; this is not speech-end proof.
- New module is **not in manifest/loader yet**. No Enhanced UI feature is claimed.

Independent reviewer reproduced then verified fixes for: segment-start gap handling,
trimmed initial speaker hint, complete casual statements and an internal speaker
segment beginning with stripped noise. Tests also cover raw/timing invalidation,
dropped noise rows and ID ambiguity. Noise-only speaker ranges are not shifted onto
an unrelated later segment. Lexical continuation is deliberately conservative; gold
quality and NLP-based widening are open.

## REQUIREMENTS and COMMANDS

| Criterion | Expected / actual | Evidence | Status |
|---|---|---|---|
| Legacy normalize/parser | Default output parity | Existing suites + five snapshots | VERIFIED in tested scope |
| Source coverage | Every retained UTF-16 range once; inputs unchanged | Pure tests + captured-source checks | VERIFIED in tested scope |
| Both-sided protection | Owned/user/import/locked cues block merge | Actual production module assertions | VERIFIED in pure scope |
| Display timing | No invented child times | Independent anchor/fallback cases | VERIFIED in pure scope |
| Original row dispatch | Correct source ID/text/play anchor | Parent real browser | VERIFIED; independent browser NOT VERIFIED |
| Full user-data preservation | Chrome/disk/import/export/Drive round-trip | Not executed for this feature | NOT VERIFIED |
| Gold quality and KPI | Audio/creator reference + tune/holdout | Source snapshots only | NOT VERIFIED |
| Translation readiness | Correct revision before playhead | No measured cold/warm API run | NOT VERIFIED |

`node extension/shared/sentence_groups_test.js`, exit **0**, actual final output:

```text
PASS: normalization mapping preserves UTF-16 spans, repeats, whitespace, emoji, raw timing and input
PASS: optional parser preserves raw JSON3 text/segment timestamps, legacy output and input
PASS: sentence groups preserve source coverage, IDs, owned/lock/speaker/silence boundaries and source-window display
PASS: independent-audit regressions for segment starts, stripped speaker prefixes, complete clauses and timing revisions
PASS: dropped-row boundaries, duplicate-ID rejection and raw-source revision invalidation
PASS: internal stripped speaker boundary retains logical groups without fabricated display timing
```

`node scripts/sentence_snapshot_sanity.js data/subtitles/parako-sentence-mvp-2026-10-09`,
exit **0**. Latest pure outputs (not browser latency/KPI):

| Video | Groups | Display units | Merge groups | Retained coverage |
|---|---:|---:|---:|---|
| `CLs0YSeggXk` | 142 | 88 | 0 | exact |
| `_aMBGfcwtGY` | 149 | 116 | 0 | exact |
| `oLYBgoeslnk` | 180 | 126 | 1 | exact |
| `rraWPrKKwRc` | 129 | 101 | 2 | exact |
| `ylnxFdPhLCo` | 167 | 107 | 3 | exact |

```text
PASS: captured source coverage and continuation examples; not a gold/KPI or browser benchmark
```

Independent commands also exit **0**:

```text
node scripts/normalize_cues_sanity.js
18 ok checks; normalize_cues sanity PASSED
node extension/shared/timedtext_parse_test.js
All timedtext parse tests passed!
node scripts/cue_timing_sanity.js
13 ok checks; cue_timing sanity PASSED
node scripts/fill_yt_secondary_sanity.js
22 ok checks; fill_yt_secondary sanity PASSED
node --check extension/shared/sentence_groups.js
stdout/stderr empty
git diff --check
stdout/stderr empty (whitespace check only)
```

API_CHECKS: YouTube timedtext GET HTTP 200 and actual JSON parsed on all five sources.
Gemini/bridge feature HTTP checks **NOT VERIFIED**.
DATABASE_CHECKS: no new backend/schema/database changes; storage round-trip **NOT VERIFIED**.

## PROBLEMS / REQUIRED_FIXES and remaining tickets

- `DATA-01/GOLD`: review representative tune/holdout clips against actual audio or
  creator subtitles; retain source-word errors rather than correcting by guess.
- `DATA-02/BASELINE`: trace track/group/translation/playhead timestamps; report
  cold/warm readiness, failures, rate, latency and resource usage on the actual client.
- `SEG-03/UI-01`: integrate one projection after ownership merge, Original/Enhanced,
  edit mapping and undo; isolate saved-sentence snapshot/provenance.
- `STORE-02`: disposable versioned local sidecar, source/revision invalidation,
  explicit JSON backup contract. Never assume legacy Drive preserves new fields.
- `TRANS-01..04`: one scheduler for all callers; group/revision response IDs, validate
  full schema/count, cache context/model/language, locks after await and truthful
  completed counts. Existing independent queues/stale mutable apply are still open.
- `NLP-01`: actual group tokenization and Python code-point ↔ JS UTF-16 conversion.
- `QA-01`: installed-extension, seek/rate/edit/reload/old storage/client matrix and
  independent runtime evidence. Default Enhanced release remains blocked by KPI gates.

Official Gemini structured-output contract was checked against
[Google's Generate Content documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en).
Schema support does not replace application validation of returned IDs/revisions.
