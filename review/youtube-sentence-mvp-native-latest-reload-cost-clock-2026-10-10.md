<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Chrome đang sẵn sàng thêm 2 phút -->
# Native latest extension reload and clock/cost export

STATUS: NOT VERIFIED for the full MVP. The bounded native package reload, visible TXT warning, and downloaded measurement artifact are VERIFIED. Independent reviewer unavailable; release/gold-set criteria remain open.

## Requirements

| Criterion | Expected | Actual | Evidence |
|---|---|---|---|
| Current extension package | Enabled installed extension reloads from the intended source containing current worktree bytes | Chrome profile Katou showed YouTube JP Caption Studio 0.11.2, enabled, loaded from `~/Projects/YouTube JP Caption Studio/extension`; pressing its Reload produced `Reloaded`. Eight relevant files matched the current worktree byte-for-byte | Native Chrome accessibility state plus exact SHA-256 comparison below |
| TXT loss warning | Visible warning explains metadata not preserved by TXT and points to JSON backup | Sidepanel displayed: `TXT không giữ khóa, dữ liệu Enhanced hay câu đã lưu. Dùng Sao lưu JSON để khôi phục đầy đủ.` | Native sidepanel accessibility state and screenshot emitted in this chat's CUA result; screenshot was not saved as a file |
| Measurement export | Download is complete and parses as current observed trace | Chrome reported `yt-caption-ylnxFdPhLCo-cost-clock-followup-2026-10-10.json 76.8 KB • Done`; local file is 78,624 bytes and valid JSON | Download UI plus Python JSON/hash/arithmetic assertions |
| Clock/readiness | Record observed values and distinguish absent measurements | Track-load 3,978 ms; 1 cold + 11 warm Original-JA onsets sampled ready; no JP paint/TTFV; one seek discontinuity | Exported JSON; `group_prepared=340` is event count, not 340 independent sentence-quality samples |
| Gemini cost/billing | Only report cost with actual request usage and billing evidence | `requestCount=0`; P50/P95 null; `apiCost=null`; estimate amount null, 0 priced attempts, status `NOT VERIFIED` | Exported JSON; no Gemini call was made |
| Full release criteria | Five-video gold set, semantic quality, readiness targets, persistence matrix, reversibility and user-data safety pass | NOT VERIFIED / still open | See active topic and original plan |

## Native session

The Chrome extension details page showed ID `oiocgalcdfmkbcikemohekbjjmlbpoll`, version `0.11.2`, enabled, and source `~/Projects/YouTube JP Caption Studio/extension`. The explicit Reload button returned the visible status `Reloaded`. The opened YouTube sidepanel showed the current TXT warning and `Xuất số đo`. No Gemini key was read or sent and no Drive action was taken. The sidepanel also displayed its existing Google OAuth Client ID / extension ID mismatch; Drive sync was not tested.

The Chrome user returned during cleanup. Further native UI actions stopped after a fresh state read. The BrowserSkill session had already ended after the extension reload; its session listing was empty. The screenshot shown in this chat is not claimed as a saved file.

## Exact loaded-file comparison

Worktree files and files in Chrome's loaded directory were byte-identical:

```text
manifest.json: 30eaa4dc980cfac2f95ed8348b6e97d90fe3fa6cfc1d8867ddab6e645948e59a
sidepanel/sidepanel.html: 72ff3574b7f25f1928043f2a887b76b113c8d29f239d6a62eefcad9df9aaa98d
sidepanel/sidepanel.js: 22dcefca0a36aa0bdc4a824e49367584ff10c8c9b25e2c21c4e441fe02d8d02e
shared/sentence_benchmark.js: cf6a849e63d726830992f79de7fe6c2adc9042f661ccd49d7f53ee6589f5106c
shared/gemini_translate.js: 2a5813aaeba99236990c4854a5564f92964bd8254983633d8d81cd78f0fd1c88
content/content.js: 1da0795491d94a0d5a34b92ac23fc88055e9ba6bb42f2107a52dcd4ac2681012
background/service_worker.js: cd7bf7cd1327a68a78ba7824c3781e14c51929a318b6c02d8d755257694abf22
shared/sentence_groups.js: 1efd544819a215a63da119617561a4cff3cf115c48035fa91fe3acd60ba5d79d
```

## Exported native trace

File: `/Users/hoangson/Downloads/yt-caption-ylnxFdPhLCo-cost-clock-followup-2026-10-10.json`  
Bytes: `78624`  
SHA-256: `d723810b88953a88e6eeccf9564314e3ce2296439a3336569bd971326c08e428`  
Trace ID: `c018b359-8ba6-4f03-b80b-ccf132afddc4`  
Video ID: `ylnxFdPhLCo`

Observed fields: `timeToTrackLoadedMs=3978`, `ttfvMs=null`, `warmupMs=5000`, 3 track-loaded events, 12 onsets (1 cold and 11 warm), 0 JP-paint events, 1 discontinuity (`seek`), 340 preparation events, and 0 dropped events. Every sampled Original-JA onset is reported ready, but this does not certify a network-cache cold/warm state or release KPI. The 340 preparation events are not independent sentences. No HTTP translation attempts occurred; request latency and cost are null/NOT VERIFIED.

## Commands and output

```text
COMMAND: node scripts/sentence_benchmark_sanity.js
EXIT CODE: 0
STDOUT:
PASS: actual content sync excludes seeking onset
PASS: actual paint observer rechecks hidden tab, Japanese and overlay settings inside RAF
PASS: production sync measures one player clock across interleaved frame/timeupdate/tick calls; one onset, no artificial discontinuity, renderer timestamps preserved
PASS: lifecycle uses private revision ordinals, dedups prepared groups, distinguishes accepted/cache/discard/error/cancel; identity/event caps stay unverified without caption/key export
PASS: empty metrics remain NOT VERIFIED; cold/warm onset bounds distinguish ready/missing/uncertain; seek/gaps excluded; real receipt IDs deduplicate HTTP attempts; no fabricated cost
```

```text
COMMAND: node scripts/sentence_cost_sanity.js
EXIT CODE: 0
STDOUT:
PASS: actual HTTP200 VI/EN batch dedup keeps thinking/cache usage; rejected translation retains usage; cache exports no historical request; list-price estimate is separate from unverified billing
PASS: missing/expired/unknown/invalid usage never becomes zero-cost success; totals include thinking; incomplete trace estimates are explicitly partial
```

The actual export audit parsed the downloaded JSON, asserted the video ID, event counts, readiness and null-cost semantics, and compared each loaded file's bytes with the worktree. Its final stdout was:

```text
artifact=yt-caption-ylnxFdPhLCo-cost-clock-followup-2026-10-10.json bytes=78624 sha256=d723810b88953a88e6eeccf9564314e3ce2296439a3336569bd971326c08e428 videoId=ylnxFdPhLCo
timeToTrackLoadedMs= 3978 ttfvMs= None readiness= {'original:cold:ja': {'total': 1, 'ready': 1, 'uncertain': 0, 'missing': 0, 'lowerBound': 1, 'upperBound': 1}, 'original:warm:ja': {'total': 11, 'ready': 11, 'uncertain': 0, 'missing': 0, 'lowerBound': 1, 'upperBound': 1}}
requestCount= 0 requestLatency= {'p50': None, 'p95': None} apiCost= None apiCostStatus= NOT VERIFIED: no account billing evidence
eventCounts= {'track_loaded': 3, 'onset': 12, 'discontinuity': 1, 'group_prepared': 340, 'jp_paint': 0} discontinuity=seek
PASS: exact current extension bytes and downloaded native metrics schema/arithmetic assertions
```

## API, data, and review status

API_CHECKS: no Gemini HTTP call; `requestCount=0`; no live latency or billing evidence.  
DATABASE_CHECKS: not applicable; no bridge or Drive read/write was performed.  

The independent reviewer agent is unavailable because its run returned an account usage-limit error. This is not an automatic review. The full plan remains active: audio-reviewed five-video gold set, source/segmentation semantic failures, measured translation readiness, live Gemini cost, complete round-trips, and release KPIs are not established by this recheck.
