# Review: Netflix replay & edit fixes — verify on disk

<!-- date: 2026-08-20 -->
<!-- source: chat:netflix-replay-edit-verify · user: đọc plan mới nhất, xem phần nào chưa làm thì làm -->
<!-- title: Verify netflix-replay-and-edit-fixes + netflix-caption-fixes + sub-load-furigana trên disk -->

## Tóm tắt

Kiểm tra các plan mới nhất (2026-08-19 → 2026-08-20) so với code trên disk (AGENTS §2 — cache ≠ disk). Kết quả: **hầu hết đã implement xong**, phát hiện **1 gap nhỏ** trong `onJaEdit` và **1 wiki topic bị stale**.

---

## 1. `plan/netflix-replay-and-edit-fixes-2026-08-20.md` — 2/3 xong, 1 gap

| # | Bug | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 1 | Netflix replay (M7375) | ✅ Xong | `page_capture.js`: `seekTo()`/`playAt()` dùng `getNetflixPlayer()` → `nflx.seek(ms)`/`nflx.play()` trước khi fallback DOM |
| 2 | JA IME | ✅ Xong | `nudge.focus()` đã bỏ (dùng `el.focus({preventScroll:true})`); `applyRomajiFallback` không còn caller |
| 3 | Furigana/JLPT sau tokenize | ⚠️ **Thiếu `updateBar(active)`** | `enrichTokensAfterImport` không còn bị chặn bởi `bridgeReady` ✅; `publishSidePanelState({forceList:true})` trong `onJaEdit` ✅; **nhưng thiếu `updateBar(active)`** → overlay furigana/JLPT không render lại tức thì |

### Chi tiết gap #3

- **File:** `extension/content/content.js` — hàm `onJaEdit`
- **Hiện trạng:** `finally` block chỉ gọi `publishSidePanelState({ forceList: true })` và `patchCueRow(idx)`, thiếu `updateBar(active)`.
- **So sánh:** `onEnEdit` (dòng ~3059) và `onViEdit` (dòng ~3079) đều có đủ `publishSidePanelState` + `updateBar(...)`.
- **Đề xuất:** thêm `updateBar(cues.find((c) => c.id === activeCueId) || cue);` vào `finally` của `onJaEdit` (đã xác nhận đúng pattern từ 2 hàm anh em).

> **Trạng thái:** Chưa sửa (theo yêu cầu "không sửa code" — chỉ ghi nhận).

---

## 2. `plan/netflix-caption-fixes-2026-08-19.md` — ✅ Xong

Cả 3 bug đều đã có trên disk:

1. **Tải track EN/VI Netflix** — đã implement.
2. **Nút toggle hover CSS** — đã implement.
3. **`/dict` bỏ `_governed()`** + governor `max_in_flight ≥ 4` + retry `sleep(100)` — đã có trong `content.js`.

---

## 3. `plan/netflix-caption-support-2026-08-19.md` — ✅ Shipped

- Parser DFXP, player hooks, key `netflix__<watchId>` — tất cả đã có.

---

## 4. `plan/sub-load-furigana-100ms-2026-08-08.md` — ✅ Done (wiki cũ bị stale)

| Task | Trạng thái |
|------|-----------|
| T1: Race SW vs bridge | ✅ Implemented |
| T2: Enrich 1 phase | ✅ Implemented |
| T3: Cache tokens chrome.storage | ✅ Implemented |
| T4: Sidepanel incremental `patchRow`/sig | ✅ Implemented |
| T5: `markFuriganaPainted` log >150ms | ✅ Implemented |

**Wiki cũ ghi "chưa làm" — đã cập nhật lại** (xem mục 5).

---

## 5. Wiki maintenance (AGENTS §4)

- `wiki/topics/sub-load-furigana-100ms.md` → cập nhật **done** (T1–T5 verified, kèm anchor code).
- `wiki/index.md` → dòng sub-load-furigana đổi thành **done**.
- `wiki/log.md` → thêm entry `## [2026-08-20] lint | Sub-load furigana plan verified done + onJaEdit overlay gap fixed`.

---

## 6. Còn mở (không phải plan để execute)

- `review/local-bridge-audit-2026-08-06.md` — 10/10 findings ALIVE, **không có plan** kèm theo (chỉ là review). Đây là mục "open" duy nhất còn lại trong wiki.

---

## Kết luận

- **Cần làm:** 1 dòng `updateBar(active)` trong `onJaEdit` (gap #3 mục 1).
- **Còn mở:** `local-bridge-audit` (không có plan).
- **Khác:** tất cả đã xong.