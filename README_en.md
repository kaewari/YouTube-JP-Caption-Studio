# YouTube Caption (furigana + import EN/VI)

Language Reactor-style Chrome extension for YouTube captions: loads timedtext JA, provides an overlay + side panel, furigana (Sudachi), JMdict dictionary lookup, and manual EN–VI import/editing.

**No** OCR. **No** machine translation (NLLB / Opus / Gemini).

Extension MV3 `0.9.7` · Bridge FastAPI at `127.0.0.1:8765` · Saved Items Next.js (dev `:3000` or static popup).

## Architecture

```
YouTube watch page
  ├─ injected/page_capture.js   (MAIN world: media_time, timedtext intercept)
  ├─ content/content.js         (overlay, cache merge, SP_CMD)
  └─ sidepanel/                 (cue list, JA/EN/VI edit, import/export)
        │
        ▼
background/service_worker.js    (YT_LOAD_CAPTIONS, BRIDGE_FETCH, IME, storage→bridge)
        │
        ▼
local-bridge :8765              (tokenize, dict, scripts/, ime, extension_state)
        │
        ▼
scripts/{videoId}/              (cues.json + script.txt + meta.json)
web/saved-items/                (popup UI: vocab + settings)
```

## Detailed Folder and File Structure

### 1. `extension/` (Chrome Extension MV3)
Directory containing the extension source code (Load unpacked into Chrome).
- **`manifest.json`**: Extension permissions, background worker, and content scripts configuration.
- **`background/service_worker.js`**: Background script (intercepts YouTube caption requests, calls `local-bridge` APIs, manages IME and storage sync).
- **`content/content.js`**: Script injected directly into the YouTube interface, manages the caption overlay and cache syncing.
- **`content/cue_timing.js`**: Manages the timer and synchronizes subtitle display with the video timeline.
- **`content/normalize_cues.js`**: Cleans and standardizes raw captions from YouTube (removes sound effects, standardizes formats).
- **`injected/page_capture.js`**: Script running in the MAIN world to access internal YouTube player variables, intercepting XML/JSON3 requests.
- **`sidepanel/`**: Source code for the side panel UI to display the cue list, edit (JA/EN/VI), and timeline.
- **`popup/`**: Contains the static code built from Next.js (`web/saved-items`) used as the UI when clicking the extension icon.
- **`shared/`**: Shared utility files (e.g., `import_parse.js`, `romaji_kana.js`, `vocab_style.js`).

### 2. `local-bridge/` (FastAPI Backend)
Backend running locally (`127.0.0.1:8765`), used for intensive NLP processing and system operations that the extension cannot handle.
- **`main.py`**: Entry point for the FastAPI server, defines API routes (tokenize, dict, scripts, ime, extension_state).
- **`tokenize_ja.py`**: Wraps the SudachiPy library for Japanese sentence analysis, word segmentation, and reading extraction (Furigana).
- **`dictionary.py`**: Interacts with SQLite to look up JMdict (Japanese to English/Vietnamese).
- **`vocab_freq.py`**: Classifies vocabulary difficulty (JLPT grading based on frequency).
- **`script_store.py`**: Reads/writes the caption script data structure of each video to disk (into the `scripts/` folder).
- **`ime_switch.py`**: Controls macOS IME switching when the user inputs in the side panel.
- **`governor.py`**: Resource manager, limits concurrent processing based on machine RAM/CPU configuration.
- **`models.py`**: Defines data structures (Pydantic schemas) for API Requests/Responses.
- **`bootstrap.py`**: Background script to download, install, and index the dictionary database on the first run.
- **`cache.py`**: Implements LRU cache to speed up dictionary lookups.
- **`text_utils.py`**: Small utility functions (e.g., converting Katakana to Hiragana).
- **`start.sh`**: Script to automatically create a virtual environment, install pip packages, and start uvicorn.
- **`Dockerfile` / `docker-compose.yml`**: Supports running the Bridge in isolation via Docker.

### 3. `web/saved-items/` (React/Next.js UI)
Next.js project used to design the Popup UI and Settings for the Extension.
- **`src/app/`**, **`src/components/`**, **`src/lib/`**: UI source code, manages the saved vocabulary list, communicates with `chrome.storage.local`.
- Running `npm run build:extension` fully statically builds the Next.js code and exports it to `extension/popup/`.

### 4. `scripts/` (Output Data & Sub-tools)
- **`{video_id}/`**: Each edited video is saved as a separate directory here, containing: `cues.json` (detailed data), `script.txt` (readable text format), and `meta.json`.
- **`ime-switch/`**: Swift source code (`ime_select.swift`) to build the macOS IME switcher program.

### 5. Root Directory
- **`docker-compose.yml`**: Launches the entire ecosystem (bridge + web) using Docker.
- **`.gitignore`**: Excludes temp files, logs, and virtual env directories from git.
- **`AGENTS.md` / `CLAUDE.md`**: Rules or behavioral guidelines for AI coding assistants (Cursor, Claude, Gemini).

## Quickstart

### 1. Bridge

```bash
cd local-bridge
./start.sh
```

| Service | URL |
| --- | --- |
| Bridge | `http://127.0.0.1:8765` |
| Saved Items (Next) | `http://127.0.0.1:3000` |

Skip UI: `SKIP_SAVED_ITEMS=1 ./start.sh`.

First time: creates venv + Sudachi; `POST /bootstrap` indexes JMdict EN (+ downloads/indexes JMdict VI if missing).

```bash
curl -s http://127.0.0.1:8765/health
# models_loaded.sudachi / dict / freq
```

Dict popup: EN from JMdict, VI from `jmdict_vi.json` (Yomitan dreamofi) + seed `ja_vi.json` — displayed side-by-side, no MT.

### 2. Extension

1. `chrome://extensions` → Developer mode
2. **Load unpacked** → select the `extension/` directory
3. Open a YouTube video with Japanese captions
4. Toolbar icon → Saved Items / Settings popup
5. Side panel: pill on player, `autoOpen`, or open panel from the extension

After modifying Saved Items UI:

```bash
cd web/saved-items && npm run build:extension
# → extension/popup/  then Reload extension
```

### 3. Regression

```bash
cd local-bridge && source .venv/bin/activate
python test_tokenize_import_enrich.py   # bridge must be running
```

## Caption Flow

1. **Load** (YSD-style cascade):
   - Page intercept `/api/timedtext` (turns on CC on player)
   - Service worker: `baseUrl` → scrape `ytInitialPlayerResponse` → ANDROID Innertube
   - Fetch URL **raw first**, parse XML `<text>`/`<p>` or json3
2. **Normalize** (`normalize_cues.js`): strip SFX; **keep** YouTube start/end
3. **Merge** `chrome.storage.local` (`transcript:${videoId}`) + disk `scripts/{videoId}/`
4. **Overlay** active cue based on `media_time` from page script
5. EN/VI strictly from **Import** or **manual edit** — no auto-MT

**Ownership:** Edited JA/timeline wins against YouTube re-merge. Deleted cues are **tombstoned** by `video_id` (Reload does not revive). Richer edited scripts are not overwritten by poorer YT merges.

## Side panel — edit script

Commits **only on Enter** (Blur / Escape cancels draft):

| Field | Enter | Blur / Escape |
| --- | --- | --- |
| **JA** | commit + re-tokenize (`/tokenize_batch`); **keeps EN/VI** | discard |
| **EN** | commit + lock `user` | discard |
| **VI** | commit + lock `user` | discard |
| **Timeline** | commit times | blur also commits |

- Focus JA → `<textarea lang="ja-JP">` + IME (`POST /ime/switch`) / romaji→kana fallback
- Import merge/replace → EN/VI lock `import` → enrich tokens
- **Clear translation**: clears EN/VI/tokens (JA kept)
- **Clear saved sub**: wipes cache + disk then reloads from YouTube

## Saved Items (popup)

- Source: `web/saved-items/` → static `extension/popup/popup.html`
- Source of truth: `chrome.storage.local` (`userVocab`, `hardsubSettings`)
- localhost:3000 polls `GET /extension_state` (~1.5s); SW pushes storage → bridge
- Tabs: **Saved Words** (active); Vocab / Saved Sentences = placeholder
- **Settings** writes to the same `hardsubSettings` as content/side panel

UI details: [`web/saved-items/README.md`](web/saved-items/README.md).

## API bridge (`127.0.0.1:8765`)

| Endpoint | Description |
| --- | --- |
| `GET /health` | ready, `models_loaded` (sudachi/dict/freq; mt/ocr always false), caps |
| `POST /bootstrap` | JMdict + Sudachi + freq |
| `POST /tokenize` | `{ text }` → tokens (reading, freq_rank, pos, jlpt) |
| `POST /tokenize_batch` | `{ cues: [{id, text}] }` |
| `POST /dict` | `{ surface, lemma? }` — EN from JMdict; VI from `jmdict_vi.json` (+ seed `ja_vi.json`) |
| `POST /scripts/save` | persist → `scripts/{videoId}/` |
| `GET/DELETE /scripts/{video_id}` | load / wipe |
| `POST /ime/switch` | `{ to: "ja"\|"abc"\|"restore" }` (+ `/ime/ja`, `/ime/abc`, `/ime/status`) |
| `GET/POST /extension_state` | mirrors `userVocab` + `hardsubSettings` |
| `GET /vocab/bands` | vocab bands + preview tokens |

## Persistence

| Location | Content |
| --- | --- |
| `chrome.storage.local` | `transcript:${id}`, `transcriptMeta:${id}`, settings, vocab |
| `scripts/{videoId}/cues.json` | full cues (JA/EN/VI/tokens/locks) |
| `scripts/{videoId}/script.txt` | readable export |
| `scripts/{videoId}/meta.json` | counts + title/url |
| `local-bridge/data/extension_state.json` | mirror settings for localhost |
| `local-bridge/data/dict/jmdict_vi.json` | JA→VI index (Yomitan dreamofi; bootstrap downloads zip) |

Cache match: `start_media_time` ±0.35s + source. Debounce save ~400ms.

## Main Paths

| Path | Role |
| --- | --- |
| `extension/content/content.js` | Engine overlay + SP_CMD + merge |
| `extension/sidepanel/` | UI cue list |
| `extension/background/service_worker.js` | Captions fetch, bridge proxy, IME |
| `extension/shared/vocab_style.js` | JLPT / vocab CSS classes |
| `local-bridge/main.py` | FastAPI routes |
| `local-bridge/tokenize_ja.py` | Sudachi |
| `local-bridge/dictionary.py` | JMdict |
| `local-bridge/script_store.py` | Disk scripts |
| `.cursor/skills/youtube-hardsub-ocr` | Architecture skill |
| `.cursor/skills/local-bridge-dev` | Bridge start/debug |
| `.cursor/skills/hardsub-ocr-regression` | Tokenize/import regression |

## Limitations

- Chrome **browser_action popup** can be clamped to ~800×600 despite CSS `width: 100%`
- macOS IME requires bridge + `bin/ime-select`; offline → only `lang=ja-JP` + romaji fallback
- Workspace repos usually **lack** a `.git` at root; `script.txt` uses `# ---…` (no longer a line of purely `=`) to prevent false IDE conflict warnings
- No "Retranslate" queue / auto-MT

## macOS IME

Bridge running → side panel switches Input Source via `POST /ime/switch`.
`start.sh` builds `scripts/ime-switch/ime_select.swift` → `local-bridge/bin/ime-select`.
