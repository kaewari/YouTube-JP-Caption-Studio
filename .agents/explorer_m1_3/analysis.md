# Web UI & End-to-End Integration Code Review Report

**Project**: YouTube Caption Code Review (Realtime OCR & Caption Translation)  
**Scope**: Web UI (`web/saved-items`), Chrome Extension Popup Integration (`extension/popup`), Local Bridge API (`local-bridge`) Dataflow  
**Reviewer**: Explorer 3 (Web UI & Integration focus)  
**Date**: 2026-07-29  

---

## 1. Executive Summary

This report presents a thorough, evidence-based code review of the Web UI (`web/saved-items`) and its end-to-end integration with the Chrome extension (`extension/popup`) and the Python backend (`local-bridge`). 

The Web UI is implemented as a modern **Next.js 16.2** application using **React 19**, **Tailwind CSS v4**, **@base-ui/react**, and **TypeScript 5**. It serves as the Language Reactor-style "Saved Items" management console where users can inspect saved vocabulary, filter by JLPT level and status (`known`, `learning`, `ignored`, `special`), and manage extension settings.

While the Web UI is visually clean, highly responsive, and well-structured, our investigation uncovered **8 major integration, architectural, data persistence, and accessibility flaws** that compromise data integrity, introduce race conditions in storage synchronization, cause layout degradation in browser popup mode, and degrade user experience.

---

## 2. System Overview & Component Topography

```
+-----------------------------------------------------------------------------------+
|                                 WEB UI LAYER                                      |
|  web/saved-items (Next.js 16.2 / React 19 / Tailwind v4 / Base UI)                 |
|                                                                                   |
|  +---------------------+   +-----------------------+   +-----------------------+  |
|  |  SavedItemsApp.tsx  |   |   SavedWordsList.tsx  |   |   SettingsPanel.tsx   |  |
|  |  (App Orchestration)|   |   VocabRow.tsx        |   |  (Config Management)  |  |
|  +----------+----------+   +-----------+-----------+   +-----------+-----------+  |
|             |                          |                           |              |
|             +--------------------------+---------------------------+              |
|                                        |                                          |
|                              Storage Dispatcher                                   |
|                        vocab-store.ts / settings-store.ts                         |
+----------------------------------------+------------------------------------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
    +------------------------------------+   +------------------------------------+
    |      CHROME EXTENSION STORAGE      |   |          LOCAL BRIDGE API          |
    |   chrome.storage.local (MV3)       |   |      http://127.0.0.1:8765        |
    |   - userVocab                      |   |  - GET/POST /extension_state       |
    |   - hardsubSettings                |   |  - GET /health                     |
    |                                    |   |  - POST /bootstrap                 |
    +------------------------------------+   +------------------------------------+
                       ^                                   ^
                       |                                   |
                       +-----------------+-----------------+
                                         |
                                         v
                            +--------------------------+
                            |       localStorage       |
                            |  ytcaption.savedWords.v1 |
                            |  ytcaption.hardsubSettings|
                            +--------------------------+
```

---

## 3. Detailed Code Review Findings

### Category A: Integration & Dataflow Issues

#### Finding A.1 — Asymmetric Data Synchronization & Gloss Loss in Merge Operations
- **Severity**: **HIGH**
- **Category**: Integration & Dataflow
- **File**: `web/saved-items/src/lib/vocab-store.ts` (Lines 64–90, 157–195)
- **Problem**:
  `chrome.storage.local` key `userVocab` and `local-bridge` endpoint `/extension_state` only persist status mappings (`Record<string, VocabStatus>` e.g., `{"遭難": "learning"}`). Rich vocabulary metadata (`reading`, `glossVi`, `glossEn`, `contextJa`, `videoTitle`) is only saved in `localStorage` (`ytcaption.savedWords.v1`). When a user saves or updates a word directly via the YouTube overlay dict popup, `userVocab` receives a new entry (e.g., `"勉強": "learning"`). When `mergeUserVocabMap` executes during synchronization:
  ```ts
  // Lines 75-84 in src/lib/vocab-store.ts
  if (existing) {
    next.push({ ...existing, status, updatedAt: status !== existing.status ? now : existing.updatedAt });
  } else {
    next.push({ lemma, status, updatedAt: now }); // Missing reading, glossVi, glossEn, contextJa!
  }
  ```
  The newly synced word has no definitions (`glossVi: undefined`). In `VocabRow.tsx`:
  ```tsx
  // Line 57 in VocabRow.tsx
  <p className="mt-1 text-[14px] text-white/85">
    {word.glossVi || "—"}
  </p>
  ```
  The user is presented with empty dashes (`—`) for all words synced from the extension dictionary popup.
- **Root Cause**: The storage merger does not attempt dictionary lookup or fallback enrichment when merging new lemmas from `UserVocabMap`.
- **Proposed Concrete Fix**: Implement dictionary fallback lookup inside `mergeUserVocabMap` or invoke the local-bridge dictionary enrichment endpoint (`/tokenize_enrich` or local dictionary lookup) whenever a lemma without `glossVi` is added.

---

#### Finding A.2 — Unhandled Async Race Condition & Memory Leak in Storage Polling
- **Severity**: **HIGH**
- **Category**: Integration / Performance
- **Files**:
  - `web/saved-items/src/lib/vocab-store.ts` (Lines 323–333)
  - `web/saved-items/src/lib/settings-store.ts` (Lines 340–356)
- **Problem**:
  In non-extension environments (localhost Web UI), `subscribeVocab` and `subscribeSettings` set up a 1.5-second `setInterval` with an unhandled async IIFE:
  ```ts
  // Lines 323-333 in src/lib/vocab-store.ts
  let lastJson = "";
  const id = window.setInterval(() => {
    void (async () => {
      const map = await fetchVocabFromBridge();
      if (!map) return;
      const j = JSON.stringify(map);
      if (j === lastJson) return;
      lastJson = j;
      onChange(mergeUserVocabMap(getPrev(), map), "bridge");
    })();
  }, 1500);
  return () => window.clearInterval(id);
  ```
  1. If network latency or local bridge processing takes >1500ms (e.g. system load or timeout), multiple HTTP requests queue up concurrently.
  2. Late-resolving older requests can overwrite state updated by newer requests (out-of-order response hazard).
  3. No check is performed to determine if the subscription was unsubscribed/unmounted while `fetchVocabFromBridge()` was pending.
- **Root Cause**: Interval-based polling without request locking (`isFetching` flag or `AbortController`) or completion state check.
- **Proposed Concrete Fix**: Replace fixed `setInterval` with recursive `setTimeout` or `AbortController`-backed polling loop that guarantees only one fetch is in flight at any time.

---

#### Finding A.3 — Silent Exception Suppression in API Communications
- **Severity**: **MEDIUM**
- **Category**: Integration & Security
- **Files**:
  - `web/saved-items/src/lib/vocab-store.ts` (Lines 103–105, 122–124)
  - `web/saved-items/src/lib/settings-store.ts` (Lines 113–115, 128–130)
- **Problem**:
  All network interactions with `BRIDGE_BASE` (`http://127.0.0.1:8765`) wrap `fetch` calls in blank `try { ... } catch {}` blocks:
  ```ts
  // Lines 92-106 in src/lib/vocab-store.ts
  async function pushVocabToBridge(map: UserVocabMap): Promise<void> {
    try {
      await fetch(`${BRIDGE_BASE}/extension_state`, { ... });
    } catch {
      /* optional */
    }
  }
  ```
  When the backend is down, CORS policy blocks requests, or bridge returns HTTP 500 errors, the failure is silently discarded. The UI displays `"Đã lưu localStorage + bridge"` (Line 123 of `SavedItemsApp.tsx`), giving users false confirmation that settings/vocabulary were persisted to the local bridge when they actually failed.
- **Root Cause**: Over-zealous exception masking without returning success status codes or propagating error states to the UI notification bar.
- **Proposed Concrete Fix**: Return explicit `{ success: boolean, error?: string }` from persistence functions and display amber warning badges when local bridge sync fails.

---

### Category B: Architecture & Component Design Issues

#### Finding B.1 — Monolithic Top-Level State Management
- **Severity**: **MEDIUM**
- **Category**: Architecture & Component Design
- **File**: `web/saved-items/src/components/SavedItemsApp.tsx` (Lines 30–84)
- **Problem**:
  `SavedItemsApp.tsx` acts as a monolithic component managing 10 distinct `useState` hooks:
  - `collapsed` (sidebar state)
  - `isExt` (extension environment detection)
  - `view` (current view: saved vs settings)
  - `tab` (current tab)
  - `words` (saved word list)
  - `source` (data source origin)
  - `note` (status message)
  - `query` (search query)
  - `filter` (status filter)
  - `ready` (initial hydration ready flag)
  Plus a `wordsRef` mutable ref (`useRef`) to bypass stale closure issues in subscriptions.
  Furthermore, `SettingsPanel.tsx` duplicates settings loading, storage subscription, and bridge health polling logic independently.
- **Root Cause**: Lack of custom React hook abstractions (e.g. `useVocabStore`, `useSettingsStore`, `useBridgeHealth`).
- **Proposed Concrete Fix**: Refactor data management into modular custom hooks (`useVocabStore.ts`, `useSettingsStore.ts`) that encapsulate loading, subscription lifecycle, and persistence.

---

### Category C: Maintainability, UI/UX & Accessibility (a11y) Issues

#### Finding C.1 — Flex Overflow & Layout Degradation in Extension Popup Mode
- **Severity**: **MEDIUM**
- **Category**: UI/UX & CSS Architecture
- **Files**:
  - `web/saved-items/src/components/SavedItemsApp.tsx` (Lines 151–154)
  - `web/saved-items/src/app/globals.css` (Lines 159–181)
- **Problem**:
  In `SavedItemsApp.tsx`:
  ```tsx
  <div
    className="flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-200"
    style={{ paddingLeft: collapsed ? 64 : 240 }}
  >
  ```
  When rendered inside Chrome Extension Popup (`hs-ext-popup` class applied to `<html>`), the fixed left padding of 240px consumes up to 40% of the popup container. In `globals.css`, `html.hs-ext-popup` sets fixed `height: min(720px, 90vh)` and `overflow: hidden`, but child elements use `min-h-screen`, creating double scrollbars and truncating the bottom toolbar and settings controls.
- **Root Cause**: Hardcoded inline padding (`paddingLeft: 240px`) and desktop-centric layout assumption without adaptive popup styling rules.
- **Proposed Concrete Fix**: Auto-collapse sidebar in popup mode or convert to top/bottom navigation, and adjust `.hs-popup-root` CSS to handle scrolling cleanly.

---

#### Finding C.2 — Accessibility (a11y) Violations in Controls & Interactive Elements
- **Severity**: **MEDIUM**
- **Category**: Accessibility & UI/UX
- **Files**:
  - `web/saved-items/src/components/SavedWordsToolbar.tsx` (Lines 91–97)
  - `web/saved-items/src/components/VocabRow.tsx` (Lines 78–96)
  - `web/saved-items/src/components/SideNav.tsx` (Lines 96–108)
- **Problem**:
  1. **Search Input**: The search input in `SavedWordsToolbar.tsx` has no `<label>` or `aria-label`, failing WCAG 2.1 SC 3.3.2 (Labels or Instructions).
  2. **Status Mark Buttons**: The status modification buttons in `VocabRow.tsx` use standard `<button>` tags without `aria-pressed` or `role="radio"` attributes to indicate the currently active status to assistive tech.
  3. **Non-semantic Interactive Containers**: In `SideNav.tsx`, the language selector container (`Line 96`) is a `<div>` styled like a dropdown menu but lacks `role="button"`, `tabIndex={0}`, or keyboard handler.
- **Root Cause**: Omission of ARIA attributes and semantic HTML wrappers.
- **Proposed Concrete Fix**: Add `aria-label="Tìm kiếm từ vựng"`, `aria-pressed={active}`, and replace non-semantic divs with semantic `<button>` elements.

---

### Category D: Performance & Security Issues

#### Finding D.1 — Unnecessary Full List Re-renders & Inline Function Allocations
- **Severity**: **LOW / PERFORMANCE**
- **Category**: Performance
- **Files**:
  - `web/saved-items/src/components/VocabRow.tsx` (Lines 23–101)
  - `web/saved-items/src/components/SavedWordsList.tsx` (Lines 28–34)
- **Problem**:
  `VocabRow` is rendered inside `words.map(...)` within `SavedWordsList`. `VocabRow` is not wrapped in `React.memo()`. Whenever `query` or `filter` state changes, or when the user updates the status of a single word, all visible `VocabRow` instances re-render. Additionally, `MARKS.map(...)` inside `VocabRow` creates new inline arrow function callbacks (`onClick={() => onStatus(word.lemma, m.id || null)}`) on every render.
- **Root Cause**: Unmemoized child component rendering list items.
- **Proposed Concrete Fix**: Wrap `VocabRow` in `React.memo` and memoize status update handlers.

---

#### Finding D.2 — Unauthenticated Local HTTP Communication & CORS Exposure
- **Severity**: **MEDIUM**
- **Category**: Security
- **Files**:
  - `web/saved-items/src/lib/chrome-env.ts` (Line 57)
  - `local-bridge/main.py` (Lines 315–335)
- **Problem**:
  The Web UI connects directly to `BRIDGE_BASE = "http://127.0.0.1:8765"`. Fast API `main.py` on the Python backend exposes `/extension_state` with wide-open CORS middleware (`allow_origins=["*"]`). Any malicious script running on any website in the user's browser can issue background cross-origin HTTP requests to `http://127.0.0.1:8765/extension_state`, reading or modifying the user's vocabulary list and application settings.
- **Root Cause**: Lack of origin validation or security token header in local-bridge REST API requests.
- **Proposed Concrete Fix**: Introduce a simple token check header (e.g. `X-YT-Caption-Token`) or restrict allowed origins on the local-bridge backend.

---

### Category E: Build & Extension Packaging Issues

#### Finding E.1 — MV3 CSP Inline Script Externalization Pipeline Vulnerability
- **Severity**: **MEDIUM**
- **Category**: Build & Extension Packaging
- **File**: `web/saved-items/scripts/copy-to-extension.mjs` (Lines 46–49, 53–76)
- **Problem**:
  `copy-to-extension.mjs` transforms Next.js static export (`out/`) into `extension/popup/` for Manifest V3 compliance.
  1. Line 46 uses a hardcoded array `["inline-main-0.js", ... "inline-main-9.js"]` to delete old inline scripts. If a future build produces >10 inline scripts, stale scripts will remain in `extension/popup/`.
  2. Regex-based script externalization (`/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi`) can break if Next.js runtime bundles include inline script contents with string literals containing `</script>`.
- **Root Cause**: Fragile regex string replacement for HTML parsing and hardcoded cleanup list.
- **Proposed Concrete Fix**: Use `fs.readdirSync` with regex matching (`^inline-.*\.js$`) to dynamically clean up previous inline scripts, and robust HTML transformation.

---

## 4. Issue Summary Table

| ID | Finding Title | Category | Severity | File & Lines |
|---|---|---|---|---|
| **A.1** | Asymmetric Data Sync & Gloss Loss in Merge | Integration | **HIGH** | `lib/vocab-store.ts:64-90` |
| **A.2** | Async Race Condition & Memory Leak in Storage Polling | Integration / Perf | **HIGH** | `lib/vocab-store.ts:323-333` |
| **A.3** | Silent Exception Suppression in API Calls | Integration / Reliability | **MEDIUM** | `lib/vocab-store.ts:103-105` |
| **B.1** | Monolithic Top-Level State Management | Architecture | **MEDIUM** | `components/SavedItemsApp.tsx:30-84` |
| **C.1** | Flex Overflow & Padding Degradation in Extension Popup | UI/UX / CSS | **MEDIUM** | `components/SavedItemsApp.tsx:151` |
| **C.2** | Accessibility (a11y) Violations in Input & Buttons | Accessibility (a11y) | **MEDIUM** | `components/SavedWordsToolbar.tsx:91` |
| **D.1** | Unnecessary Full List Re-renders | Performance | **LOW** | `components/VocabRow.tsx:27-100` |
| **D.2** | Unauthenticated Local HTTP & CORS Exposure | Security | **MEDIUM** | `lib/chrome-env.ts:57` |
| **E.1** | Fragile MV3 CSP Script Externalization Pipeline | Build / Extension | **MEDIUM** | `scripts/copy-to-extension.mjs:46` |

---

## 5. Concrete Refactoring Strategy & Recommendations

### 5.1 Architecture & Hooks Refactoring
Extract state logic into reusable custom hooks:
1. `useVocabStore()`: Encapsulates async loading, merge logic, dictionary fallback lookup, and non-overlapping polling with `AbortController`.
2. `useSettingsStore()`: Encapsulates settings synchronization, persistence, and bridge health checks.

### 5.2 Safe Polling Abstraction
Replace `setInterval` with an `AbortController`-backed polling loop:
```ts
export function useBridgeVocabSync(enabled: boolean, onSync: (map: UserVocabMap) => void) {
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timerId: ReturnType<typeof setTimeout>;

    async function poll() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      try {
        const res = await fetch(`${BRIDGE_BASE}/extension_state`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok && active) {
          const data = await res.json();
          if (data?.userVocab) onSync(data.userVocab);
        }
      } catch {
        /* handle / swallow abort */
      } finally {
        if (active) timerId = setTimeout(poll, 2000);
      }
    }

    poll();
    return () => {
      active = false;
      clearTimeout(timerId);
    };
  }, [enabled, onSync]);
}
```

### 5.3 Extension Popup Adaptive Layout
Update `SavedItemsApp.tsx` and `globals.css` so that in popup mode (`isExt === true`):
- Sidebar defaults to collapsed (`collapsed: true` or top compact tab bar).
- Content container uses `padding-left: 64px` or `0px`.
- Page container uses flex child scrolling (`overflow-y: auto`) instead of body overflow.

---

## 6. Verification Method

To verify these findings and any subsequent implementer changes:
1. **Lint & Type Check**:
   ```bash
   cd web/saved-items
   npm run typecheck
   npm run lint
   ```
2. **Build Verification**:
   ```bash
   npm run build:extension
   ```
   Check that `extension/popup/popup.html` and `extension/popup/inline-main-*.js` are generated correctly without inline script violation warnings when loaded into Chrome via `chrome://extensions`.
3. **Data Loss & Merge Testing**:
   Add a new word to `userVocab` via `chrome.storage.local` or `/extension_state` and verify that gloss/reading enrichment executes properly rather than displaying `"—"`.

