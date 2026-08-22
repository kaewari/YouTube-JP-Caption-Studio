<!-- date: 2026-08-08 -->
<!-- source: chat:user-ask · user: Tối ưu tốc độ load sub + furigana/level vocab về ~100ms (plan only) -->

# Plan: Load sub nhanh + Furigana/Level vocab ≤ 100ms

## Mục tiêu

1. **Load sub**: rút ngắn chuỗi tuần tự khi mở video (SW pack → merge cache → render đầu tiên).
2. **Furigana + level vocab**: từ lúc cues đầu tiên có mặt đến khi side panel paint đủ
   `ruby <rt>` + JLPT color ≤ **~100 ms** (mục tiêu đo được, không phải con số tham vọng).

Không đổi schema bridge, không bỏ Sudachi, không thêm dependency.

## Baseline (đo trên máy này 2026-08-08, bridge warm)

| Hạng mục | Hiện tại | Ghi chú |
|---|---|---|
| Sudachi `tokenize` 1 cue | **0.1 ms/cue** (60 cues = 3.4 ms) | KHÔNG phải bottleneck |
| `load_freq` (freq_ja.json 237 KB) | 13 ms | warm |
| `Dictionary().create(SplitMode.B)` | 14 ms | warm |
| `/health` latency_p50 | bridge chưa đo lại | sau fix M4 |

→ Tokenize phía Python đã < 100 ms với hàng trăm cue. Bottleneck thật nằm ở
**chuỗi RTT tuần tự + render DOM 2 phase**, không ở Sudachi.

## Root causes (verified trên disk)

### A. Load sub — chuỗi tuần tự trước render đầu tiên
- `content.js:2512-2517` — `await waitForPageBridge(2500)` chạy **trước** khi dùng
  SW pack dù `swPromise` đã song song chạy từ đầu; bridge chậm ⇒ sub trễ 2.5 s
  dù SW có sẵn. Nên race: render SW ngay khi `swUsable`, bridge-wait chỉ là fallback.
- `content.js:411-413` — `loadCachedCues` + `loadTranscriptMeta` là 2
  `chrome.storage.local.get` **tuần tự**; có thể `Promise.all`.
- `content.js:406` — skipCache path `saveTranscript({force, awaitDisk: true})` chặn
  flow tới `enrichTokensAfterImport` cho tới khi disk save xong.
- `content.js:2559-2563` — race 700 ms poll `GET_TIMEDTEXT_LINK` lặp `sleep(120)`
  ngay cả khi SW đã `swUsable` (break sớm chỉ khi `swOk`).

### B. Furigana/level — render 2 phase + thêm RTT hydrate
- `content.js:438` — `enrichTokensAfterImport()` chạy **sau** `applyLoadedCues`
  đã publish panel (render JA trần), rồi `content.js:3198-3205` publish lại lần 2
  khi tokens về → 2 lần rebuild DOM, furigana muộn.
- `content.js:1079-1096` — `hydrateTokens` thêm **1 RTT riêng**
  `GET /scripts/{id}/tokens` ngay sau load cues; không cache tokens trong
  `chrome.storage` nên mỗi reload lại fetch lại.
- `sidepanel.js:1068-1110` — `renderList` **rebuild toàn bộ DOM** (clear +
  createElement từng row + attach listener từng row) mỗi lần publish; với
  200+ cues × nhiều publish (status, en/vi fill, activeCue…) cost rất lớn.

### C. Đo lường thiếu
- Không có hook timestamp "cues → furigana painted" để verify mục tiêu 100 ms.

## Todos

### T1. Load sub: race SW vs bridge-wait (High)
- `content.js` `loadAllCaptions`: `Promise.race([swPromise → usable, waitForPageBridge])`;
  render SW cues ngay khi `swUsable` mà **không** đợi bridge timeout; bridge-wait
  chỉ chặn nhánh page-intercept.
- `Promise.all` cho cache + meta (`content.js:411-413`).
- skipCache path: bỏ `awaitDisk` khi `!owned` (`content.js:406`).

### T2. Tokens về cùng render đầu tiên — một phase (High)
- Chạy `enrichTokensAfterImport` **song song với load cues** khi JA source đã có
  (intercept ja-win / SW early), và **chờ nó** trước publish đầu tiên
  (`applyLoadedCues`) — thay vì publish 2 lần.
- Fallback giữ nguyên: bridge offline ⇒ render JA trần như hôm nay.

### T3. Cache tokens trong chrome.storage (High)
- Khi `enrichTokensAfterImport` ghi tokens (`content.js:3189`), lưu kèm vào
  `transcript:` key (slim — chỉ `{cueId: tokens}` map riêng `tokens:` + meta).
- `hydrateTokens` đọc cache trước, bridge chỉ là refresh khi miss → bỏ RTT thường trực.

### T4. Sidepanel: incremental render (Medium)
- `renderList` giữ row cũ, chỉ tạo mới row chưa có / patch row thay đổi
  (tokens về ⇒ patch riêng row đó bằng `rubyHtml`). Bỏ attach-listener toàn bộ:
  dùng event delegation cho `.sp-play/.sp-del/.sp-copy…` (hiện add từng nút, `sidepanel.js:1112-1139`).
- Publish sau enrich chỉ đánh dấu rows có tokens thay đổi, không `forceList` toàn bộ
  (`content.js:3204`).

### T5. Perf hook + gate (Low)
- Content script: `performance.now()` từ lúc `applyLoadedCues` → callback
  `onFuriganaPainted` (lần render đầu có `ruby`); log `/log` khi > 150 ms.
- Bridge: `latency_p50` đã có trong `/health` — đo `tokenize_batch` p50/p95.
- Regression: chạy `skills/tokenize-regression` sau mỗi đổi tokenize (giữ đúng kết quả).

## Non-goals
- Không gộp tokens vào `cues.json`/đổi API bridge (schema giữ nguyên).
- Không thay Sudachi / không caching level ở client cho **từ token** (map JLPT
  đã nằm trong token response).
- Không virtualize toàn bộ list (incremental patch là đủ trước khi cần).
- Không chạm overlay hardsub (scope = side panel load).

## Verify
1. Manual: mở video JA bất kỳ — furigana + color xuất hiện cùng lần render đầu,
   status line không nhấp nháy 2 phase; reload giữ tokens (không thấy spin furigana).
2. Đo: performance mark "furigana painted ≤ ~100 ms" với 200-cue script
   (testdata/import sample); log > 150 ms = fail.
3. `skills/tokenize-regression` xanh (tokens giữ nguyên).
4. Bridge smoke: `python -m tests.test_script_store` + pytest pass.
5. Không regress: Enter JA vẫn re-tokenize cue đó (`content.js:2799`).

## Risks
- Race `enrichTokensAfterImport` song song với load: cần giữ snap-gen guard
  (`content.js:3127-3138`) — đã có sẵn, plan giữ nguyên.
- Cache tokens trong chrome.storage có thể phình dung lượng với video rất dài;
  giới hạn lưu tokens map (không lưu kèm mỗi cue object).
