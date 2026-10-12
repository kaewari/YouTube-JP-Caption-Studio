<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Chrome sẵn sàng, để nguyên 2 phút -->
# Native reload, backup and metric checkpoint after legacy TXT deployment

STATUS: PASS for bounded export/artifact comparison. Full native persistence, translation, sync and MVP: NOT VERIFIED.

## Authorized scope and observations

The approved one-file Antigravity update/restart is documented in [the deployment review](youtube-sentence-mvp-legacy-txt-deployment-2026-10-11.md). Its independently verified PID18180 and exact48-file preservation describe that deployment audit point, not a perpetual data invariant. This follow-up changes no production source and performs no rollback, migration, restore, manual cue edit or cloud consent.

Native Chrome Katou Details showed enabled Caption Studio0.11.2, IDoiocgalcdfmkbcikemohekbjjmlbpoll, from `/Users/hoangson/Projects/YouTube JP Caption Studio/extension`. Parent clicked Reload and observed Reloaded, opened `https://www.youtube.com/watch?v=ylnxFdPhLCo`, enabled the overlay and observed Enhanced. The first export attempt was interrupted by user activity; parent refreshed native state and obtained the explicit two-minute quiet window. During that window native Save dialogs produced the JSON backup and benchmark in Downloads. Video was paused afterward. The window is consumed; no further native interaction is inferred authorized by its duration.

Parent clicked the actual Gemini translate button. Native toast: “Chưa cấu hình Gemini API Key. Mở Cài đặt của Side Panel để nhập key.” This concerns the current Caption Studio context; it does not prove no key exists elsewhere. No key was read, entered, copied, displayed or saved. On-disk `shared/gemini_translate.js` reads `geminiApiKey` from Chrome local then sync; `content/settings_modal.js` uses the same save helper, so no storage-name mismatch was identified. Drive menu advertised an OAuth client/extension-ID mismatch; no fresh Drive auth/API operation was performed.

Native screenshot decoded by the independent reviewer shows Enhanced, Japanese/furigana, cached VI and the TXT metadata warning. Other groups show VI pending. Native reload/visual activation is observed; exact worker-specific execution, new Gemini translations and protected restore are not established by that screenshot.

## Artifacts and comparison

Ignored evidence directory: `.tmp-sentence-mvp/legacy-native-2026-10-11/`. Downloads were copied byte-for-byte for this checkpoint.

| Artifact | Bytes | SHA256 |
|---|---:|---|
| yt-caption-ylnxFdPhLCo.json | 1126015 | 3a671167d9cc9c95bf23cb00576b5e365ffaac259b7384609bfce83cf7490f92 |
| yt-caption-ylnxFdPhLCo-benchmark.json | 123234 | e5222f12589e4328329336345fb166c129a20e7d4cf19c8f2598ee3151fb21f7 |
| native-caption.png | 775648 | 489ac0e31378c7294ea3fc88ac67d0b54e87e3f52a5dc031388efee81dac597c |

Backup exportedAt `2026-10-11T10:14:36.495Z`, format caption-studio-sentence-backup/version1, sourceKey `youtube:ylnxFdPhLCo:ja`, metadata rev15. All102 ordered unique IDs/source/VI/EN/clocks/provenance equal both current disk and deployment snapshot. One absent versus false mt_locked shape difference has identical boolean meaning. All102 VI strings are nonempty cached cue targets; there are zero group translations, zero locks, owned=false, no tombstones/saved sentences/Undo. Therefore this export does not verify protected nonempty persistence or restore.

Raw track109, sidecar sourceCues101 and backup102 are separate layers, not an assertion of identical normalization counts. Exported runtime tokens and separately stored tokens.json are distinct storage layers. Current stored tokens.json remains byte-equal to deployment snapshot. Fingerprint `fc82346ff5889da03876d0c4f0b845deb7ed61265472ca423802dd46f6dafae4` agrees between backup and benchmark.

The benchmark independently recomputes JA onset readiness cold2/2 and warm38/38, total40 samples; no VI/EN onset observations. Request count0, actual and estimated costs null, dropped events0. Null cost is not zero billing. Track-loaded3,623.100000023842ms; TTFV47,090.5ms includes elapsed session time with parent-observed late manual overlay enable and is not a pure loading KPI. Artifact alone does not establish causal timing. One paint rect643.5234375×123.6640625px is recorded; no resize/layout interaction test or before/after geometry claim.

## Current data differs from historical deployment checkpoint

Independent inventory: same48 paths,44 identical, four changed since deployment preflight: config/extension_state.json and ylnx cues.json/meta.json/script.txt. Revision9→15, while the102 source/target/clock/provenance fields and stored tokens remain unchanged. Native-stage start→final differs only config; it is a later baseline. Cause of file/revision changes is NOT VERIFIED. Do not infer zero browser auto-writes or roll back these changes. Historical deployment preservation remains bounded to its own audit.

## Evidence and limits

Parent artifact command `python3 .tmp-sentence-mvp/legacy-native-2026-10-11/verify-native-artifacts.py` exited0 with actual cue equality, zero protected entries,109/101/102 layer counts and JA-only counters. This is JSON/disk artifact verification, not software Red/Green. Initial raw-count102 and strict absent/false assumptions were corrected and logged. Independent token-layer/baseline assumptions are recorded below; they were reviewer errors, not production defects. No backend suite repeated and no new production code changed.

Full native protected nonempty persistence/restore, actual Drive/Swift/old-client roundtrip,5videos/50 audio-reviewed gold, source17/rra05 semantics, live Gemini VI/EN cold/warm readiness/latency/cost/KPI and release remain NOT VERIFIED. ASR remains conditional outside MVP. The full persistent goal is active and incomplete; quota warning is not a pause instruction.

Parent read and verified independent report:10079bytes/102lines, SHA256 `8418500fa256204c7a467627263890f0ef762b57efcc975c2fde5251da8c18d0`. Verbatim report with exact command, exit code and stdout follows.

STATUS: PASS for bounded artifact identity/comparison/arithmetic audit. Full native persistence/Drive/Gemini/MVP: NOT VERIFIED.

REQUIREMENTS:
VERIFIED: 102 unique ordered cue IDs and eight requested fields (id, source, vi, en, start_media_time, end_media_time, translation_source, text_source) equal across actual native export, current Antigravity disk and deployment snapshot. One mt_locked presence mismatch is absent versus false; boolean semantics match, zero locked cues.
VERIFIED: owned=false; tombstones/saved sentences/group translations/Undo empty. This cannot prove protected nonempty persistence.
VERIFIED: raw109 / sidecar sourceCues101 / backup102 are distinct layers; sourceKey/video/fingerprint match benchmark. No claim all backup cues are raw normalized rows or Japanese semantics/audio truth.
VERIFIED: recomputed JA onset readiness cold2/2 warm38/38; 40 onsets, 510 distinct group ordinals, 4 track_loaded, one positive paint rect. No VI/EN readiness observations. requestCount0 and costs null do not prove zero billing or successful Gemini.
VERIFIED: TTFV47090.5ms = paint48765.5 - opened1675. Late overlay enabling was parent-observed; artifact alone does not measure its cause or pure loading KPI. Sampled readiness is not paint proof/release certification.
CONTRADICTED: whole-data unchanged since deployment preflight. Same48 paths, four files changed and44 identical; yln revision9->15. Source/targets/clocks/provenance and stored tokens.json unchanged. No cause attribution.
VERIFIED: current inventory matches actual native-final-inventory. Native stage start->final differs only extension_state.json; the four-file comparison uses earlier deployment preflight, not the later stage start.
Screenshot artifact independently viewed with view_image: decoded3024x1744, visible Enhanced label, Japanese overlay/cached Vietnamese row and full TXT warning. This is screenshot inspection, not reviewer-operated Chrome. Screenshot does not establish Gemini/auth/restore.
NOT VERIFIED: new Gemini translation, Drive OAuth/cloud operation, Swift, native restore, protected nonempty data, audio gold/full quality/KPI/full MVP.

COMMANDS:
Cwd: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
Exact final artifact audit:
```sh
python3 - <<'PY'
from pathlib import Path
import hashlib,json,collections,math,struct
h=Path('.tmp-sentence-mvp/legacy-native-2026-10-11')
root=Path('/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def info(p):return {'sha256':sha(p),'bytes':p.stat().st_size,'mode':oct(p.stat().st_mode&0o777)}
b=json.loads((h/'yt-caption-ylnxFdPhLCo.json').read_text());m=json.loads((h/'yt-caption-ylnxFdPhLCo-benchmark.json').read_text())
d=json.loads((root/'data/subtitles/ylnxFdPhLCo/cues.json').read_text())
old=json.loads((Path('.tmp-sentence-mvp/legacy-txt-sync-2026-10-11/deployment-data-before')/'data/subtitles/ylnxFdPhLCo/cues.json').read_text())
assert b['format']=='caption-studio-sentence-backup' and b['version']==1 and b['videoId']=='ylnxFdPhLCo'
assert len(b['cues'])==len(d['cues'])==len(old['cues'])==102
fields=['id','source','vi','en','start_media_time','end_media_time','translation_source','text_source']
assert all(x.get(f)==y.get(f)==z.get(f) for x,y,z in zip(b['cues'],d['cues'],old['cues']) for f in fields)
assert len({x['id'] for x in b['cues']})==102
assert all(math.isfinite(x[k]) for x in b['cues'] for k in ['start_media_time','end_media_time'])
exceptions=sum(('mt_locked' in x)!=('mt_locked' in y) for x,y in zip(b['cues'],d['cues']))
assert all(x.get('mt_locked',False)==y.get('mt_locked',False)==z.get('mt_locked',False)==False for x,y,z in zip(b['cues'],d['cues'],old['cues']))
e=b['enhancement'];assert e['sourceKey']==b['sourceKey']==m['context']['sourceKey']=='youtube:ylnxFdPhLCo:ja'
assert m['context']['videoId']==b['videoId'] and m['context']['fingerprint']==e['rawTrack']['fingerprint']
assert e['offsetUnit']=='utf16'
assert not b['transcriptMeta']['owned'] and not b['transcriptMeta']['tombstones'] and not b['savedSentences'] and not e['translations'] and not e['undoRevisions']
events=m['events'];types=collections.Counter(x['type'] for x in events);onsets=[x for x in events if x['type']=='onset']
assert types=={'group_prepared':510,'track_loaded':4,'onset':40,'jp_paint':1}
refs=[x['groupRef'] for x in events if x['type']=='group_prepared']
assert all(isinstance(x,int) and x>0 for x in refs) and len(refs)==len(set(refs))
computed={}
for x in onsets:
 assert x['phase']==('cold' if x['atMs']-m['openedAtMs']<m['warmupMs'] else 'warm')
 assert x['windowMs'][0]<=x['windowMs'][1]==x['atMs'] and x['rate']>0
 for lang,state in x['readiness'].items():
  k=x['mode']+':'+x['phase']+':'+lang
  v=computed.setdefault(k,{'total':0,'ready':0,'uncertain':0,'missing':0})
  v['total']+=1;v[{'ready':'ready','within_sample':'uncertain','missing':'missing'}[state]]+=1
for k,v in computed.items():
 v['lowerBound']=v['ready']/v['total'];v['upperBound']=(v['ready']+v['uncertain'])/v['total']
assert computed==m['readiness']
paint=next(x for x in events if x['type']=='jp_paint')
assert paint['atMs']-m['openedAtMs']==m['ttfvMs']==47090.5
assert all(math.isfinite(v) for v in paint['rect'].values()) and paint['rect']['width']>0 and paint['rect']['height']>0
assert m['requestCount']==0 and m['apiCost'] is None and m['apiCostEstimate']['amount'] is None and m['droppedEvents']==0
start=json.loads((h/'native-start-inventory.json').read_text());final=json.loads((h/'native-final-inventory.json').read_text())
now={str(p.relative_to(root)):info(p) for base in (root/'data',root/'local-bridge/data') if base.exists() for p in base.rglob('*') if p.is_file()}
assert len(start)==len(final)==len(now)==48 and now==final and set(start)==set(final)
baseline=json.loads(Path('.tmp-sentence-mvp/legacy-txt-sync-2026-10-11/deployment-preflight.json').read_text())['data_files']
changes=sorted(k for k in baseline if baseline[k]!=now[k])
print('native stage start->final changed files='+str(sum(start[k]!=final[k] for k in start)))
assert changes==['data/config/extension_state.json','data/subtitles/ylnxFdPhLCo/cues.json','data/subtitles/ylnxFdPhLCo/meta.json','data/subtitles/ylnxFdPhLCo/script.txt']
assert sha(root/'data/subtitles/ylnxFdPhLCo/tokens.json')==sha(Path('.tmp-sentence-mvp/legacy-txt-sync-2026-10-11/deployment-data-before')/'data/subtitles/ylnxFdPhLCo/tokens.json')
assert old['meta']['rev']==9 and d['meta']['rev']==b['transcriptMeta']['rev']==15
print('VERIFIED: 102 unique ordered cue IDs; source/targets/clocks/provenance equal export/current/deployment snapshot; absent-vs-false lock shape exceptions='+str(exceptions))
print('VERIFIED: locked=0 owned=false tombstones/saved/translations/Undo empty; raw=109 sourceCues=101 backup=102 are distinct layers')
print('VERIFIED: readiness recomputed JA cold 2/2 warm 38/38; 40 onsets; no VI/EN observations; requestCount=0 costs=null dropped=0')
print('VERIFIED: TTFV 47090.5ms arithmetic; paint rect='+json.dumps(paint['rect'])+'; 510 distinct prepared ordinals, 4 track_loaded')
print('CONTRADICTED whole-data unchanged: 48 inventory retained, 4 files changed, 44 identical; revision 9->15; no cause attribution')
for k in changes:print('changed: '+k)
for name in ['yt-caption-ylnxFdPhLCo.json','yt-caption-ylnxFdPhLCo-benchmark.json','native-caption.png']:
 p=h/name;print(name+' bytes='+str(p.stat().st_size)+' SHA256='+sha(p))
print('NOT VERIFIED: native actions independently operated, protected/restore/Drive/Gemini/Swift/full MVP/audio gold or release KPI')
PY
```
Exit:0
Actual stdout:
```text
native stage start->final changed files=1
VERIFIED: 102 unique ordered cue IDs; source/targets/clocks/provenance equal export/current/deployment snapshot; absent-vs-false lock shape exceptions=1
VERIFIED: locked=0 owned=false tombstones/saved/translations/Undo empty; raw=109 sourceCues=101 backup=102 are distinct layers
VERIFIED: readiness recomputed JA cold 2/2 warm 38/38; 40 onsets; no VI/EN observations; requestCount=0 costs=null dropped=0
VERIFIED: TTFV 47090.5ms arithmetic; paint rect={"width": 643.5234375, "height": 123.6640625, "top": 350.2421875, "left": 188.171875}; 510 distinct prepared ordinals, 4 track_loaded
CONTRADICTED whole-data unchanged: 48 inventory retained, 4 files changed, 44 identical; revision 9->15; no cause attribution
changed: data/config/extension_state.json
changed: data/subtitles/ylnxFdPhLCo/cues.json
changed: data/subtitles/ylnxFdPhLCo/meta.json
changed: data/subtitles/ylnxFdPhLCo/script.txt
yt-caption-ylnxFdPhLCo.json bytes=1126015 SHA256=3a671167d9cc9c95bf23cb00576b5e365ffaac259b7384609bfce83cf7490f92
yt-caption-ylnxFdPhLCo-benchmark.json bytes=123234 SHA256=e5222f12589e4328329336345fb166c129a20e7d4cf19c8f2598ee3151fb21f7
native-caption.png bytes=775648 SHA256=489ac0e31378c7294ea3fc88ac67d0b54e87e3f52a5dc031388efee81dac597c
NOT VERIFIED: native actions independently operated, protected/restore/Drive/Gemini/Swift/full MVP/audio gold or release KPI
```

AUDIT CORRECTIONS (not software Red/Green):
Initial reviewer assertion also compared exported embedded tokens against cues.json tokens: exit1 AssertionError at line13. Field-count diagnostic exit0 found all eight requested fields mismatch0; embedded tokens mismatch102, current-vs-snapshot tokens mismatch0. Export runtime tokens and separately stored tokens.json are different layers; corrected audit verifies stored tokens.json byte equality.
Second reviewer assertion mistakenly used native-start inventory as deployment baseline for expected four changed paths: exit1 AssertionError at line45. Diagnostic exit0 showed native-start->final only extension_state.json. Final command explicitly compares fresh deployment-preflight to current disk and independently verifies current inventory against native-final. Both issues are reviewer comparison assumptions, not production bugs.
No browser, scripts API, restore, source, state, process or cloud mutation performed. Only this ignored report was written. No suites repeated.

