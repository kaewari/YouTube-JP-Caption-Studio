<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Source fingerprint and native parser follow-up

STATUS: PASS for the independently reviewed raw-source digest/cache slice.
NOT VERIFIED for selected track identity, native fingerprint propagation and full MVP.

## Requirements and evidence

- SHA-256 identifies platform/video/configured language, raw text, original clocks
  and available segment/speaker anchors. Mutable EN/VI and signed URLs are excluded.
- Production grouping receives the digest as `sourceRevision`. Different digests
  invalidate group IDs and dependent sentence caches. This is content identity;
  actual selected track ID/response format is still missing.
- `applyLoadedCues` checks navigation generation, video and source selection again
  after the real async digest. The independent reviewer held WebCrypto completion
  and verified no old-track commit/cache read after navigation. It also exercised
  the actual async apply path with owned edit/target/clocks/lock preserved.
- Fingerprint changes are in the worktree. They have not yet been copied to the
  main-project extension or verified by a native export.

COMMANDS, actual parent output:

```text
node scripts/sentence_source_fingerprint_sanity.js
exit 0
PASS: SHA256 source fingerprint is stable across target edits, changes with raw text/anchors/source selection, and invalidates production group cache identity

node scripts/sentence_cache_identity_sanity.js
exit 0
PASS: owned tombstones survive stale cache, saved-script startup and all-deleted/empty reload
PASS: compact-equivalent fresh sources discard mismatched original tokens and keep exact tokens
PASS: repeated adjacent source uses each cached ID once with nearest anchor; fresh prefix collisions stay distinct/deterministic; owned clocks/text/lock remain authoritative
PASS: actual async reload/startup callers preserve all-deleted and empty owned timeline

git diff --check
exit 0, stdout/stderr empty
```

Independent reviewer repeated these commands and related content, scheduler and
sentence-group behavior checks with exit 0. These do not establish browser latency,
translation quality, real storage/Drive or native protected-data preservation.

## Native follow-up

The separately reviewed worker `includeSource` adapters were copied to the main
extension with a guarded hash receipt. Chrome Details displayed Reloaded; the
Parako page was refreshed. Ordinary UI export delivered:

- `/Users/hoangson/Downloads/yt-caption-ylnxFdPhLCo-source-anchors-2026-10-10.json`
- 969614 bytes, SHA-256 `10c9e505a3c49d59729d41b20afd9a8fe9a9e74916c88c7f99d2559f7a00a600`
- 102 cues / 102 unique IDs, raw109/source101, tokens0/translations0.
- Raw rows have only start/end/text; 101 normalized JA source/time rows match.
- Native anchors0, fingerprint absent, selected track ID/format absent.

The parent and reviewer parsed and hashed the actual delivered bytes. Zero anchors
alone does not demonstrate a parser defect: the current raw-first cascade may
return XML with no segment timing. The previous real localhost HTTP JSON3 replay
proves adapter propagation separately, not the native response format.

## Gemini configuration boundary

The human states a key was saved but does not remember where. A blank secure input
was insufficient evidence of missing storage; the parent's initial conclusion
from that field was corrected. On native Enhanced, clicking “Dịch ngay” actually
showed “Chưa cấu hình Gemini API Key. Mở Cài đặt của Side Panel để nhập key.”
This establishes unavailability to this extension context, not deletion of a key.
No key was printed, replaced or entered by the agent. The current shell reports
GEMINI_API_KEY/GOOGLE_API_KEY presence false; the bounded project `.env` locations
checked yielded no configured key record. Other profiles/configurations are open.

## Open work

Readiness instrumentation and a separate local metrics export are being reviewed
in the worktree; no measured KPI or native deployment claim. Selected-track ID,
audio-reviewed gold/tune/holdout, native playback/seek/rate/background and protected
persistence/Drive remain open. Original remains the per-video default.
