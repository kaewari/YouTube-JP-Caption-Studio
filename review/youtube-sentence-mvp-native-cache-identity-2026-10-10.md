<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Sentence MVP — native cache identity and preservation

STATUS: **PASS for independently reviewed cache reconciliation and native toggle/export; full MVP NOT VERIFIED.**

This supplements the immutable [broker lifecycle review](youtube-sentence-mvp-broker-lifecycle-2026-10-10.md).
That review records the first native duplicate-ID failure. This later review closes
that defect without rewriting its evidence. The active [plan](../plan/youtube-sentence-enhancement-mvp-2026-10-09.md)
and [execution decisions](../plan/youtube-sentence-mvp-execution-decisions-2026-10-09.md)
still require gold, instrumentation, measured quality/readiness and persistence checks.

## Reproduced defects and minimal fixes

- A cache ID for repeated text within 0.6 seconds was used twice. Fresh reconciliation
  now consumes each cached ID once, chooses the nearest source start, and resolves
  fresh truncated-prefix ID collisions deterministically. Original source clocks remain.
- A locked/user/import blank translation could be filled from adjacent automatic MT.
  Owned fill now retains these intentional blanks.
- Owned stale cache rows ignored tombstones. Saved-script conversion filters them for
  both merge and startup. Ownership is established before filtering, so an intentionally
  empty script remains authoritative. Fresh reload has no fallback resurrecting rows.
- Compact-equivalent source text could receive tokens for a different exact surface.
  Cache token adoption now reuses the exact-source validator after reconciliation.
- A source-edited owned row could receive MT from a nearby different source. Owned
  fill additionally requires source equivalence with the retained row.

Parent and read-only independent reviewer executed production helpers and actual
async caller paths. They did not assert that source files contain specific strings.
Parent permanent regressions failed before each corresponding correction:

```text
node scripts/sentence_cache_identity_sanity.js
exit 1: one cached cue must not assign its ID to two current source cues
1 !== 2

exit 1: owned locked blank must not be filled from neighboring automatic translation
'Tự động' !== ''

exit 1: owned stale cached tombstone must not reappear
actual ['deleted','keep']; expected ['keep']

node scripts/sentence_cache_identity_sanity.js --tokens-only
exit 1: cached original tokens must match exact newly loaded source
1 !== 0

node scripts/sentence_cache_identity_sanity.js
exit 1: edited source must not inherit automatic translation for neighboring different source
'Nắng' !== ''
```

After fixes, parent and independent commands exited 0:

```text
$ node scripts/sentence_cache_identity_sanity.js
PASS: owned tombstones survive stale cache, saved-script startup and all-deleted/empty reload
PASS: compact-equivalent fresh sources discard mismatched original tokens and keep exact tokens
PASS: repeated adjacent source uses each cached ID once with nearest anchor; fresh prefix collisions stay distinct/deterministic; owned clocks/text/lock remain authoritative
PASS: actual async reload/startup callers preserve all-deleted and empty owned timeline
```

The reviewer independently reran its original Reds (production-helper stdin harness):

```text
{"ids":["keep"]}
PASS: original independent owned-tombstone Red is Green
{"source":"晴 れ。","tokens":0}
PASS: original independent wrong-source tokens Red is Green
{"source":"雨。","vi":"","text_source":"edit"}
PASS: original independent owned different-source MT Red is Green
```

Its additional actual saved-script startup check exited 0:

```text
{"published":2,"scheduledSaves":2,"finalCueCount":0}
PASS: actual tryApplySavedScript restores authoritative empty/all-deleted timeline; ordinary missing cache returns false (isolated read adapters)
```

Parent and reviewer also ran `node scripts/sentence_content_sanity.js` and
`node scripts/sentence_saved_state_sanity.js`, exit 0 with seven PASS each.
`git diff --check` exited 0 with empty stdout/stderr. The content test's deliberate
invalid-ID input logs rejection and keeps Original; this is an expected fallback.

## Native update and delivered file

Chrome Details again identified enabled 0.11.2 from
`~/Projects/YouTube JP Caption Studio/extension`. Before overwriting only
`extension/content/content.js`, the update command verified its hash against the
first deployment receipt and preserved that intermediate file. The original
79-file backup remains untouched. Python copy/hash command exited 0:

```json
{"updated":"extension/content/content.js","before":"7fcc6d8fd1407096b1c449cf58fb87ba3f1ba056af56b1ea480b04d8dd625967","after":"5f6f0016c21a0243595d44138be0fbac5dc3459152d3f3a8301d870ed9f868ee","byte_match":true,"original_backup_preserved":true}
```

Main project `git diff --check -- extension` exited 0 with empty output.
Native Chrome displayed `Reloaded`. On the real `ylnxFdPhLCo` video after reload,
the Original toggle switched to `Enhanced · thử nghiệm`, value 1. Native screenshot
showed the shared overlay and panel, sentence furigana and Original-edit/Undo buttons.
The ordinary backup menu and native Save dialog delivered a separate file; Chrome
displayed `977 KB • Done`:

`/Users/hoangson/Downloads/yt-caption-ylnxFdPhLCo-identity-fixed-2026-10-10.json`.

Permanent delivered-byte check, exit 0:

```text
$ node scripts/sentence_native_backup_sanity.js '/Users/hoangson/Downloads/yt-caption-ylnxFdPhLCo-native-2026-10-10.json' '/Users/hoangson/Downloads/yt-caption-ylnxFdPhLCo-identity-fixed-2026-10-10.json'
{"bytes":1000731,"sha256":"d59ef313d1ec931c322405bae7af336239cf0d40c722811fad5e65115aab77af","cues":102,"uniqueIds":102,"groups":170,"rawTrackCues":109,"sourceCues":101,"translatedGroups":0,"tokenGroups":19,"protectedCueCount":0,"automaticTranslationsIdentical":false}
PASS: delivered native backup IDs/clocks/source/locks/raw track/saved snapshots and protected MT; production projection accepts file
```

Independent artifact review confirms the same byte/hash/counts and actual production
backup-validator acceptance. All 19 cached group token sets match their group contracts.
All 102 source/timing/ownership/lock tuples, metadata, raw track and saved snapshots
match the first native backup. One ID changed. 101 nonempty JA rows equal the current
normalizer output; the extra empty-JA row is an existing secondary-track orphan.

This native sample has **zero protected rows**, so native edited/locked/imported
round trips are not established by that vacuous comparison. Four unowned automatic
YT EN/VI row values changed on refetch; the broad translation-byte comparison failed
and is not reported as preservation PASS. Source and timing comparison passed separately.

## Remaining native gaps

The native snapshot contains zero Enhanced translation records. The UI showed some
`VI · chờ dịch câu` rows and a punctuation-only source `、`; numerical readiness and
quality are unmeasured. A toggle/export success does not close those gates.

Raw native track rows currently retain only start/end/text (`loader-text`), with no
JSON3 segment anchors. A separate worker parser correction is being verified; this
review does not claim it deployed or natively proven. Conservative source-window
fallback avoids fabricated timing when anchors are unavailable.

Chrome's ordinary Drive control reports OAuth Client ID / Extension ID mismatch.
No reauthorization, cloud restore or database mutation was performed. A blocked
worker-console paste was not bypassed; no native console benchmark is claimed.

API_CHECKS: earlier actual local HTTP/bridge evidence; live Gemini quality/cost remains NOT VERIFIED.
DATABASE_CHECKS: actual script-store/Drive round trip remains NOT VERIFIED.
Open: selected-track identity/anchors, DATA-02 metrics, audio/creator-reviewed gold,
tune/holdout, live cold/warm rate/seek/background tests, cost/latency and persistence.
Original remains the per-video default. **Full goal remains active.**
