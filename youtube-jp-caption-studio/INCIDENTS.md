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

## 2026-08-04 — Fullscreen: bấm zoom → app đơ, không thao tác được (iPad)

1. **Nút Toàn màn hình bị chặn / đơ toàn app**  
   Cause: rework (copilot/dev) thay app-maximize đã verify bằng `webkitEnterFullscreen()` (gọi từ `evaluateJavaScript`, không phải user gesture) + overlay window level 3000 (`FullscreenOverlay.swift` / `FullscreenPlayerControls.swift`) — native player phủ window, hitTest pass-through chỉ nhả `self`/`rootViewController.view` → end-fullscreen không về → Swift kẹt `isPlayerFullscreen`, topBar ẩn, mọi touch bị chặn.  
   Fix: restore đúng path B10 đã verify (claude/dev): app maximize only — `__csToggleFull` → `forceAppFullscreen` + `killOsFullscreen` safety net, intercept `.ytp-fullscreen-button`, `isElementFullscreenEnabled = false`; xoá 2 file overlay + pbxproj refs. Verify autotest iPad thật: enter (t=12s) video chiếm pane, không lớp OS FS; exit (t=19s) topBar + side panel restore ✓.

2. **In-page fill: bấm zoom → mất hình (video không render), kẹt full**  
   Cause: thử nghiệm fill `#movie_player { position:fixed; 100vw×100vh }` + `video { width:100%; height:100% }` — `.html5-video-container` có **height 0** (bản YT này size video bằng inline px, container chain không có box height) → `height:100%` trên video collapse về 0 → video rect `[0,0,W,0]`, black screen; người dùng bấm zoom thấy mất hình, tưởng app đơ (smoke live: `fixed=YES / Player 100%`).  
   Fix: ghim video thẳng viewport, không qua container: `video { position:fixed; top:0; left:0; width:100vw; height:100vh; object-fit:contain }` (16:9 letterbox). Thêm instrument: `postLayout()` ngay trong `forceAppFullscreen` (sau `applyInPageFullscreen(true)`) và nhánh exit của `__csToggleFull` (sau `applyInPageFullscreen(false)`); `onLayoutCheck` ghi payload đầy đủ ra `layout_smoke.json`; `saveAutotestShot` copy `smoke-%02d.json` mỗi shot. Verify autotest iPad thật: tại toggle (t≈8s) video đã `[0,0,1376,980]` full (bản cũ: `[0,0,1376,0]`), pixels phủ màn hình (bottom-center = letterbox đen, không phải app bg), exit (t=16s) restore normal ✓.
