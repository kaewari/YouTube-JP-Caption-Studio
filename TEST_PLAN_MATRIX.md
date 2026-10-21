# BẢN ĐỒ KIỂM THỬ PHẦN MỀM TOÀN DỰ ÁN (TEST PLAN MATRIX)
**Dự án:** YouTube JP Caption Studio  
**Phiên bản:** v0.11.3  
**Tác giả:** Senior QA Architect & SDET  
**Tiêu chuẩn:** STLC (Software Testing Life Cycle) Framework  

---

## 1. PHÂN TÍCH KIẾN TRÚC & MODULE HỆ THỐNG

Dự án YouTube JP Caption Studio bao gồm 6 phân hệ tương tác chặt chẽ với nhau. Ba phân hệ đầu (1–3) có bộ test tự động; ba phân hệ native (4–6) **chỉ có kiểm thử thủ công** (không có runner tự động trong repo — mọi dòng "manual" dưới đây là việc phải làm tay trên thiết bị/máy thật):

```
[YouTube JP Caption Studio]
 ├── 1. CHROME EXTENSION (MV3)
 │    ├── 1.1 Content Scripts (Injection, Timedtext Hook, Cue Timing, Settings Modal)
 │    ├── 1.2 Sidepanel UI (Subtitles/Words/Saved Tabs, Cues List, Color JLPT, Popover)
 │    ├── 1.3 Service Worker (Background Alarms, Chrome Storage, Drive Sync Mirror)
 │    ├── 1.4 Offscreen Document (Tab Audio Capture, AudioContext Slicing)
 │    └── 1.5 Shared Utilities (Gemini MT, Japanese Diff, URL Hash, Romaji/Kana, Vocab)
 │
 ├── 2. LOCAL BRIDGE (Python FastAPI - localhost:8765)
 │    ├── 2.1 SQLite Engine (WAL Mode, Concurrency Lock, Schema & Triggers)
 │    ├── 2.2 Saved Items & FTS5 (Trigram Full-Text Search, Short-Word Fallback, Tombstones)
 │    ├── 2.3 Two-Way Sync API (POST /saved/sync, GET /saved/items, GET /saved/search)
 │    ├── 2.4 ASR Whisper Service (Async Worker Thread, Metal GPU Inference)
 │    └── 2.5 Dictionary Service (JMdict Lookup, Gloss EN/VI Cache, IME Switch)
 │
 ├── 3. SAVED ITEMS WEB APP (Next.js - web/saved-items)
 │    ├── 3.1 Vocabulary & Sentences Grid View
 │    ├── 3.2 Search & Filter Panel (JLPT Levels, Tags, Sources)
 │    └── 3.3 Static Extension Popup Export (Turbopack Build)
 │
 ├── 4. IPAD APP (SwiftUI - ipad-app/)
 │    ├── 4.1 WKWebView Player (YouTube Embed, Cue Interception)
 │    ├── 4.2 Native Hardsub Overlay (TokenizedJAView + Furigana)
 │    ├── 4.3 Side Panel & Cue Editor (SwiftData)
 │    ├── 4.4 Dict Popup (Bundled dict.sqlite, VI+EN)
 │    └── 4.5 Drive Backup (Files + OAuth)
 │
 ├── 5. IPHONE APP (SwiftUI - iphone-app/)
 │    ├── 5.1 Compact Player (Portrait/landscape layout switch)
 │    ├── 5.2 Overlay & Side Panel (Same core as iPad)
 │    └── 5.3 Drive Backup (Same OAuth flow, separate Bundle ID)
 │
 └── 6. MACOS BRIDGE APP (SwiftUI menu bar - macos-bridge-app/)
      ├── 6.1 Start/Stop/Restart Bridge (start.sh, port 8765)
      ├── 6.2 Health Poll & Status Line (ready/bootstrap)
      ├── 6.3 Saved Items Web App (:3000) shortcut
      └── 6.4 Process Ownership & Port Sweep (kill only own processes)
```

---

## 2. CÁC LUỒNG NGHIỆP VỤ TRỌNG TÂM (CORE END-TO-END FLOWS)

### Flow 1: Nhận diện Video -> Trích xuất Phụ đề -> Hiển thị Song ngữ (E2E Caption Flow)
1. Người dùng mở video trên YouTube / Netflix / ABEMA.
2. `injected/page_capture.js` can thiệp vào `fetch` và `XMLHttpRequest` trong MAIN world để bắt gói tin timedtext gốc (`/api/timedtext` hoặc DFXP/VTT).
3. `timedtext_parse.js` giải mã cấu trúc XML / JSON3 / WebVTT thành danh sách chuẩn hóa `RawCue[]`.
4. `sentence_groups.js` gom nhóm các phân đoạn ngắt rời rạc thành các câu tiếng Nhật hoàn chỉnh, đồng bộ mốc thời gian `start` / `end` với video playback.
5. `cue_timing.js` liên tục theo dõi sự kiện `timeupdate` của thẻ `<video>` để kích hoạt câu đang phát (Active Cue) và vẽ subtitle overlay lên màn hình video cũng như tự động cuộn sidepanel.

### Flow 2: Nâng cấp Dịch Thông minh (Gemini Enhance Translation Flow)
1. Người dùng bật chế độ `Enhanced` hoặc hệ thống tự động chạy background prefetch.
2. `content.js` đưa các câu cần dịch vào Hàng đợi Ưu tiên (Priority Queue):
   - Mức 30: 30 câu trong khung nhìn hiện tại (hiển thị tức thì).
   - Mức 20: 20 câu sắp tới phía trước mốc phát video.
   - Mức 10: Toàn bộ các câu còn lại nạp ngầm (thời gian giãn cách $\ge 6$s, $\le 10$ RPM).
3. `gemini_translate.js` đóng gói lô 30 câu, tự động gối đầu 2 câu ngữ cảnh trước (`groups[i-2]`, `groups[i-1]`) để tạo mạch hội thoại tự nhiên, trung thực, chống ảo giác kiếm hiệp/anime.
4. Xử lý phản hồi từ Gemini API, giải mã JSON trả về, lưu trữ cache local và cập nhật hiển thị đồng thời tại Video Overlay và Sidepanel.

### Flow 3: Nghe Audio Thực tế & So khớp Gợi ý (Audio Listening & Whisper Diff Flow)
1. Người dùng bấm nút `Nghe audio (thử nghiệm)`.
2. `service_worker.js` kích hoạt `offscreen/audio_capture.html` sử dụng `chrome.tabCapture` ghi luồng âm thanh stream từ tab video.
3. AudioContext cắt các lát âm thanh 8 giây với 1.5 giây gối đầu (overlap), tự động phục hồi `audioCtx.resume()` nếu bị treo.
4. Lát cắt âm thanh được gửi tới `local-bridge` qua endpoint `/asr/transcribe`. ASR Service bọc model Whisper trong `asyncio.to_thread` giải mã song song trên GPU Metal.
5. Văn bản nhận diện được gửi ngược lại Extension dưới dạng `ASR_CANDIDATE`.
6. `japanese_diff.js` phân tích sai khác giữa sub gốc và giọng đọc thật bằng `Intl.Segmenter` + LCS:
   - Từ thêm vào hiển thị màu xanh lá `<ins class="sp-diff-ins">`.
   - Từ nhận diện khác hiển thị màu đỏ `<del class="sp-diff-del">`.
7. Người dùng có quyền bấm `Áp dụng` (Accept) để thay thế câu phụ đề hoặc `Bỏ qua` (Revert) để giữ nguyên gốc.

### Flow 4: Lưu Từ vựng & Đồng bộ SQLite Local Bridge (Saved Database & Sync Flow)
1. Người dùng bấm biểu tượng Ngôi sao (Star) trên thẻ phụ đề hoặc click từ vựng tiếng Nhật trong Sidepanel.
2. Dữ liệu được lưu ngay vào `chrome.storage.local` và đưa vào hàng đợi đồng bộ.
3. `service_worker.js` định kỳ gửi dữ liệu tới `local-bridge` qua endpoint `POST /saved/sync`.
4. `saved_items_db.py` thực hiện ghi vào SQLite cơ sở dữ liệu `data/saved_items.db` ở chế độ WAL, áp dụng nguyên tắc Last-Write-Wins (LWW) dựa trên `updated_at`.
5. Bảng ảo FTS5 Trigram tự động index từ khóa để phục vụ tìm kiếm tiếng Nhật siêu tốc qua `GET /saved/search`.
6. Khi người dùng xóa mục, hệ thống tạo bản ghi Tombstone (`is_deleted = 1`) đảm bảo không bị đồng bộ ngược trở lại.

### Flow 5: Đồng bộ Google Drive Đa Tài Khoản (Cloud Drive Sync Flow)
1. Người dùng kết nối Google Drive trong giao diện Cài đặt.
2. Extension tự động dò tìm thư mục mang tên `"YouTube JP Caption Studio"` trên Drive của tài khoản hiện hành (nếu chưa có thì tự động tạo mới theo chuẩn Drive API v3).
3. Hỗ trợ người dùng dán trực tiếp URL thư mục Drive tùy chọn, hệ thống tự động trích xuất Folder ID chuẩn `[A-Za-z0-9_-]{10,}`.
4. Tên file phụ đề được chuẩn hóa theo mã hash video an toàn `[A-Za-z0-9_-]{6,64}.json`.
5. Quá trình upload sử dụng bộ nhớ đệm `_pendingMirror` an toàn, chỉ xóa cờ pending khi Google Drive xác nhận HTTP 200/201.
6. Khi đổi tài khoản Gmail, lệnh `disconnectDrive` gọi `https://accounts.google.com/o/oauth2/revoke` để thu hồi token, giải phóng bộ nhớ đệm `chrome.identity`.

---

## 3. DANH MỤC TEST SCENARIOS THEO MODULE (TEST PLAN MATRIX)

| Mã Module | Tên Module / Tính năng | Kịch bản Happy Path (Chuẩn) | Kịch bản Negative (Lỗi/Ngoại lệ) | Kịch bản Boundary & Edge Cases | Mức ưu tiên |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **MOD-01** | **Timedtext Capture & Parsing** | Bắt đúng gói tin XML, JSON3, WebVTT trên YouTube & Netflix; trích xuất đủ văn bản và thời gian. | Server trả về HTTP 404, gói tin hỏng định dạng, token hết hạn -> Fallback sang phụ đề DOM. | Phụ đề có chứa thẻ HTML lạ, ký tự điều khiển UTF-8, emoji, dấu xuống dòng liên tục. | **P0 (Critical)** |
| **MOD-02** | **Video Navigation & State Persistence** | Chuyển đổi giữa các video YouTube/Netflix/ABEMA; tải phụ đề tương ứng cho video mới. | Mạng bị mất kết nối khi đang chuyển trang -> Thông báo lỗi rõ ràng, cho phép bấm thử lại. | Tua video (scrubbing), bấm tạm dừng YouTube (URL sinh ra `&t=123s`) -> KHÔNG được xóa phụ đề. | **P0 (Critical)** |
| **MOD-03** | **Gemini Rolling Translation** | Dịch lô 30 câu mượt mà, gối đầu 2 câu ngữ cảnh; bản dịch tiếng Việt trung thực, tự nhiên. | API trả về HTTP 429 Quota Exceeded -> Tự động kích hoạt shared cooldown $\ge 1000$ms và thử lại. | Lô chứa câu có độ dài cực ngắn (chỉ 1 chữ "あ", "うん") hoặc cực dài ($> 200$ ký tự Kanji). | **P0 (Critical)** |
| **MOD-04** | **Priority Queue & Rate Limiter** | Cues trong màn hình hiển thị ngay lập tức (P30); các câu tương lai nạp trước ngầm (P10). | API Gemini bị timeout $\ge 15$s -> Hàng đợi giải phóng slot, không làm nghẽn các request sau. | Người dùng tua liên tục qua 10 mốc khác nhau trên thanh tua -> Deduplicate ID, không spam API. | **P1 (High)** |
| **MOD-05** | **Audio Capture & Overlap Slicing** | Luồng âm thanh tab được ghi và cắt thành các lát 8 giây, gối đầu 1.5 giây liên tục. | Người dùng tắt âm thanh tab hoặc tab bị Chrome đóng băng -> Tự động `audioCtx.resume()`. | Lát cắt rơi vào đoạn hoàn toàn im lặng (Silence 0dB) -> Whisper bỏ qua, không sinh candidate rác. | **P1 (High)** |
| **MOD-06** | **ASR Worker & Metal GPU Decoding** | Local Bridge giải mã âm thanh Whisper thành tiếng Nhật chính xác, không block FastAPI. | Driver Whisper bị crash hoặc thiếu file model -> Báo lỗi HTTP 500, trả JSON rõ ràng. | Âm thanh chứa tạp âm lớn, nhiều người nói đè lên nhau, giọng địa phương vùng Kansai. | **P1 (High)** |
| **MOD-07** | **Japanese Inline Diff (LCS)** | So khớp văn bản hiển thị màu xanh `<ins>` cho từ mới và màu đỏ `<del>` cho từ sửa. | Candidate hoàn toàn khác câu gốc ($0\%$ khớp) -> Hiển thị toàn bộ câu mới màu xanh, câu cũ gạch đỏ. | Hai chuỗi hoàn toàn giống hệt nhau $100\%$ -> Không sinh thẻ `<ins>` hay `<del>`, diff rỗng. | **P1 (High)** |
| **MOD-08** | **SQLite WAL Engine & FTS5** | Dữ liệu từ và câu lưu vào SQLite tức thì; tìm kiếm tiếng Nhật trả kết quả $< 5$ms. | File database bị khóa bởi tiến trình khác (`busy_timeout`) -> Tự động thử lại trong 5000ms. | Từ khóa tìm kiếm $< 3$ ký tự (vượt giới hạn Trigram) -> Fallback `LIKE '%q%'` mượt mà. | **P0 (Critical)** |
| **MOD-09** | **Two-Way Sync & Tombstones** | Đồng bộ 2 chiều Extension $\leftrightarrow$ Bridge; mục mới nhất thắng (Last-Write-Wins). | Xung đột mốc thời gian cập nhật -> Chọn bản ghi có `updated_at` lớn hơn; dữ liệu không bị ghi đè rỗng. | Xóa từ trên Extension khi Bridge đang offline -> Tạo tombstone, khi online đồng bộ xóa trên Bridge. | **P1 (High)** |
| **MOD-10** | **Google Drive Dynamic Folder** | Tự động tạo thư mục "YouTube JP Caption Studio"; upload file backup dạng `{videoId}.json`. | Người dùng chưa cấp quyền OAuth hoặc hủy popup đăng nhập -> Hiển thị thông báo, không treo UI. | Đổi tài khoản Gmail mới -> Thu hồi OAuth token thành công, mở bảng chọn tài khoản mới. | **P1 (High)** |
| **MOD-11** | **Sidepanel UI & Button States** | Nút Original (`#1e1e2d`), Enhanced (`#10b981`), Audio (`#0284c7`); đổi tab Sub/Words/Saved. | Extension reload giữa chừng -> Sidepanel tự động phục hồi trạng thái từ cache không cần tải lại. | Sidepanel co hẹp chiều rộng $< 320$px -> Toolbar tự động responsive, không vỡ layout. | **P2 (Medium)** |
| **MOD-12** | **Long Sentence Popover & Hover** | Popover câu dài có thanh cuộn riêng (`max-height: 280px`); rê chuột vào popover không bị tắt. | Rê chuột nhanh qua nút Play -> Không bị chớp tắt giao diện nhờ timer bắc cầu 180ms. | Câu tiếng Nhật dài trên 5 dòng -> Hiển thị thanh cuộn nội bộ, tạm giấu `title` tránh đè tooltip. | **P2 (Medium)** |
| **MOD-13** | **Saved Items Web Application** | Ứng dụng Next.js hiển thị lưới từ vựng, lọc theo cấp độ JLPT N5-N1 và tags đầy đủ. | API Bridge offline -> Hiển thị banner trạng thái mất kết nối, hiển thị dữ liệu đã cache. | Tập dữ liệu $> 5000$ mục từ vựng -> Hiển thị mượt mà không giật lag, build static export thành công. | **P2 (Medium)** |
| **MOD-14** | **iPad App (SwiftUI) — kiểm thử thủ công** | Cài app lên iPad thật (`ipad-app/Scripts/COMMANDS.md`): overlay phụ đề tiếng Nhật có furigana, side panel sửa cue, dict popup VI+EN, lưu từ. | Không có kết nối mạng -> overlay vẫn render từ cue đã nạp, dict dùng `dict.sqlite` bundle sẵn. | Xoay màn hình, cắt app giữa chừng, hết hạn chữ ký 7 ngày -> phải `renew-ipad-signing.sh`, KHÔNG xoá app (mất sandbox). | **P2 (Medium)** — manual |
| **MOD-15** | **iPhone App (SwiftUI) — kiểm thử thủ công** | Cài app lên iPhone thật (`iphone-app/Scripts/COMMANDS.md`): portrait xếp dọc / landscape chia đôi, overlay + side panel, dict popup, Drive backup. | Bundle ID riêng (`com.example.YouTubeJPCaptionStudio.iPhone`) -> cài song song với iPad không đụng nhau. | Không có Auto IME và không có nút mark Known/Learning trên dict popup (khác iPad/Desktop) -> không được tính là lỗi. | **P2 (Medium)** — manual |
| **MOD-16** | **macOS Bridge App (menu bar) — kiểm thử thủ công** | Build `cd macos-bridge-app && ./build.sh`, mở app: menu-bar hiện trạng thái, Start/Stop/Restart bridge (8765), mở Saved Items (3000), mở thư mục log. | Bridge đang chạy bởi Terminal khác -> app không được kill tiến trình của người dùng (chỉ sweep port khi `bridgeProcessOwned`). | Đổi vị trí clone repo -> phải build lại (`Contents/Resources/bridge_root.txt` ghi lúc build); Stop phải dừng được cả uvicorn lẫn saved-items. | **P2 (Medium)** — manual |
