<!-- date: 2026-08-26 -->
<!-- source: chat:plan-ceo-review · user: Create a file plan -->

# Plan cải thiện codebase & độ ổn định — 2026-08-26

## 1. Context & Mục tiêu

Sau khi hoàn thành CEO review, kiểm tra codebase thực tế và đối chiếu đánh giá độc lập (Outside Voice), plan này chuẩn hóa và hoàn thiện các cải tiến độ ổn định cho YouTube JP Caption Studio trên 3 tầng (Chrome Extension MV3, FastAPI Local Bridge :8765, Native iPad/iPhone Apps).

---

## 2. Danh mục phạm vi công việc

### Tầng 1: Chrome Extension (MV3)
- **Shared Parser Cleanup:**
  - File: `extension/shared/timedtext_parse.js`
  - Đảm bảo xử lý zero-duration ASR cues (clamp tối thiểu 0.2s khi trùng `tStartMs`).
  - Dọn dẹp các wrapper thừa trong `extension/content/content.js` và `extension/background/service_worker.js` để gọi trực tiếp `HardsubTimedtextParse.*`.
- **Bridge Fetch Hardening:**
  - Nâng giới hạn payload cap lên 10MB (hỗ trợ transcript phim dài 2h kèm furigana đầy đủ).
  - Tách biệt seek event với background state polling để thao tác tua video mượt mà ở 60fps.
- **Offline Fallback Dictionary & Live Status Pill:**
  - File: `extension/shared/vocab_style.js`, `extension/content/content.js`
  - Tích hợp fallback từ điển 5,000 từ cơ bản sử dụng `Intl.Segmenter("ja", {granularity: "word"})` khi Bridge offline.
  - Thêm bridge connection pill trên overlay video (xanh/vàng/đỏ) kèm `stopPropagation()` tránh dừng video khi click.

### Tầng 2: Local Bridge (FastAPI :8765)
- **Atomic File IO:**
  - File: `local-bridge/app/services/script_store.py`, `local-bridge/app/scripts/bootstrap.py`
  - Đảm bảo `_atomic_write_text` luôn truyền `dir=path.parent` khi tạo tempfile để tránh lỗi cross-device `EXDEV` khi ghi trên mount point khác.

### Tầng 3: Native iOS / iPad Apps
- **Allowlist & Cue ID Stability:**
  - File: `ipad-app/Views/YouTubePlayerView.swift`, `iphone-app/Views/YouTubePlayerView.swift`
  - Mở rộng allowlist tên miền cho `WKWebView`: bổ sung `accounts.google.com`, `consent.youtube.com`, `*.googlevideo.com` để không chặn luồng đăng nhập Google và CDN video.
  - File: `ipad-app/Services/SubtitleParser.swift`, `iphone-app/Services/SubtitleParser.swift`
  - Đồng bộ format cue ID dạng `<ms>-<index>` đảm bảo tính duy nhất khi parse phụ đề.

---

## 3. Implementation Tasks

- [x] **T1 (P1, CC: ~10min)** — `extension` — Finalize UMD timedtext parser integration & duration clamping
  - Enforce minimum 0.2s duration on ASR cue collisions
  - Clean up direct calls in `content.js` and `service_worker.js`
- [x] **T2 (P1, CC: ~10min)** — `bridge` — Hardened atomic file IO in script_store
  - Ensure temp staging uses `dir=path.parent` for `script_store.py` and `bootstrap.py`
- [x] **T3 (P2, CC: ~10min)** — `ios` — iOS allowlist expansion & cue ID alignment
  - Add Google auth, consent, and googlevideo hosts to `YouTubePlayerView.swift`
  - Align cue ID generation in `SubtitleParser.swift`
- [x] **T4 (P2, CC: ~10min)** — `extension` — Offline 5k dictionary & video overlay status pill
  - Integrate `Intl.Segmenter` fallback lemma lookup in `vocab_style.js`
  - Inject isolated bridge status indicator pill in `content.js`

---

## 4. Verification & Test Plan

1. **Parser Tests:**
   ```bash
   node extension/shared/import_parse_test.js
   ```
2. **Bridge Unit & Router Tests:**
   ```bash
   pytest local-bridge/tests/
   ```
3. **iOS Webview & Parser Verification:**
   - Kiểm tra `YouTubePlayerView` nạp video YouTube và cho phép đăng nhập Google tài khoản bình thường.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 2 proposals, 2 accepted, 0 deferred |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 0 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

VERDICT: CEO + ENG CLEARED — ready to implement

NO UNRESOLVED DECISIONS
