<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: thực hiện plan, không dừng giữa chừng -->
# Rollback flags and native cost-clock follow-up

STATUS: PASS for independently reviewed bounded flags slice and native artifact integrity/arithmetic. Native flags activation, full persistence/Drive, gold and full MVP NOT VERIFIED.

Plan §12 names three independent flags. Current disk had only per-video Original/Enhanced mode, which did not satisfy these switches. ONE production file changed: extension/content/content.js. Existing hardsubSettings storage carries enhanced_subtitles_enabled, sentence_grouping_enabled and sentence_translation_prefetch_enabled. Availability defaults true, mode remains per-video Original. No new UI switch or dependency. Master/grouping false force display Original and published availability false; mode command cannot override disabled gate. Prefetch false suppresses automatic translation centrally while explicit manual translation remains available. Settings listener cancels automatic work. Mode/flag guards reject late MT and NLP responses. Rollback preserves source/user edits/saved data and revision-bound sidecars; reenabling rebuilds display without opting into Enhanced.

## Real Red, initial-load defect and Green

Parent `node scripts/sentence_content_sanity.js` before production change exit1: actual enhanced, expected original; enhanced_subtitles_enabled must roll back to Original. Parent `node scripts/sentence_scheduler_sanity.js` before production change exit1: automatic localhost HTTP requests1, expected0, disabled prefetch ignored.

First implementation preserved metadata when projection already existed. Self-audit and independent reviewer found disabled before first projection could load sidecar maps then export/save empty maps because serializer filtered through absent groups. Reviewer production load/snapshot probe exit1:

```text
{"projectionNull":true,"loadedTranslations":1,"loadedTokens":1,"snapshotTranslations":0,"snapshotTokens":0}
AssertionError: flags disabled before first projection must preserve loaded MT in backup
actual: {}
expected: original nonempty translation map
```

Permanent parent test initially seeded an all-protected fixture and failed before serializer assertion; this harness error and correction were logged. An isolated unprotected cue then reproduced actual serializer Red exit1 (nonempty expected maps, actual empty). Minimum serializer fix retains existing maps while grouping is disabled; reenable still validates against current source/revisions before display. Independent load → snapshot → worker save → restore adapters Green `node` stdin exit0:

```text
{"flag":"enhanced_subtitles_enabled","initialProjectionNull":true,"loadedTranslations":1,"loadedTokens":1,"snapshotTranslations":1,"snapshotTokens":1,"savedMapsEqual":true,"restoreMapsEqual":true,"originalsUnchanged":true,"reenabledMode":"original"}
{"flag":"sentence_grouping_enabled","initialProjectionNull":true,"loadedTranslations":1,"loadedTokens":1,"snapshotTranslations":1,"snapshotTokens":1,"savedMapsEqual":true,"restoreMapsEqual":true,"originalsUnchanged":true,"reenabledMode":"original"}
PASS: initial-disabled production load/snapshot/worker-save/restore preserves loaded MT+tokens for both flags; reenable rebuilds without opting in; isolated Chrome/bridge adapters only
```

Independent actual settings listener/payload/mode command `node` stdin exit0:

```text
{"flag":"enhanced_subtitles_enabled","cancelAutomatic":true,"payloadMode":"original","available":false,"originalsUnchanged":true}
{"flag":"sentence_grouping_enabled","cancelAutomatic":true,"payloadMode":"original","available":false,"originalsUnchanged":true}
{"flag":"sentence_translation_prefetch_enabled","cancelAutomatic":true,"payloadMode":"enhanced","available":true,"originalsUnchanged":true}
PASS: actual settings listener cancels automatic work for each flag and actual published payload/mode command follows master+grouping gates; reenable does not opt into Enhanced, original cues unchanged
```

Independent NLP guard `node` stdin exit0, two actual bridge POST /tokenize_batch HTTP200 parsed1 result each. Disabled-start requests0; heldHTTP200 after master/groupingoff appliedTokens0/pending0/originalsUnchangedtrue. This uses test text only. Reviewer adapter omitted activeCueId on first probe (ReferenceError); fixed adapter passed. Initial NLP probe returned exit0 without final PASS after test-only retry state prevented second case. That incomplete run was NOT counted; retry reset between independent cases plus incomplete-async guard produced both cases and final PASS. Distinct harness errors logged.

## Parent and independent permanent checks

Both executed these commands against disk, all exit0:

```text
node scripts/sentence_content_sanity.js
PASS: independent Enhanced/grouping flags roll back display to Original, retaining originals, saved items and sidecar backup metadata; reenable rebuilds
[jpcap] Sentence projection rejected; keeping Original TypeError: Sentence projection requires unique cue IDs
PASS: production mode/playhead/undo/video-reset/invalid-ID fallback; original state unchanged, fragment MT withheld
PASS: active display resolver and saved snapshot/provenance; shared sentence star, revision change keeps old snapshot
PASS: versioned sidecar adapter reload restores undo; changed source invalidates override (isolated storage adapter)
PASS: malformed/unavailable disposable sidecar preserves successful legacy cache load
PASS: same-track new navigation reads its own sidecar instead of reusing aborted session load
PASS: production JSON export payload preserves original clocks/text, raw track, metadata and saved provenance; browser delivery not covered
PASS: explicit restore/recovery preserves source clocks, locks, tombstones and other saved videos; wrong video/duplicate IDs rejected (isolated storage adapter)
```

Unique-ID warning is the intentional invalid-ID regression, with asserted Original fallback.

```text
node scripts/sentence_scheduler_sanity.js
PASS: prefetch flag suppresses automatic HTTP while explicit manual translation still executes HTTP200
PASS: production content applies group HTTP200 without changing originals; new-session debounce publishes once
PASS: neighbor edit/lock rejects stale target translation; valid late result paints current playhead, never rewinds
PASS: held real HTTP200 after disabling each flag cannot apply stale Enhanced results or mutate originals
PASS: real HTTP503 becomes per-language content error and suppresses automatic retry for 30s
```

```text
node scripts/sentence_tokenize_sanity.js
HTTP: POST /tokenize_batch 200; parsed 1 sentence results
PASS: whole joined sentence tokenized through real bridge HTTP200; emoji code-point→UTF16 offsets/readings validated, lock and originals unchanged, no duplicate call
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
PASS: real bridge trimming across two logical groups preserves exact display source including neutral whitespace
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
PASS: held real HTTP200 from prior session cannot block same-track new-session NLP or discard its tokens
```

```text
node scripts/sentence_benchmark_sanity.js
PASS: actual content sync excludes seeking onset
PASS: actual paint observer rechecks hidden tab, Japanese and overlay settings inside RAF
PASS: production sync measures one player clock across interleaved frame/timeupdate/tick calls; one onset, no artificial discontinuity, renderer timestamps preserved
PASS: empty metrics remain NOT VERIFIED; cold/warm onset bounds distinguish ready/missing/uncertain; seek/gaps excluded; real receipt IDs deduplicate HTTP attempts; no fabricated cost
```

```text
node scripts/sentence_cost_sanity.js
PASS: actual HTTP200 VI/EN batch dedup keeps thinking/cache usage; rejected translation retains usage; cache exports no historical request; list-price estimate is separate from unverified billing
PASS: missing/expired/unknown/invalid usage never becomes zero-cost success; totals include thinking; incomplete trace estimates are explicitly partial
```

Parent `node --check extension/content/content.js` exit0 empty. Both `git diff --check` exit0 empty. No skipped/weakened assertions, production database or Drive writes.

After bounded independent PASS, main content.js old bytes matched deployment receipt and preflags snapshot; guarded Python backup/copy preserved permissions, verified bytes and updated receipt. `python3 -` exit0:

```text
GUARDED COPY extension/content/content.js SHA256 7dd65091e7404761150e21f820d9f02d0e7106b0dd451b43ddf2da57b2d5feef permissions preserved; flags native activation NOT VERIFIED
```

Receipt/backup `.tmp-sentence-mvp/chrome-flags-before-2026-10-10/receipt.json`. Copy happened AFTER native session below. Chrome still runs preflags code until next reload/new document; no native flags activation claim.

## Native warning, cost schema and short clock trace

User granted another two-minute Chrome window. Parent CUA inspected Katou Chrome Extensions: enabled0.11.2 loaded from ~/Projects/YouTube JP Caption Studio/extension. One early tab-select was interrupted by changed window state; fresh AX and retry succeeded. Reload displayed Reloaded. Parent refreshed the current public video TJ2zrbH0BB4, enabled LR briefly, opened real sidepanel menu and saw complete TXT warning. Saved native screenshot and metrics using Save dialog with unique filename. Download UI displayed Done. Original stayed selected; existing JP/VI rows were visible. Parent returned LR to initial OFF and stopped native actions. No keys, settings credentials or OAuth consent touched.

Screenshot `.tmp-sentence-mvp/native-txt-warning-2026-10-10.png`:837157bytes,SHA256e49884cd92a844beec8d1523194153f2c50dcd687f01244ee3a51ebe8c88e3e4. Parent and reviewer visually inspected readable note and surrounding context.

Native file `/Users/hoangson/Downloads/yt-caption-TJ2zrbH0BB4-cost-clock-2026-10-10.json`:4336bytes,SHA2560fdacd35c80c176f71f81d82ce94d679b41447198eca2818ddd87d071a5d2e35. Parent Python parse/hash exit0. Reviewer independent `python3 -` hash/counter/arithmetic assertions exit0:

```text
{"events":{"track_loaded":4,"onset":6,"jp_paint":1},"discontinuities":0,"dropped":0,"distinctOnsets":6,"trackLoadedMs":1623.4000000357628,"ttfvMs":9457.600000023842,"paintRect":{"width":657.453125,"height":125.7578125,"top":368.8359375,"left":208.328125},"requestCount":0,"cost":null,"costEstimate":null,"costStatus":"NOT VERIFIED","eventWindowMs":[3104.5,23049.399999976158]}
PASS: native cost-clock artifact hash/bytes, distinct Original JA onset bounds/phases, timing arithmetic and null unobserved cost are consistent; no raw-sample causality, Enhanced, flags deployment or KPI claim
```

Original JA has1cold/5warm onsets, allready with lower/upper1. These labels are elapsed trace warmup windows, not independently demonstrated network cache-cold/warm states. apiCostEstimate object is present; amountnull/totalAttempts0/statusNOT VERIFIED. This confirms native activation of the cost export schema and visible warning. Main preflags bytes independently matched reviewed cost/clock/warning receipt; flags were not yet copied. Six onsets have distinct anchors and no discontinuity; different video/session from prior237-discontinuity trace. Missing raw samples prevent attributing improvement solely to clock correction. TTFV includes wait before overlay paint, not API latency. No live Gemini request, Enhanced/VI/EN readiness or release KPI is established.

REQUIREMENTS: named flags/cancellation/late-result guards/metadata preservation VERIFIED in bounded runtime checks; native warning/cost schema VERIFIED by parent UI + reviewer artifact/screenshot audit; native flags/complete DATA-02 NOT VERIFIED.
API_CHECKS: actual localhost translation protocol200/503 and actual local bridge tokenize_batch200, synthetic test inputs. No live Gemini attempt in native artifact.
DATABASE_CHECKS: worker/storage/save/restore adapters isolated; production database/Drive unchanged.
PROBLEMS / REQUIRED_FIXES: no bounded flags blocker; native flags, audio-reviewed gold, live translation readiness/cost, protected-data native persistence, Drive OAuth mismatch and rate/seek/background matrix remain open. Full goal active.
