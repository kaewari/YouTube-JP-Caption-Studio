<!-- date: 2026-08-22 -->
<!-- source: chat:user-request · user: đọc toàn bộ sourcecode và đề xuất cải thiện, không đổi chức năng -->

# Plan cải thiện codebase — 2026-08-22

## Phạm vi & nguyên tắc

- Phạm vi đọc: `extension/`, `local-bridge/`, `ipad-app/`, `iphone-app/`, `macos-bridge-app/`, `web/saved-items/`, scripts, tests, plan/review cũ, wiki, README/walkthrough/AGENTS/CLAUDE, `.gitignore`, `data/` (chỉ rà cách dùng).
- Nguyên tắc: chỉ đề xuất cải thiện giữ nguyên hành vi; không refactor đổi API/UI/storage format; không xóa runtime data; không đổi contract giữa extension ↔ bridge ↔ Drive ↔ iPad/iPhone.
- Baseline: `review/codebase-review-2026-08-07.md` đã có C1/H1–H8/M1–M10; plan này cập nhật trạng thái và bổ sung chỗ chưa được lên kế hoạch, không lặp lại nội dung.
- Trạng thái working tree lúc review: nhiều file chưa commit (`M extension/...`, `M local-bridge/...`, `M web/saved-items/...`, `M wiki/...`). Mọi sửa đổi theo plan phải rebase lên HEAD sau khi người dùng đã commit/xử lý working tree hiện tại.

## Hướng cải thiện theo module (giữ nguyên chức năng)

### 1. Chrome extension

1.1. Trust boundary giữa MAIN-world page script và content script
- Vị trí: `extension/content/content.js` (postMessage handler + pageCall), `extension/injected/page_capture.js` (gửi reply).
- Cải thiện: thêm capability token phát sinh một lần khi inject page script; content script kiểm tra token trong mọi reply; từ chối reply thiếu token hoặc không khớp. Giữ nguyên các type hiện dùng, chỉ thêm field `cap`.
- Không đổi: API public (`GET_MEDIA_TIME`, `FETCH_MULTI_LANG`, `PING`, `PLAY_AT`); chỉ chặn spoof.

1.2. `BRIDGE_FETCH` cho phép quá rộng với body tuỳ ý
- Vị trí: `extension/background/service_worker.js:421-460`.
- Hiện trạng: đã có allowlist regex, nhưng vẫn nhận raw body. Cải thiện: serialize body qua JSON.stringify + size cap (≤ 256 KB) và rate limit per-tab 50 req/s; không thêm path mới, không thay đổi allowlist. Ghi log vào `bridge.fetch` channel.
- Không đổi: behavior reject `bridge_path_denied` hiện tại.

1.3. `extension_state` mirror có race giữa pull và push
- Vị trí: `extension/background/service_worker.js:260-378`, alarm `poll_bridge_state`.
- Cải thiện: tăng alarm period lên ≥ 60s hiện đang đúng; thêm jitter ±10s để tránh hai SW đồng bộ cùng pha; giữ nguyên logic `_applyingBridgeState` và conflict guard.
- Không đổi: contract `{ userVocab, hardsubSettings, updatedAt, source }`.

1.4. Side panel listener phản hồi chậm khi bridge lạnh
- Vị trí: `extension/sidepanel/sidepanel.js`, smoke `scroll_follow_smoke.py`.
- Cải thiện: cache kết quả `/health` ≤ 5s; throttle `get_state` 200ms; giữ nguyên thứ tự render. Thêm console.debug có gate `__hardsubDebug`.

1.5. `content.js` quá lớn (>4k LOC) — chia module mà không đổi API
- Cải thiện: tách `normalize_cues.js`, `fill_yt_secondary.js`, `cue_timing.js`, `dfxp_parser.js`, `romaji_kana.js`, `vocab_style.js` thành ESM content-script modules; giữ nguyên `globalThis.Hardsub*` exports để script không phụ thuộc side-effect toàn cục. Tên export giữ nguyên.
- Không đổi: file đầu vào `content/content.js` vẫn là entry, chỉ chuyển sang `import`.

1.6. Build artifacts `extension/popup/_next` được track ngoài ý muốn
- Vị trí: `.gitignore` đã có `extension/popup/_next`? — kiểm tra; nếu thiếu, bổ sung pattern để tránh commit blob lớn.
- Cải thiện: thêm `extension/popup/_next/` vào `.gitignore`; quy ước build pop-up chạy `npm run build:extension` từ `web/saved-items/` rồi copy, không commit kết quả.

1.7. Đồng bộ Drive cho settings/vocab — debounce dùng `setTimeout`
- Vị trí: `extension/background/service_worker.js` (DRIVE_UPLOAD_DEBOUNCE_MS, DRIVE_SETTINGS_DEBOUNCE_MS).
- Cải thiện: SW có thể bị chrome kill giữa debounce; chuyển sang `chrome.alarms` (1 phút) để retry không bị rớt. Giữ nguyên interval debounce UI; chỉ dùng alarm cho retry cuối.

1.8. `decodeEntities` và parse timedtext bị duplicate trong content.js và service_worker.js
- Vị trí: `extension/content/content.js` (`parseTimedtextXml`, `parseJson3Cues`, `decodeEntities`) và `extension/background/service_worker.js` (`parseLegacyTextNodes`, `parseParagraphNodes`, `parseJson3`, `decodeEntities`).
- Cải thiện: tách vào `extension/shared/timedtext_parse.js` (UMD) và import ở cả hai; không đổi output shape.

### 2. Local bridge (FastAPI)

2.1. `app/main.py` là monolith ~524 LOC — tách router nhưng giữ nguyên route path và response
- Cải thiện: tách `routers/health.py`, `routers/scripts.py`, `routers/tokenize.py`, `routers/ime.py`, `routers/state.py`, `routers/backup.py`; mount với cùng prefix. Pydantic models không đổi.

2.2. Governor không bao bọc `/tokenize`, `/tokenize_batch`, `/dict` đồng nhất
- Vị trí: `local-bridge/app/main.py:235-267`, `_governed()` ở main; `local-bridge/app/core/governor.py`.
- Cải thiện: chuẩn hoá `_governed()` áp dụng cho cả ba endpoint; cap text size đầu vào (≤ 8 KB cho `/tokenize`, batch cue ≤ 1024). Trả 503 + Retry-After giống hiện tại.

2.3. Validation timing/interval đã có ở `ScriptCue` nhưng `IME`/`ext_state` thiếu literal
- Cải thiện: thêm `Field(min_length=0, max_length=128)` cho `ImeSwitchRequest.to` đã có Literal; thêm `max_length` cho `userVocab` key 128, value đã validate. Không đổi error response shape.

2.4. `script_store.save_script` write 4 file tuần tự, có khóa theo video_id
- Vị trí: `local-bridge/app/services/script_store.py:315-446`.
- Cải thiện: thêm manifest JSON `{generated_at, files: [...]}` hoặc chỉ ghi file đã đổi (skip unchanged); ghi tạm staging rồi atomic rename từng file; giữ nguyên rev. Không đổi file list.

2.5. Bootstrap download vẫn có thể để `.gz` dở
- Vị trí: `local-bridge/app/scripts/bootstrap.py` (~187 LOC).
- Cải thiện: dùng `tempfile.NamedTemporaryFile` + `shutil.move` cho mỗi asset; log hash đã verify; giữ nguyên URL.

2.6. Snapshot v1 chỉ chứa vocab và start text — phù hợp hiện trạng, không mở rộng
- Cải thiện: chỉ thêm test round-trip ở `local-bridge/tests/test_snapshot_roundtrip.py` để khóa contract hiện có.

2.7. Cache LRU + freq band: thêm metric size / hit ratio cho health
- Cải thiện: trả thêm `cache.hit_ratio` read-only trong `/health`; không thêm field đột biến.

2.8. Tests chưa có `pytest` trong `requirements.txt`; CI thiếu gate
- Cải thiện: thêm `pytest`, `pytest-asyncio`, `httpx` vào `requirements.txt`; thêm `pytest` step ở `local-bridge/start.sh` (gated `PYTEST=1`); không tự chạy khi start.

2.9. Error logging theo AGENTS §6 hiện đã có `_append_errors_log` — chuẩn hoá thêm cho mọi exception đã `logger.exception`
- Cải thiện: trong `app/main.py`, mỗi nhánh 500 hiện đã log error; chỉ cần chuẩn hoá format `<level>:bridge:<short message>` (đã có) cho các entry `WARNING`.

### 3. iPad & iPhone Swift apps

3.1. Parity drift giữa iPad/iPhone — rất nhiều file giống hệt
- Vị trí: `Models/ScriptStore.swift`, `Models/VocabStore.swift`, `Services/BackupService.swift`, `Services/CaptionService.swift`, `Services/DictionaryService.swift`, `Services/DriveAPIClient.swift`, `Services/DriveAuthService.swift`, `Services/DriveOAuthConfig.swift`, `Services/DriveScriptsService.swift`, `Services/FreqService.swift`, `Services/NLPTagger.swift`, `Services/SettingsSync.swift`, `Services/SubtitleParser.swift`, `Services/SubtitleParserSmoke.swift`, `Services/VocabStyle.swift`, `Services/VocabSync.swift`, `Services/YouTubeURL.swift`, `Views/...`.
- Cải thiện: tạo module Swift chia sẻ `CaptionStudioCore` (Xcode local package); iPad & iPhone import package; giữ nguyên file cho đến khi build parity pass. **Không bắt buộc** thực hiện giai đoạn này nếu thiếu thời gian, có thể để giai đoạn 2 (xem Mục 6).

3.2. Cue id dùng timestamp → dễ trùng
- Vị trí: `Services/SubtitleParser.swift`, `Models/ScriptStore.swift`.
- Cải thiện: id dạng `<ms>-<index>` thay vì `<ms>`; vẫn khớp `Dictionary(uniqueKeysWithValues:)`; thêm unit test duplicate timestamp.

3.3. Drive sync đẩy lastMirroredRev tăng đơn điệu — không bảo vệ local mới hơn remote
- Vị trí: `Services/DriveScriptsService.swift`.
- Cải thiện: trước khi replace, so sánh `remote.rev` với local cached rev; nếu remote cũ, bỏ qua hoặc đẩy local trở lại.

3.4. `context.save()` sau Drive success — đã có cảnh báo trong review 08-07 H5
- Cải thiện: propagate lỗi local save; chỉ clear dirty khi local save thành công.

3.5. OAuth state + ATS — đã nêu trong M7 của review 08-07
- Cải thiện: thêm state ngẫu nhiên và exact-match; thu hẹp ATS exception cho domain cần thiết; giữ nguyên flow xác thực.

3.6. WebView navigation — đã nêu M7
- Cải thiện: chỉ allowlist host YouTube/Netflix/ABEMA trong `WKNavigationDelegate`; từ chối các scheme khác.

3.7. Script deploy/renew dùng `com.apple.developer.team-identifier` qua `TEAM=XXXXXXXXXX` placeholder
- Cải thiện: tài liệu hoá rõ `TEAM` là biến bắt buộc; bỏ placeholder khỏi comment trong script.

### 4. macOS bridge app

4.1. `macos-bridge-app/Sources/main.swift` chạy bridge subprocess
- Cải thiện: lưu PID chính xác; truyền SIGTERM (không `kill -9`) trước khi `kill -9`; log về unified log; giữ nguyên hành vi start/stop.

4.2. Build script `build.sh` có `codesign || true` — che lỗi
- Cải thiện: `set -e` + `codesign --verify`; fail-fast.

4.3. Iconset name chứa email
- Cải thiện: chuẩn hoá icon name trước khi build.

### 5. Web (Next.js `web/saved-items/`)

5.1. Trộn mock data vào store thật
- Vị trí: `web/saved-items/src/lib/vocab-store.ts`, `web/saved-items/src/components/SavedItemsApp.tsx`.
- Cải thiện: tách `mock-data.ts` thành dev-only module, gate qua `import.meta.env.DEV`; production không seed mock.

5.2. `MOCK_SAVED_WORDS` seed mỗi lần tải
- Cải thiện: kiểm tra empty state trước khi seed; không ghi đè local.

5.3. `SettingsPanel` cập nhật cùng lúc với effect → cảnh báo ESLint
- Cải thiện: chuyển sang derived state hoặc lazy initializer; giữ nguyên UI.

5.4. `localStorage` write race
- Cải thiện: serialize writes qua một promise chain; coalesce theo key.

5.5. `next.config.ts` và tsconfig — bật `strict` đầy đủ
- Cải thiện: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; không đổi code nếu không cần.

5.6. Generated popup assets `extension/popup/` được build thủ công — thêm script `npm run build:extension` ở `package.json` (đã có) nhưng tài liệu hoá trong `README.md`.

5.7. ESLint rule `set-state-in-effect` đang fail — sửa như 5.3, không tắt rule.

5.8. `web/saved-items/out/` có build artifact
- Cải thiện: thêm `out/` vào `.gitignore` của Next app (nếu chưa có).

### 6. Repo hygiene, docs, scripts, wiki

6.1. `wiki/topics/` cần ingest plan/review mới và mục `wiki/index.md` ngày 2026-08-22 sau khi plan này được duyệt.

6.2. `skills/` theo AGENTS §5 có 5 skill: youtube-caption, local-bridge, tokenize-regression. Còn thiếu `ponytail` và `codegraph` đúng chuẩn — đã có tham chiếu trong AGENTS. Cải thiện: tạo `skills/ponytail/SKILL.md`, `skills/codegraph/SKILL.md` (stub), không đổi các skill hiện có.

6.3. `tools/open-code-review/` có vẻ là vendored — xác nhận nguồn gốc; nếu vendored, cân nhắc tách submodule.

6.4. `.gitmodules` trống — xác nhận xem có submodule nào cần khai báo (vd. `tools/open-code-review`).

6.5. `data/dict/` chứa `ja_vi.json`, `en_vi.json`, `vnedict.txt` — có thể đẩy sang `local-bridge/data/dict/` để tách khỏi repo.

6.6. `local-bridge/data/` không track — đúng theo knowledge map; xác minh `.gitignore` đã có.

6.7. README phần iPhone nói "chưa đủ parity tuyệt đối" — không cần đổi.

6.8. `walkthrough.md` đang có thay đổi chưa commit (`M walkthrough.md`) — đối chiếu khi rebase.

6.9. `wiki/log.md` và `wiki/index.md` đang có thay đổi chưa commit — đối chiếu khi rebase.

## Ưu tiên thực hiện

| # | Mục | Lý do | Effort |
|---|------|--------|--------|
| 1 | 1.6 popup/_next .gitignore + 5.8 out/ .gitignore | Repo size + data hygiene | XS |
| 2 | 1.1 capability token | Trust boundary | S |
| 3 | 1.2 BRIDGE_FETCH cap + rate | DoS guard | XS |
| 4 | 1.7 alarm debounce cho Drive retry | Data loss risk khi SW bị kill | S |
| 5 | 1.8 timedtext parse shared module | Duplication | S |
| 6 | 2.1 router split | Maintainability | S |
| 7 | 2.2 governor chuẩn hoá /tokenize, /dict | Resource cap | XS |
| 8 | 2.4 manifest/staging write | Concurrency | M |
| 9 | 2.8 pytest dependency + gate | Regression | S |
| 10 | 3.2 cue id timestamp+index | Identity invariant | XS |
| 11 | 3.3 DriveScriptsService rev guard | Data loss | S |
| 12 | 3.5 OAuth state + ATS narrow | Security | S |
| 13 | 4.2 codesign fail-fast + 4.3 icon | Build hygiene | XS |
| 14 | 5.1 / 5.4 mock data + race | Web store correctness | S |
| 15 | 5.5 tsconfig strict | Type safety | XS |
| 16 | 6.2 skills/ponytail, skills/codegraph stub | Knowledge map | XS |
| 17 | 1.3 / 1.4 side panel health cache + jitter | UX/perf | XS |

> Các mục không nằm trong plan: thay đổi UI, thay đổi API JSON shape, thay đổi storage layout, bật MT/OCR, sửa phần mà review 08-07 đã nói "đã kiểm tra và không lặp lại".

## Không nằm trong phạm vi (out of scope)

- Thêm tính năng mới (MT, OCR, scrape Netflix ABEMA khác…).
- Đổi cấu trúc storage `data/subtitles/{videoId}/`.
- Đổi tên field, route hoặc schema API.
- Xoá `data/subtitles/`, `data/dict/`, `local-bridge/data/`, `extension/popup/`, `tools/open-code-review/`.
- Tái cấu trúc kiến trúc MV3 ↔ content ↔ MAIN world.

## Definition of done cho từng mục

- Không test nào bị xoá; bổ sung test khi thêm guard (vd. BRIDGE_FETCH cap).
- File thay đổi được liệt kê trong mục tương ứng; không vượt quá phạm vi.
- `local-bridge/pytest`, `python test_tokenize_import_enrich.py`, `npm run check` đều pass sau khi sửa.
- Không tăng tracked file blob (pop-up build output, scripts churn không cần thiết).
- Sau khi áp dụng: cập nhật `wiki/topics/codebase-improvements-2026-08-22.md` + 1 dòng trong `wiki/log.md` + 1 dòng catalog trong `wiki/index.md`.

## Bước tiếp theo đề xuất

1. Người dùng commit/xử lý working tree hiện tại (để rebase clean).
2. Bắt đầu nhóm 1–4 (repo hygiene + trust boundary) — không đổi behavior.
3. Sau mỗi nhóm: chạy regression (`local-bridge/pytest` + `python test_tokenize_import_enrich.py` + `npm run check`); cập nhật wiki.