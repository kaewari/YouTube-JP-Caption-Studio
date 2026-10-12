<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu plan vào project, đổi tên plan; thực hiện plan -->
# Sentence MVP — queue, NLP, backup/restore review

STATUS: PASS for the independently checked projection/cache/restore/shared-worker slice.
STATUS: NOT VERIFIED for the complete MVP and installed Chrome release.

This dated snapshot follows [the source audit](youtube-sentence-mvp-source-audit-2026-10-10.md).
The earlier audit remains immutable; its “module not loaded” observation describes
the earlier snapshot. Current worktree manifest loads the module. Main Chrome still
loads the main project extension, not this worktree. No deployment claim.

## Implemented behavior and review boundary

- Original remains default per video. Shared logical sentence/display projection
  serves content overlay and sidepanel; source clocks/raw spans survive. Child
  timing requires authentic anchors. Enhanced edits open the corresponding Original.
- Sentence targets use one worker-owned Gemini broker (batch 15, admission 3).
  Cache revision covers source, context, target language, prompt/model/algorithm.
  Late responses recheck navigation/revision/locks; per-language errors stay visible.
  Actual localhost protocol checks establish admission/retry/application behavior,
  not live model quality, translation readiness, or account billing.
- Whole logical sentence NLP uses real local bridge POST /tokenize_batch. Token
  surfaces and code-point offsets convert to UTF16 and carry narrow retained raw
  spans. Missing/invalid enrichment keeps plain source. The Python backend is unchanged.
- Versioned disposable local sidecar stores raw provenance, matching translations,
  tokens and revision-bound Undo. Legacy script serializer is retained. Sidecar is
  not added to the Drive schema.
- Explicit JSON backup carries original cues/clocks/ownership/locks/tombstones,
  sidecar and selected-video saved snapshots. Restore validates version/video/source,
  IDs and timing before committing; recovery retains the previous selected-video state.
  Ordinary import rejects this backup format and points to explicit restore.
- Saved-state writes use one worker queue. Same-tab saves finish before restore;
  stale sibling script/meta/sidecar writes compare revision inside the queue.
  Restore reads the latest global saved map inside that queue and preserves other
  videos. Saved Items deletion uses the same production broker.
- Shared Original token hydration now rejects malformed or wrong-source arrays,
  including invalid arrays already in memory before its early return.
- Only POST /scripts/save gets a 20-second abort deadline: a hung HTTP request
  cannot retain the shared saved-state queue indefinitely. Other proxy rules are unchanged.

The Node sanity checks select production functions from disk and execute them.
Assertions concern returned state, rendered source and actual network responses;
source-string presence is not accepted as software verification. Chrome storage,
restore disk dispatch and Saved Items transport are isolated adapters in these tests.

## Confirmed Reds and Greens

Independent audit reproduced loss of other-video saved entries, collisions with
other-video IDs, malformed Original tokens, pending same-tab/sibling-tab script
rollback, concurrent star loss, and late sidecar erasure of restored Undo. These
checks are Green after queue/revision/source validation. Final independent verdict
is PASS in this bounded scope; installed Chrome and actual disk/Drive remain NOT VERIFIED.

Independent hydration Red returned source 復元 with token surfaces どこ (exit 1).
Parent permanent regression additionally returned 古い instead of empty (exit 1).
Current production hydrate + Vocab renderer returns:
```text
{"source":"復元","tokenSurfaces":"","rendered":"復元"}
PASS: original independent wrong-source hydration Red is Green with plain source fallback
PASS: invalid in-memory arrays are cleared before early return; source renderer remains exact
exit 0
```

Actual hanging HTTP Red:
```text
Error: bridge save never released shared queue
exit 1
```

Parent actual HTTP Green, independently rerun with exit 0:
```text
PASS: actual HTTP200 parsed before shared revision commit; stale bridge save blocked before network dispatch
bridge.fetch error {
  path: '/scripts/save',
  error: 'TimeoutError: The operation was aborted due to timeout'
}
PASS: hanging HTTP save deadline releases shared worker queue; following star commits
```
Command: `node scripts/sentence_bridge_queue_sanity.js`.
This server records isolated receipt payloads. It does not prove backend database
or script-store persistence.

## Parent browser evidence

Production sidepanel assets and actual backup/restore/worker functions ran at
http://127.0.0.1:18865/extension/sidepanel/sidepanel.html with isolated Chrome/disk transport.

The production Blob export delivered /Users/hoangson/Downloads/yt-caption-fixture.json:
1967 bytes, SHA256 a4e1aa175994b24c6add31ed89d7a9e258b2b6910dfd4aa0bf880125e9a2d960.
Parsed format caption-studio-sentence-backup, version 1, 4 cues, 4 raw-track cues.
Clock pairs: (60,65), (69,75), (80,81), (81,82).
The locked translation Đã khóa was preserved.

Latest source reload, real filechooser and explicit Apply:
preview “Video fixture · 4 cue · 0 câu đã lưu”;
toast “Đã khôi phục 4 cue; có thể quay lại bản trước”;
Original rendered 乗せて / Đã khóa, ないんですか?, どこ, 行くんですか?.
Recovery toast “Đã quay lại 4 cue” returned Changed fixture.
Actual DOM measurements before/after: each row 1237 × 141.984375 px, all four
clock pairs unchanged. This is UI/production-handler evidence with isolated
transport, not installed extension persistence. Independent reviewer did not
independently control this browser.

Screenshot export via CUA data-image download timed out twice; recovery screenshot
file was not delivered. Existing earlier error-state screenshot remains
.tmp-sentence-mvp/enhanced-error-runtime.png. Do not claim a new screenshot exists.

## Commands, exit codes and actual output

Working directory: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio.
The latest post-hydration checks below were executed directly; output is retained verbatim.

### `node extension/shared/sentence_groups_test.js`

Exit code: 0. Combined terminal output:

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
```

### `node scripts/sentence_saved_state_sanity.js`

Exit code: 0. Combined terminal output:

```text
PASS: actual legacy save waits/commits before restore; restored memory, storage and disk adapter retain new source
PASS: sibling tab holding an old metadata response cannot overwrite restored script; worker compares revision inside its queue
PASS: sibling late sidecar write cannot erase restored Undo; shared worker rejects older metadata revision
PASS: held restore commit and another tab star share production worker queue; other-video snapshot survives
PASS: malformed/null Original token cache cannot replace restored source
PASS: hydration discards wrong-source memory/cache tokens and retains exact matching original tokens
PASS: foreign sender rejected; actual TypeScript Saved Items deletion uses worker mutation and removes only its selected ID
```

### `node scripts/sentence_content_sanity.js`

Exit code: 0. Combined terminal output:

```text
[jpcap] Sentence projection rejected; keeping Original TypeError: Sentence projection requires unique cue IDs
    at Object.buildSentenceGroups (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/extension/shared/sentence_groups.js:127:75)
    at refreshSentenceProjection (evalmachine.<anonymous>:213:35)
    at evalmachine.<anonymous>:1:16
    at Script.runInContext (node:vm:150:12)
    at Object.runInContext (node:vm:302:6)
    at run (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:57:30)
    at /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:130:3
PASS: production mode/playhead/undo/video-reset/invalid-ID fallback; original state unchanged, fragment MT withheld
PASS: active display resolver and saved snapshot/provenance; shared sentence star, revision change keeps old snapshot
PASS: versioned sidecar adapter reload restores undo; changed source invalidates override (isolated storage adapter)
PASS: malformed/unavailable disposable sidecar preserves successful legacy cache load
PASS: same-track new navigation reads its own sidecar instead of reusing aborted session load
PASS: production JSON export payload preserves original clocks/text, raw track, metadata and saved provenance; browser delivery not covered
PASS: explicit restore/recovery preserves source clocks, locks, tombstones and other saved videos; wrong video/duplicate IDs rejected (isolated storage adapter)
```

### `node scripts/sentence_scheduler_sanity.js`

Exit code: 0. Combined terminal output:

```text
PASS: production content applies group HTTP200 without changing originals; new-session debounce publishes once
PASS: neighbor edit/lock rejects stale target translation; valid late result paints current playhead, never rewinds
PASS: real HTTP503 becomes per-language content error and suppresses automatic retry for 30s
```

### `node scripts/sentence_tokenize_sanity.js`

Exit code: 0. Combined terminal output:

```text
HTTP: POST /tokenize_batch 200; parsed 1 sentence results
PASS: whole joined sentence tokenized through real bridge HTTP200; emoji code-point→UTF16 offsets/readings validated, lock and originals unchanged, no duplicate call
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
PASS: real bridge trimming across two logical groups preserves exact display source including neutral whitespace
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
PASS: held real HTTP200 from prior session cannot block same-track new-session NLP or discard its tokens
```

### `git diff --check`

Exit code: 0. Combined terminal output:

```text
(empty stdout/stderr)
```

## Build and delivery boundary

Earlier in this execution, `npm run check` in web/saved-items returned exit 0
(lint, TypeScript and Next static build); `npm run build:extension` returned exit 0
and generated the popup using the repository exporter. Those earlier terminal
records establish parent build evidence, not independent build evidence.
An initial outside-root dependency symlink failed Turbopack; it was removed and
replaced with a local copy of already-installed dependencies. No new dependency
was added. Node 26's DEP0205 warning was logged. Generated popup output was not hand-edited.

## API and database checks

- Actual bridge POST /tokenize_batch HTTP 200, parsed Japanese token responses:
  verified in the command output above.
- Translation and script-save tests use actual localhost HTTP 200/429/503 and
  timeout behavior. They do not call live Gemini or production script writes.
- No production database, script store or Drive restore mutation was executed.
  Actual persistence and synchronization are NOT VERIFIED.

## Required release work still open

1. Audio-reviewed gold for 50 segments across the five parako videos, independent
   tune/holdout boundary checks; current HTTP200 JSON3 snapshots are not gold.
2. Cold/warm JP+VI/EN readiness, >=95% target, TTFV/P50/P95, errors, request counts
   and actual cost. Enhanced cannot become default based on fixtures.
3. Installed Chrome mode/overlay/sidepanel/stars/settings, restart, seek/pause/rate,
   video/background transition and actual local storage persistence.
4. Isolated real script-store/API effects and legacy Drive compatibility; no
   destructive production database or Drive actions.
5. Pending scheduler jobs on seek/navigation, bounded persistent translation cache,
   HTTP-date Retry-After handling, selected-track fingerprint and observable metrics.
6. Conditional ASR word/Kanji recognition repair after the accepted sentence MVP.

No goal-completion claim. Work remains active.
