<!-- date: 2026-08-21 -->
<!-- source: chat:c5fa6d96-7795-40a1-be50-ddf5588d523d · user: fix bug where EN and VI captions do not load on Netflix -->

# Review: Netflix EN and VI Caption Fix

## Tổng quan
Đã khắc phục hoàn toàn lỗi không load được phụ đề Tiếng Anh (EN) và Tiếng Việt (VI) khi xem phim trên Netflix.

## Chi tiết các điểm đã sửa

### 1. Hỗ trợ đa định dạng phụ đề (WebVTT + DFXP TTML XML)
- **File:** `extension/injected/page_capture.js`
- Xây dựng `parseSubtitlePayload(text)`: Tự động phân tích cả hai định dạng phụ đề phổ biến của Netflix là WebVTT (`WEBVTT`, `-->`) và DFXP TTML XML (`<tt>`, `<p>`).
- Cập nhật `noteNetflixTimedtext` và `isNetflixUrl` để bắt trọn các request phụ đề từ các CDN Netflix.

### 2. Thuật toán nhận diện ngôn ngữ chính xác & Cơ chế Probing Lang
- **File:** `extension/injected/page_capture.js`
- Bổ sung `probingLang` trong `netflixState`: Khi extension chủ động đổi track để probe EN hoặc VI, các response trả về được gán trực tiếp theo ngôn ngữ đang probe, không bị phụ thuộc vào việc đoán mò.
- `detectSubtitleLang(text, cues, url)`: Quét đến 100 câu phụ đề để phát hiện chuẩn xác các nguyên âm có dấu Tiếng Việt (`àáạ...`) và ký tự Tiếng Nhật, tránh việc 10 câu đầu chỉ chứa credit/tên phim tiếng Anh bị nhận diện nhầm thành English.

### 3. Tối ưu hóa chu trình chuyển track & Thời gian chờ (Timeout 2s)
- **File:** `extension/injected/page_capture.js`
- Nâng deadline của `switchTrackAndWait` lên 2000ms mỗi track (và ngắt ngay khi có dữ liệu) để CDN kịp tải xong file phụ đề trước khi chuyển track tiếp theo.
- Khôi phục lại track `jaTrack` gốc sau khi hoàn tất nạp EN và VI.
- Bổ sung quét `video.textTracks` cho cả 3 ngôn ngữ JA, EN, VI khi player sử dụng native tracks.

---

## Verification
- Unit test chạy độc lập kiểm tra phân tích cú pháp WebVTT, DFXP và phân loại ngôn ngữ: Passed (100%).
- Node syntax check: Exit code 0 trên tất cả các file.
