# Codebase improvements — 2026-08-22

Status: partial (priority guards + bridge validation shipped 2026-08-23; remaining modules open).

## Plan

- [plan/codebase-improvement-plan-2026-08-22.md](../../plan/codebase-improvement-plan-2026-08-22.md)

## Baseline

- [review/codebase-review-2026-08-07.md](../../review/codebase-review-2026-08-07.md) — C1/H1–H8/M1–M10 closed per wiki index 2026-08-07.
- [review/local-bridge-audit-2026-08-06.md](../../review/local-bridge-audit-2026-08-06.md) — 10/10 findings còn ALIVE (per wiki index).
- Working tree lúc audit: nhiều file chưa commit (`M extension/...`, `M local-bridge/...`, `M web/saved-items/...`, `M wiki/...`, `M walkthrough.md`). Mọi sửa theo plan phải rebase sau khi commit/xử lý working tree hiện tại.

## Shipped (closed) — không lặp lại

C1/H1–H8/M1–M10 đã closed bởi review 2026-08-07; chỉ giữ liên kết cho traceability.

## Open gaps (mục mới trong plan 2026-08-22)

Nhóm sắp xếp theo thứ tự ưu tiên trong plan; mỗi mục có file/line anchor.

### Trust boundary & DoS (extension) — shipped

- [x] 1.1 capability token giữa MAIN-world page script và content script
  - `extension/content/content.js` + `extension/injected/page_capture.js`
- [x] 1.2 `BRIDGE_FETCH` body cap + per-tab rate limit
  - `extension/background/service_worker.js`

### SW resilience (extension) — shipped

- [x] 1.7 Drive debounce giữ timer 5s; `chrome.alarms` + session storage retry khi SW bị kill
  - `extension/background/service_worker.js` (`DRIVE_UPLOAD_ALARM`, `DRIVE_PENDING_MIRROR_KEY`)

### Code health (extension)

- 1.5 content.js > 4k LOC — chia module ESM giữ nguyên `globalThis.Hardsub*` exports
- 1.8 timedtext parse duplicate giữa content + service_worker — tách vào `extension/shared/timedtext_parse.js`
- 1.3 / 1.4 side panel health cache + alarm jitter

### Repo hygiene

- 1.6 `extension/popup/_next` build artifact vào `.gitignore`
- 5.8 `web/saved-items/out/` build artifact vào `.gitignore`
- 6.2 `skills/ponytail`, `skills/codegraph` stub (AGENTS §5 liệt kê 5 skills, repo còn thiếu 2)

### Bridge (FastAPI) — partial shipped

- [x] 2.2 `_governed()` bao `/dict` (trước chỉ có `/tokenize`, `/tokenize_batch`)
  - `local-bridge/app/main.py`
- [x] 2.3 `max_length` validation: `TokenizeRequest.text` ≤ 8192; `DictRequest.surface` ≤ 512, `lemma` ≤ 256, `sentence_id` ≤ 128; `SegmentCueIn.id` ≤ 128, `text` ≤ 2048; `userVocab` key ≤ 128 (validator)
  - `local-bridge/app/schemas/models.py`
- [x] 2.8 `pytest`, `pytest-asyncio`, `httpx` vào `requirements.txt`
  - `local-bridge/requirements.txt`
- [ ] 2.1 router split `app/main.py`
- [ ] 2.4 staging write + manifest `script_store.save_script`
- [ ] 2.5 bootstrap `tempfile.NamedTemporaryFile` + `shutil.move`
- [ ] 2.6 snapshot roundtrip test
- [ ] 2.7 `cache.hit_ratio` trong `/health`

### iPad / iPhone Swift

- 3.1 parity drift — giai đoạn 2 tạo `CaptionStudioCore` local package (không bắt buộc đợt này)
- 3.2 cue id `<ms>-<index>` thay vì `<ms>` chống trùng
- 3.3 DriveScriptsService rev guard (remote cũ → bỏ qua hoặc đẩy local)
- 3.4 `context.save()` lỗi → propagate, không clear dirty
- 3.5 OAuth `state` exact-match + ATS narrow
- 3.6 WebView allowlist host (YouTube/Netflix/ABEMA)
- 3.7 docs `TEAM=XXXXXXXXXX` placeholder trong deploy/renew script

### macOS bridge

- 4.1 `main.swift` — graceful SIGTERM trước SIGKILL; PID chính xác
- 4.2 `build.sh` — bỏ `codesign || true`; `set -e` + `codesign --verify`
- 4.3 icon name chuẩn hoá

### Web (Next.js)

- 5.1 mock data tách dev-only (`import.meta.env.DEV`)
- 5.2 mock seed kiểm tra empty trước khi ghi
- 5.3 `SettingsPanel` — derived state / lazy initializer (sửa ESLint `set-state-in-effect`)
- 5.4 `localStorage` write — serialize qua promise chain
- 5.5 tsconfig — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

## Out of scope (giữ nguyên)

- UI thay đổi, API JSON shape, storage layout, MT/OCR.
- Xoá `data/subtitles/`, `data/dict/`, `local-bridge/data/`, `extension/popup/`, `tools/open-code-review/`.
- Tái cấu trúc kiến trúc MV3 ↔ content ↔ MAIN world.

## Definition of done cho từng mục

- Không xoá test; bổ sung test khi thêm guard.
- File thay đổi nằm trong phạm vi mục tương ứng.
- `local-bridge/pytest`, `python test_tokenize_import_enrich.py`, `npm run check` đều pass.
- Không tăng tracked blob (pop-up build output, scripts churn không cần thiết).
- Sau khi áp dụng nhóm: cập nhật wiki topic này + `wiki/log.md`.

## Next steps đề xuất

1. Người dùng commit/xử lý working tree hiện tại.
2. Nhóm 1–4 (repo hygiene + trust boundary) — không đổi behavior.
3. Sau mỗi nhóm: regression + cập nhật wiki.