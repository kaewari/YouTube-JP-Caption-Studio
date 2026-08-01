## 2026-07-29T21:27:57Z

<USER_REQUEST>
You are Worker 1 (Implementation & Refactoring Specialist) for the YouTube Caption project.

Project Root: /Users/hoangson/Documents/Translate realtime OCR youtube video
Working Directory: /Users/hoangson/Documents/Translate realtime OCR youtube video/.agents/worker_m2_1

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Mission:
Implement the complete refactoring and bug fixes identified across `local-bridge/`, `extension/`, and `web/saved-items/`.

Tasks to execute:

1. **`local-bridge/main.py`**:
   - Change `CORSMiddleware` `allow_origins=["*"]` to strict origin validation: allow `chrome-extension://*`, `http://localhost:*`, `http://127.0.0.1:*`, or use `allow_origin_regex=r"^chrome-extension://.*|^http://(localhost|127\.0\.0\.1)(:\d+)?$"`.

2. **`local-bridge/bootstrap.py`**:
   - Update JMdict archive download URL from `http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz` to `https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz`.

3. **`local-bridge/tokenize_ja.py` & `local-bridge/dictionary.py` & `local-bridge/vocab_freq.py`**:
   - In `tokenize_ja.py`: Replace string `.find()` with native Sudachi morpheme character offsets `m.begin()` and `m.end()`.
   - Pre-compile regexes in `dictionary.py` (`RE_KANJI_KANA = re.compile(...)`).
   - Extract `_kata_to_hira()` into a shared helper in `local-bridge/text_utils.py` and import it across `tokenize_ja.py`, `dictionary.py`, and `vocab_freq.py`.

4. **`local-bridge/script_store.py`**:
   - Refactor file writing (`save_cues`, etc.) to use atomic file replacement (write to `.tmp` file and `os.replace` / `Path.replace`).

5. **`extension/content/content.js`**:
   - Sanitize dictionary gloss HTML interpolation in `glossBlocksHtml()` and `primaryGlossLine()` using `escapeHtml(vi)` and `escapeHtml(en)` to prevent XSS.
   - Add single-instance boolean guard `_listenersAttached` to `ensureVideoLayoutSync()` to avoid accumulating `resize` and `fullscreenchange` listeners.
   - In `publishSidePanelState()`, omit full `cues` array serialization on playhead time ticks when `listDirty` is false.

6. **`extension/background/service_worker.js`**:
   - Refactor in-memory background state variables to persist in `chrome.storage.session` (or `chrome.storage.local`). Ensure state is restored upon service worker startup/re-activation.
   - Replace top-level `setInterval` with safe polling or alarm handling.

7. **`extension/manifest.json`**:
   - Remove unused `"scripting"` entry from `"permissions"`.

8. **`web/saved-items/src/lib/vocab-store.ts` & `settings-store.ts`**:
   - In `vocab-store.ts`: Fix `mergeUserVocabMap` so merging status mapping from `chrome.storage` preserves existing `glossVi`, `reading`, and metadata rather than setting them to `undefined`.
   - In `vocab-store.ts` & `settings-store.ts`: Add `isPolling` lock flag or `AbortController` to `setInterval` polling callbacks to prevent overlapping async requests.

9. **`web/saved-items/src/components/SavedItemsApp.tsx`**:
   - Adjust sidebar padding so that inside Chrome extension popup mode (`hs-ext-popup`), padding is compact rather than fixed `240px`.

10. **Verification & Testing**:
   - Execute regression test: `cd local-bridge && python test_tokenize_import_enrich.py`
   - Run typecheck/build in `web/saved-items`: `npm run typecheck` or `npm run build:extension` (if node/npm dependencies are present).
   - Verify all tests pass cleanly.

Deliverables:
- Write detailed log of changes and test outputs to `/Users/hoangson/Documents/Translate realtime OCR youtube video/.agents/worker_m2_1/changes.md`.
- Create `/Users/hoangson/Documents/Translate realtime OCR youtube video/.agents/worker_m2_1/handoff.md`.
- Send a message to parent with execution summary and path to handoff.
</USER_REQUEST>
