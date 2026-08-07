<!-- date: 2026-08-08 -->

# Plan: Sub load nhanh + Furigana/Level ≤ 100ms

## Status

**Filed — chưa làm.** Plan-only; không sửa code trong phiên này.

## Raw plan

- [plan/sub-load-furigana-100ms-2026-08-08.md](../../plan/sub-load-furigana-100ms-2026-08-08.md)

## Tóm tắt

Baseline đo được: Sudachi tokenize **0.1 ms/cue** (60 cues = 3.4 ms), load_freq
13 ms — bottleneck KHÔNG ở Python. Thực bottleneck:

- `loadAllCaptions` chờ `waitForPageBridge(2500)` trước khi dùng SW pack dù SW
  đã sẵn (content.js:2512).
- 2 chrome.storage.get tuần tự (cache + meta) (content.js:411).
- Furigana render **2 phase**: publish JA trần → `enrichTokensAfterImport` xong
  publish lại (content.js:438 + 3198); `hydrateTokens` thêm 1 RTT
  `GET /tokens` mỗi reload (content.js:1079), không cache chrome.storage.
- Sidepanel `renderList` rebuild toàn bộ DOM + attach listener từng row
  (sidepanel.js:1068-1139).

## Todos (T1–T5)

1. Race SW pack vs bridge-wait; `Promise.all` cache+meta; bỏ `awaitDisk` khi
   không owned.
2. Enrich tokens song song với load cues, chờ trước publish đầu tiên — một phase.
3. Cache tokens trong chrome.storage; hydrate đọc cache trước.
4. Sidepanel incremental render + event delegation.
5. Perf hook (`onFuriganaPainted` ≤ ~100 ms, log >150 ms) + tokenize regression.

## Non-goals

Không đổi schema bridge/tokens, không thay Sudachi, không virtualize list,
không chạm overlay.
