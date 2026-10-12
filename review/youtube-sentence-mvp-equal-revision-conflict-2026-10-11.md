<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: continue revised sentence MVP, protect edits during sync -->

# Equal-revision mirror conflict — bounded worktree/candidate verification

Two different device snapshots can have the same Lamport counter. Actual HTTP Red accepted the other-device version6 snapshot over protected local version6 and changed cues.json/meta.json/script.txt. The existing lower-only guard was insufficient. The new shared write_files check rejects differing accepted file bytes at the same explicit revision under the same existing lock, before any write. Exact replay remains accepted; higher versions and legacy missing-revision behavior remain unchanged. This supersedes the previous equal-revision limitation only in current worktree/new candidate, not the running Antigravity bridge.

Flow: production mirrorFromDrive reads local6, downloads remote7 while a local edit commits7 (or8), POST /scripts/{id}/files → scripts_files_post → write_files revision/byte check under per-video lock → real disposable filesystem →409/current_rev. Production worker existing error branch/catch reports okfalse/error status and preserves mirror bookkeeping/notifications. No new dependency, tie-break winner, forced retry, remote-revision adoption, generic merge abstraction or cue-specific branch.

## Evidence and acceptance

Red command exit1, actual output:

```text
local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"staleSaveHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 3}}}
PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks
{"malformedMirrorHTTP": 400, "response": {"detail": "meta.json is not valid JSON: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"}, "changedFiles": []}
PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files
{"staleMirrorHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical
{"sameRevisionCollisionHTTP": 200, "response": {"ok": true, "video_id": "fixture06", "path": "/var/folders/qq/glcb3mjd06n382xq96gbcbdc0000gn/T/sentence-store-yvmij1hz/subtitles/fixture06", "written": ["cues.json", "meta.json", "script.txt"]}, "changedFiles": ["cues.json", "script.txt", "meta.json"]}
Traceback (most recent call last):
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/scripts/sentence_script_store_sanity.py", line 146, in <module>
    assert status == 409 and collision['detail']['current_rev'] == 6, (status, collision)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: (200, {'ok': True, 'video_id': 'fixture06', 'path': '/var/folders/qq/glcb3mjd06n382xq96gbcbdc0000gn/T/sentence-store-yvmij1hz/subtitles/fixture06', 'written': ['cues.json', 'meta.json', 'script.txt']})
```

Current command exit0; actual output from the final permanent regression:

```text
local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
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
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to7 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 12494, "secondPid": 12500, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

This covers full two-device equal6 collision with consistent cues/meta, each cues/meta/TXT divergence individually, exact full/metadata-only replay, fresh revision0 import/replay, existing missing-file refusal, explicitlowerrevision and six malformed revision variants. All rejected mirror checks compare actual temp-disk bytes and file set; protected ownership/translation/locks/clocks/tokens remain exact. Fresh0 is allowed when no prior metadata exists; an existing missing file at equal revision conflicts rather than being repaired implicitly. JSON formatting-only differences are conservatively conflicts; no semantic equality normalization is introduced.

Executed actual production worker helpers in VM with isolated cloud/auth/Chrome storage/notification adapters and real HTTP to the production route/store. Two separate real download races retain local6→8remote7 and add local6→7remote7. Neither substitutes a fabricated bridge response; neither establishes Google Drive cloud/native UI proof.

Full backend command from local-bridge, exit0:

```text
.venv/bin/python -m pytest -q tests/
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
46 passed, 5 warnings in 2.26s
```

Selected-source HTTP/fresh-process command exit0:

```text
'/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/selected-candidate-check.py
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
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to7 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 12493, "secondPid": 12499, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

Node syntax/scoped git diff --check exit0/empty. Complete independently executed checks, including standalone store13, Red/Green and additional edges, appear below. Static hash/AST scope checks are delivery inspection, not runtime software tests. Root hook still reports the byte-preserved immutable source plan line6 Markdown hard break; it was not edited to manufacture a green root diff check.

## Frozen proposed package — not deployed

Selected backend candidate under `.tmp-sentence-mvp/mirror-equal-revision-2026-10-11/candidate/`: all31 current Antigravity app Python files copied from live base, then only store write_files and API scripts_files_post replaced from current worktree. Other29files unchanged. Manifest:

```json
{
  "app/api/scripts.py": {
    "base_sha256": "b0b715704cdff35460979b2b9ccdd74bacd4247519aa397c37a3a859c2e915ff",
    "candidate_sha256": "2bd1b3946e6f63aa86ccb703b4c52feebb354bc921fad71b2033fd0f8552a2e9"
  },
  "app/services/script_store.py": {
    "base_sha256": "3396b405921b744a0f8d5ccd3da1e99a9f3db25c1e673abf6186e1bf0611fea3",
    "candidate_sha256": "a2e8b391ba7f7139e004b9964f0042e478c128258b5645a0258e9c9cffdb2b77"
  }
}
```

Client proposal is one extension background worker file in the main project, byte-identical to the previously reviewed error-propagation change, SHA25686291c4c1eca327c5c08b54b2f08207039b5cf841dbb96c0f39f3df042565ec6. Its hash/mode base guard is recorded in client-manifest.json; no main worker copy/reload has occurred. Worker production code did not change further in this equal-revision slice.

Current live Antigravity remains PID8005/store3396b405…/APIb0b715…/healthHTTP200ready, all31base hashes inspected; main worker remains base. Previous one-file approval/deployment is historical completed scope, not authorization for this separate two-file backend package plus worker delivery. Prepared deploy.py has not run: it checks live process/cwd/argv, all31source hashes and frozen candidate hashes, backs up current data and changed sources, verifies backup bytes/modes, then would replace only two backend files/restart same bridge and verify current data against fresh preflight. No migration/rollback/reconciliation/script API production writes are proposed. Any later runtime delivery must audit the current baseline and preserve all current data, not reuse an old44/48 count as a claim.

## Limits and remaining MVP gates

Explicit revisions are protected against lower counters and differing-byte equal snapshots. Missing/null/legacy non-object revisions remain allowed, outside this guarantee. Higher-revision conflicting content still follows existing mirror semantics; this does not implement a full semantic merge or immutable ownership policy. The file comparison intentionally treats formatting-only differences as conflict; resolving a conflict requires user-visible reconciliation rather than silently selecting a remote winner. Single-process locks do not protect external editors/multiple processes; per-file atomic writes are not a crash-atomic bundle. Cross-folder sync may commit earlier folders before a later failure; no all-or-nothing cloud batch claim.

Full STORE-02/MVP NOT VERIFIED: native protected sidecar persistence, live Drive and old-client compatibility, audio reference5videos/50segments, source17/rra05 semantic repair, liveGemini cold/warm/readiness/cost/KPI and release remain open. User partial references are retained; no invented full JP/onset/audio gold or per-cue special rule. No live scripts API write/restart/native Chrome action in this turn. Full goal remains active.

## Independent review

STATUS: PASS for bounded explicit revision guard and exact replay; new deployment/full STORE-02/MVP NOT VERIFIED. Independent report70,805bytes/923lines, SHA2569ce13666e197d852baeb691d5d25da7c7a5d44ac5baef0c9c517a4a1ee8b6e82.

```text
READ-ONLY INDEPENDENT REVIEW — SAME-REVISION MIRROR COLLISION — 2026-10-11
Reviewer: /root/independent_audit
Workspace: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
Original request: revised sentence MVP, storage no loss/source/user edit/lock fidelity; plan §7.3.4 forbids older revision overwrite.
Bounded scope: equal-revision divergent raw mirror refusal with exact replay compatibility, combined with previously reviewed lower-revision guard/API409/worker honest error handling. No new live deployment authorized or performed by reviewer.

STATUS: PASS — bounded worktree/selected candidate behavior and source scope.
New live backend/worker deployment/native activation: NOT VERIFIED.
Full STORE-02 / full MVP / native/cloud Drive/old-client/gold/KPI: NOT VERIFIED.

REQUEST → ROUTE → SERVICE → DISK → RESPONSE
Production worker mirrorFromDrive → POST /scripts/{video_id}/files → scripts_files_post → ScriptFilesRequest.files → write_files.
Existing JSON/revision validation and per-video lock reused. Under same lock read current metadata revision. Incoming lower revision refuses as before. Incoming equal revision with existing metadata compares every accepted known file against existing bytes; absent accepted file or different bytes raises existing ScriptRevisionConflict before mkdir/write. Route maps conflict to409 detail.error=stale_revision,current_rev. Exact equal bytes replay and higher/fresh metadata versions retain existing write behavior.
Worker prior reviewed non-ok branch throws before lastMirroredRev/pulled update; pullDriveIfNewer returnsok:false/error:status. Current worker bytes are unchanged in this incremental production slice.

REQUIREMENTS
VERIFIED source scope: incremental worktree AST only write_files changed versus lower-only before snapshot. Existing lock/error/replay path reused; no dependency/schema expansion or cue-specific logic.
VERIFIED candidate scope:31 app files, exactly store/API changed versus selected live base3396.../b0...,29 others byte-exact; only AST write_files and scripts_files_post change, imports/top-level/all other functions preserved. Affected AST equals worktree.
VERIFIED candidate storeSHA a2e8b391ba7f7139e004b9964f0042e478c128258b5645a0258e9c9cffdb2b77; API2bd1b3946e6f63aa86ccb703b4c52feebb354bc921fad71b2033fd0f8552a2e9. Worker86291c4c1eca327c5c08b54b2f08207039b5cf841dbb96c0f39f3df042565ec6 unchanged previous reviewed candidate; main worker exact pre-change manifest base.
VERIFIED own runtime Red/Green: old lower-only real module accepted consistent different-device same6 bundle and changed3 files; exit1 expected. Current real module conflict_revision6, changed0; exit0.
VERIFIED actual HTTP worktree and selected candidate: two-device distinct revision6 mirror→409/current_rev6; allfour temp script files exact. Each cue/meta/TXT divergence independently409; identical metadata-only partial replay200; exact whole replay200.
VERIFIED fresh revision0 import/replay200, equal missing accepted file409/no mutation. Own random-port HTTP separately verifies two-file exact partial replay200 leaving absent file absent, higher version recreates missing file200, missing metadata accepts explicit0.
VERIFIED formatting-only divergence: own actual HTTP indent-only meta JSON change at equal0→409 with no byte changes. Conservative raw byte policy is intentional; no semantic-equivalence auto merge.
VERIFIED existing lower guard and invalid revisions: rev5→local6 conflict409, six malformed rev types400, higher200, omitted-meta legacy partial200; no mutation on拒否.
VERIFIED production worker/API races with real random-port HTTP: remote7 selected against local6; local advances to7 (equal collision) or8 (lower stale) while downloading; both409, actual worker returnsok:false/error:status, no restore notification or lastMirroredRev update, allfourfiles unchanged.
VERIFIED regressions: worktree fullpytest46passed/5warnings; standalone store13 worktree and selectedcandidate each0; actual HTTP/fresh-child restart preserves clocks1.234/4.789, provenance/owned/locks/revision and composed production group/sourceRefs/sidecar/Undo; exact10us TXT edit increments3→4 once; invalid clock422 leaves temp disk unchanged.
VERIFIED test integrity (inspection): prior assertions retained. Two-edit worker race remains advances2 and one-edit equal collision added advances1; expected final revision parameterization retains disk/status/storage/notification assertions. Added individual-file/partial/fresh0 cases are real HTTP and filesystem effects. No new skip/only/static-string software tests observed.
VERIFIED syntax/scoped diffcheck0. Static AST/hash checks above are scope inspection, not software behavior proof. Broad global hook still flags immutable revised rawplan line6 Markdown hardbreak; not changed.
NOT VERIFIED missing/null/non-object legacy revision guarantee: omitted explicit version intentionally retains existing mirror behavior and can overwrite; no claim all old clients are protected.
NOT VERIFIED multiprocess lock/crash transaction: locks are per-video within process; multiple accepted files individually atomic, not crash-atomic whole bundle.
NOT VERIFIED independently changed external disk files between reads or multi-folder all-or-nothing worker rollback. No new merge policy/recovery logic.
NOT VERIFIED actual Google Drive/auth/storage/native UI dispatch; Drive/storage/notification adapters are isolated fixtures. HTTP statuses/router/store/disk/production worker helper execution are real.
NOT VERIFIED live user script roundtrip, native activation, Gemini, audio/gold/KPI or causality of prior12clock changes. No live script APIs, process control or browser operations used.

API_CHECKS
TEMP worktree+selected candidate:
POST /scripts/fixture06/files equal divergent revision6→409 detail.current_rev6; changedFiles[].
Each cues/meta/script divergence→409; exact metadata-only/whole replay→200; fresh rev0→200; missing equal acceptedfile→409.
Production worker remote7/local7 collision→409 detail.current_rev7, errorstatus, ok:false, no notifications/bookkeeping updates.
Production worker remote7/local8 stale→409 detail.current_rev8, same preservation.
Malformed JSON→400/no disk changes; six invalid revisions→400; higher integer→200; omittedmetadata partial→200 legacy.
POST scripts/save and GET freshprocess script→200 exactclocks/provenance/owned/locked/rev; invalidtiming→422unchanged.
OWN extra localhost server: fresh0/full replay/exact partial→200; per-file changes and formatting-only JSON→409; missing accepted equalfile→409; identical subset leaves absentfile absent→200; higher restores file→200; missingmetadata→explicit0 accepted200.
No API script requests were made to live8765.

DATABASE_CHECKS
Actual disposable filesystem effects verified by complete bytes snapshots. Main script data and liveAntigravity storage not written by reviewer. No SQL migration involved.
Approved preceding mirror-validation deployment historical evidence may be reused only as historical: independent prior report .tmp-sentence-mvp/mirror-revision-2026-10-11/independent-review.txt SHA c68380545736d18cf88d2953490f437d7a2015c26f9e90730eed95dc46759f32 verifiedPID8005/31source/store-only/48data+48backup/health200 at that prior time. This review did not rerun process/data preservation; current source hash inspection alone is not refreshed runtime/data proof.

PROBLEMS / REQUIRED_FIXES
No blocker found for bounded explicit integer revision mirror protection and exact replay.
Keep legacyNone, multiprocess/crash, cloud/native, global storage/MVP limits open.
Conflict response retains existing errorcode stale_revision even for equal-counter divergence; this is protocol reuse, not silent merge. Formatting-only bytes conflicts require resolution/rebase, never silently overwrite.
The previous lower-only same-revision limitation is narrowed by the real6→7remote7 regression now; no claim every distributed sync conflict is solved.

COMMANDS / EXACT RAW OUTPUT
All commands below independently executed by reviewer. Default cwd workspace above; pytest cwd workspace/local-bridge. Initial HTTP/candidate pass preceded addition of permanent fresh0/individual-file test cases; final HTTP/candidate commands rerun current final tests and include those cases. Async output concatenated in original order. Diff exit1 denotes actual differences; own_red exit1 intentionally proves baseline defect.

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
{"sameRevisionCollisionHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: distinct two-device mirrors at revision6 return HTTP409 and keep protected local edit bytes exact
PASS: six invalid mirror revisions HTTP400 preserve all four files; identical equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to7 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 12228, "secondPid": 12246, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit


===== candidate =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/selected-candidate-check.py
EXIT: 0
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
PASS: six invalid mirror revisions HTTP400 preserve all four files; identical equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to7 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 12227, "secondPid": 12245, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
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
46 passed, 5 warnings in 2.44s


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


===== scope =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
python3 - <<'PY'
import ast,hashlib,json
from pathlib import Path
h=Path('.tmp-sentence-mvp/mirror-equal-revision-2026-10-11');root=Path('/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();m=json.loads((h/'candidate-manifest.json').read_text())
assert len(m)==31
assert {r for r,v in m.items() if v['base_sha256']!=v['candidate_sha256']}=={'app/services/script_store.py','app/api/scripts.py'}
for r,v in m.items():
 assert sha(root/r)==v['base_sha256']
 assert sha(h/'candidate'/r)==v['candidate_sha256']
def nodes(p):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(p.read_text()).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef))}
for r,allow in [('app/services/script_store.py',{'write_files'}),('app/api/scripts.py',{'scripts_files_post'})]:
 old=nodes(root/r);new=nodes(h/'candidate'/r);work=nodes(Path('local-bridge')/r)
 assert set(old)==set(new) and {k for k in old if old[k]!=new[k]}==allow
 assert all(new[k]==work[k] for k in allow)
 trees=[ast.parse((p/r).read_text()) for p in (root,h/'candidate')]
 for t in trees:t.body=[n for n in t.body if not isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef))]
 assert ast.dump(trees[0],include_attributes=False)==ast.dump(trees[1],include_attributes=False)
old=nodes(h/'script_store.before.py');new=nodes(Path('local-bridge/app/services/script_store.py'))
assert set(old)==set(new) and {k for k in old if old[k]!=new[k]}=={'write_files'}
cm=json.loads((h/'client-manifest.json').read_text())
assert sha(Path(cm['path']))==cm['base_sha256']
assert sha(Path('extension/background/service_worker.js'))==cm['candidate_sha256']==sha(h/'service_worker.candidate.js')=='86291c4c1eca327c5c08b54b2f08207039b5cf841dbb96c0f39f3df042565ec6'
print('VERIFIED static scope:31 app files exactly2 changed/29 unchanged versus live approved base; imports/top-level/other AST preserved')
print('VERIFIED incremental AST only write_files; affected candidate helpers equal worktree')
print('Candidate store SHA256:',sha(h/'candidate/app/services/script_store.py'))
print('Candidate API SHA256:',sha(h/'candidate/app/api/scripts.py'))
print('VERIFIED worker unchanged from prior reviewed candidate; main worker remains pre-change base; no deployment')
PY
EXIT: 0
RAW OUTPUT:
VERIFIED static scope:31 app files exactly2 changed/29 unchanged versus live approved base; imports/top-level/other AST preserved
VERIFIED incremental AST only write_files; affected candidate helpers equal worktree
Candidate store SHA256: a2e8b391ba7f7139e004b9964f0042e478c128258b5645a0258e9c9cffdb2b77
Candidate API SHA256: 2bd1b3946e6f63aa86ccb703b4c52feebb354bc921fad71b2033fd0f8552a2e9
VERIFIED worker unchanged from prior reviewed candidate; main worker remains pre-change base; no deployment


===== own_http_edges =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python - <<'PY'
import json,select,subprocess,sys,tempfile,time,urllib.request,urllib.error
from pathlib import Path
with tempfile.TemporaryDirectory(prefix='review-equal-http-') as d:
 root=Path(d);p=subprocess.Popen([sys.executable,'scripts/sentence_script_store_sanity.py','--serve',d],stdout=subprocess.PIPE,text=True)
 try:
  assert select.select([p.stdout],[],[],5)[0]
  address=p.stdout.readline().strip();deadline=time.monotonic()+5
  def request(vid,files):
   req=urllib.request.Request(address+'/scripts/'+vid+'/files',data=json.dumps({'files':files}).encode(),headers={'Content-Type':'application/json'},method='POST')
   try:
    with urllib.request.urlopen(req,timeout=3) as r:return r.status,json.load(r)
   except urllib.error.HTTPError as e:return e.code,json.load(e)
  while True:
   try:
    with urllib.request.urlopen(address+'/scripts/unknown01',timeout=1) as r:assert r.status==200
    break
   except urllib.error.URLError:
    assert p.poll() is None and time.monotonic()<deadline
    time.sleep(.01)
  vid='edgeRev0';folder=root/'subtitles'/vid
  files={'cues.json':json.dumps({'cues':[],'meta':{'rev':0}}),'meta.json':json.dumps({'rev':0}),'script.txt':'fixture raw text'}
  status,result=request(vid,files);assert status==200
  snap=lambda:{x.name:x.read_bytes() for x in folder.iterdir()}
  original=snap()
  assert request(vid,files)[0]==200 and snap()==original
  subset={name:files[name] for name in ('cues.json','meta.json')}
  assert request(vid,subset)[0]==200 and snap()==original
  print('HTTP200: fresh revision0, full exact replay and existing-file partial exact replay; all original bytes unchanged')
  for name,replacement in [('cues.json',json.dumps({'cues':[{'source':'different'}]})),('meta.json',json.dumps({'rev':0},indent=2)),('script.txt','changed raw text')]:
   status,result=request(vid,{**files,name:replacement})
   assert status==409 and result['detail']['current_rev']==0 and snap()==original,(name,status,result)
  print('HTTP409: each individual cue/meta/TXT divergence refused; formatting-only JSON difference is conservatively a byte conflict; all three files unchanged')
  (folder/'script.txt').unlink();missing=snap()
  status,result=request(vid,files)
  assert status==409 and snap()==missing and not (folder/'script.txt').exists()
  assert request(vid,subset)[0]==200 and snap()==missing
  print('HTTP409: equal revision cannot silently recreate a missing accepted file; HTTP200 identical subset leaves absent file absent')
  future={**files,'meta.json':json.dumps({'rev':1})}
  assert request(vid,future)[0]==200 and (folder/'script.txt').read_bytes()==files['script.txt'].encode()
  no_meta='edgeNoMeta';assert request(no_meta,{'cues.json':files['cues.json']})[0]==200
  assert request(no_meta,files)[0]==200
  print('HTTP200: higher revision restores the missing file; fresh/missing metadata accepts explicit revision0; metadata-omitted partial mirror retains legacy behavior')
 finally:
  p.terminate();assert p.wait(timeout=5)==0;p.stdout.close()
PY
EXIT: 0
RAW OUTPUT:
HTTP200: fresh revision0, full exact replay and existing-file partial exact replay; all original bytes unchanged
HTTP409: each individual cue/meta/TXT divergence refused; formatting-only JSON difference is conservatively a byte conflict; all three files unchanged
HTTP409: equal revision cannot silently recreate a missing accepted file; HTTP200 identical subset leaves absent file absent
HTTP200: higher revision restores the missing file; fresh/missing metadata accepts explicit revision0; metadata-omitted partial mirror retains legacy behavior


===== http_final =====
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
{"sameRevisionCollisionHTTP": 409, "response": {"detail": {"error": "stale_revision", "current_rev": 6}}, "changedFiles": []}
PASS: distinct two-device mirrors at revision6 return HTTP409 and keep protected local edit bytes exact
PASS: each divergent mirror file at equal rev conflicts409; exact partial replay200; new rev0 import/replay200; existing missing equal-rev file409 without mutation
PASS: six invalid mirror revisions HTTP400 preserve all four files; identical equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to7 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 12847, "secondPid": 12866, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit


===== candidate_final =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/selected-candidate-check.py
EXIT: 0
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
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":8}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to8 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
{"result":{"ok":false,"error":"bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"},"statuses":["error: bridge POST 409: {\"detail\":{\"error\":\"stale_revision\",\"current_rev\":7}}"],"restored":[],"storedMirrors":{"unrelated":94}}
PASS: real local rev6 advances to7 during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)
PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6
PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)
PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection
{"restartHTTP": 200, "firstPid": 12846, "secondPid": 12865, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
{"exactTXTEditHTTP": 200, "start": 1.23401, "previousRevision": 3, "editRevision": 4}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit


===== own_red =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python - <<'PY'
import importlib.util,json,tempfile,sys
from pathlib import Path
sys.path.insert(0,'local-bridge')
baseline=True
path=Path('.tmp-sentence-mvp/mirror-equal-revision-2026-10-11/script_store.before.py') if baseline else Path('local-bridge/app/services/script_store.py')
spec=importlib.util.spec_from_file_location('review_equal_store',path);m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='review-equal-red-green-') as d:
 root=Path(d);m.SCRIPTS_DIR=root;m.scripts_root=lambda:root;m._device_id='local-device'
 cue={'id':'fixture-a','source':'質問?','start_media_time':1.0131,'end_media_time':4.0353,'vi':'protected local edit','en':'','text_source':'edit','mt_locked':True,'translation_source':'user'}
 assert m.save_script('fixtureA',[cue],owned=True,rev=5)['rev']==6
 files=m.read_files('fixtureA')
 meta=json.loads(files['meta.json']);meta['deviceId']='other-device'
 cues=json.loads(files['cues.json']);cues['meta']=meta;cues['cues'][0]['vi']='different device edit'
 incoming={**files,'meta.json':json.dumps(meta),'cues.json':json.dumps(cues),'script.txt':m.render_script_txt([{**cue,'vi':'different device edit'}],video_id='fixtureA')}
 folder=root/'fixtureA';before={p.name:p.read_bytes() for p in folder.iterdir()}
 conflict=None
 try:m.write_files('fixtureA',incoming)
 except m.ScriptRevisionConflict as e:conflict=e.current_rev
 changed=sum(p.read_bytes()!=before[p.name] for p in folder.iterdir())
 print(json.dumps({'baseline':baseline,'incomingRevision':6,'currentRevision':json.loads((folder/'meta.json').read_text())['rev'],'conflictRevision':conflict,'changedFiles':changed}))
 assert conflict==6 and changed==0,'Distinct equal-revision mirrors must conflict without overwriting protected local edit'
 if not baseline:print('PASS: current production store refuses consistent different-device revision6 mirror before any file mutation')
PY
EXIT: 1
RAW OUTPUT:
{"baseline": true, "incomingRevision": 6, "currentRevision": 6, "conflictRevision": null, "changedFiles": 3}
Traceback (most recent call last):
  File "<stdin>", line 21, in <module>
AssertionError: Distinct equal-revision mirrors must conflict without overwriting protected local edit


===== own_green =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 local-bridge/.venv/bin/python - <<'PY'
import importlib.util,json,tempfile,sys
from pathlib import Path
sys.path.insert(0,'local-bridge')
baseline=False
path=Path('.tmp-sentence-mvp/mirror-equal-revision-2026-10-11/script_store.before.py') if baseline else Path('local-bridge/app/services/script_store.py')
spec=importlib.util.spec_from_file_location('review_equal_store',path);m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='review-equal-red-green-') as d:
 root=Path(d);m.SCRIPTS_DIR=root;m.scripts_root=lambda:root;m._device_id='local-device'
 cue={'id':'fixture-a','source':'質問?','start_media_time':1.0131,'end_media_time':4.0353,'vi':'protected local edit','en':'','text_source':'edit','mt_locked':True,'translation_source':'user'}
 assert m.save_script('fixtureA',[cue],owned=True,rev=5)['rev']==6
 files=m.read_files('fixtureA')
 meta=json.loads(files['meta.json']);meta['deviceId']='other-device'
 cues=json.loads(files['cues.json']);cues['meta']=meta;cues['cues'][0]['vi']='different device edit'
 incoming={**files,'meta.json':json.dumps(meta),'cues.json':json.dumps(cues),'script.txt':m.render_script_txt([{**cue,'vi':'different device edit'}],video_id='fixtureA')}
 folder=root/'fixtureA';before={p.name:p.read_bytes() for p in folder.iterdir()}
 conflict=None
 try:m.write_files('fixtureA',incoming)
 except m.ScriptRevisionConflict as e:conflict=e.current_rev
 changed=sum(p.read_bytes()!=before[p.name] for p in folder.iterdir())
 print(json.dumps({'baseline':baseline,'incomingRevision':6,'currentRevision':json.loads((folder/'meta.json').read_text())['rev'],'conflictRevision':conflict,'changedFiles':changed}))
 assert conflict==6 and changed==0,'Distinct equal-revision mirrors must conflict without overwriting protected local edit'
 if not baseline:print('PASS: current production store refuses consistent different-device revision6 mirror before any file mutation')
PY
EXIT: 0
RAW OUTPUT:
{"baseline": false, "incomingRevision": 6, "currentRevision": 6, "conflictRevision": 6, "changedFiles": 0}
PASS: current production store refuses consistent different-device revision6 mirror before any file mutation


===== candidate_unit =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
PYTHONDONTWRITEBYTECODE=1 '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3' - <<'PY'
import runpy,sys
from pathlib import Path
h=Path('.tmp-sentence-mvp/mirror-equal-revision-2026-10-11')
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

===== test_diff =====
CWD: /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
COMMAND:
diff -u .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/http-check.before.py scripts/sentence_script_store_sanity.py
diff -u .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/worker-check.before.js scripts/sentence_drive_mirror_sanity.js
EXIT: 1
RAW OUTPUT:
--- .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/http-check.before.py	2026-10-11 18:18:14
+++ scripts/sentence_script_store_sanity.py	2026-10-11 18:33:03
@@ -131,6 +131,21 @@
         assert status == 409 and old_rejected['detail']['current_rev'] == 6, (status, old_rejected)
         assert not changed, f'Stale mirror changed protected rev6: {changed}'
         print('PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical')
+        collision_files = dict(old_mirror['files'])
+        collision_meta = json.loads(collision_files['meta.json'])
+        collision_meta.update({'rev': 6, 'deviceId': 'other-device'})
+        collision_files['meta.json'] = json.dumps(collision_meta)
+        collision_cues = json.loads(collision_files['cues.json'])
+        collision_cues['meta'] = collision_meta
+        collision_files['cues.json'] = json.dumps(collision_cues)
+        status, collision = request('/scripts/fixture06/files', {'files': collision_files})
+        collision_changed = [p.name for p in mirror_folder.iterdir()
+                             if p.read_bytes() != before_old_mirror[p.name]]
+        print(json.dumps({'sameRevisionCollisionHTTP': status, 'response': collision,
+                          'changedFiles': collision_changed}), flush=True)
+        assert status == 409 and collision['detail']['current_rev'] == 6, (status, collision)
+        assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
+        print('PASS: distinct two-device mirrors at revision6 return HTTP409 and keep protected local edit bytes exact')
         for invalid_rev in (-1, True, 6.5, "6", [], {}):
             invalid_files = {**old_mirror['files'], 'meta.json': json.dumps({'rev': invalid_rev})}
             status, rejected_rev = request('/scripts/fixture06/files', {'files': invalid_files})
@@ -141,6 +156,42 @@
         status, same_rev = request('/scripts/fixture06/files', {'files': current_bundle['files']})
         assert status == 200 and same_rev['written'] == list(script_store.FILE_NAMES)
         assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
+        status, exact_partial = request('/scripts/fixture06/files',
+                                        {'files': {'meta.json': current_bundle['files']['meta.json']}})
+        assert status == 200 and exact_partial['written'] == ['meta.json']
+        assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
+        for name in script_store.FILE_NAMES:
+            divergent = dict(current_bundle['files'])
+            if name == 'script.txt':
+                divergent[name] += '\n# another device edit\n'
+            else:
+                value = json.loads(divergent[name])
+                if name == 'meta.json':
+                    value['title'] = 'another device title'
+                else:
+                    value['cues'][0]['vi'] = 'another device translation'
+                divergent[name] = json.dumps(value)
+            status, rejected_file = request('/scripts/fixture06/files', {'files': divergent})
+            assert status == 409 and rejected_file['detail']['current_rev'] == 6, (name, status, rejected_file)
+            assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
+        fresh_files = dict(current_bundle['files'])
+        fresh_meta = json.loads(fresh_files['meta.json']); fresh_meta['rev'] = 0
+        fresh_files['meta.json'] = json.dumps(fresh_meta)
+        fresh_cues = json.loads(fresh_files['cues.json']); fresh_cues['meta'] = fresh_meta
+        fresh_files['cues.json'] = json.dumps(fresh_cues)
+        status, fresh_zero = request('/scripts/fixture10/files', {'files': fresh_files})
+        assert status == 200, (status, fresh_zero)
+        fresh_folder = root / 'subtitles/fixture10'
+        before_fresh = {p.name: p.read_bytes() for p in fresh_folder.iterdir()}
+        status, fresh_replay = request('/scripts/fixture10/files', {'files': fresh_files})
+        assert status == 200
+        assert {p.name: p.read_bytes() for p in fresh_folder.iterdir()} == before_fresh
+        (fresh_folder / 'script.txt').unlink()  # disposable missing-file recovery fixture
+        missing_before = {p.name: p.read_bytes() for p in fresh_folder.iterdir()}
+        status, missing_conflict = request('/scripts/fixture10/files', {'files': fresh_files})
+        assert status == 409 and missing_conflict['detail']['current_rev'] == 0
+        assert {p.name: p.read_bytes() for p in fresh_folder.iterdir()} == missing_before
+        print('PASS: each divergent mirror file at equal rev conflicts409; exact partial replay200; new rev0 import/replay200; existing missing equal-rev file409 without mutation')
         higher_files = dict(current_bundle['files'])
         higher_meta = json.loads(higher_files['meta.json']); higher_meta['rev'] = 7
         higher_files['meta.json'] = json.dumps(higher_meta)
@@ -150,25 +201,27 @@
         status, legacy_mirror = request('/scripts/fixture09/files',
                                        {'files': {'cues.json': current_bundle['files']['cues.json']}})
         assert status == 200 and legacy_mirror['written'] == ['cues.json']
-        print('PASS: six invalid mirror revisions HTTP400 preserve all four files; equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)')
-        # Simulate a real local revision advancing while the worker downloads a newer Drive mirror.
-        status, future = request('/scripts/save', {'video_id': 'fixture07', 'owned': True,
-                                                  'rev': 6, 'cues': [cue]})
-        assert status == 200 and future['rev'] == 7
-        status, future_bundle = request('/scripts/fixture07/files')
-        assert status == 200
-        status, removed = request('/scripts/fixture07', method='DELETE')
-        assert status == 200 and removed['deleted']
-        status, reset = request('/scripts/save', {'video_id': 'fixture07', 'owned': True,
-                                                 'rev': 5, 'cues': [newer_cue]})
-        assert status == 200 and reset['rev'] == 6
-        mirror_check = subprocess.run(['node', str(Path(__file__).with_name('sentence_drive_mirror_sanity.js'))],
-                                      input=json.dumps({'address': address, 'videoId': 'fixture07',
-                                                        'folder': str(root / 'subtitles/fixture07'),
-                                                        'files': future_bundle['files'], 'cue': newer_cue}),
-                                      text=True, capture_output=True)
-        print(mirror_check.stdout, end='', flush=True)
-        assert mirror_check.returncode == 0, mirror_check.stderr
+        print('PASS: six invalid mirror revisions HTTP400 preserve all four files; identical equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)')
+        # Preserve the two-edit stale race and add the one-edit equal-revision collision.
+        for race_id, advances in (('fixture07', 2), ('fixture08', 1)):
+            status, future = request('/scripts/save', {'video_id': race_id, 'owned': True,
+                                                      'rev': 6, 'cues': [cue]})
+            assert status == 200 and future['rev'] == 7
+            status, future_bundle = request(f'/scripts/{race_id}/files')
+            assert status == 200
+            status, removed = request(f'/scripts/{race_id}', method='DELETE')
+            assert status == 200 and removed['deleted']
+            status, reset = request('/scripts/save', {'video_id': race_id, 'owned': True,
+                                                     'rev': 5, 'cues': [newer_cue]})
+            assert status == 200 and reset['rev'] == 6
+            mirror_check = subprocess.run(['node', str(Path(__file__).with_name('sentence_drive_mirror_sanity.js'))],
+                                          input=json.dumps({'address': address, 'videoId': race_id,
+                                                            'folder': str(root / 'subtitles' / race_id),
+                                                            'files': future_bundle['files'], 'cue': newer_cue,
+                                                            'localAdvances': advances}),
+                                          text=True, capture_output=True)
+            print(mirror_check.stdout, end='', flush=True)
+            assert mirror_check.returncode == 0, mirror_check.stderr
         contenders = [{'video_id': 'fixture03', 'rev': 5, 'cues': [{**cue, 'vi': target}]}
                       for target in ('first writer', 'second writer')]
         status, initial = request('/scripts/save', {**contenders[0], 'rev': 4})
--- .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/worker-check.before.js	2026-10-11 18:13:20
+++ scripts/sentence_drive_mirror_sanity.js	2026-10-11 18:30:41
@@ -6,6 +6,9 @@
 const pull = source.slice(source.indexOf('async function pullDriveIfNewer('), source.indexOf('/** videoIds seen since the last flush'));
 const storage = { lastMirroredRev: { unrelated: 94 } }, statuses = [], restored = [];
 const disk = () => Object.fromEntries(fs.readdirSync(input.folder).map(name => [name, fs.readFileSync(input.folder + '/' + name)]));
+const advances = input.localAdvances ?? 2;
+assert.ok(advances === 1 || advances === 2);
+const finalRevision = 6 + advances;
 let before;
 async function bridgeJson(path) {
   const response = await fetch(input.address + path);
@@ -23,7 +26,7 @@
   driveChildren: async () => new Map(Object.keys(input.files).map(name => [name, name])),
   driveGetText: async name => {
     if (name === 'cues.json') {
-      for (const rev of [6, 7]) {
+      for (let rev = 6; rev < finalRevision; rev++) {
         const response = await fetch(input.address + '/scripts/save', {
           method: 'POST', headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ video_id: input.videoId, owned: true, rev,
@@ -48,12 +51,12 @@
   const result = await vm.runInContext('pullDriveIfNewer()', context);
   console.log(JSON.stringify({ result, statuses, restored, storedMirrors: storage.lastMirroredRev }));
   assert.ok(before, 'Download must happen after a real local metadata probe at rev6');
-  assert.deepEqual(disk(), before, 'Rejected mirror must keep all four revision8 files exact');
+  assert.deepEqual(disk(), before, `Rejected mirror must keep all four revision${finalRevision} files exact`);
   assert.equal(result.ok, false, 'Rejected mirror must not report a successful pull');
   assert.match(result.error, /409/);
   assert.ok(statuses.length && statuses.every(text => text.startsWith('error:')));
   assert.deepEqual(restored, []);
   assert.deepEqual(storage.lastMirroredRev, { unrelated: 94 });
-  assert.equal((await bridgeJson('/scripts/' + input.videoId + '/meta')).rev, 8);
-  console.log('PASS: real local rev6 advances to8 during production worker mirror download; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)');
+  assert.equal((await bridgeJson('/scripts/' + input.videoId + '/meta')).rev, finalRevision);
+  console.log(`PASS: real local rev6 advances to${finalRevision} during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)`);
 })().catch(error => { console.error(error); process.exitCode = 1; });


===== original plan/current source/callers/diff read =====
COMMAND:
diff -u .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/script_store.before.py local-bridge/app/services/script_store.py
sed -n '680,740p' local-bridge/app/services/script_store.py
sed -n '95,220p' scripts/sentence_script_store_sanity.py
cat scripts/sentence_drive_mirror_sanity.js
ls .tmp-sentence-mvp/mirror-equal-revision-2026-10-11
rg -n 'write_files\(' local-bridge/app
sed -n '318,326p' plan/youtube-sentence-enhancement-mvp-2026-10-10.md
EXIT: 0
RAW OUTPUT:
--- .tmp-sentence-mvp/mirror-equal-revision-2026-10-11/script_store.before.py	2026-10-11 18:10:58
+++ local-bridge/app/services/script_store.py	2026-10-11 18:29:57
@@ -704,10 +704,17 @@
     if not validated:
         raise ValueError("no known files in payload")
     with _video_lock(vid):
-        previous = _read_json(scripts_root() / vid / "meta.json")
+        folder = scripts_root() / vid
+        previous = _read_json(folder / "meta.json")
         current_rev = int(previous.get("rev") or 0) if isinstance(previous, dict) else 0
         if incoming_rev is not None and incoming_rev < current_rev:
             raise ScriptRevisionConflict(current_rev)
+        if incoming_rev == current_rev and isinstance(previous, dict):
+            # Different devices can produce the same counter; only an exact replay is safe.
+            for name, content in validated.items():
+                path = folder / name
+                if not path.is_file() or path.read_bytes() != content.encode("utf-8"):
+                    raise ScriptRevisionConflict(current_rev)
         folder = video_dir(vid)
         for name, content in validated.items():
             _atomic_write_text(folder / name, content)
            "meta.json": _dump(full_meta),
            "script.txt": txt,
        }


def write_files(video_id: str, files: dict[str, Any]) -> dict[str, Any]:
    """Drive → disk. JSON files are parsed first so a bad mirror cannot corrupt disk."""
    vid = _safe_video_id(video_id)
    validated: dict[str, str] = {}
    incoming_rev: int | None = None
    for name in FILE_NAMES:
        content = files.get(name)
        if not isinstance(content, str) or not content.strip():
            continue
        if name.endswith(".json"):
            try:
                parsed = json.loads(content)
            except ValueError as exc:
                raise ValueError(f"{name} is not valid JSON: {exc}") from exc
        if name == "meta.json" and isinstance(parsed, dict) and parsed.get("rev") is not None:
            incoming_rev = parsed["rev"]
            if type(incoming_rev) is not int or incoming_rev < 0:
                raise ValueError("meta.json rev must be a non-negative integer")
        validated[name] = content
    if not validated:
        raise ValueError("no known files in payload")
    with _video_lock(vid):
        folder = scripts_root() / vid
        previous = _read_json(folder / "meta.json")
        current_rev = int(previous.get("rev") or 0) if isinstance(previous, dict) else 0
        if incoming_rev is not None and incoming_rev < current_rev:
            raise ScriptRevisionConflict(current_rev)
        if incoming_rev == current_rev and isinstance(previous, dict):
            # Different devices can produce the same counter; only an exact replay is safe.
            for name, content in validated.items():
                path = folder / name
                if not path.is_file() or path.read_bytes() != content.encode("utf-8"):
                    raise ScriptRevisionConflict(current_rev)
        folder = video_dir(vid)
        for name, content in validated.items():
            _atomic_write_text(folder / name, content)
    written = list(validated)
    logger.info("Wrote %s from mirror → %s", ", ".join(written), folder)
    return {"ok": True, "video_id": vid, "path": str(folder), "written": written}


def delete_script(video_id: str) -> dict[str, Any]:
    """Remove data/subtitles/{videoId}/ (cues/tokens/meta/script.txt)."""
    vid = _safe_video_id(video_id)
    with _video_lock(vid):
        folder = scripts_root() / vid
        if not folder.exists():
            return {
                "ok": True,
                "video_id": vid,
                "deleted": False,
                "path": str(folder),
                "message": "not found",
            }
        shutil.rmtree(folder)
        logger.info("Deleted script folder %s", folder)
        assert status == 409, (status, stale)
        assert stale['detail']['current_rev'] == saved['rev']
        assert {p.name: p.read_bytes() for p in folder.iterdir()} == before_stale
        print('PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks')
        status, mirror = request('/scripts/fixture01/files')
        assert status == 200, (status, mirror)
        mirror_before = {p.name: p.read_bytes() for p in folder.iterdir()}
        malformed = {**mirror['files'], 'cues.json': json.dumps({'cues': []}), 'meta.json': '{broken'}
        status, rejected = request('/scripts/fixture01/files', {'files': malformed})
        changed = [p.name for p in folder.iterdir() if p.read_bytes() != mirror_before[p.name]]
        print(json.dumps({'malformedMirrorHTTP': status, 'response': rejected,
                          'changedFiles': changed}), flush=True)
        assert status == 400, (status, rejected)
        assert not changed, f'Rejected mirror modified disk: {changed}'
        status, imported = request('/scripts/fixture01/files', {'files': mirror['files']})
        assert status == 200 and imported['written'] == list(script_store.FILE_NAMES), (status, imported)
        status, roundtrip = request('/scripts/fixture01/files')
        assert status == 200 and roundtrip['files'] == mirror['files'], (status, roundtrip)
        print('PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files')
        status, old_mirror = request('/scripts/fixture06/files')
        assert status == 404, (status, old_mirror)
        status, mirror_initial = request('/scripts/save', {'video_id': 'fixture06', 'owned': True,
                                                         'rev': 4, 'cues': [cue]})
        assert status == 200 and mirror_initial['rev'] == 5
        status, old_mirror = request('/scripts/fixture06/files')
        assert status == 200, (status, old_mirror)
        newer_cue = {**cue, 'vi': 'Chỉnh sửa mới hơn của người dùng'}
        status, newer = request('/scripts/save', {'video_id': 'fixture06', 'owned': True,
                                                'rev': 5, 'cues': [newer_cue]})
        assert status == 200 and newer['rev'] == 6
        mirror_folder = root / 'subtitles/fixture06'
        before_old_mirror = {p.name: p.read_bytes() for p in mirror_folder.iterdir()}
        status, old_rejected = request('/scripts/fixture06/files', {'files': old_mirror['files']})
        changed = [p.name for p in mirror_folder.iterdir() if p.read_bytes() != before_old_mirror[p.name]]
        print(json.dumps({'staleMirrorHTTP': status, 'response': old_rejected,
                          'changedFiles': changed}), flush=True)
        assert status == 409 and old_rejected['detail']['current_rev'] == 6, (status, old_rejected)
        assert not changed, f'Stale mirror changed protected rev6: {changed}'
        print('PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical')
        collision_files = dict(old_mirror['files'])
        collision_meta = json.loads(collision_files['meta.json'])
        collision_meta.update({'rev': 6, 'deviceId': 'other-device'})
        collision_files['meta.json'] = json.dumps(collision_meta)
        collision_cues = json.loads(collision_files['cues.json'])
        collision_cues['meta'] = collision_meta
        collision_files['cues.json'] = json.dumps(collision_cues)
        status, collision = request('/scripts/fixture06/files', {'files': collision_files})
        collision_changed = [p.name for p in mirror_folder.iterdir()
                             if p.read_bytes() != before_old_mirror[p.name]]
        print(json.dumps({'sameRevisionCollisionHTTP': status, 'response': collision,
                          'changedFiles': collision_changed}), flush=True)
        assert status == 409 and collision['detail']['current_rev'] == 6, (status, collision)
        assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
        print('PASS: distinct two-device mirrors at revision6 return HTTP409 and keep protected local edit bytes exact')
        for invalid_rev in (-1, True, 6.5, "6", [], {}):
            invalid_files = {**old_mirror['files'], 'meta.json': json.dumps({'rev': invalid_rev})}
            status, rejected_rev = request('/scripts/fixture06/files', {'files': invalid_files})
            assert status == 400, (invalid_rev, status, rejected_rev)
            assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
        status, current_bundle = request('/scripts/fixture06/files')
        assert status == 200
        status, same_rev = request('/scripts/fixture06/files', {'files': current_bundle['files']})
        assert status == 200 and same_rev['written'] == list(script_store.FILE_NAMES)
        assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
        higher_files = dict(current_bundle['files'])
        higher_meta = json.loads(higher_files['meta.json']); higher_meta['rev'] = 7
        higher_files['meta.json'] = json.dumps(higher_meta)
        status, higher_rev = request('/scripts/fixture06/files', {'files': higher_files})
        assert status == 200, (status, higher_rev)
        assert json.loads((mirror_folder / 'meta.json').read_text())['rev'] == 7
        status, legacy_mirror = request('/scripts/fixture09/files',
                                       {'files': {'cues.json': current_bundle['files']['cues.json']}})
        assert status == 200 and legacy_mirror['written'] == ['cues.json']
        print('PASS: six invalid mirror revisions HTTP400 preserve all four files; identical equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)')
        # Preserve the two-edit stale race and add the one-edit equal-revision collision.
        for race_id, advances in (('fixture07', 2), ('fixture08', 1)):
            status, future = request('/scripts/save', {'video_id': race_id, 'owned': True,
                                                      'rev': 6, 'cues': [cue]})
            assert status == 200 and future['rev'] == 7
            status, future_bundle = request(f'/scripts/{race_id}/files')
            assert status == 200
            status, removed = request(f'/scripts/{race_id}', method='DELETE')
            assert status == 200 and removed['deleted']
            status, reset = request('/scripts/save', {'video_id': race_id, 'owned': True,
                                                     'rev': 5, 'cues': [newer_cue]})
            assert status == 200 and reset['rev'] == 6
            mirror_check = subprocess.run(['node', str(Path(__file__).with_name('sentence_drive_mirror_sanity.js'))],
                                          input=json.dumps({'address': address, 'videoId': race_id,
                                                            'folder': str(root / 'subtitles' / race_id),
                                                            'files': future_bundle['files'], 'cue': newer_cue,
                                                            'localAdvances': advances}),
                                          text=True, capture_output=True)
            print(mirror_check.stdout, end='', flush=True)
            assert mirror_check.returncode == 0, mirror_check.stderr
        contenders = [{'video_id': 'fixture03', 'rev': 5, 'cues': [{**cue, 'vi': target}]}
                      for target in ('first writer', 'second writer')]
        status, initial = request('/scripts/save', {**contenders[0], 'rev': 4})
        assert status == 200 and initial['rev'] == 5
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda body: request('/scripts/save', body), contenders))
        assert sorted(status for status, _ in outcomes) == [200, 409], outcomes
        winner = next(i for i, (status, _) in enumerate(outcomes) if status == 200)
        status, concurrent = request('/scripts/fixture03')
        assert status == 200 and concurrent['meta']['rev'] == 6
        assert concurrent['cues'][0]['vi'] == contenders[winner]['cues'][0]['vi']
        print('PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6')
        status, legacy = request('/scripts/save', {'video_id': 'fixture04', 'cues': [cue]})
        assert status == 200 and legacy['rev'] == 1
        status, legacy = request('/scripts/save', {'video_id': 'fixture04', 'cues': [cue]})
        assert status == 200 and legacy['rev'] == 2
        print('PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)')
        projection_rows = [cue, *[{'id': ident, 'source': source, 'start_media_time': start,
                                  'end_media_time': end, 'vi': '', 'en': '', 'text_source': 'yt',
                                  'mt_locked': False, 'translation_source': ''}
                                 for ident, source, start, end in (
                                     ('yt-a', 'どこ', 6.001, 7.002),
                                     ('yt-b', '行くんですか?', 7.002, 8.003))]]
        status, projection_saved = request('/scripts/save', {'video_id': 'fixture02', 'owned': True,
                                                            'rev': 8, 'cues': projection_rows})
        assert status == 200 and projection_saved['rev'] == 9, (status, projection_saved)
        original_pid = process.pid
        stop_server()
        address = start_server()
        assert process.pid != original_pid, 'Restart must use a fresh process'
        status, restarted = request('/scripts/fixture01')
        assert status == 200 and restarted == loaded, (status, restarted, loaded)
/** Production worker mirror/pull functions + real disposable bridge HTTP; cloud adapters are isolated fixtures. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const source = fs.readFileSync(require.resolve('../extension/background/service_worker.js'), 'utf8');
const mirror = source.slice(source.indexOf('async function mirrorFromDrive('), source.indexOf('/** Content scripts need tabs.sendMessage'));
const pull = source.slice(source.indexOf('async function pullDriveIfNewer('), source.indexOf('/** videoIds seen since the last flush'));
const storage = { lastMirroredRev: { unrelated: 94 } }, statuses = [], restored = [];
const disk = () => Object.fromEntries(fs.readdirSync(input.folder).map(name => [name, fs.readFileSync(input.folder + '/' + name)]));
const advances = input.localAdvances ?? 2;
assert.ok(advances === 1 || advances === 2);
const finalRevision = 6 + advances;
let before;
async function bridgeJson(path) {
  const response = await fetch(input.address + path);
  assert.equal(response.status, 200);
  return response.json();
}
const context = vm.createContext({
  fetch, Date, Map, encodeURIComponent, console,
  chrome: { storage: { local: {
    get: async () => structuredClone(storage),
    set: async patch => Object.assign(storage, structuredClone(patch)),
  } } },
  driveConnected: async () => true,
  driveList: async () => [{ id: 'fixture-folder', name: input.videoId }],
  driveChildren: async () => new Map(Object.keys(input.files).map(name => [name, name])),
  driveGetText: async name => {
    if (name === 'cues.json') {
      for (let rev = 6; rev < finalRevision; rev++) {
        const response = await fetch(input.address + '/scripts/save', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_id: input.videoId, owned: true, rev,
            cues: [{ ...input.cue, vi: 'new local edit revision ' + (rev + 1) }] }),
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).rev, rev + 1);
      }
      before = disk();
    }
    return input.files[name];
  },
  bridgeJson,
  notifyDriveRestored: async ids => restored.push(...ids),
  pullVocabSnapshot: async () => ({}), syncSettingsOnConnect: async () => null,
  driveQueued: async fn => fn(), setDriveStatus: async text => statuses.push(text),
});
vm.runInContext(`const BRIDGE=${JSON.stringify(input.address)},DRIVE_FOLDER_ID='fixture',DRIVE_FOLDER_MIME='application/vnd.google-apps.folder';
  const MIRROR_FILES=['cues.json','meta.json','script.txt'],_freshCheckedAt=new Map(); let _driveBusy=false;
  ${mirror}${pull}`, context);
(async () => {
  const result = await vm.runInContext('pullDriveIfNewer()', context);
  console.log(JSON.stringify({ result, statuses, restored, storedMirrors: storage.lastMirroredRev }));
  assert.ok(before, 'Download must happen after a real local metadata probe at rev6');
  assert.deepEqual(disk(), before, `Rejected mirror must keep all four revision${finalRevision} files exact`);
  assert.equal(result.ok, false, 'Rejected mirror must not report a successful pull');
  assert.match(result.error, /409/);
  assert.ok(statuses.length && statuses.every(text => text.startsWith('error:')));
  assert.deepEqual(restored, []);
  assert.deepEqual(storage.lastMirroredRev, { unrelated: 94 });
  assert.equal((await bridgeJson('/scripts/' + input.videoId + '/meta')).rev, finalRevision);
  console.log(`PASS: real local rev6 advances to${finalRevision} during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
candidate
candidate-manifest.json
client-manifest.json
http-check.before.py
http-first-green.log
http-red.log
http-worker-green.log
script_store.before.py
selected-candidate-check.py
service_worker.candidate.js
worker-check.before.js
local-bridge/app/services/script_store.py:685:def write_files(video_id: str, files: dict[str, Any]) -> dict[str, Any]:
local-bridge/app/api/scripts.py:122:        return write_files(video_id, body.files or {})
1. Đọc cấu trúc/version đã tồn tại; audit mọi serializer ở extension, bridge, export/import và Drive.
2. Đặt `schemaVersion` riêng cho **enhancement data**; không sửa ngay các trường script cũ.
3. Khi đọc: support dữ liệu không có enhancement → dựng lại group từ track; giữ mọi user edits/locks.
4. Khi ghi: atomic write/version check; không overwrite bản mới bằng response/request có revision cũ.
5. Nếu client cũ không thể giữ trường mới, **không cho đường write đó mutate enhancement**; cô lập sidecar hoặc migration có feature gate.
6. Chỉ bật Drive sync cho metadata mới khi đã có test tương thích (hoặc protocol version và rollback). Sync hiện có của dữ liệu cũ vẫn phải hoạt động.

---



Only this ignored report artifact was written by reviewer; no reviewed source or raw plan/review document or live runtime/data was modified.

```
