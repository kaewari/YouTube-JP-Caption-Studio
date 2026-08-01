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

## Cấu trúc thư mục và file chi tiết

### 1. `extension/` (Chrome Extension MV3)
Thư mục chứa mã nguồn của extension (Load unpacked vào Chrome).
- **`manifest.json`**: Cấu hình quyền, background worker, content scripts của extension.
- **`background/service_worker.js`**: Chạy ngầm (bắt request tải caption từ YouTube, gọi API lên `local-bridge`, quản lý IME và đồng bộ storage).
- **`content/content.js`**: Script nhúng trực tiếp vào giao diện YouTube, quản lý lớp phủ (overlay) hiển thị phụ đề và đồng bộ dữ liệu cache.
- **`content/cue_timing.js`**: Quản lý bộ đếm thời gian, đồng bộ phụ đề chạy theo video timeline.
- **`content/normalize_cues.js`**: Làm sạch và chuẩn hóa caption thô lấy từ YouTube (bỏ sound effects, format chuẩn).
- **`injected/page_capture.js`**: Script chạy ở MAIN world, lấy biến player nội bộ của Youtube, chặn và đọc trộm request tải XML/JSON3.
- **`sidepanel/`**: Mã nguồn giao diện side panel để hiển thị danh sách câu, chỉnh sửa (JA/EN/VI) và timeline.
- **`popup/`**: Chứa code tĩnh được build từ Next.js (`web/saved-items`) dùng làm giao diện khi ấn vào biểu tượng extension trên trình duyệt.
- **`shared/`**: Các file tiện ích dùng chung (như `import_parse.js`, `romaji_kana.js`, `vocab_style.js`).

### 2. `local-bridge/` (Backend FastAPI)
Backend chạy local (`127.0.0.1:8765`), dùng để xử lý NLP chuyên sâu và thao tác hệ thống mà extension không làm được.
- **`main.py`**: Điểm vào của server FastAPI, định nghĩa các API routes (tokenize, dict, scripts, ime, extension_state).
- **`tokenize_ja.py`**: Bọc thư viện SudachiPy để phân tích câu tiếng Nhật, cắt từ và tìm cách đọc (Furigana).
- **`dictionary.py`**: Tương tác với SQLite để tra cứu từ điển JMdict (từ Nhật sang Anh/Việt).
- **`vocab_freq.py`**: Phân loại mức độ khó của từ vựng (chấm điểm JLPT dựa trên tần suất).
- **`script_store.py`**: Đọc/ghi cấu trúc dữ liệu script phụ đề của từng video xuống ổ cứng (vào thư mục `scripts/`).
- **`ime_switch.py`**: Điều khiển chuyển đổi bộ gõ IME trên macOS khi người dùng nhập liệu ở side panel.
- **`governor.py`**: Trình quản lý tài nguyên, giới hạn số lượng xử lý đồng thời dựa theo cấu hình RAM/CPU máy tính.
- **`models.py`**: Định nghĩa cấu trúc dữ liệu (Pydantic schemas) cho các API Request/Response.
- **`bootstrap.py`**: Chạy ngầm tải, cài đặt và index cơ sở dữ liệu từ điển ở lần khởi chạy đầu tiên.
- **`cache.py`**: Cài đặt LRU cache để tăng tốc đọc từ điển.
- **`text_utils.py`**: Chứa các hàm tiện ích nhỏ (ví dụ chuyển Katakana thành Hiragana).
- **`start.sh`**: Script tự động tạo virtual environment, cài gói pip và bật uvicorn.
- **`Dockerfile` / `docker-compose.yml`**: Hỗ trợ chạy Bridge biệt lập qua Docker.

### 3. `web/saved-items/` (Giao diện UI React/Next.js)
Dự án Next.js dùng để thiết kế giao diện Popup và mục Cài đặt cho Extension.
- **`src/app/`**, **`src/components/`**, **`src/lib/`**: Mã nguồn giao diện, quản lý danh sách từ vựng lưu trữ, giao tiếp với `chrome.storage.local`.
- Khi gọi lệnh `npm run build:extension`, code Next.js sẽ được đóng gói tĩnh hoàn toàn và xuất sang mục `extension/popup/`.

### 4. `scripts/` (Dữ liệu Output & Công cụ con)
- **`{video_id}/`**: Mỗi video khi chỉnh sửa sẽ được lưu lại thành một thư mục riêng biệt tại đây, chứa các file: `cues.json` (dữ liệu chi tiết), `script.txt` (dạng text dễ đọc) và `meta.json`.
- **`ime-switch/`**: Mã nguồn Swift (`ime_select.swift`) để build chương trình chuyển đổi bộ gõ IME trên macOS.

### 5. Cấp thư mục gốc (Root)
- **`docker-compose.yml`**: Khởi chạy toàn bộ hệ sinh thái (bridge + web) bằng Docker.
- **`.gitignore`**: Chứa danh sách các file tạm, file log, thư mục virtual env cần loại trừ khi đẩy code lên git.
- **`AGENTS.md` / `CLAUDE.md`**: Các rule hoặc hướng dẫn hành vi dành cho AI trợ lý viết code (Cursor, Claude, Gemini).

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
