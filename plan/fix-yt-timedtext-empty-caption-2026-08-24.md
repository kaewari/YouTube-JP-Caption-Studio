<!-- date: 2026-08-24 -->
<!-- source: chat:5bef8002-bdf5-4f78-9e98-31d0dd18d393 · user: fix yt timedtext_empty caption loading (3-tier plan) -->

# Kế hoạch chi tiết giải quyết triệt để lỗi timedtext_empty (3 Tầng Bảo Vệ)

## 1. Phân tích nguyên nhân
- URL rác `watch_html` (200/0 byte) chiếm ưu tiên hoặc làm nhiễu danh sách candidate.
- SPA YouTube giữ listener cũ trong MAIN world do `PAGE_API_VER` chưa kích hoạt force reinject.
- Thiếu log chẩn đoán cho video thuần tiếng Nhật (`hasEn=false, hasVi=false`).
- Sandbox / cookie header trong Chrome Extension có thể can thiệp vào request `credentials: "omit"`.

## 2. Kiến trúc 3 Tầng Bảo Vệ
- **Tầng 1 (Client-side)**:
  - Tối ưu thứ tự ưu tiên candidates trong `service_worker.js` (Android > iOS > Direct query > Web).
  - Bổ sung URL dạng direct query `api/timedtext?v=...&lang=ja&kind=asr&fmt=srv3`.
  - Nâng cấp `PAGE_API_VER = 6` trong `content.js` và `page_capture.js` để cưỡng chế reinject sạch SPA.
  - Ghi log chẩn đoán chi tiết về `local-bridge/errors.log` cho mọi trường hợp miss.
- **Tầng 2 (Local Bridge Fallback)**:
  - Thêm endpoint `GET /captions/{video_id}` trên `local-bridge` (Python).
  - Khi client-side thất bại, `content.js` gọi tới bridge để lấy cues parse sẵn trực tiếp từ Innertube (100% không bị ảnh hưởng bởi cookie/sandbox của trình duyệt).
- **Tầng 3 (UI & Feedback)**:
  - Hiển thị rõ ràng trạng thái theo từng tầng, Reload kích hoạt làm mới toàn diện cả 3 tầng.

## 3. Kế hoạch kiểm thử
- Chạy self-check Python / Node cho endpoint `GET /captions/{video_id}`.
- Kiểm tra live trên các video: `oqPcaOYwZ_4`, `neHAJF19YXY`, `rNhyBznooGo`.
