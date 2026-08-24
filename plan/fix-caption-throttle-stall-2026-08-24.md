<!-- date: 2026-08-24 -->
<!-- source: chat:goal · user: extension không load sub lên sidepanel + không hiện overlay; kiểm tra cả mobile -->

# Fix: caption throttle → sidepanel trống + overlay trống

## 1. Nguyên nhân (đã verify live)
1. **Burst request bị YouTube throttle.** `fetchTimedtextBody` thử tối đa 4 biến thể URL × 2 credentials = 8 request/URL, ×3 lang pack chạy song song = **≤24 timedtext request mỗi lần load**. YouTube trả 502 HTML rồi 429 cho cả signed lẫn legacy URL (test live: `oqPcaOYwZ_4` ja track → 502; sau đó mọi URL → 429 kéo dài >5 phút).
2. **Không có backoff/cache** ở SW hay bridge — mỗi navigate/Reload lặp lại burst, giữ trạng thái bị chặn.
3. **Stall ~25s khi toàn tầng fail**: race page-bridge 2.5s → GET_TIMEDTEXT_LINK → vòng 700ms → FETCH_MULTI_LANG 5s → LOAD_CAPTIONS 8s → rescue → bridge tier (bridge tự dính 502, `_http` retry 3×30s) → empty. Sidepanel hiện "loading" rất lâu rồi mới báo lỗi → người dùng thấy "không load sub".
4. **Overlay**: mặc định OFF mỗi video mới + chỉ vẽ khi có cues → cues rỗng ⇒ overlay trống là hệ quả của #1–#3.
5. **Bridge `_http` retry cả response 4xx/5xx HTML**: `urlopen` trả 200 cho trang lỗi YouTube? Không — YouTube trả 502 kèm body HTML qua HTTP 200 trong một số dạng (`empty_or_html`) hoặc 502 thật; retry 3 lần làm tier-2 chậm thêm ~90s.

## 2. Fix (shortest diff)
### service_worker.js
- **Giảm fan-out**: `fetchBestLangPack` chỉ fetch pack ngôn ngữ *cần* (ja luôn; en/vi chỉ khi candidate tồn tại — đã vậy). Thử **1 credential theo kết quả trước** (omit trước; include chỉ khi omit ra empty và candidate có `via=watch_html`). Bỏ variant "stripped" (hiếm khi dùng).
- **Cache negative 60s trong SW** (`chrome.storage.session`): videoId vừa `timedtext_empty` → trả ngay cached result cho các lần gọi tiếp theo trong 60s, tránh lặp burst.
- **Dừng sớm khi gặp 429/502**: `lastError.reason = http_429_*` → abort các pack còn lại (throttle là per-IP, thử tiếp vô ích).

### local-bridge/app/api/captions.py
- `_http`: **không retry** khi HTTP status >= 400 (raise ngay); giảm timeout 30→10s.
- **LRU cache 10 phút** cho cues thành công (key `video_id|lang`) — tái dùng `core/cache.LRUCache`.
- Phản hồi 502 kèm JSON `ok:false` đã có sẵn.

### content.js
- Bridge tier timeout: bọc `Promise.race` 12s quanh `fetchCaptionsFromBridge` để không treo sau SW.

## 3. Mobile
- iPhone/iPad `CaptionService`: tuần tự, 1 UA riêng, không burst — **không sửa**. Parser parity OK (`SubtitleParser` identical). Chỉ xác nhận flow: owned script ưu tiên trước YT fetch — đúng.

## 4. Verify
- Node smoke: parser + pipeline (đã pass).
- Live e2e sau cooldown: bridge `/captions/oqPcaOYwZ_4` → 147 cues (đã pass trước burst).
- SW: node --check + đếm max request/load ≤ 12.
