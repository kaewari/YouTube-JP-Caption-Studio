<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: implement revised sentence MVP plan -->

# Enhanced default — bounded implementation review

The [revised plan](../plan/youtube-sentence-enhancement-mvp-2026-10-10.md) sections 2.1, 6 and 15 require Enhanced by default. Previous source instead reset every new track to Original. The single production change sets Enhanced at the new track key reset. Subsequent guards still fall back to Original when disabled, non-YouTube, missing engine or invalid projection. Explicit Original survives same-track refresh; explicit backup restore also stays Original. The pre-track initializer remains Original until a track is evaluated.

STATUS: PASS for the bounded default-mode source and isolated runtime behavior, independently reviewed by independent_audit. Native activation and full MVP remain NOT VERIFIED. This corrects historical Original-default descriptions in earlier raw reviews; those files remain immutable. It does not establish that current grouping passes the semantic release gate.

## Requirements and actual evidence

| Criterion | Status / evidence |
|---|---|
| Fresh eligible track, new video and new language default Enhanced | VERIFIED by actual production helper execution; independent reviewer also tested video/language transitions |
| Explicit Original survives same-track refresh and cues array replacement | VERIFIED by production command test and separate reviewer probe |
| Both feature flags, non-YouTube, missing engine and duplicate-ID projection fallback | VERIFIED by content suite and reviewer probe; invalid IDs produce the expected warning |
| Undo and restore retain source/clocks/locks/tombstones/saved provenance | VERIFIED in production helpers with isolated adapters; parent real Chromium DOM verified toggle/Undo |
| Automatic Enhanced scheduler and explicitly selected Original | VERIFIED with actual localhost HTTP200, held HTTP200, HTTP503 and parsed payloads; no live Gemini request |
| Delivery to main extension source | Exact-byte/hash/mode verification with previous-byte backup; native reload NOT VERIFIED |
| Database/Antigravity state/Drive | No mutation; no round-trip claim from this slice |
| Gold/audio/semantic quality/readiness and full release | NOT VERIFIED; known source17 and rra05 gaps remain open |

## Minimal diff and tests

```diff
@@ refreshSentenceProjection, when sentenceTrackKey changes
-      captionMode = "original";
+      captionMode = "enhanced";
```

Tests execute production functions, not string-presence assertions. The scheduler's Original fixtures now initialize the track then explicitly choose Original. Assertions for jobs, HTTP counts, locks, accepted/cache/error and mid-flight receipts remain intact. The happy path no longer forces Enhanced; it asserts the actual default.

The first scheduler run after the production edit failed at its older implicit-Original setup (exit1 after four PASS lines, actual0 expected1 original queued event). Parent logged and corrected that setup; reviewer sampled the older fixture during the edit, reread disk and independently reran the final version successfully. This is test adaptation to an intentional default change, with full expectations retained.

## Parent command receipts

```text
COMMAND: node scripts/sentence_content_sanity.js
EXIT CODE: 1
STDOUT:
(empty)
STDERR:
AssertionError [ERR_ASSERTION]: a fresh eligible YouTube track should default to Enhanced
+ actual - expected

+ 'original'
- 'enhanced'

    at /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:61:10 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 'original',
  expected: 'enhanced',
  operator: 'strictEqual',
  diff: 'simple'
}
```

```text
COMMAND: node scripts/sentence_content_sanity.js
EXIT CODE: 0
STDOUT:
PASS: independent Enhanced/grouping flags roll back display to Original, retaining originals, saved items and sidecar backup metadata; reenable rebuilds
PASS: production mode/playhead/undo/video-reset/invalid-ID fallback; original state unchanged, fragment MT withheld
PASS: active display resolver and saved snapshot/provenance; shared sentence star, revision change keeps old snapshot
PASS: versioned sidecar adapter reload restores undo; changed source invalidates override (isolated storage adapter)
PASS: malformed/unavailable disposable sidecar preserves successful legacy cache load
PASS: same-track new navigation reads its own sidecar instead of reusing aborted session load
PASS: production JSON export payload preserves original clocks/text, raw track, metadata and saved provenance; browser delivery not covered
PASS: explicit restore/recovery preserves source clocks, locks, tombstones and other saved videos; wrong video/duplicate IDs rejected (isolated storage adapter)
STDERR:
[jpcap] Sentence projection rejected; keeping Original TypeError: Sentence projection requires unique cue IDs
    at Object.buildSentenceGroups (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/extension/shared/sentence_groups.js:130:75)
    at refreshSentenceProjection (evalmachine.<anonymous>:236:35)
    at evalmachine.<anonymous>:1:16
    at Script.runInContext (node:vm:150:12)
    at Object.runInContext (node:vm:302:6)
    at run (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:57:30)
    at /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:168:3
```

```text
COMMAND: node scripts/sentence_scheduler_sanity.js
EXIT CODE: 0
STDOUT:
PASS: prefetch flag suppresses automatic HTTP while explicit manual translation still executes HTTP200
PASS: production content applies group HTTP200 without changing originals; new-session debounce publishes once
PASS: neighbor edit/lock rejects stale target translation; valid late result paints current playhead, never rewinds
PASS: held real HTTP200 after disabling each flag cannot apply stale Enhanced results or mutate originals
PASS: Original trace uses filtered cue jobs, records accepted/cache results, no extra HTTP or locked/existing rewrite
PASS: Enhanced VI/EN filtered submissions and accepted results have separate language events, one shared HTTP attempt and unchanged originals
PASS: mid-flight Original export keeps first HTTP receipt with 15 ready results while second batch held; final two attempts dedup
PASS: real HTTP503 becomes per-language content error and suppresses automatic retry for 30s
PASS: actual projection/submission/accepted/stale/error lifecycle exported without caption/key text; no onset-readiness claim
STDERR:
(empty)
```

```text
COMMAND: node --check extension/content/content.js
EXIT CODE: 0
STDOUT:
(empty)
STDERR:
(empty)
```

```text
COMMAND: git diff --check -- extension/content/content.js scripts/sentence_content_sanity.js scripts/sentence_scheduler_sanity.js
EXIT CODE: 0
STDOUT:
(empty)
STDERR:
(empty)
```

The duplicate-ID warning in the passing content suite is the deliberately exercised rejection case. Independent reviewer separately ran both final Node commands with exit0, plus a broader production VM probe covering fresh/new video/new language, same-track array replacement, flags, non-YouTube, missing engine and duplicate IDs. The reviewer also ran previous production source from main before copying: its fresh-track Enhanced assertion failed with exit1 and actual Original. No independent browser session was claimed.

## Actual sidepanel DOM

Parent used CUA in the background Codex in-app browser at localhost, with real production sidepanel HTML/CSS/JS and production projection/command helpers. Chrome storage, bridge, Gemini and disk transport were isolated. The temporary server was `.tmp-sentence-mvp/default-mode-2026-10-11/serve-ui.py`; it reads current production functions from disk. The initial adapter retained its own projection after production Undo; that fixture error was logged and corrected to publish current production `enhancedCues`. Final evidence below comes from the corrected adapter.

UI actions: fresh load, click `#sp-caption-mode` to Original, click again to Enhanced, click the third `Undo` button. After each interaction a fresh AX state was read, and read-only DOM evaluation collected labels, IDs, Japanese text, locked VI, play anchors and `getBoundingClientRect()` width/height/top/left. Assertions ran in CUA and returned:

```text
PASS: production-default Enhanced → Original → Enhanced → Undo, exact anchors/locked VI, 4 DOM rows and positive pixel bounds
```

default: mode=true, sources=["乗せて", "ないんですか?", "どこ行くんですか?", "どこ行くんですか?"].

original: mode=false, sources=["乗せて", "ないんですか?", "どこ", "行くんですか?"].

enhancedAgain: mode=true, sources=["乗せて", "ないんですか?", "どこ行くんですか?", "どこ行くんですか?"].

undo: mode=true, sources=["乗せて", "ないんですか?", "どこ", "行くんですか?"].

All four states retain play anchors60/69/80/81 and locked `Đã khóa`. Each row width1237 and height141.984375 pixels: width/height deltas0. Initial tops98/251.984375/405.96875/559.953125 changed by -60.5px after the panel scrolled during the first toggle; later states retained tops37.5/191.484375/345.46875/499.453125. Left14 remained constant. Do not describe this as zero movement in every dimension.

Final receipt: `ui-receipt.json`,4616B,SHA25645e4c4ebe9cee12aec9343b5d4dae879817749c58e7a650fdaed48eed3de0cd3. Actual screenshot encoding is JPEG; filenames were corrected from `.png` to `.jpg` without image-byte modification. Enhanced image46337B,SHA25688c234d5b0f6b72ee3f7891bdf57afb2d306927f217fa5d5427b9cec80a4bd85; Undo44801B,SHA2562d3fbd12bf8ef18a9a7c2ff3c83f4fba24242f7a721203ee145b29bff4bf1709. Temporary tab closed; both server sessions stopped with Ctrl-C and exit0.

## Main source delivery

Guarded copy required previous main bytes to equal current worktree bytes with only the new-track line reverted. It backed up old content, retained mode0644, wrote/fsynced a temporary sibling and atomically replaced the destination after rechecking old bytes. Receipt:

```json
{
  "destination": "/Users/hoangson/Projects/YouTube JP Caption Studio/extension/content/content.js",
  "backup": "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-mvp/default-mode-2026-10-11/main-content-before.js",
  "oldSha256": "1da0795491d94a0d5a34b92ac23fc88055e9ba6bb42f2107a52dcd4ac2681012",
  "newSha256": "a34574365bbd88f05c3583530258efd369abf33fbf8fad93af9a8b37b0f9be71",
  "mode": "0o644",
  "equalBytes": true,
  "nativeReload": "NOT VERIFIED"
}
```

```text
CWD: /Users/hoangson/Projects/YouTube JP Caption Studio
COMMAND: node --check extension/content/content.js && git diff --check -- extension/content/content.js
EXIT CODE: 0
STDOUT: (empty)
STDERR: (empty)
```

Only the main extension source was delivered in this slice. Antigravity runtime/data was not changed. Worktree source SHA matches delivered source; installed Chrome execution after this copy is NOT VERIFIED. The earlier two-minute native Chrome window was consumed before this change. Source delivery cannot prove extension activation.

## Remaining scope and evaluation

The slice aligns with the explicit Enhanced-default plan requirement. Current source17 intra-cue boundaries and rra05 continuation remain unresolved; no semantic guards or source clocks/words were loosened here. Full50 audio gold, semantic rates, live Gemini VI/EN readiness/cost/quality, native seek/rate/background matrix, protected storage and Drive checks remain required. No full MVP completion or numerical quality score is asserted.

The house-style hook continues to flag the byte-preserved raw plan's Markdown hard-break whitespace at line6. Scoped code diff checks pass; the raw plan was not rewritten to silence this historical warning.
