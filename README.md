# YouTube Caption (furigana + import EN/VI)

Chrome extension kiểu Language Reactor cho phụ đề YouTube: load timedtext JA,
overlay + side panel, furigana (Sudachi), từ điển JMdict, import/sửa EN–VI tay.

**Không** OCR. **Không** dịch máy (NLLB / Opus / Gemini).

Extension MV3 `0.9.7` · Bridge FastAPI tại `127.0.0.1:8765` · Saved Items Next.js
(dev `:3000` hoặc static popup).

## Kiến trúc

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

| Thành phần | Vai trò |
| --- | --- |
| `extension/` | Chrome MV3 — Load unpacked |
| `local-bridge/` | FastAPI: Sudachi, JMdict, persist script, IME |
| `web/saved-items/` | Saved Items + Settings (dev + `build:extension`) |
| `scripts/` | Script đã lưu theo `video_id` |
| `.cursor/skills/` | Agent skills cho project |

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

Lần đầu: tạo venv + Sudachi; `POST /bootstrap` index JMdict EN (+ tải/index JMdict VI nếu thiếu).

```bash
curl -s http://127.0.0.1:8765/health
# models_loaded.sudachi / dict / freq
```

Dict popup: EN từ JMdict, VI từ `jmdict_vi.json` (Yomitan dreamofi) + seed `ja_vi.json` — hiện song song, không MT.
### 2. Extension

1. `chrome://extensions` → Developer mode
2. **Load unpacked** → thư mục `extension/`
3. Mở YouTube video có caption Nhật
4. Icon toolbar → popup Saved Items / Cài đặt
5. Side panel: pill trên player, `autoOpen`, hoặc mở panel từ extension

Sau khi sửa Saved Items UI:

```bash
cd web/saved-items && npm run build:extension
# → extension/popup/  rồi Reload extension
```

### 3. Regression

```bash
cd local-bridge && source .venv/bin/activate
python test_tokenize_import_enrich.py   # bridge phải đang chạy
```

## Luồng caption

1. **Load** (YSD-style cascade):
   - Page intercept `/api/timedtext` (bật CC trên player)
   - Service worker: `baseUrl` → scrape `ytInitialPlayerResponse` → ANDROID Innertube
   - Fetch URL **raw trước**, parse XML `<text>`/`<p>` hoặc json3
2. **Normalize** (`normalize_cues.js`): strip SFX; **giữ** start/end YouTube
3. **Merge** `chrome.storage.local` (`transcript:${videoId}`) + disk `scripts/{videoId}/`
4. **Overlay** active cue theo `media_time` từ page script
5. EN/VI chỉ từ **Import** hoặc **sửa tay** — không auto-MT

**Ownership:** JA/timeline đã edit thắng YouTube re-merge. Cue đã xóa bị
**tombstone** theo `video_id` (Reload không hồi sinh). Không ghi đè script đã
edit bằng merge YT nghèo hơn.

## Side panel — chỉnh script

Commit **chỉ khi Enter** (Blur / Escape hủy draft):

| Trường | Enter | Blur / Escape |
| --- | --- | --- |
| **JA** | commit + re-tokenize (`/tokenize_batch`); **giữ EN/VI** | discard |
| **EN** | commit + lock `user` | discard |
| **VI** | commit + lock `user` | discard |
| **Timeline** | commit times | blur cũng commit |

- Focus JA → `<textarea lang="ja-JP">` + IME (`POST /ime/switch`) / romaji→kana fallback
- Import merge/replace → EN/VI lock `import` → enrich tokens
- **Xóa dịch**: xóa EN/VI/tokens (JA giữ)
- **Xóa sub đã lưu**: wipe cache + disk rồi tải lại từ YouTube

## Saved Items (popup)

- Source: `web/saved-items/` → static `extension/popup/popup.html`
- Source of truth: `chrome.storage.local` (`userVocab`, `hardsubSettings`)
- localhost:3000 poll `GET /extension_state` (~1.5s); SW push storage → bridge
- Tabs: **Từ đã lưu** (active); Từ vựng / Câu đã lưu = placeholder
- **Cài đặt** ghi cùng `hardsubSettings` như content/side panel

Chi tiết UI: [`web/saved-items/README.md`](web/saved-items/README.md).

## API bridge (`127.0.0.1:8765`)

| Endpoint | Mô tả |
| --- | --- |
| `GET /health` | ready, `models_loaded` (sudachi/dict/freq; mt/ocr luôn false), caps |
| `POST /bootstrap` | JMdict + Sudachi + freq |
| `POST /tokenize` | `{ text }` → tokens (reading, freq_rank, pos, jlpt) |
| `POST /tokenize_batch` | `{ cues: [{id, text}] }` |
| `POST /dict` | `{ surface, lemma? }` — EN từ JMdict; VI từ `jmdict_vi.json` (+ seed `ja_vi.json`) |
| `POST /scripts/save` | persist → `scripts/{videoId}/` |
| `GET/DELETE /scripts/{video_id}` | load / wipe |
| `POST /ime/switch` | `{ to: "ja"\|"abc"\|"restore" }` (+ `/ime/ja`, `/ime/abc`, `/ime/status`) |
| `GET/POST /extension_state` | mirror `userVocab` + `hardsubSettings` |
| `GET /vocab/bands` | band từ vựng + preview tokens |

## Persistence

| Nơi | Nội dung |
| --- | --- |
| `chrome.storage.local` | `transcript:${id}`, `transcriptMeta:${id}`, settings, vocab |
| `scripts/{videoId}/cues.json` | cue đầy đủ (JA/EN/VI/tokens/locks) |
| `scripts/{videoId}/script.txt` | export đọc được |
| `scripts/{videoId}/meta.json` | counts + title/url |
| `local-bridge/data/extension_state.json` | mirror settings cho localhost |
| `local-bridge/data/dict/jmdict_vi.json` | index JA→VI (Yomitan dreamofi; bootstrap tải zip) |

Cache match: `start_media_time` ±0.35s + source. Debounce save ~400ms.

## Path chính

| Path | Vai trò |
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

## Giới hạn

- Chrome **browser_action popup** có thể clamp ~800×600 dù CSS `width: 100%`
- IME macOS cần bridge + `bin/ime-select`; offline → chỉ `lang=ja-JP` + romaji fallback
- Repo workspace thường **không** có `.git` ở root; `script.txt` dùng `# ---…`
  (không còn dòng chỉ toàn `=`) để IDE không báo conflict giả
- Không còn queue “Dịch lại” / auto-MT

## macOS IME

Bridge chạy → side panel đổi Input Source qua `POST /ime/switch`.
`start.sh` build `scripts/ime-switch/ime_select.swift` → `local-bridge/bin/ime-select`.
