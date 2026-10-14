<!-- date: 2026-10-12 -->
<!-- source: chat:2f702d85-c899-438b-bab4-52751bb931d1 · user: Tạo worktree mới để fix các bug sau (Ảnh 1, 2, 3, 4) -->

# Kế hoạch triển khai: Sửa các lỗi UI, Bản dịch và Tự động bật chế độ (Enhance & Audio)

## 1. Mục tiêu (Goal Description)
Khắc phục 4 vấn đề được phát hiện trên giao diện và luồng xử lý phụ đề YouTube:
1. **Chất lượng bản dịch (Ảnh 1)**: Bản dịch bị cứng nhắc, thô từng chữ và thán từ/từ đệm ngập ngừng đơn lẻ `"う"` bị dịch sai thành `"chim cốc"` (do từ điển/Google Translate dịch theo chữ Hán 鵜 - chim cốc).
2. **UI Hover nút Play (Ảnh 2)**: Khi di chuột qua nút Play trên thẻ phụ đề sidepanel, popup xem trước câu (`#sp-play-cue-popover`) nổi lên ngay trên vị trí nút bấm làm che khuất nút Play và các nút điều khiển.
3. **Sub tiếng Việt trên Video Overlay (Ảnh 3)**: Phụ đề tiếng Việt hiện đang bị đặt tràn ra ngoài khung nền tối của overlay (nằm trôi nổi trên video); đồng thời mặc định overlay chỉ nên hiển thị phụ đề tiếng Nhật.
4. **Tự động kích hoạt Enhance và Audio khi gặp sub tự động (Ảnh 4)**: Khi video YouTube chỉ có phụ đề tự động (ASR), hệ thống tự động bật cả **Sentence Enhance** và **Nghe Audio** (Whisper); nếu kênh đã có phụ đề thủ công do người tạo tải lên thì giữ mặc định (không tự động bật).
5. **Git Worktree**: Tạo worktree mới và nhánh làm việc riêng biệt (`.worktrees/fix-caption-bugs-ui` / `fix/caption-bugs-ui-auto-modes`) để triển khai và kiểm thử an toàn, không ảnh hưởng trực tiếp tới `master`.

---

## 2. Quyết định thiết kế đã thống nhất qua Grill-Me (User Decisions)

1. **Vị trí popup nút Play (Ảnh 2)**:
   - Giữ popup xem trước câu nhưng hạ vị trí xuống phía dưới nút Play (với khoảng cách an toàn, tránh chồng lấn và tránh giật lag chuột).
   - Thiết lập `pointer-events: none` hoặc cấu hình sự kiện để người dùng bấm nút Play mượt mà không bị popup cản trở.

2. **Hiển thị sub tiếng Việt trên Video Overlay (Ảnh 3)**:
   - Đặt mặc định `barShowVi = false` (khi mở video, overlay chỉ hiển thị tiếng Nhật để người học tập trung).
   - Khi người dùng bật tiếng Việt trong cài đặt overlay, dòng tiếng Việt được đặt **bên trong** cùng một khung nền tối (`lr-card-ja` / khung bo tròn), nằm ngay dưới dòng tiếng Nhật, thay vì trôi nổi bên ngoài khung.

3. **Tự động kích hoạt Enhance & Audio (Ảnh 4)**:
   - Khi nạp danh sách track phụ đề từ YouTube cho video mới:
     - Nếu track tiếng Nhật là phụ đề tự động (ASR, `kind === 'asr'`) và không có track tiếng Nhật thủ công: tự động bật `captionMode = 'enhanced'` và kích hoạt `audioListeningActive = true`.
     - Nếu có track tiếng Nhật thủ công do kênh tải lên: giữ `captionMode = 'original'` và `audioListeningActive = false`.
   - Người dùng vẫn có thể bấm nút để tắt/bật thủ công bất cứ lúc nào trong phiên làm việc.

4. **Nâng cấp chất lượng bản dịch (Ảnh 1)**:
   - Nâng cấp `system_instruction` của Gemini trong `extension/shared/gemini_translate.js`:
     - Chuyển sang văn phong phụ đề phim/anime tự nhiên, đối thoại đời thường (colloquial Vietnamese), thoát ý theo ngữ cảnh, không dịch thô cứng máy móc từng chữ.
     - Thêm chỉ dẫn đặc biệt cho các thán từ, tiếng đệm, từ ngập ngừng (`う`, `えっ`, `あの`, `ええと`, `うん`, `あっ`): thể hiện tự nhiên bằng ngữ điệu ("Ừm...", "Ơ...", "A...", "Ư...") hoặc dấu chấm lửng/lược bỏ nếu là âm thanh ngắt quãng. Tuyệt đối cấm dịch thành danh từ tra từ điển (như `う` -> `chim cốc`).
   - Bổ sung tầng lọc an toàn (sanitization guard) tại client: loại bỏ hoặc sửa các lỗi dịch sai lệch phổ biến từ ASR đơn âm trước khi hiển thị.

---

## 3. Chi tiết các thay đổi dự kiến (Proposed Changes)

### 1. Quản lý Git Worktree
- **Tạo worktree**:
  ```bash
  git worktree add -b fix/caption-bugs-ui-auto-modes .worktrees/fix-caption-bugs-ui master
  ```
- Mọi chỉnh sửa mã nguồn và chạy test kiểm thử sẽ được thực hiện tại thư mục worktree này.

---

### 2. Thành phần: Chất lượng bản dịch (`gemini_translate.js` & `normalize_cues.js`)

#### `[MODIFY]` `extension/shared/gemini_translate.js`
- Nâng cấp `system_instruction` trong payload gửi đến Gemini với hướng dẫn chi tiết về văn phong tự nhiên tiếng Việt và xử lý thán từ.
- Tăng `PROMPT_VERSION` từ `1` lên `2` để cache cũ tự động được làm mới.
- Thêm hàm `sanitizeTranslation(text, source)` loại trừ lỗi tra từ điển đơn âm.

---

### 3. Thành phần: UI nút Play trên Sidepanel (`sidepanel.js` & `sidepanel.css`)

#### `[MODIFY]` `extension/sidepanel/sidepanel.js`
- Cập nhật hàm `showPlayPopover(btn)`:
  - Tính toán tọa độ hiển thị: đặt popover nằm **phía dưới** nút Play (`top = rect.bottom + 8`), căn chỉnh theo lề nút Play.
  - Kiểm tra `window.innerHeight` để tránh tràn màn hình dưới.
  - Thêm `pointer-events: none` cho popover.

#### `[MODIFY]` `extension/sidepanel/sidepanel.css`
- Thêm thuộc tính `pointer-events: none` và tinh chỉnh khoảng cách, bóng đổ cho `#sp-play-cue-popover`.

---

### 4. Thành phần: Sub tiếng Việt trên Video Overlay (`content.js` & `panel.css`)

#### `[MODIFY]` `extension/content/content.js`
- Đổi giá trị mặc định của `barShowVi`: `false` thay vì `true`.
- Đưa `${viHtml ? ... : ""}` vào bên trong khung nền tối của overlay (bên trong `.lr-card-ja`).

#### `[MODIFY]` `extension/styles/panel.css`
- Tinh chỉnh `.hardsub-bar .lr-card-ja` để tự mở rộng chiều cao khi hiển thị phụ đề song ngữ, bọc trọn vẹn cả tiếng Nhật và tiếng Việt bên trong card.

---

### 5. Thành phần: Tự động bật Enhance và Audio khi gặp Sub tự động (`content.js` & `service_worker.js`)

#### `[MODIFY]` `extension/content/content.js`
- Kiểm tra danh sách track phụ đề: nếu chỉ có sub tự động ASR (`track.kind === "asr"`) thì tự động kích hoạt `captionMode = "enhanced"` và `audioListeningActive = true`.
- Nếu có sub thủ công do kênh tải lên: giữ `captionMode = "original"` và `audioListeningActive = false`.

---

## 4. Kế hoạch kiểm thử (Verification Plan)

### Automated Tests
1. `node extension/shared/gemini_translate_test.js`: Đảm bảo prompt mới, cache version 2 và hàm lọc hoạt động chính xác.
2. `node extension/shared/sentence_groups_test.js` & `sentence_candidates_test.js`: Kiểm tra phân nhóm câu và ứng viên phụ đề.
3. `cd local-bridge && python3 -m pytest -q tests/`: Đảm bảo toàn bộ test của local bridge chạy qua 100%.
4. `git diff --check`: Đảm bảo diff sạch sẽ.

### Manual / Browser Verification
1. Video có sub tự động (ASR): kiểm tra tự động bật Enhance + Audio, kiểm tra từ `う` không còn bị dịch thành `chim cốc`.
2. Video có sub do kênh tạo: kiểm tra giữ nguyên chế độ Original, Audio tắt.
3. Hover nút Play trên sidepanel: kiểm tra popup hiển thị phía dưới nút Play, không che nút.
4. Overlay trên video: kiểm tra mặc định tắt tiếng Việt; khi bật tiếng Việt thì nằm trọn vẹn bên trong khung tối của overlay.
