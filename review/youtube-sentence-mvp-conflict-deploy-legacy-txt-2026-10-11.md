<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: approved reviewed two backend files and one worker, preserve data -->

# Conflict guard deployment and JSON-only legacy compatibility finding

STATUS: PASS for the exactly approved deployment and point-in-time data preservation; FAIL / CONTRADICTED for the separate JSON-only legacy-shaped roundtrip; full MVP NOT VERIFIED.

User approval: call_b737ef08a4f24a3880089438f38e79b0, “Cập nhật bản đã review, giữ dữ liệu”. This supersedes the candidate-not-deployed status in [equal-revision review](youtube-sentence-mvp-equal-revision-conflict-2026-10-11.md) only for its frozen two backend files and one worker. Historical raw documents remain unchanged.

Exactly app/services/script_store.py and app/api/scripts.py updated in the selected Antigravity checkout; restart PID8005→15164, same cwd/venv/argv/127.0.0.1:8765/workers1. Current31 app Python hashes match the frozen candidate,29 unchanged. Fresh48 data files and48 backups retained inventory/SHA256/bytes/modes at parent deployment and independent audit. No live script API reads or writes, rollback, migration or reconciliation. Health GET200 ready:true.

Main extension worker delivered SHA86291c4c1eca327c5c08b54b2f08207039b5cf841dbb96c0f39f3df042565ec6; original SHAcd7bf7cd1327a68a78ba7824c3781e14c51929a318b6c02d8d755257694abf22 backed up; mode0644 retained. Parent copy command checked85 other files in memory before/after, but did not save that per-file baseline. Thus the historical85 unchanged claim is NOT VERIFIED independently; current common79 worktree/main paths match. No claim that current equality proves historical equality.

Native Chrome observation showed an unrelated playing video in the Katou window. No Chrome click, navigation, reload or other mutation was performed this turn. Worker disk delivery does not establish native activation. No new quiet-window request was made.

COMMANDS — parent deployment, exit0:

```text
python3 .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/deploy.py
PASS: reviewed two-file hash guards, other 29 app Python files exact; fresh 48-file data backup bytes/modes verified
PASS: Antigravity graceful restart 8005->15164, same cwd/venv/127.0.0.1:8765/workers1; health HTTP200 ready true
PASS: exactly two approved backend files deployed; all 48 current data files and backups exact; zero script API writes
```

Full independent commands, output and limitations are embedded below. Deployment receipts, backups and exact frozen package reside in .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/. Previous behavior checks are reused; no repeat of the46-test suite solely for file delivery.

## Confirmed next storage defect

Flow: old-client-shaped cues.json/meta.json revision6 write → actual POST /scripts/{id}/files200 → disk newVI / oldTXT → actual GET /scripts/{id}200 → load_script → _load_script_locked prioritizes existing script.txt → disk and response oldVI, revision7. Data roots, device ID, logs and server are temporary; live8765 was untouched. This reproduces the transport/storage boundary, not actual Swift or Google Drive execution.

Static source inspection: both Swift DriveScriptsService push paths update cues.json/meta.json and do not update script.txt; pull prefers TXT and stamps IDs. Those observations identify a relevant caller shape, but cannot establish complete Swift/Drive behavior. No production fix for the newly discovered defect is included in the approved deployment.

Parent actual diagnostic command, exit0:

```text
local-bridge/.venv/bin/python .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/legacy-txt-probe.py
{"scope": "old-client-shaped HTTP payload; not Swift/Drive execution", "mirrorHTTP": 200, "loadHTTP": 200, "expectedVI": "Bản mới từ client cũ", "loadedVI": "Bản cũ", "diskVI": "Bản cũ", "revisionBefore": 6, "revisionAfter": 7, "compatibility": "CONTRADICTED"}
```

Diagnostic exit0 means the observation completed; compatibility is FAIL, not PASS. Independent reviewer reproduced the same result. This is not evidence of the cause of any earlier live data changes.

Required next work: protect JSON-only sync edits from old TXT while preserving intentional TXT edits, precise cue clocks, ownership/locks/tokens/source mapping, tombstones and legacy behavior. Trace existing read/write/export/worker/Swift call paths and reproduce the regression with a failing acceptance check before selecting the minimal shared fix. Do not replace this with a claim that explicit lower/equal revision guards cover all sync. Full STORE-01/STORE-02 remains incomplete, alongside native/Drive,50 audio references, real Gemini readiness/cost/KPI and release gates. ASR stays conditional outside MVP.

## Independent report (verbatim)

```text
READ-ONLY INDEPENDENT DEPLOYMENT AUDIT — 2026-10-11
Reviewer: /root/independent_audit
Workspace: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
Scope: NEW explicitly approved two selected Antigravity backend files plus one main extension worker; source/backup/mode/process/health/current data verification. No new behavior-suite rerun or deployment action by reviewer. Extra legacy JSON-only diagnostic executed solely on temporary roots/random-port server at parent's request.

STATUS
Approved backend/source/data/runtime and main worker target delivery: PASS (bounded).
Historical other85 extension files unchanged before/after: NOT VERIFIED independently.
Native Chrome worker activation: NOT VERIFIED.
Broader STORE compatibility: FAIL / CONTRADICTED in temporary JSON-only diagnostic; this is separate from correctness of approved lower/equal revision guard delivery.
Full STORE-02/MVP/native/Drive cloud/gold/KPI: NOT VERIFIED / not complete.

REQUIREMENTS
VERIFIED: actual listener PID15164 on8765, exact selected Antigravity cwd/argv/resolved venv, workers1; oldPID8005 historical preflight/restart agreement.
VERIFIED: actual31 app Python inventory/hash matches frozen candidate and restart receipt; exactly app/services/script_store.py and app/api/scripts.py change versus fresh preflight; other29 unchanged.
VERIFIED: exact two old source backups, previous hashes and mode0644 preserved; current two files mode0644.
VERIFIED: current48 data inventory/SHA256/bytes/modes equals fresh deployment-preflight; all48 backup files equal same baseline. Point-in-time only; no data contents/cue IDs/secrets printed.
VERIFIED: main worker SHA86291c4c1eca327c5c08b54b2f08207039b5cf841dbb96c0f39f3df042565ec6 equals frozen/worktree candidate. Old backupSHAcd7bf7cd1327a68a78ba7824c3781e14c51929a318b6c02d8d755257694abf22 and mode0644 exact; target67742B, old67610B inspected.
VERIFIED: current other85 main extension paths exist; common79 main/worktree paths match inventory/hash/bytes/modes; sixmain-only generated/.DS_Store paths and twowork-only tests explain main85/work81. This equality is current-state inspection.
NOT VERIFIED: receipt's historical other85 before/after unchanged. Parent confirmed no saved per-file85 preflight inventory. Count alone is insufficient, and worktree inventory differs. No baseline invented.
VERIFIED: own read-only GET http://127.0.0.1:8765/health HTTP200 ready:true.
NOT VERIFIED: actual loaded native Chrome worker bytes/behavior. Disk delivery and backend process/health do not establish Chrome activation; no browser actions performed.
Prior complete behavior evidence reused: equal-revision report .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/independent-review.txt SHA9ce13666e197d852baeb691d5d25da7c7a5d44ac5baef0c9c517a4a1ee8b6e82, actual HTTP/workers/disposable disk/46pytest/13standalone checks. Those tests were not rerun in this delivery-only scope.

API_CHECKS
LIVE GET /health→200 ready:true only. No live scripts GET/save/files/delete calls; no reviewer process control.
TEMP legacy diagnostic: actual POST /scripts/save initial rev4→5; GET files200; POST files with only cues.json+meta.json explicit higher rev6→200 persists newVI but leaves old script.txt; subsequent GET script200 rewrites newVI to oldVI and increments6→7.

DATABASE_CHECKS
Live48 files/48 backup files exact hashes/bytes/modes/set vs fresh preflight, read-only. No SQL migration or live script writes. Diagnostic server/store/device/log paths entirely temporary via existing --serve harness, randomized localhost listener, shutdown cleanup.

PROBLEMS / REQUIRED_FIXES
1. Historical other85 unchanged is an evidence limit, not a detected delivery mutation.
2. Broader legacy-shaped JSON-only roundtrip is confirmed CONTRADICTED: accepted higher-revision partial JSON bundle can lose its new target on canonical TXT load. The diagnostic exit0 means it completed and observed the defect; it does not mean compatibility passed. This is not actual Swift/Drive/client execution and does not attribute live user-data changes.
3. No production fix requested or applied in this scope for diagnostic. Existing lower/equal explicit-version guard remains correctly delivered; missing/legacy/incomplete canonical bundle compatibility remains a broader storage blocker.
4. Existing in-process locking, crash-atomic bundle, cloud/native/old-client limits remain open.

REVIEWER TOOL ERROR QUALIFICATION
First audit exited1 because reviewer assumed all85 other main files must equal worktree. Actual main85/work81 with generated/test path differences contradicted that comparison assumption; approved target/source/data checks had already passed. Corrected audit checks common79 equality and explicitly reports historical85 NOT VERIFIED; exits0. This was a reviewer metadata comparison error, not a production defect.
Global style hook continues to flag immutable rawplan line6 Markdown hardbreak; no rawplan changed.
Only this ignored report is written. No reviewed production/candidate/source, live data/process or raw plan/review file was modified by reviewer.

COMMANDS / ACTUAL RAW OUTPUT

===== First metadata audit (incorrect inventory assumption) =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
python3 - <<'PY'
import ctypes,hashlib,json,stat,subprocess,urllib.request
from pathlib import Path
h=Path('.tmp-sentence-mvp/mirror-equal-revision-2026-10-11')
b=json.loads((h/'deployment-preflight.json').read_text());r=json.loads((h/'deployment-restart.json').read_text());m=json.loads((h/'candidate-manifest.json').read_text());client=json.loads((h/'client-delivery.json').read_text())
cwd=Path(b['cwd']);root=cwd.parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pid=subprocess.check_output(['lsof','-t','-nP','-iTCP:8765','-sTCP:LISTEN'],text=True).strip()
assert pid==str(r['new_pid'])=='15164'
assert b['old_pid']==r['old_pid']==8005
assert b['argv']==r['argv'] and b['cwd']==r['cwd']
assert 'n'+str(cwd) in subprocess.check_output(['lsof','-a','-p',pid,'-d','cwd','-Fn'],text=True)
assert subprocess.check_output(['ps','-p',pid,'-o','command='],text=True).strip()==' '.join(r['argv'])
lib=ctypes.CDLL('/usr/lib/libproc.dylib');buf=ctypes.create_string_buffer(4096)
assert lib.proc_pidpath(int(pid),buf,len(buf))>0
assert Path(buf.value.decode()).resolve()==Path(r['argv'][0]).resolve()
print('PASS: actual listener PID15164, historical oldPID8005; cwd/argv/resolved venv exact; port8765/workers1')
actual={str(p.relative_to(cwd)):sha(p) for p in (cwd/'app').rglob('*.py')}
assert len(actual)==len(m)==31 and actual==r['source_after'] and set(actual)==set(b['source_before'])
changed={rel for rel in actual if actual[rel]!=b['source_before'][rel]}
assert changed=={'app/services/script_store.py','app/api/scripts.py'}==set(b['approved_manifest'])
for rel,v in m.items():
 assert b['source_before'][rel]==v['base_sha256']
 assert actual[rel]==v['candidate_sha256']==sha(h/'candidate'/rel)
back=h/'deployment-source-before'
assert {str(p.relative_to(back)) for p in back.rglob('*') if p.is_file()}==changed
for rel in changed:
 assert sha(back/rel)==b['source_before'][rel]
 assert stat.S_IMODE((cwd/rel).stat().st_mode)==stat.S_IMODE((back/rel).stat().st_mode)==0o644
print('PASS: all31 current app hashes/frozen candidate match; exactly2 approved changes/29 unchanged; exact2 old source backups/hash/mode0644')
def info(p):return {'sha256':sha(p),'bytes':p.stat().st_size,'mode':oct(p.stat().st_mode&0o777)}
now={str(p.relative_to(root)):info(p) for base in (root/'data',cwd/'data') if base.exists() for p in sorted(base.rglob('*')) if p.is_file()}
back=h/'deployment-data-before'
copies={str(p.relative_to(back)):info(p) for p in sorted(back.rglob('*')) if p.is_file()}
assert now==b['data_files']==copies and len(now)==len(copies)==48
print('PASS: current48 data and48 backups inventory/SHA256/bytes/modes exact versus fresh deployment preflight')
target=Path(client['path']);old=Path(client['backup']);frozen=h/'service_worker.candidate.js'
assert sha(target)==client['candidate_sha256']==sha(frozen)==sha(Path('extension/background/service_worker.js'))=='86291c4c1eca327c5c08b54b2f08207039b5cf841dbb96c0f39f3df042565ec6'
assert sha(old)==client['base_sha256']=='cd7bf7cd1327a68a78ba7824c3781e14c51929a318b6c02d8d755257694abf22'
assert oct(stat.S_IMODE(target.stat().st_mode))==oct(stat.S_IMODE(old.stat().st_mode))==client['mode']=='0o644'
main=target.parents[1];work=Path('extension')
other={str(p.relative_to(main)):info(p) for p in sorted(main.rglob('*')) if p.is_file() and p!=target}
work_other={str(p.relative_to(work)):info(p) for p in sorted(work.rglob('*')) if p.is_file() and str(p.relative_to(work))!='background/service_worker.js'}
assert other==work_other and len(other)==client['other_extension_files_verified']==85
print('PASS: main worker frozen/current/worktree SHA exact, old backup/baseSHA exact, bothmode0644; other85 main extension files match current worktree inventory/hash/bytes/modes')
print('Qualification: other85 current equality inspected; client receipt has no historical per-file85 inventory, so historical before/after unchanged is not independently established')
with urllib.request.urlopen('http://127.0.0.1:8765/health',timeout=5) as response:
 status=response.status;health=json.load(response)
assert status==200 and health['ready'] is True
print('HTTP GET /health:',status,'ready:',health['ready'])
print('Store SHA256:',actual['app/services/script_store.py'])
print('API SHA256:',actual['app/api/scripts.py'])
print('No live script API calls, data/source mutation, process control or browser actions. Native activation NOT VERIFIED; point-in-time deployment audit.')
PY
EXIT: 1
RAW OUTPUT:
PASS: actual listener PID15164, historical oldPID8005; cwd/argv/resolved venv exact; port8765/workers1
PASS: all31 current app hashes/frozen candidate match; exactly2 approved changes/29 unchanged; exact2 old source backups/hash/mode0644
PASS: current48 data and48 backups inventory/SHA256/bytes/modes exact versus fresh deployment preflight
Traceback (most recent call last):
  File "<stdin>", line 42, in <module>
AssertionError


===== Corrected bounded deployment audit =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
python3 - <<'PY'
import ctypes,hashlib,json,stat,subprocess,urllib.request
from pathlib import Path
h=Path('.tmp-sentence-mvp/mirror-equal-revision-2026-10-11')
b=json.loads((h/'deployment-preflight.json').read_text());r=json.loads((h/'deployment-restart.json').read_text());m=json.loads((h/'candidate-manifest.json').read_text());client=json.loads((h/'client-delivery.json').read_text())
cwd=Path(b['cwd']);root=cwd.parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pid=subprocess.check_output(['lsof','-t','-nP','-iTCP:8765','-sTCP:LISTEN'],text=True).strip()
assert pid==str(r['new_pid'])=='15164'
assert b['old_pid']==r['old_pid']==8005
assert b['argv']==r['argv'] and b['cwd']==r['cwd']
assert 'n'+str(cwd) in subprocess.check_output(['lsof','-a','-p',pid,'-d','cwd','-Fn'],text=True)
assert subprocess.check_output(['ps','-p',pid,'-o','command='],text=True).strip()==' '.join(r['argv'])
lib=ctypes.CDLL('/usr/lib/libproc.dylib');buf=ctypes.create_string_buffer(4096)
assert lib.proc_pidpath(int(pid),buf,len(buf))>0
assert Path(buf.value.decode()).resolve()==Path(r['argv'][0]).resolve()
print('PASS: actual listener PID15164, historical oldPID8005; cwd/argv/resolved venv exact; port8765/workers1')
actual={str(p.relative_to(cwd)):sha(p) for p in (cwd/'app').rglob('*.py')}
assert len(actual)==len(m)==31 and actual==r['source_after'] and set(actual)==set(b['source_before'])
changed={rel for rel in actual if actual[rel]!=b['source_before'][rel]}
assert changed=={'app/services/script_store.py','app/api/scripts.py'}==set(b['approved_manifest'])
for rel,v in m.items():
 assert b['source_before'][rel]==v['base_sha256']
 assert actual[rel]==v['candidate_sha256']==sha(h/'candidate'/rel)
back=h/'deployment-source-before'
assert {str(p.relative_to(back)) for p in back.rglob('*') if p.is_file()}==changed
for rel in changed:
 assert sha(back/rel)==b['source_before'][rel]
 assert stat.S_IMODE((cwd/rel).stat().st_mode)==stat.S_IMODE((back/rel).stat().st_mode)==0o644
print('PASS: all31 current app hashes/frozen candidate match; exactly2 approved changes/29 unchanged; exact2 old source backups/hash/mode0644')
def info(p):return {'sha256':sha(p),'bytes':p.stat().st_size,'mode':oct(p.stat().st_mode&0o777)}
now={str(p.relative_to(root)):info(p) for base in (root/'data',cwd/'data') if base.exists() for p in sorted(base.rglob('*')) if p.is_file()}
back=h/'deployment-data-before'
copies={str(p.relative_to(back)):info(p) for p in sorted(back.rglob('*')) if p.is_file()}
assert now==b['data_files']==copies and len(now)==len(copies)==48
print('PASS: current48 data and48 backups inventory/SHA256/bytes/modes exact versus fresh deployment preflight')
target=Path(client['path']);old=Path(client['backup']);frozen=h/'service_worker.candidate.js'
assert sha(target)==client['candidate_sha256']==sha(frozen)==sha(Path('extension/background/service_worker.js'))=='86291c4c1eca327c5c08b54b2f08207039b5cf841dbb96c0f39f3df042565ec6'
assert sha(old)==client['base_sha256']=='cd7bf7cd1327a68a78ba7824c3781e14c51929a318b6c02d8d755257694abf22'
assert oct(stat.S_IMODE(target.stat().st_mode))==oct(stat.S_IMODE(old.stat().st_mode))==client['mode']=='0o644'
main=target.parents[1];work=Path('extension')
other={str(p.relative_to(main)):info(p) for p in sorted(main.rglob('*')) if p.is_file() and p!=target}
work_other={str(p.relative_to(work)):info(p) for p in sorted(work.rglob('*')) if p.is_file() and str(p.relative_to(work))!='background/service_worker.js'}
assert len(other)==client['other_extension_files_verified']==85
common=set(other)&set(work_other)
assert len(common)==79
assert all(other[k]==work_other[k] for k in common)
print('PASS: main worker frozen/current/worktree SHA exact, old backup/baseSHA exact, bothmode0644')
print('VERIFIED current inventory: other85 main extension files;79 common paths equal worktree hash/bytes/modes;6main-only generated/.DS_Store and2work-only test paths')
print('NOT VERIFIED historical other85 before/after unchanged: receipt has count only, no saved85 preflight inventory')
with urllib.request.urlopen('http://127.0.0.1:8765/health',timeout=5) as response:
 status=response.status;health=json.load(response)
assert status==200 and health['ready'] is True
print('HTTP GET /health:',status,'ready:',health['ready'])
print('Store SHA256:',actual['app/services/script_store.py'])
print('API SHA256:',actual['app/api/scripts.py'])
print('No live script API calls, data/source mutation, process control or browser actions. Native activation NOT VERIFIED; point-in-time deployment audit.')
PY
EXIT: 0
RAW OUTPUT:
PASS: actual listener PID15164, historical oldPID8005; cwd/argv/resolved venv exact; port8765/workers1
PASS: all31 current app hashes/frozen candidate match; exactly2 approved changes/29 unchanged; exact2 old source backups/hash/mode0644
PASS: current48 data and48 backups inventory/SHA256/bytes/modes exact versus fresh deployment preflight
PASS: main worker frozen/current/worktree SHA exact, old backup/baseSHA exact, bothmode0644
VERIFIED current inventory: other85 main extension files;79 common paths equal worktree hash/bytes/modes;6main-only generated/.DS_Store and2work-only test paths
NOT VERIFIED historical other85 before/after unchanged: receipt has count only, no saved85 preflight inventory
HTTP GET /health: 200 ready: True
Store SHA256: a2e8b391ba7f7139e004b9964f0042e478c128258b5645a0258e9c9cffdb2b77
API SHA256: 2bd1b3946e6f63aa86ccb703b4c52feebb354bc921fad71b2033fd0f8552a2e9
No live script API calls, data/source mutation, process control or browser actions. Native activation NOT VERIFIED; point-in-time deployment audit.


===== Actual temporary HTTP legacy diagnostic =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/legacy-txt-probe.py
EXIT: 0
RAW OUTPUT:
{"scope": "old-client-shaped HTTP payload; not Swift/Drive execution", "mirrorHTTP": 200, "loadHTTP": 200, "expectedVI": "Bản mới từ client cũ", "loadedVI": "Bản cũ", "diskVI": "Bản cũ", "revisionBefore": 6, "revisionAfter": 7, "compatibility": "CONTRADICTED"}


```
