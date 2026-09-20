# House style

Đây là tiêu chí thiết kế và review, không phải lệnh formatter. Khi sửa code,
ưu tiên làm code rõ hơn mà vẫn giữ nguyên hành vi.

## Luật chung

- Đọc luồng gọi và helper hiện có trước khi thêm abstraction.
- Một nguồn sự thật cho mỗi trạng thái; không tạo bản sao chỉ để tiện dùng.
- Tên phải nói rõ vai trò và side effect tại nơi gọi.
- Guard clause và luồng thẳng được ưu tiên hơn nesting sâu.
- Comment giải thích `why`, không chép lại `what` mà code đã nói rõ.
- Không thêm tính năng dự phòng, dependency hoặc refactor ngoài phạm vi.
- Code sinh tự động, fixture và dữ liệu runtime không sửa thủ công nếu chưa xác định nguồn sinh.
- Refactor phải giữ hành vi; nếu thiếu test, thêm một smoke check nhỏ trước khi đổi cấu trúc.

## Theo ngôn ngữ

- JavaScript/TypeScript: dùng type và module boundary để làm rõ contract; không che lỗi bằng `any`, `catch` rỗng hoặc state trùng.
- Python: theo PEP 8, nhưng tính nhất quán trong module và convention của repo được ưu tiên.
- Swift: API rõ ở điểm sử dụng; tên thể hiện vai trò tham số và side effect.
- HTML/CSS: ưu tiên semantic HTML, native CSS và accessibility; tránh JS cho việc CSS đã giải quyết được.

## Definition of done

Một thay đổi có gu phải có diff nhỏ, không có file ngoài phạm vi, không làm giảm code health,
có kiểm tra phù hợp và ghi rõ trade-off nếu cố ý giữ một simplification.
