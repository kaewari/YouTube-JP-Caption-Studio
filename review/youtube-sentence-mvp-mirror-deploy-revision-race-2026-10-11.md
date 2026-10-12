<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: update reviewed one-file mirror fix and restart, retain Antigravity data -->

# Approved mirror validation deployment and separate stale mirror race

The user approved the exact frozen one-file mirror-validation candidate from the prior review. That candidate is now deployed to the selected Antigravity checkout, retaining current runtime data authority. The newer stale mirror guard and worker error propagation remain separate worktree/candidate changes, not deployed by this approval. Full MVP remains active and NOT VERIFIED.

## Approved deployment

Selected checkout: `/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync`.

Only `local-bridge/app/services/script_store.py` changed from `bcfac7419082bf6e26919cf9f2d7f8acf0c5c7619040b6f343c57482c7e0e554` to reviewed `3396b405921b744a0f8d5ccd3da1e99a9f3db25c1e673abf6186e1bf0611fea3`. Only read_files/write_files/delete_script differ; prevalidation before any mirror writes and existing per-video lock around complete reads/writes/deletion. Other30app Python files unchanged. The API remains `b0b715704cdff35460979b2b9ccdd74bacd4247519aa397c37a3a859c2e915ff`.

Command, exit0:

```text
python3 .tmp-sentence-mvp/mirror-validation-2026-10-11/deploy.py
PASS: reviewed one-file hash guards, other 30 app Python files exact; fresh 48-file data backup bytes/modes verified
PASS: Antigravity graceful restart 95355->8005, same cwd/venv/127.0.0.1:8765/workers1; health HTTP200 ready true
PASS: exactly one approved backend file deployed; all 48 current data files and backups exact; zero script API writes
```

Evidence: `.tmp-sentence-mvp/mirror-validation-2026-10-11/deployment-preflight.json`, `deployment-restart.json`, `deployment-data-before/`, `deployment-source-before/`, `deployment-restarted.log`. All48current files and48fresh backups retain file-set, SHA256, bytes and modes at deployment/checkpoint. No live scripts GET/save/files/delete calls, data rollback, reconciliation, or migration. This is point-in-time preservation; later user activity can change data.

## New isolated race and minimal worktree fix

Flow: extension mirrorFromDrive remote metadata/read-local-metadata → cloud download window → POST `/scripts/{video_id}/files` → scripts_files_post → write_files → existing per-video lock → actual mirror files on disk → HTTP response → actual pullDriveIfNewer catch/status. Storage is file-based; tests use disposable directories and random-port production HTTP routes, not production subtitle data.

Before edits, actual HTTP accepted an old version5 bundle over protected local version6 and changed cues.json/meta.json/script.txt. Red command exit1:

```text
local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
```

Raw Red:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
{"staleMirrorHTTP": 200, "response": {"ok": true, "video_id": "fixture06", "path": "/var/folders/qq/glcb3mjd06n382xq96gbcbdc0000gn/T/sentence-store-dygzxpzw/subtitles/fixture06", "written": ["cues.json", "meta.json", "script.txt"]}, "changedFiles": ["cues.json", "script.txt", "meta.json"]}
Traceback (most recent call last):
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_script_store_sanity.py", line 131, in <module>
    assert status == 409 and old_rejected['detail']['current_rev'] == 6, (status, old_rejected)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: (200, {'ok': True, 'video_id': 'fixture06', 'path': '/var/folders/qq/glcb3mjd06n382xq96gbcbdc0000gn/T/sentence-store-dygzxpzw/subtitles/fixture06', 'written': ['cues.json', 'meta.json', 'script.txt']})
```

Shared write_files now validates an explicit nonnegative integer revision and compares it against current metadata under the existing write lock, before creating a folder or writing. A lower revision raises the existing ScriptRevisionConflict; the route returns existing stale_revision/current_rev HTTP409. No retry/revision adoption/new lock abstraction/dependency.

A second runtime Red found the actual production worker ignored nonOK mirror POST and pullDriveIfNewer reported oktrue/Connected despite actual bridge409. Red command exit1, raw output:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
{"staleMirrorHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical
{"result":{"ok":true,"restored":false,"pulled":[],"updatedAt":"","settings":""},"statuses":["Connected"],"restored":[],"storedMirrors":{"unrelated":94}}
Traceback (most recent call last):
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_script_store_sanity.py", line 151, in <module>
    assert mirror_check.returncode == 0, mirror_check.stderr
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: AssertionError [ERR_ASSERTION]: Rejected mirror must not report a successful pull

true !== false

    at /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_drive_mirror_sanity.js:52:10
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: true,
  expected: false,
  operator: 'strictEqual',
  diff: 'simple'
}

```

Shared mirrorFromDrive now throws the existing bridge POST error format on nonOK, allowing existing caller catch handlers to return okfalse/error and set error status. No main worker delivery or native Chrome activation in this turn. Test executes production mirrorFromDrive and pullDriveIfNewer in VM; cloud/Chrome adapters are isolated fixtures and bridge fetches are real HTTP. This is not Google Drive cloud or native UI proof.

Acceptance: stale5<6 HTTP409 with all4files exact; local6→8 during download of remote7 results409, preserves all4revision8 files/cache/notifications, and worker reports error; invalid metadata revisions rejected400 before writes; equal/higher integers allowed200; existing lock/provenance/timing/sidecar/legacy checks unchanged. Metadata omitted/null partial legacy writes remain allowed, without stale-write protection. Equal-revision different-content collisions remain allowed and need a dedicated runtime regression; no full STORE-02 guarantee.

Final worktree HTTP/worker command exit0, raw output:

```text
local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
{"staleMirrorHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical
PASS: six invalid mirror revisions HTTP400 preserve all four files; equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 8261, "secondPid": 8271, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

Parent full bridge command from local-bridge, exit0:

```text
.venv/bin/python -m pytest -q tests/
46 passed, 5 warnings in 2.40s
```

Warnings are existing FastAPI/Starlette deprecations; complete independently collected output below. Parent selected-candidate standalone test_script_store13checks exit0, including observed read/delete blocking and load/save conflict then revision7. Syntax and scoped git diff --check exit0/empty. Root global diff-check still reports the original byte-preserved plan's Markdown hard break at line6; the immutable source plan was not edited to hide it.

## Separate selected-source candidate

All31selected app Python files copied from live3396 source, then only write_files and scripts_files_post replaced by reviewed worktree implementations. Frozen manifest `.tmp-sentence-mvp/mirror-revision-2026-10-11/candidate-manifest.json`: store `62a844d735bc541e7a63b12ec56b4601458ae279475e2809bb4fdc3e3aa35d9b`; API `2bd1b3946e6f63aa86ccb703b4c52feebb354bc921fad71b2033fd0f8552a2e9`; other29 unchanged. Frozen worker and client hash manifest in same folder. Candidate NOT DEPLOYED and not included in current one-file approval.

Selected venv command exit0:

```text
'/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/mirror-revision-2026-10-11/selected-candidate-check.py
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
{"staleMirrorHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical
PASS: six invalid mirror revisions HTTP400 preserve all four files; equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 8597, "secondPid": 8599, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

The first copied selected harness failed resolving sibling sentence_provenance_sanity.js in the ignored directory (MODULE_NOT_FOUND); its path was corrected to the original production check, assertions unchanged, final run0. This harness failure is not a production Red. An initial read-only Swift source lookup used obsolete guessed directories, then resolved current Services/ paths. Both failures were logged; no Swift edits.

## Boundaries and next gates

Existing lock protects one Python process only, not external file editors/multiple processes. Per-file replacement is not a directory transaction through crash or disk failure. Three-file/partial legacy mirror and equal-revision differing content still need broader compatibility/conflict work; earlier mobile source inspection shows cues/meta pushes with pre-existing TXT preference, not verified old-client round-trip behavior. Multi-video partial pull failure is not an all-or-nothing batch guarantee. No native/Drive claim from cloud/storage callback fixtures.

User partial references remain recorded separately: source17 家族 starts the question after prior turn; rra05 stray な rejected, complete replacement/exact onset unspecified. No semantic cue-specific rule, deletion of Original or invented audio gold. Native protected persistence/sidecar, real Drive/old client, five-video50-segment audio reference, live Gemini cold/warm cost/readiness/KPI and full release remain open. Full goal active.

## Independent review

STATUS: PASS for both bounded scopes; full STORE-02/MVP NOT VERIFIED. Report41,314bytes/592lines, SHA256c68380545736d18cf88d2953490f437d7a2015c26f9e90730eed95dc46759f32. Read below as independently collected evidence, not future deployment authorization.

```text
READ-ONLY INDEPENDENT REVIEW — 2026-10-11
Reviewer: /root/independent_audit
Workspace: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
Original request: implement revised sentence MVP, including plan §7 storage compatibility/revision and preserving source/user edits/locks. The attached/raw plan is a requirement document, not execution evidence.
Scope A: verify approved one-file mirror-validation deployment/restart against its fresh preflight.
Scope B: review NEW worktree/selected-source candidate explicit stale mirror revision guard and worker honest error propagation. B is separate from already deployed A.

STATUS
A: PASS — bounded source delivery, live process/health, and point-in-time preservation audit.
B: PASS — bounded explicit lower-revision refusal + actual HTTP/worker failure propagation, disposable disk regression and candidate scope.
New B backend/worker deployment or native activation: NOT VERIFIED; current live base and main worker remain pre-B hashes.
Full STORE-02 / full sentence MVP / Drive cloud / old-client / native UI / gold/KPI: NOT VERIFIED.

REQUEST → ROUTE → STORE → DISK → RESPONSE
Raw mirror worker mirrorFromDrive fetch POST /scripts/{video_id}/files → scripts_files_post(ScriptFilesRequest) → write_files validates known JSON and explicit nonnegative int revision → existing per-video lock → reads current meta revision → ScriptRevisionConflict on incoming<current before folder creation/writes → API HTTP409 detail.error=stale_revision,current_rev. Accepted legacy/equal/higher writes retain existing FILE_NAMES contract and individually atomic file writes.
On HTTP failure, production mirrorFromDrive now throws before lastMirroredRev/pulled update; pullDriveIfNewer catches and returns ok:false, error and error: status. The changed worker branch reuses the existing error-reporting pattern.

REQUIREMENTS
VERIFIED A listener/process: PID8005 owns8765; exact selected Antigravity cwd/argv/resolved venv; historical oldPID95355 matches preflight/restart. Own read-only /health GET HTTP200 ready:true.
VERIFIED A source: all31 actual app Python files match approved frozen candidate; exactly app/services/script_store.py differs from preflight (30 others unchanged). Approved store3396b405921b744a0f8d5ccd3da1e99a9f3db25c1e673abf6186e1bf0611fea3. Oldstore backup hash matchesbcfac741... and live/backup mode0644.
VERIFIED A data: current48 inventory, SHA256, byte sizes and modes exactly equal fresh mirror-validation deployment-preflight; all48 backups exactly equal same baseline. No live script API read/write or process control was performed by reviewer. This is time-of-check evidence, not a promise against later user/runtime writes.
VERIFIED B stale full mirror: own baseline production module actually rolls back6→5 and changes3 files (Red exit1); current module refuses at current_rev6 and changes0 files (Green exit0).
VERIFIED B real HTTP: old mirror5 against local6 →409 current_rev6, four script files byte-identical. Six invalid explicit revisions (-1,true,6.5,"6",[],{}) →400/no disk changes. Equal/higher integer revisions →200; equal exact bundle remains byte-identical; missing metadata partial mirror →200 retained legacy compatibility.
VERIFIED B worker: real random-port bridge local6→8 during opaque fixture Drive download of remote7; actual production mirrorFromDrive/pullDriveIfNewer gets409/current_rev8, returnsok:false, status error:, no restore notification or lastMirroredRev update, and allfour temp files byte-identical. Cloud, Chrome storage, auth and notification adapters are test-only; actual HTTP/store/disk and executed worker helpers are real. This is not proof of the live Drive cloud or rendered native UI.
VERIFIED B compatibility/regressions: standalone store13 checks in worktree and selected candidate; exact clocks/provenance/locks/revisions/sidecar/group/sourceRefs/Undo composed through actual HTTP + fresh process; malformed laterJSON400 no mutation; invalid timing422 unchanged. Full worktree pytest46passed/5deprecation warnings.
VERIFIED B existing races: standalone held real atomic-write barriers show load/save, mirror/read and mirror/delete share lock; no mixed bundle or observer bypass.
VERIFIED B candidate scope:31 selected app files, exactly2 changed/29 unchanged; only write_files and scripts_files_post AST differ. Other functions/top-level/import layout preserved; affected helper AST matches worktree. Main worker still exact before snapshot, frozen worker candidate equals worktree; worker delta one non-ok error branch.
VERIFIED test integrity (inspection): new cases invoke real store/router/HTTP/worker; no new skip/only/no weakened assertion observed in this slice. Prior existing revision test migrated from stale acceptance to explicit rejection as intended older reviewed scope; not a pass obtained by deleting that behavior check.
VERIFIED scoped syntax/diffcheck: no output, exit0. Broad HEAD diff includes earlier reviewed changes; exact slice diff is against supplied before snapshots. Global hook continues to flag immutable raw plan line6 two-space Markdown hard break; reviewer did not alter it.
NOT VERIFIED full version-conflict policy: incoming rev<current only. Equal revision with different bytes remains allowed. Local6→7 concurrent with remote7 is not protected by this guard; no same-revision collision solution is claimed.
NOT VERIFIED compatibility paths that omit revision (meta absent, null, or legacy non-object) are outside explicit-version guarantee and can overwrite. No schema migration/content validator was added.
NOT VERIFIED multiworker/process safety/crash transaction: existing locks are in-process per-video; accepted bundle consists of individually atomic files, not a crash-atomic multi-file transaction.
NOT VERIFIED cross-folder all-or-nothing sync: a later folder error may follow an earlier committed folder; unchanged worker aggregate bookkeeping/notification semantics were not extended.
NOT VERIFIED real user script persistence via live8765, native Chrome reload, live Gemini, source quality/gold, and cause of historical12end clock changes. No such operations performed.

API_CHECKS
LIVE: GET http://127.0.0.1:8765/health →200 ready:true, metadata only.
TEMP worktree+selected candidate:
POST /scripts/save →200; GET /scripts/fixture01 →200 exact1.234/4.789, edit/user/owned/locked/rev3.
POST /scripts/fixture06/files older rev5→409 detail.current_rev6; changedFiles[].
POST /scripts/fixture06/files six invalid revs→400; same/higher→200; partial legacy→200.
Production worker POST /scripts/fixture07/files remote7 while local8→409; ok:false,error:status, unchanged fourfiles/bookkeeping/notifications.
POST malformed laterJSON mirror→400 changedFiles[]; valid three-file mirror GET/POST→200 exact.
Two equal requested revision script saves→one200/one409.
Fresh child restart load→200 equal response; exact TXT10us edit start1.23401 revision3→4 stable twice; invalid clock save→422 unchanged temp disk.

DATABASE_CHECKS
No SQL migration/write involved. Storage checks use real disposable filesystem byte comparisons for cues.json/tokens.json/meta.json/script.txt. Live48 data/backup inspection reads hashes/sizes/modes only. No live script content or cue IDs printed.

PROBLEMS / REQUIRED_FIXES
No blocking finding for these two bounded acceptance scopes.
Keep equal-revision/legacy/multiprocess/crash/cloud/native/fullSTORE-02 limitations explicit before broader completion.
Do not silently deploy B under prior A one-file approval; current hashes prove B remains separate.
Two reviewer static-scope attempts failed on an incorrect exact-string construction (first wrong indentation, then first-occurrence selection picked a different existing branch); final anchored static inspection passes. These were metadata inspection mistakes, not production runtime failures, and are preserved below.
Initial report-existence ls exit1 simply found no report before creation. Parent historical selected harness missing sibling Node path is not a production defect; current corrected harness was independently executed successfully.

COMMANDS / ACTUAL RAW OUTPUT
Commands below were executed by this reviewer. Working directory is workspace above except pytest, which ran from workspace/local-bridge. Async output chunks are concatenated in order; raw stdout/stderr kept, no results fabricated.

===== deployment =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
python3 - <<'PY'
import hashlib,json,subprocess,urllib.request,ctypes,stat
from pathlib import Path
h=Path('.tmp-sentence-mvp/mirror-validation-2026-10-11')
b=json.loads((h/'deployment-preflight.json').read_text());r=json.loads((h/'deployment-restart.json').read_text());m=json.loads((h/'candidate-manifest.json').read_text())
cwd=Path(b['cwd']);root=cwd.parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pid=subprocess.check_output(['lsof','-t','-nP','-iTCP:8765','-sTCP:LISTEN'],text=True).strip()
assert pid==str(r['new_pid'])=='8005';assert b['old_pid']==r['old_pid']==95355;assert b['argv']==r['argv'];assert b['cwd']==r['cwd']
assert 'n'+str(cwd) in subprocess.check_output(['lsof','-a','-p',pid,'-d','cwd','-Fn'],text=True)
assert subprocess.check_output(['ps','-p',pid,'-o','command='],text=True).strip()==' '.join(r['argv'])
lib=ctypes.CDLL('/usr/lib/libproc.dylib');buf=ctypes.create_string_buffer(4096);assert lib.proc_pidpath(int(pid),buf,len(buf))>0;assert Path(buf.value.decode()).resolve()==Path(r['argv'][0]).resolve()
actual={str(p.relative_to(cwd)):sha(p) for p in (cwd/'app').rglob('*.py')}
assert actual==r['source_after'];assert set(actual)==set(b['source_before'])
changed={k for k in actual if actual[k]!=b['source_before'][k]}
assert changed=={'app/services/script_store.py'}==set(b['approved_manifest'])
for rel,v in m.items():
 assert actual[rel]==v['candidate_sha256']==sha(h/'candidate'/rel)
 assert b['source_before'][rel]==v['base_sha256']
rel='app/services/script_store.py'
assert sha(h/'deployment-source-before'/rel)==b['source_before'][rel]
assert stat.S_IMODE((cwd/rel).stat().st_mode)==stat.S_IMODE((h/'deployment-source-before'/rel).stat().st_mode)==0o644
def info(p):return {'sha256':sha(p),'bytes':p.stat().st_size,'mode':oct(p.stat().st_mode&0o777)}
now={str(p.relative_to(root)):info(p) for base in [root/'data',cwd/'data'] if base.exists() for p in sorted(base.rglob('*')) if p.is_file()}
assert now==b['data_files'] and len(now)==48
back=h/'deployment-data-before'
copies={str(p.relative_to(back)):info(p) for p in sorted(back.rglob('*')) if p.is_file()}
assert copies==b['data_files'] and len(copies)==48
with urllib.request.urlopen('http://127.0.0.1:8765/health',timeout=5) as response:
 status=response.status;health=json.load(response)
assert status==200 and health['ready'] is True
print('PASS: live listener PID8005; cwd/argv/resolved venv exact; historical old PID95355')
print('PASS: all31 app source hashes match frozen approved candidate; exactly store changed, other30 unchanged; old store backup/hash/mode0644 exact')
print('PASS: current48 data inventory/hash/bytes/modes and all48 backup files exact against deployment preflight')
print('HTTP /health GET:',status,'ready:',health['ready'])
print('No script API reads/writes; no process control; point-in-time audit only')
PY
EXIT: 0
RAW OUTPUT:
PASS: live listener PID8005; cwd/argv/resolved venv exact; historical old PID95355
PASS: all31 app source hashes match frozen approved candidate; exactly store changed, other30 unchanged; old store backup/hash/mode0644 exact
PASS: current48 data inventory/hash/bytes/modes and all48 backup files exact against deployment preflight
HTTP /health GET: 200 ready: True
No script API reads/writes; no process control; point-in-time audit only


===== http =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
EXIT: 0
RAW OUTPUT:
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
{"staleMirrorHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical
PASS: six invalid mirror revisions HTTP400 preserve all four files; equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 8948, "secondPid": 8965, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit


===== pytest =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge
COMMAND:
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q -p no:cacheprovider tests/
EXIT: 0
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
46 passed, 5 warnings in 2.46s


===== candidate =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/mirror-revision-2026-10-11/selected-candidate-check.py
EXIT: 0
RAW OUTPUT:
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
{"staleMirrorHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical
PASS: six invalid mirror revisions HTTP400 preserve all four files; equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 8947, "secondPid": 8964, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit


===== scope =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
python3 - <<'PY'
import ast,hashlib,json
from pathlib import Path
h=Path('.tmp-sentence-mvp/mirror-revision-2026-10-11')
root=Path('/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge')
m=json.loads((h/'candidate-manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert len(m)==31
changed={r for r,v in m.items() if v['base_sha256']!=v['candidate_sha256']}
assert changed=={'app/services/script_store.py','app/api/scripts.py'}
for r,v in m.items():
 assert sha(root/r)==v['base_sha256']
 assert sha(h/'candidate'/r)==v['candidate_sha256']
def nodes(p):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(p.read_text()).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef))}
for r,allowed in [('app/services/script_store.py',{'write_files'}),('app/api/scripts.py',{'scripts_files_post'})]:
 old=nodes(root/r);new=nodes(h/'candidate'/r)
 assert set(old)==set(new)
 assert {k for k in old if old[k]!=new[k]}==allowed
 work=nodes(Path('local-bridge')/r)
 assert all(new[k]==work[k] for k in allowed)
 a=ast.parse((root/r).read_text());b=ast.parse((h/'candidate'/r).read_text())
 for t in (a,b):t.body=[n for n in t.body if not isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef))]
 assert ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False)
cm=json.loads((h/'client-manifest.json').read_text());worker=Path('extension/background/service_worker.js')
assert sha(Path(cm['path']))==cm['base_sha256']==sha(h/'service_worker.before.js')
assert sha(worker)==cm['candidate_sha256']==sha(h/'service_worker.candidate.js')
assert (h/'service_worker.before.js').read_text().replace('''      if (!res.ok) continue;''','''      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`bridge POST ${res.status}: ${errText.slice(0, 120)}`);
      }''',1)==worker.read_text()
print('VERIFIED static scope:31 candidate app files, exactly2 changed/29 unchanged; all live base hashes exact')
print('VERIFIED AST: only write_files and scripts_files_post changed; imports/top-level/other functions preserved; worktree helpers exact')
print('Candidate store SHA256:',sha(h/'candidate/app/services/script_store.py'))
print('Candidate API SHA256:',sha(h/'candidate/app/api/scripts.py'))
print('VERIFIED worker one error branch only; main still exact pre-change base, frozen worker equals worktree')
print('Worker SHA256:',sha(worker))
PY
EXIT: 1
RAW OUTPUT:
Traceback (most recent call last):
  File "<stdin>", line 25, in <module>
AssertionError


===== standalone =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python - <<'PY'
import runpy,sys
sys.path.insert(0,'local-bridge')
from app.services import script_store
script_store._device_id='review-isolated'
runpy.run_path('local-bridge/tests/test_script_store.py',run_name='__main__')
PY
EXIT: 0
RAW OUTPUT:
  [ok] test_script_txt_always_emits_ja_en_vi
  [ok] test_parse_empty_ja_en_vi_lines
  [ok] test_tokens_split_merge_roundtrip
  [ok] test_legacy_inline_tokens_migrate_on_read
  [ok] test_rev_monotonic_and_owned
  load/save race: early=None, writer results=[('conflict', 6), 7], disk rev=7
  [ok] test_load_and_save_share_revision_lock
  [ok] test_files_mirror_roundtrip
  mirror/read: observer blocked=True
  mirror/delete: observer blocked=True
  [ok] test_mirror_read_and_delete_share_video_lock
  [ok] test_load_prefers_script_txt_over_garbage_cues
  [ok] test_load_script_txt_rescues_inline_tokens
  [ok] test_save_sanitizes_non_finite_times
  [ok] test_read_files_keeps_existing_script_txt
  [ok] test_unchanged_txt_preserves_cue_provenance
[test_script_store] ok


===== candidate_unit =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' - <<'PY'
import runpy,sys
from pathlib import Path
h=Path('.tmp-sentence-mvp/mirror-revision-2026-10-11')
sys.path.insert(0,str(h/'candidate'))
from app.services import script_store
script_store._device_id='review-isolated'
runpy.run_path(str(h/'candidate/tests/test_script_store.py'),run_name='__main__')
PY
EXIT: 0
RAW OUTPUT:
  [ok] test_script_txt_always_emits_ja_en_vi
  [ok] test_parse_empty_ja_en_vi_lines
  [ok] test_tokens_split_merge_roundtrip
  [ok] test_legacy_inline_tokens_migrate_on_read
  [ok] test_rev_monotonic_and_owned
  load/save race: early=None, writer results=[('conflict', 6), 7], disk rev=7
  [ok] test_load_and_save_share_revision_lock
  [ok] test_files_mirror_roundtrip
  mirror/read: observer blocked=True
  mirror/delete: observer blocked=True
  [ok] test_mirror_read_and_delete_share_video_lock
  [ok] test_load_prefers_script_txt_over_garbage_cues
  [ok] test_load_script_txt_rescues_inline_tokens
  [ok] test_save_sanitizes_non_finite_times
  [ok] test_read_files_keeps_existing_script_txt
  [ok] test_unchanged_txt_preserves_cue_provenance
[test_script_store] ok


===== syntax_diff =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
node --check extension/background/service_worker.js
node --check scripts/sentence_drive_mirror_sanity.js
git diff --check -- local-bridge/app/services/script_store.py local-bridge/app/api/scripts.py extension/background/service_worker.js local-bridge/tests/test_script_store.py scripts/sentence_script_store_sanity.py scripts/sentence_drive_mirror_sanity.js
EXIT: 0
RAW OUTPUT:
(empty)

===== scope_corrected =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
python3 - <<'PY'
import ast,hashlib,json
from pathlib import Path
h=Path('.tmp-sentence-mvp/mirror-revision-2026-10-11')
root=Path('/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge')
m=json.loads((h/'candidate-manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert len(m)==31
changed={r for r,v in m.items() if v['base_sha256']!=v['candidate_sha256']}
assert changed=={'app/services/script_store.py','app/api/scripts.py'}
for r,v in m.items():
 assert sha(root/r)==v['base_sha256']
 assert sha(h/'candidate'/r)==v['candidate_sha256']
def nodes(p):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(p.read_text()).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef))}
for r,allowed in [('app/services/script_store.py',{'write_files'}),('app/api/scripts.py',{'scripts_files_post'})]:
 old=nodes(root/r);new=nodes(h/'candidate'/r)
 assert set(old)==set(new)
 assert {k for k in old if old[k]!=new[k]}==allowed
 work=nodes(Path('local-bridge')/r)
 assert all(new[k]==work[k] for k in allowed)
 a=ast.parse((root/r).read_text());b=ast.parse((h/'candidate'/r).read_text())
 for t in (a,b):t.body=[n for n in t.body if not isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef))]
 assert ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False)
cm=json.loads((h/'client-manifest.json').read_text());worker=Path('extension/background/service_worker.js')
assert sha(Path(cm['path']))==cm['base_sha256']==sha(h/'service_worker.before.js')
assert sha(worker)==cm['candidate_sha256']==sha(h/'service_worker.candidate.js')
assert (h/'service_worker.before.js').read_text().replace('''    if (!res.ok) continue;''','''    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`bridge POST ${res.status}: ${errText.slice(0, 120)}`);
    }''',1)==worker.read_text()
print('VERIFIED static scope:31 candidate app files, exactly2 changed/29 unchanged; all live base hashes exact')
print('VERIFIED AST: only write_files and scripts_files_post changed; imports/top-level/other functions preserved; worktree helpers exact')
print('Candidate store SHA256:',sha(h/'candidate/app/services/script_store.py'))
print('Candidate API SHA256:',sha(h/'candidate/app/api/scripts.py'))
print('VERIFIED worker one error branch only; main still exact pre-change base, frozen worker equals worktree')
print('Worker SHA256:',sha(worker))
PY
EXIT: 1
RAW OUTPUT:
Traceback (most recent call last):
  File "<stdin>", line 25, in <module>
AssertionError


===== own_red =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python - <<'PY'
import importlib.util,json,tempfile,sys
from pathlib import Path
sys.path.insert(0,'local-bridge')
baseline=True
path=Path('.tmp-sentence-mvp/mirror-revision-2026-10-11/script_store.before.py') if baseline else Path('local-bridge/app/services/script_store.py')
spec=importlib.util.spec_from_file_location('review_store',path);module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='review-mirror-rev-') as d:
 root=Path(d);module.SCRIPTS_DIR=root;module.scripts_root=lambda:root;module._device_id='review-isolated'
 cue={'id':'fixture-a','source':'質問?','start_media_time':1.0131,'end_media_time':4.0353,'vi':'old','en':'','text_source':'edit','mt_locked':True,'translation_source':'user'}
 module.save_script('fixtureA',[cue],owned=True,rev=4)
 bundle=module.read_files('fixtureA')
 module.save_script('fixtureA',[{**cue,'vi':'new'}],owned=True,rev=5)
 folder=root/'fixtureA';before={p.name:p.read_bytes() for p in folder.iterdir()}
 conflict=None
 try:module.write_files('fixtureA',bundle)
 except module.ScriptRevisionConflict as e:conflict=e.current_rev
 changed=sum(p.read_bytes()!=before[p.name] for p in folder.iterdir())
 print(json.dumps({'baseline':baseline,'conflictRevision':conflict,'changedFiles':changed,'currentRevision':json.loads((folder/'meta.json').read_text())['rev']}))
 assert conflict==6 and changed==0,'Stale mirror revision5 must be refused without disk mutation'
 if not baseline:
  for rev in (-1,True,6.5,'6',[],{}):
   try:module.write_files('fixtureA',{**bundle,'meta.json':json.dumps({'rev':rev})})
   except ValueError:pass
   else:raise AssertionError(('invalid accepted',rev))
   assert {p.name:p.read_bytes() for p in folder.iterdir()}==before
  current=module.read_files('fixtureA');module.write_files('fixtureA',current)
  assert {p.name:p.read_bytes() for p in folder.iterdir()}==before
  future={**current,'meta.json':json.dumps({**json.loads(current['meta.json']),'rev':7})}
  module.write_files('fixtureA',future)
  assert json.loads((folder/'meta.json').read_text())['rev']==7
  for bad in ('',None,{},'broken'):
   try:module.write_files('freshBad',{'meta.json':bad})
   except ValueError:pass
   else:raise AssertionError(('invalid new mirror accepted',bad))
   assert not (root/'freshBad').exists()
  assert module.write_files('legacyA',{'cues.json':current['cues.json']})['written']==['cues.json']
  print('PASS: production temp-store stale guard, six malformed revision types, exact equal and higher versions, invalid new mirrors no folder, omitted-meta legacy partial compatibility')
PY
EXIT: 1
RAW OUTPUT:
{"baseline": true, "conflictRevision": null, "changedFiles": 3, "currentRevision": 5}
Traceback (most recent call last):
  File "<stdin>", line 19, in <module>
AssertionError: Stale mirror revision5 must be refused without disk mutation


===== own_green =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python - <<'PY'
import importlib.util,json,tempfile,sys
from pathlib import Path
sys.path.insert(0,'local-bridge')
baseline=False
path=Path('.tmp-sentence-mvp/mirror-revision-2026-10-11/script_store.before.py') if baseline else Path('local-bridge/app/services/script_store.py')
spec=importlib.util.spec_from_file_location('review_store',path);module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='review-mirror-rev-') as d:
 root=Path(d);module.SCRIPTS_DIR=root;module.scripts_root=lambda:root;module._device_id='review-isolated'
 cue={'id':'fixture-a','source':'質問?','start_media_time':1.0131,'end_media_time':4.0353,'vi':'old','en':'','text_source':'edit','mt_locked':True,'translation_source':'user'}
 module.save_script('fixtureA',[cue],owned=True,rev=4)
 bundle=module.read_files('fixtureA')
 module.save_script('fixtureA',[{**cue,'vi':'new'}],owned=True,rev=5)
 folder=root/'fixtureA';before={p.name:p.read_bytes() for p in folder.iterdir()}
 conflict=None
 try:module.write_files('fixtureA',bundle)
 except module.ScriptRevisionConflict as e:conflict=e.current_rev
 changed=sum(p.read_bytes()!=before[p.name] for p in folder.iterdir())
 print(json.dumps({'baseline':baseline,'conflictRevision':conflict,'changedFiles':changed,'currentRevision':json.loads((folder/'meta.json').read_text())['rev']}))
 assert conflict==6 and changed==0,'Stale mirror revision5 must be refused without disk mutation'
 if not baseline:
  for rev in (-1,True,6.5,'6',[],{}):
   try:module.write_files('fixtureA',{**bundle,'meta.json':json.dumps({'rev':rev})})
   except ValueError:pass
   else:raise AssertionError(('invalid accepted',rev))
   assert {p.name:p.read_bytes() for p in folder.iterdir()}==before
  current=module.read_files('fixtureA');module.write_files('fixtureA',current)
  assert {p.name:p.read_bytes() for p in folder.iterdir()}==before
  future={**current,'meta.json':json.dumps({**json.loads(current['meta.json']),'rev':7})}
  module.write_files('fixtureA',future)
  assert json.loads((folder/'meta.json').read_text())['rev']==7
  for bad in ('',None,{},'broken'):
   try:module.write_files('freshBad',{'meta.json':bad})
   except ValueError:pass
   else:raise AssertionError(('invalid new mirror accepted',bad))
   assert not (root/'freshBad').exists()
  assert module.write_files('legacyA',{'cues.json':current['cues.json']})['written']==['cues.json']
  print('PASS: production temp-store stale guard, six malformed revision types, exact equal and higher versions, invalid new mirrors no folder, omitted-meta legacy partial compatibility')
PY
EXIT: 0
RAW OUTPUT:
{"baseline": false, "conflictRevision": 6, "changedFiles": 0, "currentRevision": 6}
PASS: production temp-store stale guard, six malformed revision types, exact equal and higher versions, invalid new mirrors no folder, omitted-meta legacy partial compatibility


===== scope_final =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
python3 - <<'PY'
import ast,hashlib,json
from pathlib import Path
h=Path('.tmp-sentence-mvp/mirror-revision-2026-10-11')
root=Path('/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge')
m=json.loads((h/'candidate-manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert len(m)==31
changed={r for r,v in m.items() if v['base_sha256']!=v['candidate_sha256']}
assert changed=={'app/services/script_store.py','app/api/scripts.py'}
for r,v in m.items():
 assert sha(root/r)==v['base_sha256']
 assert sha(h/'candidate'/r)==v['candidate_sha256']
def nodes(p):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(p.read_text()).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef))}
for r,allowed in [('app/services/script_store.py',{'write_files'}),('app/api/scripts.py',{'scripts_files_post'})]:
 old=nodes(root/r);new=nodes(h/'candidate'/r)
 assert set(old)==set(new)
 assert {k for k in old if old[k]!=new[k]}==allowed
 work=nodes(Path('local-bridge')/r)
 assert all(new[k]==work[k] for k in allowed)
 a=ast.parse((root/r).read_text());b=ast.parse((h/'candidate'/r).read_text())
 for t in (a,b):t.body=[n for n in t.body if not isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef))]
 assert ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False)
cm=json.loads((h/'client-manifest.json').read_text());worker=Path('extension/background/service_worker.js')
assert sha(Path(cm['path']))==cm['base_sha256']==sha(h/'service_worker.before.js')
assert sha(worker)==cm['candidate_sha256']==sha(h/'service_worker.candidate.js')
assert (h/'service_worker.before.js').read_text().replace('''    if (!res.ok) continue;
    // Disk now equals Drive''','''    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`bridge POST ${res.status}: ${errText.slice(0, 120)}`);
    }
    // Disk now equals Drive''',1)==worker.read_text()
print('VERIFIED static scope:31 candidate app files, exactly2 changed/29 unchanged; all live base hashes exact')
print('VERIFIED AST: only write_files and scripts_files_post changed; imports/top-level/other functions preserved; worktree helpers exact')
print('Candidate store SHA256:',sha(h/'candidate/app/services/script_store.py'))
print('Candidate API SHA256:',sha(h/'candidate/app/api/scripts.py'))
print('VERIFIED worker one error branch only; main still exact pre-change base, frozen worker equals worktree')
print('Worker SHA256:',sha(worker))
PY
EXIT: 0
RAW OUTPUT:
VERIFIED static scope:31 candidate app files, exactly2 changed/29 unchanged; all live base hashes exact
VERIFIED AST: only write_files and scripts_files_post changed; imports/top-level/other functions preserved; worktree helpers exact
Candidate store SHA256: 62a844d735bc541e7a63b12ec56b4601458ae279475e2809bb4fdc3e3aa35d9b
Candidate API SHA256: 2bd1b3946e6f63aa86ccb703b4c52feebb354bc921fad71b2033fd0f8552a2e9
VERIFIED worker one error branch only; main still exact pre-change base, frozen worker equals worktree
Worker SHA256: 86291c4c1eca327c5c08b54b2f08207039b5cf841dbb96c0f39f3df042565ec6


===== scoped production diff (exit1 means expected differences) =====
COMMAND:
git diff --stat -- local-bridge/app/services/script_store.py local-bridge/app/api/scripts.py extension/background/service_worker.js local-bridge/tests/test_script_store.py
 diff -u .tmp-sentence-mvp/mirror-revision-2026-10-11/script_store.before.py local-bridge/app/services/script_store.py
 diff -u .tmp-sentence-mvp/mirror-revision-2026-10-11/scripts.before.py local-bridge/app/api/scripts.py
 diff -u .tmp-sentence-mvp/mirror-revision-2026-10-11/service_worker.before.js extension/background/service_worker.js
EXIT:1
RAW OUTPUT:
 extension/background/service_worker.js    | 109 ++++++++++++++++++--
 local-bridge/app/api/scripts.py           |  11 ++
 local-bridge/app/services/script_store.py | 148 ++++++++++++++++-----------
 local-bridge/tests/test_script_store.py   | 162 +++++++++++++++++++++++++++++-
 4 files changed, 361 insertions(+), 69 deletions(-)
--- .tmp-sentence-mvp/mirror-revision-2026-10-11/script_store.before.py	2026-10-11 18:10:22
+++ local-bridge/app/services/script_store.py	2026-10-11 18:10:58
@@ -686,19 +686,28 @@
     """Drive → disk. JSON files are parsed first so a bad mirror cannot corrupt disk."""
     vid = _safe_video_id(video_id)
     validated: dict[str, str] = {}
+    incoming_rev: int | None = None
     for name in FILE_NAMES:
         content = files.get(name)
         if not isinstance(content, str) or not content.strip():
             continue
         if name.endswith(".json"):
             try:
-                json.loads(content)
+                parsed = json.loads(content)
             except ValueError as exc:
                 raise ValueError(f"{name} is not valid JSON: {exc}") from exc
+        if name == "meta.json" and isinstance(parsed, dict) and parsed.get("rev") is not None:
+            incoming_rev = parsed["rev"]
+            if type(incoming_rev) is not int or incoming_rev < 0:
+                raise ValueError("meta.json rev must be a non-negative integer")
         validated[name] = content
     if not validated:
         raise ValueError("no known files in payload")
     with _video_lock(vid):
+        previous = _read_json(scripts_root() / vid / "meta.json")
+        current_rev = int(previous.get("rev") or 0) if isinstance(previous, dict) else 0
+        if incoming_rev is not None and incoming_rev < current_rev:
+            raise ScriptRevisionConflict(current_rev)
         folder = video_dir(vid)
         for name, content in validated.items():
             _atomic_write_text(folder / name, content)
--- .tmp-sentence-mvp/mirror-revision-2026-10-11/scripts.before.py	2026-10-11 18:10:22
+++ local-bridge/app/api/scripts.py	2026-10-11 18:10:58
@@ -120,6 +120,11 @@
     """Drive → disk, straight file write (no lossy snapshot path)."""
     try:
         return write_files(video_id, body.files or {})
+    except ScriptRevisionConflict as exc:
+        append_errors_log("WARNING", f"scripts/files POST rejected stale revision: {exc}")
+        raise HTTPException(status_code=409, detail={
+            "error": "stale_revision", "current_rev": exc.current_rev,
+        }) from exc
     except ValueError as exc:
         append_errors_log("WARNING", f"scripts/files POST bad request: {exc}")
         raise HTTPException(status_code=400, detail=str(exc)) from exc
--- .tmp-sentence-mvp/mirror-revision-2026-10-11/service_worker.before.js	2026-10-10 02:54:20
+++ extension/background/service_worker.js	2026-10-11 18:17:24
@@ -1530,7 +1530,10 @@
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ files }),
     });
-    if (!res.ok) continue;
+    if (!res.ok) {
+      const errText = await res.text().catch(() => "");
+      throw new Error(`bridge POST ${res.status}: ${errText.slice(0, 120)}`);
+    }
     // Disk now equals Drive — do not bounce the same bytes straight back up.
     lastMirroredRev[folder.name] = remoteRev;
     pulled.push(folder.name);


REPORT ARTIFACT NOTE
Only this ignored reviewer report was written. Reviewed production/candidate code, live data/process, raw plan/review documents and Chrome were not modified by this reviewer.

```
