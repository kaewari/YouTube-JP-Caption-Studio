# Kiến trúc & Phân tích chuyên sâu (Technical Walkthrough)

Dự án **YouTube JP Caption Studio** là một hệ thống hỗ trợ học tiếng Nhật qua YouTube. Hệ thống hỗ trợ đa nền tảng với hai hướng tiếp cận kiến trúc chính:
1. **Desktop**: Kiến trúc **Decoupled (Phân tách) / Client-Server** kết hợp giữa Chrome Extension (Front-end), FastAPI (Local Backend), và Next.js (Popup UI). 
2. **iPad / iPhone**: Kiến trúc **Native Standalone** sử dụng SwiftUI, WKWebView và các framework gốc của Apple (`ipad-app/` + sibling `iphone-app/`).

Tài liệu này được viết dưới góc nhìn của một chuyên gia IT (Software Architect) nhằm phân tích chi tiết toàn bộ mã nguồn, cấu trúc thư mục, kiến trúc hệ thống đa nền tảng, cũng như đánh giá ưu/nhược điểm của thiết kế.

---

## 1. Cấu trúc thư mục & Chi tiết các File/Folder

### 1.1. `ipad-app/` (Native iOS / iPadOS App)
Thư mục này chứa mã nguồn ứng dụng iPad hoàn chỉnh được viết bằng Swift/SwiftUI. Nó là một ứng dụng độc lập (standalone) bám sát tính năng Desktop (hardsub, side panel, tokenize, dict popup, import/export) mà không cần server Python. Một số tính năng Desktop vẫn chưa có trên iPad (đánh dấu Known/Learning/Ignore theo trạng thái user, Auto IME).
- **`Views/`**:
  - `ContentView.swift`: Layout Video + Side Panel (breakpoint `width >= 800`); address-bar Back/Forward (WKWebView history); toggle **Theo timeline** (pin ~24pt, coalesce, gap-hold); overlay JA/EN/VI/furigana; **full** (cùng path iPhone — §1.1b): ẩn `topBar` khi FS + floating exit chrome trên player.
  - `YouTubePlayerView.swift`: WKWebView YouTube + JS inject (media time, chặn phụ đề); `goBack`/`goForward` theo `canGoBack`/`canGoForward`; app maximize (`fullscreenHandler` + `__csToggleFull`; `isElementFullscreenEnabled = false`).
  - `HardsubOverlayView.swift`: Hardsub đè lên video — tokenize JA theo màu JLPT, tap từ → dict popup, hiện EN/VI theo settings (default bật).
  - `TokenizedJAView.swift`: Render từng token (furigana + màu N5→N1 / unknown); dùng chung overlay và side panel.
  - `DictPopupView.swift`: Popup tra từ — gloss VI + EN, khối dịch câu (VI/EN của cue), nút Lưu từ vào SwiftData.
  - `SidePanelToolbar.swift` & `CueEditorRow.swift`: Toolbar + editor cue; label **ĐANG PHÁT** luôn reserve height (opacity) — không flash khi đổi cue.
- **`Services/`**:
  - `CaptionService.swift` & `SubtitleParser.swift`: Fetch/parse timedtext JSON3/XML từ YouTube và chuẩn hóa cue.
  - `NLPTagger.swift`: `NLTagger` tokenize tiếng Nhật (thay Sudachi); gắn `freqRank` / `jlpt`; furigana qua Latin transcription → hiragana.
  - `FreqService.swift`: Load `freq_ja.json` (cùng map Desktop `vocab_freq.py`) → rank → band JLPT.
  - `VocabStyle.swift`: Bảng màu JLPT parity với `extension/shared/vocab_style.js`.
  - `DictionaryService.swift`: Tra `dict.sqlite` (jmdict / javi / jmdict_vi / en_vi) — mirror local-bridge `/dict` (VI + EN, stem/prefix fallback).
  - `SettingsSync.swift` / `VocabSync.swift`: Drive OAuth sync — `caption-studio-settings.json` / vocab-only `caption-studio-backup.json` (xem §3.5).
  - `DriveAuthService.swift` / `DriveOAuthConfig.swift`: OAuth iOS (`ASWebAuthenticationSession` + PKCE). **Phải** dùng client kiểu iOS trên GCP — không dùng `client_id` Chrome extension.
  - `DriveAPIClient.swift` / `DriveScriptsService.swift`: Drive REST — pull panel ưu tiên **`script.txt`** (fallback `cues.json` nếu TXT thiếu/rỗng), patch write-back `cues.json` + `meta.json` (Lamport `rev`). (iPhone cùng logic.)
- **`Resources/`**:
  - `dict.sqlite`: JMdict + JA→VI + EN→VI (bundle vào app).
  - `freq_ja.json`: ~15k lemma frequency ranks cho tô màu JLPT.
- **`Models/`**:
  - `ScriptStore.swift` & `VocabStore.swift`: SwiftData lưu script/cue (EN/VI, tombstone) và từ vựng đã lưu từ popup.

### 1.1b. `iphone-app/` (Native iPhone — sibling của iPad)
Copy chức năng từ `ipad-app/` với Bundle ID riêng `com.example.YouTubeJPCaptionStudio.iPhone` (`TARGETED_DEVICE_FAMILY = 1`). Cài song song với app iPad được. `Resources/dict.sqlite` + `freq_ja.json` **symlink** về `ipad-app/Resources/` (không nhân đôi ~137MB).
- **Layout theo orientation** (không dùng breakpoint 800pt): portrait = player trên + panel dưới + address bar; landscape = **ẩn topBar**, player trái + panel phải. Landscape floating chrome: 4 icon overlay → panel → timeline → **full** (`arrow.up.left.and.arrow.down.right`; không Import/Export/settings). Soft CSS widen (`@media landscape` width 100%, `object-fit: contain`) — không ẩn `#below`/`#secondary`/`#related`, không `overflow: hidden` / fixed player. iPhone ẩn masthead + title/owner YT (giữ overlay/sidebar/timeline/full icons + active cue).
- **Panel thuần JP/VI**: chỉ list cue — timestamp + JA + VI (+ ĐANG PHÁT ổn định); không toolbar / playhead / tabs / menu cue / EN. Portrait ellipsis Menu: **Connect Google Drive** thôi (giữ overlay/panel/timeline/full pills trên bar).
- Panel fraction: portrait ~0.42 (min 140 / max 0.55); landscape default **0.28** (min 160 / max 0.36, drag 0.22…0.36) — player ~64–78% ngang.
- Chức năng nền: hardsub, tokenize/dict, Drive sync, follow timeline (icon + `followResumeNonce`); **full** (iPhone **và** iPad, cùng path): **chỉ app maximize** — bỏ `video.webkitEnterFullscreen()` (lớp OS native FS đè lên overlay → ẩn sub, 2026-08-03); intercept `.ytp-fullscreen-button` + pill → `window.__csToggleFull()` vào thẳng app mode (panel off, overlay giữ); safety net `webkitbeginfullscreen` + `fullscreenchange` ép mọi OS video/element FS về app maximize (`webkitExitFullscreen`/`exitFullscreen`); `isElementFullscreenEnabled = false`; thoát = pill / FS lần 2. Chrome khi FS: iPad ẩn `topBar` + floating exit trên player; iPhone dùng landscape chrome pills (mục layout trên). Không expose UI vocab/import/export/wipe/settings trên iPhone. Không port Auto IME / Known/Learning marks (Desktop-only).
- Deploy: `iphone-app/Scripts/deploy-iphone.sh` / `renew-iphone-signing.sh` — **không xoá app** khi update (giống iPad).

### 1.2. `extension/` (Chrome Extension MV3 - Desktop)
Thư mục này chứa mã nguồn thuần của Extension cho Chrome, đóng vai trò là "Client" tương tác trực tiếp với trình duyệt trên máy tính.
- **`injected/page_capture.js`**: Được inject thẳng vào **MAIN world** (môi trường của chính trang web YouTube). Nó override `XMLHttpRequest` / `fetch` để "chặn bắt" (intercept) các request lấy phụ đề gốc (`/api/timedtext`).
- **`content/content.js`**: Overlay DOM + merge cache. Toggle Overlay/DỊCH: ON mở side panel; OFF chỉ ẩn overlay (panel vẫn mở). Load multi-lang: JA→`source`, EN→`en`, VI→`vi` (không bao giờ nhét VI vào `source`); intercept chỉ là hint/`baseUrl`; **union-merge** ±0,35s + orphan khi chưa owned; status `en:N vi:M`; lock/import không bị ghi đè. `findActiveCue` gap-hold (giữ highlight tới start cue sau; last cue +150ms).
- **`background/service_worker.js`**: Controller Local Bridge; `YT_LOAD_CAPTIONS` fetch song song best track `ja*` / `en*` / `vi*` (khi có trên `captionTracks`) → trả `cues` + `enCues`/`viCues` riêng.
- **`sidepanel/`**: HTML/CSS/JS Side Panel (JA/EN/VI). **Theo timeline**: pin active ~24px dưới đỉnh list, scroll coalesce, label **ĐANG PHÁT** reserved; kéo list → pause follow (resume không đổi UX).
- **`popup/`**: Chứa các file tĩnh HTML/JS sau khi build Next.js (lấy từ `web/saved-items`).

### 1.3. `local-bridge/` (FastAPI Backend - Desktop)
Đây là Backend chạy ở localhost (`127.0.0.1:8765`) để gánh các tác vụ nặng mà Chrome Extension không thể làm tốt.
- **`app/services/`**:
  - `dictionary.py`: Quản lý query dữ liệu từ điển JMdict (SQLite).
  - `tokenize_ja.py`: Sử dụng thư viện `sudachipy` để chia từ, phân tích từ loại (POS), bóc tách furigana.
  - `script_store.py`: Per-video folder `data/subtitles/{videoId}/` — **`script.txt` = load source of truth** (PC `load_script` ưu tiên TXT; sync lại `cues.json`); `cues.json` = wire/cache (+ write-back iPad); `meta.json`; `tokens.json` local-only. Lamport `rev`, cờ `owned`. `script.txt` luôn emit đủ `JA:`/`EN:`/`VI:` mỗi cue (dòng trống được phép).
  - `snapshot.py`: Encode/decode Snapshot v1 (`GET`/`POST /backup/snapshot`) — legacy/slim; script sync chính = folder mirror qua `/scripts/{id}/files`.
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

### 2.2 Kiến trúc iPad / iPhone (Native Standalone)
**Vì sao làm Native App?**
Chrome Extensions không hoạt động trên iPadOS/iOS. Để mang ứng dụng lên Mobile/Tablet, giải pháp tối ưu là viết Native App độc lập gộp chung cả Client và Server lại với nhau — `ipad-app/` (iPad) và `iphone-app/` (iPhone, layout portrait stacked / landscape split).

**Ưu điểm**:
- Không cần Local Server: Người dùng không phải chạy Python hay Terminal. Tải app về là dùng ngay.
- Tận dụng `WKWebView` siêu việt để bắt trực tiếp request phụ đề của YouTube, vừa sạch vừa ít lỗi.
- NLP cực nhẹ: Nhờ `NLTagger` có sẵn ở tầng OS của Apple, không tốn thêm 50-100MB RAM cho thư viện Sudachi.
- Tương tác cảm ứng mượt mà và giao diện SwiftUI gốc tự nhiên hơn HTML/CSS.
- iPhone + iPad cài cùng lúc (Bundle ID khác nhau); dict/freq assets chia sẻ qua symlink.

**Nhược điểm**:
- Mất tính năng Auto IME vì iOS/iPadOS có sandboxing nghiêm ngặt, không cho phép app đổi bàn phím hệ thống.
- Phải duy trì source native riêng (`ipad-app` / `iphone-app` fork layout) bên cạnh JavaScript + Python Desktop.
- Popup đánh dấu Known/Learning/Ignored/Special và lemma Sudachi vẫn Desktop-first; native dùng NLTagger + Lưu từ đơn giản.

---

## 3. Các Luồng Xử Lý Cốt Lõi (Core Workflows)

### 3.1. Luồng Bắt chặn và Xử lý Phụ đề (Caption Intercept Flow)
- **Trên Desktop (`page_capture.js`)**: Monkey-patch đối tượng `XMLHttpRequest` / `fetch`. Bắt các payload `/api/timedtext`.
- **Trên iPad (`WKWebView`)**: Sử dụng WKUserScript để tiêm mã JavaScript vào YouTube, chặn các request phụ đề tương tự, sau đó gửi payload XML/JSON qua `WKScriptMessageHandler` về lớp Swift (`CaptionService.swift`) để xử lý.
- **YT multi-lang load (Desktop)**: Mục tiêu = JA→`source`, EN→`en`, VI→`vi` (**không** nhét VI vào `source`); intercept chỉ hint/`baseUrl`; union ±0,35s; orphan khi chưa owned; status `en:N vi:M`. Locked/import không bị overwrite. **Open (xem §3.7):** SW thường thấy track nhưng body rỗng → user phải bật CC tay; panel chậm vì chờ bridge + await đủ EN/VI.
- **Merge Data (Luôn Ưu Tiên Dữ Liệu Cục Bộ)**:
  - Hệ thống gọi API (trên Desktop) hoặc gọi trực tiếp Database (trên iPad) để kiểm tra xem Video ID này đã có bản sửa nào của User chưa.
  - Nếu có, các đoạn sub User dịch sẽ đè lên bản auto-gen của YouTube (Data Ownership).
- **Render Overlay**: `content.js` (Desktop) hoặc `HardsubOverlayView` (iPad) sử dụng biến thời gian `media_time` / `currentTimeMs` kết hợp `requestAnimationFrame` (hoặc Timer) để render liên tục các dòng sub lên màn hình video.
- **Thử multi-lang**: Video có CC JA+EN+VI (**không cần bật từng CC** — khi fix §3.7 xong) → Reload → cột EN/VI có chữ; status `en:N vi:M`; `script.txt` đủ 3 dòng.

### 3.2. Luồng Chỉnh Sửa & Auto-Save
- **Tương tác**: Người dùng chọn 1 dòng sub trong Side Panel để nhập text (JA, EN, VI).
- **IME Magic (Desktop Only)**: Focus vào ô Tiếng Nhật -> Gọi Local Bridge -> Bridge chạy script Swift Native ép hệ điều hành chuyển sang bàn phím tiếng Nhật.
- **Tokenize** (furigana + phân cấp JLPT):
          - Desktop: `/tokenize` + `/tokenize_batch` (Sudachi + `vocab_freq`). **Mọi video:** ngay khi load được JA → luôn batch tokenize (không chỉ script `owned`). Bridge offline → retry khi `/health` ready.
  - iPad: `NLPTagger` + `FreqService` live trên JA (không `tokens.json` trên device).
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
- **Import/Export Data**: Người dùng có quyền lấy toàn bộ kịch bản, ấn "Import", hệ thống sẽ matching theo ID hoặc thời gian (±0,35s) để map bản dịch vào đúng vị trí video. Hỗ trợ thay thế toàn bộ (Full Replace) hoặc chỉ gộp những phần đã dịch (Partial Merge). Tích hợp xuyên suốt cả iPad và Desktop. **Desktop thêm:** YT multi-lang union-merge (±0,35s; orphan khi chưa owned) rồi lưu + đẩy side panel — Import / `mt_locked` vẫn thắng.

### 3.5. Drive sync PC ↔ iPad (folder mirror + vocab/settings)

Folder Drive cố định: `1K8LPtKici0gVaq5FuTMDmYDWzPpBokFA` — [mở folder](https://drive.google.com/drive/folders/1K8LPtKici0gVaq5FuTMDmYDWzPpBokFA).

#### Scripts — per-video folder mirror

Mỗi video = folder `<videoId>/` trên Drive (và `data/subtitles/{videoId}/` trên PC). Bốn file cùng mô tả **một** video; mỗi file một việc:

| File | Lên Drive? | Vai trò |
|------|------------|---------|
| `script.txt` | ✅ | **Bản đọc được + nguồn load chính** (PC bridge + iPad/iPhone Drive pull). Khối theo thời gian với `JA:` / `EN:` / `VI:` (luôn đủ 3 dòng, được phép trống); furigana `(…)` khi render kèm tokens. |
| `cues.json` | ✅ | **Bản máy đọc** cùng nội dung: `id`, timing, `source`/`en`/`vi`, lock… — save/patch nhanh (extension, iPad write-back). Không chứa tokens; wire/cache — load ưu tiên TXT rồi sync lại file này nếu lệch. |
| `meta.json` | ✅ | **Metadata + đồng bộ** (không phải lời thoại): `owned`, Lamport `rev`, `deviceId`, title/url, `cue_count`… — quyết định bản nào mới hơn giữa PC / Drive / thiết bị. |
| `tokens.json` | ❌ local-only | **Furigana / JLPT / surface** theo cue `id` — chỉ trên PC (bridge). Extension hydrate để tô màu level + popup từ vựng. Thiếu file này → mất furigana/màu/popup dù JA vẫn còn. |

**PC (extension + bridge):**
- Bridge `load_script`: ưu tiên parse **`script.txt`** (≥1 cue) → sync `cues.json` + bump `rev` nếu đổi; fallback `cues.json` chỉ khi thiếu/rỗng TXT. `GET /scripts` hưởng theo.
- Bridge: `GET/POST /scripts/{id}/files` (3 file mirror; `read_files` không đè `script.txt` có sẵn), `GET /scripts/{id}/meta`, `GET /scripts/{id}/tokens`; library index có `rev` / `owned` / `cue_count`.
- Extension: **Upload Drive** / `mirrorToDrive` / `mirrorFromDrive` — đọc owned từ disk `meta.json` (không chỉ chrome.storage).
- Freshness = Lamport `rev` trong `meta.json` (không dùng mtime / clock).

**iPad / iPhone:**
- **Thư mục** = Connect Drive (OAuth `ASWebAuthenticationSession` + PKCE) rồi sync — **không** cần Files “Open folder” (Drive File Provider làm Open folder xám).
- Pull panel: **`script.txt` trước**; fallback `cues.json` chỉ khi TXT thiếu/parse rỗng → import SwiftData; push sửa → patch `cues.json` + bump `meta.json` rev.
- UI dùng cues trả về từ sync (không phụ thuộc predicate relationship `ScriptCue.load` sau import).

#### Vocab + settings (cùng folder gốc)

- **Vocab** — `caption-studio-backup.json`: LWW; wire `{ version, updatedAt, scripts: [], vocab: [...] }` — chỉ Vocabulary (scripts không qua file này).
- **Settings** — `caption-studio-settings.json`: auto pull/push sau Connect; không sync geometry. Keys: furigana, barShow*/barScale/opacities, dimHardsub, dictShowSentence, JLPT colors, followTimeline, isDarkTheme, sidePanelFontScale.
- Files **Backup**/**Restore** trên iPad = fallback offline/reinstall.

#### Setup OAuth (một lần)

**PC (Chrome extension):**
1. GCP → OAuth client kiểu **Chrome Extension** → `extension/manifest.json` (`oauth2.client_id`). Reload.
2. Chạy local-bridge (`./start.sh`).
3. Side panel → **Connect Drive** → **Upload Drive** để đẩy mirror ngay.

**iPad (bắt buộc client riêng):**
1. GCP (cùng project) → OAuth client kiểu **iOS**, bundle `com.example.YouTubeJPCaptionStudio`.
2. Paste `….apps.googleusercontent.com` vào `ipad-app/Services/DriveOAuthConfig.swift` (`clientId`) — **không** dùng client Chrome (→ Error 400 `invalid_request`).
3. URL scheme / `project.yml`: `com.googleusercontent.apps.<prefix>` (reverse-client-id); redirect `…:/oauth2redirect`.
4. App → **Thư mục** → Connect Drive.

Chi tiết lệnh: `ipad-app/Scripts/COMMANDS.md` (mục OAuth).

**Smoke:** PC save/Upload → Drive có `<videoId>/{cues,meta,script}` → iPad/iPhone Connect → side panel có cue từ **`script.txt`** (không lấy nhầm `cues.json` test/garbage). Sửa iPad → `cues.json` + `rev` tăng → PC mirrorFromDrive. Vocab/settings: Connect một lần → file JSON cập nhật hai chiều. Thử lệch: nếu `cues.json` sai mà `script.txt` đúng → Reload / Connect vẫn hiện bản TXT.

### 3.6. Theo timeline + Back/Forward (iPad / Desktop side panel)

- **Back/Forward** (iPad — chevron cạnh ô URL): lịch sử `WKWebView` (`goBack`/`goForward`) — không phải seek cue. Thử: mở YouTube → vào watch → Back về home; Forward khi có history.
- **Theo timeline** (iPad + Desktop extension — cùng hành vi):
  - Active cue **pin** sát đỉnh list (~**24px** dưới mép; không dùng ngưỡng % chiều cao).
  - Pin via **`scrollTop`** + **coalesce** (cancel in-flight RAF → retarget) — cue ngắn không chồng scroll.
  - **Gap-hold highlight**: giữa hai cue vẫn giữ row vừa phát tới start cue sau; last cue +150ms grace (iPad `ScriptCue.active` / Desktop `findActiveCue`).
  - Label **ĐANG PHÁT** luôn reserve height (opacity) — không flash khi đổi cue.
  - Kéo list / sửa cue → pause follow; bật lại **Theo timeline** → resume (UX nút không đổi).
  - Soft advance: RAF ease `scrollTop` → `pinRowScrollTop` (~380ms easeInOutQuint, exact end); force/resume instant. (Không `scrollTo` smooth — undershoot.)
  - Coalesce callback không cuộn khi đang sửa cue (cùng iPad `editingCue` guard).
  - **Verify (Desktop, 2026-08-02):** sau Reload — play vài cue → smooth pin sát đỉnh, không trôi / không nhảy tức thì.
- **Thử**: sau **Reload** extension → hard-refresh YT → bật Theo timeline → play qua vài cue (kể cả dòng ngắn + khoảng trống giữa cue) → row active dính ~đỉnh list (không kẹt “một cue sau”), highlight không tắt trong gap, thấy **ĐANG PHÁT**; kéo tay → follow tắt; bấm lại Theo timeline → bám lại.

### 3.7. Bug ledger (normalized) — 2026-08-02

Bảng gộp symptom → root cause → trạng thái. Chi tiết / lịch sử: [`INCIDENTS.md`](./INCIDENTS.md). Runtime: `local-bridge/errors.log`.

| ID | Symptom | Root cause | Status |
|----|---------|------------|--------|
| B1 | Overlay OFF tắt luôn side panel | `setShowOnVideo(false)` gọi `closeSidePanel` | **Fixed** — OFF chỉ ẩn overlay |
| B2 | Side panel không mở | SW crash: JSDoc `en*/vi*` cắt comment sớm | **Fixed** |
| B3 | Panel hiện `あ`/`vi0` (3 nền tảng) dù `script.txt` đúng | Load từ `cues.json` rác; PC không ưu tiên TXT; mobile parse cues trước | **Fixed** — `script.txt` = SoT (PC + iPad/iPhone pull) |
| B4 | Mất furigana / màu JLPT / dict popup sau prefer-TXT | Rewrite `cues.json` từ TXT drop tokens; `tokens.json` bị `{}` | **Fixed** (PC migrate + re-tokenize); iPad = live NLP + stamp id |
| B5 | Timeline follow lệch / “một cue sau” / drift | Skip 12%; không coalesce; `scrollIntoView` no-op; rồi `scrollTo` smooth undershoot | **Fixed** — pin ~24px via RAF ease→exact `scrollTop` (force instant), coalesce retarget, gap-hold, **ĐANG PHÁT** |
| B6 | Có 3 CC trên YT nhưng VI/EN trống; phải bật từng CC | SW/page dùng **WEB** `captionTracks` baseUrl → HTTP 200 body rỗng (thiếu pot); ANDROID innertube URL mới có timedtext | **Fixed** — `FETCH_MULTI_LANG` ANDROID rescue + SW ưu tiên android (v0.9.11+) |
| B7 | Load lên panel rất chậm | Bridge wait ~2.5s trước SW; discovery track serial; await đủ EN/VI trước return | **Fixed** — kick SW ‖ bridge; JA paint sớm; EN/VI async; parallel discovery + cookies once + `//`→`https:` |
| B8 | Furigana / JLPT không có ngay khi load JA (mọi video) | `enrichTokensAfterImport` gated / stale page inject / secondary publish thiếu `forceList` | **Fixed** — luôn tokenize + API_VER reinject + `forceList` sau EN/VI |
| B9 | Một số cue JA trống VI/EN; status `pending N` dù `en:M vi:K` | `pending`/`cached` = cờ `translated` (thiếu EN/VI), **không** phải tokenize; `en:N vi:M` = **kích thước pack** timedtext YT (không phải số hàng JA đã fill). Match union chỉ ±0,35s theo **start** → track EN/VI lệch segment bỏ sót (vd. active 1:21 trống, hàng kế có đủ). Owned: không orphan | **Fixed** — `fill_yt_secondary`: match overlap (≥35% span) + blank-pass secondary chưa dùng; heal `translated` khi đã có en/vi; `forceList` sau fill |
| B10 | Full pill mở OS video FS, overlay biến mất (iPad/iPhone) | `__csToggleFull` gọi `webkitEnterFullscreen` → lớp system player đè window | **Fixed** — app maximize-only + safety net + `isElementFullscreenEnabled = false` |

**Status semantics (Desktop panel):** `en:N vi:M` = số cue trong pack EN/VI từ YT; `cached A/B` = hàng có `translated`; `pending` = B−A (chưa có EN/VI). Tokenize/furigana là path riêng (`enrichTokensAfterImport`).

**B6–B8:** WEB timedtext empty → ANDROID rescue; tokenize mọi JA; user confirmed OK (2026-08-02).
**B9:** overlap fill + pending semantics; verify: Reload → cue trước đây trống VI/EN được fill hoặc `pending` giảm; active cue không còn blank khi track EN/VI chồng thời gian.
**B10:** verify trên iPad thật 2026-08-03 (autotest `-CS_AUTOTEST_*` → PNG): overlay ON hiện trong app-full (t=12s) ✓; overlay OFF → không chữ (A/B) ✓; thoát full → topBar restore ✓. Bằng chứng `.tmp-fullscreen-verify/run3/` + `run4/`.

---

## 4. Incidents

Lỗi / incident đã gặp (Drive sync, OAuth, panel trống, bridge, caption/tokens…): xem [`INCIDENTS.md`](./INCIDENTS.md). Bug đã normalize theo session: **§3.7**.
