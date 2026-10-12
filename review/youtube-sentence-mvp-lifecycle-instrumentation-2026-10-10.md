<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu plan, đổi tên và thực hiện không dừng giữa chừng -->

# DATA-02 lifecycle instrumentation and mid-flight receipts

STATUS: PASS for independently reviewed bounded lifecycle instrumentation, including final Original receipt delta. Native activation, real Gemini/billing, performance, audio gold and full MVP NOT VERIFIED.

## Requirement and final behavior

Plan Phase0 requires groupPrepared, translationQueued, translationReady and error instrumentation alongside playback observations. Existing trace exported track/onset/paint/HTTP receipts but lacked group/translation milestones. Three production files changed in this slice: content.js, sentence_benchmark.js and gemini_translate.js. Exact before copies are under `.tmp-sentence-mvp/lifecycle-before-2026-10-10/`; the full repository diff also contains earlier authorized slices.

Collector emits logical group preparation once per ID+revision, filtered content submissions, accepted ready results, discarded ready results, errors and cancellation. Mode/language/cache flags distinguish Original from Enhanced and VI from EN. Private dialogue-bearing IDs/revisions map to local ordinal groupRef; no source/context/target/error/key text is added to lifecycle export. Identity text is bounded4MiB; events/identities10000. Truncation stays NOT VERIFIED. This bounds identity text, not total process memory.

Original translateCues exposes two optional observer callbacks after its actual target filter and acceptance guard. No duplicate filter in content. Enhanced observes actual job submissions and current-projection acceptance. Existing renderer, queue/admission, source, persistence and cancellation contracts remain. Lifecycle is session-only, outside transcript backup/sidecar.

Definitions matter: group_prepared is logical structure, not NLP/translation/audio verification. translation_queued is content submission, not worker admission or HTTP start; repeat submissions may share attempts/cache. translation_ready is accepted current text, not observed onset readiness or paint. Enhanced error accepted:true means error/retry state accepted into current projection, not successful target text. Discarded results may still incur HTTP cost. Unfinished attempts are not yet observed receipts.

## Actual Red and corrections

Parent `node scripts/sentence_scheduler_sanity.js` exit1 before production instrumentation:

```text
AssertionError [ERR_ASSERTION]: actual projection must record prepared groups
actual: false
expected: true
```

First trace-enabled adapter omitted performance, so an existing ready assertion failed before the new requirement. Adapter corrected to include the real Node performance object, then the above actual Red was obtained. A later new assertion mistakenly counted elapsed cue a in the automatic window: actual jobs are current b/future c, so changing neighbor a invalidates only b. Corrected with an explicit two-submission window assertion. Both distinct harness mistakes logged append-only; no production workaround or weakened prior expectation.

Independent initial review noted Original receipts were still collected only after aggregate report completion. Parent added a real two-batch16-job regression: first15 return HTTP200, last1 held; export after15 ready must retain1 attempt. Parent actual Red exit1, then minimal onResult receipt observation Green exit0:

```text
AssertionError [ERR_ASSERTION]: mid-flight export must retain receipt of first accepted batch before aggregate report
0 !== 1
actual: 0
expected: 1
```

Reviewer independently removed only the new receipt line in loaded VM source, without editing disk: same real HTTP regression Red exit1/0!==1. Current production source Green exit0, mid-flight1/final2. The aggregate loop remains and receipt ID dedup prevents counting batch1 twice. `finally` releases/awaits held work even when an assertion fails. Initial formal review's pre-delta content SHA5181c301 and aggregate-only receipt qualification are superseded by final addendum/current SHA5f5335d below.

## Actual command evidence

Parent and reviewer ran `node scripts/sentence_scheduler_sanity.js`; final exit0, raw stdout:

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

Both `node scripts/sentence_benchmark_sanity.js` exit0:

```text
PASS: actual content sync excludes seeking onset
PASS: actual paint observer rechecks hidden tab, Japanese and overlay settings inside RAF
PASS: production sync measures one player clock across interleaved frame/timeupdate/tick calls; one onset, no artificial discontinuity, renderer timestamps preserved
PASS: lifecycle uses private revision ordinals, dedups prepared groups, distinguishes accepted/cache/discard/error/cancel; identity/event caps stay unverified without caption/key export
PASS: empty metrics remain NOT VERIFIED; cold/warm onset bounds distinguish ready/missing/uncertain; seek/gaps excluded; real receipt IDs deduplicate HTTP attempts; no fabricated cost
```

Both `node extension/shared/gemini_translate_test.js` exit0:

```text
PASS: localhost HTTP200, 90 jobs / concurrent duplicate callers / 6 batches / peak 3; immutable inputs and cache
PASS: context/language invalidation; HTTP200 wrong revision/duplicate IDs and HTTP503 are failures, never completion
PASS: results after user lock, source edit or session change never mutate current cues
PASS: key probe shares three-request admission; actual HTTP429 without Retry-After waits >=1000ms then retries once
PASS: concurrent HTTP429 retries honor the longer shared cooldown
PASS: two production clients share one broker; 90 jobs HTTP peak 3, valid Settings probe admitted, oversized/foreign/unsupported rejected
```

Both `node scripts/sentence_cost_sanity.js` exit0:

```text
PASS: actual HTTP200 VI/EN batch dedup keeps thinking/cache usage; rejected translation retains usage; cache exports no historical request; list-price estimate is separate from unverified billing
PASS: missing/expired/unknown/invalid usage never becomes zero-cost success; totals include thinking; incomplete trace estimates are explicitly partial
```

Both content sanity exit0 with8PASS and intentional duplicate-ID rejection/Original fallback; parent tokenize sanity exit0 with4actual bridge POST/tokenize_batch200, parsed1/2/2/2 results and3PASS for exactUTF16/whitespace/stale-session preservation. These checks were run before the final receipt-only delta; final scheduler/syntax/diff checks after it. Prior full flags/native review retains those stdout details.

Reviewer additionally ran own production VM/held localhost HTTP probes, exit0:

```text
REVIEW PASS: held actual HTTP200 navigation-generation result stays in retired trace; new trace 0 events / 0 requests, old trace 2 discarded / 1 HTTP attempt, no new cue write
REVIEW PASS: Original held actual HTTP200 after lock/source edit/generation/mode change yields 1 filtered submission, 1 discarded response, 0 accepted ready, no target write (four cases)
REVIEW PASS: same revision dedup, changed revision new ordinal, invalid status/language ignored, inputs unchanged; source/context/targets/errors/key omitted, cache has zero historical HTTP
REVIEW PASS: accumulated UTF16 identity budget truncates 1043 retained / 3957 dropped; oversized subsequent result rejected; no verified status
```

Two fixture-only scheduled sidecar saves after probe reset warned cache unavailable; no production storage writes or storage PASS inferred from warnings. Reviewer source/scheduler probes model navigation generation boundaries, not full native onNavigate/browser interactions. Distinct expected probe warnings logged.

Both three production node syntax checks and `git diff --check` exit0, empty output. No skipped/weakened assertions. Reviewer final byte hashes match guarded main copy.

## Main copy, not native activation

After final independent PASS, parent guarded `python3 -` exit0 compared all old main bytes with before snapshot/deployment receipt, backed up originals, preserved modes, copied only3 reviewed files and rechecked exact bytes:

```text
GUARDED COPY extension/content/content.js 5f5335d85454f21b911afb49c7c3a058261b1d03867452ea4af1b034349d9db0 permissions preserved
GUARDED COPY extension/shared/sentence_benchmark.js cf6a849e63d726830992f79de7fe6c2adc9042f661ccd49d7f53ee6589f5106c permissions preserved
GUARDED COPY extension/shared/gemini_translate.js 2a5813aaeba99236990c4854a5564f92964bd8254983633d8d81cd78f0fd1c88 permissions preserved
PASS: all three main files match reviewed bytes; original backups and receipt retained. No Chrome reload/native activation.
```

Receipt `.tmp-sentence-mvp/chrome-lifecycle-before-2026-10-10/receipt.json`. Last Chrome window was consumed in the prior turn; no native actions this turn. Native flags/lifecycle still require fresh reload/document verification.

## Five-source structural observation, not gold

Parent separately ran Node stdin actual five captured JSON3 bodies through production parser/normalizer/grouping, exit0. Asserted each effective cue's UTF16 spans cover text exactly once, contiguous without duplication, and cue objects unchanged. Rows `(videoId,cues,groups,mergedGroups,splitCues,displayUnits)`:

```text
ylnxFdPhLCo   101 167 3 39 107
rraWPrKKwRc    95 129 2 28 101
CLs0YSeggXk    88 142 0 31  88
_aMBGfcwtGY   112 149 0 29 116
oLYBgoeslnk   116 180 1 50 126
PASS: actual five captured JSON3 bodies traverse production parser/normalizer/grouping with exact once-only effective text coverage and unchanged source cues; counts are structural, not gold or quality KPI.
```

No new HTTP capture/audio/reference review, semantic tuning or holdout-quality claim. Parent-only structural observation is distinct from independent lifecycle review. Snapshot integrity/annotation qualifications remain in the earlier annotation review.

REQUIREMENTS: lifecycle/privacy/bounds/current-revision acceptance/mid-flight receipt VERIFIED in bounded runtime; full DATA-02/KPIs NOT VERIFIED.
API_CHECKS: actual localhost HTTP200/503/429 protocol/parse, isolated test inputs; real local bridge NLP200. Live Gemini/billing NOT VERIFIED.
DATABASE_CHECKS: no database/schema change, production stores/Drive untouched; adapters isolated.
PROBLEMS / REQUIRED_FIXES: no bounded lifecycle blocker. Native flags/lifecycle activation, audio-reviewed gold, live translation readiness/cost, native protected-data persistence/Drive and rate/seek/background remain open. Full goal active.
