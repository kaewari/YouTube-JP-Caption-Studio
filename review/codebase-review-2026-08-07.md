<!-- date: 2026-08-07 -->
<!-- source: chat:user-request · user: đọc toàn bộ sourcecode và review bug/tối ưu -->

# Báo cáo review toàn bộ codebase — 2026-08-07

Phạm vi: `extension/`, `local-bridge/`, `web/saved-items/`, `ipad-app/`,
`iphone-app/`, `macos-bridge-app/`, scripts và test. Source được đọc trực tiếp
trên disk; finding quan trọng được truy vết caller và đối chiếu với kiểm tra
hiện có.

## Findings

### Critical

#### C1. Docker expose bridge destructive API ra LAN không xác thực

- **Vị trí:** `local-bridge/Dockerfile:27`, `local-bridge/docker-compose.yml:14-18`
- **Kịch bản:** Uvicorn bind `0.0.0.0`, port publish mọi interface. Thiết bị cùng
  mạng có thể gọi `DELETE /scripts/{video_id}`, save/import hoặc đổi state.
- **Khuyến nghị:** bind Docker về `127.0.0.1`; nếu cần remote access thì thêm
  token ngẫu nhiên cho endpoint ghi/xóa, không dùng CORS thay auth.

### High

#### H1. Kênh `postMessage` của page capture có thể bị giả mạo

- **Vị trí:** `extension/content/content.js:185-195,576-584`,
  `extension/injected/page_capture.js:1023-1029`
- **Kịch bản:** request id tuần tự và reply chỉ match theo id; script trong
  page-world có thể forge caption/media/timedtext rồi dữ liệu bị persist.
- **Khuyến nghị:** kiểm tra `event.source === window`, capability token ngẫu
  nhiên theo lần inject, schema/type kết quả và origin.

#### H2. Xóa cue cuối cùng không được persist xuống disk

- **Vị trí:** `extension/content/content.js:1118-1120,1188-1193`
- **Kịch bản:** payload rỗng được lưu vào `chrome.storage`, nhưng
  `saveTranscriptToDisk` return sớm khi `!payload.length`; file cũ còn nguyên
  và có thể resurrect sau reload.
- **Khuyến nghị:** phân biệt empty payload có chủ đích với lỗi; cho phép
  `/scripts/save` ghi script rỗng/tombstone.

#### H3. Persist extension chỉ lưu tối đa 2.000 cue

- **Vị trí:** `extension/content/content.js:1150-1165`
- **Kịch bản:** transcript dài hơn `settings.maxSentences` bị cắt trước save;
  owned script có thể mất các cue sau 2.000.
- **Khuyến nghị:** chỉ giới hạn lúc render; storage/disk giữ toàn bộ cue hoặc
  báo lỗi và không overwrite khi vượt giới hạn cứng.

#### H4. Xóa toàn bộ cue trên iPad/iPhone không sync được sang Drive

- **Vị trí:** `ipad-app/Services/DriveScriptsService.swift:94-101,151-157` và
  bản tương ứng trong `iphone-app/`
- **Kịch bản:** soft-delete mọi cue làm `liveCount == 0`, chặn nhánh dirty push;
  Drive giữ script cũ hoặc pull lại bản cũ.
- **Khuyến nghị:** xử lý dirty tombstones trước điều kiện `liveCount > 0`, cho
  phép push script rỗng có metadata/rev.

#### H5. `context.save()` bị nuốt sau khi Drive đã ghi thành công

- **Vị trí:** `ipad-app/Services/DriveScriptsService.swift:227-236,249-257` và
  bản tương ứng trong `iphone-app/`
- **Kịch bản:** Drive nhận file nhưng SwiftData save fail; code vẫn clear dirty,
  local edit/rev biến mất và retry không còn.
- **Khuyến nghị:** propagate lỗi; chỉ clear dirty sau local save thành công.

#### H6. Vocab sync có thể overwrite vocabulary local chưa push

- **Vị trí:** `ipad-app/Services/VocabSync.swift:24-35,45-55` và bản tương ứng
  trong `iphone-app/`
- **Kịch bản:** foreground/connect pull remote mới rồi replace toàn bộ rows,
  không có dirty guard cho local vocabulary.
- **Khuyến nghị:** lưu dirty/rev local và push/merge trước khi apply remote.

#### H7. Duplicate cue id có thể làm app crash hoặc hỏng SwiftUI identity

- **Vị trí:** `ipad-app/Services/SubtitleParser.swift:42-46,74-76`,
  `ipad-app/Models/ScriptStore.swift:82-84`; tương ứng trong `iphone-app/`
- **Kịch bản:** timestamp làm id; nhiều event cùng start khiến
  `Dictionary(uniqueKeysWithValues:)` trap. Import id trùng cũng làm `ForEach`
  identity không ổn định.
- **Khuyến nghị:** id collision-free tại parser/import và test duplicate timestamp.

#### H8. `BRIDGE_FETCH` là raw proxy tới mọi endpoint localhost

- **Vị trí:** `extension/background/service_worker.js:386-409`
- **Kịch bản:** caller truyền tùy ý path, method, body và có thể chạm route
  xóa/import/save khi có message/UI bug.
- **Khuyến nghị:** allowlist route/method, validate path params và sender/context.

### Medium

#### M1. CORS cho mọi localhost port không phải authorization

- **Vị trí:** `local-bridge/app/main.py:75-81`
- **Kịch bản:** web app độc hại trên `localhost:<port>` được credentialed CORS;
  endpoint mutation không có auth.
- **Khuyến nghị:** origin allowlist cố định, bỏ credentials nếu không cần và
  thêm token/Host check.

#### M2. Script save nhiều file không transaction/lock theo video

- **Vị trí:** `local-bridge/app/services/script_store.py:305-388,419-523`
- **Kịch bản:** `cues.json`, `tokens.json`, `meta.json`, `script.txt` replace
  tuần tự; crash/concurrent save hoặc `load_script` migration tạo revision trộn.
- **Khuyến nghị:** serialize theo video và commit generation/manifest; tránh
  write trong read path.

#### M3. Bootstrap có thể kẹt với archive tải dở

- **Vị trí:** `local-bridge/app/scripts/bootstrap.py:47-55,111-114`
- **Kịch bản:** download ghi thẳng `.gz`; file tồn tại sau interruption nên lần
  sau không retry đúng.
- **Khuyến nghị:** temp + validate/hash + atomic replace.

#### M4. Governor không bảo vệ endpoint nặng

- **Vị trí:** `local-bridge/app/core/governor.py:105-114`,
  `local-bridge/app/main.py:199-225`
- **Kịch bản:** `try_acquire()` không được gọi quanh tokenize/dictionary/batch;
  nhiều request lớn chạy đồng thời vượt cap CPU/RAM.
- **Khuyến nghị:** acquire/release và giới hạn batch/text, hoặc bỏ contract không dùng.

#### M5. Timing từ client không validate finite/range

- **Vị trí:** `local-bridge/app/schemas/models.py:118-145`,
  `local-bridge/app/services/script_store.py:317-321`
- **Kịch bản:** số âm, `NaN`, infinity hoặc `end < start` phá sort/render/JSON.
- **Khuyến nghị:** reject non-finite, âm và interval đảo tại API/import boundary.

#### M6. Manual timeline clamp vẫn có thể tạo overlap

- **Vị trí:** `extension/content/cue_timing.js:24-36`
- **Kịch bản:** start sau next cue, fallback `start + MIN_DUR` vượt next cue.
- **Khuyến nghị:** revalidate với hai neighbor sau fallback; reject hoặc clamp
  start về `next.start - GAP`.

#### M7. OAuth/ATS và WebView policy quá rộng

- **Vị trí:** `ipad-app/Services/DriveAuthService.swift:62-74,99-108`,
  `DriveOAuthConfig.swift:8-10`, `Info.plist:23-25`,
  `Views/YouTubePlayerView.swift:283-285`; tương ứng `iphone-app/`
- **Kịch bản:** thiếu OAuth `state`, scope Drive rộng, ATS global exemption và
  unrestricted WebView navigation làm tăng rủi ro callback/token/navigation.
- **Khuyến nghị:** random state exact-match, scope hẹp, ATS exceptions cụ thể,
  chỉ allowlist YouTube navigation.

#### M8. macOS stop/build có thể gây side effect và báo thành công giả

- **Vị trí:** `macos-bridge-app/Sources/main.swift:141-155,234-240`,
  `macos-bridge-app/build.sh:41-56,72-76`
- **Kịch bản:** stop kill mọi process trên 8765/3000; process group không thực
  sự được tạo. Iconset có tên email và `codesign || true` che lỗi.
- **Khuyến nghị:** quản lý PID/process group của app; dùng tên icon chuẩn và
  fail-fast khi iconutil/codesign fail.

#### M9. Saved Items trộn dữ liệu demo và có race khi persist vocab

- **Vị trí:** `web/saved-items/src/lib/vocab-store.ts:63-87`,
  `web/saved-items/src/components/SavedItemsApp.tsx:116-128`
- **Kịch bản:** `MOCK_SAVED_WORDS` luôn được seed vào data thật; nhiều
  `persistWordsAsync` hoàn tất lệch thứ tự có thể ghi map cũ lên map mới.
- **Khuyến nghị:** tách demo mode; serialize/coalesce writes theo sequence.

#### M10. Regression gate hiện không xanh

- **Vị trí:** `web/saved-items/src/components/SavedItemsApp.tsx:48-54`; môi
  trường `local-bridge/.venv`
- **Kịch bản:** `npm run check` fail ESLint `set-state-in-effect`; `pytest` không
  chạy vì venv thiếu module `pytest`, nên bridge test không là gate tin cậy.
- **Khuyến nghị:** bỏ synchronous setState khỏi effect hoặc dùng lazy derived
  state; khóa test dependency trong environment chuẩn.

## Đã kiểm tra và không lặp lại

- P0 Drive pull/merge, backup single-save, extension restore rev guard và
  vocabulary upsert vẫn có trên source hiện tại.
- Bridge path traversal/video-id regex và SQLite parameterized queries đúng.
- Sanity scripts `cue_timing`, `normalize_cues`, `fill_yt_secondary`, `rev_pick`
  và `import_parse` đều pass.
- Finding cũ về iPhone thiếu fullscreen bindings đã stale và không đưa lại.

## Ưu tiên đề xuất

1. C1, H2-H6: data-loss và trust boundary.
2. H7-H8, M2, M5-M6: id/timing/persistence invariants.
3. M7-M10: OAuth, process/build, web race và regression gate.
