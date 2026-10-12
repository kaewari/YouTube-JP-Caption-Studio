<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: thực hiện plan YouTube Caption Studio -->

# Semantic boundary tokenizer recheck

Read alongside the [semantic/runtime authority review](youtube-sentence-mvp-semantic-runtime-authority-2026-10-10.md) and the [current revised plan](../plan/youtube-sentence-enhancement-mvp-2026-10-10.md).

STATUS: **NOT VERIFIED for source17/rra05 semantic quality or the full MVP.** The selected live Antigravity tokenizer returned HTTP 200 and exact source strings for five targeted fragments. Sudachi tagged the visually bounded `きし` fragment as an ordinary noun and did not report a sentence boundary; POS output alone does not resolve the current visual boundary evidence. The rra05 source-change guard is corroborated by the tokenizer distinction (`な` is an auxiliary token; `んで` is a conjunction) and previously captured `speakerChange:true`/4.719-second source-window gap. No production code, script store, database, bridge process, or persistent bridge data was changed. The API request updates the process's in-memory latency metric. Independent reviewer unavailable; this is not an automatic review.

## Commands and actual output

### Verify selected runtime identity

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

### Tokenize the observed boundary fragments through the selected live API

```text
COMMAND: lsof -a -p 74619 -d cwd -Fn && python3 - <<'PY'
import json, urllib.request
payload={"cues":[
 {"id":"s17-whole","text":"だなんて言い方きし家族とか友達は乗せて"},
 {"id":"s17-before","text":"だなんて言い方きし"},
 {"id":"s17-after","text":"家族とか友達は乗せて"},
 {"id":"rra05-before","text":"キャップと秋で組めたわ。な"},
 {"id":"rra05-after","text":"んで普通に買い物できんの?"}
]}
request=urllib.request.Request('http://127.0.0.1:8765/tokenize_batch',data=json.dumps(payload,ensure_ascii=False).encode(),headers={'Content-Type':'application/json'},method='POST')
with urllib.request.urlopen(request,timeout=15) as response:
 status=response.status
 data=json.load(response)
print(f'HTTP_STATUS={status}')
for row in data.get('results',[]):
 print(json.dumps({'id':row.get('id'),'source':row.get('source'),'tokens':[{'surface':t.get('surface'),'lemma':t.get('lemma'),'pos':t.get('pos'),'reading':t.get('reading')} for t in row.get('tokens',[])]},ensure_ascii=False))
assert status==200 and len(data.get('results',[]))==5
PY
EXIT CODE: 0
STDOUT:
p74619
fcwd
n/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge
HTTP_STATUS=200
{"id": "s17-whole", "source": "だなんて言い方きし家族とか友達は乗せて", "tokens": [{"surface": "だ", "lemma": "だ", "pos": "助動詞", "reading": ""}, {"surface": "なんて", "lemma": "なんて", "pos": "助詞", "reading": ""}, {"surface": "言い方", "lemma": "言い方", "pos": "名詞", "reading": "いいかた"}, {"surface": "きし", "lemma": "きし", "pos": "名詞", "reading": ""}, {"surface": "家族", "lemma": "家族", "pos": "名詞", "reading": "かぞく"}, {"surface": "と", "lemma": "と", "pos": "助詞", "reading": ""}, {"surface": "か", "lemma": "か", "pos": "助詞", "reading": ""}, {"surface": "友達", "lemma": "友達", "pos": "名詞", "reading": "ともだち"}, {"surface": "は", "lemma": "は", "pos": "助詞", "reading": ""}, {"surface": "乗せ", "lemma": "乗せる", "pos": "動詞", "reading": "のせ"}, {"surface": "て", "lemma": "て", "pos": "助詞", "reading": ""}]}
{"id": "s17-before", "source": "だなんて言い方きし", "tokens": [{"surface": "だ", "lemma": "だ", "pos": "助動詞", "reading": ""}, {"surface": "なんて", "lemma": "なんて", "pos": "助詞", "reading": ""}, {"surface": "言い方", "lemma": "言い方", "pos": "名詞", "reading": "いいかた"}, {"surface": "きし", "lemma": "きし", "pos": "名詞", "reading": ""}]}
{"id": "s17-after", "source": "家族とか友達は乗せて", "tokens": [{"surface": "家族", "lemma": "家族", "pos": "名詞", "reading": "かぞく"}, {"surface": "と", "lemma": "と", "pos": "助詞", "reading": ""}, {"surface": "か", "lemma": "か", "pos": "助詞", "reading": ""}, {"surface": "友達", "lemma": "友達", "pos": "名詞", "reading": "ともだち"}, {"surface": "は", "lemma": "は", "pos": "助詞", "reading": ""}, {"surface": "乗せ", "lemma": "乗せる", "pos": "動詞", "reading": "のせ"}, {"surface": "て", "lemma": "て", "pos": "助詞", "reading": ""}]}
{"id": "rra05-before", "source": "キャップと秋で組めたわ。な", "tokens": [{"surface": "キャップ", "lemma": "キャップ", "pos": "名詞", "reading": ""}, {"surface": "と", "lemma": "と", "pos": "助詞", "reading": ""}, {"surface": "秋", "lemma": "秋", "pos": "名詞", "reading": "あき"}, {"surface": "で", "lemma": "で", "pos": "助詞", "reading": ""}, {"surface": "組め", "lemma": "組める", "pos": "動詞", "reading": "くめ"}, {"surface": "た", "lemma": "た", "pos": "助動詞", "reading": ""}, {"surface": "わ", "lemma": "わ", "pos": "助詞", "reading": ""}, {"surface": "。", "lemma": "。", "pos": "補助記号", "reading": ""}, {"surface": "な", "lemma": "だ", "pos": "助動詞", "reading": ""}]}
{"id": "rra05-after", "source": "んで普通に買い物できんの?", "tokens": [{"surface": "んで", "lemma": "んで", "pos": "接続詞", "reading": ""}, {"surface": "普通", "lemma": "普通", "pos": "名詞", "reading": "ふつう"}, {"surface": "に", "lemma": "だ", "pos": "助動詞", "reading": ""}, {"surface": "買い物", "lemma": "買い物", "pos": "名詞", "reading": "かいもの"}, {"surface": "できん", "lemma": "できる", "pos": "動詞", "reading": ""}, {"surface": "の", "lemma": "の", "pos": "助詞", "reading": ""}, {"surface": "?", "lemma": "?", "pos": "補助記号", "reading": ""}]}
```

## Findings and boundary

- The observed creator frames mark source17 offset4 as a visual speaker transition and offset9 as a new same-speaker question. The actual JSON3 segment metadata does not encode those as speaker-change boundaries. Offset9 falls inside a segment whose supplied start is offset7/time66.68 and whose next segment starts at offset11/time68.08; neither timestamp is a verified speech end/onset for the offset9 boundary.
- The actual tokenizer preserves `きし` as an unknown-reading noun between `言い方` and `家族`. It does not label the visual transition or same-speaker question boundary. A generic POS-only cut there would also risk splitting ordinary noun compounds and remains unsupported by this sample.
- Whole-cue source17 ends in `て`, so the existing continuation heuristic can join its final clause with the next cue. A fix must first represent the earlier intra-cue boundaries without changing the source text or pretending the estimated internal split time is exact.
- rra05 cue40 ends in `な` after a sentence-end mark; cue41 begins `んで`, but cue41 also carries `speakerChange:true` and starts 4.719 seconds after the prior source window ends. Keep the existing block; lexical visual continuity alone does not override it.
- No cue-specific production branch, punctuation insertion, speaker/gap guard removal, source retiming, or manual transcription correction was introduced. Full50 audio gold, segmentation/wrong-merge KPI, native renderer activation, Gemini readiness/cost, storage/Drive and release remain NOT VERIFIED.
