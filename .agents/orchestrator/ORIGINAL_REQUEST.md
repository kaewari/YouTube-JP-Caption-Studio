# Original User Request

## Initial Request — 2026-07-29T12:18:16Z

# Teamwork Project Prompt

Đọc README.md và thực hiện code review toàn diện cho dự án YouTube Caption. Mục tiêu là phân tích kiến trúc tổng thể, tìm ra các điểm nghẽn về hiệu năng, bảo mật, và cấu trúc mã, sau đó trực tiếp đề xuất bản vá hoặc refactor code.

Working directory: /Users/hoangson/Documents/Translate realtime OCR youtube video
Integrity mode: development

## Requirements

### R1. Đánh giá Kiến trúc và Luồng dữ liệu
Phân tích toàn diện cách thức giao tiếp và luồng dữ liệu giữa 3 thành phần chính: Chrome Extension (MV3), FastAPI local-bridge, và Next.js Web UI. Đảm bảo luồng dữ liệu tối ưu và không có anti-pattern.

### R2. Rà soát Mã nguồn Đa chiều
Quét toàn bộ codebase để phát hiện các vấn đề ưu tiên:
- Cấu trúc mã nguồn, khả năng bảo trì.
- Hiệu năng (tốc độ tải, memory leaks trong Chrome Extension).
- Bảo mật và best practices (đặc biệt tuân thủ MV3 security).
- UX/UI và logic tương tác.

### R3. Khắc phục và Báo cáo
Với mỗi vấn đề tìm thấy, agent cần tự động tạo các bản vá (patch/diff) hoặc trực tiếp sửa mã nếu chắc chắn, sau đó chạy test kiểm chứng. Tổng hợp lại thành một báo cáo Markdown hoàn chỉnh kèm hướng dẫn cho tôi review.

## Verification Resources
- Script kiểm thử hồi quy có sẵn: `cd local-bridge && python test_tokenize_import_enrich.py`

## Acceptance Criteria

### Đánh giá & Báo cáo
- [ ] Cung cấp báo cáo Code Review chi tiết, phân loại rõ ràng theo từng khía cạnh (Hiệu năng, Bảo mật, Cấu trúc, UX/UI).
- [ ] Chỉ ra chính xác dòng code gặp vấn đề và giải thích lý do tại sao cần cải thiện.

### Đề xuất & Refactor
- [ ] Mọi đề xuất thay đổi phải kèm theo mã nguồn (patch hoặc file đã sửa).
- [ ] Mã nguồn sau khi refactor phải chạy thành công file kiểm thử hồi quy `test_tokenize_import_enrich.py` (không làm hỏng logic hiện tại).
- [ ] Extension sau khi sửa phải đạt chuẩn MV3 và load thành công dưới dạng unpacked extension.
