<!-- date: 2026-09-19 -->

# Plan: Overlay Resize Freedom and Dual Subtitles (VI/EN)

## Status

**Done — Fully Verified in Real Runtime DOM & Network** (2026-09-19).

## Raw Plan & Review

- [plan/fix-overlay-resize-and-subtitles-2026-09-19.md](../../plan/fix-overlay-resize-and-subtitles-2026-09-19.md)
- [review/code-review-2026-09-19.md](../../review/code-review-2026-09-19.md)

## Root Causes & Shipped Solutions

### 1. Overlay Resize Lock
- **Root Cause**: `panel.css` had `min-height: 0 !important;` and `height: auto !important;`, locking the bar height to shrink-wrapped content. Dragging handle `s` / `n` or corners failed to expand height. Pointer events dropped when mouse moved rapidly outside the 6px edge. Delta formula `(start.boxH + dy) / h0` caused discontinuous jumps on drag start.
- **Shipped**:
  - `extension/styles/panel.css`: Replaced with `min-height: calc(var(--bar-box-h0) * var(--bar-user-scale-h, 1)) !important;` and `width: calc(var(--bar-box-w0) * var(--bar-user-scale-w, 1)) !important;`.
  - `extension/content/content.js`: Updated `computeBarEdgeResize` with continuous delta formula (`start.scaleH + dy / h0` and `start.scaleW + dx / w0`).
  - `extension/content/content.js`: Window-bound `pointermove` and `pointerup` during dragging/resizing with automatic cleanup on `pointerup`.
  - `extension/content/content.js`: Implemented `adjustBarScale(delta)` modifying `settings.barScale` and calling `applyBarPosition()`.

### 2. Missing Subtitles (VI & EN)
- **Root Cause**: In `service_worker.js`, unsigned `via: "direct"` candidates ranked higher than signed `_tlang` candidates, triggering YouTube HTTP 429. A shared `lastError` object between parallel language fetches (`ja`, `en`, `vi`) caused the 429 error on `vi` to abort the `en` fetch and cached negative `ttMiss` for the entire video. Also, requesting `fmt=srv3` with `tlang` caused YouTube 429.
- **Shipped**:
  - `extension/background/service_worker.js`: Isolated language error states (`jaErr`, `enErr`, `viErr`). Prioritized signed tracks over unsigned direct tracks (`viaScore`). Only set `ttMiss` if primary Japanese track throttles.
  - `extension/background/service_worker.js` & `extension/injected/page_capture.js`: Guaranteed that `buildTimedtextUrlVariants` uses `fmt=json3` exclusively whenever `tlang` is present.
  - `extension/content/content.js`: Concurrent rendering of `.lr-card-vi` and `.lr-card-en` in `renderOverlayContent()`.
  - `extension/styles/panel.css`: Added CSS rules for `.lr-card-en` and `.lr-text-en`.

## Verification Proof
- `scripts/test_runtime_resize_green.js` executed in live Chrome measuring real pixel bounds via `getBoundingClientRect()`:
  - Height expanded from 140.28px to 188.00px (+47.72px).
  - Width expanded from 707.00px to 787.00px (+80.00px).
  - Japanese, Vietnamese, and English subtitle cards simultaneously rendering live captions.
- Anti-fake-test gate PASSED (`scripts/verify_no_fake_tests.js`).
- All regression suites passed with exit code 0.
