<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: implement revised plan; update two provenance helpers and restart Antigravity retaining data -->
# Source metadata restore and authorized provenance deployment

STATUS: PASS — bounded independent extension restore/main delivery and authorized Antigravity provenance deployment. Full MVP: NOT VERIFIED.

Scope: revised plan section7 persistence/mapping. This is a companion to the immutable [cue provenance candidate review](youtube-sentence-mvp-cue-provenance-2026-10-11.md). Candidate-pending state is superseded by direct user approval “Cập nhật hai hàm mới và khởi động lại, giữ dữ liệu (khuyến nghị)”.

## Requirements and actual flow

Extension: timedtext parser → normalize includeSource → cue merge → saveTranscript → actual worker mutation → legacy primary cache + separate sentenceState sidecar → fresh loadLegacyCachedCues/flattenCached → loadCachedCues sidecar attachment → cuesFromSavedScript → loadSentenceState/projection. In-memory mergeCacheLists re-flattens input. Legacy nested segments used a second incomplete whitelist.

Expected: preserve exact raw text, normalized UTF16 mapping, anchors, clocks, group/source identities, same-revision translation, Undo; retain locks/provenance/tombstones; reject stale/malformed/source-owned mapping; primary schema unchanged. Missing/invalid end retains existing final start+2 fallback; genuine zero duration remains zero and grouping still diagnoses invalid timing.

Parent Red executed production functions, not source string assertions. Original loader attaches mapping, saved converter drops it: speaker display units2→1, sourceRefs become effective-cue, revision/translation/Undo differ. Cache flatten drops mapping; saved1.234..1.234 becomes1.234..3.234; fresh0..0 becomes0..2; legacy segment loses ID/ownership/translation lock. Refined permanent check exited1 with9 failed behavioral checks before source edits. First correction additionally revealed null/blank/false end coercion and140000-entry spread RangeError (4 failures); reviewer found full flatten-to-saved unknown-end coercion (6 failures). All were fixed before delivery, assertions retained.

Minimal production diff: shared cueEndTime used in flatten/fresh/saved conversion; reuse flat conversion for legacy segments using for-of append; one shared cachedSourceMetadata trust guard reuses Normalize.normalizeTextWithMapping and validates exact source/clocks/domain/spans/anchors, excludes edit/manual/script/import, permits source-unchanged translation-only locks. No primary payload schema or backend sidecar storage change. Existing test harnesses only wire real dependencies; new standalone runtime check remains runnable.

## Parent command evidence

Cwd: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio.

Command: `node scripts/sentence_cache_identity_sanity.js`
Exit: 0
```text
PASS: owned tombstones survive stale cache, saved-script startup and all-deleted/empty reload
PASS: compact-equivalent fresh sources discard mismatched original tokens and keep exact tokens
PASS: repeated adjacent source uses each cached ID once with nearest anchor; fresh prefix collisions stay distinct/deterministic; owned clocks/text/lock remain authoritative
PASS: actual async reload/startup callers preserve all-deleted and empty owned timeline
```

Command: `node scripts/sentence_content_sanity.js`
Exit: 0
```text
PASS: independent Enhanced/grouping flags roll back display to Original, retaining originals, saved items and sidecar backup metadata; reenable rebuilds
[jpcap] Sentence projection rejected; keeping Original TypeError: Sentence projection requires unique cue IDs
    at Object.buildSentenceGroups (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/extension/shared/sentence_groups.js:130:75)
    at refreshSentenceProjection (evalmachine.<anonymous>:236:35)
    at evalmachine.<anonymous>:1:16
    at Script.runInContext (node:vm:150:12)
    at Object.runInContext (node:vm:302:6)
    at run (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:58:30)
    at /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:169:3
PASS: production mode/playhead/undo/video-reset/invalid-ID fallback; original state unchanged, fragment MT withheld
PASS: active display resolver and saved snapshot/provenance; shared sentence star, revision change keeps old snapshot
PASS: versioned sidecar adapter reload restores undo; changed source invalidates override (isolated storage adapter)
PASS: malformed/unavailable disposable sidecar preserves successful legacy cache load
PASS: same-track new navigation reads its own sidecar instead of reusing aborted session load
PASS: production JSON export payload preserves original clocks/text, raw track, metadata and saved provenance; browser delivery not covered
PASS: explicit restore/recovery preserves source clocks, locks, tombstones and other saved videos; wrong video/duplicate IDs rejected (isolated storage adapter)
```

Command: `node scripts/sentence_saved_state_sanity.js`
Exit: 0
```text
PASS: actual legacy save waits/commits before restore; restored memory, storage and disk adapter retain new source
PASS: sibling tab holding an old metadata response cannot overwrite restored script; worker compares revision inside its queue
PASS: sibling late sidecar write cannot erase restored Undo; shared worker rejects older metadata revision
PASS: held restore commit and another tab star share production worker queue; other-video snapshot survives
PASS: malformed/null Original token cache cannot replace restored source
PASS: hydration discards wrong-source memory/cache tokens and retains exact matching original tokens
PASS: foreign sender rejected; actual TypeScript Saved Items deletion uses worker mutation and removes only its selected ID
```

Command: `node --check extension/content/content.js`
Exit: 0
```text
(no stdout/stderr)
```

Command: `git diff --check -- extension/content/content.js scripts/sentence_source_restore_sanity.js scripts/sentence_cache_identity_sanity.js scripts/sentence_content_sanity.js`
Exit: 0
```text
(no stdout/stderr)
```

Source restore command: `node scripts/sentence_source_restore_sanity.js`, exit0,36 PASS lines. Its actual production save/worker/read flow uses structured-clone isolated storage and a disk adapter. Fresh VM checks compare complete group projection, raw source+normalization, cue revision, sidecar translation and accepted Undo. This is not native chrome.storage or real bridge HTTP proof.

Parent captured-source probe executed actual parser/normalizer → flatten → Groups on five ignored JSON3 snapshots, exit0:
```text
CLs0YSeggXk.timedtext.json3.json 88 mapped cues; dropped 0
_aMBGfcwtGY.timedtext.json3.json 112 mapped cues; dropped 0
oLYBgoeslnk.timedtext.json3.json 116 mapped cues; dropped 0
rraWPrKKwRc.timedtext.json3.json 95 mapped cues; dropped 0
ylnxFdPhLCo.timedtext.json3.json 101 mapped cues; dropped 0
PASS: 512 captured source cues retain mapping and identical group projection; audio gold NOT VERIFIED
```

## Authorized runtime deployment

User authorized additional two helpers and same-runtime restart, retaining all data. Guarded deployment compares current source5551989… to reviewed candidate8adeebf…, AST only _cue_content_sig/_cues_from_txt differ, other30 selected app Python files byte-equal. Old source+all44 data files backed up with bytes/modes. Graceful SIGTERM restart42809→60231, same Antigravity cwd/venv/python argv, host127.0.0.1/port8765/workers1.

Exact command: `python3 .tmp-sentence-mvp/provenance-deploy-2026-10-11/deploy.py`; exit0.
```text
PASS: preflight source/helper guards, same Antigravity runtime, all44 bytes/modes/set and backups
PASS: graceful Antigravity restart42809->60231 same cwd/venv/host/port/workers; health HTTP200 ready true
PASS: synthetic tokenize HTTP200 exact source; all44 data files unchanged; no script API writes
PASS: deployed source SHA256 8adeebf107de5a7e971d8599f345c2e85094f82472d329b1576945cfbc7f4d10
```

Read-only repeat: `python3 .tmp-sentence-mvp/provenance-deploy-2026-10-11/verify.py`; exit0.
```text
PASS: current Antigravity PID60231 same cwd/port; GET /health HTTP200 ready true
PASS: selected source SHA256 8adeebf107de5a7e971d8599f345c2e85094f82472d329b1576945cfbc7f4d10; original source backup matches
PASS: all44 data files/set/hash/bytes/modes preserved; all44 backups match; no script API writes
```

Deployed-source isolated HTTP command:
```sh
'/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/provenance-deploy-2026-10-11/deployed-source-green.py
```
Exit0, raw:
```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 60978, "secondPid": 60989, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

API_CHECKS: live GET/health200 ready true; live synthetic POST/tokenize_batch200 exact source/tokens. Script save/read/422/restart only disposable isolated servers with selected production route/store. No live8765 script GET/save/delete, state reconciliation, migration, or reconstruction of earlier lost provenance/rounded clocks.
DATABASE_CHECKS: no database changes; script persistence uses temporary file store; live all44 runtime file-set/hash/size/modes and44 backups unchanged.

## Independent review and delivery

Separate independent_audit agent read original revised-plan scope, pre-slice source snapshot, current on-disk diff and affected flow. Final bounded PASS after its independently reproduced full loader fallback Red was corrected. It separately ran main/source runtime checks and audited deployment and delivery bytes; no source edits, native Chrome action, process control or live script writes by reviewer.

## Limits

This supersedes historical candidate-pending and converter metadata-drop status only within supported evidence. Native latest Chrome activation/actual chrome.storage/Drive/old client round-trip, five-video50 audio gold, live Gemini and numerical cold/warm readiness/cost/release gates remain NOT VERIFIED; source17/rra05 semantic cases remain FAIL. Full goal remains active. Pure bugfix, no new feature docs.


## Main delivery parent evidence

Guarded delivery command: `python3 .tmp-sentence-mvp/source-restore-2026-10-11/deliver.py`, exit0. Content previousSHA a34574365bbd88f05c3583530258efd369abf33fbf8fad93af9a8b37b0f9be71 backed up with mode0644; content reviewedSHA f487e44910c80d60ce98d1ef2182e473e580d515f2bc09f7673e29f3a3e80afd delivered. Three standalone checks were absent in main before this copy and copied exactly with mode0644; worker/normalizer/groups/parser dependencies already byte-equal and unchanged. Main cwd /Users/hoangson/Projects/YouTube JP Caption Studio. No native Chrome reload in this slice.

Command: `node scripts/sentence_source_restore_sanity.js`
Exit: 0
```text
PASS: fresh VM saved conversion preserves raw source and normalization
PASS: fresh VM retains speaker split, sourceRefs and group identities
PASS: fresh VM retains exact cue revision
PASS: fresh VM accepts same-revision sidecar translation
PASS: in-memory cache merge preserves full metadata
PASS: saved zero-duration clock stays exact
PASS: fresh zero-duration at origin stays exact
PASS: missing/invalid end retains fallback: undefined
PASS: missing/invalid end retains fallback: null
PASS: missing/invalid end retains fallback: 
PASS: missing/invalid end retains fallback: false
PASS: full flatten-to-saved missing end fallback 0/undefined
PASS: full flatten-to-saved missing end fallback 0/null
PASS: full flatten-to-saved missing end fallback 0/
PASS: full flatten-to-saved missing end fallback 0/false
PASS: full flatten-to-saved missing end fallback 1.234/undefined
PASS: full flatten-to-saved missing end fallback 1.234/null
PASS: full flatten-to-saved missing end fallback 1.234/
PASS: full flatten-to-saved missing end fallback 1.234/false
PASS: legacy segments do not impose a spread-argument ceiling
PASS: legacy segments preserve ID, ownership, locked blank and target provenance
PASS: invalid/owned mapping is discarded: c=>c.source+='変'
PASS: invalid/owned mapping is discarded: c=>c.start_media_time+=.001
PASS: invalid/owned mapping is discarded: c=>c.rawSource.end+=.001
PASS: invalid/owned mapping is discarded: c=>c.normalization.spans[0].rawStart++
PASS: invalid/owned mapping is discarded: c=>c.normalization.offsetUnit='codepoint'
PASS: invalid/owned mapping is discarded: c=>c.rawSource.segmentAnchors=[null]
PASS: invalid/owned mapping is discarded: c=>c.rawSource.segmentAnchors[0].charEnd=999
PASS: invalid/owned mapping is discarded: c=>c.text_source=kind
PASS: invalid/owned mapping is discarded: c=>c.text_source=kind
PASS: invalid/owned mapping is discarded: c=>c.text_source=kind
PASS: invalid/owned mapping is discarded: c=>c.text_source=kind
PASS: translation-only lock keeps source mapping and protects blank target
PASS: tombstone still removes mapped cue
PASS: fresh VM accepts exact revision-bound Undo
PASS: unavailable mapping normalizer safely falls back to original cue
```

Command: `node scripts/sentence_cache_identity_sanity.js`
Exit: 0
```text
PASS: owned tombstones survive stale cache, saved-script startup and all-deleted/empty reload
PASS: compact-equivalent fresh sources discard mismatched original tokens and keep exact tokens
PASS: repeated adjacent source uses each cached ID once with nearest anchor; fresh prefix collisions stay distinct/deterministic; owned clocks/text/lock remain authoritative
PASS: actual async reload/startup callers preserve all-deleted and empty owned timeline
```

Command: `node scripts/sentence_content_sanity.js`
Exit: 0
```text
PASS: independent Enhanced/grouping flags roll back display to Original, retaining originals, saved items and sidecar backup metadata; reenable rebuilds
[jpcap] Sentence projection rejected; keeping Original TypeError: Sentence projection requires unique cue IDs
    at Object.buildSentenceGroups (/Users/hoangson/Projects/YouTube JP Caption Studio/extension/shared/sentence_groups.js:130:75)
    at refreshSentenceProjection (evalmachine.<anonymous>:236:35)
    at evalmachine.<anonymous>:1:16
    at Script.runInContext (node:vm:150:12)
    at Object.runInContext (node:vm:302:6)
    at run (/Users/hoangson/Projects/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:58:30)
    at /Users/hoangson/Projects/YouTube JP Caption Studio/scripts/sentence_content_sanity.js:169:3
PASS: production mode/playhead/undo/video-reset/invalid-ID fallback; original state unchanged, fragment MT withheld
PASS: active display resolver and saved snapshot/provenance; shared sentence star, revision change keeps old snapshot
PASS: versioned sidecar adapter reload restores undo; changed source invalidates override (isolated storage adapter)
PASS: malformed/unavailable disposable sidecar preserves successful legacy cache load
PASS: same-track new navigation reads its own sidecar instead of reusing aborted session load
PASS: production JSON export payload preserves original clocks/text, raw track, metadata and saved provenance; browser delivery not covered
PASS: explicit restore/recovery preserves source clocks, locks, tombstones and other saved videos; wrong video/duplicate IDs rejected (isolated storage adapter)
```

Command: `node --check extension/content/content.js`
Exit: 0
```text
(no stdout/stderr)
```

Command: `git diff --check -- extension/content/content.js scripts/sentence_source_restore_sanity.js scripts/sentence_cache_identity_sanity.js scripts/sentence_content_sanity.js`
Exit: 0
```text
(no stdout/stderr)
```

## Independent final requirements

| Criterion | Expected and observed | Status |
|---|---|---|
| Save→worker→fresh VM loader→projection |36 checks preserve metadata, sourceRefs, split/identity/revision, translation and Undo|VERIFIED in adapter|
| Metadata boundary | Stale source/clock/span/unit/domain, invalid trackIndex/surrogate spans and owned mapping rejected; translation-only locks retain valid source |VERIFIED|
| Timeline | Number/string zero duration exact; Groups still invalid-timing;8 full loader unknown-end baseline comparisons equal |VERIFIED|
| Legacy segments | ID/ownership/target lock preserved; permanent140000 and own150000 rows have no spread ceiling |VERIFIED|
| Captured sources |512/512 metadata retained, complete Groups equality across5JSON3 files; no audio gold claim |VERIFIED structural|
| Primary schema | Raw mapping stays outside legacy serializer, present in sidecar |VERIFIED in adapter|
| Antigravity deployment | Candidate/backup/AST, PID/cwd/venv/argv/port, health200,44live+44backup set/hash/size/modes independently checked |VERIFIED|
| Main delivery |4 files and4 dependencies byte-equal; old backup/modes; reviewer main36/cache4/content8 plus syntax/scopedcheck all exit0 |VERIFIED|
| Native latest/Drive/old client/audio/Gemini/KPI/full release | No supporting runtime evidence in this slice |NOT VERIFIED|

Reviewer executed the same three permanent Node scripts separately in both worktree and main. Exit0 in each; actual stdout equals the parent main transcripts above (content fallback stack uses corresponding cwd). Reviewer separately ran `node --check extension/content/content.js` and scoped `git diff --check -- extension/content/content.js scripts/sentence_source_restore_sanity.js scripts/sentence_cache_identity_sanity.js scripts/sentence_content_sanity.js`, exit0 and empty stdout/stderr in main and worktree. Global house-style warning is the known immutable raw-plan line6 hard-break whitespace; no unexplained source whitespace error.

### Own extra Node runtime probe

Literal command executed by reviewer from worktree, exit0:

```sh
node - <<'JS'
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const Normalize=require('./extension/content/normalize_cues.js'),Parser=require('./extension/shared/timedtext_parse.js'),Groups=require('./extension/shared/sentence_groups.js');
function api(path){const s=fs.readFileSync(path,'utf8'),ctx=vm.createContext({Normalize});const slice=(a,b)=>s.slice(s.indexOf(a),s.indexOf(b));
 vm.runInContext(`let transcriptMeta={};const CACHE_MATCH_TOL=.6,detectCuesLanguage=()=> 'ja';${slice('  function compactSource(','  /** Shared namespace')}${slice('  function originalTokensMatch','  /** cues.json')}${slice('  function cueId(','  /** Ask the SW whether Drive')}`,ctx);
 return {ctx,run:code=>vm.runInContext(code,ctx)};}
const old=api('.tmp-sentence-mvp/source-restore-2026-10-11/content.before.js'),now=api('extension/content/content.js');
for(const start of [0,1.234])for(const end of [null,'',false,undefined]){
 const row={id:'a',source:'点。',start_media_time:start,end_media_time:end};old.ctx.row=now.ctx.row=row;
 const expression='cuesFromSavedScript(flattenCached([row]))[0].end_media_time';assert.equal(now.run(expression),old.run(expression));
}
console.log('PASS: eight full flatten-to-saved unknown-clock cases match baseline fallback');
for(const [start,end] of [[0,0],[0,'0'],[1.234,1.234],[1.234,'1.234']]){
 now.ctx.row={id:'a',source:'点。',start_media_time:start,end_media_time:end};const got=now.run('cuesFromSavedScript(flattenCached([row]))[0]');assert.equal(got.end_media_time,start);
 const groups=Groups.buildSentenceGroups([got]);assert(groups.diagnostics.some(d=>d.reason==='invalid-timing'));assert.equal(groups.displayUnits[0].end,groups.displayUnits[0].start);
}
console.log('PASS: numeric/string zero-duration clocks remain exact; Groups still diagnoses invalid enhancement timing');
const folder='data/subtitles/parako-sentence-mvp-2026-10-09';let total=0;
for(const file of fs.readdirSync(folder).filter(f=>f.endsWith('.timedtext.json3.json'))){
 const rows=Normalize.normalizeCues(Parser.parseJson3Cues(JSON.parse(fs.readFileSync(folder+'/'+file,'utf8')),{includeSource:true}),{includeSource:true});
 const cues=rows.map((n,i)=>({id:file+':'+i,source:n.text,start_media_time:n.start,end_media_time:n.end,text_source:'yt',rawSource:n.rawSource,normalization:n.normalization}));
 now.ctx.rows=cues;const restored=now.run('cuesFromSavedScript(flattenCached(rows))');
 assert(restored.every(c=>c.rawSource&&c.normalization));assert.deepEqual(Groups.buildSentenceGroups(restored),Groups.buildSentenceGroups(cues));total+=rows.length;
 console.log('PASS captured JSON3 unchanged full Groups projection',file,rows.length);
}
console.log('PASS: all',total,'captured source mappings retained; structural proof only, no audio/gold claim');
const n=Normalize.normalizeCues([{start:1,end:3,text:'😀晴れ[笑]雨'}],{includeSource:true})[0];
const mapped={id:'frozen',source:n.text,start_media_time:n.start,end_media_time:n.end,text_source:'yt',rawSource:n.rawSource,normalization:n.normalization};
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
now.ctx.row=freeze(mapped);const initial=JSON.stringify(mapped);assert(now.run('cuesFromSavedScript(flattenCached([row]))[0].rawSource'));assert.equal(JSON.stringify(mapped),initial);
console.log('PASS: frozen emoji/raw spans preserved without input mutation');
for(const mutate of [c=>c.rawSource.sourceDomain='unknown',c=>c.rawSource.trackIndex=-1,c=>c.normalization.spans[0].rawEnd--]){
 now.ctx.row=structuredClone(mapped);mutate(now.ctx.row);assert.equal(now.run('cuesFromSavedScript(flattenCached([row]))[0].rawSource'),undefined);
}
console.log('PASS: unknown domain, invalid trackIndex and surrogate-span corruption rejected');
JS
```

Actual stdout:

```text
PASS: eight full flatten-to-saved unknown-clock cases match baseline fallback
PASS: numeric/string zero-duration clocks remain exact; Groups still diagnoses invalid enhancement timing
PASS captured JSON3 unchanged full Groups projection CLs0YSeggXk.timedtext.json3.json 88
PASS captured JSON3 unchanged full Groups projection _aMBGfcwtGY.timedtext.json3.json 112
PASS captured JSON3 unchanged full Groups projection oLYBgoeslnk.timedtext.json3.json 116
PASS captured JSON3 unchanged full Groups projection rraWPrKKwRc.timedtext.json3.json 95
PASS captured JSON3 unchanged full Groups projection ylnxFdPhLCo.timedtext.json3.json 101
PASS: all 512 captured source mappings retained; structural proof only, no audio/gold claim
PASS: frozen emoji/raw spans preserved without input mutation
PASS: unknown domain, invalid trackIndex and surrogate-span corruption rejected
```

### Own deployed runtime/data audit

Literal reviewer command, exit0:

```sh
python3 - <<'PY'
import ast,ctypes,hashlib,json,stat,subprocess,urllib.request
from pathlib import Path
here=Path('.tmp-sentence-mvp/provenance-deploy-2026-10-11')
p=json.loads((here/'preflight.json').read_text());r=json.loads((here/'restart.json').read_text())
root=Path(r['cwd']).parent;source=root/'local-bridge/app/services/script_store.py';candidate=Path('.tmp-sentence-mvp/provenance-2026-10-11/candidate-bridge/app/services/script_store.py');backup=here/'script_store.before.py'
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert hashfile(source)==hashfile(candidate)==r['source_sha256']==p['candidate_sha256']=='8adeebf107de5a7e971d8599f345c2e85094f82472d329b1576945cfbc7f4d10'
assert hashfile(backup)==p['old_source_sha256']=='5551989dbaa841f73dee7cd9dde7946a9710fcb7fc84d281ee058279da066337'
assert all(stat.S_IMODE(x.stat().st_mode)==0o644 for x in [source,candidate,backup])
a,b=ast.parse(backup.read_text()),ast.parse(source.read_text());assert len(a.body)==len(b.body)
changed=[getattr(x,'name',type(x).__name__) for x,y in zip(a.body,b.body) if ast.dump(x)!=ast.dump(y)];assert set(changed)=={'_cue_content_sig','_cues_from_txt'}
print('PASS deployed source/candidate/old backup hashes and 0644 modes; AST only',changed)
expected=p['data_files'];actual={str(x) for base in [root/'data',root/'local-bridge/data'] if base.exists() for x in base.rglob('*') if x.is_file()};assert actual==expected.keys()
backups={str(x.relative_to(here/'data-before')) for x in (here/'data-before').rglob('*') if x.is_file()};assert backups=={str(Path(x).relative_to(root)) for x in expected}
for path,item in expected.items():
 for file in [Path(path),here/'data-before'/Path(path).relative_to(root)]:
  assert hashfile(file)==item['sha256'] and file.stat().st_size==item['bytes'] and oct(stat.S_IMODE(file.stat().st_mode))==item['mode'],str(file)
print('PASS live data file-set/hash/bytes/modes and backup file-set/hash/bytes/modes:',len(expected))
pid=r['new_pid'];listener=subprocess.check_output(['lsof','-t','-nP','-iTCP:8765','-sTCP:LISTEN'],text=True).strip();assert listener==str(pid)=='60231'
cwd=subprocess.check_output(['lsof','-a','-p',str(pid),'-d','cwd','-Fn'],text=True);assert 'n'+r['cwd'] in cwd
args=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True).strip();assert args==' '.join(r['argv']),args
assert p['argv']==r['argv'] and p['cwd']==r['cwd']
lib=ctypes.CDLL('/usr/lib/libproc.dylib');buf=ctypes.create_string_buffer(4096);assert lib.proc_pidpath(pid,buf,len(buf))>0
runtime=buf.value.decode();assert Path(runtime).resolve()==Path(r['argv'][0]).resolve(),(runtime,r['argv'][0])
print('PASS live PID60231 listener/cwd/venv resolved executable/argv matches recorded selected runtime')
with urllib.request.urlopen('http://127.0.0.1:8765/health',timeout=5) as response:
 assert response.status==200;health=json.load(response)
assert health['ready'] is True and health['models_loaded']['dict'] is True and health['models_loaded']['freq'] is True
print('GET /health actual HTTP200:',json.dumps({'ready':health['ready'],'models_loaded':health['models_loaded']},sort_keys=True))
PY
```

Actual stdout:

```text
PASS deployed source/candidate/old backup hashes and 0644 modes; AST only ['_cue_content_sig', '_cues_from_txt']
PASS live data file-set/hash/bytes/modes and backup file-set/hash/bytes/modes: 44
PASS live PID60231 listener/cwd/venv resolved executable/argv matches recorded selected runtime
GET /health actual HTTP200: {"models_loaded": {"dict": true, "freq": true, "mt": false, "ocr": false, "sudachi": true}, "ready": true}
```

Initial receipt had sudachi:false before tokenize warm-up. Later reviewer health above had sudachi:true; no substitution between snapshots.

Reviewer actual deployed-source isolated HTTP command:

```sh
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/provenance-deploy-2026-10-11/deployed-source-green.py
```

Exit0, actual stdout:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 62116, "secondPid": 62121, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

No required fix remains for reviewed slice. Existing live data preservation is verified at audit time, not a promise about future edits/Drive operations. Unsupported full completion claims remain prohibited.
