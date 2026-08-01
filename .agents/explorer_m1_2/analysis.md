# Chrome Extension Code Review & Manifest V3 Analysis Report

**Target Project:** YouTube Caption Translate Extension (`extension/`)  
**Reviewer:** Explorer 2 (Chrome Extension MV3 Focus)  
**Date:** July 29, 2026  
**Scope:** `extension/manifest.json`, `extension/background/service_worker.js`, `extension/content/*`, `extension/injected/*`, `extension/sidepanel/*`, `extension/popup/*`, `extension/shared/*`, `extension/styles/*`

---

## 1. Executive Summary

The Chrome Extension module (`extension/`) provides real-time YouTube subtitle overlay rendering, dual-language subtitle display (JA → EN / VI), furigana/JLPT dictionary lookups, local bridge state synchronization (`http://127.0.0.1:8765`), and side panel interaction.

While the extension has been modernized to Manifest V3 structure (`service_worker.js`, `sidePanel` API, `document_start` MAIN world injection), this deep audit identified **14 distinct issues** across MV3 lifecycle compliance, memory leak hazards, security/XSS vulnerabilities, message passing efficiency, and offline resilience.

### Critical Highlights
1. **Critical Security Vulnerability (XSS):** Unescaped bridge dictionary payload (`gloss_vi` / `gloss_en`) injected via `innerHTML` in `content.js` (Line 1364-1392 & Line 1441).
2. **MV3 Lifecycle Anti-Pattern:** Service Worker relies on `setInterval` (Line 249-251) and in-memory global state (`_lastBridgeUpdatedAt`, `_lastPushedJson`, `_pushTimer`) which break when Chrome terminates the background worker after ~30s of inactivity.
3. **Unused Manifest Permission:** `scripting` permission declared in `manifest.json` but `chrome.scripting` API is never called anywhere in the extension codebase.
4. **DOM Event Listener Leaks:** Window `resize` and `fullscreenchange` listeners added unconditionally on `ensureVideoLayoutSync()` without cleanup, leading to duplicated handlers over time.
5. **Inefficient Message Passing Payload:** Entire subtitle cue lists (up to 2,000 cues) sent via `chrome.runtime.sendMessage` on every playhead tick or state change.

---

## 2. Component Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           YouTube Web Page                              │
│                                                                         │
│  ┌──────────────────────┐             ┌──────────────────────────────┐  │
│  │ MAIN World Script    │ ◄─postMsg─► │ ISOLATED Content Script      │  │
│  │ page_capture.js      │             │ content.js                   │  │
│  │ (MediaTime, XHR/Fetch│             │ (Normalize, Overlay, Dict,   │  │
│  │  timedtext hooks)    │             │  Playback loop, UISync)      │  │
│  └──────────────────────┘             └──────────────┬───────────────┘  │
└──────────────────────────────────────────────────────┼──────────────────┘
                                                       │ chrome.runtime.sendMessage
                                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Background Service Worker                           │
│                     background/service_worker.js                        │
│  (State Push/Pull to Bridge, Caption Fetch Cascade, IME Switch proxy)   │
└──────────────┬───────────────────────────────────────┬──────────────────┘
               │                                       │
               ▼ HTTP fetch                            ▼ chrome.runtime
┌──────────────────────────────┐       ┌──────────────────────────────────┐
│ Local Python Bridge          │       │ Side Panel UI                    │
│ http://127.0.0.1:8765        │       │ sidepanel/sidepanel.js           │
│ (/dict, /tokenize, /scripts) │       │ (Cue list, timeline edit, IME)   │
└──────────────────────────────┘       └──────────────────────────────────┘
```

---

## 3. Detailed Category-by-Category Audit

### Category A: Manifest V3 Compliance & Service Worker Lifecycle

#### A1. Ephemeral Service Worker State & Timers
- **Location:** `extension/background/service_worker.js`, lines 142–154, 248–252
- **Severity:** High
- **Description:** 
  In Manifest V3, background service workers are ephemeral and killed after ~30 seconds of inactivity. In `service_worker.js`, background polling is implemented using a top-level `setInterval`:
  ```js
  setInterval(() => {
    void pullExtensionStateFromBridge();
  }, 2000);
  ```
  Global variables like `_applyingBridgeState`, `_pushTimer`, `_lastPushedJson`, and `_lastBridgeUpdatedAt` (lines 142–145) lose their state when the worker stops. When the service worker wakes up on a new message, `_lastBridgeUpdatedAt` resets to `0`, causing redundant state pulls or missed pushes.
- **Root Cause:** Reliance on long-running background timers (`setInterval`) and in-memory variables instead of `chrome.alarms` and `chrome.storage.session` / `chrome.storage.local`.
- **Proposed Fix:**
  1. Replace `setInterval` with `chrome.alarms` or trigger bridge synchronization reactively on `chrome.storage.onChanged` / message events.
  2. Store `_lastBridgeUpdatedAt` and `_lastPushedJson` in `chrome.storage.session` so state survives worker sleep cycles during a browser session.

#### A2. Unused `scripting` Permission in `manifest.json`
- **Location:** `extension/manifest.json`, line 6
- **Severity:** Low
- **Description:** `manifest.json` declares the `"scripting"` permission. However, nowhere in `service_worker.js`, `content.js`, or `sidepanel.js` is `chrome.scripting.executeScript` or `chrome.scripting.insertCSS` invoked. Instead, content scripts are injected statically via `content_scripts` declarations and script tags.
- **Root Cause:** Residual declaration from earlier design iterations.
- **Proposed Fix:** Remove `"scripting"` from `permissions` in `manifest.json` to adhere to the Principle of Least Privilege for Chrome Web Store approval.

#### A3. Unchecked `chrome.sidePanel.setPanelBehavior` Exception Handling
- **Location:** `extension/background/service_worker.js`, lines 8, 14, 138
- **Severity:** Low
- **Description:** `setPanelBehavior({ openPanelOnActionClick: false })` is called at root scope and in listeners with empty `catch (_) {}`. In older Chrome releases or specific Chromium embeds where `sidePanel` API is missing or behavior differs, unhandled promises or silent failures can occur.
- **Proposed Fix:** Ensure feature detection (`if (chrome.sidePanel?.setPanelBehavior)`) before calling.

---

### Category B: Performance & Memory Leak Vulnerabilities

#### B1. Unbounded Window Resize & Fullscreen Event Listener Accumulation
- **Location:** `extension/content/content.js`, lines 997–998
- **Severity:** Medium
- **Description:**
  ```js
  window.addEventListener("resize", applyBarPosition);
  document.addEventListener("fullscreenchange", applyBarPosition);
  ```
  `ensureVideoLayoutSync()` is called inside `ensureUI()`. If `ensureUI()` is invoked multiple times or UI elements are re-created, new anonymous function references or event listeners are registered without calling `removeEventListener`.
- **Root Cause:** Missing event listener cleanup mechanism or single-instance guard on window/document events.
- **Proposed Fix:** Use a named listener function and check a boolean flag (`layoutListenersBound`) before binding.

#### B2. Excessive Canvas Allocation in ROI Capture Routine
- **Location:** `extension/injected/page_capture.js`, lines 63–66
- **Severity:** Low (Debug Path)
- **Description:**
  ```js
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ```
  Although ROI OCR capture is retained for debug only, calling `captureRoi()` repeatedly creates a new `<canvas>` element and 2D context on every frame, generating garbage collection pressure.
- **Proposed Fix:** Reuse an offscreen singleton canvas instance stored in `state.canvas`.

#### B3. Video Navigation Listener Duplication Safety
- **Location:** `extension/content/content.js`, line 3060; `extension/injected/page_capture.js`, line 865
- **Severity:** Low
- **Description:** `yt-navigate-finish` is listened to in both content script and main-world injected script. On YouTube Single Page App (SPA) navigation, state is reset, but timers `loopTimer` and `healthTimer` in `content.js` are not cleared before initializing a new navigation sequence, leading to overlapping timers if `init()` or `startLoop()` were re-invoked.
- **Proposed Fix:** Call `stopLoop()` explicitly at the start of `onNavigate()`.

---

### Category C: Communication, Messaging & Offline Resiliency

#### C1. Overweight Message Payloads Across Chrome Runtime Messaging
- **Location:** `extension/content/content.js`, lines 1565–1600 (`publishSidePanelState`)
- **Severity:** Medium
- **Description:**
  Whenever subtitle state or active cue changes, `publishSidePanelState()` serializes all cues in the video:
  ```js
  cues: cues.map((c) => ({ id: c.id, source: c.source, en: c.en, vi: c.vi, ... }))
  ```
  For a 2-hour video with 2,000 subtitle cues, transmitting the entire 2,000-item array over `chrome.runtime.sendMessage` on playhead ticks (every 250ms when playhead crosses cue boundaries) causes significant IPC serialization overhead and CPU consumption in both content script and sidepanel worker.
- **Root Cause:** Coarse-grained messaging design sending full state array instead of differential updates.
- **Proposed Fix:** 
  1. Only send the full `cues` array when `listDirty` is true (e.g., initial load, import, reload).
  2. Send lightweight active cue updates (`{ activeCueId, status }`) during playhead timeline playback ticks.

#### C2. Silent Error Suppression and Unhandled Network Errors on Offline Bridge
- **Location:** `extension/background/service_worker.js`, lines 187, 235; `extension/content/content.js`, lines 2061, 2491
- **Severity:** Low
- **Description:**
  Calls to local bridge `http://127.0.0.1:8765` swallow exceptions silently via `catch (_) {}`. While this prevents unhandled promise rejections from crashing scripts, it suppresses diagnostic visibility and spams the Chrome extension console with `ERR_CONNECTION_REFUSED` every 2 seconds when the Python bridge is not running.
- **Proposed Fix:** Implement exponential backoff for bridge health/state polling when offline (e.g., back off from 2s to 10s, 30s when bridge is unreachable).

#### C3. Message Response Channel Retention (`return true`) Compliance
- **Location:** `extension/background/service_worker.js`, lines 37, 43, 49, 55, 63, 79
- **Severity:** Pass / Compliant
- **Description:** All async message handlers in `service_worker.js` correctly return `true` to keep the `sendResponse` IPC channel open until promises resolve. `CONTENT_GET_TAB_ID` returns `false` synchronously, which is correct.

---

### Category D: Security & Vulnerability Analysis

#### D1. Cross-Site Scripting (XSS) Vulnerability in Dictionary Popup Rendering
- **Location:** `extension/content/content.js`, lines 1364–1392 & line 1441 (`glossBlocksHtml` & `renderDictHtml`)
- **Severity:** **HIGH**
- **Description:**
  In `content.js`:
  ```javascript
  function primaryGlossLine(d) {
    const senses = d?.senses || [];
    const viParts = [];
    const enParts = [];
    for (const sense of senses.slice(0, 4)) {
      for (const g of sense.gloss_vi || []) {
        if (g && !viParts.includes(g)) viParts.push(g);
      }
      ...
    }
    return {
      vi: viParts.slice(0, 5).join(", "),
      en: enParts.slice(0, 4).join("; "),
    };
  }

  function glossBlocksHtml(d) {
    const { vi, en } = primaryGlossLine(d);
    if (!vi && !en) return "";
    const parts = [];
    if (vi) {
      parts.push(
        `<div class="dict-gloss-row dict-gloss-vi"><span class="dict-lang">VI</span><span class="dict-gloss">${vi}</span></div>` // ❌ UNESCAPED `vi` INJECTED HERE!
      );
    }
    ...
  }
  ```
  `vi` and `en` returned from `primaryGlossLine(d)` contain raw strings from `res.data` (the local bridge response). In `glossBlocksHtml`, `vi` and `en` are interpolated into HTML string template **WITHOUT calling `escapeHtml()`**!
  If an attacker crafts a malicious response from the bridge or man-in-the-middles local HTTP traffic, raw HTML/JavaScript (`<img src=x onerror=...>`) will be executed in YouTube's origin under the content script.
- **Root Cause:** Missing `escapeHtml()` call on `vi` and `en` variables in `glossBlocksHtml`.
- **Proposed Fix:** Wrap `vi` and `en` in `escapeHtml()`:
  ```javascript
  `<div class="dict-gloss-row dict-gloss-vi"><span class="dict-lang">VI</span><span class="dict-gloss">${escapeHtml(vi)}</span></div>`
  ```

#### D2. Unsanitized `path` in Bridge Fetch Proxy
- **Location:** `extension/background/service_worker.js`, line 254
- **Severity:** Medium
- **Description:**
  ```javascript
  async function handleBridgeFetch(msg) {
    const { path, method = "GET", body, isForm } = msg;
    const url = `${BRIDGE}${path}`;
  ```
  `handleBridgeFetch` receives `msg.path` from content scripts or sidepanel without verifying that `path` starts with a single `/` or preventing path traversal (e.g., `../../api/danger`).
- **Proposed Fix:** Validate that `path` starts with `/` and does not contain `..` path traversal sequences before executing `fetch`.

#### D3. API Origin Scoping in `host_permissions`
- **Location:** `extension/manifest.json`, lines 7–14
- **Severity:** Low / Information
- **Description:** `host_permissions` allows HTTP requests to `http://127.0.0.1:8765/*`, `http://localhost:8765/*`, `http://127.0.0.1:3000/*`, and `http://localhost:3000/*`. Scoping is restricted to specified ports on localhost, which complies with MV3 host permission guidelines.

---

### Category E: UI/UX & Interaction Design

#### E1. Overlay Position & Scale Drag Responsiveness
- **Location:** `extension/content/content.js`, lines 1063–1120 (`applyBarPosition`), 1131–1217 (`setupBarDrag`)
- **Severity:** Low / Polish
- **Description:** Overlay bar position is computed relative to the YouTube video rectangle (`getVideoRect()`). Normalized coordinates (`nx`, `ny`) are saved in `chrome.storage.local`. Double clicking resets position to default (`settings.barPos = null`).
- **Observation:** Behavior is smooth and responsive. When video resizes (fullscreen toggle, theater mode), `ResizeObserver` recalculates top/left within video bounds.

#### E2. Side Panel Auto-Open Experience & Browser Gesture Blockers
- **Location:** `extension/content/content.js`, lines 1691–1728 (`openSidePanel`, `bindGestureOpenSidePanel`)
- **Severity:** Low
- **Description:** Chrome restricts `chrome.sidePanel.open()` to user gestures. `content.js` handles blocked auto-opens by setting `pendingOpenSidePanel = true` and binding a pointer gesture listener on the YouTube player. Clicking anywhere on the player triggers `openSidePanel()`.
- **Observation:** Excellent user fallback design.

---

## 4. Comprehensive Issue Inventory Table

| Issue ID | Severity | Category | File Path | Line(s) | Description | Proposed Strategy |
|---|---|---|---|---|---|---|
| **ISSUE-01** | High | Security | `extension/content/content.js` | 1364-1392, 1441 | `glossBlocksHtml()` injects raw bridge `vi`/`en` gloss strings via `innerHTML` without `escapeHtml()`. XSS vulnerability. | Wrap `vi` and `en` in `escapeHtml()` before template string interpolation. |
| **ISSUE-02** | High | MV3 Compliance | `extension/background/service_worker.js` | 142-154, 248-252 | Background worker uses `setInterval` and in-memory global state (`_lastBridgeUpdatedAt`). Fails when SW terminates (~30s inactivity). | Migrate SW state variables to `chrome.storage.session`; replace `setInterval` with reactive events or `chrome.alarms`. |
| **ISSUE-03** | Medium | Performance | `extension/content/content.js` | 1565-1600 | `publishSidePanelState()` transmits full 2,000-cue array over IPC on playhead ticks. | Split messaging into full sync (when `listDirty`) vs lightweight active cue tick updates. |
| **ISSUE-04** | Medium | Performance | `extension/content/content.js` | 997-998 | Window `resize` & `fullscreenchange` event listeners bound repeatedly in `ensureVideoLayoutSync()` without cleanup guard. | Add single-instance boolean flag (`layoutListenersBound`) before calling `addEventListener`. |
| **ISSUE-05** | Medium | Security | `extension/background/service_worker.js` | 253-255 | `handleBridgeFetch` does not sanitize `msg.path`, permitting potential path manipulation. | Sanitize `path` (must start with `/`, reject `..`). |
| **ISSUE-06** | Low | Manifest MV3 | `extension/manifest.json` | 6 | `"scripting"` permission declared in `manifest.json` but never used anywhere in codebase. | Remove `"scripting"` from `permissions` array in `manifest.json`. |
| **ISSUE-07** | Low | Performance | `extension/injected/page_capture.js` | 63-66 | `captureRoi()` instantiates a new HTML5 `<canvas>` element on every capture call. | Reuse singleton offscreen canvas instance on `state`. |
| **ISSUE-08** | Low | Resilience | `extension/background/service_worker.js` | 249-251 | SW polls bridge every 2s continuously even when bridge is offline, spamming console errors. | Implement exponential backoff on fetch failure when bridge is offline. |
| **ISSUE-09** | Low | Code Hygiene | `extension/content/content.js` | 3060 | Navigating videos doesn't call `stopLoop()` prior to re-initializing playback loops. | Call `stopLoop()` at start of `onNavigate()`. |
| **ISSUE-10** | Low | MV3 API | `extension/background/service_worker.js` | 8, 14, 138 | `setPanelBehavior` called without API existence check (`chrome.sidePanel?.setPanelBehavior`). | Add optional chaining / feature check. |
| **ISSUE-11** | Low | UI/UX | `extension/sidepanel/sidepanel.js` | 938 | Play button in sidepanel triggers `play` command via message passing; no visual active indication on list items during quick seek. | Add brief visual pulse feedback on play button click. |
| **ISSUE-12** | Info | Security | `extension/manifest.json` | 7-14 | Host permissions include `http://127.0.0.1:3000/*` and `http://localhost:3000/*`. | Verified safe (scoped to local dev server). |
| **ISSUE-13** | Info | Performance | `extension/content/content.js` | 2401-2407 | `barCueFingerprint` prevents redundant DOM re-renders when active cue text hasn't changed. | Good pattern; retain. |
| **ISSUE-14** | Info | Architecture | `extension/injected/page_capture.js` | 420-452 | XHR and fetch monkey-patching in MAIN world intercepts YouTube `/api/timedtext` streams. | Effective fallback for raw caption data; retain. |

---

## 5. Proposed Concrete Refactoring Strategy & Action Plan

### Step 1: Immediate Security & MV3 Fixes (High Priority)
1. **Fix XSS in `content.js` (ISSUE-01):**
   In `glossBlocksHtml(d)` (lines 1378-1392), sanitize `vi` and `en` using `escapeHtml(vi)` and `escapeHtml(en)` prior to string construction.
2. **Remove Unused Permission (ISSUE-06):**
   In `manifest.json`, remove `"scripting"` from `"permissions"`.

### Step 2: Service Worker Lifecycle Modernization (High Priority)
1. **Service Worker State Persistence (ISSUE-02):**
   In `background/service_worker.js`, move `_lastBridgeUpdatedAt` and `_lastPushedJson` to `chrome.storage.session`.
2. **Replace SW `setInterval` Polling (ISSUE-02, ISSUE-08):**
   Replace `setInterval(..., 2000)` in SW with `chrome.alarms` or reactive polling on storage changes with exponential backoff when bridge returns HTTP errors.

### Step 3: Performance & IPC Optimization (Medium Priority)
1. **Optimize Messaging Payload (ISSUE-03):**
   Modify `publishSidePanelState` in `content.js` so that routine playhead position ticks only transmit `{ activeCueId, status }` instead of serializing the 2,000-cue array every tick.
2. **Guard Window Event Listeners (ISSUE-04):**
   In `content.js`, wrap `window.addEventListener("resize", ...)` and `document.addEventListener("fullscreenchange", ...)` in a single-instance check `if (!layoutListenersBound)`.

---

## 6. Verification Method

To verify these findings and fixes:

1. **Manifest Validation:**
   Load `extension/` as an unpacked extension in `chrome://extensions`. Check Chrome Extension errors panel for any MV3 warnings or permission mismatches.
2. **Security Audit:**
   Inspect `glossBlocksHtml()` rendering by mocking dictionary responses containing HTML strings (e.g. `<b>test</b>`) and verifying string literal escaping in DOM elements.
3. **Service Worker Lifecycle Test:**
   Go to `chrome://extensions`, click **"Service Worker (Inactive)"** to terminate the background worker manually. Interact with YouTube page and verify that state synchronization resumes without state corruption or missing bridge timestamps.
4. **IPC Performance Trace:**
   Open DevTools performance profiler on Chrome Side Panel (`chrome-extension://.../sidepanel/sidepanel.html`) while playing a long YouTube video. Verify message passing frequency and CPU usage.
