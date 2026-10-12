<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: deploy two provenance helpers and restart Antigravity preserving data; continue plan -->

# Latest native reload: partial activation evidence

STATUS: NOT VERIFIED for fresh Parako content activation, native persistence and full MVP. The already deployed Antigravity helpers retain their bounded independent PASS documented in [source restore/runtime review](youtube-sentence-mvp-source-restore-runtime-2026-10-11.md).

## Requirements and current observations

| Criterion | Expected | Actual | Status |
|---|---|---|---|
| Preserve authoritative Antigravity runtime/source | Same checkout/venv/port and reviewed source | Independent current PID60231, source8adeebf…, health200 | VERIFIED |
| Current full runtime-file equality | All44 files still equal deployment preflight | Parent check before Chrome Reload passed; later independent check failed:48 current files,4 added,4 changed,0 removed | CONTRADICTED for current equality; historical point-in-time deployment PASS remains valid |
| Original backup preservation | All44 deployment backups retained | Independent hashes/bytes/modes remain exact | VERIFIED |
| Reload installed extension from reviewed main directory | Details path and native Reload result | CUA AX shows enabled0.11.2, IDoiocgalcdfmkbcikemohekbjjmlbpoll, `~/Projects/YouTube JP Caption Studio/extension`; Reload returned `Reloaded` | VERIFIED parent native observation; no independent browser run |
| Fresh Parako content uses latest files | New document, then parsed backup/runtime behavior | Navigation to `ylnxFdPhLCo&t=60s` reached intermediate address state only; subsequent AX observation read another Chrome window/video | NOT VERIFIED |
| Native source mapping/sidecar/protected data | Save/reload/export comparison in installed Chrome | No fresh backup exported in this slice | NOT VERIFIED |
| Gold, live Gemini, readiness/cost and supported sync compatibility | Plan sections8/11 gates | No new audio reference, Gemini/API benchmark, Drive mutation or old-client runtime run | NOT VERIFIED; prior source17/rra05 semantic FAIL remains open |

No production source was changed in this slice. Current main content delivery and earlier isolated36-check/512-cue evidence remain in the linked previous review; they do not establish native persistence.

## Native action record

Initial tab selection was stopped because Chrome changed. The user then explicitly granted three quiet minutes. Parent refreshed AX, selected the existing Extensions tab, observed another interruption, refreshed AX again and successfully opened Caption Studio Details. Clicking its own Reload button produced:

```text
text 0.11.2
text oiocgalcdfmkbcikemohekbjjmlbpoll
switch On, extension enabled, Value: on
link ~/Projects/YouTube JP Caption Studio/extension
text Reloaded
```

These are selected lines from native accessibility tool output, not terminal stdout or a screenshot. No native screenshot was saved. This limits the independently reviewable UI evidence.

Parent selected the existing YouTube tab and navigated to the known Parako test URL. The immediate AX state showed the requested address while content was still loading. The next AX result showed a different Chrome window at `youtube.com/watch?v=mCkItaxlBF0`. The fresh Parako document, playback, backup, Gemini configuration and actual loaded source bytes were not inspected. No further UI actions were sent to that other window. Do not infer the new navigation completed or measure readiness from it.

## Terminal command and actual output

Parent command from the current worktree, **before native Chrome Reload**:

```text
python3 .tmp-sentence-mvp/provenance-deploy-2026-10-11/verify.py
exit code: 0
PASS: current Antigravity PID60231 same cwd/port; GET /health HTTP200 ready true
PASS: selected source SHA256 8adeebf107de5a7e971d8599f345c2e85094f82472d329b1576945cfbc7f4d10; original source backup matches
PASS: all44 data files/set/hash/bytes/modes preserved; all44 backups match; no script API writes
```

The checker reads process/source/data and GET `/health` only. There was no script-save, delete, migration or reconciliation request. Its final phrase describes its own request scope, not an audit of every other process on the machine.

API_CHECKS: GET `http://127.0.0.1:8765/health`, HTTP200, parsed `ready:true`.

DATABASE_CHECKS: Parent did not send a script write/delete/migration request. The44-file equality above is historical at that command's observation time. **Later independent inventory differs**; the following current result supersedes any inference of unchanged data at the end of this turn.

## Independent current audit: equality failed

The separate reviewer ran the same current verifier after the native Reload/navigation attempt. Exit code1, stdout empty, actual stderr:

```text
Traceback (most recent call last):
  File "/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/.tmp-sentence-mvp/provenance-deploy-2026-10-11/verify.py", line 16, in <module>
    assert now==before['data_files']
           ^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError
```

Independent metadata-only comparison found baseline44/current48, added4, changed4, removed0. Added: `data/subtitles/ylnxFdPhLCo/{cues.json,meta.json,script.txt,tokens.json}`. Changed: `data/config/extension_state.json` and `data/subtitles/FVnhw0mVH_Q/{cues.json,meta.json,script.txt}`. Of28 baseline subtitle files,25 remain byte/mode exact and3 changed. All44 original backups remain exact. This does not prove deployment damage or identify which actor/request caused the later writes.

Independent runtime/source/main/backup checks still passed: PID60231/cwd/port8765 and source SHA8adeebf…; health HTTP200 `ready:true`, dictionary/frequency/Sudachi true; main/worktree content217602B SHAf487e449… mode0644; main previous source backup SHAa3457436… mode0644. These are narrower checks than whole-file preservation.

Parent parsed the changed512-row script and its baseline, emitting counters rather than text. Cue IDs/count, JP/EN/VI text, starts, ownership/provenance and lock fields are unchanged; **12 end clocks changed** by approximately0.05seconds. Both script metadata versions are owned; none of the512 cues has `mt_locked:true`. Metadata changed `url`, `updated_at`, `rev`. This is not a native protected-lock regression proof and cannot establish whether the clock updates were intended. Actual deployed `parse_script_txt` executed via `runpy.run_path` on each TXT snapshot: original TXT matches original JSON and current TXT matches current JSON for all512 source/targets/start/end tuples. The parent did not call `load_script` or any live script endpoint during this comparison.

The full preservation checker was retained unchanged. No clock/data rollback, reconciliation or repair was performed. Prior backup and current runtime data are both retained. Native cache precedence, cause of12 clock changes and the user's intended timing remain NOT VERIFIED.

## Independent cue delta check

The separate reviewer independently repeated the512-row comparison. Actual command from this worktree, exit0:

```bash
python3 - <<'PY'
import json,collections,math
from pathlib import Path
h=Path('.tmp-sentence-mvp/provenance-deploy-2026-10-11');b=json.loads((h/'preflight.json').read_text());root=Path(b['cwd']).parent;rel=Path('data/subtitles/FVnhw0mVH_Q')
old=json.loads((h/'data-before'/rel/'cues.json').read_text());new=json.loads((root/rel/'cues.json').read_text());om=json.loads((h/'data-before'/rel/'meta.json').read_text());nm=json.loads((root/rel/'meta.json').read_text())
a=old['cues'];z=new['cues'];aid=[c['id'] for c in a];zid=[c['id'] for c in z]
assert len(a)==len(z)==512 and len(set(aid))==len(set(zid))==512 and aid==zid
print('PASS 512 rows; 512 unique IDs; exact ordered IDs; added0 removed0 (IDs redacted)')
changes=collections.Counter();clock=[]
for x,y in zip(a,z):
 for k in set(x)|set(y):
  if x.get(k)!=y.get(k) or (k in x)!=(k in y): changes[k]+=1
 if x.get('end_media_time')!=y.get('end_media_time'): clock.append((x['end_media_time'],y['end_media_time'],y['end_media_time']-x['end_media_time']))
assert changes=={'end_media_time':12}
print('PASS all512 cue fields exactly preserved except end_media_time; field-delta counters '+json.dumps(dict(changes),sort_keys=True))
assert om['owned'] is nm['owned'] is True and old['meta']['owned'] is new['meta']['owned'] is True
print('PASS owned true in both cue-bundle metadata and meta.json')
for label,rows in [('before',a),('current',z)]:
 locked=sum(c.get('mt_locked') is True for c in rows);print(label+' locked_true='+str(locked)+' text_source_counts='+json.dumps(dict(collections.Counter(c.get('text_source') for c in rows)),sort_keys=True));assert locked==0
print('CONTRADICTED exact clocks:12 changed end times; start times unchanged512')
for before,after,delta in clock: print('END_CLOCK '+json.dumps({'before':before,'current':after,'delta':delta},sort_keys=True))
print('meta changed keys only '+json.dumps(sorted(k for k in set(om)|set(nm) if om.get(k)!=nm.get(k) or (k in om)!=(k in nm))))
print('LIMIT no source/target strings or IDs printed; no mutation/script API; no causal attribution or locked-cue persistence proof')
PY
```

Actual stdout:

```text
PASS 512 rows; 512 unique IDs; exact ordered IDs; added0 removed0 (IDs redacted)
PASS all512 cue fields exactly preserved except end_media_time; field-delta counters {"end_media_time": 12}
PASS owned true in both cue-bundle metadata and meta.json
before locked_true=0 text_source_counts={"script": 512}
current locked_true=0 text_source_counts={"script": 512}
CONTRADICTED exact clocks:12 changed end times; start times unchanged512
END_CLOCK {"before": 234.0, "current": 234.04999999999998, "delta": 0.04999999999998295}
END_CLOCK {"before": 497.1, "current": 497.05, "delta": -0.05000000000001137}
END_CLOCK {"before": 544.1, "current": 544.0500000000001, "delta": -0.049999999999954525}
END_CLOCK {"before": 582.1, "current": 582.0500000000001, "delta": -0.049999999999954525}
END_CLOCK {"before": 671.1, "current": 671.0500000000001, "delta": -0.049999999999954525}
END_CLOCK {"before": 794.1, "current": 794.0500000000001, "delta": -0.049999999999954525}
END_CLOCK {"before": 797.1, "current": 797.0500000000001, "delta": -0.049999999999954525}
END_CLOCK {"before": 1056.0, "current": 1056.05, "delta": 0.049999999999954525}
END_CLOCK {"before": 1135.0, "current": 1135.05, "delta": 0.049999999999954525}
END_CLOCK {"before": 1169.0, "current": 1169.05, "delta": 0.049999999999954525}
END_CLOCK {"before": 1383.0, "current": 1383.05, "delta": 0.049999999999954525}
END_CLOCK {"before": 1405.0, "current": 1405.05, "delta": 0.049999999999954525}
meta changed keys only ["rev", "updated_at", "url"]
LIMIT no source/target strings or IDs printed; no mutation/script API; no causal attribution or locked-cue persistence proof
```

The TXT/JSON parser comparison remains parent-only evidence; the reviewer did not independently repeat it. Exit0 here means the explicitly asserted comparison counters passed, **not** that clocks or the full preservation requirement passed.

PROBLEMS / REQUIRED_FIXES: Investigate the12 end-clock changes with actual native/cache/request evidence before claiming current owned-timing preservation. Obtain a stable native Chrome target before checking fresh Parako activation/export. Do not promote Reloaded or isolated storage adapters to native save/reload, audio gold, translation-readiness or full-release proof. The full implementation goal stays active.
