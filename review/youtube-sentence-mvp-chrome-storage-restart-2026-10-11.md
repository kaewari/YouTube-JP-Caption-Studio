<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Thực hiện plan, không dừng giữa chừng -->
# Real Chrome MV3 local storage restart regression

STATUS: PASS for the new isolated Chrome worker/storage integration test. Full STORE-02/native restore/Drive/Gemini/MVP: NOT VERIFIED.

## Change and acceptance scope

Added one reusable runnable check: `scripts/sentence_chrome_storage_sanity.cjs` (112lines, SHA256518fdf52a7551143ea501bc75ac21b706ec96b2bafd2255d4a2449d603d1ff70). No production behavior, app source, runtime process, production state, key, sync configuration or native user Chrome window changed. Existing installed Playwright/Chromium and standard library are reused; no dependency installation. New integration test, not a bugfix Red/Green cycle.

This advances plan §7.2/STORE-02/§11.3 by exercising the actual extension message listener and MV3 worker in Chromium151.0.7922.34 with real `chrome.storage.local`, including a full browser close/relaunch. It uses a fresh synthetic profile, not the user's profile. A copied extension has only bridge URLs in worker/manifest changed to an isolated random-port HTTP503 deny server. Independent audit found82copied files; all80other files byte-identical. Provider/cloud paths are not invoked by the workflow, no credentials are present. This is not an exhaustive certification of every browser background connection.

Request path: extension own page → chrome.runtime.sendMessage SAVED_CUES_MUTATE → current worker listener → handleSavedCueMutation → existing withSavedStateWrite → real Chrome local storage → message response. There is no bridge/database route in this local-only path; the deny server recorded four real GET/POST `/extension_state`503 requests from startup, so no success response is fabricated.

Criteria independently VERIFIED: immediately read exact transcript/meta after save_script; immediately read exact sidecar after save_sentence_state; restore_video retains protected locked blank VI/manual EN/precise clocks/owned/string tombstones/nonempty group targets/tokens/Undo/saved sentence plus saved-other-video; full Chromium close/relaunch keeps exact payload; stale script AND sidecar rev7 are skipped and cannot alter rev8 storage. Production Groups supplies actual group IDs/revisions. Synthetic Undo marker and recovery envelope are opaque storage fixtures, not a proof of valid full content backup or applied Undo.

Reviewer identified that the first variant only checked storage after restore, which could mask a missing earlier save. Final source adds real intermediate reads/assertions, uses string tombstones and production group identities, and covers stale sidecar. Initial passing run is historical and does not establish the final criteria. No assertions weakened/removed.

## Parent final execution

Working directory: `/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio`

```sh
NODE_PATH=/Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sentence_chrome_storage_sanity.cjs .tmp-sentence-chrome-storage-final-2026-10-11
```

Session42488, exit0; actual stdout:

```text
PASS: actual MV3 save/sidecar/restore worker, locked blank target, owned/deleted metadata, nonempty Undo/translations/tokens and saved-other preservation
PASS: whole Chromium close/relaunch preserves exact payload; stale rev7 cannot replace rev8
{"browser":"151.0.7922.34","blockedBridgeRequests":4,"result":"/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-chrome-storage-final-2026-10-11/result.json","scope":"Actual MV3 messages/chrome.storage/browser restart; synthetic data. No content restore UI, projection validation, bridge/disk, Drive, Gemini or gold/KPI proof."}
```

Actual result8520bytes/SHA256606637103671dca9f4cc8f3b707a9c7becba3a2171cadc564594367ab34f1832; reviewer fresh profile result has identical payload/hash. Review of new-file diff used `git diff --no-index -- /dev/null scripts/sentence_chrome_storage_sanity.cjs`, exit1 indicating the expected new-file difference. Parent `git diff --no-index --check -- /dev/null scripts/sentence_chrome_storage_sanity.cjs` also exit1 with empty stdout/stderr, no whitespace diagnostics; do not report that command as exit0. Reviewer syntax/scoped check actual commands below exit0; scoped git diff ignores untracked files, so behavioral evidence is the real browser run. Global hook still reports original byte-preserved plan line6 Markdown hard break; it was not modified.

## Open requirements

This closes real Chrome local worker storage/restart evidence in the bounded synthetic matrix. It does not close content-script restore validation/projection, source-change invalidation, actual UI import/export/recovery/Undo/seek or installed-user-profile behavior. Bridge disk/restart, real Drive/old-client compatibility,5videos/audio gold, actual Gemini VI/EN cold/warm/readiness/latency/cost and full release remain required at their original scope. Prior tests/evidence retain their stated boundaries. Full goal is active and incomplete.

A concise pending user question requests self-saving the existing Gemini key in the current Katou Caption Studio because its actual UI reports unconfigured; no request to reveal a key or remember its old location. No answer assumed and no dependent provider work started. Quota warning is not a pause instruction.

Independent report read from disk and hash verified:6054bytes/70lines, SHA2569eb8934e32a9cca197392e0dbec12ffea8e1cf5f8930aa4eb18d7d426da1b77f. Verbatim:

STATUS: PASS — bounded new MV3 Chrome storage integration test. Full STORE-02/content restore/native UI/MVP NOT VERIFIED.

REQUIREMENTS:
VERIFIED: fresh unique ignored profile; existing stage refused; copied extension only. Independent byte audit found82files and exactly worker/manifest bridge endpoint substitutions, all other bytes equal.
VERIFIED: actual production MV3 runtime message listener/worker, real chrome.storage.local. Final test independently reads/asserts transcript+meta immediately after save_script and state immediately after save_sentence_state before restore can overwrite either. Initial test-quality gap is closed.
VERIFIED: synthetic owned rev8, string tombstone, user edit, locked blank VI, precise clocks, nonempty sidecar translations/tokens/Undo and saved-other entries preserved through actual restore_video message and whole Chromium close/relaunch.
VERIFIED: production Groups generates automatic group ID/revision. Synthetic Undo marker and recovery envelope are storage fixtures; no claim content serializer/restoration validation accepts them.
VERIFIED: stale rev7 script AND sidecar messages rejected with stale_revision after restart; exact storage payload unchanged.
VERIFIED: actual random-port503 deny server receives4bridge requests; no live8765 script calls. Application profile has no provider/Drive credentials; no user Chrome profile accessed. This does not certify all possible browser background network traffic.
VERIFIED: no assertions skipped/removed; only new integration harness change. Parent strengthened earlier version with immediate storage assertions, valid string tombstones and production group metadata. New integration check, not bugfix Red/Green.
NOT VERIFIED: content restore UI/projection/revision invalidation after loader, full backup validity/recovery rollback, installed user Chrome, bridge/disk, Drive/cloud, Gemini, Swift, fullSTORE-02 or MVP/gold/KPI.

COMMANDS:
Working directory /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
Exact final run:
NODE_PATH=/Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sentence_chrome_storage_sanity.cjs .tmp-sentence-chrome-storage-independent-final-2026-10-11
Exit:0
Actual stdout:
PASS: actual MV3 save/sidecar/restore worker, locked blank target, owned/deleted metadata, nonempty Undo/translations/tokens and saved-other preservation
PASS: whole Chromium close/relaunch preserves exact payload; stale rev7 cannot replace rev8
{"browser":"151.0.7922.34","blockedBridgeRequests":4,"result":"/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-chrome-storage-independent-final-2026-10-11/result.json","scope":"Actual MV3 messages/chrome.storage/browser restart; synthetic data. No content restore UI, projection validation, bridge/disk, Drive, Gemini or gold/KPI proof."}

Exact independent copy/result audit:
```sh
python3 - <<'PY'
from pathlib import Path
import json,hashlib,re
stage=Path('.tmp-sentence-chrome-storage-independent-final-2026-10-11')
src=Path('extension');copy=stage/'extension'
r=json.loads((stage/'result.json').read_text())
assert r['before']==r['after'] and r['stale']['skipped']==r['staleState']['skipped']=='stale_revision'
endpoint=re.search(r'http://127\.0\.0\.1:\d+', (copy/'background/service_worker.js').read_text()).group()
files={str(p.relative_to(src)) for p in src.rglob('*') if p.is_file()}
assert files=={str(p.relative_to(copy)) for p in copy.rglob('*') if p.is_file()}
adapted={'background/service_worker.js','manifest.json'}
for rel in files:
 a=(src/rel).read_bytes();b=(copy/rel).read_bytes()
 if rel in adapted:
  expected=a.decode().replace('http://127.0.0.1:8765',endpoint).replace('http://localhost:8765',endpoint).encode()
  assert expected==b and a!=b
 else:assert a==b
assert len(r['blocked'])==4 and all(v['method'] in ['GET','POST'] for v in r['blocked'])
print('PASS: copied extension '+str(len(files))+' files; exactly worker/manifest bridge endpoint substitutions; all other bytes equal')
print('PASS: actual result before==after; stale script and state both rejected; four deny-server bridge requests recorded')
print('test SHA256='+hashlib.sha256(Path('scripts/sentence_chrome_storage_sanity.cjs').read_bytes()).hexdigest())
print('result SHA256='+hashlib.sha256((stage/'result.json').read_bytes()).hexdigest())
PY
```
Exit:0
Actual stdout:
PASS: copied extension 82 files; exactly worker/manifest bridge endpoint substitutions; all other bytes equal
PASS: actual result before==after; stale script and state both rejected; four deny-server bridge requests recorded
test SHA256=518fdf52a7551143ea501bc75ac21b706ec96b2bafd2255d4a2449d603d1ff70
result SHA256=606637103671dca9f4cc8f3b707a9c7becba3a2171cadc564594367ab34f1832

Syntax: /Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check scripts/sentence_chrome_storage_sanity.cjs
Exit:0; stdout/stderr empty.
Scoped whitespace: git diff --check -- scripts/sentence_chrome_storage_sanity.cjs
Exit:0; stdout/stderr empty.
Global hook warning is unchanged immutable revised-plan line6 hard break; not altered.

API_CHECKS:
Actual extension chrome.runtime.sendMessage + chrome.storage.local; Chromium151.0.7922.34.
Isolated bridge deny HTTP503; successful local storage despite unavailable bridge. No production endpoints/provider/cloud requested by test workflow.
DATABASE_CHECKS:
Only fresh disposable browser profile local storage; exact before/after payload persisted. No production database mutation.

PROBLEMS / REQUIRED_FIXES:
No blocker remains for this bounded test. Earlier historical run omitted immediate save operation assertions; reviewer identified it and final test now includes them. Earlier result remains historical, not final evidence. No UI pixel/layout proof claimed because test does not test UI interaction/layout.
Reviewer did not edit production or harness; only ignored report/evidence generated.
