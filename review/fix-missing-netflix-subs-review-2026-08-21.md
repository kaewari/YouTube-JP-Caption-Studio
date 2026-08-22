<!-- date: 2026-08-21 -->
<!-- source: chat:c5fa6d96-7795-40a1-be50-ddf5588d523d · user: fix missing VI/EN subtitles on Netflix due to nested DFXP XML tags and time-skewed alignment -->

# Review: Fix Missing Subtitles (VI/EN) on Netflix

## Tổng quan
Khắc phục triệt để hiện tượng một số câu tiếng Nhật trên Netflix bị để trống phần dịch Tiếng Việt (VI) và Tiếng Anh (EN).

## Chi tiết các cải tiến

### 1. Nâng cấp Parser DFXP TTML XML Hỗ Trợ Cấu Trúc Lồng Thẻ (`<div>`, `<p>`, `<span>`)
- **File:** `extension/injected/page_capture.js`
- Hỗ trợ bóc tách và kế thừa mốc thời gian `begin`, `end`, `dur` từ thẻ `<div>` cha xuống `<p>` con, và bóc tách các mốc thời gian riêng biệt trong thẻ `<span>`.
- Loại bỏ hoàn toàn lỗi rụng câu do không đọc được thời gian ở thẻ bao ngoài.

### 2. Thuật toán So Khớp Đa Tầng Thông Minh (Multi-Tier Adaptive Alignment)
- **File:** `extension/content/fill_yt_secondary.js`, `extension/content/content.js`
- **Tier 0**: Lệch giờ sát `dt <= 0.6s` (tăng từ 0.35s).
- **Tier 1**: Vùng giao thoa cao `overlap / minSpan >= 0.20`.
- **Tier 2**: Bất kỳ khoảng thời gian giao nhau nào (`overlap > 0`).
- **Tier 3 (Proximity Fallback)**: So khớp câu dịch chưa dùng gần nhất trong phạm vi ±3.0s cho các câu JA còn trống.

---

## Verification
- Unit test Node.js: Passed 100%.
- Kiểm tra ghép nối câu `ニャーの中では まだ完全体じゃないにゃ` với bản dịch Tiếng Việt và Tiếng Anh khi thời gian lệch 0.8s: Ghép thành công cả 2 ngôn ngữ.
