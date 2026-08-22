# YT Caption — Saved Items

Language Reactor–style **Saved Items** UI for this project's Japanese→Vietnamese caption tool. Lives under `web/saved-items/` (Next.js). The same UI is **built into the Chrome extension popup**.

## Run (localhost)

```bash
cd web/saved-items
npm install          # first time
npm run dev          # http://localhost:3000
```

`local-bridge/start.sh` also auto-starts this on **port 3000** (set `SKIP_SAVED_ITEMS=1` to skip).

## Extension popup (static)

```bash
npm run build:extension   # → extension/popup/popup.html (+ _next/)
```

Then reload the unpacked extension. Toolbar icon opens the Saved Items + Settings UI (`default_popup`).

Popup size ≈ **780×580**. Side panel is unchanged (player pill / autoOpen / `OPEN_SIDE_PANEL`).

## Sync (source of truth)

| Context | Read/write | Live updates |
| --- | --- | --- |
| Extension popup | `chrome.storage.local` `userVocab`, `hardsubSettings` | `chrome.storage.onChanged` |
| Content / side panel / dict marks | same keys | popup listens → re-render |
| localhost:3000 | polls bridge `GET /extension_state` every ~1.5s | SW pushes storage → bridge |

Bridge: `GET|POST http://127.0.0.1:8765/extension_state` (file: `local-bridge/data/extension_state.json`).

## What works

| Feature | Notes |
| --- | --- |
| Sidebar shell | LR dark chrome; brand **YT Caption** |
| Tabs | **Từ đã lưu** active; Từ vựng / Câu đã lưu placeholders |
| Status filters | Đã biết / Học / Đừng học / Đặc biệt |
| Persistence | chrome.storage (popup) or localStorage + bridge (localhost) |
| **Cài đặt** | Same controls as legacy popup; writes `hardsubSettings` |

## Source map

```
src/components/SavedItemsApp.tsx   # shell + saved | settings
src/components/SettingsPanel.tsx   # hardsubSettings UI
src/lib/vocab-store.ts             # userVocab + subscribe
src/lib/settings-store.ts          # hardsubSettings + subscribe
src/lib/chrome-env.ts              # chrome.storage detection
scripts/copy-to-extension.mjs      # static export → extension/popup
```
