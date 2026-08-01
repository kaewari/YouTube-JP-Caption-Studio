# Kiến trúc & Phân tích chuyên sâu (Technical Walkthrough)

Dự án **YouTube JP Caption Studio** là một hệ thống hỗ trợ học tiếng Nhật qua YouTube. Hệ thống hỗ trợ đa nền tảng với hai hướng tiếp cận kiến trúc chính:
1. **Desktop**: Kiến trúc **Decoupled (Phân tách) / Client-Server** kết hợp giữa Chrome Extension (Front-end), FastAPI (Local Backend), và Next.js (Popup UI). 
2. **iPad**: Kiến trúc **Native Standalone** sử dụng SwiftUI, WKWebView và các framework gốc của Apple.

Tài liệu này được viết dưới góc nhìn của một chuyên gia IT (Software Architect) nhằm phân tích chi tiết toàn bộ mã nguồn, cấu trúc thư mục, kiến trúc hệ thống đa nền tảng, cũng như đánh giá ưu/nhược điểm của thiết kế.

---

## 1. Cấu trúc thư mục & Chi tiết các File/Folder

### 1.1. `ipad-app/` (Native iOS / iPadOS App)
Thư mục này chứa mã nguồn ứng dụng iPad hoàn chỉnh được viết bằng Swift/SwiftUI. Nó là một ứng dụng độc lập (standalone) bám sát tính năng Desktop (hardsub, side panel, tokenize, dict popup, import/export) mà không cần server Python. Một số tính năng Desktop vẫn chưa có trên iPad (đánh dấu Known/Learning/Ignore theo trạng thái user, Auto IME).
- **`Views/`**:
  - `ContentView.swift`: Màn hình chính quản lý Layout (chia đôi màn hình giữa Video và Side Panel); toggle overlay JA/EN/VI/furigana.
  - `YouTubePlayerView.swift`: Gói WKWebView để nhúng video YouTube, tiêm (inject) mã JavaScript để bắt sự kiện thời gian và chặn phụ đề.
  - `HardsubOverlayView.swift`: Hardsub đè lên video — tokenize JA theo màu JLPT, tap từ → dict popup, hiện EN/VI theo settings (default bật).
  - `TokenizedJAView.swift`: Render từng token (furigana + màu N5→N1 / unknown); dùng chung overlay và side panel.
  - `DictPopupView.swift`: Popup tra từ — gloss VI + EN, khối dịch câu (VI/EN của cue), nút Lưu từ vào SwiftData.
  - `SidePanelToolbar.swift` & `CueEditorRow.swift`: Toolbar + editor cue; JA hiển thị dạng token (tap tra từ), nút «Sửa JA» để edit TextField.
- **`Services/`**:
  - `CaptionService.swift` & `SubtitleParser.swift`: Fetch/parse timedtext JSON3/XML từ YouTube và chuẩn hóa cue.
  - `NLPTagger.swift`: `NLTagger` tokenize tiếng Nhật (thay Sudachi); gắn `freqRank` / `jlpt`; furigana qua Latin transcription → hiragana.
  - `FreqService.swift`: Load `freq_ja.json` (cùng map Desktop `vocab_freq.py`) → rank → band JLPT.
  - `VocabStyle.swift`: Bảng màu JLPT parity với `extension/shared/vocab_style.js`.
  - `DictionaryService.swift`: Tra `dict.sqlite` (jmdict / javi / jmdict_vi / en_vi) — mirror local-bridge `/dict` (VI + EN, stem/prefix fallback).
- **`Resources/`**:
  - `dict.sqlite`: JMdict + JA→VI + EN→VI (bundle vào app).
  - `freq_ja.json`: ~15k lemma frequency ranks cho tô màu JLPT.
- **`Models/`**:
  - `ScriptStore.swift` & `VocabStore.swift`: SwiftData lưu script/cue (EN/VI, tombstone) và từ vựng đã lưu từ popup.

### 1.2. `extension/` (Chrome Extension MV3 - Desktop)
Thư mục này chứa mã nguồn thuần của Extension cho Chrome, đóng vai trò là "Client" tương tác trực tiếp với trình duyệt trên máy tính.
- **`injected/page_capture.js`**: Được inject thẳng vào **MAIN world** (môi trường của chính trang web YouTube). Nó override `XMLHttpRequest` / `fetch` để "chặn bắt" (intercept) các request lấy phụ đề gốc (`/api/timedtext`).
- **`content/content.js`**: Tạo ra các overlay DOM (phụ đề cứng) trên video, đồng bộ vị trí hiển thị, quản lý merge cache.
- **`background/service_worker.js`**: Controller giao tiếp với Local Bridge qua HTTP, xử lý các tác vụ nền.
- **`sidepanel/`**: Chứa HTML/CSS/JS render giao diện Side Panel để chỉnh sửa phụ đề (JA, EN, VI).
- **`popup/`**: Chứa các file tĩnh HTML/JS sau khi build Next.js (lấy từ `web/saved-items`).

### 1.3. `local-bridge/` (FastAPI Backend - Desktop)
Đây là Backend chạy ở localhost (`127.0.0.1:8765`) để gánh các tác vụ nặng mà Chrome Extension không thể làm tốt.
- **`app/services/`**:
  - `dictionary.py`: Quản lý query dữ liệu từ điển JMdict (SQLite).
  - `tokenize_ja.py`: Sử dụng thư viện `sudachipy` để chia từ, phân tích từ loại (POS), bóc tách furigana.
  - `script_store.py`: Đọc/ghi các file phụ đề (`.json`/`.txt`) xuống ổ cứng (`data/subtitles/`). Hỗ trợ xuất và nhập file hàng loạt.
  - `ime_switch.py`: Chạy script tự động chuyển bộ gõ (IME) trên macOS.
  - `vocab_freq.py`: Tính toán tần suất và cấp độ JLPT.

### 1.4. `web/saved-items/` (Next.js App)
- Chứa React/Next.js UI Component hiện đại, sử dụng TailwindCSS.
- Dùng để quản lý danh sách từ vựng cá nhân và thiết lập hiển thị phụ đề (Hardsub settings).
- Ứng dụng được export thành static file (`next build`) và ném vào thư mục `extension/popup/`.

---

## 2. Kiến trúc Dự án (System Architecture)

### 2.1 Kiến trúc Desktop (Client-Server Local)
**Vì sao dùng Phân tách cho Desktop?**
1. **Giới hạn của Manifest V3 (MV3)**: MV3 có Service Workers bị kill nếu idle quá lâu. Không thể load toàn bộ engine NLP tiếng Nhật (Sudachi) và database JMdict lên RAM trình duyệt mà không gây lỗi.
2. **Quyền truy cập File System**: Ứng dụng ưu tiên quyền "Data Ownership", muốn lưu file JSON/TXT cứng xuống ổ SSD thay vì IndexedDB mỏng manh. Python xử lý I/O cực tốt.
3. **Tương tác Hệ điều hành**: Bắt buộc phải có process Python/Swift cấp User OS để điều khiển tự động chuyển đổi bộ gõ IME của macOS.

**Ưu điểm**:
- Hiệu năng rất cao, Python đa luồng gánh hết tác vụ nặng.
- Không gửi dữ liệu lên Cloud, bảo mật 100%.

**Nhược điểm**:
- Setup khó khăn: User phải dùng Terminal để chạy `./start.sh` và tải models.
- Tính năng Auto IME bị trói vào macOS.

### 2.2 Kiến trúc iPad (Native Standalone)
**Vì sao làm Native App?**
Chrome Extensions không hoạt động trên iPadOS. Để mang ứng dụng lên Mobile/Tablet, giải pháp tối ưu là viết một Native App độc lập gộp chung cả Client và Server lại với nhau.

**Ưu điểm**:
- Không cần Local Server: Người dùng không phải chạy Python hay Terminal. Tải app về là dùng ngay.
- Tận dụng `WKWebView` siêu việt để bắt trực tiếp request phụ đề của YouTube, vừa sạch vừa ít lỗi.
- NLP cực nhẹ: Nhờ `NLTagger` có sẵn ở tầng OS của Apple, không tốn thêm 50-100MB RAM cho thư viện Sudachi.
- Tương tác cảm ứng mượt mà và giao diện SwiftUI gốc tự nhiên hơn HTML/CSS.

**Nhược điểm**:
- Mất tính năng Auto IME vì iPadOS có sandboxing nghiêm ngặt, không cho phép app đổi bàn phím hệ thống.
- Phải duy trì hai source code hoàn toàn riêng biệt (JavaScript + Python vs. Swift).
- Popup đánh dấu Known/Learning/Ignored/Special và lemma Sudachi vẫn Desktop-first; iPad dùng NLTagger + Lưu từ đơn giản.

---

## 3. Các Luồng Xử Lý Cốt Lõi (Core Workflows)

### 3.1. Luồng Bắt chặn và Xử lý Phụ đề (Caption Intercept Flow)
- **Trên Desktop (`page_capture.js`)**: Monkey-patch đối tượng `XMLHttpRequest` / `fetch`. Bắt các payload `/api/timedtext`.
- **Trên iPad (`WKWebView`)**: Sử dụng WKUserScript để tiêm mã JavaScript vào YouTube, chặn các request phụ đề tương tự, sau đó gửi payload XML/JSON qua `WKScriptMessageHandler` về lớp Swift (`CaptionService.swift`) để xử lý.
- **Merge Data (Luôn Ưu Tiên Dữ Liệu Cục Bộ)**:
  - Hệ thống gọi API (trên Desktop) hoặc gọi trực tiếp Database (trên iPad) để kiểm tra xem Video ID này đã có bản sửa nào của User chưa.
  - Nếu có, các đoạn sub User dịch sẽ đè lên bản auto-gen của YouTube (Data Ownership).
- **Render Overlay**: `content.js` (Desktop) hoặc `HardsubOverlayView` (iPad) sử dụng biến thời gian `media_time` / `currentTimeMs` kết hợp `requestAnimationFrame` (hoặc Timer) để render liên tục các dòng sub lên màn hình video.

### 3.2. Luồng Chỉnh Sửa & Auto-Save
- **Tương tác**: Người dùng chọn 1 dòng sub trong Side Panel để nhập text (JA, EN, VI).
- **IME Magic (Desktop Only)**: Focus vào ô Tiếng Nhật -> Gọi Local Bridge -> Bridge chạy script Swift Native ép hệ điều hành chuyển sang bàn phím tiếng Nhật.
- **Tokenize**:
  - Desktop: Gửi tiếng Nhật lên `/tokenize`, Bridge dùng Sudachi + `vocab_freq` (freq_rank / jlpt).
  - iPad: `NLPTagger` + `FreqService` cục bộ — tách từ, đọc furigana, gán band JLPT từ `freq_ja.json`.
- **Persistence (Lưu trữ)**:
  - Hệ thống sử dụng cơ chế Debounce.
  - Lưu vào RAM ngay để người dùng thấy UI thay đổi.
  - Lưu vào Ổ cứng (JSON qua Bridge, hoặc SwiftData trên iPad) vĩnh viễn, hỗ trợ xuất hàng loạt ra file TXT.

### 3.3. Luồng Tra từ & Tô màu từ vựng (Vocab / Dict)
- **Tô màu theo cấp độ (JLPT hierarchy)**:
  - Desktop: `vocab_style.js` gắn class `jlpt-n5`…`jlpt-n1` / `level-unknown` lên từng token hardsub + side panel.
  - iPad: `VocabStyle` + `TokenizedJAView` tô cùng palette; particle/punct không tô (content-word filter).
- **Tap / hover từ → popup**:
  - Desktop: hover/click token trên hardsub → `#hardsub-ocr-dict`; bridge `POST /dict` trả senses `gloss_vi` + `gloss_en`; khối câu hiện `cue.vi` / `cue.en`.
  - iPad: tap token trên overlay hoặc side panel → `DictPopupView` / sheet; `DictionaryService.lookup` đọc SQLite bundle (cùng schema bridge); hiện VI + EN gloss và dịch câu của cue; **Lưu từ** → `Vocabulary` (SwiftData).
- **Default hiển thị hardsub**: Desktop `barShowEn` / `barShowVi` mặc định bật; iPad đồng bộ (`hardsubShowEN.v2` / `hardsubShowVI.v2` = true). Furigana có toggle riêng.
- **Parity còn thiếu trên iPad**: nút đánh dấu Known / Learning / Ignored / Special trên popup (Desktop có); lemma Sudachi chính xác hơn `NLTagger`.

### 3.4. Xử Lý Xung Đột (Edge Cases)
- **Tombstone (Cơ chế Xóa Sub)**: Khi User ấn "Xóa" một câu phụ đề rác do YouTube tạo ra, thay vì xóa hoàn toàn khỏi mảng nhớ, hệ thống tạo ra một object **Tombstone** (`isDeleted: true`). Trong các lần tải lại sau, trình Merge thấy Tombstone sẽ chủ động ẩn câu gốc của YouTube, chặn sự "hồi sinh" của sub rác.
- **Import/Export Data**: Người dùng có quyền lấy toàn bộ kịch bản, ấn "Import", hệ thống sẽ matching theo ID hoặc thời gian (±0,35s) để map bản dịch vào đúng vị trí video. Hỗ trợ thay thế toàn bộ (Full Replace) hoặc chỉ gộp những phần đã dịch (Partial Merge). Tích hợp xuyên suốt cả iPad và Desktop.
