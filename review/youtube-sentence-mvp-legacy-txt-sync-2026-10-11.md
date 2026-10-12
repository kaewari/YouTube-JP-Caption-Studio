<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: thực hiện revised sentence MVP, giữ runtime/data Antigravity; sắp hết quota -->

# Sentence MVP — legacy JSON/TXT mirror reconciliation

STATUS: PASS for the independently reviewed, isolated one-file candidate. **NOT DEPLOYED. Full MVP and actual native/Swift/Drive compatibility: NOT VERIFIED.**

## Problem and resulting behavior

Old-client-shaped higher-revision JSON-only mirrors previously returned HTTP200, then canonical TXT loading restored the old Vietnamese target and raised revision6 to7. The shared `write_files` fix reconciles missing/unchanged TXT with the newer JSON through the existing renderer. Matching incoming TXT keeps its bytes. Pending manual local TXT and ambiguous incoming TXT return409 before writing. Malformed or unrepresentable cue timing/text returns400 without changing disk. Deliberate TXT-only edits retain existing canonical behavior.

The reviewer found an additional intermediate bug: primary end time0 could be masked by a legacy end4.789 alias. A narrow validation guard now rejects inconsistent aliases; the same actual HTTP probe changed from200/three mutated files to400/zero changed files. Both alias cases remain permanent regression checks.

## Scope and deployment checkpoint

- Worktree production edit: `local-bridge/app/services/script_store.py`, only incremental `write_files` behavior. Permanent actual HTTP regression coverage: `scripts/sentence_script_store_sanity.py`.
- Frozen selected-source candidate:31 app Python files; only store changed,30 unchanged. Final store SHA256: `57cef600fa3c9b7ea01d57c2a96755ec5b84d43c72e1e8014207f79570005b7c`.
- Intermediate `091ef4af…` candidate is superseded and must not be deployed.
- Previous authorized two-backend/one-worker package was already deployed. Last independent runtime checkpoint: PID15164, Antigravity store `a2e8b391…`, API `2bd1b394…`;48 current data files and48 backups exact at that deployment/audit. This review performs no new live data-preservation audit and no runtime/browser mutation.
- The new one-file updater is prepared under `.tmp-sentence-mvp/legacy-txt-sync-2026-10-11/deploy.py`, but was not executed. It checks the existing listener/source, backs up fresh current data and one source file, changes exactly the reviewed store, restarts the same bridge and checks health plus source/data bytes/modes.
- New runtime scope approval remains pending; no silent deployment under the earlier exact package grant.

## Evidence and limits

Parent and reviewer reproduced the defect with actual temporary HTTP servers and disk, then independently exercised the final worktree and selected candidate. Final backend pytest: `46 passed, 5 warnings in 2.39s`, exit0. Exact commands, raw HTTP/disk/restart results and exits are copied below from the independent report.

The new gate applies only to higher explicit revisions; missing/null revisions retain legacy behavior. Generated TXT may make an equal-revision replay of the original stale-TXT bundle conflict409. Existing known-field normalization, in-process locking and individual-file atomic writes remain; no whole-bundle crash transaction or arbitrary-field preservation claim. Local regenerated TXT does not itself repair real Drive. Actual native sidecar, Swift/Drive/old-client roundtrip,50 audio references, semantic source17/rra05, live Gemini cold/warm/readiness/cost/KPI and release remain open. Conditional ASR stays outside MVP.

Scoped diff checks passed. The global style hook still flags the original byte-preserved plan's Markdown hardbreak at line6; this document does not change that historical raw plan or claim a global clean diff.

Independent report bytes:32705; lines:370; SHA256 `d638f519e5a0c195ba92697eab0daa69605cea4a8dff45e5a4f539b8f4854c36`. The following copy is verbatim.

## Independent read-only review — exact output

```text
READ-ONLY INDEPENDENT REVIEW — LEGACY JSON/TXT MIRROR SYNC — 2026-10-11
Reviewer /root/independent_audit; workspace /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
Original requirement: execute revised sentence MVP, plan§7 storage/revision/user edit/source clock preservation. Scope: new, UNDEPLOYED one-file write_files reconciliation of higher explicit-version cue JSON and canonical TXT, not broader Swift/Drive rollout.

STATUS: PASS — final bounded production/candidate slice after reviewer-discovered alias-clock defect fixed and reverified.
New deployment/native/cloud/fullSTORE-02/fullMVP: NOT VERIFIED.

FLOW: worker mirror POST /scripts/{video_id}/files → existing scripts_files_post/ScriptFilesRequest → write_files validation+existing per-video lock → JSON/TXT content signatures → preserve matching incoming TXT, regenerate old/missing TXT with existing renderer, reject pending local/manual or ambiguous incoming TXT → atomic individual files → real GET load/export → canonical TXT parser/provenance/revision. Existing409 route reused, no API/schema/dependency change.

REQUIREMENTS
VERIFIED final scope:31 selected candidate app files, only store changed/other30 exact; only write_files AST changed, imports/top-level/other functions preserved, affected helper equal worktree. Final candidateSHA57cef600fa3c9b7ea01d57c2a96755ec5b84d43c72e1e8014207f79570005b7c. The earlier091... candidate is intermediate, not final.
VERIFIED real HTTP before Red: frozen pre-fix selected module accepts partial JSON mirror but subsequent load restores oldVI and bumps rev6→7; test exits1. Current worktree and selected candidate fix this in actual localhost HTTP/disk/load/export.
VERIFIED partial JSON-only, incoming stale old TXT, matching new TXT and empty delete-all: HTTP200, expected newVI/empty list retained on GET/export, revision6 stable, ownership/cue flags/clock fields equal, tokens.json bytes exact; matching incoming TXT bytes kept.
VERIFIED pending local/manual TXT and ambiguous incoming TXT: HTTP409/current_rev5 before any disk write; allfour files exact. Subsequent GET still honors pending manual TXT as intended (existing canonical semantics).
VERIFIED shape/type/finite/order/roundtrip validation: actual malformed cue array/object/clock/multiline cases400 and unchanged disk. This is cue/timing representability validation, not a newly added complete schema validator.
VERIFIED reviewer clock-alias finding closed: intermediate code accepted primary end_media_time0 with end4.789 alias, HTTP200 changed3files and GET4.789; own Red exit1. Final local guard rejects conflicting nonnull primary/legacy aliases before signature/renderer, actual HTTP400/changed0. Both end0/end4.789 and start0/start1.234 are permanent HTTP assertions; shared helper semantics unchanged.
VERIFIED intentional TXT-only+metadata path: own actual HTTP200, canonical load200 retains editedVI, precise1.234/4.789 and lock, existing revision increment6→7. No compatibility denial introduced for this path.
VERIFIED fresh positive-revision JSON-only import survives load; own fresh positive-revision full bundle with ambiguous TXT409 before folder creation.
VERIFIED regressions: final worktreeHTTP and selectedcandidateHTTP exit0, final fullpytest46passed/5warnings2.39s. Existing lower/equal conflicts, invalidrev, exact replay, worker realHTTP6→7remote7 and6→8remote7, fresh-process restart/provenance/group/sourceRefs/sidecar/Undo and422 nonmutation remain Green.
VERIFIED test quality (read): prior HTTP/restart/provenance assertions retained; distinct fixture variable legacy_loaded avoids overwriting original loaded snapshot; new alias negatives added without lowering expectations. Tests execute actual production router/store/disk/worker functions; Drive/auth/storage adapters remain fixture-only.
VERIFIED current incremental diff and scoped git diff--check0. Global hook immutable rawplan Markdown hardbreak unchanged.

LIMITS / NOT VERIFIED
- Gate only higher explicit revision. Missing/null revision retains old behavior. No complete legacy client guarantee.
- Fresh ambiguous full-bundle409 observation is for positive revision; no broad revision0 JSON/TXT confluence claim.
- JSON and TXT compare existing content signatures (including established whitespace normalization); this does not promise preservation of arbitrary extra JSON fields or custom formatting on canonical reload.
- Unchanged matching TXT can be kept; regenerated TXT uses existing renderer. Original stale-TXT raw bundle replay at same rev may409 because the reviewed byte-exact equal-revision guard intentionally remains.
- Existing load may normalize known cue fields; source clock/flags in the exercised production-shaped fixtures verified, no complete raw arbitrary-schema guarantee.
- Regenerated local TXT is not automatically repaired on real Drive by this slice; cloud copy remains old until normal push. Actual Swift/iPad/native/Drive auth/storage not executed.
- Per-video locks are in-process; accepted files individually atomic, not crash-atomic whole bundle.
- No current live backend/source/data preservation or native activation audit repeated here. Prior deployed a2... PID15164 is separate; new57... candidate UNDEPLOYED at review.
- No live script APIs, production data/process/browser actions.

API_CHECKS: random-port temporary servers only, production routes. Higher explicit JSON partial/stale/matching/empty POST200→load/export200 stable6; pending/ambiguous409 unchanged; invalid400 unchanged; own timing aliases400 unchanged; freshpositive ambiguous409 no directory; intentionalTXT-only200→canonicalGET200 revision7. Existing stale/equal409, malformed400, invalidclock422 and realworker error paths preserved.
DATABASE_CHECKS: actual disposable four-file bytes snapshots and tokens.json equality, precise clocks/provenance/locks/owned/rev across fresh child process. No SQL migration or live data write.

PROBLEMS / REQUIRED_FIXES: no remaining blocker for bounded final slice. Intermediate alias-clock defect reproduced by reviewer and closed by parent's narrow write_files guard, independently rerun. All broader compatibility/deployment limits remain open.

COMMANDS/EXACT RAW OUTPUT
Default cwd workspace above; pytest commands cwd workspace/local-bridge. Red exit1 is intended baseline/intermediate defect proof; final outputs below are independently executed. Repeated pre-fix successful suites omitted to keep report scoped; no full source dump included.

===== before_red =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/legacy-txt-sync-2026-10-11/before-check.py
EXIT:1
RAW OUTPUT:
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
{"staleMirrorHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical
{"sameRevisionCollisionHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: distinct two-device mirrors at revision6 return HTTP409 and keep protected local edit bytes exact
PASS: each divergent mirror file at equal rev conflicts409; exact partial replay200; new rev0 import/replay200; existing missing equal-rev file409 without mutation
PASS: six invalid mirror revisions HTTP400 preserve all four files; identical equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)
{"legacyMirror": "partial", "loadHTTP": 200, "loadedVI": ["Bạn đi đâu?"], "rev": 7}
Traceback (most recent call last):
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-mvp/legacy-txt-sync-2026-10-11/before-check.py", line 239, in <module>
    assert status == 200 and legacy_loaded['meta']['rev'] == 6, (kind, legacy_loaded)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: ('partial', {'ok': True, 'found': True, 'video_id': 'legacypartial', 'path': '/var/folders/qq/glcb3mjd06n382xq96gbcbdc0000gn/T/sentence-store-iy12woek/subtitles/legacypartial', 'cues': [{'id': 'source-a', 'start_media_time': 1.234, 'end_media_time': 4.789, 'source': 'どこ行くんですか?', 'en': '', 'vi': 'Bạn đi đâu?', 'translated': True, 'text_source': 'script', 'mt_locked': True, 'translation_source': 'user'}], 'meta': {'video_id': 'legacypartial', 'url': '', 'title': '', 'updated_at': '2026-10-11T19:00:01', 'cue_count': 1, 'translated_count': 1, 'owned': True, 'rev': 7, 'deviceId': 'pc-e864f428'}, 'cue_count': 1, 'translated_count': 1, 'message': ''})


===== own_alias_red =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python - <<'PY'
import json,select,subprocess,sys,tempfile,time,urllib.request,urllib.error
from pathlib import Path
with tempfile.TemporaryDirectory(prefix='review-legacy-alias-') as d:
 p=subprocess.Popen([sys.executable,'scripts/sentence_script_store_sanity.py','--serve',d],stdout=subprocess.PIPE,text=True)
 try:
  assert select.select([p.stdout],[],[],5)[0];address=p.stdout.readline().strip()
  def request(path,body=None):
   req=urllib.request.Request(address+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
   try:
    with urllib.request.urlopen(req,timeout=3) as r:return r.status,json.load(r)
   except urllib.error.HTTPError as e:return e.code,json.load(e)
  for _ in range(50):
   try:request('/scripts/unknown01');break
   except urllib.error.URLError:time.sleep(.01)
  cue={'id':'a','source':'質問?','start_media_time':1.234,'end_media_time':4.789,'vi':'old','en':'','text_source':'edit','mt_locked':True,'translation_source':'user'}
  assert request('/scripts/save',{'video_id':'alias01','cues':[cue],'owned':True,'rev':4})[0]==200
  folder=Path(d)/'subtitles/alias01';before={f.name:f.read_bytes() for f in folder.iterdir()}
  status,bundle=request('/scripts/alias01/files');assert status==200
  incoming=json.loads(bundle['files']['cues.json']);meta=json.loads(bundle['files']['meta.json']);meta['rev']=6;incoming['meta']=meta
  incoming['cues'][0].update({'end_media_time':0,'end':4.789,'vi':'new'})
  status,result=request('/scripts/alias01/files',{'files':{'cues.json':json.dumps(incoming),'meta.json':json.dumps(meta)}})
  changed=sum(f.read_bytes()!=before[f.name] for f in folder.iterdir())
  _,loaded=request('/scripts/alias01')
  print(json.dumps({'invalidPrimaryEnd':0,'secondaryEndAlias':4.789,'HTTP':status,'changedFiles':changed,'loadedPrimaryEnd':loaded['cues'][0]['end_media_time']}))
  assert status==400 and changed==0,'Explicit invalid primary clock must be refused, not masked by legacy alias'
 finally:
  p.terminate();assert p.wait(timeout=5)==0;p.stdout.close()
PY
EXIT:1
RAW OUTPUT:
{"invalidPrimaryEnd": 0, "secondaryEndAlias": 4.789, "HTTP": 200, "changedFiles": 3, "loadedPrimaryEnd": 4.789}
Traceback (most recent call last):
  File "<stdin>", line 25, in <module>
AssertionError: Explicit invalid primary clock must be refused, not masked by legacy alias


===== own_alias_green =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python .tmp-sentence-mvp/legacy-txt-sync-2026-10-11/review-alias-probe.py
EXIT:0
RAW OUTPUT:
{"invalidPrimaryEnd": 0, "secondaryEndAlias": 4.789, "HTTP": 400, "changedFiles": 0, "loadedPrimaryEnd": 4.789}


===== own_txt_compat =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python - <<'PY'
import json,select,subprocess,sys,tempfile,time,urllib.request,urllib.error
from pathlib import Path
with tempfile.TemporaryDirectory(prefix='review-legacy-alias-') as d:
 p=subprocess.Popen([sys.executable,'scripts/sentence_script_store_sanity.py','--serve',d],stdout=subprocess.PIPE,text=True)
 try:
  assert select.select([p.stdout],[],[],5)[0];address=p.stdout.readline().strip()
  def request(path,body=None):
   req=urllib.request.Request(address+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
   try:
    with urllib.request.urlopen(req,timeout=3) as r:return r.status,json.load(r)
   except urllib.error.HTTPError as e:return e.code,json.load(e)
  for _ in range(50):
   try:request('/scripts/unknown01');break
   except urllib.error.URLError:time.sleep(.01)
  cue={'id':'a','source':'質問?','start_media_time':1.234,'end_media_time':4.789,'vi':'old','en':'','text_source':'edit','mt_locked':True,'translation_source':'user'}
  assert request('/scripts/save',{'video_id':'alias01','cues':[cue],'owned':True,'rev':4})[0]==200
  folder=Path(d)/'subtitles/alias01';before={f.name:f.read_bytes() for f in folder.iterdir()}
  status,bundle=request('/scripts/alias01/files');assert status==200
  incoming=json.loads(bundle['files']['cues.json']);meta=json.loads(bundle['files']['meta.json']);meta['rev']=6;incoming['meta']=meta
  incoming['cues'][0].update({'end_media_time':0,'end':4.789,'vi':'new'})
  status,result=request('/scripts/alias01/files',{'files':{'cues.json':json.dumps(incoming),'meta.json':json.dumps(meta)}})
  changed=sum(f.read_bytes()!=before[f.name] for f in folder.iterdir())
  _,loaded=request('/scripts/alias01')
  print(json.dumps({'invalidPrimaryEnd':0,'secondaryEndAlias':4.789,'HTTP':status,'changedFiles':changed,'loadedPrimaryEnd':loaded['cues'][0]['end_media_time']}))
  assert status==400 and changed==0,'Explicit invalid primary clock must be refused, not masked by legacy alias'
  sys.path.insert(0,'local-bridge')
  from app.services import script_store
  new_txt=script_store.render_script_txt([{**cue,'vi':'intentional TXT edit'}],video_id='alias01')
  status,_=request('/scripts/alias01/files',{'files':{'meta.json':json.dumps({**meta,'rev':6}),'script.txt':new_txt}})
  assert status==200
  status,loaded=request('/scripts/alias01')
  assert status==200 and loaded['cues'][0]['vi']=='intentional TXT edit' and loaded['meta']['rev']==7
  assert loaded['cues'][0]['mt_locked'] and loaded['cues'][0]['start_media_time']==1.234 and loaded['cues'][0]['end_media_time']==4.789
  print('PASS: intentional TXT-only+metadata mirror HTTP200 remains canonical on load200, precise clocks/lock kept, existing revision increment to7')
  ambiguous={'cues.json':json.dumps({'cues':[cue],'meta':{'rev':6}}),'meta.json':json.dumps({'rev':6}),'script.txt':new_txt}
  status,result=request('/scripts/freshAmbiguous/files',{'files':ambiguous})
  assert status==409 and not (Path(d)/'subtitles/freshAmbiguous').exists(),(status,result)
  print('PASS: fresh positive-revision full bundle with ambiguous TXT conflictsHTTP409 before folder creation')
 finally:
  p.terminate();assert p.wait(timeout=5)==0;p.stdout.close()
PY
EXIT:0
RAW OUTPUT:
{"invalidPrimaryEnd": 0, "secondaryEndAlias": 4.789, "HTTP": 400, "changedFiles": 0, "loadedPrimaryEnd": 4.789}
PASS: intentional TXT-only+metadata mirror HTTP200 remains canonical on load200, precise clocks/lock kept, existing revision increment to7
PASS: fresh positive-revision full bundle with ambiguous TXT conflictsHTTP409 before folder creation


===== http_final =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
EXIT:0
RAW OUTPUT:
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
{"staleMirrorHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical
{"sameRevisionCollisionHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: distinct two-device mirrors at revision6 return HTTP409 and keep protected local edit bytes exact
PASS: each divergent mirror file at equal rev conflicts409; exact partial replay200; new rev0 import/replay200; existing missing equal-rev file409 without mutation
PASS: six invalid mirror revisions HTTP400 preserve all four files; identical equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)
{"legacyMirror": "partial", "loadHTTP": 200, "loadedVI": ["Bản mới từ client cũ"], "rev": 6}
{"legacyMirror": "stale-txt", "loadHTTP": 200, "loadedVI": ["Bản mới từ client cũ"], "rev": 6}
{"legacyMirror": "matching-txt", "loadHTTP": 200, "loadedVI": ["Bản mới từ client cũ"], "rev": 6}
{"legacyMirror": "empty", "loadHTTP": 200, "loadedVI": [], "rev": 6}
PASS: higher-revision JSON-only/stale-TXT/matching-TXT and delete-all mirrors survive real load/export without revision bump; pending local TXT and ambiguous incoming TXT conflict409 before any disk write
PASS: pending TXT edit still loads as intended; invalid JSON cue shapes/times/unrepresentable multiline input400 leave all files exact; fresh JSON-only mirror survives real load
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to7 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 17501, "secondPid": 17519, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit


===== candidate_final =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/legacy-txt-sync-2026-10-11/candidate-check.py
EXIT:0
RAW OUTPUT:
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
{"staleMirrorHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical
{"sameRevisionCollisionHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: distinct two-device mirrors at revision6 return HTTP409 and keep protected local edit bytes exact
PASS: each divergent mirror file at equal rev conflicts409; exact partial replay200; new rev0 import/replay200; existing missing equal-rev file409 without mutation
PASS: six invalid mirror revisions HTTP400 preserve all four files; identical equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)
{"legacyMirror": "partial", "loadHTTP": 200, "loadedVI": ["Bản mới từ client cũ"], "rev": 6}
{"legacyMirror": "stale-txt", "loadHTTP": 200, "loadedVI": ["Bản mới từ client cũ"], "rev": 6}
{"legacyMirror": "matching-txt", "loadHTTP": 200, "loadedVI": ["Bản mới từ client cũ"], "rev": 6}
{"legacyMirror": "empty", "loadHTTP": 200, "loadedVI": [], "rev": 6}
PASS: higher-revision JSON-only/stale-TXT/matching-TXT and delete-all mirrors survive real load/export without revision bump; pending local TXT and ambiguous incoming TXT conflict409 before any disk write
PASS: pending TXT edit still loads as intended; invalid JSON cue shapes/times/unrepresentable multiline input400 leave all files exact; fresh JSON-only mirror survives real load
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to7 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 17500, "secondPid": 17518, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit


===== pytest_final =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge
COMMAND:
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q -p no:cacheprovider tests/
EXIT:0
RAW OUTPUT:
..............................................                           [100%]
=============================== warnings summary ===============================
.venv/lib/python3.12/site-packages/fastapi/testclient.py:1
  /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge/.venv/lib/python3.12/site-packages/fastapi/testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
    from starlette.testclient import TestClient as TestClient  # noqa

app/main.py:45
  /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge/app/main.py:45: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    @app.on_event("startup")

.venv/lib/python3.12/site-packages/fastapi/applications.py:4745
.venv/lib/python3.12/site-packages/fastapi/applications.py:4745
  /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge/.venv/lib/python3.12/site-packages/fastapi/applications.py:4745: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    return self.router.on_event(event_type)  # ty: ignore[deprecated]

app/main.py:56
  /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge/app/main.py:56: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    @app.on_event("shutdown")

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
46 passed, 5 warnings in 2.39s


===== scope_final =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
python3 - <<'PY'
import ast,json,hashlib
from pathlib import Path
h=Path('.tmp-sentence-mvp/legacy-txt-sync-2026-10-11');root=Path('/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge')
m=json.loads((h/'candidate-manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert len(m)==31
assert {r for r,v in m.items() if v['base_sha256']!=v['candidate_sha256']}=={'app/services/script_store.py'}
for r,v in m.items():assert sha(root/r)==v['base_sha256'] and sha(h/'candidate'/r)==v['candidate_sha256']
r='app/services/script_store.py'
def nodes(p):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(p.read_text()).body if isinstance(n,(ast.FunctionDef,ast.ClassDef,ast.AsyncFunctionDef))}
old=nodes(root/r);new=nodes(h/'candidate'/r);work=nodes(Path('local-bridge')/r)
assert set(old)==set(new) and {k for k in old if old[k]!=new[k]}=={'write_files'}
assert new['write_files']==work['write_files']
trees=[ast.parse((base/r).read_text()) for base in (root,h/'candidate')]
for t in trees:t.body=[n for n in t.body if not isinstance(n,(ast.FunctionDef,ast.ClassDef,ast.AsyncFunctionDef))]
assert ast.dump(trees[0],include_attributes=False)==ast.dump(trees[1],include_attributes=False)
print('VERIFIED static scope:31 files, only write_files AST changes in store; other30 app files/top-level/import layout unchanged; affected candidate helper equals worktree')
print('Candidate store SHA256:',sha(h/'candidate'/r))
PY
EXIT:0
RAW OUTPUT:
VERIFIED static scope:31 files, only write_files AST changes in store; other30 app files/top-level/import layout unchanged; affected candidate helper equals worktree
Candidate store SHA256: 57cef600fa3c9b7ea01d57c2a96755ec5b84d43c72e1e8014207f79570005b7c


===== diff_final =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
diff -u .tmp-sentence-mvp/legacy-txt-sync-2026-10-11/script_store.before.py local-bridge/app/services/script_store.py
git diff --check -- local-bridge/app/services/script_store.py scripts/sentence_script_store_sanity.py
EXIT:0
RAW OUTPUT:
--- .tmp-sentence-mvp/legacy-txt-sync-2026-10-11/script_store.before.py	2026-10-11 18:29:57
+++ local-bridge/app/services/script_store.py	2026-10-11 18:58:30
@@ -715,6 +715,47 @@
                 path = folder / name
                 if not path.is_file() or path.read_bytes() != content.encode("utf-8"):
                     raise ScriptRevisionConflict(current_rev)
+        if incoming_rev is not None and incoming_rev > current_rev and "cues.json" in validated:
+            # Old clients push JSON only; unchanged TXT must not undo their newer edit.
+            incoming = json.loads(validated["cues.json"])
+            old = _read_json(folder / "cues.json")
+            if not isinstance(incoming, dict) or not isinstance(incoming.get("cues"), list):
+                raise ValueError("cues.json must contain a cues array")
+            cues = incoming["cues"]
+            if not all(isinstance(cue, dict) for cue in cues):
+                raise ValueError("cues.json cues must be objects")
+            try:
+                for cue in cues:
+                    for key in ("start_media_time", "end_media_time", "start", "end"):
+                        value = cue.get(key)
+                        if isinstance(value, bool) or (value is not None and not isinstance(value, (int, float, str))):
+                            raise ValueError("invalid cue timing type")
+                    for primary, alias in (("start_media_time", "start"), ("end_media_time", "end")):
+                        if cue.get(primary) is not None and cue.get(alias) is not None:
+                            if float(cue[primary]) != float(cue[alias]):
+                                raise ValueError("conflicting cue timing aliases")
+                new_sig = _cue_content_sig(cues)
+                old_sig = _cue_content_sig(old.get("cues", [])) if isinstance(old, dict) else []
+                if any(not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start
+                       for start, end, *_ in new_sig):
+                    raise ValueError("invalid cue timing")
+                txt_path = folder / "script.txt"
+                if txt_path.is_file() and _cue_content_sig(parse_script_txt(txt_path.read_text(encoding="utf-8"))) != old_sig:
+                    raise ScriptRevisionConflict(current_rev)
+                incoming_txt = validated.get("script.txt")
+                txt_sig = _cue_content_sig(parse_script_txt(incoming_txt)) if incoming_txt is not None else None
+                if txt_sig is not None and txt_sig != new_sig and txt_sig != old_sig:
+                    raise ScriptRevisionConflict(current_rev)
+                if txt_sig != new_sig:
+                    meta = json.loads(validated["meta.json"])
+                    validated["script.txt"] = render_script_txt(
+                        cues, video_id=vid, url=str(meta.get("url") or ""),
+                        title=str(meta.get("title") or ""), tokens=load_tokens(vid),
+                    )
+                    if _cue_content_sig(parse_script_txt(validated["script.txt"])) != new_sig:
+                        raise ValueError("cues.json cannot round-trip through script.txt")
+            except (TypeError, OverflowError) as exc:
+                raise ValueError("invalid cues.json content") from exc
         folder = video_dir(vid)
         for name, content in validated.items():
             _atomic_write_text(folder / name, content)


Reviewer wrote only this ignored report plus runnable ignored review-alias-probe.py evidence. Reviewed production/candidate source, raw plan/review, live process/data and browser were not modified by reviewer.

```
