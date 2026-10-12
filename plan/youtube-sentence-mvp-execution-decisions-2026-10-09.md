<!-- date: 2026-10-09 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# YouTube sentence MVP — execution decisions

Companion to [the supplied revised plan](youtube-sentence-enhancement-mvp-2026-10-09.md).
The supplied plan is a design proposal; implementation status belongs in the wiki/review.

## Scope and release gate

Implement the Chrome/macOS/YouTube track-based MVP first. Japanese word/Kanji
recognition repair belongs to the later conditional ASR spike, as accepted by the
user. English is an explicit capability audit and follow-up implementation item,
not an assumed existing Gemini feature. No new platform or Drive enhancement
schema rollout before the MVP gates.

The Phase 2 wording "threshold achieved OR causes analyzed" permits continued
investigation, not release. Default Enhanced rollout requires measured gates and
regression evidence. A failed KPI plus explanation does not count as release-ready.

## Source, mapping and display

- Capture source before normalization. Track raw text, raw timing, stable source
  identity and normalization mapping separately from mutable owned script cues.
- Source spans use half-open `[charStart, charEnd)` intervals in explicitly
  specified Unicode units. Verify JS UTF-16/Python code-point conversions with
  emoji, repeated text, removed noise labels and collapsed spaces.
- Preserve existing original cue clocks. If source segment anchors exist, retain
  them; if not, split logical sentence groups for translation/NLP without inventing
  precise subcue display times from character proportions.
- User-edited/imported/locked cues are boundaries for automatic cross-cue grouping
  in the first version. Tombstones and current source selection remain authoritative.
- Enhanced editing resolves to the original cue editor. Do not distribute a
  rewritten merged sentence over several owned cues automatically. Saved enhanced
  sentences include a text snapshot and provenance, not a disposable group ID alone.
- Undo stores enhancement overrides and rebuilds the projection; it does not alter
  raw cues. Long groups use display units with source timing and whole-group context.

## One scheduler and disposable local sidecar

- Route full-track automatic translation and predictive prefetch through the same
  scheduler with deduplication and a global concurrency limit. Reuse the existing
  Gemini endpoint/model fallback; do not retain two independent automatic queues.
- Apply results only after rechecking source text, revision, session/video and locks.
  Cache a valid late result for replay without displaying a past group.
- New enhancement cache keys include source/track/group/context/target language and
  algorithm/prompt/model versions. The old text-only `htc_` cache is not sufficient.
- Start with versioned `chrome.storage.local` sidecar data, isolated from the legacy
  script serialization and Drive mirror. It must be invalidated/rebuilt on source
  changes and included in an explicit JSON backup contract. Flat TXT/SRT/VTT are
  exports, not lossless editable backups.
- Lookahead starts as a bounded experiment within 20–60 seconds adjusted for
  playback rate; tune on measured readiness, request counts and latency. Whole-track
  preparation remains explicit or low-priority capacity work.

## Evidence contract

- Collect five source snapshots and true cue/segment timing before tuning. Rounded
  transcript export timestamps are useful text evidence but not cue-end alignment.
- Separate tune clips and holdout clips. Record numerator/denominator per video,
  warm-up definition, cold/warm results, rate, API/network failures and latency.
- Verify gold boundaries against audio or visible creator text. Until then, label
  the dataset a source snapshot/candidate annotation, not a verified gold set.
- Existing sidepanel grouping must be audited along with overlay/Gemini. Two
  independent grouping algorithms cannot silently disagree about text/IDs/timing.
- Browser DOM/pixel tests are runtime evidence for the loaded code. Isolated Chrome
  test transport is not proof of installed-extension, Drive or Gemini integration.
- Release status stays `NOT VERIFIED` while required evidence or independent runtime
  review is missing. No self-awarded numeric completion score substitutes for proof.
