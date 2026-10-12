<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: implement revised sentence MVP while retaining Antigravity data -->

# Sentence MVP — stale save, read/write race, and conflict handling

STATUS: PASS for bounded explicit-revision save/load guard and client delivery. Antigravity candidate independently tested but NOT DEPLOYED; native activation, full STORE-02 and full MVP NOT VERIFIED.

This is a bounded implementation of plan §7.3.4. It does not complete STORE-02, old-client/Drive compatibility, native persistence, or the full MVP.

## Request and backend path

POST /scripts/save → ScriptSaveRequest → scripts_save → save_script → existing per-video lock → _save_script_locked → cues.json/tokens.json/meta.json/script.txt → ScriptSaveResponse. The new typed revision conflict produces HTTP409 with current_rev before token/file writes. Explicit incoming revision below disk revision is rejected. Equal/higher revisions retain the Lamport max+1 contract. Omitted revision retains the existing legacy contract and therefore does not guarantee stale-write protection.

GET /scripts/{video_id} → load_script now acquires the same per-video lock → _load_script_locked. The existing TXT-first load body is unchanged; it may update JSON/meta or migrate tokens. This prevents it from rolling revision backwards across POST saves. read_files calls load_script without already holding the lock; no recursive lock acquisition was added. Mirror read/write/delete and multiprocess synchronization remain outside this bounded change.

Client saveTranscriptToDisk now returns on unsuccessful bridge response before adopting a revision or scheduling Drive. Current-generation HTTP409 and worker stale_revision invoke the existing toast requesting backup JSON before Reload. No automatic retry/merge or local cache replacement. The callback/protocol is tested; visible native toast geometry is NOT VERIFIED.

## Acceptance criteria

- Explicit stale POST rejects409/current_rev and leaves all four script files byte-identical: VERIFIED parent actual HTTP/tempdisk, independent actual HTTP rerun exit0.
- Two same-revision concurrent POSTs yield one200 and one409; accepted content remains: VERIFIED actual HTTP/tempdisk.
- Mutating GET and POST share the per-video lock; accepted latest revision remains: VERIFIED production service/thread/disk regression.
- Existing clock/provenance/owned/lock/target/TXT-edit behavior survives fresh-process restart: VERIFIED actual HTTP/tempdisk; not native Chrome or production script round-trip.
- Client409/500/worker stale response does not schedule Drive or replace local revision;200 still schedules: VERIFIED actual production functions/worker with isolated localhost response fixture, not real Drive writes.
- Build: no bridge build step; actual Python imports/API startup are exercised. JavaScript syntax checked. No database change; isolated file store used instead of production.
- No production-data rollback/reconciliation, script API test writes or migration was performed.

## Red → Green commands and actual output

All commands below run from worktree root unless an explicit directory is stated. Raw logs live in the ignored temporary evidence directory; the permanent excerpts below retain the observations.

### Backend stale POST Red

Command: `local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py`

Exit code: `1`. Actual stdout/stderr:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 200, "response": {"ok": true, "video_id": "fixture01", "path": "/var/folders/qq/glcb3mjd06n382xq96gbcbdc0000gn/T/sentence-store-7xhbjqvp/subtitles/fixture01", "txt_path": "/var/folders/qq/glcb3mjd06n382xq96gbcbdc0000gn/T/sentence-store-7xhbjqvp/subtitles/fixture01/script.txt", "cue_count": 0, "translated_count": 0, "rev": 4, "message": ""}}
Traceback (most recent call last):
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_script_store_sanity.py", line 93, in <module>
    assert status == 409, (status, stale)
           ^^^^^^^^^^^^^
AssertionError: (200, {'ok': True, 'video_id': 'fixture01', 'path': '/var/folders/qq/glcb3mjd06n382xq96gbcbdc0000gn/T/sentence-store-7xhbjqvp/subtitles/fixture01', 'txt_path': '/var/folders/qq/glcb3mjd06n382xq96gbcbdc0000gn/T/sentence-store-7xhbjqvp/subtitles/fixture01/script.txt', 'cue_count': 0, 'translated_count': 0, 'rev': 4, 'message': ''})
```

### Backend final HTTP Green

Command: `local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py`

Exit code: `0`. Actual stdout/stderr:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 84914, "secondPid": 84922, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

### Reader/writer Red

Command: `local-bridge/.venv/bin/python local-bridge/tests/test_script_store.py`

Exit code: `1`. Actual stdout/stderr:

```text
  [ok] test_script_txt_always_emits_ja_en_vi
  [ok] test_parse_empty_ja_en_vi_lines
  [ok] test_tokens_split_merge_roundtrip
  [ok] test_legacy_inline_tokens_migrate_on_read
  [ok] test_rev_monotonic_and_owned
  load/save race: early=[6, 7], writer results=[6, 7], disk rev=6
Traceback (most recent call last):
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge/tests/test_script_store.py", line 486, in <module>
    main()
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge/tests/test_script_store.py", line 480, in main
    fn(root)
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/local-bridge/tests/test_script_store.py", line 171, in test_load_and_save_share_revision_lock
    assert early is None, "writer bypassed the reader's per-video lock"
           ^^^^^^^^^^^^^
AssertionError: writer bypassed the reader's per-video lock
```

### Reader/writer final Green

Command: `local-bridge/.venv/bin/python local-bridge/tests/test_script_store.py`

Exit code: `0`. Actual stdout/stderr:

```text
  [ok] test_script_txt_always_emits_ja_en_vi
  [ok] test_parse_empty_ja_en_vi_lines
  [ok] test_tokens_split_merge_roundtrip
  [ok] test_legacy_inline_tokens_migrate_on_read
  [ok] test_rev_monotonic_and_owned
  load/save race: early=None, writer results=[('conflict', 6), 7], disk rev=7
  [ok] test_load_and_save_share_revision_lock
  [ok] test_files_mirror_roundtrip
  [ok] test_load_prefers_script_txt_over_garbage_cues
  [ok] test_load_script_txt_rescues_inline_tokens
  [ok] test_save_sanitizes_non_finite_times
  [ok] test_read_files_keeps_existing_script_txt
  [ok] test_unchanged_txt_preserves_cue_provenance
[test_script_store] ok
```

### Client conflict Red

Command: `node scripts/sentence_bridge_queue_sanity.js`

Exit code: `1`. Actual stdout/stderr:

```text
PASS: actual HTTP200 parsed before shared revision commit; stale bridge save blocked before network dispatch
AssertionError [ERR_ASSERTION]: HTTP409 must not schedule Drive upload

1 !== 0

    at /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_bridge_queue_sanity.js:42:9
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 1,
  expected: 0,
  operator: 'strictEqual',
  diff: 'simple'
}
```

### Client conflict Green

Command: `node scripts/sentence_bridge_queue_sanity.js`

Exit code: `0`. Actual stdout/stderr:

```text
PASS: actual HTTP200 parsed before shared revision commit; stale bridge save blocked before network dispatch
PASS: production disk-save function handles actual HTTP409/500 and worker stale rejection without Drive scheduling/revision changes; current-tab conflicts notify; HTTP200 still schedules upload (no native UI proof)
bridge.fetch error {
  path: '/scripts/save',
  error: 'TimeoutError: The operation was aborted due to timeout'
}
PASS: hanging HTTP save deadline releases shared worker queue; following star commits
```

### Selected-source candidate HTTP Green

Command: `'/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/revision-guard-2026-10-11/selected-candidate-check.py`

Exit code: `0`. Actual stdout/stderr:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 85170, "secondPid": 85195, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

### Selected-source candidate store Green

Command: `'/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/revision-guard-2026-10-11/candidate/tests/test_script_store.py`

Exit code: `0`. Actual stdout/stderr:

```text
  [ok] test_script_txt_always_emits_ja_en_vi
  [ok] test_parse_empty_ja_en_vi_lines
  [ok] test_tokens_split_merge_roundtrip
  [ok] test_legacy_inline_tokens_migrate_on_read
  [ok] test_rev_monotonic_and_owned
  load/save race: early=None, writer results=[('conflict', 6), 7], disk rev=7
  [ok] test_load_and_save_share_revision_lock
  [ok] test_files_mirror_roundtrip
  [ok] test_load_prefers_script_txt_over_garbage_cues
  [ok] test_load_script_txt_rescues_inline_tokens
  [ok] test_save_sanitizes_non_finite_times
  [ok] test_read_files_keeps_existing_script_txt
  [ok] test_unchanged_txt_preserves_cue_provenance
[test_script_store] ok
```

### Applicable full bridge regression

Directory: local-bridge. Command: `.venv/bin/python -m pytest -q tests/`; exit0. Actual final stdout: `45 passed, 5 warnings in 2.09s`. Existing warnings are Starlette httpx and FastAPI on_event deprecations. Independent current rerun: `45 passed, 5 warnings in 2.47s`, exit0.

### Source and diff checks

`git diff -- local-bridge/app/api/scripts.py` and candidate-start diffs inspected. Scoped `git diff --check -- local-bridge/app/api/scripts.py local-bridge/app/services/script_store.py local-bridge/tests/test_script_store.py scripts/sentence_script_store_sanity.py scripts/sentence_bridge_queue_sanity.js extension/content/content.js` exit0, stdout empty. Global house-style hook still flags the previously filed plan line6 Markdown hard break; it is not evidence of this guard's runtime behavior, and the immutable source plan was not rewritten.

## Runtime delta investigation: bounded evidence

Actual selected server log lines809–819 show script/meta/token GET200 followed by Saved script FVnhw0mVH_Q cues512 rev5 and POST /scripts/save200. Logs contain no request payload; they do not identify the client cache or timing intent. This supports a later API write after restart, not a claim that restart changed the times.

Current512 ordered IDs retain the previous comparison;12 end times differ. Running the actual backed-up old formatter/parser on each current end gives the old baseline value for12/12. This is compatible with prior rounding of a more precise cache, not proof of native causality. Initial backup-path probe failed FileNotFoundError (missing data prefix); corrected probe exit0. No production source/clock/data changes resulted.

## Staged Antigravity candidate

Only app/services/script_store.py and app/api/scripts.py differ from selected source; all other app Python files are byte-identical. Existing Decimal import placement is preserved. Store AST changes only _save_script_locked/load_script; additions are ScriptRevisionConflict/_load_script_locked. The moved load body AST is exact. Candidate manifest follows:

```json
{
  "app/api/scripts.py": {
    "current_sha256": "9528bac9aa57bfd9fb2f9d05190f7cc073c869b7e9d379b5d0f1a48577e23bd5",
    "candidate_sha256": "b0b715704cdff35460979b2b9ccdd74bacd4247519aa397c37a3a859c2e915ff"
  },
  "app/services/script_store.py": {
    "current_sha256": "8adeebf107de5a7e971d8599f345c2e85094f82472d329b1576945cfbc7f4d10",
    "candidate_sha256": "bcfac7419082bf6e26919cf9f2d7f8acf0c5c7619040b6f343c57482c7e0e554"
  }
}
```

## Independent review (separate read-only agent)

independent_audit read original plan, current disk diffs, service/API/client/callers, actual before/current source and candidate. Formal result: PASS only for explicit stale POST protection, shared load/save lock, client failed-save behavior. Own Red reproduced protected cue wipe and accepted revision7 rolled back to6; current Green proves conflict6 then accepted7, exact protected fixture clocks1.0131/4.0353. The reviewer checked current45pytest, standalone12, actual HTTP/fresh restart/production Node projection, client protocol and late-navigation conflict; all exit0. No production script API writes/restart/Chrome actions by reviewer.

Exact independent actual HTTP command: `PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py`, exit0. Raw excerpts:

```text
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
{"restartHTTP": 200, "firstPid": 85200, "secondPid": 85231, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
```

Independent standalone command (cwd local-bridge), exit0:

```python
# PYTHONDONTWRITEBYTECODE=1 .venv/bin/python - <<'PY'
import runpy
from app.services import script_store
script_store._device_id='review-isolated'
runpy.run_path('tests/test_script_store.py',run_name='__main__')
# PY
```

Raw output excerpt:

```text
  load/save race: early=None, writer results=[('conflict', 6), 7], disk rev=7
[test_script_store] ok
```

Independent full regression command (cwd local-bridge), exit0:

```python
# PYTHONDONTWRITEBYTECODE=1 .venv/bin/python - <<'PY'
import pytest
from app.services import script_store
script_store._device_id='review-isolated'
raise SystemExit(pytest.main(['-q','-p','no:cacheprovider','tests/']))
# PY
```

Actual stdout excerpt: `45 passed, 5 warnings in 2.47s`.

Independent selected candidate command: `PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/revision-guard-2026-10-11/selected-candidate-check.py`; exit0. Raw restart excerpt:

```text
{"restartHTTP": 200, "firstPid": 85728, "secondPid": 85754, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
```

Independent source audit:31 app Python files in same set;29 remain byte-identical, only the manifest's two change. Only _save_script_locked/load_script change; class/helper added; all remaining source/import AST and moved load body exact. The first positional AST-key probe failed because a new class shifted keys; corrected named/ordered comparer exit0. That harness failure is not a production defect. Other corrected reviewer harness failures (owned read from response, omitted PYTHONPATH, omitted render video_id) were logged, not counted as Red evidence.

## Main client delivery (activation not established)

Guarded copy changed only production extension/content/content.js and added scripts/sentence_bridge_queue_sanity.js. The latter was absent in main; initial two-file preflight aborted before writes, and an incorrectly continued main test failed MODULE_NOT_FOUND. Both were logged; corrected preflight allows adding the test while still requiring the production source equal the saved baseline. Receipt:

```json
{
  "extension/content/content.js": {
    "existed_before": true,
    "before_sha256": "f487e44910c80d60ce98d1ef2182e473e580d515f2bc09f7673e29f3a3e80afd",
    "after_sha256": "3df13459266dbb5f601aea703df6052123a81e611efdf5cf1fba50bbf569c5dc",
    "bytes": 217947,
    "mode": "0o644",
    "backup_sha256": "f487e44910c80d60ce98d1ef2182e473e580d515f2bc09f7673e29f3a3e80afd"
  },
  "scripts/sentence_bridge_queue_sanity.js": {
    "existed_before": false,
    "before_sha256": null,
    "after_sha256": "670827f1ee68cb272322c884d2fe2725fdcb8add7c7b51f2e1dd416c4152b070",
    "bytes": 5901,
    "mode": "0o644",
    "backup_sha256": null
  }
}
```

From `/Users/hoangson/Projects/YouTube JP Caption Studio`, `node scripts/sentence_bridge_queue_sanity.js` exit0. Raw stdout matches the three PASS lines and expected timeout in the worktree client Green above. `node scripts/sentence_source_restore_sanity.js` exit0 with all36 production-function assertions; current raw excerpts include `PASS: fresh VM saved conversion preserves raw source and normalization` and `PASS: fresh VM accepts exact revision-bound Undo`; the earlier main-source-restore.log was captured before copy and is not the current delivery receipt. `node --check extension/content/content.js` exit0, stdout/stderr empty. No new native reload/backup/UI proof.

Selected live backend check (read-only): `lsof -nP -iTCP:8765 -sTCP:LISTEN` plus source SHA/GET health probe exit0; actual PID60231 at127.0.0.1:8765, selectedstore8adeebf…/API9528bac9… still unchanged, healthHTTP200/readytrue. Candidate backend has not been applied or restarted. New deployment would affect exactly those two app Python files and keep the current data set; it would not reconcile old times or move state to worktree.

## Problems / required fixes / remaining scope

Legacy omitted revision can overwrite under the old contract. Mirror/files paths, external TXT editors, directory-wide crash transaction and multiworker coordination remain unverified/unprotected by this slice. Client retains edits and warns beforeReload; no auto reconciliation. Native protected storage/sidecar, Drive old-client, audio gold5/50, live Gemini/KPI, source17/rra05 semantic gates and full MVP remain open.12 end-clock causality remains NOT VERIFIED despite old-formatter compatibility12/12. No user-data rollback, forced timing restoration or production test mutation.

## Independent main delivery companion

Separate read-only reviewer result: PASS for main client delivery. Own byte/mode/backup/dependency audit exit0; main actual protocol command and36 source-restore assertions exit0. Existing production source backup remains exactf487…/0644. Main current content3df134…/217947B0644 and protocol670827…/5901B0644 byte-equal reviewedworktree. Current31candidate Python source set and29 unchanged files were audited separately. Historical test absence is parent preflight/receipt evidence, not independently inferred from current disk.

Reviewer main audit actual stdout excerpt:

```text
PASS main exact reviewed bytes/mode extension/content/content.js 217947 3df13459266dbb5f601aea703df6052123a81e611efdf5cf1fba50bbf569c5dc 0644
PASS main exact reviewed bytes/mode scripts/sentence_bridge_queue_sanity.js 5901 670827f1ee68cb272322c884d2fe2725fdcb8add7c7b51f2e1dd416c4152b070 0644
PASS old main content backup f487e449... exact baseline bytes and0644
PASS dependency main/worktree byte equality extension/background/service_worker.js
PASS dependency main/worktree byte equality extension/content/normalize_cues.js
PASS dependency main/worktree byte equality extension/shared/sentence_groups.js
PASS dependency main/worktree byte equality extension/shared/timedtext_parse.js
LIMIT receipt records protocol script previously absent; no historical absence inferred from current disk; no native/backend activation claim
```

Reviewer commands from main: `node scripts/sentence_bridge_queue_sanity.js` exit0 with identical three PASS lines/expected timeout; `node scripts/sentence_source_restore_sanity.js` exit0 with36 assertions; scoped diff/syntax each checked. No nativeChrome activation or selectedbackend deployment claim follows.
