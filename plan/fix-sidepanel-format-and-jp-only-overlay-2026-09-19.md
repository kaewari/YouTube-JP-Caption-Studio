<!-- date: 2026-09-19 -->
<!-- source: chat:4fef687c-13a9-4f56-979e-4b240c512af6 · user: Fix bug mất format sidepanel, dư nút quay về câu đang phát, overlay vẫn còn VI/EN -->

# Kế Hoạch Sửa Lỗi: Format Sidepanel, Nút Quay Về Dư Thừa & Video Overlay JP-Only

## 1. Bối Cảnh & Mục Tiêu

Sau khi đối chiếu thực tế với phản hồi của người dùng và 3 ảnh chụp giao diện (`media_1789812848746.png`, `media_1789812922660.png`, `media_1789812927862.png`), hệ thống cần khắc phục 3 vấn đề:

1. **Mất format ở Sidepanel:** Logic placeholder ảo hóa (`isVirtualized`, `sp-placeholder`) khi `cues.length > 100` trong `sidepanel.js` đã thay thế các dòng phụ đề bằng text thô, làm mất furigana ruby, bản dịch VI/EN, phân loại màu JLPT và các nút thao tác.
2. **Dư nút quay về câu đang chạy:** Nút nổi `#sp-scroll-to-active` ("▶ Đến câu đang phát") nằm đè lên góc phải thanh công cụ, trùng lặp chức năng với nút `▶ Cuộn` (`#sp-follow-btn`).
3. **Overlay vẫn còn VI, EN:** Trên màn hình video, `content.js` vẫn đang nối `${viHtml}` và `${enHtml}` vào `bar.innerHTML`, khiến phụ đề tiếng Việt và tiếng Anh hiển thị bên dưới card tiếng Nhật, làm rối mắt và che mất video.

---

## 2. Các Thay Đổi Cụ Thể

### 2.1. Phục Hồi 100% Format Sidepanel (Loại bỏ triệt để Virtualization Placeholder)

#### `extension/sidepanel/sidepanel.js`
- Xóa bỏ hoàn toàn biến `isVirtualized`, `windowStart`, `windowEnd`, và nhánh gán `row.innerHTML = ...sp-placeholder...`.
- Đảm bảo 100% số câu trong danh sách phụ đề Sidepanel luôn được render qua `rowTemplate(cue, idx)` đầy đủ:
  - Furigana ruby (`rubyHtml(cue)`)
  - Màu phân loại JLPT cho từng token
  - Dòng dịch tiếng Việt (`.sp-vi`) và tiếng Anh (`.sp-en`)
  - Nút bấm điều khiển (Phát, Lặp lại, Đánh dấu sao, Sửa câu)
- Xóa bỏ scroll listener ảo hóa giật lag (`virtualScrollRaf`, `lastVirtualScrollTop`).

#### `extension/sidepanel/sidepanel.css`
- Xóa bỏ các CSS rule của `.sp-placeholder`.

---

### 2.2. Xóa Bỏ Hoàn Toàn Nút Nổi "▶ Đến câu đang phát"

#### `extension/sidepanel/sidepanel.html`
- Xóa bỏ phần tử `<button type="button" id="sp-scroll-to-active" class="sp-floating-btn" ...>▶ Đến câu đang phát</button>`.

#### `extension/sidepanel/sidepanel.css`
- Xóa bỏ class `.sp-floating-btn` và các hiệu ứng hover/active liên quan.

#### `extension/sidepanel/sidepanel.js`
- Xóa bỏ biến `scrollToActiveBtn`, hàm `syncFollowBtn()` kiểm tra nút nổi, và event listener gắn vào nút này. Người dùng sử dụng nút `▶ Cuộn` sẵn có trên toolbar để đồng bộ timeline.

---

### 2.3. Loại Bỏ Hoàn Toàn VI và EN Khỏi Video Overlay (JP-Only Immersion)

#### `extension/content/content.js`
- Trong hàm `updateBar()`:
  - Loại bỏ hoàn toàn `${viHtml}` và `${enHtml}` khỏi `bar.innerHTML`.
  - Trên màn hình video chỉ render duy nhất `.lr-card-ja` (nút phát lại, tiếng Nhật kèm furigana ruby và các nút thu/phóng cỡ chữ, đánh dấu sao, cài đặt).
  - Toàn bộ bản dịch tiếng Việt và tiếng Anh tiếp tục được hiển thị đầy đủ, rõ nét trong Sidepanel bên phải.

#### `extension/styles/panel.css`
- Dọn dẹp các rule thừa của `.lr-card-vi`, `.lr-card-en` bên trong `.hardsub-bar` nếu không còn sử dụng trên overlay.

---

## 3. Kế Hoạch Kiểm Thử & Xác Minh (Verification Plan)

### 3.1. Kiểm thử Runtime Trực Tiếp trên Google Chrome
1. **Kiểm tra Sidepanel:**
   - Mở Sidepanel trên tab YouTube thật.
   - Cuộn lên/xuống toàn bộ danh sách phụ đề (>100 câu).
   - Xác nhận 100% các câu đều có đầy đủ định dạng (furigana ruby, màu JLPT, dòng dịch VI/EN, nút bấm hành động), không còn hiện tượng mất format ở bất kỳ vị trí nào.
2. **Kiểm tra Nút Quay Về:**
   - Xác nhận thanh công cụ gọn gàng, không còn nút nổi `▶ Đến câu đang phát` che khuất giao diện.
   - Nút `▶ Cuộn` hoạt động chuẩn xác: bật tự cuộn theo câu đang phát, tắt khi người dùng tự cuộn xem câu khác.
3. **Kiểm tra Video Overlay:**
   - Phát video YouTube và quan sát thanh phụ đề overlay.
   - Xác nhận trên video CHỈ hiển thị duy nhất card tiếng Nhật (`.lr-card-ja`), không có bất kỳ dòng chữ tiếng Việt hay tiếng Anh nào xuất hiện trên màn hình video.
   - Đo đạc kích thước pixel thực tế (`getBoundingClientRect()`) của overlay.

### 3.2. Kiểm thử Tự Động Hóa & Bộ Test Dự Án
1. Chạy `node scripts/test_runtime_resize_green.js` xác nhận các tương tác kéo giãn và toggle phụ đề tiếp tục pass 100%.
2. Chạy `node scripts/test_live_bridge_and_browser.js` xác nhận kết nối bridge, nạp từ điển hover và render furigana hoạt động bình thường.
3. Chạy `node scripts/test_mouse_all_actions.js` xác nhận tương tác chuột/phím native.
4. Chạy `node scripts/verify_no_fake_tests.js` và `./scripts/wiki_sync_and_lint.sh`.
5. Đồng bộ toàn bộ sang repo chính `/Users/hoangson/Projects/YouTube JP Caption Studio`.
