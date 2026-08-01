# Handoff Report — Explorer 3 (Web UI & Integration)

**Agent ID**: explorer_m1_3  
**Role**: Web UI & Integration Explorer  
**Task**: Code review of Web UI (`web/saved-items`), Chrome Extension Popup (`extension/popup`), and `local-bridge` integration  
**Status**: Completed  

---

## 1. Observation

- **Project Location**: `/Users/hoangson/Documents/Translate realtime OCR youtube video/web/saved-items`
- **Tech Stack**: Next.js 16.2.1, React 19.2.4, Tailwind CSS 4, @base-ui/react, TypeScript 5.
- **Key Code File Observations**:
  1. `src/lib/vocab-store.ts` (Lines 64–90): `mergeUserVocabMap` merges `userVocab` (`Record<string, VocabStatus>`) from `chrome.storage` or `/extension_state` into `SavedWord[]`. When a word is added via the extension dictionary popup, it lacks `glossVi`, `reading`, or `contextJa` fields in `userVocab`. `mergeUserVocabMap` creates a `SavedWord` with `glossVi: undefined`, resulting in `"—"` displayed in `VocabRow.tsx:57`.
  2. `src/lib/vocab-store.ts` (Lines 323–333) & `src/lib/settings-store.ts` (Lines 340–356): `subscribeVocab` and `subscribeSettings` set up `setInterval(..., 1500)` executing async fetch functions without request cancellation, `AbortController`, or completion flags, leading to overlapping requests and state race conditions.
  3. `src/components/SavedItemsApp.tsx` (Lines 30–84, 151–154): Manages 10 separate state variables in one top-level component, and applies hardcoded inline style `paddingLeft: collapsed ? 64 : 240`. In Chrome extension popup mode (`html.hs-ext-popup`), 240px padding consumes ~40% of the horizontal width.
  4. `src/lib/vocab-store.ts` (Lines 103–105) & `src/lib/settings-store.ts` (Lines 113–115): All HTTP calls to `http://127.0.0.1:8765/extension_state` catch and swallow errors silently with `/* optional */`, preventing user alert or error recovery when local bridge is down.
  5. `scripts/copy-to-extension.mjs` (Lines 46–49, 53–76): Uses regex string replacement to externalize inline scripts for MV3 CSP compliance, and relies on a hardcoded array deletion list up to `inline-main-9.js`.

---

## 2. Logic Chain

1. **Observed**: `userVocab` mapping only transmits status (`known`, `learning`, etc.), while rich metadata (`glossVi`, `reading`) lives in `localStorage`.
   **Reasoning**: New words marked in YouTube dict popups enter `chrome.storage.local` without glosses.
   **Deduction**: Merging without dictionary lookup leaves newly added words with blank definitions (`"—"`).

2. **Observed**: `subscribeVocab` calls `setInterval` with an async IIFE fetching `/extension_state` every 1.5s.
   **Reasoning**: If a request stalls or network is slow, subsequent interval ticks fire while previous requests are still pending.
   **Deduction**: Overlapping requests can complete out-of-order, overwriting updated state with stale response data.

3. **Observed**: `SavedItemsApp` applies `paddingLeft: 240px` inside a fixed flex container.
   **Reasoning**: Chrome extension popup windows are constrained to 800x600px max.
   **Deduction**: A 240px left padding severely constrains the main content area, making tables unreadable and truncating UI action buttons.

---

## 3. Caveats

- Runtime performance under extreme dataset sizes (>5,000 saved items) was evaluated structurally; actual browser memory profiling was not executed.
- Security analysis of local bridge CORS (`allow_origins=["*"]`) relies on inspecting `local-bridge/main.py`.

---

## 4. Conclusion

The Web UI (`web/saved-items`) provides a sleek, modern UI foundation for YouTube caption vocabulary management. However, critical integration and architectural bugs exist — specifically **gloss loss when syncing dictionary words (Finding A.1)**, **unhandled async request accumulation during bridge polling (Finding A.2)**, **silent error suppression (Finding A.3)**, and **popup layout scaling issues (Finding C.1)**. 

Addressing these issues with the proposed refactoring strategy will make the Web UI robust, secure, accessible, and production-ready for Chrome Extension MV3 deployment.

---

## 5. Verification Method

1. **Review Detailed Report**:
   Inspect complete code analysis report at:
   `/Users/hoangson/Documents/Translate realtime OCR youtube video/.agents/explorer_m1_3/analysis.md`
2. **Type Check & Lint**:
   ```bash
   cd "/Users/hoangson/Documents/Translate realtime OCR youtube video/web/saved-items"
   npm run typecheck
   npm run lint
   ```
3. **Extension Static Export**:
   ```bash
   npm run build:extension
   ```
   Verify that `extension/popup/popup.html` and externalized `inline-main-*.js` files load without CSP errors.
