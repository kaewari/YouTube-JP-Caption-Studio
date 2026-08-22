<!-- date: 2026-08-21 -->
<!-- source: chat:c5fa6d96-7795-40a1-be50-ddf5588d523d · user: fix subtitles not loading at all on any platform -->

# Kế Hoạch Sửa Lỗi Không Load Được Sub (Tất Cả Nền Tảng)

## Nguyên nhân
1. `publishSidePanelState({ forceList: true })` và `renderList(true)` bị thiếu trong `applyLoadedCues` và `tryApplySavedScript`.
2. `pageBridgeReady` không được khai báo và cập nhật.
3. `API_VER` (4) bị chặn bởi window guard cũ chưa được cập nhật lên version 5.
4. Lọc tab trong `sidepanel.js` bị mismatch khi query `currentWindow: true` từ sidepanel context.

## Khắc phục
1. Bổ sung `publishSidePanelState({ forceList: true })` và `renderList(true)` ngay khi nạp xong cues.
2. Khai báo `pageBridgeReady` và gán true khi PING thành công.
3. Tăng `PAGE_API_VER = 5` & `API_VER = 5`.
4. Cải tiến query tab trong `sidepanel.js` với `lastFocusedWindow`.
