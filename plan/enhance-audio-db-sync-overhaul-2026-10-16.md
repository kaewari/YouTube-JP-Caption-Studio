# Kế hoạch Kỹ thuật: Nâng cấp Enhance, Dịch Ngữ cảnh, Database Saved Items, Audio Diff & Đồng bộ Drive mới (Bản Hiệu chỉnh Hậu Review P0)

<!-- date: 2026-10-16 -->
<!-- source: chat:032d51d7-8bc4-4f81-ab8d-edee41aa6f6f · user: Nâng cấp Enhance, bản dịch ngữ cảnh, database saved, audio diff, fix pause, sync drive mới theo ID băm từ URL, đổi màu nút, fix tràn chữ -->

## 1. Mục tiêu và Bối cảnh (Goal Description)

Dự án YouTube JP Caption Studio cần giải quyết triệt để 9 vấn đề lớn được người dùng nêu ra, đã được đội ngũ Teamwork Document Review rà soát độc lập và hoàn thiện khắc phục toàn bộ 16 điểm rủi ro chí mạng (P0):
1. **Bản dịch bị ảo giác & dịch theo lô cắt cụt hội thoại**:
   - Khắc phục lỗi `総理からです` bị dịch thành *"Tôi rất hâm mộ vị Thủ tướng đó"*: Đổi system prompt sang trung thực, tự nhiên, bỏ anime style.
   - Cơ chế **Rolling Context**: Gối đầu 2 câu ngữ cảnh trước, ngắt lô theo ranh giới câu (`。`, `？`, liên từ kết thúc).
2. **Enhance không bị ngắt giữa chừng & Không dính lỗi Priority Inversion**:
   - Sử dụng **Priority Sliding-Window Prefetch**: `PRIORITY_VISIBLE = 30` (cửa sổ xem hiện tại `±30s`), `PRIORITY_AHEAD = 20` (`+60s`), `PRIORITY_BACKGROUND = 10` (dịch đón đầu tối đa `+180s`).
   - Sửa lỗi comparator `queue.sort((a,b) => b.priority - a.priority)` và mở rộng giới hạn clamp tại `gemini_translate.js:405` lên `Math.min(100, Math.max(0, priority))`.
   - Giới hạn tốc độ gọi API $\le 10$ RPM cho hàng đợi ngầm kèm Full-Jitter Exponential Backoff khi gặp HTTP 429 để bảo toàn giới hạn 15 RPM / 1,500 RPD của Gemini Free Tier.
3. **Mục Saved lưu vào Database (SQLite WAL + Trigram FTS5 + IndexedDB)**:
   - `local-bridge`: Khởi tạo SQLite WAL mode (`saved_items.db`) với `PRAGMA busy_timeout = 5000;`. Dùng tokenizer **`trigram`** cho FTS5 để tìm kiếm toàn văn tiếng Nhật viết liền (thay vì `unicode61` bị lỗi không tách được từ tiếng Nhật).
   - Chrome Extension: IndexedDB với cờ tombstone `is_deleted` và timestamp `updated_at` (Last-Write-Wins), ngăn chặn việc câu đã unstar bị khôi phục lại khi online.
4. **Bản Audio đề xuất hiển thị Inline Diff (+xanh / -đỏ)**:
   - Sử dụng `Intl.Segmenter("ja", { granularity: "word" })` tách từ ngữ pháp và tính LCS Diff.
   - Thêm `<ins class="sp-diff-ins">` (xanh lục `+`) và `<del class="sp-diff-del">` (đỏ `-`), khử trùng lặp và escape HTML an toàn.
5. **Tăng tốc nghe Audio (Dual Recorder 8s + Gối đầu 1.5s + Async Whisper)**:
   - Chuyển sang cơ chế Dual Recorder hoặc Buffer tap để triệt tiêu độ trễ trôi đồng hồ (audio clock drift).
   - Gọi `mlx_whisper.transcribe` qua `asyncio.to_thread` trong FastAPI để không làm nghẽn (starve) event loop chính.
   - Sửa điều kiện `matched.length === 1` tại `content.js:1143` thành so khớp theo timestamp IoU để không bỏ sót các segment ASR trải dài qua nhiều cue.
   - Gọi `audioCtx.resume()` trong offscreen document tránh bị chính sách Autoplay của Chrome tắt tiếng tab video.
6. **Sửa dứt điểm lỗi dừng video mất bản dịch (Ảnh 2)**:
   - Sửa hàm quét URL `content.js:1287-1292`: Khi video pause/seek, việc thay đổi tham số `&t=` trên URL không được kích hoạt `onNavigate()` và không xóa `cues = []`.
   - Bảo toàn trạng thái cue trên DOM và gia hạn grace period hiển thị subtitle.
7. **Đồng bộ Google Drive theo ID băm từ URL (Atomic Single-File GET/PATCH)**:
   - Thêm `https://accounts.google.com/o/oauth2/revoke` vào `manifest.json:host_permissions`.
   - Chuẩn hóa URL video (bỏ `&t=`, `&si=`, `utm_*`, xử lý Shorts/Embed/youtu.be) rồi băm thành 1 ID duy nhất `{id}`.
   - Tự động tìm/tạo thư mục `"YouTube JP Caption Studio"` trên Drive mới; lưu mỗi video thành 1 file `{id}.json` atomic (GET để tải, PATCH/POST để lưu).
   - Trong `service_worker.js`: Chỉ xóa `_pendingMirror` sau khi upload Drive thành công; dùng `chrome.alarms` giữ Service Worker sống qua chu kỳ 30s idle.
8. **Đổi màu nút chế độ (Original/Enhanced/Audio)**:
   - Đồng bộ thuộc tính DOM `btn.dataset.mode = captionMode` trong `sidepanel.js` để bộ chọn CSS `#sp-caption-mode[data-mode]` có hiệu lực.
   - Original: Tối trung tính `#1e1e2d`.
   - Enhanced: Xanh lá ngọc `#10b981`.
   - Audio: Xanh dương điện `#0284c7`.
9. **Khắc phục tràn khung hiển thị câu dài (Ảnh 1)**:
   - Popover xem câu: Thêm `max-height: 280px; overflow-y: auto; pointer-events: auto;`.
   - Cơ chế Hover Transit Bridge: Thêm timer debounce 180ms khi di chuột từ nút Play sang Popover để người dùng cuộn xem được toàn bộ câu mà không bị đóng mất.
   - Tạm ẩn thuộc tính `title="Phát câu này trên video"` khi popover mở để tránh tooltip trình duyệt đè lên câu tiếng Nhật.

```mermaid
flowchart TD
    subgraph ChromeExtension ["Chrome Extension (MV3)"]
        UI["Sidepanel UI & Cues List"]
        Queue["Priority Sliding-Window Queue (Visible=30, Ahead=20, Bg=10 <= 10 RPM)"]
        IDB[("IndexedDB (Tombstones + Last-Write-Wins)")]
        AudioCap["Dual Audio Recorder (8s slices + 1.5s overlap)"]
        URLHasher["Canonical URL Normalizer -> {id}"]
        SWKeepAlive["SW Alarm Keep-Alive on Pending Mirror"]
    end

    subgraph GeminiAPI ["Gemini AI API"]
        GenAI["gemini-3.8-flash (Faithful Prompt + Bounded Rolling Context)"]
    end

    subgraph LocalBridge ["Local Bridge (Python / Apple Silicon Metal)"]
        WhisperAsync["Async MLX Whisper (asyncio.to_thread + Metal Lock)"]
        DiffEngine["Japanese Intl.Segmenter LCS Diff"]
        SQLite[("SQLite: saved_items.db (WAL mode + Trigram FTS5)")]
    end

    subgraph GoogleDrive ["Google Drive (New Gmail)"]
        DriveFolder["App Folder: 'YouTube JP Caption Studio'"]
        DriveFile["Atomic: '{id}.json' (GET to fetch / PATCH to save)"]
        DriveFolder --> DriveFile
    end

    UI --> Queue
    Queue -->|Lô 25-30 câu + 2 câu ngữ cảnh trước| GenAI
    AudioCap -->|Audio slice 8s| WhisperAsync
    WhisperAsync --> DiffEngine
    DiffEngine -->|Inline Diff (+xanh / -đỏ)| UI
    UI <--> IDB
    IDB <-->|Hai chiều khi Bridge mở| SQLite
    URLHasher -->|Generate {id}| DriveFile
    Queue -->|Save: PATCH / Load: GET| DriveFile
    SWKeepAlive --> DriveFile
```

---

## 2. Kế hoạch Kiểm thử & Xác minh Toàn diện (Chống Test Giả mạo)

Theo tôn chỉ kỹ thuật của dự án (`codex AGENTS.md §2`, `user_global §4`), mọi bài test phải là **kiểm thử hành vi runtime thực tế**, tuyệt đối không viết test đọc file chuỗi tĩnh (`fs.readFileSync`).

### Pha 1: Kiểm thử Backend & Database (`local-bridge`)
Chạy bằng `pytest`:
```bash
# 1. Kiểm tra SQLite WAL mode, trigram FTS5 tiếng Nhật và delta sync tombstone
python -m pytest -q local-bridge/tests/test_saved_items_db.py

# 2. Kiểm tra suy luận ASR bất đồng bộ (asyncio.to_thread), RMS silence gating và Metal lock
python -m pytest -q local-bridge/tests/test_asr_api.py
```

### Pha 2: Kiểm thử Thuật toán Extension (`node / mocha`)
Chạy bằng `node`:
```bash
# 1. Kiểm tra hợp đồng dịch Gemini, thứ tự ưu tiên (Visible=30 > Background=10), và exponential backoff 429
node extension/shared/gemini_translate_test.js

# 2. Kiểm tra chuẩn hóa canonical URL cho YouTube (shorts/watch/youtu.be) và các trang khác
node extension/shared/url_canonical_test.js

# 3. Kiểm tra Japanese Intl.Segmenter LCS diff và chống XSS
node extension/shared/japanese_diff_test.js
```

### Pha 3: Kiểm thử Runtime DOM & UI (Headless Browser)
```bash
node tests/unit/test_player_ui_runtime.js
```
- Xác minh `video.paused = true` không làm mất hoặc trắng subtitle trên thanh overlay và Sidepanel.
- Xác minh nút `#sp-caption-mode` có `data-mode="enhanced"` và đổi màu chuẩn xác.
- Xác minh Popover Play có `max-height <= 280px`, cuộn được khi hover chuột (`pointer-events: auto`) và khôi phục `title` khi đóng.

### Pha 4: Kiểm tra Git Diff Integrity
```bash
git diff --check
```
Đạt exit code 0, không có lỗi thụt lề, không còn tàn dư debug stubs.
