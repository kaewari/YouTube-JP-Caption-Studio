# Netflix Caption Support

<!-- date: 2026-08-19 -->
<!-- status: shipped -->
<!-- raw: plan/netflix-caption-support-2026-08-19.md -->

Hỗ trợ phụ đề tiếng Nhật (Hardsub Overlay, Furigana, JLPT Color, tra từ điển) và phụ đề phụ (EN / VI) khi xem phim và anime trên Netflix thông qua Chrome Extension.

## Trạng thái & Những gì đã ship

- [x] **Cập nhật quyền**: Mở rộng `manifest.json` (host_permissions, content_scripts, web_accessible_resources) cho `netflix.com`.
- [x] **Parser DFXP / TTML**: Triển khai `extension/shared/dfxp_parser.js` hỗ trợ parse clock time, offset time, tick rate (`ttp:tickRate`), thẻ lồng `<span ...>`, `<br/>` và thực thể XML.
- [x] **MAIN world hooks**: `page_capture.js` chặn bắt request phụ đề DFXP từ `nflxvideo.net` / `netflix.com` hoặc kết nối Netflix Player API (`window.netflix.appContext.state.playerApp.getAPI().videoPlayer`).
- [x] **Content script integration**: `content.js` nhận diện `source = "netflix"`, trích xuất `watchId` dạng `netflix__<watchId>`, kết nối overlay vào container `.watch-video` / `.NFPlayer`.
- [x] **Side Panel & Service Worker**: `sidepanel.js` và `service_worker.js` mở quyền kết nối cho tab Netflix.
- [x] **Multi-lang EN/VI auto-fetch**: `page_capture.js` tự động quét danh sách track và tải đồng thời phụ đề EN và VI qua URL trực tiếp hoặc chuyển track ngầm để ghép timeline tam ngữ.
- [x] **Nút Toggle mờ khi hover**: `panel.css` và `content.js` định vị nút ở mép trái video, ẩn khi rảnh và hiện mờ khi di chuột vào player.
- [x] **Bridge Dictionary unthrottled & thread-safe**: Gỡ governor tạm thời (2026-08-19), sau đó chuẩn hóa lại `_governed()` có timeout/cap payload (2026-08-23), thêm `threading.local()` cho SQLite connection và thread lock cho Sudachi tokenizer.
- [x] **Netflix Replay không lỗi M7375**: `page_capture.js` điều khiển tua/phát qua `player.seek(ms)` và `player.play()` của Netflix Video Player API.
- [x] **Nhập liệu tiếng Nhật ổn định**: `sidepanel.js` tắt nhảy focus nudge và tắt can thiệp `applyRomajiFallback` để OS IME gõ tự nhiên, không mất chữ hay nhảy con trỏ.
- [x] **Bảo toàn Furigana & JLPT color**: `content.js` tự động phân tích tokens cho câu vừa sửa và cập nhật ngay lập tức về Side Panel.

## Code anchors

- [`extension/manifest.json`](../../extension/manifest.json): Khai báo host permissions và content scripts cho Netflix.
- [`extension/shared/dfxp_parser.js`](../../extension/shared/dfxp_parser.js): Parser DFXP / TTML độc lập.
- [`extension/injected/page_capture.js`](../../extension/injected/page_capture.js): Intercept network, tải đa ngôn ngữ (JA, EN, VI) và Player API cho Netflix.
- [`extension/content/content.js`](../../extension/content/content.js): `sourceFromHost`, `videoIdFromUrl`, `applyLoadedCues` nhận `enCues` / `viCues`, theo dõi hoạt ảnh chuột.
- [`extension/styles/panel.css`](../../extension/styles/panel.css): Giao diện hover nút bấm `.hardsub-generic-toggle`.
- [`local-bridge/app/services/dictionary.py`](../../local-bridge/app/services/dictionary.py): `_get_db()` thread-safe qua `threading.local()`.
- [`local-bridge/app/services/tokenize_ja.py`](../../local-bridge/app/services/tokenize_ja.py): Thread-safe `_tokenize_lock`.
- [`local-bridge/app/main.py`](../../local-bridge/app/main.py): Bỏ giới hạn governor trên `/dict`.
- [`extension/background/service_worker.js`](../../extension/background/service_worker.js): `isSupportedUrl` và `notifyDriveRestored`.
- [`extension/sidepanel/sidepanel.js`](../../extension/sidepanel/sidepanel.js): Tab matching cho Netflix.
