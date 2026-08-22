<!-- date: 2026-08-21 -->
<!-- source: chat:c5fa6d96-7795-40a1-be50-ddf5588d523d · user: fix bug where EN and VI captions do not load on Netflix -->

# Kế Hoạch Sửa Lỗi Không Load Được Phụ Đề EN và VI Trên Netflix

## Tổng quan vấn đề
Khi phát video trên Netflix có sẵn phụ đề Tiếng Nhật (JA), Tiếng Anh (EN) và Tiếng Việt (VI):
- Phụ đề Tiếng Nhật (JA) hiển thị bình thường.
- Cột EN và VI trên Sidepanel / Overlay bị trống hoàn toàn.

### Nguyên nhân gốc rễ (Root Causes)
1. **Chỉ chấp nhận DFXP, bỏ qua WebVTT**: Hàm `noteNetflixTimedtext` trong `page_capture.js` có điều kiện cứng `!text.includes("<tt") || !text.includes("<p")`, khiến toàn bộ các file phụ đề định dạng WebVTT (`WEBVTT ...`) của Netflix bị loại bỏ.
2. **Nhận diện ngôn ngữ bị sai do credit đầu phim**: Hàm đoán ngôn ngữ chỉ kiểm tra 10 câu đầu tiên (`cues.slice(0, 10)`). Các câu đầu phim thường là tên hãng phim / diễn viên / credit bằng chữ cái Latinh, không chứa dấu tiếng Việt nên bị regex `[a-zA-Z]` nhận định nhầm thành `"en"`, dẫn đến đè sub VI vào EN và để trống cột VI.
3. **Quá trình chuyển track ngầm (switchTrackAndWait) bị ngắt quãng**: Thời gian chờ sau khi gọi `setTimedTextTrack` quá ngắn (chỉ 800ms) trước khi chuyển tiếp sang track khác, khiến network fetch chưa kịp hoàn tất đã bị hủy bởi lệnh chuyển track tiếp theo.
4. **Thiếu định danh ngữ cảnh probe**: Khi extension chủ động đổi track sang `enTrack` hoặc `viTrack`, `noteNetflixTimedtext` không biết trước track nào đang được yêu cầu để gán trực tiếp, phải dựa vào việc đoán nội dung.

---

## Giải pháp kỹ thuật chi tiết

### 1. Hỗ trợ đa định dạng phụ đề (DFXP + WebVTT)
- Trong `page_capture.js`:
  - Xây dựng hàm `parseSubtitlePayload(text)` thống nhất: tự động nhận diện và phân tích cú pháp cho cả định dạng DFXP TTML (`<tt>`, `<p>`) và WebVTT (`WEBVTT`, `-->`).
  - Cập nhật `noteNetflixTimedtext` và `isNetflixUrl` để bắt trọn các request phụ đề từ mọi CDN của Netflix (`nflxvideo.net`, `nflxext.com`, `nflxso.net`, `nflximg.net`, `timedtext`, `.dfxp`, `.vtt`).

### 2. Định danh ngôn ngữ chính xác & Cơ chế Probing Lang
- Trong `page_capture.js`:
  - Thêm biến trạng thái `probingLang` ("en" | "vi" | "ja" | null): Khi extension gọi `switchTrackAndWait(enTrack, "en")`, đặt `probingLang = "en"`. Mọi response subtitle nhận được trong lúc này sẽ được gán trực tiếp cho `netflixState.enCues` mà không cần đoán mò.
  - Cải tiến thuật toán phát hiện ngôn ngữ dự phòng: Quét qua toàn bộ các câu trong file (hoặc tối thiểu 100 câu) để phát hiện ký tự tiếng Nhật (Hiragana/Katakana/Kanji) và nguyên âm có dấu tiếng Việt (`àáạ...`).

### 3. Tối ưu hóa chu trình chuyển track ngầm & Thời gian chờ
- Trong `page_capture.js`:
  - Nâng timeout của `switchTrackAndWait` lên tối đa 2000ms cho mỗi track (hoặc dừng ngay khi đã nhận được dữ liệu `got(langKey)`).
  - Trình tự thực hiện:
    1. Probe `enTrack` -> chờ nhận `enCues` (hoặc timeout).
    2. Probe `viTrack` -> chờ nhận `viCues` (hoặc timeout).
    3. Chuyển lại `jaTrack` (bắt buộc) để người dùng tiếp tục xem phim bằng tiếng Nhật gốc.
  - Quét bổ sung `video.textTracks` nếu native player đã mount sẵn các track `VTTCue` của EN hoặc VI.

### 4. Gộp phụ đề và Lưu đệm (Cache / Disk Save)
- Trong `content.js`:
  - Khi nhận được `{ cues, enCues, viCues }` từ Netflix: `applyLoadedCues` tự động gọi `applyYtSecondaryFill` để khớp thời gian và gắn EN + VI vào từng dòng tiếng Nhật JA.
  - Tự động lưu bản dịch 3 cột vào bộ nhớ đệm `chrome.storage.local` và file `cues.json` trên bridge (`local-bridge/data/subtitles/netflix__<id>/`) để các lần xem lại sau nạp tức thì trong 100ms.

---

## Kế hoạch kiểm thử (Verification Plan)

### Kiểm thử tự động
- Unit tests & syntax checks cho `page_capture.js` và `content.js`.

### Kiểm thử thủ công
1. Mở video bất kỳ trên Netflix có sub JA, EN, VI.
2. Xác nhận Sidepanel hiển thị đủ 3 cột JA + EN + VI.
