<!-- date: 2026-09-19 -->
<!-- source: chat:aa2753a8-9ba9-4c1d-853d-3965cce33e28 · user: Read context for session 19414567-1f81-46e4-a561-ba862e67bf5d and fix code -->

# Plan: Fix Overlay Resize Freedom and Dual Subtitles (VI & EN)

## 1. Context & User Inquiries
In session `19414567-1f81-46e4-a561-ba862e67bf5d`, the user identified two primary defects:
1. **"Tại sao không kéo chỉnh được kích thước của overlay?"**
   - User cannot drag handles to resize overlay width/height.
2. **"Tại sao chưa có sub VI và En?"**
   - Video with Japanese tracks fails to show Vietnamese or English subtitles, or fails to show them concurrently.

Previous pseudo tests relying on `fs.readFileSync` and text matching were rejected (0/10). All verification must now execute through real runtime browser DOM measurement and network parsing.

## 2. Root Cause Analysis

### A. Overlay Resize Lock
- In `extension/styles/panel.css` (lines 723-730):
  ```css
  .hardsub-bar.lr-bar-container {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
  }
  ```
  `width: auto !important;` forces the element to shrink-wrap content and completely overrides `--bar-box-w0` and `--bar-user-scale-w`.
- The child card elements (`.lr-card-ja`, `.lr-card-vi`, `.lr-card-en`) lacked `width: 100%`, preventing smooth stretch matching the bar width.
- `.lr-card-actions` lacked explicit positioning/z-index above resize handles.

### B. Missing Subtitles (VI & EN)
1. **Missing tlang Fallback on YouTube timedtext**:
   Most Japanese YouTube videos only have human or ASR `ja` tracks. When the extension requests `lang=vi` or `lang=en`, YouTube returns empty. YouTube's API only supports auto-translation when appending `&tlang=vi` or `&tlang=en` to the signed `baseUrl` of the Japanese track.
   - In `extension/injected/page_capture.js`: `packsFromTracks` lacked `toTlangUrl(ja.baseUrl, "vi")` and `toTlangUrl(ja.baseUrl, "en")`.
   - In `extension/background/service_worker.js`: `handleYtLoadCaptions` lacked fallback candidates with `&tlang=vi` and `&tlang=en`.
2. **Missing Dual-Card DOM Rendering**:
   In `extension/content/content.js`:
   ```javascript
   ${showVi && (vi || en) ? `<div class="lr-card-vi"><div class="lr-text-vi">${escapeHtml(vi || en)}</div></div>` : ""}
   ```
   Only `.lr-card-vi` was rendered. If both languages were present, `en` was dropped. If `showVi` was false and `showEn` was true, nothing rendered.
3. **Missing Styles for `.lr-card-en`**:
   `extension/styles/panel.css` had no style definition for `.lr-card-en` or `.lr-text-en`.

## 3. Minimal Fix Plan (Ponytail Mindset)
1. `extension/styles/panel.css`:
   - Replace `width: auto !important;` with `width: calc(var(--bar-box-w0) * var(--bar-user-scale-w, 1)) !important;`, `min-width: 280px !important;`, `max-width: min(1050px, 96vw) !important;`.
   - Add `width: 100%; box-sizing: border-box;` to `.lr-card-ja`, `.lr-card-vi`, `.lr-card-en`.
   - Add styling for `.lr-card-en` and `.lr-text-en` matching `.lr-card-vi`.
   - Ensure `.lr-card-actions` has `position: relative; z-index: 5;`.
2. `extension/content/content.js`:
   - Render both `.lr-card-vi` and `.lr-card-en` when both are active and available.
   - Retain fallback to render `en` in `.lr-card-vi` when `showVi` is active and only `en` is available.
3. `extension/injected/page_capture.js`:
   - Add `toTlangUrl(ja?.baseUrl, "vi")` and `toTlangUrl(ja?.baseUrl, "en")` when direct `vi` or `en` tracks are missing.
4. `extension/background/service_worker.js`:
   - Add candidate URLs with `&tlang=vi` and `&tlang=en` derived from `jaCand`.

## 4. Evidence-Based Verification
- **RED Phase**: Run `scripts/test_real_resize_and_sub.js` with Google Chrome headless. Verified failure (AssertionError: initial: 412.875px == scaled: 412.875px).
- **GREEN Phase**: Apply minimal changes to `panel.css`, `content.js`, `page_capture.js`, and `service_worker.js`.
- **RE-VERIFY**: Execute `scripts/test_real_resize_and_sub.js` and show exit code 0 with scaled dimensions > 1.25x.
- Run all existing test suites to prevent regression (`verify_no_fake_tests.js`, `test_furigana.js`, `timedtext_parse_test.js`, `cue_timing_sanity.js`, `tdd_pixel_and_timing_test.js`).
