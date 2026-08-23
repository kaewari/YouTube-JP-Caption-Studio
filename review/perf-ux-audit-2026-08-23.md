<!-- date: 2026-08-23 -->
<!-- source: chat · user: multi-agent perf sweep + UX benchmark -->

# Audit hiệu năng + UX — 2026-08-23

## Phương pháp — 10 finders (8 perf slices + 2 UX benchmark), adversarial verify từng finding, double-pass P0/P1, completeness critic. Repo ~25k LOC.

## Confirmed (perf)

| ID | Sev | file:line | Claim | Fix sketch |
|---|---|---|---|---|
| P1-1 | P1 | extension/content/content.js:3380 | findActiveCue() slice().sort() O(N log N) mỗi 250ms tick | Duy trì cues pre-sorted khi nạp/sửa, tìm cue bằng binary search |
| P1-3 | P1 | extension/content/content.js:3933 | tick() poll GET_MEDIA_TIME 4x/s ngay cả khi tắt overlay/panel | Giảm tần số tick (1-2s heartbeat) khi showOnVideo=false và panel đóng |
| P1-4 | P2 | extension/content/content.js:1574 | videoLayoutTimer chạy setInterval 250ms query DOM rect vô tận | Dùng ResizeObserver/resize event, tăng interval safety lên 2-3s |
| P1-5 | P2 | extension/content/content.js:3447 | enrichTokensAfterImport lặp await tuần tự POST /tokenize fallback | Chạy song song Promise.all / worker pool giới hạn theo caps.max_in_flight |
| P1-6 | P3 | extension/content/content.js:2999 | syncHealth() 5s broadcast full sidepanel state dù không đổi | So sánh statusText, chỉ broadcast khi state thực sự thay đổi |
| P1-7 | P3 | extension/content/content.js:2588 | playerToggleObserver querySelector DOM dồn dập trong mutation | Kiểm tra cờ playerToggleEnsureScheduled trước khi querySelector |
| P2-1 | P1 | extension/content/content.js:3380 | findActiveCue clone và sort toàn bộ cue mỗi tick 250ms | Giữ pre-sorted khi import/edit, tìm cue bằng binary search |
| P2-2 | P1 | extension/content/content.js:1574 | videoLayoutTimer setInterval 250ms getBoundingClientRect thừa | Bỏ polling 250ms, dựa vào ResizeObserver và window events |
| P2-3 | P1 | extension/content/content.js:3447 | Fallback enrichTokensAfterImport await tuần tự gây nghẽn mạng | Chạy Promise.all song song (5 concurrent requests) |
| P2-4 | P1 | extension/content/content.js:3933 | 250ms tick polling GET_MEDIA_TIME khi overlay ẩn | Bỏ qua hoặc giãn tick khi showOnVideo=false và panel đóng |
| P2-5 | P2 | extension/content/content.js:2230 | bindBarTokenDict gắn 3 listener lên từng token không delegation | Gắn 1 delegated listener trên container #hardsub-ocr-bar |
| P2-6 | P2 | extension/content/content.js:2489 | pingToggleActivity gắn unthrottled vào window.mousemove | Throttle với timestamp/rAF tối đa 1 lần mỗi 100-200ms |
| P3-1 | P0 | extension/injected/page_capture.js:971 | NETFLIX_URL_RE quá rộng khớp media/image CDN gây clone/parse TTML nhị phân | Thu hẹp regex vào subtitle endpoint (timedtext, .dfxp, .vtt) |
| P3-2 | P1 | extension/background/service_worker.js:1600 | scheduleDriveUpload dùng setTimeout volatile bị mất khi SW MV3 terminate | Lưu pending IDs vào chrome.storage và dùng chrome.alarms / flush trước unload |
| P3-3 | P1 | extension/background/service_worker.js:1307 | mirrorFromDrive duyệt tuần tự O(N*3) request Drive API | Batch metadata query hoặc xử lý song song Promise.all có giới hạn |
| P3-4 | P1 | extension/background/service_worker.js:1282 | mirrorToDrive upload tuần tự từng file mỗi video dưới lock | Upload 3 file song song qua Promise.all, pool multi-video |
| P3-5 | P1 | extension/injected/page_capture.js:790 | parseDfxpText regex lồng nhau + 10 replace trên MAIN thread | Dùng single-pass regex hoặc native DOMParser parse TTML |
| P3-6 | P2 | extension/injected/page_capture.js:227 | scrapePlayerResponseFromDom quét textContent mọi thẻ script | Query ID cụ thể hoặc kiểm tra window/ytplayer trước khi scan DOM |
| P3-7 | P2 | extension/injected/page_capture.js:1627 | switchTrackAndWait spin loop 60ms chờ đổi track Netflix | Dùng event-driven intercept promise thay vì spin loop |
| P3-8 | P2 | extension/injected/page_capture.js:1585 | tryBuildUrlForTrack fetch tuần tự các URL ứng viên với timeout 600ms | Chạy song song Promise.any/all với cancel timeout |
| P3-9 | P2 | extension/background/service_worker.js:9 | POLL_BRIDGE_ALARM 1 phút đánh thức SW nền vô điều kiện | Chỉ bật alarm khi có tab active, backoff khi bridge offline |
| P4-1 | P0 | web/saved-items/src/components/SettingsPanel.tsx:234 | patchOverlay/Level gọi persistSettingsAsync unthrottled trên slider | Debounce 150-250ms cho storage/bridge write, giữ state local mượt |
| P4-2 | P1 | extension/sidepanel/sidepanel.js:647 | mouseover token listEl bắn SHOW_PAGE_DICT và /dict unthrottled | Thêm hover delay (100-150ms setTimeout) trước khi tra từ |
| P4-3 | P1 | extension/sidepanel/sidepanel.js:141 | DRIVE_PULL chạy mỗi lần mở sidepanel quét toàn bộ Drive | Thêm gate thời gian tối thiểu (5-15p) hoặc chỉ pull khi bấm |
| P4-4 | P1 | web/saved-items/src/lib/vocab-store.ts:330 | Hai interval 1500ms độc lập poll GET /extension_state tốn pin | Gộp chung 1 poller, backoff khi lỗi, pause khi document.hidden |
| P4-5 | P1 | web/saved-items/src/lib/vocab-store.ts:190 | loadWordsAsync chờ bridge 2s timeout mới fallback localStorage | Trả về cache localStorage ngay, fetch bridge ngầm |
| P4-6 | P2 | extension/sidepanel/sidepanel.js:961 | cueSig map mảng token và chạy regex stripStub mỗi renderList | Cache signature trên cue object khi enrich/parse |
| P4-7 | P2 | extension/sidepanel/sidepanel.js:1041 | bindRowHandlers gắn ~15 event listener cho mỗi cue row | Event delegation trên listEl cho focus, blur, keydown |
| P4-8 | P2 | web/saved-items/src/components/SavedWordsList.tsx:28 | SavedWordsList map VocabRow không memo/virtualize gây re-render | Bọc VocabRow với React.memo hoặc dùng virtualization |
| P5-1 | P1 | local-bridge/app/services/vocab_freq.py:135 | _reading_lookup() tạo mới Sudachi Dictionary() mỗi call /vocab/bands | Tái sử dụng tokenizer từ tokenize_ja hoặc cache module-level |
| P5-2 | P1 | local-bridge/app/services/vocab_freq.py:107 | assessment_bands() sort 15k từ và 10 pass filter mỗi request | Tiền tính và cache by_band trong load_freq() |
| P5-3 | P1 | local-bridge/app/services/tokenize_ja.py:93 | _tokenize_lock acquire/release từng cue tuần tự hóa batch | Lock 1 lần toàn batch hoặc dùng thread-local tokenizer |
| P5-4 | P1 | local-bridge/app/services/script_store.py:459 | load_script sync disk không bọc _video_lock, race save_script | Bọc load_script disk sync trong with _video_lock(vid): |
| P5-5 | P2 | local-bridge/app/main.py:175 | on_startup thiếu load_tokenizer() làm stall 300-600ms request đầu | Thêm load_tokenizer() vào on_startup() |
| P5-6 | P2 | local-bridge/app/utils/text_utils.py:6 | kata_to_hira lặp từng ký tự Python ord/chr trên tokenization | Thay bằng text.translate() với bảng tra tiền tạo |
| P5-7 | P2 | local-bridge/app/core/governor.py:73 | _pressure_loop poll psutil 2.0s liên tục lúc idle làm tỉnh CPU | Polling thích ứng: 15-30s khi idle, 2s khi có job |
| P5-8 | P3 | local-bridge/app/main.py:161 | _p50/p95_latency chạy sorted() trên deque mỗi 5s /health poll | Tính percentile lũy tiến khi append hoặc cache sorted |
| P6-1 | P1 | local-bridge/app/services/script_store.py:528 | load_script ghi atomic_write cues.json/meta.json mỗi lần đọc | Chỉ ghi khi changed=True và bọc trong _video_lock(vid) |
| P6-2 | P1 | local-bridge/app/services/dictionary.py:380 | json.loads() text blob SQLite mỗi query tra từ | Lưu sense dict đã parse vào LRUCache / in-memory cache |
| P6-3 | P1 | local-bridge/app/services/dictionary.py:676 | _expand_candidates luôn chạy Sudachi tokenize khi miss cache | Khớp exact/prefix trước, chỉ tokenize khi surface dài >2 và miss |
| P6-4 | P2 | local-bridge/app/services/vocab_freq.py:135 | assessment_bands tạo Sudachi instance và tokenize 80 từ không cache | Tái sử dụng singleton Sudachi và cache sample bands |
| P6-5 | P2 | local-bridge/app/services/script_store.py:414 | save_script chạy 4 atomic_write tuần tự vô điều kiện | Bỏ qua ghi script.txt/tokens.json nếu nội dung không đổi |
| P7-1 | P0 | ipad-app/Services/SettingsSync.swift:62 | SettingsSync quan sát UserDefaults tự push Drive lặp vô tận | Đặt cờ applying=true trước khi ghi lastAppliedKey |
| P7-2 | P0 | ipad-app/Services/VocabStyle.swift:55 | VocabStyle.color parse JSON levelColorsJSON mỗi token trên UI | Cache dictionary [String: Entry] và Color đã parse trong RAM |
| P7-3 | P1 | ipad-app/Views/ContentView.swift:733 | Eager VStack + GeometryReader preference mỗi row trong ScrollView | Đổi sang LazyVStack, cuộn bằng ScrollViewProxy |
| P7-4 | P1 | ipad-app/Services/NLPTagger.swift:44 | tokenizeCache giới hạn 256 xóa sạch removeAll khi đầy gây thrash | Tăng limit lên 2048, dùng chính sách LRU thay vì xóa sạch |
| P7-5 | P1 | ipad-app/Models/ScriptStore.swift:55 | ScriptCue.active sort O(N log N) mảng cue mỗi 8Hz timer | Giữ cues pre-sorted, tìm cue active bằng binary search |
| P7-6 | P1 | ipad-app/Scripts/user_script.js:370 | setInterval 5s postLayout gửi smoke layout ghi disk liên tục | Tắt timer định kỳ trong prod, chỉ chạy khi autotest yêu cầu |
| P7-7 | P2 | ipad-app/Views/ContentView.swift:129 | Timer 8Hz scan cue liên tục ngay cả khi video paused / idle | Thêm guard isPlaying && onYouTubeWatch trong timer block |
| P7-8 | P2 | ipad-app/Services/DriveScriptsService.swift:301 | DriveScriptsService.pull tokenize đồng bộ cả script trên MainActor | Chạy warmup token trong background Task hoặc lazy |
| P7-9 | P2 | ipad-app/Models/ScriptStore.swift:73 | FetchDescriptor<ScriptCue>() không predicate load toàn DB | Thêm #Predicate { $0.video?.videoId == videoId } |
| P8-1 | P1 | iphone-app/Views/ContentView.swift:111 | Timer 8Hz scan cue trên MainActor khi pause / ẩn caption | Guard isPlaying && (overlayShown || sidePanelShown) |
| P8-2 | P1 | iphone-app/Scripts/user_script.js:277 | setInterval 500ms getBoundingClientRect và post IPC khi pause | Gate với !v.paused hoặc dựa trên timeupdate/resize event |
| P8-3 | P1 | iphone-app/Views/ContentView.swift:540 | Eager VStack gắn GeometryReader preference trên 300+ cue | Bỏ GeometryReader toàn cục, dùng native ScrollViewProxy |
| P8-4 | P1 | iphone-app/Models/ScriptStore.swift:76 | FetchDescriptor<ScriptCue>() không predicate load hết cue DB | Thêm SwiftData #Predicate lọc videoId |
| P8-5 | P1 | iphone-app/Services/NLPTagger.swift:48 | tokenizeCache limit 256 removeAll() gây tokenize lại liên tục | Tăng limit 1024 hoặc áp dụng eviction LRU |
| P8-6 | P1 | iphone-app/Services/DriveScriptsService.swift:51 | syncAll duyệt tuần tự nhiều thư mục Drive qua mạng | Dùng TaskGroup concurrency giới hạn (3-4 task) |
| P8-7 | P2 | iphone-app/Views/CueEditorRow.swift:27 | Tap token tra từ 2 lần (tap handler + onChange selectedToken) | Bỏ lookup trong tap handler, để onChange xử lý duy nhất |
| P8-8 | P2 | iphone-app/Services/CaptionService.swift:52 | URLRequest thiếu timeoutInterval kế thừa 60s mặc định | Đặt req.timeoutInterval = 8.0 cho Innertube/timedtext |

## UX gap matrix

| Tính năng | Language Reactor / Trancy / Migaku | Repo này | Đề xuất |
|---|---|---|---|
| Auto-pause cuối câu (U1-1) | Tự dừng video khi hết câu để luyện nghe/shadowing ('Q' mode) | Phát liên tục không dừng | Thêm autoPause setting, gọi video.pause() khi chạm active.end_media_time |
| Replay / Loop câu (U1-2) | Phím tắt phát lại 1 nút ('S'/'R'), loop câu | Phải cuộn sidepanel bấm play nhỏ hoặc seek thủ công | Thêm command replay_cue, seek PLAY_AT start_media_time |
| Điều khiển tốc độ phát (U1-3) | Phím chỉnh 0.5x/0.75x/1x, tự chậm câu khó | Không có playbackRate control, phụ thuộc menu gốc YT | Thêm SET_PLAYBACK_RATE và quick chips 0.75x/1x/1.25x |
| Phím tắt điều hướng (U1-4) | A/S/D/W (prev/replay/next/pause) thao tác rảnh tay | Chỉ có keydown trong ô nhập text | Thêm global keydown listener (A/S/D/Q) khi không focus input |
| Controls trên overlay bar (U1-5) | Nút Prev/Replay/Next nhỏ gọn ngay trên bar | Bar chỉ hiển thị text thuần | Thêm nút ◀, ↺, ▶ trực tiếp trên bar-body |
| Export SRT/VTT/Anki TSV (U1-6, U2-1) | Xuất song ngữ SRT, VTT, Anki TSV kèm timestamp + furi | Chỉ xuất file .txt tùy chỉnh | Bổ sung format selector trong exportTxt (SRT/VTT/TSV) |
| Chế độ mờ Listen-first (U1-7) | Làm mờ sub JA/VI, chỉ hiện khi hover hoặc hết câu | Luôn hiện rõ sub | Thêm blurViUntilHover/blurJaUntilHover với CSS filter blur |
| Lưu câu + ngữ cảnh (U1-8, U2-2, U2-12) | 1-click lưu câu, timestamp, nghĩa vào flashcard | Chỉ lưu lemma:status đơn thuần, tab câu là placeholder | Lưu object {lemma, status, sentenceJa, sentenceVi, videoId, mediaTime} |
| Xuất từ vựng CSV/Anki (U1-9) | Xuất toàn bộ từ đã lưu kèm nghĩa, reading sang CSV/Anki | Không có nút export từ vựng | Thêm nút Xuất CSV/TSV tải file blob trong SavedWordsToolbar |
| Ôn tập ngắt quãng SRS (U1-10, U2-3) | Ôn từ theo thuật toán SRS (PhrasePump, SM-2, Anki sync) | Chỉ có tag tĩnh, tab PhrasePump bị vô hiệu hóa ('soon: true') | Thêm trường SRS (nextReviewAt, interval) và review modal |
| Giao diện từ vựng iPhone (U1-11) | Review flashcard mượt mà trên mobile | iPhone app chỉ sync nền, không có UI xem từ đã lưu | Port vocabList từ iPad sang iPhone làm tab/sheet |
| Vi chỉnh lệch sub phụ (U1-12) | Nút +/- 100ms chỉnh lệch timeline phụ đề phụ trực tiếp | Phải gõ tay từng số trong sidepanel | Thêm secondarySubOffsetMs áp dụng khi match/render sub phụ |
| Streak học & lịch sử (U2-4) | Đếm streak ngày học, tiến độ hoàn thành JLPT | Chỉ tính tổng số tức thời | Lưu counters theo ngày và hiển thị streak 7 ngày |
| Đa ngôn ngữ i18n (U2-5) | Hỗ trợ 40+ ngôn ngữ | Hardcode tiếng Việt trong extension và web app | Tách chuỗi UI sang i18n bundle (EN/VI) |
| Hỗ trợ Light mode (U2-6) | Tự thích ứng theo system prefers-color-scheme | Hardcode dark-only color scheme | Thêm CSS variables prefers-color-scheme: light và tailwind light |
| Onboarding ban đầu (U2-7) | Hướng dẫn trực quan thao tác khi mới mở extension | Hiển thị text thô khi chưa có caption | Thêm card onboarding 3 bước trực quan trong sidepanel empty state |
| Nút đổi furigana nhanh (U2-8) | Đổi chế độ furigana tức thì trên player/toolbar | Phải mở tab settings toàn trang | Thêm nút cycle furigana (Bật/Tắt/Chỉ Kanji) ở footer toolbar |
| Phát âm TTS (U2-9) | Nghe phát âm native / pitch accent khi tra từ | Không có âm thanh cho từ vựng | Thêm nút phát âm dùng window.speechSynthesis ja-JP |
| All-Words catalog (U2-10) | Duyệt từ N5-N1 theo tần suất, đánh dấu hàng loạt | Tab 'Tất cả từ' là ComingSoon placeholder | Render freq_ja.json kèm bulk-action đánh dấu known |
| Parity mobile vocab tag (U2-11) | Đầy đủ tính năng đánh dấu từ trên mọi thiết bị | iPad/iPhone hoãn tính năng đánh dấu trạng thái từ | Thêm 4 status chips (known, learning, ignored, special) vào DictPopup mobile |

## Refuted / already-fixed

| ID | Verdict | Lý do |
|---|---|---|
| P3-10 | REFUTED | pushExtensionStateToBridge kiểm tra if (j === _lastPushedJson) return tại line 308, early-return trước khi fetch khi state đã được debounce 200ms push. |
| P8-9 | WRONG_LINE | Logic xóa cache nằm ở line 66 (thay vì line 58 là deinit); lookupCache xóa toàn bộ 64 mục qua removeAll(). |
| P1-2 | DOWNGRADED | Sidepanel edit diễn ra trên DOM/textarea local, chỉ commit khi Enter/blur qua sendCmd chứ không bắn mỗi phím gõ. Overhead serialize khi commit trên list lớn vẫn tồn tại. |

### Phân giải xung đột LB-* vs M-*
- Findings P5-4 và P6-1 (mang priorId LB-6) xác nhận LB-6 là lỗi thật đang tồn tại trên disk (`load_script` trong `script_store.py` ghi đè disk không kiểm tra changed và thiếu mutex lock với `save_script`), bác bỏ nhận định cho rằng LB-6 đã được giải quyết hoàn toàn.

## Bài học rút ra
- **Cache wipe-when-full**: Thay vì `removeAll()` làm rỗng toàn bộ cache khi đầy (khiến transcript > 256 cue bị thrash CPU liên tục như NLPTagger), cần dùng LRU cache hoặc tăng giới hạn theo quy mô dữ liệu thực tế.
- **Global lock serialization**: Sudachi `_tokenize_lock` acquire/release từng cue đơn lẻ trong batch làm tuần tự hóa worker threads; cần gom lock theo batch hoặc dùng thread-local tokenizers.
- **Timer-forever / Polling unthrottled**: Các timer 250ms/500ms/8Hz (content.js, user_script.js, ContentView.swift) chạy liên tục ngay cả khi video paused hoặc overlay đóng làm cạn kiệt pin; cần gate theo trạng thái phát và chuyển sang event-driven.
- **State mutation in change listeners**: SettingsSync ghi ngược vào UserDefaults trong notification observer mà không bật cờ `applying` tạo vòng lặp push mạng 1.5s vô tận.
- **Main-thread deserialization**: Chạy JSONDecoder/regex TTML trên từng frame/token UI (VocabStyle.swift, parseDfxpText) làm drop FPS; cần decode một lần và cache kết quả trong bộ nhớ.
- **Read operations causing disk writes**: `load_script` trong script_store.py gây write amplification; cần kiểm tra content signature/dirty flag trước khi gọi `_atomic_write_text`.
- **Storage persistence in volatile debounces**: Dùng in-memory `setTimeout` trong MV3 background worker dễ bị mất dữ liệu khi browser kill worker; cần lưu trạng thái vào `chrome.storage` và kết hợp `chrome.alarms`.

## Gaps chưa quét

| File:Line | Sev | Lý do |
|---|---|---|
| macos-bridge-app/Sources/main.swift:201 | medium | Timer 1.5s lặp poll /health qua mạng; killPort chạy subshell lsof chặn |
| local-bridge/app/scripts/bootstrap.py:56 | high | Download đồng bộ với timeout 300s và giải nén gzip đơn luồng chặn bootstrap pipeline |
| local-bridge/app/scripts/build_dict_sqlite.py:80 | medium | Tải toàn bộ file JSON dictionary nhiều MB vào RAM bằng json.load trước khi insert SQLite |
| tools/ime-switch/host.py:72 | medium | Gọi subprocess.run đồng bộ mỗi lệnh chuyển input chặn vòng lặp native messaging stdio |
| extension/shared/dfxp_parser.js:15 | medium | Parse chuỗi parseTime đồng bộ và tính toán tick rate trên payload subtitle lớn chưa parse |
| extension/shared/import_parse.js:55 | medium | Regex split đồng bộ trên khối phân cách và parse timestamp từng dòng khi import transcript |
| scripts/build_freq_ja.py:33 | low | Đọc toàn bộ dataset vào bộ nhớ với lặp dòng unbuffered và regex lặp lại khi index tần suất |
| extension/shared/vocab_style.js:1 | low | Tra cứu tần suất và đánh giá style JLPT từng token lặp đi lặp lại trên hot path render subtitle |
