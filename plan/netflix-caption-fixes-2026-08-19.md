# Kế hoạch sửa lỗi: Netflix Subtitle EN/VI, Nút Toggle Hover, và Lỗi Tra Từ Điển Bridge Offline

<!-- date: 2026-08-19 -->
<!-- source: chat:8ed93e19-4660-41cb-b52b-66e929f43965 · user: Fix 3 bugs on Netflix & Bridge -->

## 1. Phân tích nguyên nhân gốc rễ

### Bug 1: Không có tiếng Anh (EN) và tiếng Việt (VI) trên Netflix dù phim có hỗ trợ
- **Nguyên nhân**: Netflix web player chỉ tải DFXP của track phụ đề đang được chọn (JA). Hàm `fetchNetflixCaptions()` trước đây chỉ chọn `jaTrack` mà không quét và tải các track `enTrack` và `viTrack`.
- **Giải pháp**:
  1. Trong `extension/injected/page_capture.js`, truy vấn danh sách track từ `player.getTimedTextTrackList()`.
  2. Tự động trích xuất URL tải DFXP trực tiếp từ `track.ttDownloadables` hoặc thực hiện chu trình chuyển track ngầm (`setTimedTextTrack(enTrack)` -> bắt DFXP -> `setTimedTextTrack(viTrack)` -> bắt DFXP -> hoàn trả về `jaTrack`).
  3. Cung cấp đầy đủ `cues` (JA), `enCues` (EN) và `viCues` (VI) về `content.js` để hàm `applyLoadedCues()` hợp nhất (union merge) vào timeline song ngữ / tam ngữ.

### Bug 2: Thiết kế nút Toggle trên Netflix chưa hợp lý
- **Yêu cầu người dùng**: Nút bấm hiển thị mờ đè lên video ở mép bên trái khi người dùng hover chuột vào khung video.
- **Giải pháp**:
  1. Trong `extension/styles/panel.css`, căn chỉnh nút `.hardsub-generic-toggle` nằm ở cạnh trái khung video (`left: 24px; top: 45%; transform: translateY(-50%)`).
  2. Mặc định khi không tương tác: `opacity: 0; pointer-events: none;`.
  3. Khi rê chuột vào video (`.watch-video:hover`, `.NFPlayer:hover`, `video.parentElement:hover`): nút hiện lên với độ mờ tinh tế `opacity: 0.85; pointer-events: auto;`.
  4. Khi hover trực tiếp lên nút: `opacity: 1; transform: translateY(-50%) scale(1.08);`.

### Bug 3: Đang chạy Bridge nhưng hover từ vựng lại báo "Bridge offline"
- **Nguyên nhân**:
  1. `local-bridge/app/core/governor.py` đặt `max_in_flight = 1` hoặc `2` khi hệ thống có tải bộ nhớ.
  2. `local-bridge/app/main.py` bọc endpoint `POST /dict` trong `with _governed():`. Khi extension nạp hàng trăm câu và gửi `tokenize_batch` ở background, slot governor bị chiếm giữ -> request `POST /dict` bị từ chối ngay lập tức với mã lỗi `503 Service Unavailable ("bridge busy")`.
  3. `extension/content/content.js` hiển thị chuỗi `"Bridge offline"` cho bất kỳ lỗi HTTP nào trả về.
- **Giải pháp**:
  1. Loại bỏ `_governed()` khỏi `POST /dict` trong `local-bridge/app/main.py` (truy vấn SQLite từ điển là tác vụ read-only cực nhanh < 1ms, không được phép nghẽn bởi tokenize).
  2. Tăng ngưỡng `max_in_flight` trong `governor.py` để không bị nghẽn ở mức 1 job.
  3. Thêm cơ chế tự động thử lại (retry sau 100ms) trong `content.js` trước khi hiển thị offline.
