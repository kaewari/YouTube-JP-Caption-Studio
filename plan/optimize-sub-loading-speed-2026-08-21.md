<!-- date: 2026-08-21 -->
<!-- source: chat:c5fa6d96-7795-40a1-be50-ddf5588d523d · user: optimize subtitle loading speed to be instant (<50ms cached, <500ms fresh) -->

# Kế Hoạch Tối Ưu Tốc Độ Tải Sub Tức Thì (<50ms Cache, <500ms Tải Mới)

## Tổng quan vấn đề
Tốc độ phản hồi khi đổi phim còn độ trễ (3-8s) do các bước chờ tuần tự và timeout dài.

## Kế hoạch thực hiện
1. **Phản xạ tức thì (`__HARDSUB_TIMEDTEXT_CAPTURED__`)**: Khi network bắt được phụ đề, đẩy thẳng lên `content.js` trong <10ms.
2. **Song song hóa `onNavigate`**: Nạp cache đĩa <50ms và quét mạng song song.
3. **Cắt giảm timeout & vòng lặp chờ thừa** trong `page_capture.js`.
