<!-- date: 2026-08-23 -->
<!-- source: chat:user-request · user: lập plan cải thiện và fix codebase theo audit -->

# Plan cải thiện codebase — 2026-08-23

## Phạm vi & Nguyên tắc (Ponytail Mindset)

- Giữ nguyên 100% contracts và behavior giữa Extension ↔ Bridge ↔ Drive ↔ iOS Apps.
- Không thay đổi API routes, format schema, hay storage directory structure.
- Ưu tiên: Minimal diff, deletion over addition, atomic filesystem operations, security bounds.
- Phân chia công việc thành các subagents độc lập để thực hiện song song.

---

## Danh mục nhiệm vụ theo Subagents

### Subagent 1: Chrome Extension Hygiene & Shared Modules
- [ ] **Task 1.1:** Tạo `extension/shared/timedtext_parse.js` (UMD) chứa `decodeEntities`, `parseTimedtextXml`, `parseJson3Cues`.
- [ ] **Task 1.2:** Refactor `extension/content/content.js` và `extension/background/service_worker.js` để import và sử dụng shared module.
- [ ] **Task 1.3:** Thêm size cap (≤ 256KB) và per-tab rate limiter cho `BRIDGE_FETCH` trong `service_worker.js`.
- [ ] **Task 1.4:** Thêm cache 5s cho `/health` và throttle 200ms cho `get_state` trong `extension/sidepanel/sidepanel.js`.
- [ ] **Test:** Chạy toàn bộ test sanity trong `scripts/` đảm bảo không regression.

### Subagent 2: Local Bridge Reliability & Router Separation
- [ ] **Task 2.1:** Thêm atomic write (staging temp file + `os.replace`) cho `local-bridge/app/services/script_store.py`.
- [ ] **Task 2.2:** Cải thiện `local-bridge/app/scripts/bootstrap.py` dùng `tempfile.NamedTemporaryFile` + `shutil.move`.
- [ ] **Task 2.3:** Tách `local-bridge/app/main.py` thành các sub-routers trong `local-bridge/app/api/` (`tokenize.py`, `dict.py`, `scripts.py`, `state.py`, `ime.py`, `health.py`), giữ nguyên path và schemas.
- [ ] **Task 2.4:** Bổ sung `cache.hit_ratio` và `governor.active_slots` vào `/health` response.
- [ ] **Test:** Chạy test suite `local-bridge/tests/`.

### Subagent 3: Native iOS / iPad Apps Consistency
- [ ] **Task 3.1:** Fix cue ID timestamp collision trong `ipad-app/Services/SubtitleParser.swift` và `iphone-app/Services/SubtitleParser.swift` (chuyển sang dạng `<ms>-<index>`).
- [ ] **Task 3.2:** Thêm domain validation cho `WKWebView` trong `YouTubePlayerView.swift` (chỉ cho phép youtube.com, netflix.com, abema.tv).
- [ ] **Task 3.3:** Đồng bộ các bản vá giữa `ipad-app/` và `iphone-app/`.

### Subagent 4: Web & Repo Hygiene
- [ ] **Task 4.1:** Cập nhật `web/saved-items/src/lib/mock-data.ts` và `src/lib/vocab-store.ts` để gate mock data chỉ nạp khi DEV và storage rỗng.
- [ ] **Task 4.2:** Đảm bảo `.gitignore` bao gồm `extension/popup/_next/`, `web/saved-items/out/`, và temp artifacts.
- [ ] **Task 4.3:** Cập nhật `wiki/log.md`, `wiki/index.md`, và tạo `wiki/topics/codebase-improvements-2026-08-23.md`.

---

## Thứ tự triển khai & Gate kiểm tra

1. **Pha 1: Thực thi song song 4 Subagents** với worktree isolation.
2. **Pha 2: Chạy validation toàn diện:**
   - Node sanity scripts: `lang_family`, `fill_yt_secondary`, `cue_timing`, `rev_pick`, `netflix_dfxp`, `normalize_cues`.
   - Python tests: `local-bridge/tests/test_*.py`.
3. **Pha 3: Cập nhật Wiki & Documentation.**
