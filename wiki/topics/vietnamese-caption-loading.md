# Topic: VI caption load fixes + Netflix parallel fetch

**Status:** shipped (code done 2026-08-21, chờ test thật trên Netflix/YouTube)
**Plan:** [plan/vietnamese-caption-fixes-2026-08-21.md](../plan/vietnamese-caption-fixes-2026-08-21.md)
**Code anchors:**

- `extension/background/service_worker.js` → `matchLangFamily()`, `LANG_FAMILY_ALIASES`,
  `fetchBestLangPack()`, `handleYtLoadCaptions()` (`hasEn`/`hasVi`)
- `extension/injected/page_capture.js` → `matchLangFamily()`, `pickBestTrackByPrefix()`,
  `scoreTrack()`, `noteNetflixTimedtext()`, `fetchNetflixCaptions()` (parallel direct
  fetch + `withTimeout(2s)` + switcher bound 800ms + restore JA)
- `extension/content/content.js` → `logYtSecondaryMiss()` (thêm `via`/`reason`/`trackCount`)
- `scripts/lang_family_sanity.js` — sanity 20 case × 2 file, PASS

## What shipped

1. **Lang matching mở rộng**: `matchLangFamily(lang, family)` normalize
   lowercase + `_`→`-`, base code trước region (`vi-vn`→`vi`), alias 3-letter
   (`vie`/`eng`/`jpn`) — thay thế `startsWith("vi")` hẹp ở SW + page_capture.
2. **Netflix VI detection**: `bcp47` lowercase trước khi so (case-insensitive), regex
   displayName mở rộng `vietnamese|tiếng việt|tieng viet|vi\b`.
3. **Netflix fetch song song**: 3 direct fetches chạy `Promise.all`; mỗi fetch
   bọc `withTimeout(2s)` (trước đây không timeout → treo vô hạn); track switcher
   giữ tuần tự (player giữ 1 track) bound 800ms/lang + luôn trả về JA.

## Root cause nhớ

- `startsWith("vi")` vẫn match `vi-VN`/`vie` (prefix) — vấn đề thật là:
  `bcp47` Netflix so case-sensitive, regex displayName quá hẹp, fetch direct không
  timeout, và track switcher tuần tự + thứ tự phục hồi JA.
- Không đổi schema cue, không đổi UI, không thêm dep.

## Open / verify

- [ ] Test thật Netflix phim có track VI → `viCues.length > 0`, thời gian load 3 lang ≈ max single.
- [ ] Test YouTube video có track `vi-VN`/`vie` (nếu có) → `vi` điền vào cue.

## Cross-links

- Liên quan: `wiki/topics/netflix-support.md` (shipped 2026-08-19) — nơi track
  switcher + DFXP được thêm lần đầu.
- Không mâu thuẫn với topic nào hiện hành.