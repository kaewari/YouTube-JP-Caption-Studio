<!-- date: 2026-08-21 -->
<!-- source: chat:c5fa6d96-7795-40a1-be50-ddf5588d523d · user: fix sub loading, multitab overwrite, pending status, remove sidepanel header -->

# Kế Hoạch Sửa Lỗi Tải Sub, Cách Ly Đa Tab, Khắc Phục Mất Sub/Treo Pending & Thiết Kế Lại Giao Diện Sidepanel

## Tổng quan vấn đề
1. **Load sub nhầm phim trước / không tự động cập nhật khi đổi phim**: Khi chuyển video (SPA navigation trên YouTube hoặc chuyển tập), dữ liệu sub cũ vẫn còn lưu trong bộ nhớ và không được xóa tức thì; Sidepanel không được cập nhật ngay lập tức.
2. **Sub bị đè khi mở nhiều tab**: Mọi content script ở các tab chạy ngầm đều phát thông điệp `SP_STATE` định kỳ qua `chrome.runtime.sendMessage`. Sidepanel nhận tin nhắn từ bất kỳ tab nào và ghi đè `tabId` cũng như toàn bộ danh sách cue của tab đang xem, khiến sub giữa các tab bị chèn đè lẫn nhau.
3. **Hiện tượng Pending quá nhiều & Mất sub**:
   - Status bar hiển thị `pending N` (do tàn dư của logic đếm câu chưa dịch máy).
   - Bộ lọc `normalize_cues.js` sử dụng regex quá gắt (`BRACKET_ONLY_RE`), vô tình xoá sạch các câu thoại tiếng Nhật lồng trong ngoặc đơn `（...）` (thường là lời độc thoại, thoại ngoài màn hình).
   - Timeout khi gọi page bridge quá dài (lên tới 45s) khiến quá trình tải sub bị treo lâu nếu gặp trục trặc.
4. **Header Sidepanel chiếm dụng diện tích**: Header phía trên quá lớn, người dùng muốn loại bỏ hoàn toàn để tối đa hóa không gian đọc sub, đưa các nút thao tác xuống vị trí hợp lý hơn.

---

## Giải pháp kỹ thuật chi tiết

### 1. Tự Động Cập Nhật Sub & Reset Khi Đổi Video
- Trong `extension/content/content.js`:
  - Ngay khi phát hiện sự kiện đổi video (`yt-navigate-finish`, URL change, popstate):
    - Đặt lại ngay lập tức `cues = []`, `activeCueId = ""`, xóa trắng overlay player.
    - Phát ngay thông điệp `SP_STATE` rỗng `{ videoId: newVideoId, cues: [] }` với cờ `forceList: true` để Sidepanel xóa ngay sub của video cũ trong 1 khung hình.
    - Hủy bỏ các promise/request của video trước đó thông qua việc tăng thế hệ điều hướng `navigateGen`.
    - Tự động kích hoạt luồng tải sub mới từ YouTube Timedtext / Native Track / Local Disk.
    - Khi có sub mới, lập tức cập nhật lên giao diện Sidepanel và video overlay.

### 2. Cách Ly Đa Tab (Multi-Tab Isolation)
- Trong `extension/sidepanel/sidepanel.js`:
  - Duy trì `currentActiveTabId`: Lắng nghe sự kiện `chrome.tabs.onActivated` và `chrome.windows.onFocusChanged` (hoặc truy vấn active tab hiện tại).
  - Khi nhận `SP_STATE` từ content script: **Chỉ chấp nhận và xử lý** nếu `msg.tabId === currentActiveTabId`. Bỏ qua toàn bộ `SP_STATE` từ các tab chạy nền.
  - Khi người dùng chuyển sang tab khác: Sidepanel tự động chuyển `currentActiveTabId` sang tab mới, xóa tạm thời state cũ và gửi lệnh `ping`/`get_state` đến tab mới để lấy ngay dữ liệu sub của tab đó.
  - Mọi lệnh điều khiển (`sendCmd`: Reload, +Cue, Overlay, Import...) luôn gửi chính xác đến `currentActiveTabId`.

### 3. Sửa Lỗi Mất Sub & Loại Bỏ Trạng Thái Treo/Pending
- Trong `extension/content/normalize_cues.js`:
  - Tinh chỉnh `isSfxLabelOnly` và `dropAndStripSfx`: Chỉ loại bỏ các nhãn âm thanh đặc thù (ví dụ `[âm nhạc]`, `[tiếng vỗ tay]`, `♪`, `🎵`, `(笑)`, `(泣)`).
  - **Không xoá** các câu thoại hoàn chỉnh bằng tiếng Nhật/Anh/Việt nằm trong ngoặc `（...）` hoặc `(...)`.
- Trong `extension/content/content.js`:
  - Xóa bỏ logic gán trạng thái `pending N` trong `updateCaptionStatusLine()` và `cacheStats()`. Chỉ hiển thị số lượng cue thực tế và trạng thái rõ ràng (`Ready · N cues` / `Loading...` / `Idle`).
  - Giảm timeout của các pageCall (`FETCH_MULTI_LANG` từ 20s xuống 5s, `LOAD_CAPTIONS` từ 45s xuống 8s) để nhanh chóng chuyển sang phương thức dự phòng nếu YouTube bị trễ.

### 4. Thiết Kế Lại Giao Diện Sidepanel (Xoá Header, Thêm Bottom Toolbar & Player Menu)
- Trong `extension/sidepanel/sidepanel.html` & `extension/sidepanel/sidepanel.css`:
  - **Xoá bỏ hoàn toàn** `<header class="sp-header">` ở đỉnh Sidepanel. Khu vực cuộn danh sách sub `#sp-list` sẽ chiếm trọn 100% phần trên.
  - Tạo một **Bottom Toolbar (Footer)** cố định, nhỏ gọn, hiện đại ở đáy Sidepanel gồm các icon/nút:
    - `+ Cue` (Thêm dòng phụ đề tại playhead)
    - `Reload` (Nạp lại caption)
    - `Overlay` (Bật/tắt phụ đề trên video)
    - `Import / Export`
    - `Xóa dịch / Xóa sub` (nút tác vụ phụ)
    - `Drive` (trạng thái đồng bộ Drive gọn gàng)
    - `Settings (⚙)`
  - Thiết kế CSS thanh footer mỏng, tinh tế, tiết kiệm diện tích tối đa.
- Trong `extension/content/content.js`:
  - Nút `DỊCH` trên player (YouTube / Netflix / ABEMA) giữ nguyên độ mượt mà và hoạt động đồng bộ với thanh điều khiển video.

---

## Kế hoạch kiểm thử (Verification Plan)

### Kiểm thử tự động
- Chạy regression tests về tokenizer / import / normalize:
  `python3 -m unittest discover -s skills/tokenize-regression -p "*.py"`
- Chạy unit tests cho `normalize_cues.js`:
  `node -e "const N = require('./extension/content/normalize_cues.js'); console.assert(N.normalizeCues([{start:0, end:1, text:'（これはテストです）'}])[0].text === '（これはテストです）'); console.log('Normalize check passed');"`

### Kiểm thử thủ công
1. **Kiểm tra xoá Header & Bottom Toolbar**
2. **Kiểm tra Đa Tab**
3. **Kiểm tra Đổi Video trong cùng Tab**
4. **Kiểm tra Mất Sub & Trạng thái Pending**
