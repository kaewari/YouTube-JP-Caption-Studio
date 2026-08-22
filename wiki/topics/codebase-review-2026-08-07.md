<!-- date: 2026-08-07 -->

# Codebase Review 2026-08-07

## Status

**Closed.** Toàn bộ finding từ review (C1, H1–H8, M1–M10) đã xử lý: H4–H6/M9/M10
trong phiên trước (Drive tombstone sync, context.save, VocabSync, web race/mock,
lint gate); phần còn lại fix 2026-08-07 (chi tiết dưới). Kiểm chứng: iPad +
iPhone build xanh, macOS build xanh, web lint/typecheck/build xanh, bridge
`test_script_store` + `test_en_vi_bridge` + 4 pytest pass.

## Raw review

- [review/codebase-review-2026-08-07.md](../../review/codebase-review-2026-08-07.md)
- Đã fix phiên trước: H4–H6, M9, M8 (build.sh iconset), M10 — xem wiki/topics/plans-completion.

## Fixes 2026-08-07

| Finding | Fix | Chỗ |
|---|---|---|
| C1 Docker LAN | Compose publish `127.0.0.1:8765:8765` (container vẫn 0.0.0.0 cho docker-proxy) | `local-bridge/docker-compose.yml` |
| H1 postMessage forge | `ev.source !== window` reject — 2 receiver (content + page) | `extension/content/content.js`, `extension/injected/page_capture.js` |
| H8 raw proxy | `BRIDGE_ALLOWLIST` path+method allowlist; ngoài → `bridge_path_denied` | `extension/background/service_worker.js` |
| M1 CORS | `allow_credentials=False` (origin regex đã hẹp sẵn) | `local-bridge/app/main.py` |
| M2 multi-file save | Lock per-video quanh `save_script` (wrapper `_save_script_locked`) | `local-bridge/app/services/script_store.py` |
| M4 governor | `_governed()` context manager → tokenize/tokenize_batch/dict 503 khi saturated | `local-bridge/app/main.py` |
| M5 timing NaN/âm | `model_validator` reject non-finite/âm/end<start tại API boundary | `local-bridge/app/schemas/models.py` |
| M6 manual clamp | Start vượt next cue → clamp về `next.start - GAP` | `extension/content/cue_timing.js` |
| M7 OAuth/ATS/nav | `state` random + exact-match callback; ATS `NSAllowsLocalNetworking` (bỏ ArbitraryLoads); WKWebView chỉ allow YouTube host (cả 2 app; iphone cả project.yml) | `DriveAuthService.swift`, `Info.plist`, `project.yml`, `YouTubePlayerView.swift` |
| M8 macOS stop | Chỉ kill tree (pkill -P) + sweep port khi app sở hữu bridge (`bridgeProcessOwned`); không giết process ngoài | `macos-bridge-app/Sources/main.swift` |

H2/H3/H7 và M3 đã nằm trong working tree từ trước phiên này:
- H2: empty-payload wipe chỉ khi owned + cho phép push script trống (`content.js`).
- H3: save giữ toàn bộ cue — `maxSentences` chỉ giới hạn render (`content.js`).
- H7: `uniqueId` suffix trong parser + `uniquingKeysWith` thay `Dictionary(uniqueKeysWithValues:)` (cả 2 app).
- M3: bootstrap `_download` temp + atomic replace (`bootstrap.py`).

## Known open

- `pytest tests/` vẫn error với `test_script_store.py` (thiếu fixture `root`) — pre-existing; file chạy qua `python -m tests.test_script_store` (pass). Không phải regression.
- Đáng làm tiếp (ngoài phạm vi review): CORS origin dùng token thay Host check nếu cần remote bridge; scope Drive có thể hẹp về `drive.file`.
