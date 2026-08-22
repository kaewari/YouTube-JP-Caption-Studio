<!-- date: 2026-07-29 -->
<!-- source: archived from session artifacts -->

# Review Report: Extension MV3 & Web UI Refactoring

**Reviewer**: Reviewer 2 (Extension MV3 & Web UI Reviewer) — `reviewer_m3_2`  
**Date**: 2026-07-29  
**Verdict**: **PASS (APPROVE)**  

---

## Executive Summary

The refactored MV3 Extension codebase (`extension/`) and Web UI package (`web/saved-items/`) have been thoroughly reviewed and stress-tested. The changes demonstrate high engineering quality, strict MV3 compliance, security best practices (XSS protection), efficient IPC messaging, clean state restoration across Service Worker restarts, and layout optimization for extension popups.

Static type check (`npm run typecheck`) and the extension build target (`npm run build:extension`) passed with zero errors or warnings.

---

## Detailed Findings per Component

### 1. `extension/content/content.js`
- **XSS Prevention & HTML Sanitization**:
  - `escapeHtml()` (lines 1850-1855) and `escapeAttr()` (lines 1856-1858) systematically sanitize all dynamic strings inserted into `innerHTML`.
  - Audited `markButtonsHtml`, `sentenceBlockHtml`, `glossBlocksHtml`, `renderDictHtml`, `rubyHtml`, `updateBar`, and popup dict elements. Untrusted input vectors (`t.surface`, `t.reading`, `cue.source`, `cue.vi`, `cue.en`) are escaped before HTML interpolation.
- **EventListener Guards**:
  - `_listenersAttached` guard (lines 978, 999-1004) prevents duplicate global `resize` and `fullscreenchange` event listener bindings.
  - `ResizeObserver` and `MutationObserver` instances are properly disconnected (`disconnect()`) prior to re-instantiation.
  - DOM event binding flags (`dragBound`, `bound`, `gestureOpenBound`) prevent duplicate listener registration.
- **IPC Message Payload Optimization**:
  - `publishSidePanelState()` sends full `cues` payloads only when `listDirty` or `forceList` is set.
  - `publishSidePanelPartial()` sends minimal status/activeCueId updates for playhead ticks, avoiding serialization overhead of large caption arrays.

### 2. `extension/background/service_worker.js`
- **Storage & State Restoration**:
  - `loadSwState()` and `saveSwState()` utilize `chrome.storage.session` (with `chrome.storage.local` fallback) to persist `_lastBridgeUpdatedAt` and `_lastPushedJson`.
  - Service Worker re-hydration on startup ensures bridge synchronization state is maintained across SW termination cycles without duplicate pushes.
- **`chrome.alarms` MV3 Polling**:
  - Background polling uses `chrome.alarms.create("poll_bridge_state", { periodInMinutes: 1 })` and `chrome.alarms.onAlarm`. This complies with MV3 requirements where `setInterval` is unreliable due to SW idle termination.

### 3. `extension/manifest.json`
- **Permission Hygiene**:
  - Confirmed removal of unused `"scripting"` permission. Permissions list is minimal and clean: `["storage", "cookies", "sidePanel", "tabs", "nativeMessaging"]`.
  - Content scripts are declared declaratively via `content_scripts` matching rules.

### 4. `web/saved-items/src/lib/vocab-store.ts` & `settings-store.ts`
- **Gloss Preservation (`mergeUserVocabMap`)**:
  - Preserves existing rich `SavedWord` metadata (glosses `glossVi`/`glossEn`, `reading`, `jlpt`, `contextJa`) when merging raw `{ lemma: status }` updates from `chrome.storage.local`.
- **Polling Concurrency Locks**:
  - `subscribeVocab` and `subscribeSettings` implement `isPolling` flag locks around asynchronous bridge polling loops to prevent overlapping requests under network latency.

### 5. `web/saved-items/src/components/SavedItemsApp.tsx`
- **Extension Popup Layout Adjustment**:
  - Detects extension context via `isExtensionPage()`. Applies `hs-ext-popup` root class and uses compact sidebar padding (`paddingLeft: 52px` collapsed / `160px` expanded) to fit inside Chrome extension popup windows without clipping or horizontal scrollbars.

---

## Static Analysis & Verification Results

1. **TypeScript Typecheck**:
   - Command: `cd web/saved-items && npm run typecheck`
   - Result: **PASS** (`tsc --noEmit` completed with 0 errors).

2. **Extension Next.js Build**:
   - Command: `cd web/saved-items && npm run build:extension`
   - Result: **PASS** (`EXTENSION_BUILD=1 next build` succeeded, static files copied to `extension/popup/`).

---

## Verified Claims

- `extension/content/content.js`: XSS escaping, listener guards, IPC optimization → **VERIFIED (PASS)**
- `extension/background/service_worker.js`: SW state restoration & `chrome.alarms` → **VERIFIED (PASS)**
- `extension/manifest.json`: Removed `"scripting"` permission → **VERIFIED (PASS)**
- `web/saved-items/src/lib/vocab-store.ts` & `settings-store.ts`: Gloss preservation & polling locks → **VERIFIED (PASS)**
- `web/saved-items/src/components/SavedItemsApp.tsx`: Extension popup padding → **VERIFIED (PASS)**
- Static type check & extension build → **VERIFIED (PASS)**

---

## Integrity Violation Check

- **Hardcoded test outputs / facade logic**: None detected.
- **Shortcuts / mock bypasses**: None detected.
- **Self-certifying claims**: Independently verified via source inspection and build execution.
