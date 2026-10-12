<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Selected track identity and guarded preview update

STATUS: PASS for independently reviewed production helpers/VM and actual localhost
HTTP. NOT VERIFIED for native reload/export, selected-track metadata on live
YouTube and full MVP. No production storage/Drive mutation in these checks.

## Behavior

Successfully selected worker/MAIN track packs carry actual track ID, language,
kind and body format. Raw-source digest includes these four fields. Signed URL
is excluded; unknown metadata remains null. Fresh and cached MAIN responses keep
parser raw text and anchors. Post-digest navigation guards prevent old response
commit/cache reads, and existing owned edits/targets/clocks/lock are preserved.

## Red / Green

- Source digest Red: selected identity ignored, actual/expected digest equal,
  `node scripts/sentence_source_fingerprint_sanity.js` exit1. After fix exit0.
- MAIN result Red: `.segmentAnchors.length` undefined after adapter stripped
  fields, loader sanity exit1. `okCaptionResult` now copies parsed fields.
- MAIN cache Red: selected track missing, actual undefined/expected a.ja,
  loader sanity exit1. Cached response now reuses shared result and stored metadata.
- Independent synthetic intercept Red: no real track, kind guessed as ASR;
  actual asr/expected null, exit1. Known-track marker excludes the guess from
  authoritative metadata; actual XML format remains recorded.

Parent and independent commands/output after fixes:

```text
node scripts/sentence_loader_source_sanity.js
exit 0
PASS: actual worker JSON3/body adapters retain raw text and segment/speaker anchors through normalize; XML fallback invents no anchors
PASS: actual localhost HTTP200 page intercept-url load retains unknown track metadata instead of certifying guessed ASR
PASS: actual localhost HTTP200 XML/JSON3 worker selection carries track ID/format without signed URLs; HTTP429 stops after one request

node scripts/sentence_source_fingerprint_sanity.js
exit 0
PASS: SHA256 source fingerprint is stable across target edits, changes with raw text/anchors/source selection, and invalidates production group cache identity

git diff --check
exit 0, stdout/stderr empty
```

Independent additional actual MAIN HTTP result, exit0:

```text
{"hits":1,"freshTrack":{"trackId":"manual.ja","language":"ja","kind":"manual","format":"json3"},"cachedTrack":{"trackId":"manual.ja","language":"ja","kind":"manual","format":"json3"},"freshAnchors":2,"cachedAnchors":2}
{"unknownTrack":{"trackId":null,"language":null,"kind":null,"format":"xml"},"legacyAsr":true,"hits":2}
```

Reviewer held genuine SHA256 completion across navigation: cacheReads0, old track
cannot commit. Actual async apply preserved owned source/target/clocks4–7/lock;
changing signed URL kept digest, missing options reset metadata null. Parser,
cache identity and content regressions independently exited0.

## Guarded filesystem update

After the bounded reviews, nine extension files were copied to the main project
from the worktree. Every prior file matched the previous deployment hash first;
new metrics module was absent. All nine destination bytes match source, manifest
permission fields unchanged, exit0. Original copies and per-file before/after
hash receipt are under ignored `.tmp-sentence-mvp/chrome-metrics-selected-track-before-2026-10-10/`.

Chrome action was interrupted by concurrent user control. Extension Reload and
full YouTube document reload have NOT been verified for this update. API versions
remain7, so merely navigating SPA/reinjecting does not guarantee the new MAIN
contract. Native verification must reload the whole document and export actual
backup/metrics bytes before raising the native evidence status.
