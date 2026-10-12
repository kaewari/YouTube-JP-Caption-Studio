<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Thực hiện plan, không dừng giữa chừng -->
# Actual content restore and Undo across video reload

STATUS: PASS for the bounded shared-loader fix, actual isolated Chromium restore UI/API/disk workflow, and guarded main extension delivery. Installed user Chrome activation/full STORE-02/Drive/Gemini/MVP: NOT VERIFIED.

## Defect and minimal change

The actual content/sidepanel test reproduced Undo fragments reverting to a merged sentence after a fresh video-document reload. Chrome local storage retained two valid revision-bound Undo entries, while the in-memory content projection had not loaded the sidecar. The owned saved-script navigation path returned through `tryApplySavedScript` before optional translation/mode/export paths called `loadSentenceState`. Loading saved cues then publishing/auto-saving without loading sidecar could also omit the in-memory state.

Current on-disk shared loader has four callers: Drive refresh, manual refresh, script load and navigation. The production change is exactly three added lines after `cues = fromScript`/`listDirty = true`: await the existing sidecar loader, then recheck generation/video. This reuses existing validation/projection helpers and precedes enrich/render/publish/save; no dependency, schema or abstraction added. Current-turn baseline content SHA2563df13459266dbb5f601aea703df6052123a81e611efdf5cf1fba50bbf569c5dc; final6999d4ac84de88b0c7886c4a024f368bb59196542d41a1087b0067fad88a1ef8.

Added runnable `scripts/sentence_chrome_restore_sanity.cjs` SHA2564be31e841eae79b17eb2d6ea7b190c3e1eae4a6a8c9266b400e1d2a627a26131. Existing installed Playwright/Chromium and real disposable FastAPI script router are reused. Actual real YouTube page HTTP200, production content/sidepanel/MV3, fresh synthetic profile/data. Only copied worker/manifest bridge URLs adapt to random isolated port; all80other copied files exact. No user profile/key/cloud workflow or active Antigravity scripts endpoint used. Child process termination awaited exit0. Expected unsupported health/state/tokenize routes in isolated script-only API may return404; no canned production success.

The cue-identity VM fixture now explicitly stubs the newly awaited sidecar dependency, because it isolates cue identity; the real loader is tested by the Chromium workflow. All existing assertions preserved. This test stub is not production logic or evidence of sidecar behavior.

## Red, harness corrections, Green

Parent actual pre-fix run:
`NODE_PATH=/Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sentence_chrome_restore_sanity.cjs .tmp-sentence-chrome-restore-ui-2026-10-11`

Session12625 exit1 at exact reloaded-row assertion: actual a/b showed `乗せてないんですか？` twice; expected Undo fragments `乗せて` and `ないんですか？`; protected row unchanged. Actual failure panel text/screenshot and own-profile storage inspection retained in that ignored stage, including `undo-failure-storage.json` showing exact two Undo revisions. Full parent failure stderr was not saved as a separate file; observed exit/assertion is recorded from the terminal event. Independent pre-fix run instead timed out at freshness predicate; its displayed merged texts support the observation but are not misreported as the direct exact-row Red.

Initial readiness race and two-row count assumption were harness problems, not production defects: document_idle listener must be ready; two logical groups deliberately occupy three authentic source windows. Final assertions preserve exact full group text/window rows and exact Undo fragments. Reviewer found partial SP_STATE overwriting a full payload; observer now retains only actual full cues payloads. These corrections are qualified separately from the production Undo defect. Errors/warnings appended to local-bridge/errors.log.

Parent final command (cwd this worktree):
```sh
NODE_PATH=/Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sentence_chrome_restore_sanity.cjs .tmp-sentence-chrome-restore-final-2026-10-11
```
Session32441 exit0; actual stdout:
```text
PASS: real YouTube content + actual sidepanel restore/toggle/Undo/reload/export/recovery UI; geometry measured at each transition
PASS: actual isolated script HTTP200 parsed response and disk preserve locked blank target and clocks
NOT VERIFIED: natural caption/audio quality, installed user Chrome, Drive, Gemini, full MVP
```

Actual result10316bytes SHA25627a4d22c7a3b9bd8ca9fd22265871cc898e60d06c77e4b353174eebaeb7a222e. File input/Apply restore → Original → Enhanced → Undo → fresh document reload → actual JSON download → recovery executed. Before/after width/height/top/left measured at six transitions. Undo/reload row IDs/text exact; reviewer geometry delta0px for those two snapshots. No assertion that every transition or screenshot capture has identical geometry.

Parsed actual GET/scripts/ylnxFdPhLCo HTTP200 and cues.json retain eight source/target/provenance/clock fields, locked blank VI and manual EN with65.1234567–67.7654321 clocks. Export retains owned/tombstones/two Undo entries. Recovery returns original baseline source/target/lock/clocks in real Chrome storage and actual script API, owned/tombstones in Chrome storage. Matrix is synthetic and bounded; not every recovery saved/cache variant covered.

Image after Undo and reload: [actual isolated screenshot](../.tmp-sentence-chrome-restore-final-2026-10-11/undo-reloaded.png),47276bytes SHA2567545ade53c2c61d5f7a3bbc065f26a329228a33d2977036d3e6d97c698cdf46a.

Applicable regressions independently exit0: `node scripts/sentence_cache_identity_sanity.js` four PASS lines; `node scripts/sentence_source_restore_sanity.js`36behavioral checks; `node --check extension/content/content.js`; `node --check scripts/sentence_chrome_restore_sanity.cjs`; scoped `git diff --check`. Syntax/whitespace are not runtime proof. New untracked test is not included by tracked git diff; actual Chromium execution supplies behavioral proof. Global hook's byte-preserved original plan line6 Markdown hard-break remains a preexisting warning, not a rejection; no immutable plan rewrite performed.

## Guarded main delivery and remaining requirements

Main extension content delivered only after bounded independent Green. Guard checked exact original/final SHA before copying, made byte/mode-preserved ignored backup, verified exactly1changed/85unchanged among86main files. Mode0644 retained. Fresh independent audit below checks current inventory and original backup, exact three-line delta and main/worktree bytes. Main backup/receipt in `.tmp-sentence-chrome-restore-final-2026-10-11/`. No active bridge source/process/data actions in this frontend update. Installed user Chrome activation still NOT VERIFIED; earlier quiet window consumed, fresh availability question pending without assuming reply.

Full goal remains active/incomplete. This supersedes the previous content-restore-untested status only for this synthetic real UI workflow. Source-change invalidation/navigation race variants, installed user profile, actual Drive/Swift/old-client compatibility,5videos/50audio-reviewed gold, Gemini VI/EN cold/warm readiness/latency/cost/KPI and release remain open. Existing native102cue artifacts and historical48-file deployment audit retain their original point-in-time scope; no perpetual production-data equality inference.

## Independent behavioral report (verbatim)

11051bytes/109lines SHA256ef1fc255ea6835a1ffb3c630ea7658dcb89eb7c2353ff9de328cb83b0c164937; reread and hash verified before filing.

````text
STATUS: PASS — bounded shared-loader fix and isolated real Chromium restore/Undo/reload workflow. Full MVP/native user-profile activation NOT VERIFIED.

REQUIREMENTS:
VERIFIED: original plan STORE-02 reload/roundtrip fidelity reviewed against current content loader and real sidepanel commands. Only production delta is three lines in tryApplySavedScript: await existing loadSentenceState before enrichment/render/publish/auto-save, plus existing gen/video stale guard and explanatory comment.
VERIFIED: shared loader called from Drive refresh, manual refresh, script load and navigate (four caller sites plus definition); loadSentenceState internally checks generation/source and rebuilds projection. No new dependency/schema/abstraction.
VERIFIED: actual real YouTube HTTP200 page, production content script, production extension sidepanel and MV3 transport; file upload/Apply restore UI, Original then Enhanced full group text in each authentic source window, Undo fragments, fresh video-document session and reload with identical fragment IDs/text, actual JSON download/export, recovery to prior protected baseline.
VERIFIED: isolated real FastAPI script route GET200 parsed response and cues.json fields equal input for id/source/vi/en/text_source/translation_source/start/end. Locked blank VI and exact65.1234567–67.7654321 clocks retained; tombstones owned and Undo export preserved.
VERIFIED: recovery Chrome storage and isolated HTTP return original baseline source/VI/user target/lock/clocks and owned/tombstones. No claim every recovery metadata/cache/saved entry variant covered.
VERIFIED: six transition DOM rectangles recorded in real Chromium; all finite positive. Undo->reload width/height/top/left max deltas0. Other transitions intentionally change row text/count/height; no general invariant claim. Enhanced screenshot and rect capture are separate instants (captured108px vs later screenshot visible three text lines); no simultaneous geometry inference.
VERIFIED: copied82extensionfiles byte-equal except only worker/manifest bridge URL adaptation. Fresh profile and disposable API root/randomport, device-ID/log paths redirected; no live8765 scripts APIs/user profile/Drive/Gemini.
VERIFIED: isolated child SIGTERM awaited exit0; server stderr0bytes.
NOT VERIFIED: source-change revision invalidation/new navigation race execution, all reload caller variants, actual installed user Chrome, natural timedtext/audio/group quality, Gemini/provider, realDrive/Swift/cloud, fullMVP/gold/KPI.

REPRO QUALIFICATION:
Parent reported exact row-based pre-fix Red. Reviewer own pre-fix extension snapshot SHA3df13459266dbb5f601aea703df6052123a81e611efdf5cf1fba50bbf569c5dc was copied before source edit.
Own command:
NODE_PATH=/Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sentence_chrome_restore_sanity.cjs .tmp-sentence-chrome-restore-independent-red-2026-10-11
Own exit1:
page.waitForFunction: Timeout30000ms exceeded at scripts/sentence_chrome_restore_sanity.cjs:122:17.
This failed at freshness predicate, not the exact-row assertion. Own failure-1.txt actual panel shows merged sentence twice after reload (supporting observed Undo loss), but do not present own timeout as the direct exact-row Red. Harness observer replaced latest full state with partial SP_STATE; final observer retains only full cues payloads. Reviewer initially hypothesized projected cue IDs, then corrected it after reading publishSidePanelState: cues remain raw IDs, enhancedCues separate.
Initial2-row assumption also contradicted current contract: production Groups probe returns2logicalgroups/3displayUnits, merged text in a60–61 and b61–63 authentic source windows, protected window unchanged. This was harness correction, not a production bug or natural quality proof.

COMMANDS:
Cwd /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio
Independent final Green:
NODE_PATH=/Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/hoangson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sentence_chrome_restore_sanity.cjs .tmp-sentence-chrome-restore-independent-green-2026-10-11
Exit0; actual stdout:
PASS: real YouTube content + actual sidepanel restore/toggle/Undo/reload/export/recovery UI; geometry measured at each transition
PASS: actual isolated script HTTP200 parsed response and disk preserve locked blank target and clocks
NOT VERIFIED: natural caption/audio quality, installed user Chrome, Drive, Gemini, full MVP

Independent actual artifact/byte audit:
```sh
python3 - <<'PY'
from pathlib import Path
import json,hashlib,math,re
h=Path('.tmp-sentence-chrome-restore-independent-green-2026-10-11');r=json.loads((h/'result.json').read_text())
assert r['actualPageStatus']==200
for stage in ['before','restored','enhanced','undone','reloaded','recovered']:
 rows=r[stage]
 assert all(math.isfinite(x[k]) for x in rows for k in ['width','height','top','left'])
 assert all(x['width']>0 and x['height']>0 for x in rows)
 print(stage+': '+json.dumps({'rows':len(rows),'rects':[[x[k] for k in ['width','height','top','left']] for x in rows]}))
assert [(x['id'],x['text']) for x in r['reloaded']]==[(x['id'],x['text']) for x in r['undone']]
delta={k:max(abs(a[k]-b[k]) for a,b in zip(r['undone'],r['reloaded'])) for k in ['width','height','top','left']}
print('Undo->reload max absolute geometry delta: '+json.dumps(delta))
inp=json.loads((h/'input-backup.json').read_text())
for k in ['id','source','vi','en','text_source','translation_source','start_media_time','end_media_time']:
 assert [c.get(k) for c in r['exported']['cues']]==[c.get(k) for c in inp['cues']]==[c.get(k) for c in r['disk']['cues']]
assert r['exported']['cues'][2]['mt_locked']==r['disk']['cues'][2]['mt_locked']==True
assert len(r['exported']['enhancement']['undoRevisions'])==2
src=Path('extension');copy=h/'extension'
files={str(p.relative_to(src)) for p in src.rglob('*') if p.is_file()}
assert files=={str(p.relative_to(copy)) for p in copy.rglob('*') if p.is_file()}
for rel in files:
 a=(src/rel).read_bytes();b=(copy/rel).read_bytes()
 if rel in ['background/service_worker.js','manifest.json']:
  assert a.decode().replace('http://127.0.0.1:8765',r['bridge']).replace('http://localhost:8765',r['bridge']).encode()==b
 else:assert a==b
print('PASS: own actual real DOM rectangles all positive; reload row IDs/text exact; export/API exact eight-field payload + locked blank protected target; two Undo revisions')
print('PASS: '+str(len(files))+' extension files exact except worker/manifest endpoint adapter; isolated server stderr='+str((h/'server-stderr.txt').stat().st_size)+' bytes')
for p in [Path('extension/content/content.js'),Path('scripts/sentence_chrome_restore_sanity.cjs'),h/'result.json']:
 print(str(p)+' SHA256='+hashlib.sha256(p.read_bytes()).hexdigest())
PY
```
Exit0; actual stdout:
before: {"rows": 1, "rects": [[1252, 141.984375, 55, 14]]}
restored: {"rows": 3, "rects": [[1252, 141.984375, 55, 14], [1252, 141.984375, 208.984375, 14], [1252, 141.984375, 362.96875, 14]]}
enhanced: {"rows": 3, "rects": [[1252, 108, 55, 14], [1252, 108, 175, 14], [1252, 108, 295, 14]]}
undone: {"rows": 3, "rects": [[1252, 141.984375, 55, 14], [1252, 141.984375, 208.984375, 14], [1252, 141.984375, 362.96875, 14]]}
reloaded: {"rows": 3, "rects": [[1252, 141.984375, 55, 14], [1252, 141.984375, 208.984375, 14], [1252, 141.984375, 362.96875, 14]]}
recovered: {"rows": 1, "rects": [[1252, 141.984375, 55, 14]]}
Undo->reload max absolute geometry delta: {"width": 0, "height": 0.0, "top": 0, "left": 0}
PASS: own actual real DOM rectangles all positive; reload row IDs/text exact; export/API exact eight-field payload + locked blank protected target; two Undo revisions
PASS: 82 extension files exact except worker/manifest endpoint adapter; isolated server stderr=0 bytes
extension/content/content.js SHA256=6999d4ac84de88b0c7886c4a024f368bb59196542d41a1087b0067fad88a1ef8
scripts/sentence_chrome_restore_sanity.cjs SHA256=4be31e841eae79b17eb2d6ea7b190c3e1eae4a6a8c9266b400e1d2a627a26131
.tmp-sentence-chrome-restore-independent-green-2026-10-11/result.json SHA256=5d5aa5aaed3b2a9c68775ce567a132339bb5b1005777b6c19bdbea814368cb09

Regression: node scripts/sentence_cache_identity_sanity.js
Initial exit1 after3PASS: ReferenceError loadSentenceState is not defined at extracted fixture115. Harness dependency issue, not production runtime error. Final fixture explicitly scoped no-op for sidecar function; real sidecar behavior tested by full Chromium workflow. All previous assertions retained.
Final exit0; actual stdout:
PASS: owned tombstones survive stale cache, saved-script startup and all-deleted/empty reload
PASS: compact-equivalent fresh sources discard mismatched original tokens and keep exact tokens
PASS: repeated adjacent source uses each cached ID once with nearest anchor; fresh prefix collisions stay distinct/deterministic; owned clocks/text/lock remain authoritative
PASS: actual async reload/startup callers preserve all-deleted and empty owned timeline

Regression: node scripts/sentence_source_restore_sanity.js
Exit0,36PASS checks (fresh mapping/sourceRefs/group IDs/revisions/MT/Undo; exact zero timing; legacy missing/invalid end fallbacks;140000segment ceiling; invalid/protected mapping rejects; tombstone/locked target). Raw output was inspected independently; no native/API claim from this VM suite.
node --check extension/content/content.js
Exit0; stdout/stderr empty.
node --check scripts/sentence_chrome_restore_sanity.cjs
Exit0; stdout/stderr empty.
git diff --check -- extension/content/content.js scripts/sentence_chrome_restore_sanity.cjs scripts/sentence_cache_identity_sanity.js
Exit0; stdout/stderr empty.
diff -u .tmp-sentence-chrome-restore-independent-red-2026-10-11/extension/content/content.js extension/content/content.js
Exit1 (expected diff); actual only added lines:
+    // Restore revision-bound Undo/cache before publishing or auto-saving the script.
+    await loadSentenceState();
+    if (gen !== navigateGen || currentVideoId !== vid) return false;

API_CHECKS:
YouTube page actualHTTP200; isolated GET /scripts/ylnxFdPhLCo HTTP200 parsedfoundtrue3rows before recovery, HTTP200 baseline after recovery. Production route/store, no canned success. UI message path invokes real storage/disk save. No production scripts endpoint called.

DATABASE_CHECKS:
Disposable stage/subtitles/ylnxFdPhLCo/cues.json fields independently parsed by harness; protected blank target, lock and clocks exact. Chrome storage after Undo has2revision entries; exported backup retains2 after new document. No actual production data touched.

PROBLEMS / REQUIRED_FIXES:
No bounded blocker remains. Full source invalidation/Drive/native release criteria open. No assertion was skipped/weakened to hide loader issue. No production/harness edits by reviewer; only disposable runtime artifacts and this report.
````

## Independent main delivery report (verbatim)

2955bytes/42lines SHA256fd8bc3baf219e05d6662eb5f30d1849629d77d1b3619ab019fc3bfe1360687b7; reread and hash verified.

````text
STATUS: PASS — independent read-only main delivery audit only.
Requirements VERIFIED: actual main/worktree exact bytes/size/mode, old backup exact against before receipt,86actual main files match after receipt, exactly1changed/85unchanged versus saved before, reviewed3-line delta only.
Native activation NOT VERIFIED. No new functional tests repeated, no bridge/data/browser/process actions. Completed behavioral report remains unchanged.

Exact command (cwd /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio):
```sh
python3 - <<'PY'
from pathlib import Path
import hashlib,json
h=Path('.tmp-sentence-chrome-restore-final-2026-10-11')
r=json.loads((h/'main-delivery-receipt.json').read_text())
main=Path('/Users/hoangson/Projects/YouTube JP Caption Studio/extension')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def info(p):return {'sha256':sha(p),'bytes':p.stat().st_size,'mode':oct(p.stat().st_mode&0o777)}
now={str(p.relative_to(main)):info(p) for p in main.rglob('*') if p.is_file()}
assert now==r['after'] and len(now)==len(r['before'])==86
changed=[rel for rel in now if now[rel]!=r['before'][rel]]
assert changed==r['changed']==['content/content.js']
rel=changed[0];work=Path('extension')/rel;backup=Path(r['backup'])
assert info(main/rel)==info(work)
assert info(backup)==r['before'][rel]
assert now[rel]['sha256']=='6999d4ac84de88b0c7886c4a024f368bb59196542d41a1087b0067fad88a1ef8'
assert info(backup)['sha256']=='3df13459266dbb5f601aea703df6052123a81e611efdf5cf1fba50bbf569c5dc'
assert now[rel]['mode']==info(backup)['mode']=='0o644'
old=backup.read_text();new=work.read_text()
needle='    cues = fromScript;\n    listDirty = true;\n'
addition='    // Restore revision-bound Undo/cache before publishing or auto-saving the script.\n    await loadSentenceState();\n    if (gen !== navigateGen || currentVideoId !== vid) return false;\n'
assert old.count(needle)==1 and old.replace(needle,needle+addition)==new
print('PASS: current main inventory86 matches saved after receipt; exactly1content file changed,85unchanged vs saved before')
print('PASS: main/worktree bytes,size,mode match; content SHA256='+sha(work)+' mode0644')
print('PASS: old source backup bytes,size,mode match saved before; SHA256='+sha(backup)+' mode0644')
print('PASS: exact delivered delta is reviewed3-line loader addition; nativeactivation NOT VERIFIED; no bridge/data/browser actions')
PY
```
Exit:0
Actual stdout:
```text
PASS: current main inventory86 matches saved after receipt; exactly1content file changed,85unchanged vs saved before
PASS: main/worktree bytes,size,mode match; content SHA256=6999d4ac84de88b0c7886c4a024f368bb59196542d41a1087b0067fad88a1ef8 mode0644
PASS: old source backup bytes,size,mode match saved before; SHA256=3df13459266dbb5f601aea703df6052123a81e611efdf5cf1fba50bbf569c5dc mode0644
PASS: exact delivered delta is reviewed3-line loader addition; nativeactivation NOT VERIFIED; no bridge/data/browser actions
```
````
