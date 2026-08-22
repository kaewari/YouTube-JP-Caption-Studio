<!-- date: 2026-08-21 -->
<!-- source: chat:c5fa6d96-7795-40a1-be50-ddf5588d523d · user: fix missing VI/EN subtitles on Netflix due to nested DFXP XML tags and time-skewed alignment -->

# Kế Hoạch Khắc Phục Mất Phụ Đề VI và EN Trên Netflix

## Tổng quan vấn đề
Một số câu phụ đề tiếng Nhật (JA) trên Netflix bị để trống phần dịch Tiếng Việt (VI) và Tiếng Anh (EN).

## Kế hoạch thực hiện
1. **Parser DFXP TTML XML**: Bóc tách thời gian từ thẻ cha `<div>` và thẻ con `<span>`.
2. **Thuật toán Multi-Tier Adaptive Alignment**: Dung sai 0.6s, overlap >= 20%, và fallback tiệm cận ±3.0s.
