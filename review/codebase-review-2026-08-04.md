<!-- date: 2026-08-04 -->
<!-- source: archived from session artifacts -->

# Báo cáo review toàn bộ codebase — YouTube JP Caption Studio

Ngày: 2026-08-04 · Nhánh: `claude/dev` · Phạm vi: toàn bộ monorepo (iPad app, iPhone app, Chrome extension, local-bridge, macos-bridge-app, web)

**Phương pháp:** 4 agent review song song, mỗi agent một thành phần; mọi phát hiện **Critical/High đều được verify lại trực tiếp trên source code** trước khi đưa vào báo cáo. Ngoài ra tôi tự kiểm tra vệ sinh repo (git hygiene, dung lượng).

**Chủ đề xuyên suốt (nghiêm trọng nhất):** ưu tiên #1 của dự án — *dữ liệu người dùng (sửa tay/import) không bao giờ bị ghi đè bởi YouTube hoặc Drive sync* (README/INCIDENTS) — **đang bị vi phạm ở ít nhất 5 chỗ** ở cả 3 nền tảng (xem mục 6).

---

## 1. Tổng quan kiến trúc

| Thành phần | Stack | Vai trò |
|---|---|---|
| `ipad-app/` (6.306 dòng Swift, 27 files) | SwiftUI + SwiftData | Xem YouTube (WKWebView), hardsub overlay, side panel sửa cue, NLTagger tokenize, dict.sqlite, Drive sync (OAuth + PKCE) |
| `iphone-app/` (≈5.600 dòng Swift) | SwiftUI + SwiftData | Bản mirror của ipad-app (21/27 files byte-identical), chỉ khác: fullscreen app-maximize, UI đọc thôi |
| `extension/` | Chrome MV3 | Content script bắt caption YouTube (JSON3/timedtext), side panel, proxy tới bridge, Drive mirror (chrome.storage) |
| `youtube-jp-caption-studio/local-bridge/` | Python FastAPI (:8765) | Sudachi tokenize, JMdict lookup, lưu script files, endpoint DELETE/import |
| `youtube-jp-caption-studio/macos-bridge-app/` | Swift (menu-bar) | Dừng/khởi động bridge trên macOS |
| `web/saved-items` + `extension/popup` | Next.js | UI danh sách item đã lưu |

Đồng bộ Drive: file `caption-studio-backup.json` dùng chung, Lamport rev counters, cờ owned, mirror script.txt, force-pull khi local rỗng.

---

## 2. ipad-app

### 🔴 Critical

| # | Vị trí | Vấn đề | Kịch bản lỗi |
|---|---|---|---|
| 1 | `Services/DriveScriptsService.swift:291` | `needsPull`: `if driveRev > localRev { return true }` — **không kiểm tra có edit local chưa push**; `syncThrowing` chạy pull (100-133) **trước** push (136-146) và nhánh pull return sớm | Người dùng sửa cue trên iPad → chưa kịp push → Drive pull về bản cũ → **mất hết edit chưa đồng bộ** |

### 🟠 High

| # | Vị trí | Vấn đề | Kịch bản lỗi |
|---|---|---|---|
| 2 | `Services/DriveScriptsService.swift:296` | `localOwned && localTranslated == 0 && driveTranslated > 0 → pull` | Người dùng bấm "Xóa dịch" (translated = 0) → **sync tiếp theo tự pull lại bản dịch cũ về** — hành động xóa không bao giờ có hiệu lực lâu dài |
| 3 | `Models/ScriptStore.swift:84` | `Dictionary(uniqueKeysWithValues: localCues.map { ($0.id, $0) })` — **trap crash nếu trùng id** | Nguồn trùng id: `Services/SubtitleParser.swift:43` dùng `id = "\(Int(tStartMs))"` — YouTube JSON3 phát nhiều event cùng tStartMs → crash khi mở script |
| 4 | `Services/BackupService.swift:281-283, 318` | `apply`: **xóa hết** VideoScript + Vocabulary rồi `try context.save()` (commit wipe) → chỉ sau đó mới insert rows backup + save lần 2 | Restore fail ở save thứ 2 (duplicate constraint từ snapshot tay chỉnh) → **mất toàn bộ data local, không thể chạy lại** |
| 5 | `Services/BackupService.swift:358`, `DriveScriptsService.swift:171, 188` | `try? context.save()` — **nuốt lỗi save im lặng** | Lỗi save bị bỏ qua, app hiện "đã lưu" nhưng thực tế data mất |

### 🟡 Medium

| # | Vị trí | Vấn đề |
|---|---|---|
| 6 | `DriveScriptsService.swift:271, 148` | Lost update cross-device khi rev bằng nhau (không merge, ai sau ghi đè ai) |
| 7 | `Models/ScriptStore.swift:583` | `CueTiming.apply` có thể tạo cue chồng lấn nhau |
| 8 | `DriveScriptsService.swift:196-198` | NLTagger warm-up chạy trên main thread |
| 9 | `VocabSync.swift:64-73` | Push bị drop + `applyVocabOnly` xóa hết vocab rồi insert lại (mất vocab local-only) |
| 10 | `BackupService.swift:243` | Snapshot đọc relationship `cues` optional — snapshot có thể thiếu cues |
| 11 | `DriveAuthService.swift:65-74` | **Thiếu OAuth `state` param** — lỗ hổng CSRF trong OAuth flow |
| 12 | `DriveOAuthConfig.swift:8-9` | clientId + folderId "1K8LPtKici0gVaq5FuTMDmYDWzPpBokFA" **hardcode trong source** |
| 13 | `YouTubePlayerView.swift:283-285` | Navigation luôn `.allow` — không chặn URL lạ trong WKWebView |
| 14 | `project.yml:49` / `Info.plist:22-25` | `NSAllowsArbitraryLoads: true` — tắt ATS toàn app |
| 15 | `App.swift:10-15` | Chỉ 4/8 smoke suites chạy ở launch debug |
| 16 | `Models/ScriptStore.swift:102-116` | `mergeWithLocal` drop cue chỉ có local (không có trên YouTube) |
| 17 | `VocabStore.swift:23-39` | `upsert` insert blind không kiểm tra trùng |

---

## 3. iPhone-app (review + drift so với ipad)

### 🟠 High (drift)

| # | Vị trí | Vấn đề |
|---|---|---|
| 1 | `iphone-app/Scripts/user_script.js:182-189` vs `ipad-app/Scripts/user_script.js:217-311` | **Thiếu `applyInPageFullscreen`** — fix ghim video vào viewport khi fullscreen (commit `04c6b93a1`) **chưa bao giờ được merge sang iPhone**. iPhone chỉ flip flag `__csAppFull`, không có CSS pinning → nguy cơ lặp lại lỗi "mất hình" (video rect height 0) từng ghi ở INCIDENTS.md 2026-08-04 |

### 🟡 Medium (drift)

| # | Vị trí | Vấn đề |
|---|---|---|
| 2 | `user_script.js:182-189` | Thoát fullscreen không restore video size / không `restoreVideoSize()` + `postLayout()` (ipad có) |
| 3 | `user_script.js:157-169` | Không export `window.__csPostLayout`; layout chỉ được report qua interval 5s, không report ngay sau toggle |
| 4 | `Services/LayoutSmoke.swift:9-16` | Smoke test không phát hiện được thiếu fullscreen pinning — **pass dù layout hỏng** |
| 5 | `Views/ContentView.swift:271-289` | Không có autotest driver / `scrollRequest` / `jsEvalRequest` (ipad có `runAutotestIfRequested`) — hành vi fullscreen iPhone **0% test coverage tự động** |
| 6 | `Views/ContentView.swift:488-491` | **UI edit/vocab/import/export không tồn tại**: `toolsColumn` chỉ có subtitlesList; `SidePanelToolbar.swift` (143 dòng) **dead code** — không chỗ nào instantiate. `ScriptStore.importRows`/`parseImportRows`/`exportTXT` tồn tại nhưng không thể gọi từ UI → người dùng iPhone không import/export/sửa/đổi vocab được |

### 🟡 Medium (code review)

| # | Vị trí | Vấn đề |
|---|---|---|
| 7 | `Services/BackupService.swift:281-283` | Cùng lỗi #4 ipad-app: wipe commit trước khi insert snapshot (fix: build hết rồi save 1 lần — mẫu sẵn có ở `VocabSync.swift:97-113`) |
| 8 | `Services/SettingsSync.swift:62-72, 115-123` | Observes mọi `UserDefaults.didChangeNotification` → push Drive. `onLayoutCheck` ghi 2 keys debug mỗi 5s (`ContentView.swift:280-281`, `user_script.js:286`) → **PUT Drive mỗi ~6.5s vô hạn khi mở app + mỗi lần drag overlay** — tốn pin/bandwidth, nguy cơ 429 |
| 9 | `user_script.js:182-189` + `ContentView.swift:446-460` | Fullscreen **kẹt sau reload trang**: `__csAppFull` là flag trong page, reload làm flag mất còn `isPlayerFullscreen` (Swift) vẫn true → `__csToggleFull` gọi `forceAppFullscreen()` nữa → không có cách thoát (topBar ẩn khi fullscreen) → phải kill app |
| 10 | `ContentView.swift:290-296` + `245-255` | `onPageNav` không clear caption state → caption video A có thể bị merge vào video B (caption đến sau nav được gán nhầm `videoID`) |

### ⚪ Low

- `YouTubePlayerView.swift:80-86` — seek evaluate JS khi trang đang load có thể chạy nhầm document
- `user_script.js:231` — `postVideoRect` bỏ qua rect bị collapse (`width < 80 || height < 60`) → overlay đóng băng ở vị trí cũ đúng lúc video mất hình
- `BackupService.swift:54-62, 270-278` — restore backup mất duration cue cuối (cue cuối chỉ hiện ~150ms)
- `Models/ScriptStore.swift:75-78` — full-table scan fallback mỗi lần `load` (O(tất cả cues))
- `DriveScriptsService.swift:16` — deviceId prefix `"ipad-"` trong app iPhone → mọi attribution Drive gán nhầm iPhone thành iPad

### ✅ Verified non-drift (đã đúng)

- `DriveScriptsService` byte-identical với ipad — P0 data-loss fixes (`1a0a2d32b`) có mặt
- App-maximize kernel (`6c1f5120d`) có mặt; CueEditorRow display-only là chủ ý (comment :5)
- `VocabSync.applyVocabOnly` dùng single-save an toàn; `Vocabulary.upsert` dedupe đúng; bridge storms được coalesce

---

## 4. extension/

### 🔴 Critical

| # | Vị trí | Vấn đề | Kịch bản lỗi |
|---|---|---|---|
| 1 | `content/content.js:185-197, 576-584` + `injected/page_capture.js:1023-1028` | **Kênh postMessage giả mạo được**: `requestId = \`r${++reqSeq}\`` tuần tự, `window.postMessage({...}, "*")`, reply resolve theo id đơn thuần, **không kiểm tra `ev.source`/`ev.origin`** | Script trên trang YouTube (hoặc extension khác) forge caption load → content script persist vào storage → bridge → Drive |

### 🟠 High

| # | Vị trí | Vấn đề | Kịch bản lỗi |
|---|---|---|---|
| 2 | `content/content.js:586-611` | `DRIVE_RESTORED` handler unconditionally `chrome.storage.local.remove([transcript:${videoId}])` rồi `tryApplySavedScript("drive", {quiet:true})` — **không check dirty/rev** | Edit mới hơn trên memory bị clobber bởi bản Drive cũ |
| 3 | `content/content.js:1137-1181` | `saveTranscript`: rev guards read-then-write, **không coalesce in-flight**; `force: true` bỏ qua mọi guard | |
| 4 | `background/service_worker.js:386-409` | `BRIDGE_FETCH` — proxy raw **không allowlist** tới bridge localhost chưa xác thực | |

### 🟡 Medium

- `service_worker.js:298-349` — kéo extension state từ bridge chưa xác thực vào chrome.storage mỗi phút
- `service_worker.js:71-78` — `SP_CMD_PROXY` forward tabId do caller cung cấp; không validate sender ở bất kỳ runtime message nào
- `manifest.json:18` — OAuth scope `.../auth/drive` (**full Drive**, không phải `drive.file`)
- `service_worker.js:1441-1462` — `pullVocabSnapshot` không so sánh rev
- `service_worker.js:1493-1502` — setTimeout debounce: MV3 worker bị kill giữa chừng → mirror đang chờ mất vĩnh viễn

### ⚪ Low

- `sidepanel.js:1081` — thuộc tính `data-t` không escape (chỉ HTML escape ở render khác)
- `page_capture.js:260` — innertube API key hardcode
- `content.js:3067-3088` — sort O(n log n) mỗi tick 250ms
- `content.js:1386-1410` — timers vĩnh viễn không bao giờ teardown

### ✅ Đã kiểm tra và sạch

18 site dùng innerHTML đều escape; không có eval; `handleYtFetch` validate URL timedtext; `web_accessible_resources` chỉ expose page_capture.js cho youtube.com.

---

## 5. local-bridge (Python) + macos-bridge-app

### 🔴 Critical

| # | Vị trí | Vấn đề | Kịch bản lỗi |
|---|---|---|---|
| 1 | `Dockerfile:27` + `docker-compose.yml:14-15` | `CMD uvicorn --host 0.0.0.0` + `ports: "8765:8765"` — **bridge không xác thực expose ra LAN** | Ai đó trên cùng mạng gọi `DELETE /scripts/{video_id}` → xóa sạch thư mục scripts. (Lưu ý: `start.sh:109` bind đúng `127.0.0.1` — chỉ Docker sai) |

### 🟠 High

| # | Vị trí | Vấn đề |
|---|---|---|
| 2 | `app/main.py:75-81` | CORS `allow_origin_regex` cho phép **mọi origin `localhost:ANYPORT`** credentialed; không validate Host header |
| 3 | — | Các endpoint DELETE/import không có auth — mặc dù 1.2 là lỗi Docker riêng, mọi deployment bind sai cũng dính |

### 🟡 Medium

- `app/scripts/import_en_vi.py:29` — download từ điển qua **HTTP thô** (`http://www.denisowski.org/...`) → MITM-poisonable
- `app/scripts/bootstrap.py:47-55, 97-101` — download không atomic, partial download coi là hoàn thành → bootstrap kẹt vĩnh viễn
- `app/services/script_store.py:305-406` — 4 lần ghi file tuần tự không transactional, không locking; `load_script` **ghi file trong lúc đọc** (449, 488-492)
- `app/main.py:188-196` — `/log` ghi log tăng vô hạn, không auth

### ✅ Đã kiểm tra và an toàn

`_VIDEO_ID_RE = ^[A-Za-z0-9_-]{6,64}$` chặn path traversal (script_store.py:31,43-49); mọi SQLite query đều parameterized; không có `shell=True`; ghi file dùng temp-file + replace (256-264).

### macos-bridge-app

- 🟡 `Sources/main.swift:234-240` — `lsof -ti TCP:<port> | xargs kill -TERM` **giết mọi process** đang chiếm 8765/3000, không chỉ bridge của mình
- 🟡 `Sources/main.swift:198-206` — không auto-restart khi bridge crash
- ⚪ `build.sh:74-76` — codesign fail bị nuốt; `build.sh:43-57` — vòng lặp icon có mục rác email-address

---

## 6. Vấn đề chéo: vi phạm ưu tiên #1 (dữ liệu người dùng không bao giờ bị ghi đè)

| # | Nơi | Vi phạm | Mức |
|---|---|---|---|
| 1 | iPad `DriveScriptsService.needsPull` | Pull chạy trước push, không check un-pushed edits → **Drive ghi đè edit local** | 🔴 Critical |
| 2 | iPad `DriveScriptsService:296` | "Xóa dịch" bị Drive pull ngược lại | 🟠 High |
| 3 | Extension `DRIVE_RESTORED` | Remove storage + apply bản Drive không check dirty → **clobber edit mới hơn** | 🟠 High |
| 4 | Bridge Docker | Endpoint DELETE không auth expose LAN → **xóa dữ liệu** | 🔴 Critical |
| 5 | iPad/iPhone `BackupService.apply` | Restore fail = wipe toàn bộ local | 🟠 High |

Cùng một pattern ở 2 nền tảng (pull-before-push / wipe-before-write) — khi sửa nên sửa ở cả `ipad-app` và `iphone-app` (giữ byte-identical).

---

## 7. Vệ sinh repo (git hygiene)

### Rác đang track (nên xóa khỏi git)

- `.cursor/debug-aa2977.log` (1.8 MB) — debug log tool AI
- `extension/popup/` — **53 artifacts build Next.js** (gồm cả file `.txt` lạ `__next.*.txt`)
- `web/saved-items/` — **89 files** chủ yếu là config AI-tool rác: `.aider.conf.yml`, `.amazonq/`, `.augment/`, `.claude/skills/clone-website/`, `.clinerules`, `.codex/`, `.continue/`, `.cursor/`

### Ổ đĩa (không track, nên dọn tay)

- `local-bridge/` ở root: **137 MB orphan** (gitignored, bản copy dict.sqlite)
- `.tmp-*` verify dirs: **~710 MB**
- `node_modules`: 573 MB (track đúng — không nên commit)

Tổng size tracked hiện tại: 14 MB — gọn, chỉ cần dọn phần rác AI-tool kể trên.

---

## 8. Ưu tiên sửa gợi ý

**P0 (dữ liệu người dùng / mất data):**
1. iPad+iPhone `DriveScriptsService`: so sánh rev kèm check un-pushed edits trước khi pull; chuyển pull sau push; bỏ luật "xóa dịch bị pull ngược" (so sánh translated count kèm dirty flag)
2. iPad+iPhone `BackupService.apply`: build hết inserts rồi save 1 lần (không commit wipe trước)
3. Extension `DRIVE_RESTORED`: chỉ apply nếu không có edit local dirty hơn (rev guard giống saveTranscript)
4. Bridge: Docker bind `127.0.0.1` (không `0.0.0.0`); thêm token đơn giản cho endpoint DELETE/import

**P1 (đúng đắn/ổn định):**
5. iPad `ScriptStore.swift:84` — `Dictionary(uniqueKeysWithValues:)` → giá trị id an toàn trùng (`tStartMs` + index) hoặc merge thay vì trap
6. iPad `SubtitleParser.swift:43` — id không còn trùng
7. iPhone: merge commit `04c6b93a1` (fullscreen pinning) + autotest; xóa `SidePanelToolbar` dead code hoặc gắn UI import/export
8. Extension: postMessage kiểm tra `ev.source`/`ev.origin`; scope Drive `drive.file`; allowlist `BRIDGE_FETCH`

**P2 (bảo mật/vệ sinh):**
9. OAuth `state` param (iPad/iPhone); bỏ clientId/folderId hardcode; ATS `NSAllowsArbitraryLoads` → exception cụ thể
10. macos-bridge kill theo PID cụ thể; dọn rác AI-tool khỏi git; dọn `.tmp-*` + root local-bridge ổ đĩa

**Lưu ý khi sửa:** theo triết lý repo (CLAUDE.md — "bug fix = root cause"), các lỗi trùng ở ipad-app/iphone-app nên sửa 2 nơi cùng lúc để giữ 2 app byte-identical phần Services/Models.
