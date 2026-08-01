# YouTube JP Caption Studio

Đây là một tiện ích mở rộng (Chrome Extension) tương tự như Language Reactor, được thiết kế chuyên biệt để giúp bạn xem video, học từ vựng và tự làm phụ đề tiếng Nhật trên YouTube.

> **Lưu ý quan trọng:**
> Tiện ích này **KHÔNG** sử dụng dịch máy tự động (như Google Translate) và **KHÔNG** dùng công nghệ nhận diện chữ trên video (OCR). Tất cả các bản dịch tiếng Anh và tiếng Việt đều do bạn tự import (nhập) hoặc tự dịch tay để đảm bảo độ chính xác cao nhất theo ý bạn.

---

## 🌟 Các tính năng chính

1. **Hiển thị phụ đề thông minh**: Phụ đề gốc tiếng Nhật được lấy trực tiếp từ YouTube, sau đó hiển thị đẹp mắt lên video (overlay) và hiển thị danh sách câu thoại ở thanh bên (Side Panel) để bạn dễ dàng theo dõi.
2. **Phiên âm (Furigana) & Tra từ điển**: Tự động phân tách câu tiếng Nhật, hiển thị cách đọc Kana (Furigana) và hỗ trợ tra từ điển Anh-Việt (JMdict) ngay khi bạn bấm vào một từ.
3. **Quản lý từ vựng cá nhân**: Đánh dấu trạng thái từ vựng (Đã biết, Đang học, Bỏ qua...). Các từ này sẽ được tô màu tương ứng trên video để bạn dễ nhận biết.
4. **Chỉnh sửa phụ đề mạnh mẽ**: Cho phép bạn bấm trực tiếp vào từng câu ở thanh Side Panel để sửa lại tiếng Nhật, thêm bản dịch tiếng Anh/Việt, hoặc tinh chỉnh thời gian hiển thị (timeline).
5. **Dữ liệu an toàn**: Mọi chỉnh sửa của bạn được tự động lưu lại cục bộ trên máy tính. Bản dịch của bạn luôn được ưu tiên và không bao giờ bị phụ đề gốc của YouTube ghi đè.

---

## ⚙️ Cấu trúc hệ thống

Để extension hoạt động mượt mà và xử lý ngôn ngữ mạnh mẽ (như phân tách từ tiếng Nhật) mà không làm đơ trình duyệt, dự án được chia làm 2 phần chạy song song:

1. **Local Bridge (Máy chủ nội bộ cục bộ)**: Viết bằng Python/FastAPI. Chạy ngầm trên máy tính của bạn để xử lý việc tra từ điển, cắt từ (Sudachi) và lưu file phụ đề.
2. **Chrome Extension**: Giao diện chính mà bạn cài vào trình duyệt để tương tác với YouTube.

---

## 🚀 Hướng dẫn cài đặt & Sử dụng

### Bước 1: Khởi động máy chủ cục bộ (Local Bridge)
*(Yêu cầu máy tính đã cài đặt Python)*

Mở Terminal (hoặc Command Prompt) và chạy lệnh sau:
```bash
cd local-bridge
./start.sh
```
- Máy chủ sẽ khởi chạy tại địa chỉ `http://127.0.0.1:8765`.
- **Lưu ý:** Lần đầu tiên chạy, hệ thống sẽ mất một chút thời gian để tự động tải về bộ từ điển và các công cụ phân tích ngôn ngữ.

### Bước 2: Cài đặt Chrome Extension
1. Mở trình duyệt Chrome, truy cập vào trang quản lý tiện ích: `chrome://extensions/`
2. Bật **Chế độ dành cho nhà phát triển** (Developer mode) ở góc phải màn hình.
3. Bấm vào nút **Tải tiện ích đã giải nén** (Load unpacked).
4. Chọn thư mục `extension/` nằm bên trong dự án này.

### Bước 3: Trải nghiệm trên YouTube
1. Mở một video YouTube bất kỳ có phụ đề tiếng Nhật.
2. Extension sẽ tự động bắt phụ đề và hiển thị.
3. Bạn có thể mở thanh Side Panel của Chrome (bảng điều khiển bên phải trình duyệt) để xem danh sách toàn bộ các câu thoại.
4. Bấm vào biểu tượng của Extension trên thanh công cụ của trình duyệt để mở cửa sổ "Saved Items" (quản lý từ vựng đã lưu và các thiết lập hiển thị).

---

## ⌨️ Thao tác chỉnh sửa phụ đề (Trong Side Panel)

Khi mở Side Panel, bạn có thể dễ dàng can thiệp vào kịch bản (script) của video:

- **Sửa chữ:** Bấm vào ô Tiếng Nhật (JA), Tiếng Anh (EN) hoặc Tiếng Việt (VI) để sửa đổi nội dung.
- **Lưu lại:** Sau khi sửa xong, bấm phím `Enter` để hệ thống lưu lại (hoặc bấm `Esc` để hủy bỏ). 
- **Sửa thời gian (Timeline):** Bấm vào mốc thời gian để đổi lúc bắt đầu / kết thúc của câu thoại.
- **Tự động chuyển bộ gõ (macOS):** Khi bạn bấm chuột vào ô sửa tiếng Nhật, hệ thống sẽ tự động bật bộ gõ tiếng Nhật cho bạn (nếu có hỗ trợ).
- **Trạng thái khóa (Lock):** Khi bạn tự tay dịch EN/VI, câu đó sẽ được đánh dấu là "đã được user dịch", YouTube sẽ không tự động làm mất bản dịch này khi bạn tải lại trang.

*(Để xem chi tiết hơn về mặt kỹ thuật và luồng hoạt động chuyên sâu của mã nguồn, bạn có thể tham khảo file `walkthrough.md`)*
