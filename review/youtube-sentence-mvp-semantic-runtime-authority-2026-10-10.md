<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Giữ runtime Antigravity hiện tại -->

# Semantic regression and selected bridge runtime

Read alongside the [current revised plan](../plan/youtube-sentence-enhancement-mvp-2026-10-10.md), the [ordinal continuation review](youtube-sentence-mvp-ordinal-continuation-2026-10-10.md), and the [partial creator-reference review](youtube-sentence-mvp-creator-reference-partial-2026-10-10.md).

STATUS: **NOT VERIFIED for the full MVP.** Current semantic audit still reports source17 and rra05 as FAIL; rra08 is PASS. Five-video source structural checks and a read-only request to the user-selected Antigravity bridge pass within their tested scope. No production code, script store, database, or bridge state was changed. No independent reviewer was available for this checkpoint; this is not an automatic review.

## User decision and live runtime

The user explicitly selected the currently running Antigravity bridge/runtime data as the authoritative runtime. The latest read-only listener check found PID `74619` on `127.0.0.1:8765`; its working directory is `/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge`. The process and data were left untouched. This resolves the earlier open authority preference; it does not authorize switching, reconciling, or migrating the six differing state files.

## Current acceptance evidence

| Criterion | Actual | Status |
|---|---|---|
| Mandatory source17 boundaries | Current production parser → normalizer → grouping still emits one group crossing source17 offsets4 and9 | FAIL |
| rra05 lexical continuity | Current production grouping still separates `な` from `んで普通に買い物できんの?`; source cue has `speakerChange:true` and a 4.719-second source-window gap | FAIL; guards remain |
| rra08 ordinal continuation | `第1` + `弾…` is one group with the expected source refs | PASS for this bounded lexical sample |
| Five source snapshots | Five captured JSON3 bodies retain exact source coverage; current structural totals are 512 cues, 766 groups, 7 cross-cue merge groups and 538 display units | PASS for structure only; ground truth NOT VERIFIED |
| Selected current bridge | `/health` and one synthetic `/tokenize_batch` request return HTTP 200; parsed token surfaces reconstruct the input and Kanji readings are present | PASS for a read-only synthetic API probe |
| Full gold/KPI/release | Audio-reviewed 50-span gold, semantic rates, live Gemini/readiness/cost, protected storage/Drive and release targets | NOT VERIFIED |

rra05 must not be made Green by removing the speaker or gap guards on this visual-only evidence. Source17 still lacks a timestamp at the second visual boundary. Keep both failures visible until stronger source/audio evidence supports a general rule.

## Commands and raw output

### Runtime identity

```text
COMMAND: lsof -nP -iTCP:8765 -sTCP:LISTEN
EXIT CODE: 0
STDOUT:
COMMAND     PID     USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
python3.1 74619 hoangson   12u  IPv4 0x39be3d3fb414b562      0t0  TCP 127.0.0.1:8765 (LISTEN)
```

```text
COMMAND: lsof -a -p 74619 -d cwd -Fn
EXIT CODE: 0
STDOUT:
p74619
fcwd
n/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge
```

### Live API probe

The request contains only synthetic text and does not call script save, dictionary mutation, Drive, or Gemini. The tokenize route updates its in-memory latency metric.

```text
COMMAND: python3 - <<'PY'
import json
import re
import urllib.request
base = 'http://127.0.0.1:8765'
with urllib.request.urlopen(base + '/health', timeout=5) as response:
    health_status = response.status
    health = json.load(response)
print('GET /health HTTP', health_status, 'ready=', health.get('ready'), 'models_loaded=', health.get('models_loaded'))
text = '日本語の字幕を確認します。'
body = json.dumps({'cues': [{'id': 'sentence-plan-live-probe', 'text': text}]}, ensure_ascii=False).encode()
request = urllib.request.Request(base + '/tokenize_batch', data=body, headers={'Content-Type': 'application/json'}, method='POST')
with urllib.request.urlopen(request, timeout=20) as response:
    status = response.status
    payload = json.load(response)
item = payload['results'][0]
tokens = item['tokens']
assert health_status == 200 and health.get('ready') is True
assert status == 200 and len(payload.get('results', [])) == 1
assert item['id'] == 'sentence-plan-live-probe' and item['source'] == text
assert ''.join(token['surface'] for token in tokens) == text
assert all(token.get('reading') for token in tokens if re.search(r'[一-龯]', token['surface']))
assert all(isinstance(token.get('pos'), str) and token['pos'] for token in tokens)
print('POST /tokenize_batch HTTP', status, 'tokens=', len(tokens), 'sourceCoverage=exact', 'kanjiReadings=present')
print('PASS: current Antigravity bridge returns parsed Japanese token data over HTTP; no script/database write')
PY
EXIT CODE: 0
STDOUT:
GET /health HTTP 200 ready= True models_loaded= {'ocr': False, 'mt': False, 'sudachi': True, 'dict': True, 'freq': True}
POST /tokenize_batch HTTP 200 tokens= 8 sourceCoverage=exact kanjiReadings=present
PASS: current Antigravity bridge returns parsed Japanese token data over HTTP; no script/database write
```

### Current five-snapshot structural projection

```text
COMMAND: node scripts/sentence_snapshot_sanity.js data/subtitles/parako-sentence-mvp-2026-10-09
EXIT CODE: 0
STDOUT:
{"file":"CLs0YSeggXk.timedtext.json3.json","cues":88,"groups":142,"merges":0,"units":88,"groupBuildMs":1.409,"sourceCoverage":"exact","groundTruth":"NOT VERIFIED"}
{"file":"_aMBGfcwtGY.timedtext.json3.json","cues":112,"groups":149,"merges":0,"units":116,"groupBuildMs":0.904,"sourceCoverage":"exact","groundTruth":"NOT VERIFIED"}
{"file":"oLYBgoeslnk.timedtext.json3.json","cues":116,"groups":180,"merges":1,"units":126,"groupBuildMs":0.744,"sourceCoverage":"exact","groundTruth":"NOT VERIFIED"}
{"file":"rraWPrKKwRc.timedtext.json3.json","cues":95,"groups":128,"merges":3,"units":101,"groupBuildMs":0.734,"sourceCoverage":"exact","groundTruth":"NOT VERIFIED"}
{"file":"ylnxFdPhLCo.timedtext.json3.json","cues":101,"groups":167,"merges":3,"units":107,"groupBuildMs":0.712,"sourceCoverage":"exact","groundTruth":"NOT VERIFIED"}
PASS: captured source coverage and continuation examples; not a gold/KPI or browser benchmark
```

### Current semantic checks

```text
COMMAND: node .tmp-sentence-mvp/creator-reference-frames-2026-10-10/check-semantic-boundaries.js
EXIT CODE: 1
STDOUT:
VERIFIED: actual JSON3 parser→normalizer→Groups; exact source/raw mapping and once-only UTF16 coverage retained
{"rowId":"ylnxFdPhLCo-03","kind":"speaker-change","cueId":"snapshot-17","charOffset":4,"status":"FAIL","crossingText":["だなんて言い方きし家族とか友達は乗せてないんですか?"]}
{"rowId":"ylnxFdPhLCo-03","kind":"new-question-same-speaker","cueId":"snapshot-17","charOffset":9,"status":"FAIL","crossingText":["だなんて言い方きし家族とか友達は乗せてないんですか?"]}
{"rowId":"ylnxFdPhLCo-04","kind":"mandatory-question-join","status":"PASS","text":"どこ行くんですか?"}
Full50 semantic KPI/audio alignment NOT VERIFIED; failing visual boundary audit intentionally remains Red
```

```text
COMMAND: node .tmp-sentence-mvp/creator-reference-frames-2026-10-10/check-rra-fragments.js
EXIT CODE: 1
STDOUT:
VERIFIED:6 actual JSON3 cues/125 UTF16 units; parser/raw mapping and once-only source coverage; candidates byte-unchanged
{"rowId":"rraWPrKKwRc-05","status":"FAIL","expectedText":"なんで普通に買い物できんの?","expectedRefs":[{"cueId":"snapshot-40","charStart":42,"charEnd":43},{"cueId":"snapshot-41","charStart":0,"charEnd":13}],"actualGroups":[{"text":"どうぞご覧くださいませ。","sourceRefs":[{"cueId":"snapshot-40","charStart":0,"charEnd":12}]},{"text":"このワンピ可愛くねえ。","sourceRefs":[{"cueId":"snapshot-40","charStart":12,"charEnd":23}]},{"text":"めっちゃいい。","sourceRefs":[{"cueId":"snapshot-40","charStart":23,"charEnd":30}]},{"text":"キャップと秋で組めたわ。","sourceRefs":[{"cueId":"snapshot-40","charStart":30,"charEnd":42}]},{"text":"な","sourceRefs":[{"cueId":"snapshot-40","charStart":42,"charEnd":43}]},{"text":"んで普通に買い物できんの?","sourceRefs":[{"cueId":"snapshot-41","charStart":0,"charEnd":13}]},{"text":"次どこ行く?","sourceRefs":[{"cueId":"snapshot-42","charStart":0,"charEnd":6}]},{"text":"コスメ","sourceRefs":[{"cueId":"snapshot-42","charStart":6,"charEnd":9}]}],"diagnostics":[{"cueId":"snapshot-41","reason":"speaker-change"}],"referenceKind":"sampled creator lexical continuity; no verified audio timing"}
{"rowId":"rraWPrKKwRc-08","status":"PASS","expectedText":"第1弾ではすでにヒカル君、正義君、みさん、可愛い妹の証拠が販売されている。","expectedRefs":[{"cueId":"snapshot-72","charStart":0,"charEnd":2},{"cueId":"snapshot-73","charStart":0,"charEnd":35}],"actualGroups":[{"text":"このステッカーは選んで購入できるそうだ。","sourceRefs":[{"cueId":"snapshot-71","charStart":0,"charEnd":20}]},{"text":"第1弾ではすでにヒカル君、正義君、みさん、可愛い妹の証拠が販売されている。","sourceRefs":[{"cueId":"snapshot-72","charStart":0,"charEnd":2},{"cueId":"snapshot-73","charStart":0,"charEnd":35}]},{"text":"うき、","sourceRefs":[{"cueId":"snapshot-73","charStart":35,"charEnd":38}]}],"diagnostics":[{"cueId":"snapshot-73","reason":"overlap-anchor-continuation"}],"referenceKind":"sampled creator lexical continuity; no verified audio timing"}
Full50 gold/audio timing/KPI NOT VERIFIED; per-row results above retain unresolved boundaries
```

No renderer, translation, native Chrome, Drive, protected-storage, database, or source-word changes were exercised by these checks. The complete plan remains active and release status remains NOT VERIFIED.
