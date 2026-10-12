<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Cập nhật một file, khởi động lại, giữ dữ liệu -->

# Sentence MVP — authorized legacy JSON/TXT fix deployment

STATUS: PASS for the authorized one-file deployment and independent source/process/data audit. Full MVP: NOT VERIFIED and incomplete.

User reply `call_0032bd4a95d74b729ec67effc293ff98` explicitly authorized updating the reviewed one-file candidate, restarting the same Antigravity bridge and retaining current data. The candidate and its actual Red/Green/HTTP/46-test evidence are recorded in [the immutable behavior review](youtube-sentence-mvp-legacy-txt-sync-2026-10-11.md). Its NOT DEPLOYED snapshot is historical, superseded by this companion without rewriting that raw file.

## Result and exact parent deployment evidence

Only `local-bridge/app/services/script_store.py` was updated in the selected Antigravity runtime. Final SHA256: `57cef600fa3c9b7ea01d57c2a96755ec5b84d43c72e1e8014207f79570005b7c`. Other30 app Python files stayed identical to the fresh baseline. Source and original backup retain mode0644.

Exact command, workspace cwd:

```sh
python3 .tmp-sentence-mvp/legacy-txt-sync-2026-10-11/deploy.py
```

Actual stdout, exit0 (PTY session56117 completed):

```text
PASS: reviewed one-file hash guards, other 30 app Python files exact; fresh 48-file data backup bytes/modes verified
PASS: Antigravity graceful restart 15164->18180, same cwd/venv/127.0.0.1:8765/workers1; health HTTP200 ready true
PASS: exactly one approved backend file deployed; all 48 current data files and backups exact; zero script API writes
```

The updater froze fresh current data, verified backups before code replacement, gracefully restarted the same cwd/argv/venv/listener and compared inventory/SHA256/byte size/mode afterward. Independent audit independently enumerated and compared48 current files plus48 backups rather than trusting the parent assertion. Preservation is point-in-time evidence, not a perpetual guarantee. No live scripts API, rollback, migration or reconciliation was performed.

## Remaining scope

The exact tested candidate is now deployed; predeployment HTTP and46-test results are reused because all31 current app files match that candidate. No redundant full suite was run. A read-only Chrome observation found an unrelated current tab; no UI mutation/reload occurred and incidental content is omitted. Native extension activation/protected sidecar and real Swift/Drive roundtrip,50 audio-reference set, semantic source17/rra05, real Gemini cold/warm/readiness/cost/KPI and release remain open. The higher-explicit-revision and in-process/per-file atomic boundaries from the behavior review remain.

No whole-MVP completion claim. Full goal stays active. The global hook's unchanged byte-preserved raw-plan Markdown hardbreak remains separate from scoped diff hygiene.

## Independent deployment audit — verbatim

Report5503bytes/79lines; SHA256 `7c1087d028e80f42fd186d22c71909a1488cf3de9fbc9ce6722b407d31127837` checked by parent before copying. Literal commands, stdout and exits follow.

STATUS: PASS (bounded read-only deployment verification)

REQUIREMENTS:
- VERIFIED: live listener PID 18180 and exact selected Antigravity cwd/argv/resolved venv executable match fresh deployment receipt. Receipt old PID 15164 is historical; no process mutation was performed by reviewer.
- VERIFIED: all 31 current app Python files match frozen approved candidate and restart source inventory. Exactly app/services/script_store.py changed from fresh preflight; other 30 unchanged.
- VERIFIED: deployed store SHA256 57cef600fa3c9b7ea01d57c2a96755ec5b84d43c72e1e8014207f79570005b7c; old source backup SHA matches preflight a2e8b391ba7f7139e004b9964f0042e478c128258b5645a0258e9c9cffdb2b77. Current source and backup modes 0644.
- VERIFIED: independently enumerated current 48 data files and 48 backup files exactly match fresh deployment-preflight inventory, SHA256, byte sizes and modes. This is point-in-time preservation evidence, not a perpetual guarantee.
- VERIFIED: GET /health HTTP 200 and parsed ready=true.
- NOT VERIFIED: native browser activation, real Drive/Swift behavior, live script clock/legacy roundtrip, whole MVP completion. Already-reviewed disposable HTTP behavior was not rerun because all candidate source hashes match.

COMMANDS:
Working directory: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
Exact command:
```sh
python3 - <<'PY'
import ctypes,hashlib,json,stat,subprocess,urllib.request
from pathlib import Path
h=Path('.tmp-sentence-mvp/legacy-txt-sync-2026-10-11')
b=json.loads((h/'deployment-preflight.json').read_text())
r=json.loads((h/'deployment-restart.json').read_text())
m=json.loads((h/'candidate-manifest.json').read_text())
cwd=Path(b['cwd']);root=cwd.parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pid=subprocess.check_output(['lsof','-t','-nP','-iTCP:8765','-sTCP:LISTEN'],text=True).strip()
assert pid==str(r['new_pid'])=='18180'
assert b['old_pid']==r['old_pid']==15164
assert b['argv']==r['argv'] and b['cwd']==r['cwd']
assert 'n'+str(cwd) in subprocess.check_output(['lsof','-a','-p',pid,'-d','cwd','-Fn'],text=True)
assert subprocess.check_output(['ps','-p',pid,'-o','command='],text=True).strip()==' '.join(r['argv'])
lib=ctypes.CDLL('/usr/lib/libproc.dylib');buf=ctypes.create_string_buffer(4096)
assert lib.proc_pidpath(int(pid),buf,len(buf))>0
assert Path(buf.value.decode()).resolve()==Path(r['argv'][0]).resolve()
actual={str(p.relative_to(cwd)):sha(p) for p in (cwd/'app').rglob('*.py')}
assert len(actual)==len(m)==31 and actual==r['source_after'] and set(actual)==set(b['source_before'])
changed={rel for rel in actual if actual[rel]!=b['source_before'][rel]}
assert changed=={'app/services/script_store.py'}==set(b['approved_manifest'])
for rel,v in m.items():
 assert b['source_before'][rel]==v['base_sha256']
 assert actual[rel]==v['candidate_sha256']==sha(h/'candidate'/rel)
back=h/'deployment-source-before'
assert {str(p.relative_to(back)) for p in back.rglob('*') if p.is_file()}==changed
for rel in changed:
 assert sha(back/rel)==b['source_before'][rel]
 assert stat.S_IMODE((cwd/rel).stat().st_mode)==stat.S_IMODE((back/rel).stat().st_mode)==0o644
def info(p):return {'sha256':sha(p),'bytes':p.stat().st_size,'mode':oct(p.stat().st_mode&0o777)}
now={str(p.relative_to(root)):info(p) for base in (root/'data',cwd/'data') if base.exists() for p in sorted(base.rglob('*')) if p.is_file()}
back=h/'deployment-data-before'
copies={str(p.relative_to(back)):info(p) for p in sorted(back.rglob('*')) if p.is_file()}
assert now==b['data_files']==copies and len(now)==len(copies)==48
with urllib.request.urlopen('http://127.0.0.1:8765/health',timeout=5) as response:
 status=response.status;health=json.load(response)
assert status==200 and health['ready'] is True
print('PASS: listener PID 18180; receipt old PID 15164; exact cwd/argv/resolved venv executable')
print('PASS: 31 app Python files match frozen candidate; exactly 1 changed, 30 unchanged')
print('PASS: deployed store SHA256 '+actual['app/services/script_store.py']+'; old source backup exact; both modes 0644')
print('PASS: 48 current data files and 48 backups match fresh preflight inventory/SHA256/bytes/modes')
print('PASS: GET /health HTTP 200, ready=true; no live scripts APIs invoked')
PY
```
Exit code: 0
Actual stdout:
```text
PASS: listener PID 18180; receipt old PID 15164; exact cwd/argv/resolved venv executable
PASS: 31 app Python files match frozen candidate; exactly 1 changed, 30 unchanged
PASS: deployed store SHA256 57cef600fa3c9b7ea01d57c2a96755ec5b84d43c72e1e8014207f79570005b7c; old source backup exact; both modes 0644
PASS: 48 current data files and 48 backups match fresh preflight inventory/SHA256/bytes/modes
PASS: GET /health HTTP 200, ready=true; no live scripts APIs invoked
```

API_CHECKS:
GET http://127.0.0.1:8765/health: HTTP 200; parsed ready=true.
No live scripts GET/save/files/delete endpoints invoked.

DATABASE_CHECKS:
No database mutation or production data content inspection. Filesystem inventory/hash/size/mode comparison confirmed 48 current data files and 48 backups exactly equal the fresh preflight snapshot.

PROBLEMS / REQUIRED_FIXES:
No deployment blocker found within this approved one-file scope. No code, production data, process or browser changes performed by reviewer. Prior bounded behavior review remains separately recorded in independent-review.txt. This report does not establish native activation, cloud synchronization, crash/multiprocess transaction safety, or full MVP completion.

