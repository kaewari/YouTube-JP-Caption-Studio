<!-- date: 2026-08-23 -->
<!-- source: chat:user-request · user: đọc toàn bộ sourcecode và review bug/tối ưu -->

# Báo cáo review toàn bộ codebase — 2026-08-23

Phạm vi audit: `extension/`, `local-bridge/`, `ipad-app/`, `iphone-app/`, `web/saved-items/`, `scripts/`, `tools/`, `wiki/`.
Tất cả finding được kiểm tra trực tiếp trên live code (disk).

---

## 1. Chrome Extension (`extension/`)

### High
- **H1. Duplication parse Timedtext / decodeEntities:**
  - `extension/content/content.js:254-285` và `extension/background/service_worker.js:1480-1550` duplicate logic XML/JSON3 parsing và HTML entity decoding.
  - *Rủi ro:* Sửa parser ở content script nhưng background worker không update dẫn đến lệch format khi tải caption nền.
  - *Fix:* Gom vào `extension/shared/timedtext_parse.js` (UMD pattern), import chung.

- **H2. Bridge fetch body & rate limiting:**
  - `extension/background/service_worker.js:421-460`: `BRIDGE_FETCH` nhận raw body tuỳ ý, chưa có giới hạn payload size hay per-tab rate limiter.
  - *Rủi ro:* Tab độc hại hoặc loop request làm nghẽn bridge.
  - *Fix:* Giới hạn payload size ≤ 256 KB, per-tab rate limit 50 req/s.

### Medium
- **M1. Side panel health check & get_state spam:**
  - `extension/sidepanel/sidepanel.js:80-120`: Gọi `/health` liên tục khi panel focus mà không cache.
  - *Fix:* Cache `/health` ≤ 5s, throttle `get_state` 200ms.

- **M2. Storage cleanup & memory leak guard:**
  - `extension/background/service_worker.js`: Tab disconnect/close không dọn state tạm của tab trong in-memory map.
  - *Fix:* Lắng nghe `chrome.tabs.onRemoved` để giải phóng tab-specific cache.

---

## 2. Local Bridge (`local-bridge/`)

### High
- **H3. Atomic write cho `script_store.save_script`:**
  - `local-bridge/app/services/script_store.py:315-446`: Ghi 4 file tuần tự trực tiếp vào thư mục đích.
  - *Rủi ro:* Tiến trình bị crash giữa chừng tạo ra trạng thái nửa vời (inconsistent transcript files).
  - *Fix:* Ghi vào temporary file trong cùng filesystem rồi `os.replace` (atomic rename).

- **H4. Bootstrap download handling:**
  - `local-bridge/app/scripts/bootstrap.py:65-120`: Tải asset `.gz` trực tiếp vào file đích.
  - *Rủi ro:* Mất mạng / ngắt tiến trình để lại file nén hỏng.
  - *Fix:* `tempfile.NamedTemporaryFile` + `shutil.move` sau khi verify hash/kích thước.

### Medium
- **M3. Monolithic `app/main.py`:**
  - `local-bridge/app/main.py` ~524 LOC chứa mọi routes và logic bootstrap.
  - *Fix:* Tách router modules (`routers/tokenize.py`, `routers/scripts.py`, `routers/dict.py`, `routers/state.py`, `routers/ime.py`) mount vào main app. Giữ nguyên 100% path & payload shape.

- **M4. Cache hit ratio & metrics:**
  - `/health` endpoint thiếu metric trực quan về cache efficiency và governor load.
  - *Fix:* Trả thêm `cache.hit_ratio` và `governor.active_slots` trong `HealthResponse`.

---

## 3. iOS / iPad Native Apps (`ipad-app/`, `iphone-app/`)

### High
- **H5. Timestamp cue ID collision:**
  - `ipad-app/Services/SubtitleParser.swift:42-46`, `iphone-app/Services/SubtitleParser.swift:42-46`: Dùng millisecond integer làm ID cho cue.
  - *Rủi ro:* Cues có cùng start time (hoặc subtitles đa kênh) ghi đè nhau trong `Dictionary(uniqueKeysWithValues:)`.
  - *Fix:* Tạo ID dạng `<ms>-<index>` hoặc UUID fallback.

- **H6. Codebase duplication drift:**
  - 90% code trong `ipad-app/` và `iphone-app/` trùng khớp hoàn toàn (Services, Models).
  - *Rủi ro:* Sửa bug bên iPad nhưng quên sync sang iPhone.
  - *Fix:* Kế hoạch dài hạn: trích xuất `CaptionStudioCore` Swift Package; kế hoạch ngắn hạn: script rà soát diff định kỳ.

### Medium
- **M5. WebView navigation allowlist:**
  - `Views/YouTubePlayerView.swift`: Thiếu ràng buộc chặt chẽ các domains cho phép load trong WKWebView.
  - *Fix:* Kiểm tra URL scheme & domain trong `decidePolicyForNavigationAction` (YouTube, Netflix, ABEMA).

---

## 4. Web & Tools (`web/saved-items/`, `scripts/`, `tools/`)

### Medium
- **M6. Mock data seed trong Saved Items:**
  - `web/saved-items/src/lib/mock-data.ts` và `src/lib/vocab-store.ts`: Có thể seed dữ liệu mẫu đè lên state thật nếu không check kỹ.
  - *Fix:* Gate mock seed chỉ chạy khi dev và store hoàn toàn trống.

- **M7. Build output gitignore hygiene:**
  - `web/saved-items/out/` và `extension/popup/_next/` cần đảm bảo nằm trong `.gitignore` để tránh commit bundle nhị phân/minified.
  - *Fix:* Kiểm tra và cập nhật `.gitignore`.
