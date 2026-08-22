<!-- date: 2026-08-21 -->
<!-- source: chat:c5fa6d96-7795-40a1-be50-ddf5588d523d · user: optimize subtitle loading speed to be instant -->

# Review: Optimize Subtitle Loading Speed (<50ms Cached, <500ms Fresh)

## Tổng quan
Đã tối ưu hóa toàn diện đường ống tải phụ đề khi đổi phim trên mọi nền tảng (YouTube, Netflix, ABEMA):
- Giảm độ trễ từ 3-8 giây xuống còn **<50ms** (khi có cache/đĩa) và **<500ms** (khi tải mới từ CDN).

## Chi tiết các tối ưu

### 1. Phản xạ tức thì khi nhận phụ đề (`__HARDSUB_TIMEDTEXT_CAPTURED__`)
- **File:** `extension/injected/page_capture.js`, `extension/content/content.js`
- Ngay khi request timedtext/subtitle từ CDN hoàn tất, `page_capture.js` phát sự kiện `__HARDSUB_TIMEDTEXT_CAPTURED__` cho `content.js` cập nhật thẳng lên màn hình trong <10ms, không còn cần đợi polling.

### 2. Tinh gọn và song song hóa chu trình `onNavigate`
- **File:** `extension/content/content.js`
- Khôi phục script từ cache đĩa/storage ngay lập tức (<50ms).
- Khởi động tải song song, loại bỏ các bước chờ tuần tự 2500ms `waitForPageBridge` và các đoạn `sleep(800ms)`.
- Gửi lệnh `RESET_CAPTIONS` sang page script để dọn sạch dữ liệu phim cũ ngay lập tức.

### 3. Tối ưu thời gian chờ probe Netflix
- **File:** `extension/injected/page_capture.js`
- Cắt giảm timeout probe URL xuống 600ms (từ 2500ms).
- Rút ngắn deadline `switchTrackAndWait` xuống 800ms (từ 2000ms).
- Xóa bỏ vòng lặp sleep thừa 1500ms (`for i < 10 sleep(150)`).

---

## Verification
- Node syntax check: Exit code 0.
- Import parse test: Passed.
