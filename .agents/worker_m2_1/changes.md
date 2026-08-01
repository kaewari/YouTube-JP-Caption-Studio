# Detailed Log of Changes and Test Outputs — Worker M2-1

## Summary of Changes

### 1. `local-bridge/main.py`
- Changed `CORSMiddleware` `allow_origins=["*"]` to strict origin regex validation:
  `allow_origin_regex=r"^chrome-extension://.*|^http://(localhost|127\.0\.0\.1)(:\d+)?$"` with `allow_credentials=True`.

### 2. `local-bridge/bootstrap.py`
- Updated JMdict archive download URL from `http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz` to secure HTTPS `https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz`.

### 3. `local-bridge/text_utils.py` (New), `tokenize_ja.py`, `dictionary.py`, `vocab_freq.py`
- Created `local-bridge/text_utils.py` with shared `_kata_to_hira()` Katakana to Hiragana conversion helper function (`kata_to_hira`).
- Imported `_kata_to_hira` across `tokenize_ja.py`, `dictionary.py`, and `vocab_freq.py`, removing duplicate inline implementations.
- Refactored `tokenize_ja.py` to use native Sudachi morpheme character offsets `m.begin()` and `m.end()` instead of string `.find()`.
- Pre-compiled regex in `dictionary.py`: `RE_KANJI_KANA = re.compile(r"^([\u3400-\u9fff]+)([\u3040-\u309f]+)$")` and updated `_stem_variants` to use `RE_KANJI_KANA.match(t)`.

### 4. `local-bridge/script_store.py`
- Refactored `save_script` to use atomic file replacement: `_atomic_write_text(path, content)` writes content to a `.tmp` file first and replaces the target file via `Path.replace()`.

### 5. `extension/content/content.js`
- Ensured XSS sanitization of dictionary gloss HTML interpolation in `primaryGlossLine()` by applying `escapeHtml(g)` on each gloss entry.
- Added single-instance boolean guard `_listenersAttached` to `ensureVideoLayoutSync()` to avoid accumulating `resize` and `fullscreenchange` event listeners.
- Optimized `publishSidePanelState()` to omit `cues` array serialization on playhead time ticks when `listDirty` is false.

### 6. `extension/background/service_worker.js`
- Added state persistence helpers `loadSwState()` and `saveSwState()` using `chrome.storage.session` / `chrome.storage.local` to restore `_lastBridgeUpdatedAt` and `_lastPushedJson` upon service worker startup/re-activation.
- Replaced top-level `setInterval` with Chrome Alarms API (`chrome.alarms.create("poll_bridge_state", { periodInMinutes: 1 })` and `chrome.alarms.onAlarm.addListener`).

### 7. `extension/manifest.json`
- Removed unused `"scripting"` entry from `"permissions"`.

### 8. `web/saved-items/src/lib/vocab-store.ts` & `settings-store.ts`
- In `vocab-store.ts`: Updated `mergeUserVocabMap` so merging status mapping from `chrome.storage` checks `MOCK_SAVED_WORDS` and `prev` in `byLemma` map to preserve existing `glossVi`, `glossEn`, `reading`, and metadata rather than setting them to `undefined`.
- In `vocab-store.ts` & `settings-store.ts`: Added `isPolling` lock flag inside `subscribeVocab` and `subscribeSettings` interval callbacks to prevent overlapping async requests.

### 9. `web/saved-items/src/components/SavedItemsApp.tsx`
- Set `collapsed` to `true` by default when inside extension popup mode (`hs-ext-popup`).
- Adjusted sidebar padding dynamically: `paddingLeft: collapsed ? (isExt ? 52 : 64) : (isExt ? 160 : 240)` to keep popup mode compact.

---

## Verification & Test Outputs

### 1. Python Regression Test (`local-bridge/test_tokenize_import_enrich.py`)
```
Command: cd local-bridge && python3 test_tokenize_import_enrich.py
Result: SUCCESS (Exit Code 0)
Output:
PASS: import enrich → tokens with reading+jlpt/freq; EN/VI locked unchanged
  imp1: 4 toks e.g. 日本語(にほんご) jlpt=None freq=None
  imp2: 5 toks e.g. 今日(きょう) jlpt=n5 freq=76
```

### 2. TypeScript Type Check (`web/saved-items/npm run typecheck`)
```
Command: cd web/saved-items && npm run typecheck
Result: SUCCESS (Exit Code 0)
Output:
> yt-caption-saved-items@0.3.2 typecheck
> tsc --noEmit
```

### 3. Web Extension Build (`web/saved-items/npm run build:extension`)
```
Command: cd web/saved-items && npm run build:extension
Result: SUCCESS (Exit Code 0)
Output:
> yt-caption-saved-items@0.3.2 build:extension
> EXTENSION_BUILD=1 next build && node scripts/copy-to-extension.mjs

▲ Next.js 16.2.1 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 1841ms
  Running TypeScript ...
  Finished TypeScript in 1180ms ...
  Collecting page data using 5 workers ...
  Generating static pages using 5 workers (4/4) in 209ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found

Copied static Saved Items → /Users/hoangson/Documents/Translate realtime OCR youtube video/extension/popup (popup.html + index.html)
```
