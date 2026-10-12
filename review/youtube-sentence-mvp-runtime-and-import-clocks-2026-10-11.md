<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: update two clock helpers and restart Antigravity keeping data -->

# Antigravity runtime and extension TXT clock preservation

STATUS: PASS for the bounded backend clock helpers, extension TXT parser, authorized Antigravity deployment/restart and point-in-time data preservation, with independent review. Full MVP, live8765 script round-trip and native client/Drive round-trips remain NOT VERIFIED. Previous source failures and the corrected implementations are recorded below.

[Revised plan](../plan/youtube-sentence-enhancement-mvp-2026-10-10.md), especially source fidelity and storage/import compatibility.

## Flow and scope

Synthetic request → actual `/scripts/save` route → `ScriptSaveRequest`/`ScriptCue` → `save_script`/`_save_script_locked` → temporary cues.json/tokens.json/meta.json/script.txt → actual GET `/scripts/{video_id}` → `load_script` prefers script.txt → `_cues_from_txt` → `ScriptLoadResponse`. No database path is used. `SCRIPTS_DIR` and device-ID path are rebound to TemporaryDirectory in the test server before any requests. Random localhost ports and child processes are isolated from the listener at8765.

Acceptance: exact original cue clocks after save/load and fresh-process restart, IDs/source/VI/EN/user translation origin/lock/owned/revision preserved for the fixture, invalid end-before-start HTTP422 leaves disk unchanged, unknown script returns explicit found:false. This does not establish all provenance fields, tombstones, native extension storage, loaded in-memory code of PID74619, Drive or full release.

## Candidate patch

Only the existing shared time formatter/parser and a standard-library Decimal import change in the isolated copied source. It reuses the already-tested worktree formatter/parser. A formatter-only candidate passed the basic1.234/4.789 sample but independent review exposed a further parser precision defect, reproduced at1.0131. That intermediate candidate was never deployed. No source/API/schema/serializer expansion or migration. Existing rounded scripts are not repaired by this formatter.

```diff
--- app/services/script_store.py (selected source)
+++ app/services/script_store.py (isolated candidate)
@@ -8,6 +8,8 @@
 """

 from __future__ import annotations
+
+from decimal import Decimal

 import json
 import logging
@@ -80,13 +82,11 @@


 def _format_time_plain(sec: float) -> str:
-    s = max(0.0, float(sec or 0.0))
-    total = int(s)
-    m, r = divmod(total, 60)
-    frac = s - total
-    if frac >= 0.05:
-        return f"{m}:{r:02d}.{int(round(frac * 10))}"
-    return f"{m}:{r:02d}"
+    # TXT is canonical on load: never quantize the original source clocks.
+    whole, _, fraction = format(Decimal(str(max(0.0, float(sec or 0.0)))), "f").partition(".")
+    minutes, seconds = divmod(int(whole), 60)
+    fraction = fraction.rstrip("0")
+    return f"{minutes}:{seconds:02d}" + (f".{fraction}" if fraction else "")


 def render_script_txt(
@@ -158,8 +158,7 @@
     m = re.fullmatch(r"(\d+):(\d{1,2})(?:\.(\d+))?", s)
     if not m:
         return float("nan")
-    frac = float(f"0.{m.group(3)}") if m.group(3) else 0.0
-    return int(m.group(1)) * 60 + int(m.group(2)) + frac
+    return float(f"{int(m.group(1)) * 60 + int(m.group(2))}.{m.group(3) or '0'}")


 def parse_script_txt(text: str) -> list[dict[str, Any]]:
```

## Selected source Red

```text
COMMAND: ['local-bridge/.venv/bin/python', '.tmp-sentence-mvp/antigravity-roundtrip-2026-10-11/selected_source_roundtrip.py']
EXIT CODE: 1
STDOUT:
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.2, 4.8]}
STDERR:
Traceback (most recent call last):
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-mvp/antigravity-roundtrip-2026-10-11/selected_source_roundtrip.py", line 82, in <module>
    assert actual[field] == cue[field], (field, actual[field], cue[field])
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: ('start_media_time', 1.2, 1.234)
```

## Intermediate formatter-only candidate — basic sample Green

```text
COMMAND: ['local-bridge/.venv/bin/python', '/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-mvp/antigravity-roundtrip-2026-10-11/candidate_roundtrip.py']
EXIT CODE: 0
STDOUT:
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"restartHTTP": 200, "firstPid": 36805, "secondPid": 36807, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, owned targets/locks and revision; HTTP422 rejects invalid timing without disk mutation; missing is explicit
STDERR:
(empty)
```

## Runtime authority and deployment boundary

User-selected Antigravity runtime/data remains authoritative. Before deployment the listener was PID74619 at127.0.0.1:8765 in wiki_pkm_audit_sync/local-bridge. All candidate tests used temporary roots and random ports. The user subsequently explicitly authorized updating both clock helpers and restarting the same Antigravity bridge with its existing data. Current deployment evidence appears below; no state reconciliation, database migration or live script-write request was performed.

Before-source hash:5d6d2b698b7f738ad3ed75a583e28289086a1711ff0d1acfdac91a69ccbaa19a. Reviewed and deployed source hash:5551989dbaa841f73dee7cd9dde7946a9710fcb7fc84d281ee058279da066337.

## Formatter-only parser Red

```text
COMMAND: ['local-bridge/.venv/bin/python', '-c', "import sys; sys.path.insert(0,'/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-mvp/antigravity-roundtrip-2026-10-11/candidate-bridge'); from app.services import script_store as s; x=1.0131; text=s._format_time_plain(x); actual=s._parse_time_token(text); print({'input':x,'formatted':text,'actual':actual},flush=True); assert actual==x,(actual,x)"]
EXIT CODE: 1
STDOUT:
{'input': 1.0131, 'formatted': '0:01.0131', 'actual': 1.0131000000000001}
STDERR:
Traceback (most recent call last):
  File "<string>", line 1, in <module>
AssertionError: (1.0131000000000001, 1.0131)
```

## Final candidate basic Green

```text
COMMAND: ['local-bridge/.venv/bin/python', '/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-mvp/antigravity-roundtrip-2026-10-11/candidate_roundtrip.py']
EXIT CODE: 0
STDOUT:
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"restartHTTP": 200, "firstPid": 38546, "secondPid": 38547, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, owned targets/locks and revision; HTTP422 rejects invalid timing without disk mutation; missing is explicit
STDERR:
(empty)
```

## Final corner / worktree check 1

```text
COMMAND: ['local-bridge/.venv/bin/python', '/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-mvp/antigravity-roundtrip-2026-10-11/candidate_corner_roundtrip.py']
EXIT CODE: 0
STDOUT:
{"http": 200, "savedClocks": [1.0131, 4.0353], "loadedClocks": [1.0131, 4.0353]}
{"restartHTTP": 200, "firstPid": 38980, "secondPid": 38981, "loadedClocks": [1.0131, 4.0353], "owned": true, "locked": true, "revision": 3}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, owned targets/locks and revision; HTTP422 rejects invalid timing without disk mutation; missing is explicit
STDERR:
(empty)
```

## Final corner / worktree check 2

```text
COMMAND: ['local-bridge/.venv/bin/python', 'scripts/sentence_script_store_sanity.py']
EXIT CODE: 0
STDOUT:
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"restartHTTP": 200, "firstPid": 38991, "secondPid": 38992, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, owned targets/locks and revision; HTTP422 rejects invalid timing without disk mutation; missing is explicit
STDERR:
(empty)
```

## Final corner / worktree check 3

```text
COMMAND: ['git', 'diff', '--check', '--', 'scripts/sentence_script_store_sanity.py']
EXIT CODE: 0
STDOUT:
(empty)
STDERR:
(empty)
```

The permanent worktree suite retains all prior assertions and adds1.0131/1.0353 to the clock preflight. The corner fixture uses the same actual route/disk/restart assertions at1.0131/4.0353. The parsed clock uses one decimal string to float conversion; the formatter alone uses Decimal. Isolated helper tests do not establish a live8765 script round-trip; runtime restart evidence is separate below.


## Extension TXT parser follow-up — independently PASS

Independent backend review also proved the current extension's parseExportTxt produced1.0131000000000001 from0:01.0131. Parent added a regression to the existing production-module test, ran Red exit1, then fixed the shared parseTimeToken function. Canonical two-/three-component integer clocks form exact whole seconds using native BigInt and convert the complete decimal string once. This also handles backend minute strings beyond JavaScript's integer precision without generating an exponent inside the decimal string. The existing permissive three-part fallback is retained for noncanonical legacy inputs. All old assertions remain; added cases cover exact fractions, minute/hour anchors, subnormal and1e300, plus legacy1:99.5 and0:-1:2.

Callers: sidepanel file import tries JSON, then production parseExportTxt, normalizes rows and passes cue clocks into the existing import command. No renderer/UI/storage contract or flattened TXT lock semantics changed. JSON backup remains required for metadata/locks. A pure parser check does not establish native file selection/import application.

### Extension importer Red

```text
COMMAND: ['node', 'extension/shared/import_parse_test.js']
EXIT CODE: 1
STDOUT:
(empty)
STDERR:
node:internal/assert/utils:146
  throw error;
  ^

AssertionError [ERR_ASSERTION]: 0:01.0131
+ actual - expected

+ 1.0131000000000001
- 1.0131
        ^

    at Object.<anonymous> (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/extension/shared/import_parse_test.js:29:11)
    at Module._compile (node:internal/modules/cjs/loader:1934:14)
    at Object..js (node:internal/modules/cjs/loader:2074:10)
    at Module.load (node:internal/modules/cjs/loader:1656:32)
    at Module._load (node:internal/modules/cjs/loader:1448:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:261:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 1.0131000000000001,
  expected: 1.0131,
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v26.8.1
```

### Extension importer Green/check 1

```text
COMMAND: ['node', 'extension/shared/import_parse_test.js']
EXIT CODE: 0
STDOUT:
(empty)
STDERR:
(empty)
```

### Extension importer Green/check 2

```text
COMMAND: ['node', '--check', 'extension/shared/import_parse.js']
EXIT CODE: 0
STDOUT:
(empty)
STDERR:
(empty)
```

### Extension importer Green/check 3

```text
COMMAND: ['git', 'diff', '--check', '--', 'extension/shared/import_parse.js', 'extension/shared/import_parse_test.js']
EXIT CODE: 0
STDOUT:
(empty)
STDERR:
(empty)
```


Parent additionally ran actual candidate render_script_txt → current production extension parseExportTxt over four clock pairs, checking source/VI/EN and precise starts/ends; exit0, empty stderr. These pair cases were1.0131/4.0353,59.9999/60.00000000000001,5e-324/1e-12 and1e30/1e300. No native client or production-state mutation is implied.

## Correction to default delivery command attribution

The prior [default delivery companion](youtube-sentence-mvp-default-delivery-2026-10-11.md) says both parent and reviewer ran the combined syntax && diff-check command. Parent ran that combined command; reviewer actually ran equivalent syntax and scoped diff-check as two separate commands, both exit0. The exact-command attribution is corrected here; the bounded results stand. The prior raw companion remains unchanged. Its geometry retraction is correct: top delta−60.5px at first toggle, unmeasured cause, no UI proof of end clocks or boolean mt_locked.


## Authorized Antigravity deployment and preservation

User reply: “Cập nhật hai hàm và khởi động lại, giữ dữ liệu Antigravity”. Exact selected-source bytes were backed up; the guarded atomic replacement changed only the two reviewed time helpers and Decimal import, preserving0644. All44 files under the selected data roots were backed up and hashed with size/mode before restart. Original process executable and loaded venv were identified via libproc/lsof; the same Python3.12.12 venv and original uvicorn app/host/port/workers arguments were retained. OldPID74619 received SIGTERM and released8765 before newPID42809 started in the same cwd. Actual health/tokenize requests returned HTTP200 with readytrue and exact synthetic Japanese source coverage. No production script save/load/delete request was sent.

Data preservation includes exact file-set, all44 content hashes, byte sizes and modes before/after startup/tokenization, plus byte-identical backups. This is a point-in-time check, not a promise that future user activity cannot change data. The reviewed source was deployed, but old clocks already lost in earlier saves are not reconstructed.

```text
COMMAND: python3 .tmp-sentence-mvp/antigravity-roundtrip-2026-10-11/verify_runtime_preservation.py
EXIT CODE: 0
STDOUT:
PASS: current Antigravity PID 42809, same cwd/port; GET /health HTTP 200, ready true
PASS: deployed source matches reviewed candidate SHA256 5551989dbaa841f73dee7cd9dde7946a9710fcb7fc84d281ee058279da066337
PASS: all 44 data files/set/hash/size/modes unchanged and backups match; no script API writes
STDERR: (empty)
```

The existing HTTP fixture was then rerun using the deployed source and exact Antigravity venv, still with isolated temporary script roots:

```text
COMMAND: PYTHONDONTWRITEBYTECODE=1 ['/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3', '/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-mvp/antigravity-roundtrip-2026-10-11/selected_source_roundtrip.py']
EXIT CODE: 0
STDOUT:
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"restartHTTP": 200, "firstPid": 43475, "secondPid": 43477, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, owned targets/locks and revision; HTTP422 rejects invalid timing without disk mutation; missing is explicit
STDERR: (empty)
```


## Main extension source delivery

After the separate independent parser PASS, import_parse.js and its test were copied to the main extension with HEAD-byte preconditions, old-byte backups, atomic writes and0644 preservation. Main parser SHA256c24ba655d1c1d69853cb8153a43bb9fc42382012f79125f837b621eec434bb70; test SHA2567006d1d7b3365553fde2e6a0772b4890ac6f513bca8883b17c99c0c61aa6919a. Old main source SHA25603c8778c2da733be327b5aae045ab78330e994b5c0517991c077e91f8a536d76 and old test52d2fb32933bb94ea62b3bb4f7b9095d7e1906710b89c8be60f42ae85aede5cd are retained in backups. The main-directory commands below each exited0 with empty stdout/stderr:

```text
node extension/shared/import_parse_test.js
node --check extension/shared/import_parse.js
git diff --check -- extension/shared/import_parse.js extension/shared/import_parse_test.js
```

Native Chrome has not reloaded after these source copies. Native import application/save/reload, protected metadata round-trips, Drive, source17/rra05 semantics, audio gold, live Gemini and readiness/cost/release targets remain NOT VERIFIED. The full implementation goal remains active.


## Independent review results

Reviewer independent_audit read original requirements, current disk source/diffs and actual helper call paths, then independently ran Red/Green, candidate, importer and deployment checks. This was a separate reviewer execution, not an automatic hook or CI claim.

| Criterion | Independent result |
|---|---|
| Backend candidate scope | 31 copied Python app files compared; only script_store.py differs. AST differences limited to two helpers plus Decimal import |
| Backend precise clocks | 200,009 seeded/grid/extreme helper round-trips PASS; four actual HTTP cases including minute/subnormal/1e30→1e300 PASS |
| Invalid timing / canonical TXT | Three real HTTP422 cases preserve every temp disk byte; manual canonical TXT edit honored with user target/lock/owned retained |
| Existing store behavior | Ten existing script-store checks PASS with actual candidate module and temporary roots |
| Python formatter → JavaScript clock parser | 150,013 exact finite cases PASS, six actual emitted TXT/normalized-row cases retain clock/JA/VI/EN, 25 legacy/malformed parity cases PASS |
| Current deployment | Independent live PID/cwd/venv/executable/8765 and health200 readytrue; deployed source equals reviewed candidate and old backup matches precondition |
| Current data preservation | Independently checked all44 live files and44 backups, complete set/hash/size/mode equal; repeated after review, still equal |
| Main importer source | Both files and old backups/modes independently checked; main unit, syntax and scoped diff checks exit0 |
| Native extension/Drive/live8765 script clocks | NOT VERIFIED |

Independent current process checks, each exit0:

```text
ps -p 42809 -o pid=,command=
42809 /Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge/.venv/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --workers 1

lsof -a -p 42809 -d cwd -Fn
p42809
fcwd
n/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge
```

Independent isolated deployed-source suite, using selected venv and PYTHONDONTWRITEBYTECODE=1, exit0:

```text
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"restartHTTP": 200, "firstPid": 43495, "secondPid": 43497, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, owned targets/locks and revision; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

Independent selected-root whitespace command:

```text
COMMAND: git -C '/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync' diff --check -- local-bridge/app/services/script_store.py
EXIT CODE: 0
STDOUT/STDERR: (empty)
```

The reviewer's inline source/AST/hash/process/health audit exited0 and reported current source5551989d…, only two helper changes, all44 live+44 backups unchanged, main importer hashes/modes correct, libproc executable matching the old Python3.12.12 executable, and live health200 readytrue. Its repeated post-review preservation audit exited0 with `PASS post-review all44 live data file-set/SHA/bytes/modes unchanged; no data contents emitted`.

Two receipt snapshots predate restart: antigravity-source-copy.json still records restart pending; import-main-copy.json still records candidate not deployed. Those are historical snapshot fields, superseded by runtime-restart.json and live independent observations above. The reviewer's no-index diff check between differing old/new files exited1 with empty output; it is not reported as an exit0 PASS. Actual selected-root scoped diff-check above exited0. The raw user plan's existing Markdown hard break remains preserved.
