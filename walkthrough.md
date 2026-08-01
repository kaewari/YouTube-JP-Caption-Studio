# YouTube Caption Extension – Tổng quan Kiến trúc & Hoạt động

Đây là tài liệu ghi nhận lại toàn bộ kiến trúc, các luồng hoạt động (workflow), và các component chính của dự án sau khi quét toàn bộ mã nguồn.

## 1. Tổng quan dự án (Project Overview)
Extension Chrome kiểu Language Reactor dành cho YouTube, chuyên dụng cho việc học tiếng Nhật. Hệ thống lấy phụ đề (timedtext), hiển thị overlay trực tiếp lên video và cung cấp Side Panel để người dùng chỉnh sửa/import phụ đề tiếng Nhật, Anh, Việt.
- **Đặc điểm cốt lõi**: KHÔNG dùng OCR, KHÔNG dùng Machine Translation (dịch máy) tự động. Mọi bản dịch EN/VI đều từ import hoặc do người dùng tự dịch/chỉnh sửa tay.
- **Công nghệ**: Chrome Extension MV3, FastAPI (Local Bridge), Next.js (cho phần UI Saved Items).

## 2. Kiến trúc Hệ thống (Architecture)
Hệ thống được chia làm 3 mảng chính:

### 2.1. Chrome Extension (`extension/`)
Là phần front-end tương tác trực tiếp với trình duyệt và YouTube.
- **`injected/page_capture.js`**: Được inject vào MAIN world của trang web. Nhiệm vụ lấy thời gian hiện tại của video (`media_time`) và intercept các request `/api/timedtext` để bắt phụ đề gốc.
- **`content/content.js`**: Script chạy ngầm trên trang YouTube. Xử lý logic hiển thị overlay (sub cứng) trên video, đồng bộ timeline, quản lý merge cache (phụ đề YT gốc + bản chỉnh sửa từ disk/storage).
- **`background/service_worker.js`**: Chạy nền (Service Worker). Đảm nhiệm giao tiếp HTTP với Local Bridge, scrape phụ đề qua YouTube Innertube API (hoặc ytInitialPlayerResponse) khi cần, và hỗ trợ điều khiển IME của hệ điều hành.
- **`sidepanel/`**: Giao diện Side Panel native của trình duyệt. Hiển thị danh sách các câu sub (cues), cho phép người dùng click để sửa chữ (JA/EN/VI) hoặc chỉnh lại timeline của từng câu.
- **`popup/`**: Thư mục chứa giao diện tĩnh (HTML/CSS/JS) của menu "Saved Items", được build từ Next.js.

### 2.2. Local Bridge (`local-bridge/`)
Là backend cục bộ (chạy tại `127.0.0.1:8765`) xây dựng bằng Python/FastAPI để tránh giới hạn bộ nhớ/băng thông của trình duyệt.
- **`main.py`**: Khai báo các API endpoints chính.
- **Tính năng Xử lý ngôn ngữ**:
  - Dùng Sudachi để tokenize tiếng Nhật (lấy furigana, pos, jlpt) qua API `/tokenize` và `/tokenize_batch`.
  - Tích hợp từ điển JMdict (EN, VI) để tra từ qua API `/dict`.
- **Lưu trữ cục bộ (Persistence)**: Quản lý ghi/xóa các bản script đã được người dùng chỉnh sửa vào ổ cứng (`scripts/{videoId}/`).
- **IME Control**: Điều khiển chuyển đổi Input Method (VD: tự động bật bộ gõ tiếng Nhật khi click vào ô sửa JA) cho macOS.

### 2.3. Saved Items UI (`web/saved-items/`)
- Ứng dụng Next.js dùng để phát triển giao diện quản lý từ vựng và thiết lập (Settings) ở môi trường dev (`localhost:3000`).
- Được export thành file tĩnh (static HTML) và nhúng vào `extension/popup/` để làm popup cho extension. Nó đồng bộ trạng thái (userVocab, hardsubSettings) thông qua API `/extension_state` của Bridge.

## 3. Các Luồng Hoạt Động Cốt Lõi (Core Workflows)

### 3.1. Luồng tải và đồng bộ Phụ đề (Caption Flow)
1. **Fetch**: Khi mở video YouTube, Service Worker tìm cách lấy file phụ đề qua nhiều cách: intercept `/api/timedtext`, parse `ytInitialPlayerResponse` trong HTML, hoặc gọi qua ANDROID Innertube API.
2. **Parse & Normalize**: Nội dung trả về (thường là XML hoặc JSON3) được parse thành các "cues" (đoạn text có `start`, `end`, `durMs`). Logic đã được căn chỉnh để tôn trọng thuộc tính `dur` của YouTube, giúp giải quyết triệt để lỗi "lệch timeline" hoặc bị cắt sớm do overlap.
3. **Merge Cache**: Các cues mới lấy từ YouTube sẽ được merge với `chrome.storage.local` và dữ liệu từ Local Bridge.
   - Nguyên tắc: **Bản lưu của user luôn thắng**. Nếu một cue đã được user dịch hoặc chỉnh sửa (text_source = "edit" / "manual"), YouTube sẽ không thể ghi đè.
4. **Hiển thị**: `content.js` so sánh `media_time` hiện tại của video với danh sách cues để làm nổi bật câu hiện tại trên màn hình (overlay) và auto-scroll trên Side Panel.

### 3.2. Luồng Chỉnh sửa tại Side Panel
- Khi user focus vào ô tiếng Nhật (JA), hệ thống tự kích hoạt API chuyển IME sang tiếng Nhật. Nếu thay đổi JA và ấn Enter, câu sẽ được gửi qua Bridge để tokenize lại (cập nhật furigana) và giữ nguyên bản dịch EN/VI.
- Khi user sửa EN hoặc VI, trạng thái của cue sẽ bị khóa (`mt_locked = true`), đánh dấu là đã dịch bằng tay.
- Khi xoá trắng bản dịch, trạng thái dịch sẽ bị hủy. Việc xóa sub đã lưu (`wipe`) sẽ làm sạch cache trên disk và tải lại bản gốc từ YouTube.
- Mọi thay đổi đều được auto-save (debounce 400ms) vào `chrome.storage` và lưu xuống Local Bridge (`scripts/{videoId}/`).

### 3.3. Từ điển và Quản lý từ vựng
- Khi người dùng tương tác với các token (từ vựng) trên overlay hoặc Side Panel, Local Bridge sẽ trả về nghĩa từ JMdict.
- UI cung cấp các nút đánh dấu trạng thái của từ ("Đã biết", "Học", "Đừng học"...).
- Trạng thái `userVocab` này được lưu lại, đồng bộ giữa content script, side panel và popup menu (Saved Items) để highlight màu tương ứng ở mọi nơi.

## 4. Thiết kế Persistence (Lưu trữ dữ liệu)
Hệ thống lưu dữ liệu theo kiến trúc phân tán để đảm bảo hiệu năng và không mất dữ liệu:
- **`chrome.storage.local`**: Cache nhanh các script đang xem, `transcriptMeta`, `userVocab`, `hardsubSettings`.
- **Ổ cứng (thông qua Bridge)**: 
  - `scripts/{videoId}/cues.json`: Dữ liệu nguyên vẹn của toàn bộ cue.
  - `scripts/{videoId}/script.txt`: File text dễ đọc để export.
  - `data/extension_state.json`: File mirror state cho phép môi trường dev (Next.js localhost) đọc được setting mà không cần extension API.

## 5. Xử lý Edge Cases quan trọng
- **Timeline Overlaps**: Subtitle gốc trên YouTube đôi khi bị đè lên nhau (overlapping) hoặc kéo dài quá lố ở các khoảng lặng. Bộ parser đã được fix để dùng thuộc tính `durMs` nhằm đảm bảo sub sẽ biến mất đúng lúc.
- **Tombstones**: Nếu user chủ động xóa một cue, hệ thống sẽ lưu vết ("tombstone") để lần sau tải lại, cue đó không bị "đào mồ sống dậy" từ file gốc của YouTube.
- **Giao tiếp liên Domain**: Sử dụng cơ chế `window.postMessage` giữa `injected script` và `content script` để lấy được object Player của trang YouTube một cách an toàn.
