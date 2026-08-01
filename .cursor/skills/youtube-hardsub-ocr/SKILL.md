---
name: youtube-hardsub-ocr
description: >-
  Architects and edits the YouTube caption extension and local bridge.
  Use when working on timedtext LOAD_CAPTIONS, cue normalize, import EN/VI,
  dual captions, furigana panel, Language Reactor-style UI, media_time, or cache merge.
---

# YouTube Caption (no MT / OCR)

## Architecture

- Extension (`extension/`) loads captions with a YSD-style cascade:
  1) page intercept of `/api/timedtext` (enable player CC → capture URL/body)
  2) service worker: page `baseUrl` → scrape watch HTML `ytInitialPlayerResponse`
     → ANDROID Innertube; fetch URL **raw first**, parse XML `<text>`/`<p>` or json3
  Overlay uses `media_time` from `injected/page_capture.js`.
- Content script (`content/normalize_cues.js` + `content/content.js`) normalizes
  cues (drop/strip SFX in place; **keep YouTube start/end**), merges
  `chrome.storage.local` cache (`transcript:${videoId}`) **plus** disk script
  (`scripts/{videoId}/` via bridge), overlays the active cue by `media_time`.
  **No machine translation** — EN/VI come from **Import** or manual edit.
  JA Enter → commit JA + `POST /tokenize_batch` (furigana/JLPT only).
- **Script ownership:** hand-edited timeline/JA wins over YouTube re-merge.
  Deleted cues are **tombstoned** per `video_id` so Reload does not resurrect
  them. Never save a poorer YT merge over a richer edited script.
- Local bridge (`local-bridge/`, `127.0.0.1:8765`): Sudachi furigana, JMdict
  lookup, script store. **No** NLLB/Opus/Gemini/OCR.
  Auto-persists cues: `POST /scripts/save` → `scripts/{videoId}/script.txt`
  + `cues.json`; `GET /scripts/{video_id}` restores on reload.

## API contract

- `GET /health` → ready, `models_loaded` (sudachi/dict/freq; mt/ocr always false),
  caps, pressure, latency_p50_ms, bootstrap
- `POST /tokenize` `{ text }` → `{ source, tokens }` (reading, freq_rank, pos, jlpt)
- `POST /tokenize_batch` `{ cues: [{id, text}] }` → `{ results: [{id, source, tokens}] }`
- `POST /dict` `{surface, lemma?}` → dictionary senses; longest-match + variants
  (VI from Yomitan `jmdict_vi.json` + curated `ja_vi.json` — no EN→VI MT)
- `POST /scripts/save` / `GET|DELETE /scripts/{video_id}`
- `POST /ime/switch` `{ to: "ja"|"abc"|"restore" }` + `/ime/ja`, `/ime/abc`, `/ime/status`
- `POST /bootstrap` — JMdict + Sudachi + freq (no CT2 models)

## Caption rules

- Prefer JA (manual over ASR) track; load **full** cue list once per video
- Normalize once after load, **before** cache merge (SFX strip; YouTube times kept)
- Timeline is **YouTube timedtext** (or import / manual edit) — no CPS/text-length retime
- **Enter-only commit** (JA / EN / VI):

  | | Enter | Blur / Escape |
  | --- | --- | --- |
  | **JA** | commit + `/tokenize_batch` (keep EN/VI) | discard draft |
  | **EN** | commit + lock (`user`) | discard draft |
  | **VI** | commit + lock (`user`) | discard draft |

- Focus JA → `<textarea lang="ja-JP">` + IME via bridge `POST /ime/switch` /
  romaji→hiragana fallback (`shared/romaji_kana.js`)
- Cache merge by `start_media_time` (±0.35s) + source; edited fields beat YT
- Side panel **Import** → merge/replace; EN/VI lock `import`; then
  `enrichTokensAfterImport` → `/tokenize_batch`
- Side panel **Xóa dịch** clears EN/VI/tokens (JA kept)
- **No** Dịch lại / auto-MT queue

## UI rules

- Side Panel: cue list, import/export, JA/EN/VI edit, furigana + JLPT colors
- Toolbar popup = Saved Items static build (`npm run build:extension`)
- Overlay on video; player pill opens side panel
- Dict hover via `POST /dict`; level colors via `HardsubVocab.applyHighlightVars`

## Key paths

- Bridge: `local-bridge/main.py`, `tokenize_ja.py`, `dictionary.py`, `script_store.py`
- Extension engine: `extension/content/content.js`
- Side panel: `extension/sidepanel/`
- Shared vocab CSS: `extension/shared/vocab_style.js`
- Regression: `.cursor/skills/hardsub-ocr-regression` (`test_tokenize_import_enrich.py`)
