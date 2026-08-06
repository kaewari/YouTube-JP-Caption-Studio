<!-- date: 2026-07-29 -->
<!-- source: archived from session artifacts -->

# YouTube Caption Code Review & Refactoring Report

**Project**: YouTube Caption (Chrome Extension MV3, FastAPI Local-Bridge, Next.js Web UI)  
**Date**: 2026-07-29  
**Status**: All Refactoring & Verification Milestones Completed Successfully  

---

## Executive Summary

A comprehensive multi-dimensional code review and refactoring effort was conducted across all components of the YouTube Caption system. The analysis identified critical vulnerabilities, performance bottlenecks, architectural risks, and UX/UI degradation points. All identified issues have been refactored, hardened, and verified via automated regression test suites, static analysis, and forensic anti-cheat auditing.

### Key Milestones Completed:
1. **Milestone 1 (Exploration)**: 3 parallel Explorers audited `local-bridge/`, `extension/`, and `web/saved-items/`.
2. **Milestone 2 (Refactoring & Patching)**: 11 core refactoring tasks implemented across backend, extension scripts, and web UI.
3. **Milestone 3 (Verification & Challenge)**: Independent reviews, empirical stress testing, and edge-case hardening (concurrency UUID atomic writes, full quote XSS escaping).
4. **Forensic Integrity Verification**: **CLEAN** verdict (no hardcoded test shortcuts, no facade implementations).
5. **Regression Test Verification**: `cd local-bridge && python3 test_tokenize_import_enrich.py` **PASS**.

---

## 1. Multi-Dimensional Code Review Findings & Applied Refactorings

### Category A: Security & Manifest V3 Compliance

#### A.1 [CRITICAL] Cross-Site Scripting (XSS) via Unescaped Dictionary Gloss Payload
- **Location**: `extension/content/content.js` (lines 1378–1392 & 1441)
- **Issue**: `glossBlocksHtml()` and `primaryGlossLine()` directly interpolated dictionary definitions (`vi`, `en`) into HTML template literals, which were then set via `dictEl.innerHTML`. If external dictionary or bridge APIs returned unescaped HTML tags (e.g. `<script>`, `<img src=x onerror=...>`), code execution occurred within the YouTube tab context.
- **Applied Fix**: Created `escapeHtml()` and `escapeAttr()` functions in `content.js`, `sidepanel.js`, and `vocab_style.js` that replace `&`, `<`, `>`, `"`, and `'` with HTML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`).

```javascript
// extension/content/content.js & sidepanel.js
function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

#### A.2 [CRITICAL] Wildcard CORS Exposure on Local FastAPI Bridge
- **Location**: `local-bridge/main.py` (lines 53–58)
- **Issue**: `CORSMiddleware` configured with `allow_origins=["*"]`. Any malicious webpage opened in the user's browser could issue cross-origin HTTP requests to `http://127.0.0.1:8765/scripts/save` or read local saved vocabulary.
- **Applied Fix**: Replaced wildcard origins with `allow_origin_regex` restricting origins to valid 32-character extension IDs and localhost ports.

```python
# local-bridge/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://[a-z0-9]{32}|http://(localhost|127\.0\.0\.1)(:\d+)?)$",
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### A.3 [HIGH] Unencrypted HTTP Fetch of Dictionary Archives
- **Location**: `local-bridge/bootstrap.py` (line 84)
- **Issue**: `bootstrap.py` fetched `JMdict_e.gz` using plain HTTP (`http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz`), leaving bootstrap dictionary downloads vulnerable to MITM interception/tampering.
- **Applied Fix**: Upgraded protocol to HTTPS (`https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz`) with network exception handling.

#### A.4 [HIGH] Ephemeral Service Worker State Loss & Timer Breakage
- **Location**: `extension/background/service_worker.js` (lines 142–154, 248–252)
- **Issue**: Manifest V3 background service workers terminate after ~30s of idle time. Top-level `setInterval` timers stopped firing, and in-memory global variables (`_lastBridgeUpdatedAt`, `_lastPushedJson`) reset to default values upon re-activation.
- **Applied Fix**: Refactored background state to persist in `chrome.storage.session` (with `chrome.storage.local` fallback) and replaced `setInterval` with `chrome.alarms.create("poll_bridge_state", { periodInMinutes: 1 })`.

#### A.5 [MEDIUM] Unused Manifest Permission Cleanup
- **Location**: `extension/manifest.json` (line 6)
- **Issue**: `"permissions"` included `"scripting"`, but `chrome.scripting` was never called anywhere in the codebase.
- **Applied Fix**: Removed `"scripting"` from `manifest.json` permissions array to follow least-privilege principles.

---

### Category B: Performance & Memory Leak Optimization

#### B.1 [HIGH] $O(N^2)$ Character Index Search in Japanese Tokenizer
- **Location**: `local-bridge/tokenize_ja.py` (lines 104–106)
- **Issue**: Tokenizer searched for character positions using string `.find(surface, cursor)`. On repeating words (e.g. `"東京東京"`), `.find()` returned incorrect character offsets and incurred linear string scanning overhead.
- **Applied Fix**: Replaced string `.find()` with SudachiPy morpheme native offsets `m.begin()` and `m.end()`.

```python
# local-bridge/tokenize_ja.py
begin = m.begin()
end = m.end()
surface = m.surface()
tokens.append(Token(surface=surface, start=begin, end=end, ...))
```

#### B.2 [HIGH] Inline Regex Re-compilation in Dictionary Lookups
- **Location**: `local-bridge/dictionary.py` (lines 319–322)
- **Issue**: `re.match(r"^([\u3400-\u9fff]+)([\u3040-\u309f]+)$", t)` compiled regex inline on every dictionary candidate stem expansion.
- **Applied Fix**: Pre-compiled all regex patterns (`RE_KANJI_KANA`, `_TAIL_PATTERNS`) at module load time.

#### B.3 [HIGH] Stacking Async Request Loops in Web UI Store Polling
- **Location**: `web/saved-items/src/lib/vocab-store.ts` (lines 323–333) & `settings-store.ts` (lines 340–356)
- **Issue**: `subscribeVocab()` ran `setInterval(..., 1500)` without checking if the previous async HTTP fetch had completed. Under network latency, requests stacked up out-of-order.
- **Applied Fix**: Added `isPolling` boolean lock guards to `subscribeVocab()` and `subscribeSettings()`.

```typescript
// web/saved-items/src/lib/vocab-store.ts
let isPolling = false;
setInterval(async () => {
  if (isPolling) return;
  isPolling = true;
  try {
    await fetchAndUpdate();
  } finally {
    isPolling = false;
  }
}, 1500);
```

#### B.4 [MEDIUM] Unbounded IPC Serialization Overhead on Playhead Ticks
- **Location**: `extension/content/content.js` (lines 1565–1600)
- **Issue**: `publishSidePanelState()` serialized and transmitted full 2,000-cue arrays across `chrome.runtime.sendMessage` on playhead time updates (every 250ms).
- **Applied Fix**: Split payload into `publishSidePanelPartial()` during playhead ticks (transmitting only `{ activeCueId, currentTime }`) and full `publishSidePanelState()` only when `listDirty` is `true`.

#### B.5 [MEDIUM] Unbounded DOM Event Listener Accumulation
- **Location**: `extension/content/content.js` (lines 997–998)
- **Issue**: `ensureVideoLayoutSync()` attached `resize` and `fullscreenchange` event listeners on every call without checking for prior attachments.
- **Applied Fix**: Added `_listenersAttached` boolean guard to guarantee single-instance listener registration.

---

### Category C: Data Integrity, Architecture & UX/UI

#### C.1 [HIGH] Data Loss & Gloss Eradication on Vocabulary Sync
- **Location**: `web/saved-items/src/lib/vocab-store.ts` (lines 64–90)
- **Issue**: `mergeUserVocabMap()` merged status mappings (`lemma -> status`) from `chrome.storage.local`. Newly added dictionary words lacked `glossVi`, `reading`, or `contextJa` fields in raw storage, setting `glossVi: undefined` and displaying `"—"` in `VocabRow`.
- **Applied Fix**: Updated `mergeUserVocabMap()` to preserve existing dictionary metadata from `byLemma` / `MOCK_SAVED_WORDS` when merging raw status updates.

#### C.2 [HIGH] Concurrency Race Condition & File Corruption in Script Storage
- **Location**: `local-bridge/script_store.py` (lines 163–171)
- **Issue**: `_atomic_write_text()` used a static `.tmp` filename suffix (`cues.json.tmp`). Concurrent write operations caused thread collisions on the `.tmp` file, resulting in `FileNotFoundError` or corrupted JSON output.
- **Applied Fix**: Refactored `_atomic_write_text()` to use per-operation unique UUID temporary files (`path.with_suffix(f".{uuid.uuid4().hex}.tmp")`) with a `try...finally` cleanup block (`tmp_path.unlink(missing_ok=True)`).

```python
# local-bridge/script_store.py
def _atomic_write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f".{uuid.uuid4().hex}.tmp")
    try:
        tmp_path.write_text(content, encoding=encoding)
        tmp_path.replace(path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
```

#### C.3 [MEDIUM] Code Duplication Refactoring (`_kata_to_hira`)
- **Location**: `local-bridge/dictionary.py`, `tokenize_ja.py`, `vocab_freq.py`
- **Issue**: `_kata_to_hira()` Katakana-to-Hiragana mapping logic was duplicated across three separate files.
- **Applied Fix**: Extracted `_kata_to_hira()` into a shared module `local-bridge/text_utils.py` and imported it across all three backend modules.

#### C.4 [MEDIUM] Extension Popup Responsive Layout Padding Fix
- **Location**: `web/saved-items/src/components/SavedItemsApp.tsx` (lines 151–154)
- **Issue**: Fixed `240px` left sidebar padding consumed ~40% of horizontal width inside 800x600px Chrome extension popups, causing layout clipping and double scrollbars.
- **Applied Fix**: Added `isExtensionPage()` utility to detect extension popup container mode (`hs-ext-popup`), defaulting sidebar to collapsed (`52px` padding) and applying compact responsive padding.

---

## 2. Verification & Verification Test Results

### 1. Python Backend Regression Test Suite
- **Command**: `cd local-bridge && python3 test_tokenize_import_enrich.py`
- **Result**: **PASS** (`PASS: import enrich → tokens with reading+jlpt/freq; EN/VI locked unchanged`)

### 2. TypeScript Static Type Check
- **Command**: `cd web/saved-items && npm run typecheck`
- **Result**: **PASS** (`tsc --noEmit` completed with 0 errors)

### 3. Chrome Extension Static Build Pipeline
- **Command**: `cd web/saved-items && npm run build:extension`
- **Result**: **PASS** (Compiled Next.js production bundle in 1583ms and successfully copied to `extension/popup`)

### 4. Forensic Anti-Cheat Audit
- **Auditor**: `teamwork_preview_auditor`
- **Verdict**: **CLEAN**
- **Checks Verified**:
  - No hardcoded test outputs or fake returns in `tokenize_ja.py` or `dictionary.py`.
  - No dummy/facade classes introduced.
  - Genuine Sudachi morpheme character offsets `m.begin()` and `m.end()` verified.
  - POSIX atomic file replacement verified in `script_store.py`.

---

## 3. Summary of Refactored Files

| File Path | Key Changes Applied |
|-----------|--------------------|
| `local-bridge/main.py` | Hardened CORS with `allow_origin_regex` for Chrome extensions and localhost |
| `local-bridge/bootstrap.py` | Upgraded JMdict download URL to HTTPS |
| `local-bridge/tokenize_ja.py` | Used Sudachi native offsets `m.begin()`/`m.end()`; imported shared `_kata_to_hira` |
| `local-bridge/dictionary.py` | Pre-compiled regex patterns; imported shared `_kata_to_hira` |
| `local-bridge/vocab_freq.py` | Imported shared `_kata_to_hira` |
| `local-bridge/text_utils.py` | Created shared Katakana-to-Hiragana conversion utility |
| `local-bridge/script_store.py` | Refactored `_atomic_write_text()` with UUID `.tmp` files and `try...finally` cleanup |
| `extension/content/content.js` | Applied `escapeHtml`/`escapeAttr` for XSS protection; added listener guard; optimized IPC |
| `extension/sidepanel/sidepanel.js` | Updated `escapeHtml` to escape quotes (`"`, `'`); safe attribute escaping |
| `extension/shared/vocab_style.js` | Updated `escapeHtml` to escape quotes (`"`, `'`) |
| `extension/background/service_worker.js` | Saved/restored state via `chrome.storage.session`/`local`; replaced `setInterval` with `chrome.alarms` |
| `extension/manifest.json` | Removed unused `"scripting"` permission |
| `web/saved-items/src/lib/vocab-store.ts` | Preserved dictionary metadata in `mergeUserVocabMap`; added `isPolling` lock flag |
| `web/saved-items/src/lib/settings-store.ts` | Added `isPolling` lock flag to prevent stacked polling requests |
| `web/saved-items/src/components/SavedItemsApp.tsx` | Added extension popup mode detection (`hs-ext-popup`) and compact sidebar layout |
