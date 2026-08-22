<!-- date: 2026-08-21 -->
<!-- source: chat:c5fa6d96-7795-40a1-be50-ddf5588d523d · user: fix subtitles not loading at all on any platform -->

# Review: Fix Subtitles Not Loading At All

## Kết quả
Đã sửa toàn bộ 4 nguyên nhân gây nghẽn:
1. `applyLoadedCues`, `tryApplySavedScript`, `onNavigate` đã gọi `publishSidePanelState({ forceList: true })` và `renderList(true)` đầy đủ.
2. Đã khai báo và cập nhật `pageBridgeReady = true`.
3. Tăng version lên `API_VER = 5` để tự động nâng cấp injection script.
4. `sidepanel.js` query tab chuẩn xác với `lastFocusedWindow` và tiếp nhận state an toàn.
