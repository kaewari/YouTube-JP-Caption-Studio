<!-- date: 2026-08-21 -->
<!-- source: chat:c0365efc · user: VI captions not loading when available + parallelize Netflix fetch -->

# Kế hoạch: Fix VI caption load (YouTube + Netflix) & parallelize Netflix fetch

## 1. Vấn đề

1. **VI captions không load dù nguồn có track** (cả YouTube lẫn Netflix).
2. **Netflix load JA→EN→VI tuần tự** → chậm (mỗi lang đợi lang trước xong).

## 2. Nguyên nhân (đã verify trên source)

### 2.1. Lang code matching quá hẹp
- `extension/background/service_worker.js` `fetchBestLangPack()` + tính `hasEn`/`hasVi`: dùng `String(lang).toLowerCase().startsWith("vi")`.
- `extension/injected/page_capture.js` `pickBestTrackByPrefix()`: cùng kiểu `startsWith`.
- YouTube/Netflix trả `languageCode`/`bcp47` dạng `vi`, `vi-VN`, `vie`, `vi`… — `startsWith` bỏ sót `vie`/biến thể tách `_`, và **case-sensitive trên `bcp47`** (Netflix detection dùng `t.bcp47?.startsWith("vi")` không lowercase → fail nếu `VI`/`Vi-VN`).

### 2.2. Netflix VI detection chỉ dựa displayName regex
- `page_capture.js:1247-1250`: `/vietnamese|tiếng việt/i` — miss khi `displayName` là `"Tiếng Việt (vi)"`, `"Vietnamese (auto)"`, `"vi (original)"`… và không hạ `bcp47` trước khi so.

### 2.3. Netflix fetch tuần tự
- `fetchNetflixCaptions()`: `tryFetchTrackDirect` JA → EN → VI tuần tự, rồi track switcher EN → VI → JA cũng tuần tự.
- `tryFetchTrackDirect` không có timeout trên `fetch()` → 1 lang treo chặn cả chuỗi.

## 3. Giải pháp

### Phase 1 — Fix VI load

1. **Helper lang-matching chung** (mỗi file 1 hàm nhỏ, không thêm dep):
   - Normalize: lowercase, thay `_`→`-`, tách region `vi-vn`→`vi`.
   - Match family: base === family, hoặc base.startsWith(family + "-"), hoặc alias 3-letter (`vie`→`vi`, `eng`→`en`, `jpn`→`ja`), hoặc exact alias.
   - `service_worker.js`: dùng trong `fetchBestLangPack` + tính `hasEn`/`hasVi` + `scoreTrack`.
   - `page_capture.js`: dùng trong `pickBestTrackByPrefix` + `scoreTrack` + `noteNetflixTimedtext` classification.

2. **Netflix track detection** (`page_capture.js`):
   - Hạ `bcp47` với `String(t.bcp47||"").toLowerCase()` trước khi so (case-insensitive).
   - Mở rộng regex displayName: `vietnamese|tiếng việt|tieng viet|vi\b` (i) — bắt `"Vietnamese (auto)"`, `"vi (original)"`…

3. **Debug log VI-specific** (`content.js` `logYtSecondaryMiss`):
   - Thêm `via`/`reason`/`trackCount` của SW vào message miss để biết path nào fail.

### Phase 2 — Parallelize Netflix

1. **Direct URL fetch chạy song song**: `Promise.all([tryFetchTrackDirect(ja,"ja"), tryFetchTrackDirect(en,"en"), tryFetchTrackDirect(vi,"vi")])`.
2. **Timeout direct fetch 2s**: bọc `fetch()` trong `withTimeout(p, 2000)` → 1 lang treo không chặn các lang khác (trước đây fetch không timeout → treo vô hạn).
3. **Track switcher**: giữ tuần tự (vì `setTimedTextTrack` chỉ giữ 1 track active — parallel sẽ mất lang trước), giữ bound cũ 800ms/lang (8×100ms), và **luôn trả player về JA** sau probe VI (giữ hành vi cũ).

## ✅ Đã implement (2026-08-21)

- [x] `service_worker.js`: `matchLangFamily` + `LANG_FAMILY_ALIASES`; dùng trong `fetchBestLangPack`, `hasEn/hasVi`, `scoreTrack`.
- [x] `page_capture.js`: `matchLangFamily` + `LANG_FAMILY_ALIASES`; `pickBestTrackByPrefix` + `scoreTrack` dùng helper; Netflix detection lowercase bcp47 + regex mở rộng; `noteNetflixTimedtext` dùng helper; `tryFetchTrackDirect` parallel (`Promise.all`) + `withTimeout(fetch, 2000)`; switcher bound 800ms + restore JA force.
- [x] `content.js`: `logYtSecondaryMiss` thêm `via`/`reason`/`trackCount`.
- [x] `scripts/lang_family_sanity.js`: assert helper 2 file (20 case/file) — PASS.
- [ ] Test thật trên Netflix (phim có track VI) + YouTube (video có `vi-VN`/`vie` nếu có).

## 4. Files

| File | Change |
|------|--------|
| `extension/background/service_worker.js` | Helper `matchLangFamily()` + dùng trong `fetchBestLangPack`, `hasEn/hasVi` |
| `extension/injected/page_capture.js` | Helper `matchLangFamily()` + `pickBestTrackByPrefix`/`scoreTrack`/`noteNetflixTimedtext`; Netflix detection lowercase bcp47 + regex mở rộng; `tryFetchTrackDirect` parallel + timeout; switcher bound + restore JA |
| `extension/content/content.js` | `logYtSecondaryMiss` thêm `via`/`reason` |

## 5. Kiểm tra

1. Node sanity nhỏ: `matchLangFamily` cho các biến thể (`vi`, `vi-VN`, `vie`, `VI`, `vi_vn`, `eng`) — assert đúng family.
2. Load thật trên Netflix phim có track VI: kiểm tra `viCues.length > 0` và thời gian load 3 lang ≈ max single (không cộng dồn).
3. Load thật trên YouTube video có track `vi-VN`/`vie` (nếu có): `viCues` điền vào cue.

## Out of scope

- MT / auto-generate VI khi nguồn không có track.
- Đổi `sourceLang` UI hay VI làm timeline chính.