# Kế hoạch sửa lỗi: Netflix Replay (M7375), Nhập liệu tiếng Nhật Side Panel, và Giữ Furigana/JLPT

<!-- date: 2026-08-20 -->
<!-- source: chat:8ed93e19-4660-41cb-b52b-66e929f43965 · user: Fix 3 bugs on Netflix Replay, JA Edit, and Furigana/JLPT retention -->

## 1. Phân tích nguyên nhân gốc rễ

### Bug 1: Lỗi Replay trên Netflix (Error Code M7375)
- **Nguyên nhân**: `seekTo(t)` và `playAt(t)` trong `page_capture.js` gán trực tiếp `video.currentTime = ...` vào thẻ `<video>`. Netflix sử dụng trình phát tùy chỉnh với bảo vệ MSE/EME DRM; việc can thiệp trực tiếp vào DOM `<video>` làm mất đồng bộ buffer và kích hoạt lỗi sập luồng phát **M7375**.
- **Giải pháp**:
  - Trong `extension/injected/page_capture.js`, nhận diện Netflix player qua `getNetflixPlayer()`.
  - Sử dụng API chính thức của Netflix: `player.seek(ms)` và `player.play()` (truyền thời gian theo mili-giây).

### Bug 2: Nhảy con trỏ và tự động mất chữ khi chỉnh sửa tiếng Nhật trên Cue
- **Nguyên nhân**:
  1. `activateJaIme(el)` trong `sidepanel.js` gọi `nudge.focus()` làm focus nhảy ra ngoài rồi nhảy ngược lại textarea, làm mất vị trí con trỏ chuột khi người dùng click vào chữ.
  2. `applyRomajiFallback(el)` liên tục can thiệp và gán lại `el.value` kèm `setSelectionRange` trong các sự kiện `input` và `keyup`, phá vỡ trạng thái gõ IME (tiếng Nhật / tiếng Việt).
- **Giải pháp**:
  - Loại bỏ can thiệp `nudge.focus()` giật focus trong `sidepanel.js`.
  - Tắt can thiệp `applyRomajiFallback` tự động trong quá trình gõ để bộ gõ hệ điều hành (OS IME) hoạt động trơn tru.

### Bug 3: Mất phân cấp màu JLPT và mất Furigana sau khi chỉnh sửa hoặc khi nạp sub
- **Nguyên nhân**:
  1. Trong `content.js`, hàm `enrichTokensAfterImport()` bị chặn nếu cờ `bridgeReady` chưa kịp bật ở mili-giây đầu tiên lúc nạp trang Netflix.
  2. Trong `onJaEdit()`, sau khi token hóa câu vừa sửa, `publishSidePanelState()` không được kích hoạt đúng lúc để cập nhật danh sách `cues` mang tokens mới về Side Panel.
- **Giải pháp**:
  - Bỏ chặn `bridgeReady` cứng trong `enrichTokensAfterImport()`, chủ động gửi request qua bridge proxy.
  - Sau khi `onJaEdit()` hoàn tất token hóa câu mới, gọi `publishSidePanelState({ forceList: true })` và `updateBar(active)` để Side Panel và Overlay lập tức render lại Furigana và màu JLPT tương ứng.
