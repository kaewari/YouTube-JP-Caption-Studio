<!-- title: Multi-model desktop bugs & performance review -->
<!-- date: 2026-08-03 -->
<!-- source: chat:653f9bd3-7692-4453-92a6-da0365916f1d · /multi-model-review -->

# Báo cáo multi-model review — bugs & hiệu năng

**Phạm vi:** Desktop stack trong `youtube-jp-caption-studio/` (extension + local-bridge), theo `walkthrough.md`. Không sửa code.

**Reviewer chạy thành công:** [Grok](a8fab039-7816-4d0c-b425-fc0de63677a4), [Composer](c143e8ab-735c-4cb3-a0f6-a4414b2b3750)  
**Không chạy được (hết API quota):** Sonnet, Opus, Sol, Codex, Terra, Luna, GPT-5.5  
→ Báo cáo tổng hợp từ 2 model + đối chiếu trực tiếp trên source. B1–B9 coi là đã fix; không thấy regression rõ.

---

## Act on (nên xử lý)

### 1. EN-only bị mất khi merge lại với YT — bug
- **Consensus:** Composer + verified
- `flattenCached` chỉ set `translated` từ `translated || vi`, **không** tính EN. `mergeCache` chỉ copy EN/VI khi `hit.translated && hasMt`.
- Cue chỉ có EN → reload/merge YT có thể **xóa EN** im lặng.
- **Gợi ý:** `translated` = có EN hoặc VI; restore khi `hasMt`.

### 2. Orphan EN/VI “cướp” active cue — bug
- **Consensus:** Grok + verified logic
- `findActiveCue` “last match wins”; orphan (`source: ""`) append sau JA → cùng cửa sổ thời gian thì orphan thắng → hardsub/ĐANG PHÁT sai.
- **Gợi ý:** Ưu tiên cue có `source`, hoặc bỏ `yt-*-orphan` khỏi playhead.

### 3. Timer 250ms luôn chạy (overlay OFF) — performance
- **Consensus:** cả 2 + verified
- `startLoop`: `setInterval(tick, 250)` + `syncHealth` 5s; `ensureVideoLayoutSync`: `setInterval` 250ms (`applyBarPosition` / `applyDim` / `ensurePlayerToggle`) + ResizeObserver + MutationObserver subtree.
- `tick` chỉ gate `settings.enabled` (default true); `showOnVideo` default false vẫn `GET_MEDIA_TIME` + layout.
- **Gợi ý:** Tắt layout khi overlay off; skip khi tab hidden / pause; tránh chồng async tick.

### 4. Drive upload debounce bằng `setTimeout` — bug sync
- **Consensus:** cả 2 (đã ghi `ponytail:` trong code)
- MV3 kill worker → mất timer → save không lên Drive đến khi Upload tay.
- **Gợi ý:** Persist pending IDs + `chrome.alarms` (như `POLL_BRIDGE_ALARM`).

### 5. `/tokenize_batch` không chunk + có thể chạy song song — performance
- **Consensus:** Composer (unbounded) + Grok (no single-flight)
- Một POST cả script (tới `maxSentences: 2000`); nhiều path `void enrichTokensAfterImport()` đồng thời.
- **Gợi ý:** Chunk 50–100; một promise in-flight.

---

## Consider (nên cân nhắc)

| # | Finding | Ai nêu | Ghi chú |
|---|---------|--------|---------|
| 6 | Restore luôn `scheduleSaveTranscript` → `save_script` **luôn** `rev+1` dù nội dung không đổi | Grok + verified | Sync noise + Drive I/O mỗi lần mở video |
| 7 | Panel open → `DRIVE_PULL` → `mirrorFromDrive()` **không** lọc `videoId` → liệt kê cả thư viện Drive | Composer + verified | Storm API khi library lớn |
| 8 | `ensureSecondaryPacks`: `needPage` còn true khi cả EN/VI rỗng dù SW đã biết không có track | Grok + verified | Thừa `FETCH_MULTI_LANG`/ANDROID |
| 9 | `parseJson3` page dùng `dDurationMs` trước; SW dùng `next.start` | Composer + verified | Path page-rescue có thể lệch overlap (kiểu B9 cục bộ) |
| 10 | TOCTOU save vs Drive pull | Grok | Stale in-memory overwrite disk mới hơn — rủi ro kiến trúc |

---

## Noted (nhỏ / ít tốn)

- `findActiveCue` sort lại mỗi tick — O(n log n)×4/s (nit cả 2).
- Governor `psutil` mỗi 2s nhưng `try_acquire` không gắn tokenize/dict; `caps.max_fps` lưu mà không throttle (Grok + verified).
- Saved Items poll `/extension_state` ~1.5s × 2 store (Grok).
- Dict lookup tokenize lại surface mỗi lần (Composer).
- `_cues_from_txt` map `id`/lock theo **index** — reorder TXT lệch tokens (Composer).
- Sidepanel Escape: furigana cần `translated` trong khi list chỉ cần `tokens` (Composer nit).

---

## Dismissed / giữ nguyên

- **B1–B9:** cả 2 không thấy regression smoking gun; ANDROID rescue, JA paint sớm, overlap fill, pin timeline vẫn có trong code.
- Sidepanel RAF pin/coalesce ~380ms: đúng chỗ, không phải always-on waste.
- `dictionary.py` reuse connection: ổn.

---

## Top ưu tiên (tổng hợp)

1. **EN-only mất khi merge** — mất dữ liệu người dùng  
2. **Orphan cướp active cue** — hardsub/highlight sai khi đang xem  
3. **Timer 250ms luôn bật** — CPU liên tục trên mọi tab YouTube  
4. **Drive `setTimeout` drop (MV3)** — sync PC↔iPad im lặng fail  
5. **Tokenize batch không giới hạn / chồng request** — spike CPU bridge lúc load video dài  

---

**Kết luận ngắn:** Stack Desktop ổn sau B1–B9, nhưng còn vài bug đúng (EN-only merge, orphan playhead, Drive debounce MV3) và vài vòng polling 250ms / tokenize / Drive full-library đang đốt máy không cần thiết. Báo cáo chỉ — chưa sửa code.

Muốn mình lên ticket/plan fix theo thứ tự trên (vẫn chưa đụng code) thì nói.
