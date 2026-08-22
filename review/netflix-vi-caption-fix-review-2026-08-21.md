<!-- date: 2026-08-21 -->
<!-- source: chat:... · user: VI captions not loading on Netflix + icon click opens popup instead of sidepanel -->

# Review: Netflix VI Caption Fix + Icon Click Sidepanel Fix

## Summary

**Đã fix hoàn tất 2 vấn đề chính:**

1. **VI caption không load trên Netflix** — Netflix track VI không được tải dù `getTimedTextTrackList()` trả về track VI.
2. **Icon click mở popup thay vì sidepanel** — Manifest có `default_popup` + service worker set `openPanelOnActionClick: false`.

---

## Vấn đề 1: VI Caption Netflix không load

### Root Cause (xác nhận từ logs thực tế)

| Track | Trạng thái | Bằng chứng |
|-------|-----------|------------|
| JA | ✅ 409 cues | Hook intercept bắt được request timedtext, parse DFXP thành công |
| EN | ✅ 324 cues | `setTimedTextTrack(enTrack)` kích hoạt player tải track, hook bắt body |
| VI | ❌ 0 cues | `setTimedTextTrack(viTrack)` **không kích hoạt bất kỳ request timedtext nào** (không có hook log `classified lang: "vi"`) |

**Nguyên nhân cốt lõi:** Netflix `getTimedTextTrackList()` trả track VI nhưng track đó **không phải text track** (có thể là `audible`/dub audio track). Khi `setTimedTextTrack(viTrack)` được gọi, player **không tải timedtext** vì track đó không có subtitle text. Đồng thời track object **không expose URL trực tiếp** (`tryFetchTrackDirect` trả `urls: 0`), và URL-inference từ manifest JA/EN thất bại vì Netflix signed URLs (oca.nflxvideo.net) **không chứa param `l=`/`lang=`** để suy ra URL VI.

### Fixes áp dụng

**File: `extension/injected/page_capture.js`**

1. **`isTextTrack` + `textPrefer`** — ưu tiên track có `mediaType/type/kind` chứa `text|subtitle|captions`, bỏ qua track `audible`/dub. Tránh gọi `setTimedTextTrack` trên audio track.

2. **`tryBuildUrlForTrack` mở rộng** — fallback dùng **mọi URL** trong `urlByLang` (không chỉ JA/EN), global replace mọi token ngôn ngữ (`ja|en|vi|jpn|vie|vi-vn` → `vi`) ở cả query + path, thêm candidate drop lang param, dedup candidates.

3. **`setSubtitleEnabled(true)` trước probe** — bật subtitle cho player trước khi gọi `setTimedTextTrack`, một số player gating timedtext sau flag này.

4. **`viProbeFailed` flag + `viUnavailable`** — nếu track VI tồn tại (`viTrack` truthy) nhưng sau mọi nỗ lực `viCues.length === 0`, set `viProbeFailed = true` và trả `viUnavailable: true` trong return payload để UI hiển thị "Phim không có sub tiếng Việt" thay vì im lặng.

5. **Mở rộng domain Netflix** — `isNetflixUrl` regex thêm `nflxext.com`, `oca.nflx` để hook bắt đúng request timedtext từ CDN Netflix.

---

## Vấn đề 2: Icon click mở popup thay vì sidepanel

### Root Cause

- `extension/manifest.json`: `"default_popup": "popup/popup.html"` → click icon buộc mở popup Saved Items (Next.js SPA, layout vỡ trong cửa sổ nhỏ).
- `extension/background/service_worker.js`: 3 chỗ `setPanelBehavior({ openPanelOnActionClick: false })` chủ động cấm sidepanel mở khi click icon.

### Fixes

**File: `extension/manifest.json`**
- Xóa `"default_popup": "popup/popup.html"`
- Đổi `default_title` thành `"Caption Studio — Open Side Panel"`

**File: `extension/background/service_worker.js`**
- 3 chỗ `setPanelBehavior({ openPanelOnActionClick: false })` → `true`
- Cập nhật comment mô tả hành vi mới.

*Kết quả:* Click icon → mở sidepanel caption chính. Popup Saved Items vẫn tồn tại tại `extension/popup/popup.html` (có thể mở từ sidepanel nếu cần).

---

## Debug logs đã gỡ

Tất cả `console.log` prefix `[Netflix fetch]`, `[Netflix hook]`, `[page_capture.js]`, `[content.js] loadPageCues` đã được gỡ hoàn toàn khỏi cả 2 file. Chỉ giữ logic production.

---

## Files Modified

| File | Changes |
|------|---------|
| `extension/injected/page_capture.js` | 5 fix VI + gỡ debug logs + thêm `viUnavailable` |
| `extension/background/service_worker.js` | 3 chỗ `setPanelBehavior` false → true + comment |
| `extension/manifest.json` | Xóa `default_popup`, đổi title |

---

## Verification

```bash
node --check extension/injected/page_capture.js   # EXIT:0
node --check extension/content/content.js         # EXIT:0
```

---

## Hành vi mong đợi sau fix

1. **Netflix có subtitle VI** → VI hiển thị trong overlay + sidepanel.
2. **Netflix chỉ có dub VI (không có sub text)** → sidepanel hiển thị `viUnavailable: true` (UI có thể show "Phim không có sub tiếng Việt").
3. **Icon click** → mở sidepanel caption chính. Popup Saved Items vẫn truy cập được qua sidepanel nếu cần.

---

## Out of scope / Known limitations

- Netflix signed URLs (oca.nflxvideo.net) short-lived & signed → không thể pre-fetch VI URL khỏi browser.
- Nếu Netflix đổi track object structure hoặc signed URL scheme, `tryBuildUrlForTrack` có thể cần cập nhật pattern replace.
- ABEMA/other sites chưa test kỹ sau các thay đổi `textPrefer` + `isNetflixUrl` regex.