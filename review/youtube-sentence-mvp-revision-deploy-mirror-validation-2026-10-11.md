<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Implement filed sentence MVP; approve exact reviewed two-file Antigravity update/restart retaining data -->

# Sentence MVP: authorized revision-guard deployment and mirror validation

The explicit goal remains implementation of the complete filed MVP. This review records two bounded results; it does not close STORE-02 or the full goal.

## Requirements and backend flow

Request → FastAPI scripts_files_post/get/delete → write_files/read_files/delete_script → per-video caption files under the selected script root → actual HTTP JSON response. No database is involved in these routes. Existing Drive worker mirrorFromDrive checks remote metadata before downloading three files; mirrorToDrive reads the three-file bundle. All service/API callers were traced. This change preserves the existing three-file format and does not send enhancement sidecars to Drive.

Acceptance criteria: a malformed later known JSON file must reject the entire supplied payload before mkdir/write; read_files must observe one completed bundle; delete_script must serialize with saves and mirror writes; valid legacy same-ID mirrors retain exact content and precision/locks/ownership; invalid-ID reads retain None/404 behavior. Tests use disposable disk and loopback HTTP, never production script writes. Runtime deployment separately requires exact reviewed hashes, same selected cwd/venv/host/port/workers, health200/ready, and fresh whole-data inventory/hash/bytes/mode plus backup equality.

## Authorized Antigravity deployment — PASS

User explicitly approved the previous frozen two-file candidate and same runtime restart while retaining current Antigravity data. Deployed only app/services/script_store.py SHA256 bcfac7419082bf6e26919cf9f2d7f8acf0c5c7619040b6f343c57482c7e0e554 and app/api/scripts.py SHA256 b0b715704cdff35460979b2b9ccdd74bacd4247519aa397c37a3a859c2e915ff. The frozen manifest is unchanged. The new mirror fix below was excluded from this deployment.

Selected root: /Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync. Same local-bridge/.venv/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --workers 1. Process60231 →95355. Fresh preflight enumerated48 current data files rather than reusing historical44-file equality. All48 current files and48 backups retained exact set/bytes/SHA256/modes;29 other app Python files unchanged. No scripts GET/save/files/delete was called against production data; only health read. No rollback, reconciliation or migration.

Command: `python3 .tmp-sentence-mvp/revision-guard-2026-10-11/deploy.py`; exit0. Actual stdout:

```text
PASS: reviewed two-file hash guards, other 29 app Python files exact; fresh 48-file data backup bytes/modes verified
PASS: Antigravity graceful restart 60231->95355, same cwd/venv/127.0.0.1:8765/workers1; health HTTP200 ready true
PASS: exactly two approved backend files deployed; all 48 current data files and backups exact; zero script API writes
```

Receipt: .tmp-sentence-mvp/revision-guard-2026-10-11/deployment-preflight.json and deployment-restart.json; backups deployment-data-before and deployment-source-before. Independent reviewer repeated runtime/source/data/backup checks using this NEW preflight, including resolved venv and live HTTP200 ready.

## Mirror root causes and minimal fix

Before: write_files parsed and wrote each file in one loop. Malformed meta.json after valid cues.json returned400 after replacing cues.json. Before: mirror write and delete were outside the existing per-video lock; read_files released load_script's lock before constructing the complete mirror bundle. Readers could observe an incomplete write and a deletion could remove a directory while a writer was still filling it.

After: accepted JSON texts are all parsed into a small dict before any directory/file mutation. Existing whitelist, non-string/blank skip and partial legacy payload behavior remain. write_files writes the complete accepted bundle under the existing lock; read_files holds it while using existing _load_script_locked and reading/rendering the three files; delete_script uses the same lock. Invalid-ID reads preserve None. No new dependency, route, schema, global lock or Drive revision policy.

Changed production worktree file only local-bridge/app/services/script_store.py for this incremental fix; previous reviewed revision/API/client changes remain separate. Current worktree store SHA25650418a7613adbbbd8ada80bace0e6e14f10f3724d6d6880bb431a0d07a5e1bad. Permanent checks extended local-bridge/tests/test_script_store.py and scripts/sentence_script_store_sanity.py.

## Real Red → Green

Actual HTTP test command from repo root: `local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py`. Red exit1 before production fix; Green exit0 after. It starts production FastAPI scripts routes on a random loopback port, patches storage/log/device paths only to temporary directories, parses real responses, compares disk bytes and restarts a fresh child process.

Red output:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": ["cues.json"]}
Traceback (most recent call last):
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_script_store_sanity.py", line 108, in <module>
    assert not changed, f'Rejected mirror modified disk: {changed}'
           ^^^^^^^^^^^
AssertionError: Rejected mirror modified disk: ['cues.json']
```

Direct production/thread/disk race test before fix, temporary root and a barrier around the actual atomic writer. The barrier only delays writes and always invokes the production writer; no hardcoded success. Separate read and delete runs each exit1:

```text
  mirror/read: observer blocked=False
Traceback (most recent call last):
  File "<stdin>", line 10, in <module>
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge/tests/test_script_store.py", line 246, in test_mirror_read_and_delete_share_video_lock
    assert early is None, f"{action} bypassed in-progress mirror write"
           ^^^^^^^^^^^^^
AssertionError: read bypassed in-progress mirror write
  mirror/delete: observer blocked=False
Traceback (most recent call last):
  File "<stdin>", line 10, in <module>
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge/tests/test_script_store.py", line 246, in test_mirror_read_and_delete_share_video_lock
    assert early is None, f"{action} bypassed in-progress mirror write"
           ^^^^^^^^^^^^^
AssertionError: delete bypassed in-progress mirror write
```

Permanent race check now verifies readers/deleters block while the first file has physically been replaced, then exact complete new bundle or final absent directory. Standalone command `local-bridge/.venv/bin/python local-bridge/tests/test_script_store.py`; exit0,13 checks. Actual stdout:

```text
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
```

Final actual HTTP Green command above; exit0. Actual stdout:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 96494, "secondPid": 96495, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

Full applicable backend check from local-bridge cwd: `.venv/bin/python -m pytest -q tests/`; exit0, actual summary `46 passed, 5 warnings in 2.36s`. Warnings are existing FastAPI/Starlette deprecations. Build/startup/import verified by real production-route uvicorn child startup; no separate backend build exists. Scoped `git diff --check -- local-bridge/app/services/script_store.py local-bridge/tests/test_script_store.py scripts/sentence_script_store_sanity.py`; exit0, empty stdout/stderr. Actual diff inspected. Global hook continues reporting the original byte-preserved plan line6 Markdown hard-break whitespace; no unrelated raw-plan rewrite.

## Separate selected-source mirror candidate — NOT DEPLOYED

Frozen at .tmp-sentence-mvp/mirror-validation-2026-10-11/candidate/app/services/script_store.py SHA2563396b405921b744a0f8d5ccd3da1e99a9f3db25c1e673abf6186e1bf0611fea3. Selected deployed basebcfac741…; static AST scope comparison changes only read_files/write_files/delete_script, with30 other app Python files byte-identical. AST/hash comparison is scope evidence, not software verification.

Selected runtime's `.venv/bin/python3` executed candidate/tests/test_script_store.py (exit0,13 checks) and selected-candidate-check.py (exit0, actual HTTP400 no changedFiles, same-ID mirror200 exact, revision409, fresh-process restart, protected fields and projection). These are isolated candidate runs, not script API writes against live95355. Independent reviewer repeats both candidate checks.

## Limitations and required follow-up

PASS is bounded to deployment/preservation at this checkpoint and this mirror validation/thread serialization fix. Locks are within one process; external TXT editors and multiple workers do not participate. Individual atomic file replacements are not a crash-safe directory transaction; filesystem failures midway through a valid bundle can still leave partial state. Parse validation is JSON syntax validation, not a new schema migration/semantic validator. Existing partial payload support and stale raw-mirror/legacy missing-revision policy remain. Google Drive network uploads/downloads, old native clients, actual Chrome sidecar/deleted-marker persistence and native latest client activation are NOT VERIFIED.

Source17 and rra05 remain unresolved semantic probes; current source metadata contains no internal source17 boundary and rra05 has a speaker-change flag plus4.719s gap. New hidden IAB source video opened successfully but provides no new audio evidence. Temporary tab closed. Human clarification now confirms source17 question begins at 家族 after the prior turn and rejects the stray な in rra05. Exact replacement/time/speaker identity for rra05 remain unspecified. Recorded separately in data/subtitles/parako-sentence-mvp-2026-10-09/user-reference-observations-2026-10-11.json as two partial user-statement references, not a complete50 gold set. The previous merge target using な is not proven and must not be treated as gold; no algorithm guards removed, cue-specific branches, invented timestamps or synthetic gold. Full50 audio/creator annotations, live Gemini cold/warm readiness and cost, all release KPIs and full MVP remain open.

Harness issues: initial same-bundle comparison used different video ID, corrected to same-ID restore retaining exact assertions; one pytest invocation duplicated local-bridge path under local-bridge cwd (exit127), corrected; reviewer initial diff requested absent test backup (exit2), then inspected existing source backup; manifest inspection used current_sha256 instead of base_sha256 (KeyError), corrected. These were logged and are not production Red evidence. No assertions removed/skipped/weakened. No live new mirror deployment authorized by the previous exact-two-file grant.

## Independent read-only review — exact report

**DEPLOYMENT STATUS: PASS, có giới hạn.** Bản revision guard đã deploy đúng hai file được phê duyệt; runtime hiện tại làPID95355, cùng cwd/argv/venv/port, health200;48 file dữ liệu và48 backup khớp **preflight của deployment mới** tại thời điểm kiểm tra.

**MIRROR FIX STATUS: PASS cho worktree và candidate tạm.** Validation trước ghi, read/write/delete serialization và các regression hiện tại đã qua. Mirror fix **chưa deploy**, khác với frozen revision candidate đang chạy. FullSTORE-02, Drive cloud/old-client/native persistence và fullMVP vẫn **NOT VERIFIED**.

| REQUIREMENTS | Actual | Status |
|---|---|---|
| Revision deployment đúng phạm vi | Hai deployed hash bằng frozen manifest;29 app Python files khác nguyên trạng; source backups0644 đúng baseline | **VERIFIED** |
| Runtime giữ cấu hình đã chọn |95355 thay60231; cùng cwd/argv/resolved executable;127.0.0.1:8765/workers1; health200ready | **VERIFIED** |
| Dữ liệu current được giữ qua deployment mới | Current48 file inventory/hash/bytes/modes và48 backup bằng `deployment-preflight.json` | **VERIFIED tại observation time** |
| Malformed JSON ở file sau không partial-write | Actual HTTP400, `changedFiles:[]`; bốn file script cũ byte-identical | **VERIFIED** |
| Input rejected trên video chưa có dữ liệu | Không tạo folder với malformed/empty/unknown-only/blank-only payload | **VERIFIED** |
| Read bundle chờ writer hoàn tất | Thread barrier giữ writer sau `cues.json`; read blocked rồi trả đúng toàn bộ new bundle | **VERIFIED** |
| Delete dùng cùng lock | Delete blocked trong mirror write, sau release folder cuối không còn | **VERIFIED** |
| Hợp đồng cũ | Vẫn ba mirror files; invalid-ID read trảNone; same-video round-trip exact | **VERIFIED** |
| Clock/provenance/owned/locks | Precise clocks, owned target/lock/provenance được giữ trong store tạm, fresh process và production projection | **VERIFIED** |
| Candidate mirror đúng source đã review | Chỉ3 functions thay đổi;30 app files khác byte-equal live frozen revision source | **VERIFIED** |
| Native/Drive/old-client/revision policy của files endpoint | Không có bằng chứng hoặc chưa thuộc fix | **NOT VERIFIED** |

Tôi đã đọc plan storage/migration và trace route→service→files→response. Diff mirror cuối chỉ đổi `read_files`, `write_files`, `delete_script`: read dùng `_load_script_locked` bên trong whole-bundle lock; write validate toàn bộ accepted JSON trước mkdir/write rồi ghi dưới cùng lock; delete dùng cùng lock. Không thêm field hoặc đổi danh sách ba file mirror.

**COMMANDS — deployment audit độc lập**, từ worktree:

```bash
python3 - <<'PY'
import hashlib,json,subprocess,urllib.request,ctypes,stat
from pathlib import Path
h=Path('.tmp-sentence-mvp/revision-guard-2026-10-11');b=json.loads((h/'deployment-preflight.json').read_text());r=json.loads((h/'deployment-restart.json').read_text());m=json.loads((h/'candidate-manifest.json').read_text());cwd=Path(b['cwd']);root=cwd.parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pid=subprocess.check_output(['lsof','-t','-nP','-iTCP:8765','-sTCP:LISTEN'],text=True).strip();assert pid==str(r['new_pid'])=='95355' and b['old_pid']==r['old_pid']==60231;assert b['argv']==r['argv'];assert b['cwd']==r['cwd'];assert 'n'+str(cwd) in subprocess.check_output(['lsof','-a','-p',pid,'-d','cwd','-Fn'],text=True)
args=subprocess.check_output(['ps','-p',pid,'-o','command='],text=True).strip();assert args==' '.join(r['argv'])
lib=ctypes.CDLL('/usr/lib/libproc.dylib');buf=ctypes.create_string_buffer(4096);assert lib.proc_pidpath(int(pid),buf,len(buf))>0;assert Path(buf.value.decode()).resolve()==Path(r['argv'][0]).resolve()
actual={str(p.relative_to(cwd)):sha(p) for p in (cwd/'app').rglob('*.py')};assert actual==r['source_after'];assert set(actual)==set(b['source_before']);changed={k for k in actual if actual[k]!=b['source_before'][k]};assert changed==set(m)
for rel,entry in m.items():
 assert actual[rel]==entry['candidate_sha256']==sha(h/'candidate'/rel);assert b['source_before'][rel]==entry['current_sha256']==sha(h/'deployment-source-before'/rel);assert stat.S_IMODE((cwd/rel).stat().st_mode)==stat.S_IMODE((h/'deployment-source-before'/rel).stat().st_mode)==0o644
print('PASS PID95355 vs old60231; same cwd/argv/resolved venv executable/127.0.0.1:8765/workers1')
print('PASS approved2 deployed hashes/candidate/source backups0644; other29 app Python files unchanged')
for rel in sorted(m):print(rel+' '+actual[rel])
now={str(p.relative_to(root)):{'sha256':sha(p),'bytes':p.stat().st_size,'mode':oct(p.stat().st_mode&0o777)} for base in [root/'data',cwd/'data'] if base.exists() for p in sorted(base.rglob('*')) if p.is_file()};assert now==b['data_files'] and len(now)==48
backups={str(p.relative_to(h/'deployment-data-before')):{'sha256':sha(p),'bytes':p.stat().st_size,'mode':oct(p.stat().st_mode&0o777)} for p in (h/'deployment-data-before').rglob('*') if p.is_file()};assert backups==b['data_files'];print('PASS current48 data inventory/hash/bytes/modes and all48 backups exact fresh deployment preflight; no contents printed')
with urllib.request.urlopen('http://127.0.0.1:8765/health',timeout=5) as response:status=response.status;health=json.load(response)
assert status==200 and health['ready'] is True;print('GET /health HTTP'+str(status)+' '+json.dumps({'ready':health['ready'],'models_loaded':health.get('models_loaded')},sort_keys=True))
print('LIMIT only health API; no live scripts GET/save/files/delete; point-in-time preservation, not full native/runtime semantic proof')
PY
```

Exit code **0**, stdout:

```text
PASS PID95355 vs old60231; same cwd/argv/resolved venv executable/127.0.0.1:8765/workers1
PASS approved2 deployed hashes/candidate/source backups0644; other29 app Python files unchanged
app/api/scripts.py b0b715704cdff35460979b2b9ccdd74bacd4247519aa397c37a3a859c2e915ff
app/services/script_store.py bcfac7419082bf6e26919cf9f2d7f8acf0c5c7619040b6f343c57482c7e0e554
PASS current48 data inventory/hash/bytes/modes and all48 backups exact fresh deployment preflight; no contents printed
GET /health HTTP200 {"models_loaded": {"dict": true, "freq": true, "mt": false, "ocr": false, "sudachi": true}, "ready": true}
LIMIT only health API; no live scripts GET/save/files/delete; point-in-time preservation, not full native/runtime semantic proof
```

**COMMANDS — mirror HTTP worktree:**

```bash
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
```

Exit code **0**, stdout:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 96316, "secondPid": 96381, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

**COMMANDS — unit/integration regression**, cwd `local-bridge`:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python - <<'PY'
import runpy
from app.services import script_store
script_store._device_id='review-isolated'
runpy.run_path('tests/test_script_store.py',run_name='__main__')
PY
```

Exit code **0**, stdout:

```text
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
```

Sau micro-fix giữ invalid-IDNone, chạy lại full pytest:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python - <<'PY'
import pytest
from app.services import script_store
script_store._device_id='review-isolated'
raise SystemExit(pytest.main(['-q','-p','no:cacheprovider','tests/']))
PY
```

Exit code **0**, stdout result excerpt:

```text
..............................................                           [100%]
46 passed, 5 warnings in 2.39s
```

Năm warnings là Starlette/httpx và FastAPI `on_event` deprecations; không có failed/skipped test.

```bash
git diff --check -- local-bridge/app/services/script_store.py local-bridge/tests/test_script_store.py scripts/sentence_script_store_sanity.py
```

Exit code **0**, stdout/stderr trống.

**Own Red và edge Green**

Tôi chạy module production trước fix trên temp store, với `cues.json` hợp lệ nhưng `meta.json` malformed. **Exit1** thật:

```text
OLD rejected malformed later JSON; changed files: ['cues.json']
Traceback (most recent call last):
  File "<stdin>", line 12, in <module>
AssertionError: rejected mirror partially overwrote existing script
```

Own current Green command:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=local-bridge local-bridge/.venv/bin/python - <<'PY'
import tempfile,json,hashlib
from pathlib import Path
from app.services import script_store as s
with tempfile.TemporaryDirectory(prefix='review-mirror-green-') as directory:
 s.SCRIPTS_DIR=Path(directory);s._device_id='review-isolated'
 rows=[{'id':'one','source':'元','start_media_time':1.0131,'end_media_time':4.0353,'mt_locked':True,'vi':'đã khóa','text_source':'edit'}]
 s.save_script('fixture01',rows,owned=True,rev=4);folder=Path(directory)/'fixture01';before={p.name:p.read_bytes() for p in folder.iterdir()}
 for video in ['fixture01','newvideo01']:
  try:s.write_files(video,{'cues.json':json.dumps({'cues':[]}), 'meta.json':'{broken'})
  except ValueError:pass
  else:raise AssertionError('invalid mirror accepted')
 assert {p.name:p.read_bytes() for p in folder.iterdir()}==before;assert not (Path(directory)/'newvideo01').exists()
 print('PASS malformed later JSON: existing four files byte-identical; absent video creates no folder')
 for files in [{},{'unknown.json':'{}'},{'cues.json':'  '}]:
  try:s.write_files('newvideo01',files)
  except ValueError:pass
  else:raise AssertionError('empty/unknown-only mirror accepted')
 assert not (Path(directory)/'newvideo01').exists()
 assert s.read_files('../outside') is None
 print('PASS empty/unknown/blank-only inputs rejected without mkdir; invalid-ID read preserves None contract')
 bundle=s.read_files('fixture01');assert set(bundle)=={'cues.json','meta.json','script.txt'}
 assert s.write_files('fixture01',bundle)['written']==list(s.FILE_NAMES)
 assert s.read_files('fixture01')==bundle
 loaded=s.load_script('fixture01');assert loaded['meta']['owned'] is True and loaded['meta']['rev']==5
 for field in rows[0]:assert loaded['cues'][0][field]==rows[0][field]
 print('PASS same-video three-file mirror exactly round-trips; precise clocks/provenance/owned/locked target preserved')
print('CURRENT mirror source SHA256 '+hashlib.sha256(Path('local-bridge/app/services/script_store.py').read_bytes()).hexdigest())
PY
```

Exit code **0**:

```text
PASS malformed later JSON: existing four files byte-identical; absent video creates no folder
PASS empty/unknown/blank-only inputs rejected without mkdir; invalid-ID read preserves None contract
PASS same-video three-file mirror exactly round-trips; precise clocks/provenance/owned/locked target preserved
CURRENT mirror source SHA256 50418a7613adbbbd8ada80bace0e6e14f10f3724d6d6880bb431a0d07a5e1bad
```

**COMMANDS — selected mirror candidate, chưa deploy:**

```bash
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/mirror-validation-2026-10-11/selected-candidate-check.py
```

Exit code **0**, cùng HTTP400 `changedFiles:[]`, valid three-file HTTP200 exact round-trip và các clock/provenance/revision assertions phía trên. Fresh-process output:

```text
{"restartHTTP": 200, "firstPid": 98598, "secondPid": 98612, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
```

Candidate standalone:

```bash
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' - <<'PY'
import sys,runpy
from pathlib import Path
candidate=Path('.tmp-sentence-mvp/mirror-validation-2026-10-11/candidate').resolve();sys.path.insert(0,str(candidate))
from app.services import script_store
script_store._device_id='review-isolated'
runpy.run_path(str(candidate/'tests/test_script_store.py'),run_name='__main__')
PY
```

Exit code **0**,13 `[ok]` checks, `mirror/read` và `mirror/delete` đều `observer blocked=True`.

Candidate source/AST audit:

```bash
python3 - <<'PY'
import ast,hashlib,json
from pathlib import Path
h=Path('.tmp-sentence-mvp/mirror-validation-2026-10-11');c=h/'candidate';live=Path('/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge');m=json.loads((h/'candidate-manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();files=list((c/'app').rglob('*.py'))
assert {str(p.relative_to(c)) for p in files}==set(m)=={str(p.relative_to(live)) for p in (live/'app').rglob('*.py')}
for rel,v in m.items():assert sha(c/rel)==v['candidate_sha256'] and sha(live/rel)==v['base_sha256']
assert [rel for rel in m if m[rel]['candidate_sha256']!=m[rel]['base_sha256']]==['app/services/script_store.py']
dump=lambda n:ast.dump(n,include_attributes=False);old=ast.parse((live/'app/services/script_store.py').read_text());new=ast.parse((c/'app/services/script_store.py').read_text());maps=lambda t:{n.name:n for n in t.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))};a=maps(old);b=maps(new);expected={'read_files','write_files','delete_script'}
assert set(a)==set(b);assert {k for k in a if dump(a[k])!=dump(b[k])}==expected
assert [dump(n) for n in old.body if getattr(n,'name',None) not in expected]==[dump(n) for n in new.body if getattr(n,'name',None) not in expected]
w=maps(ast.parse(Path('local-bridge/app/services/script_store.py').read_text()));assert all(dump(b[k])==dump(w[k]) for k in expected)
print('PASS mirror candidate31 app files/manifest exact; only store differs; other30 byte-equal current deployed revision source')
print('PASS AST only read_files/write_files/delete_script; imports/all other AST unchanged; all3 equal reviewed worktree')
print('CANDIDATE store '+sha(c/'app/services/script_store.py'));print('LIVE frozen revision store '+sha(live/'app/services/script_store.py'))
PY
```

Exit code **0**:

```text
PASS mirror candidate31 app files/manifest exact; only store differs; other30 byte-equal current deployed revision source
PASS AST only read_files/write_files/delete_script; imports/all other AST unchanged; all3 equal reviewed worktree
CANDIDATE store 3396b405921b744a0f8d5ccd3da1e99a9f3db25c1e673abf6186e1bf0611fea3
LIVE frozen revision store bcfac7419082bf6e26919cf9f2d7f8acf0c5c7619040b6f343c57482c7e0e554
```

**API_CHECKS / DATABASE_CHECKS:** live chỉ GET `/health`; không gọi live scripts GET/save/files/delete. Các scripts API200/400/409/422 và restart tests đều dùng random-port child servers/temp store/device/log. Data preservation là point-in-time hash/mode/inventory của48 file, không phải guarantee trước mọi hoạt động user sau đó.

**PROBLEMS / LIMITS:** không blocker trong phạm vi này. Files endpoint vẫn **không có revision policy**, validation JSON là syntax validation theo hợp đồng hiện hữu; single-process lock không chống multiple workers/external writers. Multi-file replacement không phải crash-safe transaction. Ba-file mirror contract chưa chứng minh Drive cloud, old-client end-to-end hoặc native persistence. Không promote mirror candidate thành deployed source, không dùng lịch sử44 file làm current evidence. Không quy12 native end-clock deltas cho fix này.

Hai lỗi metadata inspection của reviewer—đường backup test không tồn tại và giả định key `current_sha256` trong mirror manifest thực dùng `base_sha256`—đã được báo parent để log; không tính chúng là production Red. Không sửa source/immutable review hoặc live data trong review này.
