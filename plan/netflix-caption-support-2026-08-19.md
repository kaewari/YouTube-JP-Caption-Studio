<!-- date: 2026-08-19 -->
<!-- source: chat:8ed93e19-4660-41cb-b52b-66e929f43965 · user: Hỗ trợ phụ đề Netflix (Chrome, JA + EN/VI) -->

# Kế hoạch: Hỗ trợ phụ đề Netflix (Chrome Extension, JA + EN/VI)

## 1. Mục tiêu & Phạm vi
- Hỗ trợ xem phim / anime trên Netflix với phụ đề tiếng Nhật (Furigana, JLPT color, tra từ điển) kèm phụ đề phụ EN / VI.
- Tương thích hoàn toàn với luồng hiện tại của Extension:
  - Hardsub overlay đè lên video Netflix.
  - Tra từ điển nhanh qua Local Bridge `/dict` (EN + VI) hoặc offline.
  - Biên soạn / chỉnh sửa / xuất nhập trong Side Panel.
  - Lưu trữ local (`data/subtitles/netflix__<watchId>/`) và đồng bộ Google Drive.

## 2. Kiến trúc & Giải pháp kỹ thuật

### 2.1. Trích xuất Video ID & Điều hướng SPA
- URL Netflix có dạng: `https://www.netflix.com/watch/80186940?trackId=...`
- Key lưu trữ: `netflix__<watchId>` (ví dụ: `netflix__80186940`).
- Hook SPA URL change / `popstate` để cập nhật khi người dùng chuyển tập phim mà không tải lại trang.

### 2.2. Bắt & Tải phụ đề Netflix (DFXP / TTML)
- Trong `page_capture.js` (MAIN world):
  1. Hook `fetch` / `XMLHttpRequest` bắt các request chứa `nflxvideo.net` hoặc `/manifest` / timedtext DFXP XML.
  2. Truy cập trực tiếp Netflix Player API (`window.netflix.appContext.state.playerApp.getAPI().videoPlayer`) để lấy danh sách track phụ đề (JA, EN, VI).
  3. Parser DFXP XML hỗ trợ:
     - Clock format: `00:01:23.456`
     - Offset format: `12.34s` / `1234ms`
     - Tick format: `12345678t` với `ttp:tickRate` (thường là 10,000,000).
     - Xử lý thẻ lồng `<span ...>`, `<br/>`, thực thể XML.

### 2.3. Hợp nhất Phụ đề (Merge Cues)
- Phụ đề JA được dùng làm track chính (`source`, `tokens`).
- Phụ đề EN và VI được hợp nhất vào các cue JA tương ứng bằng thuật toán `fillYtSecondary()` / `applyYtSecondaryFill()` có sẵn với dung sai sai số thời gian ±0.35s.

### 2.4. Khung Player & Side Panel
- Neo Hardsub overlay vào container `.watch-video` / `.NFPlayer` của Netflix, đảm bảo z-index hiển thị tốt cả khi Fullscreen.
- Mở rộng quyền kết nối Side Panel và Service Worker cho domain `netflix.com`.

## 3. Danh sách thay đổi

1. `extension/manifest.json`: Thêm host_permissions & matches cho `https://www.netflix.com/*`, `https://netflix.com/*`.
2. `extension/background/service_worker.js`: Cập nhật `isSupportedUrl()` và `notifyDriveRestored()` hỗ trợ Netflix.
3. `extension/sidepanel/sidepanel.js`: Cập nhật `resolveTabId()` và tab query hỗ trợ tab Netflix.
4. `extension/shared/dfxp_parser.js` + `extension/injected/page_capture.js`: Triển khai parser DFXP và hook bắt phụ đề Netflix.
5. `extension/content/content.js`: Cập nhật `sourceFromHost()`, `videoIdFromUrl()`, `sourceLabel()` và container player.
6. `scripts/netflix_dfxp_sanity.js`: Unit test kiểm thử parser DFXP.
7. Cập nhật `walkthrough.md`, `README.md`, và wiki `wiki/topics/netflix-support.md`.
