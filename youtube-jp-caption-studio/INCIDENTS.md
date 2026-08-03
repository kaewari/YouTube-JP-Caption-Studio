# Incidents / lỗi đã gặp

Nhật ký ngắn (không phải transcript). Runtime bridge: `local-bridge/errors.log`.

## 2026-08-02 — Drive sync / iPad

1. **Side panel hiện YouTube thay script đã lưu sau Upload Drive**  
   Cause: `owned` chỉ trong chrome.storage; `DRIVE_RESTORED` wipe; snapshot lossy (thiếu owned/tokens).  
   Fix: owned/rev từ disk `meta.json`; mirror folder (`cues`/`meta`/`script.txt`); tokens local-only.

2. **Drive File Provider: Open/Mở folder xám, không chọn được folder**  
   Cause: iOS Files không cho Open trên folder Drive Provider.  
   Fix: tạm pick file rồi walk-up; sau đó thay bằng Drive REST API + OAuth Connect (Thư mục = Connect).

3. **OAuth 400 `invalid_request` trên iPad**  
   Cause: dùng `client_id` Chrome extension trên iOS.  
   Fix: OAuth client kiểu **iOS** + PKCE (`ASWebAuthenticationSession`); config `DriveOAuthConfig.swift`.

4. **Connect OK nhưng panel trống / “đã đồng bộ” với 0 cues**  
   Cause: rev gate bỏ qua pull khi local rỗng; silent false.  
   Fix: force pull khi local cues empty; status rõ found/missing/error.

5. **Status cue count > 0 nhưng side panel trống**  
   Cause: `ScriptCue.load` qua optional relationship miss inserts; `script.cues` trống sau import.  
   Fix: gán cues import trực tiếp vào UI; pull panel từ `script.txt`.

6. **Bridge down / stale PID (connection refused :8765)**  
   Cause: debug restart để PID/port cũ; extension gọi bridge chết.  
   Fix: restart sạch `./start.sh`; kiểm tra `.bridge.pid` / `/health`.

7. **Local meta `MOIbaNe4Pmw` thiếu rev/owned so với sibling**  
   Cause: meta chưa migrate / save cũ không ghi owned+rev.  
   Fix: script_store luôn persist `owned` + Lamport `rev`; library index đọc từ meta.

## 2026-08-02 — Panel load sai file (3 nền tảng)

8. **Extension / iPad / iPhone đều hiện `あ`/`vi0` cho `MOIbaNe4Pmw` dù `script.txt` đúng**  
   Cause: cả ba nạp panel từ `cues.json` rác; bridge `load_script` bỏ qua TXT; `read_files` còn render-đè TXT từ cues.  
   Fix: bridge ưu tiên parse `script.txt` → sync `cues.json` + bump rev; `read_files` giữ TXT có sẵn; `save_script` ghi cả TXT; iPad/iPhone Drive pull TXT trước.

## 2026-08-02 — Caption / tokens / timeline (session)

9. **Overlay OFF đóng side panel** — Fixed: OFF không gọi `closeSidePanel`.  
10. **Side panel không mở** — Fixed: SW SyntaxError JSDoc `en*/vi*`.  
11. **Prefer-TXT làm mất furigana/JLPT/popup (PC)** — Fixed: migrate inline tokens → `tokens.json`; hydrate + re-tokenize.  
12. **Timeline follow lệch iPad** — Fixed: pin ~24px, coalesce, gap-hold, ĐANG PHÁT.  
13. **Fixed — VI/EN trống / phải bật từng CC** — page `FETCH_MULTI_LANG` từ `captionTracks` baseUrl (cookie); không setOption từng lang; SW empty pack → bắt buộc page fetch.  
14. **Fixed — Panel load chậm** — SW kick ‖ bridge; JA paint sớm; EN/VI async; parallel web+Android; cookies once; prefer json3; `//`→`https:`.  
15. **Fixed — Furigana/JLPT không auto trên mọi video** — bỏ gate `owned`; luôn `enrichTokensAfterImport` sau JA; retry khi bridge ready.

Ledger ngắn trong walkthrough §3.7 (B1–B10).

## 2026-08-03 — Fullscreen ẩn overlay (iPad + iPhone)

16. **Full pill → OS native video FS, overlay (HardsubOverlayView) bị che hoàn toàn**  
   Cause: `__csToggleFull` gọi `video.webkitEnterFullscreen()` trước — lớp system player phủ cả window, SwiftUI overlay (cùng window, nằm dưới lớp đó) không hiện dù `hardsubOverlayOn = ON`.  
   Fix: fullscreen **chỉ app maximize** — bỏ `webkitEnterFullscreen`; pill + intercept YT FS button → `__csAppFull` trực tiếp; safety net `webkitbeginfullscreen`/`fullscreenchange` ép OS FS về app maximize (`webkitExitFullscreen`/`exitFullscreen`); `isElementFullscreenEnabled = false` (ipad-app + iphone-app).
   Verified 2026-08-03 trên iPad thật (iPad Pro 13" M5, hot fix, autotest harness `-CS_AUTOTEST_*` launch args → window PNGs):
   - t=5s (overlay ON, chưa full): overlay hiện trên video ✓
   - t=12s (sau toggle full lúc 8s): topBar ẩn, video chiếm hết pane, **overlay vẫn hiện** — không có lớp system player ✓
   - t=19s (sau thoát lúc 16s): topBar khôi phục ✓
   - A/B overlay OFF ở t=12s: không có chữ → text thấy được là overlay của app, không phải CC của YouTube ✓
   Bằng chứng: `.tmp-fullscreen-verify/run3/` + `run4/` (autotest-01..03.png + crops).
