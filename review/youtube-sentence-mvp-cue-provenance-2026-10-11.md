<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: implement revised sentence MVP; preserve Antigravity runtime/data -->

# Cue provenance and exact TXT revision — bounded persistence review

STATUS: PASS for the current worktree code and isolated selected-runtime candidate; deployment and full MVP NOT VERIFIED.

The user selected Antigravity as data authority and explicitly authorized updating the two clock helpers and restarting that same bridge. Those changes are already deployed with all44 data files preserved. This follow-up prepares two additional helpers; it does not expand the live deployment grant. No source, process or data change was made to the selected Antigravity runtime in this slice.

## Request, flow and acceptance criteria

The [revised plan](../plan/youtube-sentence-enhancement-mvp-2026-10-10.md) requires storage round-trips to preserve original cue identity, revisions, ownership and locked translations. The actual flow inspected before editing was:

`saveTranscript → saveTranscriptToDisk → POST /scripts/save → ScriptSaveRequest/ScriptCueIn → save_script → cues.json/script.txt/meta.json/tokens.json → GET /scripts/{id} → load_script/_cues_from_txt → ScriptLoadResponse → flattenCached/loadCachedCues/cuesFromSavedScript → sentenceCueRevision and shared sentence projection`.

The existing file mirror also calls `read_files → load_script`; restored files pass through `write_files → load_script`. `_cue_content_sig` is the sole content-change comparator inside `load_script`.

REQUIREMENTS:

| Criterion | Expected | Actual / evidence |
|---|---|---|
| Unchanged generated TXT | Keep `text_source` for yt/edit/manual/script | VERIFIED in temp store, HTTP and independent checks |
| External TXT edits/new/legacy rows | Changed JA/EN/VI/start/end remains authoritative `script`; missing provenance stays `script` | VERIFIED; exact five-field tuple compares without rounding |
| Restart | Stable clocks, IDs, targets, locks, ownership and revision | VERIFIED actual HTTP, temporary disk and different process PIDs |
| Small external time edit | Advance revision once even below1ms | VERIFIED10µs and independently one-ULP start/end checks |
| Extension source identity | Production cue revision, group ID/revision/sourceRefs remain stable | VERIFIED composed real HTTP response → actual Node production functions |
| Enhanced cache and Undo | Existing synthetic sidecar translation still applies; locked target wins; blocked original still protected | VERIFIED actual shared projection over before/after HTTP cues |
| Validation boundary | Invalid end before start returns422 without disk mutation | VERIFIED actual HTTP response and temp disk comparison |
| Existing file mirror | Provenance survives separate synthetic folder | VERIFIED production read_files/write_files on temporary storage; real Drive NOT VERIFIED |
| Native Chrome/local sidecar storage | Installed extension reload, source metadata, cache and deleted rows round-trip | NOT VERIFIED by this slice |
| Antigravity preservation | Current source/process and all44 authoritative files stay unchanged while testing candidate | VERIFIED current runtime verifier |

## Root causes and minimal changes

`_cues_from_txt` always assigned `text_source: script`. A save of an `edit` cue therefore changed provenance on its first successful GET. An unchanged `yt` cue also became owned/protected. Both `sentenceCueRevision` and shared sentence group identity include provenance, so this could invalidate Undo/cache and prevent Enhanced merging after disk reload.

The fix preserves the previous provenance only when exact start/end/JA/EN/VI match the corresponding stored row. Changed or unknown TXT rows still become `script`. This leaves the established positional ID reuse and lock policy intact.

Independent review then reproduced a second defect: `_cue_content_sig` rounded clocks to3decimal places. TXT changing a start from1.234 to1.23401 updated the cue but left its Lamport revision unchanged. Removing only the two rounding wrappers makes exact timing edits visible to the existing comparator. There is no new schema, storage key or dependency.

Changed production file: [script_store.py](../local-bridge/app/services/script_store.py). Test files: [test_script_store.py](../local-bridge/tests/test_script_store.py), [HTTP/restart check](../scripts/sentence_script_store_sanity.py), [production projection check](../scripts/sentence_provenance_sanity.js). Existing assertions remain; new regression coverage is appended.

## Parent Red → Green commands and actual output

From the worktree root, after adding the provenance assertion and before the fix:

```sh
local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
```

Exit1, actual output:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
AssertionError: ('text_source', 'script', 'edit')
```

The current selected Antigravity source reproduced the same Red in an isolated route/store server, using its installed interpreter:

```sh
'/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python' .tmp-sentence-mvp/provenance-2026-10-11/selected-red.py
```

Exit1, actual output ended with the same `AssertionError: ('text_source', 'script', 'edit')`. This imported selected source but redirected all writes to temporary roots; it did not call live8765 script routes.

After appending the exact-time revision assertion while only the provenance fix was present:

```sh
local-bridge/.venv/bin/python local-bridge/tests/test_script_store.py
```

Exit1, actual output:

```text
AssertionError: Exact TXT time edits must advance revision
```

After the two-line exact-clock comparison fix, the same command exited0 and printed all eleven checks, ending:

```text
  [ok] test_read_files_keeps_existing_script_txt
  [ok] test_unchanged_txt_preserves_cue_provenance
[test_script_store] ok
```

Final composed worktree HTTP command:

```sh
local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
```

Exit0, actual stdout:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 55255, "secondPid": 55260, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

Candidate command with the selected Antigravity interpreter:

```sh
'/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python' .tmp-sentence-mvp/provenance-2026-10-11/candidate-green.py
```

Exit0, actual stdout has the same checks with fresh PIDs55256→55259 and exact edit revision3→4.

From `local-bridge/`, after the final source/test changes:

```sh
.venv/bin/python -m pytest -q tests/
```

Exit0, actual stdout ended:

```text
44 passed, 5 warnings in 2.14s
```

The five warnings are existing FastAPI/Starlette deprecation notices. No test was skipped or weakened to obtain this result. This count is the backend pytest suite result; it does not establish installed extension or live translation behavior.

The following also exited0 with actual behavioral PASS output:

```sh
node extension/shared/sentence_groups_test.js
node scripts/sentence_saved_state_sanity.js
```

The first printed12 projection/parser/token/ordinal checks. The second printed7 restore/write-queue/token/sender checks. Its Chrome storage and disk adapter are isolated fixtures; it does not establish native storage.

Scoped whitespace check command exited0, stdout/stderr empty:

```sh
git diff --check -- local-bridge/app/services/script_store.py local-bridge/tests/test_script_store.py scripts/sentence_script_store_sanity.py scripts/sentence_provenance_sanity.js
```

## API and storage checks

API_CHECKS: temporary random localhost ports, actual production script router/schema/store; POST save200; GET cue200/foundtrue; fresh server process GET200/equal; external TXT edit GET200/rev3→4; repeated GET200/stablerev4; invalid save422 and unchanged cues.json; missing GET200/foundfalse.

DATABASE_CHECKS: this route uses filesystem storage, not a database. Temporary cues.json and metadata were read and compared after save/read/restart/edit. No production database or subtitle file was used for mutation. Existing mirror file transport was tested between temporary directories; authenticated Drive upload/download was not exercised.

The Node composition executes the current production grouping/projection functions and current `sentenceCueRevision` function extracted into a VM. Assertions compare runtime results, not source-string presence. It does not run all browser persistence functions or native Chrome APIs.

## Selected-runtime candidate and boundary

The candidate copies31 selected Antigravity app Python files into ignored temporary evidence. Other30 files match their source bytes. Only `_cues_from_txt` and `_cue_content_sig` differ in script_store; selected import order and unrelated module content are retained. This follows the user's data-authority choice rather than copying all worktree bridge code into Antigravity.

Current selected source SHA256: `5551989dbaa841f73dee7cd9dde7946a9710fcb7fc84d281ee058279da066337`.

Final candidate SHA256: `8adeebf107de5a7e971d8599f345c2e85094f82472d329b1576945cfbc7f4d10`.

Worktree store SHA256: `e0d067a70253fe306b713f2f671c3a6060545f4788b875b76d2d9c428c8cead8`; it differs from candidate import placement because the earlier selected clock deployment retained its existing module layout.

Interim one-helper candidate `3807de1...` is superseded and is not the deploy target. Early candidate construction stopped on an import-order guard; failed dependent adapter invocations were logged and corrected. System python lacked FastAPI, so real checks used the installed venv. An initial integration fixture had no supported dangling continuation; it was replaced with the existing supported synthetic どこ/行くんですか? case while retaining the merge assertion.

PROBLEMS / REQUIRED_FIXES: live activation of these additional helpers remains pending the user's scope decision. Existing already-erased provenance is not reconstructed. Full native sidecar/raw-source/tombstone/JSON recovery, old-client mutation protection and real Drive round-trip remain NOT VERIFIED. Source17/rra05, audio gold, live Gemini, readiness/cost KPI and full MVP gates remain open. These bounded tests do not establish release readiness.


## Independent read-only review — final

STATUS: PASS for exactly the two additional helpers and the undeployed selected-runtime candidate. Reviewer /root/independent_audit read the original request, current revised plan, route/schema/store, extension callers, on-disk diff and regressions. No reviewer edit or live script request occurred.

The reviewer independently reproduced provenance Red and exact-clock revision Red. Its final actual HTTP cases verify unchanged metadata, changed JA/EN/VI, new/unknown rows, textual reorder with unchanged effective sorted timeline,10µs and one-ULP start/end changes, repeated stable revisions, and the composed production projection check. It independently verified31 candidate files, two-helper-only AST delta, final candidate hash, and44-test suite.

Independent selected-source Red command, exit1:

```sh
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/provenance-2026-10-11/selected-red.py
```

Actual output ended:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
AssertionError: ('text_source', 'script', 'edit')
```

Independent final candidate command, exit0:

```sh
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/provenance-2026-10-11/candidate-green.py
```

Actual stdout:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 55401, "secondPid": 55408, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

Independent backend suite command from local-bridge/, exit0:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q tests/
```

Actual terminal footer:

```text
44 passed, 5 warnings in 2.00s
```

The same command independently sampled the newly appended clock regression before its production fix, exit1:

```text
E       AssertionError: Exact TXT time edits must advance revision
E       assert 9 == (9 + 1)
tests/test_script_store.py:385: AssertionError
FAILED tests/test_script_store.py::test_unchanged_txt_preserves_cue_provenance
1 failed, 43 passed, 5 warnings in 2.48s
```

Independent exact-clock HTTP corner command, exit0:

```sh
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python - <<'PY'
import sys,json,socket,tempfile,threading,time,urllib.request,math
from pathlib import Path
sys.path.insert(0,'local-bridge')
from fastapi import FastAPI
import uvicorn
from app.api.scripts import router
from app.services import script_store as s
with tempfile.TemporaryDirectory(prefix='review-exact-revision-') as tmp:
 s.SCRIPTS_DIR=Path(tmp)/'subtitles';s._DEVICE_ID_PATH=Path(tmp)/'device';s._device_id='review'
 app=FastAPI();app.include_router(router);sock=socket.socket();sock.bind(('127.0.0.1',0))
 address='http://127.0.0.1:'+str(sock.getsockname()[1]);server=uvicorn.Server(uvicorn.Config(app,log_level='error'))
 thread=threading.Thread(target=server.run,kwargs={'sockets':[sock]});thread.start()
 try:
  deadline=time.monotonic()+5
  while not server.started:
   assert thread.is_alive() and time.monotonic()<deadline;time.sleep(.01)
  def req(path,body=None):
   r=urllib.request.Request(address+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
   with urllib.request.urlopen(r,timeout=5) as response:
    assert response.status==200;return json.load(response)
  row=dict(id='a',source='雨。',en='Rain.',vi='Mưa.',start_media_time=1.0131,end_media_time=4.0353,text_source='edit',mt_locked=True,translation_source='user')
  cases=[('start10us','start_media_time',1.01311),('end10us','end_media_time',4.03531),('startULP','start_media_time',math.nextafter(1.0131,math.inf)),('endULP','end_media_time',math.nextafter(4.0353,math.inf))]
  for label,field,value in cases:
   vid='review_'+label; saved=req('/scripts/save',{'video_id':vid,'rev':8,'owned':True,'cues':[row]})
   before=req('/scripts/'+vid);assert before['meta']['rev']==9 and before['cues'][0]['text_source']=='edit'
   (s.SCRIPTS_DIR/vid/'script.txt').write_text(s.render_script_txt([{**row,field:value}],video_id=vid))
   after=req('/scripts/'+vid);again=req('/scripts/'+vid)
   assert after['cues'][0][field]==value and after['cues'][0]['text_source']=='script'
   assert after['meta']['rev']==saved['rev']+1==10 and again==after,(label,after['meta'],again['meta'])
   assert after['cues'][0]['mt_locked'] and after['cues'][0]['translation_source']=='user'
   print('PASS actual HTTP200',label,'exact',repr(value),'revision9->10; repeated read stable; locks preserved')
 finally:
  server.should_exit=True;thread.join(5);assert not thread.is_alive();sock.close()
PY
```

Actual stdout:

```text
PASS actual HTTP200 start10us exact 1.01311 revision9->10; repeated read stable; locks preserved
PASS actual HTTP200 end10us exact 4.03531 revision9->10; repeated read stable; locks preserved
PASS actual HTTP200 startULP exact 1.0131000000000001 revision9->10; repeated read stable; locks preserved
PASS actual HTTP200 endULP exact 4.035300000000001 revision9->10; repeated read stable; locks preserved
```

Independent JA/target/new/legacy/reorder HTTP command, exit0. This was before the second clock comparator fix; its unchanged clock revision9 results are Red evidence closed by the exact-clock command above:

```sh
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python - <<'PY'
import sys,json,socket,tempfile,threading,time,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,'local-bridge')
from fastapi import FastAPI
import uvicorn
from app.api.scripts import router
from app.services import script_store as s
with tempfile.TemporaryDirectory(prefix='review-provenance-http-') as tmp:
 s.SCRIPTS_DIR=Path(tmp)/'subtitles'; s._DEVICE_ID_PATH=Path(tmp)/'device'; s._device_id='review'
 app=FastAPI(); app.include_router(router)
 sock=socket.socket(); sock.bind(('127.0.0.1',0)); address='http://127.0.0.1:'+str(sock.getsockname()[1])
 server=uvicorn.Server(uvicorn.Config(app,log_level='error')); thread=threading.Thread(target=server.run,kwargs={'sockets':[sock]}); thread.start()
 try:
  deadline=time.monotonic()+5
  while not server.started:
   assert thread.is_alive() and time.monotonic()<deadline; time.sleep(.01)
  def req(path,body=None):
   r=urllib.request.Request(address+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
   with urllib.request.urlopen(r,timeout=5) as response:
    assert response.status==200; return json.load(response)
  row=dict(id='a',source='雨。',en='Rain.',vi='Mưa.',start_media_time=1.0131,end_media_time=4.0353,text_source='edit',mt_locked=True,translation_source='user')
  rows=[row,{**row,'id':'b','source':'晴れ。','start_media_time':5.0123,'end_media_time':6.0234,'text_source':'yt'}]
  def seed(vid):
   req('/scripts/save',{'video_id':vid,'owned':True,'rev':8,'cues':rows})
   return s.SCRIPTS_DIR/vid/'script.txt'
  for name,field,value in [('ja','source','雪。'),('en','en','Snow.'),('vi','vi','Tuyết.'),('start','start_media_time',1.01311),('end','end_media_time',4.03531)]:
   vid='review_'+name; txt=seed(vid)
   txt.write_text(s.render_script_txt([{**row,field:value},rows[1]],video_id=vid))
   result=req('/scripts/'+vid); a,b=result['cues']
   assert a[field]==value and a['text_source']=='script' and b['text_source']=='yt'
   assert a['mt_locked'] and a['translation_source']=='user'
   print('PASS HTTP200 changed',name,'=> script; untouched yt/lock preserved; metaRev',result['meta']['rev'])
  txt=seed('review_new'); txt.write_text(s.render_script_txt([*rows,{**row,'id':'new','source':'新しい。','start_media_time':7,'end_media_time':8}],video_id='review_new'))
  got=req('/scripts/review_new')['cues']; assert [x['text_source'] for x in got]==['edit','yt','script']
  print('PASS HTTP200 appended row => script, previous provenance retained')
  txt=seed('review_reorder'); txt.write_text(s.render_script_txt(list(reversed(rows)),video_id='review_reorder'))
  got=req('/scripts/review_reorder')['cues']; assert [(x['id'],x['text_source']) for x in got]==[('a','edit'),('b','yt')]
  print('PASS HTTP200 textual reorder resolves same sorted cue identity/provenance')
  txt=seed('review_legacy'); cuespath=txt.with_name('cues.json'); raw=json.loads(cuespath.read_text()); del raw['cues'][0]['text_source']; cuespath.write_text(json.dumps(raw))
  got=req('/scripts/review_legacy')['cues']; assert [x['text_source'] for x in got]==['script','yt']
  print('PASS HTTP200 unknown legacy provenance => conservative script')
 finally:
  server.should_exit=True; thread.join(5); assert not thread.is_alive(); sock.close()
PY
```

Actual stdout:

```text
PASS HTTP200 changed ja => script; untouched yt/lock preserved; metaRev 10
PASS HTTP200 changed en => script; untouched yt/lock preserved; metaRev 10
PASS HTTP200 changed vi => script; untouched yt/lock preserved; metaRev 10
PASS HTTP200 changed start => script; untouched yt/lock preserved; metaRev 9
PASS HTTP200 changed end => script; untouched yt/lock preserved; metaRev 9
PASS HTTP200 appended row => script, previous provenance retained
PASS HTTP200 textual reorder resolves same sorted cue identity/provenance
PASS HTTP200 unknown legacy provenance => conservative script
```

Independent static scope/hash command, exit0:

```sh
python3 - <<'PY'
import ast,hashlib
from pathlib import Path
selected=Path('/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/app')
candidate=Path('.tmp-sentence-mvp/provenance-2026-10-11/candidate-bridge/app')
files=lambda root:{str(p.relative_to(root)):p for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
a,b=files(selected),files(candidate);assert a.keys()==b.keys()
changed=[k for k in a if a[k].read_bytes()!=b[k].read_bytes()];assert changed==['services/script_store.py'],changed
old,new=(ast.parse(p.read_text()) for p in (a[changed[0]],b[changed[0]]))
allowed={'_cue_content_sig','_cues_from_txt'}
def stripped(t):return ast.dump(ast.Module(body=[n for n in t.body if not isinstance(n,ast.FunctionDef) or n.name not in allowed],type_ignores=[]),include_attributes=False)
assert stripped(old)==stripped(new)
work=ast.parse(Path('local-bridge/app/services/script_store.py').read_text())
for name in allowed:
 fn=lambda t:next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name==name)
 assert ast.dump(fn(new))==ast.dump(fn(work)),name
print('PASS candidate/selected file sets:',len(a),'only changed:',changed)
print('PASS candidate AST delta only _cue_content_sig/_cues_from_txt; both exact worktree implementation')
for label,p in [('selected',a[changed[0]]),('candidate',b[changed[0]]),('worktree',Path('local-bridge/app/services/script_store.py'))]:print(label,hashlib.sha256(p.read_bytes()).hexdigest())
PY
 git diff --check -- local-bridge/app/services/script_store.py local-bridge/tests/test_script_store.py scripts/sentence_script_store_sanity.py scripts/sentence_provenance_sanity.js
```

Actual stdout:

```text
PASS candidate/selected file sets: 31 only changed: ['services/script_store.py']
PASS candidate AST delta only _cue_content_sig/_cues_from_txt; both exact worktree implementation
selected 5551989dbaa841f73dee7cd9dde7946a9710fcb7fc84d281ee058279da066337
candidate 8adeebf107de5a7e971d8599f345c2e85094f82472d329b1576945cfbc7f4d10
worktree e0d067a70253fe306b713f2f671c3a6060545f4788b875b76d2d9c428c8cead8
```

Scope/hash comparison is static evidence only; the commands above independently exercise runtime behavior. The whitespace portion emitted no output. Reviewer did not recheck realPID42809/all44 files; the parent current preservation verifier below provides that evidence. Historical raw plan trailing hard-break whitespace is retained.

## Parent current live preservation evidence

Command from worktree root, exit0:

```sh
python3 .tmp-sentence-mvp/antigravity-roundtrip-2026-10-11/verify_runtime_preservation.py
```

Actual stdout during this slice:

```text
PASS: current Antigravity PID 42809, same cwd/port; GET /health HTTP 200, ready true
PASS: deployed source matches reviewed candidate SHA256 5551989dbaa841f73dee7cd9dde7946a9710fcb7fc84d281ee058279da066337
PASS: all 44 data files/set/hash/size/modes unchanged and backups match; no script API writes
```

This is preservation evidence, not activation of the new two-helper candidate. Earlier historical text_source normalization caveats are superseded only for the new worktree/candidate; live selected source still exhibits the independently reproduced provenance defect until a separate authorized deployment.
