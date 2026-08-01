# Kiến trúc & Phân tích chuyên sâu (Technical Walkthrough)

Dự án **YouTube JP Caption Studio** là một hệ thống hỗ trợ học tiếng Nhật qua YouTube. Hệ thống sử dụng một kiến trúc **Decoupled (Phân tách) / Client-Server** kết hợp giữa Chrome Extension (Front-end), FastAPI (Local Backend), và Next.js (Popup UI). 

Tài liệu này được viết dưới góc nhìn của một chuyên gia IT (Software Architect) nhằm phân tích chi tiết toàn bộ mã nguồn, cấu trúc thư mục, kiến trúc hệ thống, cũng như đánh giá ưu/nhược điểm của thiết kế.

---

## 1. Cấu trúc thư mục & Chi tiết các File/Folder

### 1.1. `extension/` (Chrome Extension MV3)
Thư mục này chứa mã nguồn thuần của Extension, đóng vai trò là "Client" tương tác trực tiếp với người dùng và trang web YouTube.

- **`injected/`**:
  - `page_capture.js`: File này đặc biệt quan trọng vì nó được inject thẳng vào **MAIN world** (môi trường của chính trang web YouTube, thay vì Isolated world của extension). Nó override `XMLHttpRequest` / `fetch` để "chặn bắt" (intercept) các request lấy phụ đề gốc (`/api/timedtext`) của YouTube và chèn logic lấy thời gian thực của video (`media_time`) qua API của player.
- **`content/`**:
  - `content.js`: Script chạy ngầm trên trang YouTube (Isolated world). File này đảm nhận việc tạo ra các overlay DOM (phụ đề cứng hiển thị trên màn hình), đồng bộ vị trí hiển thị, quản lý merge cache (trộn phụ đề gốc và phụ đề đã edit).
  - `cue_timing.js` & `normalize_cues.js`: Các helper xử lý tính toán timing, dọn dẹp các ký tự đặc biệt (SFX) và chuẩn hóa cấu trúc dữ liệu của các đoạn sub (cue) lấy từ YouTube.
- **`background/`**:
  - `service_worker.js`: Trái tim của extension. Đóng vai trò làm Controller giao tiếp với Local Bridge qua HTTP, xử lý các tác vụ nền, và quản lý liên lạc (message passing) giữa Content script và Side panel.
- **`sidepanel/`**:
  - Chứa HTML/CSS/JS (`sidepanel.html`, `sidepanel.js`, `sidepanel.css`) render giao diện Side Panel dọc bên phải màn hình. Đây là nơi user chỉnh sửa phụ đề (JA, EN, VI) trực tiếp, chỉnh sửa timeline và cập nhật trạng thái đồng bộ real-time.
- **`popup/`** (Được sinh ra từ thư mục `web/saved-items`):
  - Chứa các file tĩnh HTML/JS sau khi build Next.js. Extension dùng nó làm giao diện khi người dùng bấm vào icon trên thanh công cụ.

### 1.2. `local-bridge/` (FastAPI Backend)
Đây là Backend chạy ở localhost (`127.0.0.1:8765`). Lý do có service này là để gánh các tác vụ nặng mà Chrome Extension không thể làm tốt.

- **`app/main.py`**: Điểm entrypoint của ứng dụng FastAPI, khai báo các routers và dependency injection.
- **`app/api/`**: Chứa các khai báo route/endpoint.
- **`app/services/`**: Chứa Business Logic:
  - `dictionary.py`: Quản lý query dữ liệu từ điển JMdict (truy vấn SQLite).
  - `tokenize_ja.py`: Sử dụng thư viện `sudachipy` để chia từ (tokenize), phân tích từ loại (POS), và bóc tách furigana từ text tiếng Nhật.
  - `script_store.py`: Quản lý việc đọc, ghi, xóa (I/O) các file phụ đề `.json` và `.txt` vào ổ cứng (thư mục `data/subtitles/`).
  - `ime_switch.py`: Logic gọi script hệ thống để tự động chuyển bộ gõ (IME) trên macOS.
  - `vocab_freq.py`: Tính toán tần suất xuất hiện và cấp độ JLPT của từ vựng.
- **`app/core/`**:
  - `cache.py`, `governor.py`: Cung cấp các cơ chế giới hạn request (rate limit) hoặc lưu trữ cache tạm thời trong RAM cho backend để tối ưu query.
- **`start.sh` / `Dockerfile`**: Scripts để tự động setup virtual environment (`.venv`), cài đặt dependencies và khởi chạy server.

### 1.3. `web/saved-items/` (Next.js App)
- Đây là một React/Next.js source code độc lập, được tổ chức theo cấu trúc App Router hoặc Pages Router chuẩn của Next.
- Nó chứa các UI Component hiện đại, sử dụng TailwindCSS (hoặc tương đương) để quản lý danh sách từ vựng cá nhân, cài đặt hiển thị phụ đề (Hardsub settings).
- Khi dev xong, ứng dụng được export thành static file (`next export`) và chuyển vào thư mục `extension/popup/`.

### 1.4. `data/` và `tools/`
- **`data/`**: Nơi lưu trữ toàn bộ cơ sở dữ liệu của ứng dụng, bao gồm từ điển SQLite (`data/dict/`), config settings của user, và phụ đề video đã được lưu (`data/subtitles/{video_id}/`).
- **`tools/ime-switch/`**: Mã nguồn Swift hoặc AppleScript để thao tác trực tiếp với API của macOS giúp chuyển đổi bộ gõ giữa tiếng Anh và tiếng Nhật (Romaji/Kana).

---

## 2. Kiến trúc Dự án (System Architecture)

### Tại sao lại sử dụng kiến trúc Phân tách (Client-Server Local)?
Hệ thống sử dụng kiến trúc phân tách thay vì "Nhồi nhét" tất cả vào Chrome Extension vì các lý do kỹ thuật vô cùng quan trọng sau:

1. **Giới hạn của Manifest V3 (MV3)**: 
   - MV3 buộc sử dụng Service Workers không có DOM, bị kill nếu idle quá lâu.
   - Giới hạn kích thước WASM và Memory của Chrome Extension. Việc load toàn bộ engine NLP tiếng Nhật như Sudachi và database từ điển khổng lồ JMdict (hàng chục/trăm MB) lên RAM của Extension là một thảm họa về hiệu năng, có thể gây crash trình duyệt.
2. **Quyền truy cập File System**: 
   - Ứng dụng muốn ưu tiên quyền "Data Ownership" của người dùng: Phụ đề sau khi dịch phải được lưu cứng xuống máy tính thành file dễ đọc (JSON/TXT), thay vì bị kẹt trong IndexedDB của Chrome (dễ bị mất khi xóa history trình duyệt). Local Bridge bằng Python xử lý file I/O một cách dễ dàng và an toàn.
3. **Tương tác Hệ điều hành (OS Level Integration)**: 
   - Extension không thể điều khiển bộ gõ (IME) của máy Mac. Cần một process chạy dưới quyền User trên OS (Python + Swift) để làm việc này.

### Ưu Điểm (Pros)
- **Hiệu năng cực cao**: Trình duyệt chỉ phải làm việc nhẹ là render UI và giao tiếp HTTP. Mọi tác vụ nặng (Search DB, Tokenize, NLP) đều được Python đa luồng xử lý mượt mà.
- **Bảo mật và Quyền riêng tư**: Tất cả chạy local ở `127.0.0.1`, không gửi bất kỳ dữ liệu cá nhân hay text nào lên Cloud.
- **Phát triển độc lập (Modularity)**: Team Front-end có thể thoải mái dev Next.js/React, team Extension làm Vanilla JS, và team Backend tối ưu Python/FastAPI mà không dẫm chân lên nhau. Dễ dàng viết Unit Test cho logic NLP độc lập.

### Nhược Điểm (Cons)
- **Rào cản Cài đặt (Friction)**: Người dùng cuối không thể chỉ đơn giản cài 1 cú click từ Chrome Web Store. Họ phải biết dùng Terminal để clone code, cài Python, và chạy `./start.sh`. Điều này giới hạn tệp người dùng chỉ ở mức Developers hoặc Power Users.
- **Khó đóng gói (Distribution)**: Việc duy trì môi trường chạy ổn định cho ứng dụng Local (như Python version, dependencies, architecture ARM vs Intel) là một vấn đề nan giải nếu muốn scale dự án thành sản phẩm thương mại (SaaS/Desktop App).
- **Phụ thuộc Hệ điều hành**: Tính năng Auto IME hiện tại bị trói buộc với macOS (qua Swift/AppleScript). Không hỗ trợ Windows/Linux natively mà không phải viết lại tool tương đương.

---

## 3. Các Luồng Xử Lý Cốt Lõi (Core Workflows)

### 3.1. Luồng Bắt chặn và Xử lý Phụ đề (Caption Intercept Flow)
- **Bước 1 (Intercept)**: Khi video bắt đầu, `page_capture.js` chặn (monkey-patch) đối tượng `XMLHttpRequest` / `fetch`. Nếu URL có chứa `/api/timedtext`, nó sẽ lấy payload của YouTube.
- **Bước 2 (Parse)**: Dữ liệu (XML hoặc JSON3) được đưa qua `background` xử lý, dịch ra mảng các Cues (có thuộc tính startTime, duration, text).
- **Bước 3 (Merge Data)**: Background gọi Local Bridge API `/scripts/{videoId}` để kiểm tra xem trên ổ cứng (Local Disk) có bản chỉnh sửa nào của video này chưa. 
  - Nếu có, **Dữ liệu Local (Local Data) luôn giành quyền ưu tiên (Wins)**. Các câu sub user đã dịch/chỉnh sửa sẽ đè lên bản của YouTube.
- **Bước 4 (Render Overlay)**: `content.js` nhận danh sách sub cuối cùng. Dùng hàm requestAnimationFrame theo dõi `media_time` từ trang, tạo các thẻ `div` bọc lơ lửng trên video để làm Sub cứng (Hardsub).

### 3.2. Luồng Chỉnh Sửa & Auto-Save
- **Tương tác**: Người dùng mở Side Panel, bấm vào một dòng sub tiếng Nhật để sửa chữ, hoặc dịch tiếng Anh/Việt.
- **IME Magic**: Khi Input focus vào ô Tiếng Nhật, Frontend gọi `POST /ime/switch {to: "ja"}` lên Local Bridge. Bridge thực thi script gọi API của macOS ép bộ gõ chuyển sang tiếng Nhật ngay lập tức, giúp trải nghiệm mượt mà không cần ấn phím tắt.
- **Tokenize**: Ấn Enter sau khi sửa, đoạn text tiếng Nhật được gửi về Bridge API `/tokenize`. Sudachi sẽ phân tích hình thái, gắn rễ từ, furigana và trả về Frontend để update DOM.
- **Persistence**: Side panel thu thập mọi thay đổi, gom lại (debounce) và lưu song song:
  - Lưu RAM (Chrome `storage.local`) để phản ứng tức thì.
  - Lưu Ổ Cứng (Bridge `POST /scripts/save`) để lưu file `.json` vĩnh viễn.

### 3.3. Xử Lý Xung Đột (Edge Cases)
- **Tombstone (Cơ chế Xóa Sub)**: Trong YouTube, phụ đề thường được sinh tự động hoặc bị rác. Khi User ấn "Xóa" một dòng sub, thay vì xóa hoàn toàn khỏi mảng, hệ thống tạo một object **Tombstone** với cờ `deleted: true`. Khi merge với subtitle fetch mới từ YouTube ở các lần reload sau, hệ thống thấy Tombstone sẽ tự hiểu để loại bỏ câu gốc của YouTube đi, không để nó "hồi sinh".
- **Timeline Overlapping**: Phụ đề YouTube đôi khi hiển thị 2 câu cùng 1 lúc (overlap) do lỗi của thuật toán Auto-gen. `content.js` quản lý một bộ lọc (queue) chặt chẽ bằng tham số `durMs` (Duration) để luôn ẩn đúng các thẻ DOM khi hết thời gian, tránh rác UI.
