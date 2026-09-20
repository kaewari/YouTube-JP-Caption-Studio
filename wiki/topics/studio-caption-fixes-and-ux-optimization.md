<!-- date: 2026-09-19 -->

# Topic: Studio Caption Fixes, Performance & UX Optimization

## Status

**Done — Fully Verified in Real Runtime DOM, Real Extension, and Pytest Backend** (2026-09-19).

## Raw Plan & Review

- [plan/studio-caption-fixes-and-ux-optimization-2026-09-19.md](../../plan/studio-caption-fixes-and-ux-optimization-2026-09-19.md)
- [review/code-review-2026-09-19.md](../../review/code-review-2026-09-19.md)

## Summary of Shipped Improvements

### 1. JP-Only Video Overlay & Vertical Scaling Freedom
- **Video Overlay**: Restructured to render exclusively the authentic Japanese subtitle card (`.lr-card-ja`). Secondary VI & EN cards are suppressed from the video viewport (`display: none !important`) to eliminate visual clutter and immersion disruption. Full translations remain available in the Chrome Sidepanel.
- **Vertical Resize**: Replaced restrictive constraints with dynamic scaling `calc(var(--bar-box-h0) * var(--bar-user-scale-h, 1)) !important;`. Bound pointer events to window coordinates during drag so fast movements never drop the handle. Added font scaling buttons `A-` / `A+` directly onto `.lr-card-ja`.

### 2. Bulletproof Overlay Toggle (Hidden / Visible)
- **Root Cause**: `.hardsub-bar.lr-bar-container` had `display: flex !important`, which previously overrode `bar.hidden = true`.
- **Shipped**: Added high-specificity `#hardsub-ocr-bar[hidden]`, `#hardsub-ocr-root .hardsub-bar[hidden]`, `.hardsub-bar[hidden]` rules (`display: none !important; visibility: hidden !important; opacity: 0 !important;`) at both the top and bottom of `panel.css`. `applyBarVisibility()` in `content.js` also manages inline `display: none !important`. Verified live: `bar.hidden = true` yields `display: none` and 0px height; toggled visible yields `display: flex` and 129px height.

### 3. Authentic Timeline Durations (Zero Truncation)
- **Root Cause**: `clampCueEndsToNextStart` previously clamped `end = Math.max(start + 0.2, nextStart - GAP)` with a 50ms gap, cutting natural audio trails.
- **Shipped**: Removed destructive clamping in `extension/content/cue_timing.js` and preserved exact `tStartMs` + `dDurationMs` in `extension/shared/timedtext_parse.js`.

### 4. Deterministic Index-Based Prev / Next Navigation & Hotkeys
- Ordered controls logically: Prev (`<`), Repeat (`↻`), Next (`>`).
- Replaced floating-point time comparison (`curTime - 0.35s`) with array index lookup (`seekPrevCue`, `seekNextCue`).
- Registered keyboard shortcuts: `A`/`J` (Prev), `S`/`K` (Repeat), `D`/`L` (Next), `H` (Toggle overlay), `Space` (Play/Pause).

### 5. Standardized JLPT Vocabulary & Bilingual Keyword Highlights
- Expanded `_COMMON_JLPT_WORDS` dictionary in `local-bridge/app/services/vocab_freq.py` and `COMMON_JLPT_WORDS` in `extension/shared/vocab_style.js` covering high-frequency words (`私`, `皆さん`, `世界`, `経験`, etc.).
- Set distinct slate blue (`#94a3b8`) for unranked/katakana words to distinguish from grammatical particles.
- Added `renderBilingualHtml(text, lang, tokens, settings)` with bilingual keyword dictionary (`BILINGUAL_MAP`) and user toggle (`#toggle-bilingual-jlpt`).

### 6. Sidepanel DOM Virtualization & Floating Playhead Return
- Added sliding window rendering in `extension/sidepanel/sidepanel.js` when `cues.length > 100` with 68px height placeholders (`contain-intrinsic-size: 0 68px`).
- Implemented `#sp-scroll-to-active` floating button that smoothly scrolls back to the playing subtitle whenever the user browses elsewhere in the transcript.

### 7. <16ms Realtime Playhead Synchronization
- Connected `requestVideoFrameCallback` on `<video>` with fallback to `timeupdate` and `seeked` events in `content.js`. Subtitle sync updates every display frame (<16ms) instead of 250ms polling.

### 8. Dictionary Fallback & Graceful Error Handling
- Added `_get_en_vi_cache()` fallback to `data/dict/en_vi.json` in `local-bridge/app/services/dictionary.py`.
- Differentiated between Local Bridge snapshot offline and Google OAuth expiration in Drive backup handler (`extension/sidepanel/sidepanel.js`).

## Code Anchors

- Overlay styling & resize: [`extension/styles/panel.css`](file:///Users/hoangson/Projects/YouTube%20JP%20Caption%20Studio/extension/styles/panel.css#L7-L14)
- Visibility & hotkeys & sync: [`extension/content/content.js`](file:///Users/hoangson/Projects/YouTube%20JP%20Caption%20Studio/extension/content/content.js#L2742-L2765)
- Sidepanel virtualization & scroll: [`extension/sidepanel/sidepanel.js`](file:///Users/hoangson/Projects/YouTube%20JP%20Caption%20Studio/extension/sidepanel/sidepanel.js#L780-L860)
- Bilingual JLPT renderer: [`extension/shared/vocab_style.js`](file:///Users/hoangson/Projects/YouTube%20JP%20Caption%20Studio/extension/shared/vocab_style.js#L370-L415)
- Backend dictionary fallback: [`local-bridge/app/services/dictionary.py`](file:///Users/hoangson/Projects/YouTube%20JP%20Caption%20Studio/local-bridge/app/services/dictionary.py#L425-L465)

## Verification Proof

- **Live Chrome Runtime Tests (`scripts/test_runtime_resize_green.js`)**:
  - Height expansion via South handle: 129px -> 189px (`scaleH: 1.465`) -> **PASSED**.
  - Width expansion via East handle: 711px -> 791px (`scaleW: 1.113`) -> **PASSED**.
  - Font scaling buttons: responsive -> **PASSED**.
  - JP-Only Video Overlay: `.lr-card-ja` visible with text, VI & EN cards suppressed -> **PASSED**.
  - Double click scale reset -> **PASSED**.
  - Overlay Toggle Hidden integrity: `bar.hidden = true` -> `display: none`, height 0px; unhidden -> `display: flex` -> **PASSED**.
- **Extension Shared Unit Tests**:
  - `node extension/shared/timedtext_parse_test.js` -> 100% PASS (Exit 0).
  - `node extension/shared/vocab_style_test.js` -> 100% PASS (Exit 0).
- **Backend Local Bridge Pytest Suite**:
  - `PYTHONPATH=. .venv/bin/pytest -q tests/` -> 20 passed in 3.27s (Exit 0).
- **Wiki Integrity**:
  - `./scripts/wiki_sync_and_lint.sh` -> 0 broken links, 0 warnings, Exit 0.
