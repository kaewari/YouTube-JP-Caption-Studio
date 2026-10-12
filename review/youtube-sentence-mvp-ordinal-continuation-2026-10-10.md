<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Ordinal continuation — bounded implementation and review

STATUS: PASS for current bounded ordinal grouping and serializer changes, independently reviewed. Full MVP, native activation, gold transcript/audio and release KPI: NOT VERIFIED.

Scope follows [execution decisions](../plan/youtube-sentence-mvp-execution-decisions-2026-10-09.md) and [supplied revised plan](../plan/youtube-sentence-enhancement-mvp-2026-10-09.md). This new review supersedes only the rra08 lexical-join FAIL in [previous Backrooms review](youtube-sentence-mvp-rra-reference-readiness-2026-10-10.md). Earlier raw reviews are preserved.

## Problem and smallest shared fix

Captured JSON3 events220560/221120 split 第1 from 弾. Actual parser → normalizer → sentence engine kept 第1 as a separate group despite retained close segment anchors. In the current local Node runtime, Intl.Segmenter also splits 第/1/弾; existing helper therefore gained a bounded formal ordinal continuation condition rather than a new dependency. The rule requires 第 plus Arabic/full-width/Kanji numerals on the left, one of13 counters on the right, followed by explicit particles/copula, punctuation, space or end. Existing POS/question continuation, speaker/source/owned/lock/Undo/gap/overlap/size rules remain unchanged.

Shared flow: captured JSON3 → timedtext_parse.js → normalize_cues.js → sentence_groups.js boundaryReason/hasContinuation → group sourceRefs/revision → overlay/sidepanel projection and MT/NLP scheduler; content.js sentenceStateSnapshot exports metadata. The latter now reports loaded engine.VERSION instead of hardcoded1; storage/backup schema remains version1. Group algorithm VERSION2 invalidates stale group IDs/revisions/cache metadata. Existing old backup validation and disabled sidecar maps remain compatible in production VM tests.

Slice delta is limited to:

- extension/shared/sentence_groups.js: VERSION1→2, continuation helper receives right fragment, bounded ordinal rule.
- extension/content/content.js: algorithmVersion uses actual loaded engine.VERSION, absent engine null.
- Permanent behavioral checks in extension/shared/sentence_groups_test.js and scripts/sentence_content_sanity.js.
- testdata/sentence-mvp/parako-ordinal-fragment-source.json3.json: exact two captured events, not rewritten caption source.

No backend route, database schema or network behavior changed. API_CHECKS / DATABASE_CHECKS are not applicable to this delta. Ancillary HTTP tests below use actual localhost responses or the existing bridge; no cloud Gemini result is claimed.

## Requirements and independent findings

| Requirement | Actual | Status |
|---|---|---|
| 第1 + 弾 joins with exact half-open UTF16 sourceRefs | rra08 snapshot72[0,2)+73[0,35) | VERIFIED |
| Preserve source/timing | Exact captured events; once-only125UTF16 coverage across6cues; display windows220.56–222.702 and221.12–224.722 retained | VERIFIED |
| General bounded ordinal grammar | Independent13 counters ×8 tails plus numeral forms | VERIFIED within these cases |
| Avoid counter-prefix verbs | Initial broad Hiragana rule incorrectly joined 第1+話す; reviewer Red; narrowed explicit grammar and13 negative runtime checks Green | VERIFIED after fix |
| Protection/source/speaker/Undo/size boundaries | Permanent tests plus independent guards both sides | VERIFIED |
| Algorithm/cache metadata | Independent VM v1-disabled maps preserved under G2; reenable rejects old IDs/revisions for MT/tokens; v1 backup accepted; absent engine null | VERIFIED in isolated VM |
| Sidepanel display, Undo, Original | Root real production HTML/CSS/JS rendered in IAB with isolated Chrome transport; actual DOM text/clocks and pixel before/after measured | VERIFIED in isolated browser |
| Main file delivery | Two exact-byte guarded copies with verified backups, mode0644 | VERIFIED on disk |
| Native installed Chrome | No reload or new grant used for these changes | NOT VERIFIED |
| Full gold/ASR named transcript/timing/KPI | Partial visible lexical reference only | NOT VERIFIED |

Independent reviewer read original plan, before copies, current disk diff and affected code; reproduced old ordinal and old serializer Reds. It discovered the initial false-positive:
`{"right":"話すのをやめた。","groups":["第1話すのをやめた。"]}`, assertion1!==2, exit1.
Root added four permanent verb negatives, reproduced exit1, and narrowed grammar. Reviewer current runtime output, exit0:

```text
PASS 13 counter-prefix lexical negatives retain separate groups
PASS 13 counters x8 explicit grammatical tails; numeral generalization
PASS caps/Undo both sides and 12 ownership/lock boundaries retained
PASS actual content VM: loaded v1 disabled maps preserved under v2; algorithmVersion2; reenable rejects old ID/revision MT/tokens; v1 backup accepted; absent engine metadata null
```

## Browser and delivery evidence

Root used production sidepanel via localhost64588 isolated fixture, not installed Chrome. Original two row IDs a/b and Japanese texts; Enhanced first text joined 第1弾… with display IDs du:[a,0]/du:[b,0]. Existing source-window projection retains full context on the overlapping second display window, including final うき、; no word-accurate timing claim.

Actual rectangles in Original, Enhanced and Undo/rollback:

- Row1 left14/top98/width1252/height141.984375.
- Row2 left14/top251.984375/width1252/height141.984375.
- Delta left/top/width/height0px for both.
- Play times220.56/221.12 preserved. Undo restored exact two source texts; Original restored exact a/b IDs/text/clocks/rectangles and aria-pressed:false.

Initial root probe mistakenly read checked on an aria-pressed button, falsely rejecting valid Enhanced. This was a test-probe error, not product Red; corrected against observed DOM to aria-pressed:true, logged in local-bridge/errors.log. Before mode is explicitly sourced to AX Original Value0, not the invalid checked property.

Ignored evidence:

- .tmp-sentence-mvp/creator-reference-frames-2026-10-10/ordinal-ui-receipt.json
- ordinal-ui-enhanced.jpg: actual JPEG1280×720,46584B, SHA1870863cdcc8d8f0b10aac4c3e198dddf36e3cffb099640b130d515103e3e18b.
- ordinal-terminal-receipts.json: exact root stdout/stderr, exit codes and command labels below.
- main-ordinal-copy-receipt.json and main-ordinal-backup/.

Root closed IABtab10 after Original restored. Test server launched under exec session handle19028 stopped; this handle is not a PID or port. Root Python socket connect_ex localhost64588 returns61/refused. Native Chrome availability previously consumed; no native Chrome action in this slice.

Main delivery command was a Python guarded copy: compare each target against before-copy bytes, verify reviewed source SHA, create exact backup using exclusive writes, stage new bytes preserving mode, recheck old target before os.replace, then assert target bytes/mode and write receipt. Command exit0 actual output ends:
`PASS guarded two-file main copy, exact bytes and permissions; backup verified; no browser reload`.

| File | Old SHA256 | New SHA256 |
|---|---|---|
| sentence_groups.js | f761705b8c422f413ed4bba2317ccd1680b66862fba1a8e62e400e9a1545fe89 | 1efd544819a215a63da119617561a4cff3cf115c48035fa91fe3acd60ba5d79d |
| content.js | dbbf78614595e332b338806c4262bb7a6598bb6ab413fc217a77b0be2cb5e972 | 1da0795491d94a0d5a34b92ac23fc88055e9ba6bb42f2107a52dcd4ac2681012 |

Source fixture972B SHA129e5bbd4ff7d7638811e29f5fbdbaf69fad1ccc920ea50a31575c50daa8b1a6; full captured source SHA3c826055128c4489d707e501e5701e3594534672eb59ee213d592b802f7b55ed. Independent byte/JSON comparison confirms no text, timing or segment changes. Retained ASR names remain unverified against creator transcript.

## Independent delivery and DOM artifact audit

After the main copy, the separate reviewer read all three receipts, decoded and viewed the Enhanced screenshot, and independently compared both main targets against the reviewed worktree and exact backups. Its read-only Python audit exit0 confirmed bytes15794/216253, SHA values above, main/backup mode0644, JPEG46584B1280×720, Original exact restoration, Undo source restoration and geometry delta0. Recorded terminal receipt audit confirmed12 entries with actual Red1/Green0 and semantic rra05FAIL/rra08PASS. Reviewer did not operate the browser: these are independently audited root-executed DOM receipts, not a second native/browser run.

Reviewer command `git -C '/Users/hoangson/Projects/YouTube JP Caption Studio' diff --check -- extension/shared/sentence_groups.js extension/content/content.js` exit0, stdout/stderr empty. Overall delivery/artifact audit PASS; native Chrome activation remains NOT VERIFIED.

## Commands — raw root output

All commands ran from this worktree. Red runs occurred before fixes; Green uses current narrowed implementation. Expected duplicate-ID warning in content test is a deliberate fallback test. Semantic probe exit1 remains meaningful: rra05 FAIL, rra08 PASS.

### node extension/shared/sentence_groups_test.js — old implementation

Exit: 1

```text
PASS: normalization mapping preserves UTF-16 spans, repeats, whitespace, emoji, raw timing and input
PASS: optional parser preserves raw JSON3 text/segment timestamps, legacy output and input
PASS: sentence groups preserve source coverage, IDs, owned/lock/speaker/silence boundaries and source-window display
PASS: independent-audit regressions for segment starts, stripped speaker prefixes, complete clauses and timing revisions
PASS: dropped-row boundaries, duplicate-ID rejection and raw-source revision invalidation
PASS: internal stripped speaker boundary retains logical groups without fabricated display timing
PASS: locked blank target remains blank despite matching automatic cache
PASS: neighboring context invalidates translation revision; automatic MT metadata keeps source identity
PASS: per-language translation failures stay visible beside a valid other language
PASS: token spans reject overlap/order/missing content; source whitespace remains neutral and exact
PASS: restored UTF16 token cache requires exact ordered source coverage, including emoji
node:internal/assert/utils:146
  throw error;
  ^

AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ actual - expected

+ '第1'
- '第1弾ではすでにヒカル君、正義君、みさん、可愛い妹の証拠が販売されている。'
     ^

    at Object.<anonymous> (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/extension/shared/sentence_groups_test.js:203:8)
    at Module._compile (node:internal/modules/cjs/loader:1934:14)
    at Object..js (node:internal/modules/cjs/loader:2074:10)
    at Module.load (node:internal/modules/cjs/loader:1656:32)
    at Module._load (node:internal/modules/cjs/loader:1448:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:261:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47 {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: '第1',
  expected: '第1弾ではすでにヒカル君、正義君、みさん、可愛い妹の証拠が販売されている。',
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v26.8.1
```

### node extension/shared/sentence_groups_test.js — initial ordinal rule with verb negatives

Exit: 1

```text
PASS: normalization mapping preserves UTF-16 spans, repeats, whitespace, emoji, raw timing and input
PASS: optional parser preserves raw JSON3 text/segment timestamps, legacy output and input
PASS: sentence groups preserve source coverage, IDs, owned/lock/speaker/silence boundaries and source-window display
PASS: independent-audit regressions for segment starts, stripped speaker prefixes, complete clauses and timing revisions
PASS: dropped-row boundaries, duplicate-ID rejection and raw-source revision invalidation
PASS: internal stripped speaker boundary retains logical groups without fabricated display timing
PASS: locked blank target remains blank despite matching automatic cache
PASS: neighboring context invalidates translation revision; automatic MT metadata keeps source identity
PASS: per-language translation failures stay visible beside a valid other language
PASS: token spans reject overlap/order/missing content; source whitespace remains neutral and exact
PASS: restored UTF16 token cache requires exact ordered source coverage, including emoji
node:internal/assert/utils:146
  throw error;
  ^

AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

1 !== 2

    at Object.<anonymous> (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/extension/shared/sentence_groups_test.js:218:10)
    at Module._compile (node:internal/modules/cjs/loader:1934:14)
    at Object..js (node:internal/modules/cjs/loader:2074:10)
    at Module.load (node:internal/modules/cjs/loader:1656:32)
    at Module._load (node:internal/modules/cjs/loader:1448:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:261:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47 {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: 1,
  expected: 2,
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v26.8.1
```

### node extension/shared/sentence_groups_test.js — final

Exit: 0

```text
PASS: normalization mapping preserves UTF-16 spans, repeats, whitespace, emoji, raw timing and input
PASS: optional parser preserves raw JSON3 text/segment timestamps, legacy output and input
PASS: sentence groups preserve source coverage, IDs, owned/lock/speaker/silence boundaries and source-window display
PASS: independent-audit regressions for segment starts, stripped speaker prefixes, complete clauses and timing revisions
PASS: dropped-row boundaries, duplicate-ID rejection and raw-source revision invalidation
PASS: internal stripped speaker boundary retains logical groups without fabricated display timing
PASS: locked blank target remains blank despite matching automatic cache
PASS: neighboring context invalidates translation revision; automatic MT metadata keeps source identity
PASS: per-language translation failures stay visible beside a valid other language
PASS: token spans reject overlap/order/missing content; source whitespace remains neutral and exact
PASS: restored UTF16 token cache requires exact ordered source coverage, including emoji
PASS: captured ordinal fragment joins with exact source spans/clocks; generalized numeral forms and independent safety boundaries retained
```

### node scripts/sentence_content_sanity.js — old serializer

Exit: 1

```text
AssertionError [ERR_ASSERTION]: Backup metadata must describe the loaded grouping algorithm, not a hardcoded old version

1 !== 2

    at /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:74:10 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 1,
  expected: 2,
  operator: 'strictEqual',
  diff: 'simple'
}
```

### node scripts/sentence_content_sanity.js — final

Exit: 0

```text
PASS: independent Enhanced/grouping flags roll back display to Original, retaining originals, saved items and sidecar backup metadata; reenable rebuilds
[jpcap] Sentence projection rejected; keeping Original TypeError: Sentence projection requires unique cue IDs
    at Object.buildSentenceGroups (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/extension/shared/sentence_groups.js:130:75)
    at refreshSentenceProjection (evalmachine.<anonymous>:236:35)
    at evalmachine.<anonymous>:1:16
    at Script.runInContext (node:vm:150:12)
    at Object.runInContext (node:vm:302:6)
    at run (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:57:30)
    at /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:162:3
PASS: production mode/playhead/undo/video-reset/invalid-ID fallback; original state unchanged, fragment MT withheld
PASS: active display resolver and saved snapshot/provenance; shared sentence star, revision change keeps old snapshot
PASS: versioned sidecar adapter reload restores undo; changed source invalidates override (isolated storage adapter)
PASS: malformed/unavailable disposable sidecar preserves successful legacy cache load
PASS: same-track new navigation reads its own sidecar instead of reusing aborted session load
PASS: production JSON export payload preserves original clocks/text, raw track, metadata and saved provenance; browser delivery not covered
PASS: explicit restore/recovery preserves source clocks, locks, tombstones and other saved videos; wrong video/duplicate IDs rejected (isolated storage adapter)
```

### node scripts/sentence_saved_state_sanity.js

Exit: 0

```text
PASS: actual legacy save waits/commits before restore; restored memory, storage and disk adapter retain new source
PASS: sibling tab holding an old metadata response cannot overwrite restored script; worker compares revision inside its queue
PASS: sibling late sidecar write cannot erase restored Undo; shared worker rejects older metadata revision
PASS: held restore commit and another tab star share production worker queue; other-video snapshot survives
PASS: malformed/null Original token cache cannot replace restored source
PASS: hydration discards wrong-source memory/cache tokens and retains exact matching original tokens
PASS: foreign sender rejected; actual TypeScript Saved Items deletion uses worker mutation and removes only its selected ID
```

### node scripts/sentence_scheduler_sanity.js

Exit: 0

```text
PASS: prefetch flag suppresses automatic HTTP while explicit manual translation still executes HTTP200
PASS: production content applies group HTTP200 without changing originals; new-session debounce publishes once
PASS: neighbor edit/lock rejects stale target translation; valid late result paints current playhead, never rewinds
PASS: held real HTTP200 after disabling each flag cannot apply stale Enhanced results or mutate originals
PASS: Original trace uses filtered cue jobs, records accepted/cache results, no extra HTTP or locked/existing rewrite
PASS: Enhanced VI/EN filtered submissions and accepted results have separate language events, one shared HTTP attempt and unchanged originals
PASS: mid-flight Original export keeps first HTTP receipt with 15 ready results while second batch held; final two attempts dedup
PASS: real HTTP503 becomes per-language content error and suppresses automatic retry for 30s
PASS: actual projection/submission/accepted/stale/error lifecycle exported without caption/key text; no onset-readiness claim
```

### node extension/shared/gemini_translate_test.js

Exit: 0

```text
PASS: localhost HTTP200, 90 jobs / concurrent duplicate callers / 6 batches / peak 3; immutable inputs and cache
PASS: context/language invalidation; HTTP200 wrong revision/duplicate IDs and HTTP503 are failures, never completion
PASS: results after user lock, source edit or session change never mutate current cues
PASS: key probe shares three-request admission; actual HTTP429 without Retry-After waits >=1000ms then retries once
PASS: concurrent HTTP429 retries honor the longer shared cooldown
PASS: two production clients share one broker; 90 jobs HTTP peak 3, valid Settings probe admitted, oversized/foreign/unsupported rejected
```

### node scripts/sentence_tokenize_sanity.js

Exit: 0

```text
HTTP: POST /tokenize_batch 200; parsed 1 sentence results
PASS: whole joined sentence tokenized through real bridge HTTP200; emoji code-point→UTF16 offsets/readings validated, lock and originals unchanged, no duplicate call
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
PASS: real bridge trimming across two logical groups preserves exact display source including neutral whitespace
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
PASS: held real HTTP200 from prior session cannot block same-track new-session NLP or discard its tokens
```

### node --check extension/content/content.js

Exit: 0

```text
(stdout/stderr empty)
```

### node --check extension/shared/sentence_groups.js

Exit: 0

```text
(stdout/stderr empty)
```

### node .tmp-sentence-mvp/creator-reference-frames-2026-10-10/check-rra-fragments.js

Exit: 1

```text
VERIFIED:6 actual JSON3 cues/125 UTF16 units; parser/raw mapping and once-only source coverage; candidates byte-unchanged
{"rowId":"rraWPrKKwRc-05","status":"FAIL","expectedText":"なんで普通に買い物できんの?","expectedRefs":[{"cueId":"snapshot-40","charStart":42,"charEnd":43},{"cueId":"snapshot-41","charStart":0,"charEnd":13}],"actualGroups":[{"text":"どうぞご覧くださいませ。","sourceRefs":[{"cueId":"snapshot-40","charStart":0,"charEnd":12}]},{"text":"このワンピ可愛くねえ。","sourceRefs":[{"cueId":"snapshot-40","charStart":12,"charEnd":23}]},{"text":"めっちゃいい。","sourceRefs":[{"cueId":"snapshot-40","charStart":23,"charEnd":30}]},{"text":"キャップと秋で組めたわ。","sourceRefs":[{"cueId":"snapshot-40","charStart":30,"charEnd":42}]},{"text":"な","sourceRefs":[{"cueId":"snapshot-40","charStart":42,"charEnd":43}]},{"text":"んで普通に買い物できんの?","sourceRefs":[{"cueId":"snapshot-41","charStart":0,"charEnd":13}]},{"text":"次どこ行く?","sourceRefs":[{"cueId":"snapshot-42","charStart":0,"charEnd":6}]},{"text":"コスメ","sourceRefs":[{"cueId":"snapshot-42","charStart":6,"charEnd":9}]}],"diagnostics":[{"cueId":"snapshot-41","reason":"speaker-change"}],"referenceKind":"sampled creator lexical continuity; no verified audio timing"}
{"rowId":"rraWPrKKwRc-08","status":"PASS","expectedText":"第1弾ではすでにヒカル君、正義君、みさん、可愛い妹の証拠が販売されている。","expectedRefs":[{"cueId":"snapshot-72","charStart":0,"charEnd":2},{"cueId":"snapshot-73","charStart":0,"charEnd":35}],"actualGroups":[{"text":"このステッカーは選んで購入できるそうだ。","sourceRefs":[{"cueId":"snapshot-71","charStart":0,"charEnd":20}]},{"text":"第1弾ではすでにヒカル君、正義君、みさん、可愛い妹の証拠が販売されている。","sourceRefs":[{"cueId":"snapshot-72","charStart":0,"charEnd":2},{"cueId":"snapshot-73","charStart":0,"charEnd":35}]},{"text":"うき、","sourceRefs":[{"cueId":"snapshot-73","charStart":35,"charEnd":38}]}],"diagnostics":[{"cueId":"snapshot-73","reason":"overlap-anchor-continuation"}],"referenceKind":"sampled creator lexical continuity; no verified audio timing"}
Full50 gold/audio timing/KPI NOT VERIFIED; per-row results above retain unresolved boundaries
```

Other actual commands: `git diff --check` exit0, stdout/stderr empty. Scoped `diff -u` before/current for both production files exit1 because differences exist; output was inspected and matches the small delta described above. This is diff evidence, not a test failure.

## Problems / required remaining work

rra05 retains な and んで普通に買い物できんの? separate: speakerChange:true and4.719s source-window gap. Keep guard/source timing; sampled lexical continuity alone does not authorize forced merge. source17 speaker/question semantic boundaries also remain FAIL from previous partial reference review. Do not label the whole50 set verified or use holdout for tuning.

Full release still needs50 verified reference spans/boundaries and representative samples, source/audio timing, tune/holdout separation, live Gemini VI/EN readiness/cost/latency and native protected/owned/tombstone/backup/flag/lifecycle/Drive checks. Existing bridge data-authority question remains unanswered; active old bridge process/data roots were not changed. Original remains default. Full goal active; this bounded PASS is not release PASS.
