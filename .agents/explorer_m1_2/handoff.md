# Handoff Report — Explorer 2 (Chrome Extension MV3 Focus)

**Working Directory:** `/Users/hoangson/Documents/Translate realtime OCR youtube video/.agents/explorer_m1_2`  
**Report Date:** 2026-07-29T21:27:00Z  
**Primary Deliverable:** `analysis.md`

---

## 1. Observation

Direct examination of the `extension/` directory revealed the following exact file paths, line numbers, and implementation details:

- **Security (XSS Vulnerability):**
  - Path: `extension/content/content.js:1378–1392` & `1441`
  - In `glossBlocksHtml(d)`, `primaryGlossLine(d)` produces `vi` and `en` strings directly from `res.data`. The template literals in `glossBlocksHtml` insert `${vi}` and `${en}` into HTML strings without wrapping them in `escapeHtml()`. `renderDictHtml` sets `dictEl.innerHTML` with this unescaped HTML string.

- **Manifest V3 Service Worker Ephemerality & Timers:**
  - Path: `extension/background/service_worker.js:142–154, 248–252`
  - Long-polling bridge state is executed via top-level `setInterval(() => { void pullExtensionStateFromBridge(); }, 2000);`.
  - In-memory variables `_lastBridgeUpdatedAt`, `_lastPushedJson`, `_pushTimer`, `_applyingBridgeState` are stored in background script scope. When Chrome terminates the service worker after ~30s of inactivity, all in-memory state is cleared. Upon worker restart, `_lastBridgeUpdatedAt` resets to `0`.

- **Manifest Permissions:**
  - Path: `extension/manifest.json:6`
  - `"permissions"` array contains `"scripting"`, but `chrome.scripting` API is never called in `service_worker.js`, `content.js`, `sidepanel.js`, or any extension file.

- **DOM Event Listener Accumulation:**
  - Path: `extension/content/content.js:997–998`
  - `ensureVideoLayoutSync()` calls `window.addEventListener("resize", applyBarPosition)` and `document.addEventListener("fullscreenchange", applyBarPosition)` without checking if listeners were already attached or providing removal handles.

- **Message Passing IPC Overhead:**
  - Path: `extension/content/content.js:1565–1600` (`publishSidePanelState`)
  - Transmits full `cues` list (mapping up to 2,000 objects with `id`, `source`, `en`, `vi`, `tokens`, etc.) across `chrome.runtime.sendMessage` on playhead time updates.

---

## 2. Logic Chain

1. **Observation:** In `content.js:1382`, `vi` is interpolated directly into `<span class="dict-gloss">${vi}</span>` and `dictEl.innerHTML` is updated with this string.
   - **Reasoning:** If bridge API or local dictionary payload returns strings containing `<script>` or `<img src=x onerror=...>`, browser parses and executes the injection within the YouTube origin.
   - **Conclusion:** This is a High Severity XSS vulnerability.

2. **Observation:** `background/service_worker.js` uses global `setInterval` for polling and stores state in local JavaScript variables (`_lastBridgeUpdatedAt`).
   - **Reasoning:** Manifest V3 service workers do not run continuously in the background. They terminate when idle. When terminated, `setInterval` stops and global variables return to default values (`0` / `""`).
   - **Conclusion:** Background synchronization breaks or produces redundant fetches upon worker restart. State must be stored in `chrome.storage.session` and timers must use `chrome.alarms` or reactive listeners.

3. **Observation:** `manifest.json` specifies `"scripting"` in `permissions`. Code search across `extension/` shows zero calls to `chrome.scripting`.
   - **Reasoning:** Unnecessary permissions violate Chrome Web Store policy and increase security attack surface.
   - **Conclusion:** `"scripting"` can be safely removed from `manifest.json`.

4. **Observation:** `publishSidePanelState()` serializes all `cues` on playhead ticks.
   - **Reasoning:** Serializing and sending up to 2,000 cue objects every 250ms during video playback creates continuous IPC thread work.
   - **Conclusion:** `cues` array should only be included when `listDirty` is true; playhead ticks should send only lightweight `{ activeCueId, status }`.

---

## 3. Caveats

- **External Python Local Bridge Code:** The Python local bridge (`local-bridge/`) was not reviewed in this specific task (focused strictly on `extension/` Chrome Extension files).
- **Popup Next.js Static Export:** The extension popup (`extension/popup/`) is a compiled Next.js static export bundle (`popup.html` and `_next/static/chunks/`). Review focused on readable source logic in extension scripts (`content.js`, `service_worker.js`, `sidepanel.js`, `page_capture.js`, `shared/*`).
- **Target Browser:** Testing and recommendations target modern Chromium / Google Chrome MV3 standards.

---

## 4. Conclusion

The YouTube Caption Chrome Extension codebase has solid architectural foundations (clean separation of main-world page capture, isolated content overlay, and side panel UI). However, 14 specific issues must be addressed before production release:
1. **Critical Security Fix:** Sanitize bridge dictionary HTML strings (`escapeHtml(vi)` / `escapeHtml(en)`) in `content.js`.
2. **MV3 Service Worker Compliance:** Migrate background state to `chrome.storage.session` and replace `setInterval` with `chrome.alarms` or reactive event triggers.
3. **IPC Optimization:** Throttle side panel state publishing to omit full cue lists on playhead ticks.
4. **Manifest Cleanup:** Remove unused `"scripting"` permission.

Detailed issue catalog and proposed code patches are documented in `.agents/explorer_m1_2/analysis.md`.

---

## 5. Verification Method

To independently verify these findings:

1. **Inspect Code Snippets:**
   - Run `view_file` on `/Users/hoangson/Documents/Translate realtime OCR youtube video/extension/content/content.js` lines 1364–1392.
   - Run `view_file` on `/Users/hoangson/Documents/Translate realtime OCR youtube video/extension/background/service_worker.js` lines 142–154 and 248–252.
   - Run `view_file` on `/Users/hoangson/Documents/Translate realtime OCR youtube video/extension/manifest.json` line 6.

2. **Run Static Code Check / Grep Verification:**
   - Grep for `chrome.scripting` across `extension/`:
     ```bash
     grep -rn "chrome.scripting" extension/
     ```
     (Will return 0 matches).

3. **Extension Loading & Worker Termination Test:**
   - Open Chrome `chrome://extensions`, enable Developer mode, click "Load unpacked", and select `/Users/hoangson/Documents/Translate realtime OCR youtube video/extension`.
   - Click "Service worker" to open DevTools for the background worker. Click "Stop" in `chrome://extensions` to test worker termination and re-activation.
