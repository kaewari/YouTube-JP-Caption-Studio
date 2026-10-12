<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Bridge dictionary regression and process-restart persistence

STATUS: PASS for the independently reviewed current backend compatibility/NLP/restart slice. Native bridge activation, data migration and full MVP NOT VERIFIED.

## Request paths and scope

Plan Phase 3 requires correct Japanese lookup/source spans and API → disk → restart → reload compatibility. POST `/dict` → DictRequest → dictionary lookup/candidate expansion/cache → read-only dictionary tables → DictResponse. POST `/scripts/save` → request schema → script_store → disposable cues/meta/tokens JSON and canonical TXT → fresh process GET `/scripts/{id}` → TXT parser/JSON response. The script path uses files, not SQL.

Acceptance: normal joined idiom wins; punctuation and ambiguous repeated targets never invent a context compound; canonical Han-Viet belongs to matched spelling; rare exact-spelling metadata is retained, kana aliases do not inherit another spelling's Han-Viet; context cache preserves array boundaries. Dictionary build publishes a standalone database readable after rename. Script clocks, owned flag, target translations, locks and revision survive a real process restart. Missing/invalid requests stay explicit and invalid timing leaves test data unchanged. Production data and the existing listener are excluded from mutation.

## Red and minimal fixes

1. Existing builder tests: `'/Users/hoangson/Projects/YouTube JP Caption Studio/local-bridge/.venv/bin/python' -m pytest -q tests/test_build_dict.py` (cwd local-bridge), exit1, actual `2 failed, 1 passed in 0.13s`, read-only `OperationalError: unable to open database file`. Final WAL on a renamed temporary database depended on sidecars under SQLite3.54.0. Change final journal mode to DELETE; unchanged tests exit0, `3 passed in 0.08s`. Production lookup uses normal connect with query_only; URI read-only failure is not proof every production lookup failed.
2. Existing full dictionary regression: exit1, `8 failed, 26 passed`; selected 気 returned 気 instead of idiom 気にする; kana あいつ inherited BỈ NÔ from a reading alias; canonical Han-Viet casing was displaced by Mazii. Prioritize valid context compounds and canonical matched-spelling Han-Viet.
3. Independent review then found punctuation and rare-metadata losses. Before fixing them, new permanent runtime tests ran `.venv/bin/python -m pytest -q tests/test_dictionary_service.py -k 'punctuation_boundaries or unambiguous_target or rare_mazii'` (cwd local-bridge), exit1, raw summary `8 failed, 6 deselected in 0.93s`. Actual 水 + 。 + 色 returned 水色; repeated 気 chose 気になる; exact 剕 lost PHÍ. Shared context helper now keeps token boundaries, stops at punctuation/empty/whitespace, and declines ambiguous repeated targets. Exact Mazii expression may supply Han-Viet only when canonical result is empty and expression equals matched spelling. Attached punctuation conservatively stops the token, including 色。; this may miss a valid compound and is a precision-first limit, not linguistic completeness.
4. Root found comma-key collision: lookup 水 with ['水','色'], then ['水,色'] reused 水色. `.venv/bin/python -m pytest -q tests/test_dictionary_service.py -k context_cache`, exit1, `1 failed, 14 deselected in 0.07s`. Use JSON array serialization for context cache component; no-context existing cache key unchanged. No hardcoded production word/phrase cases added.

## Python runtime and actual commands

The main venv used initially is Python3.9.6, below repo's Python3.10+ requirement. New isolated worktree runtime:

```text
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cwd: local-bridge
exit0; installed existing requirements (no requirement/dependency edits)
local-bridge/.venv/bin/python --version
exit0
Python 3.12.12
local-bridge/.venv/bin/python -m pip check
exit0
No broken requirements found.
```

Final root full regression:

```text
.venv/bin/python -m pytest -q tests/
cwd: local-bridge
exit0
...........................................                              [100%]
43 passed, 5 warnings in 2.45s
```

Five actual deprecation warnings cover existing FastAPI on_event and Starlette httpx TestClient; no assertions skipped/weakened. This suite count does not include the standalone script-store runner:

```text
PYTHONPATH=. .venv/bin/python tests/test_script_store.py
cwd: local-bridge
exit0
  [ok] test_script_txt_always_emits_ja_en_vi
  [ok] test_parse_empty_ja_en_vi_lines
  [ok] test_tokens_split_merge_roundtrip
  [ok] test_legacy_inline_tokens_migrate_on_read
  [ok] test_rev_monotonic_and_owned
  [ok] test_files_mirror_roundtrip
  [ok] test_load_prefers_script_txt_over_garbage_cues
  [ok] test_load_script_txt_rescues_inline_tokens
  [ok] test_save_sanitizes_non_finite_times
  [ok] test_read_files_keeps_existing_script_txt
[test_script_store] ok
```

Fresh-process HTTP persistence check:

```text
local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
exit0
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"restartHTTP": 200, "firstPid": 76058, "secondPid": 76083, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, owned targets/locks and revision; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

Runner uses actual child Uvicorn servers and disposable subtitles/device root. Two child PIDs differ and the entire second GET equals the first. Original SIGTERM handler makes Uvicorn's signal replay exit cleanly; the exit0 assertion remains. `text_source` still normalizes edit→script on canonical TXT load, so this does not establish lossless provenance/all metadata. Native sidecar/tombstones/Drive roundtrips remain separate gates.

## Complete app HTTP and extension NLP

Root command `local-bridge/.venv/bin/python .tmp-sentence-mvp/bridge-runtime-check-2026-10-10.py`, exit0, loads production app with temporary script/device/extension-state paths and a random loopback port. Current worktree dictionary is real compiled data. Actual output:

```text
INFO:app.services.dictionary:Dictionary DB ready at /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/data/dict/dict.sqlite
INFO:app.services.vocab_freq:Loaded freq map (15000 lemmas)
INFO:app.services.vocab_freq:Loaded JLPT map (14024 entries)
{"HTTP": 200, "surface": "約束", "matched": "約束", "hanviet": "Ước Thúc"}
{"HTTP": 200, "surface": "あいつ", "matched": "あいつ", "hanviet": ""}
{"HTTP": 200, "surface": "気", "matched": "気にする", "hanviet": "Khí"}
{"HTTP": 200, "surface": "水", "matched": "水", "hanviet": "Thủy"}
{"HTTP": 200, "surface": "水", "matched": "水", "hanviet": "Thủy"}
{"HTTP": 200, "surface": "気", "matched": "気", "hanviet": "Khí"}
{"HTTP": 200, "surface": "剕", "matched": "剕", "hanviet": "PHÍ"}
INFO:app.services.tokenize_ja:Sudachi tokenizer loaded (SplitMode.B)
HTTP: POST /tokenize_batch 200; parsed 1 sentence results
PASS: whole joined sentence tokenized through real bridge HTTP200; emoji code-point→UTF16 offsets/readings validated, lock and originals unchanged, no duplicate call
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
PASS: real bridge trimming across two logical groups preserves exact display source including neutral whitespace
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
HTTP: POST /tokenize_batch 200; parsed 2 sentence results
PASS: held real HTTP200 from prior session cannot block same-track new-session NLP or discard its tokens
{"HTTP": 200, "models_loaded": {"ocr": false, "mt": false, "sudachi": true, "dict": true, "freq": true}, "active_slots": 0}
PASS: Python3.12 complete production app, real HTTP dictionary and extension NLP integration; isolated user state; dictionary bytes unchanged
```

The permanent NLP runner now accepts optional CAPTION_BRIDGE_URL, default unchanged 8765, so the actual extension helper can target an isolated app. Production helper executes in VM with real HTTP; this is not installed browser click/layout proof.

## Dictionary input and database evidence

Main dictionary was read through SQLite read-only backup into ignored worktree data, then retained as dict.pre-mvp-legacy-2026-10-10.sqlite. Legacy main schema user_version0 has no kanji_hanviet table; initial audit assumption was corrected and logged. Existing main JMdict, JMdict-VI, Mazii raw inputs were copied with byte/hash receipts; no new remote dataset download and no main dictionary rebuild. Current worktree builder completed actual compilation, exit0, 465037 JMdict and8292 Kanji entries, 207790080bytes/user_version4/journal DELETE/quick_check ok/SHA a17ffecde64671d1b2109662613703394d12a98f1d2b5b1d7086f6c55f176e6d. Existing builder log says Mazii0 due deleted local variable; table integrity/counts, not that misleading log, establish presence. Receipts remain ignored under .tmp-sentence-mvp. No generated runtime dictionary is added to Git.

## Installed runtime identity and remaining gates

Actual listener inspection, exit0:

```text
lsof -nP -iTCP:8765 -sTCP:LISTEN
python3.1 74619 hoangson ... TCP 127.0.0.1:8765 (LISTEN)
lsof -a -p 74619 -d cwd -Fn
p74619
fcwd
n/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/wiki_pkm_audit_sync/local-bridge
```

The displayed process name is truncated and does not prove Python version. Live bridge belongs to an older Antigravity checkout with substantially different dictionary/builder source. Main and active runtime have separate state:47/22 files;6 shared paths all have different hashes. A silent switch/merge could choose wrong owned scripts/settings. PID/listener/production database/state were not changed. Main source staging and installed activation must be reported separately.

Full goal remains active: gold/audio reference, live Gemini VI/EN readiness/cost, native protected state/Drive, rate/seek/background/full matrix, and deliberate runtime/data transition remain NOT VERIFIED. The native Chrome window was consumed earlier for lifecycle activation; this turn did not operate Chrome or reuse it.

## Independent final review

Read-only reviewer /root/independent_audit independently read the original Phase3 request, disk diff, affected caller flow and test changes. It reproduced the intermediate punctuation/rare-HV Reds and an old-comma-cache Red in memory, then executed current source. No blocking finding remained.

```text
.venv/bin/python -m pytest -q -p no:cacheprovider tests/
cwd: local-bridge
exit0
43 passed, 5 warnings in 1.74s
local-bridge/.venv/bin/python -m pip check
exit0
No broken requirements found.
git diff --check
exit0; stdout/stderr empty
local-bridge/.venv/bin/python scripts/sentence_script_store_sanity.py
exit0
{"http": 200, "savedClocks": [1.234, 4.789], "loadedClocks": [1.234, 4.789]}
{"restartHTTP": 200, "firstPid": 76307, "secondPid": 76340, "loadedClocks": [1.234, 4.789], "owned": true, "locked": true, "revision": 3}
PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, owned targets/locks and revision; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

Reviewer also independently executed the complete-app random-port probe above, exit0 with the same seven parsed dictionary results, four tokenize HTTP200 results, loaded NLP/dict/freq and active_slots0. Its separate actual HTTP cache probe checked both request orders:

```text
{"HTTP": 200, "context": ["水", "色"], "matched": "水色"}
{"HTTP": 200, "context": ["水,色"], "matched": "水"}
{"HTTP": 200, "context": ["水,色"], "matched": "水"}
{"HTTP": 200, "context": ["水", "色"], "matched": "水色"}
PASS: actual HTTP ordered/reversed context-array cache identities separate lexical 水色 from punctuation 水,色; DB bytes unchanged
```

Its HTTP probes also verified missing surface422 and unknown foundfalse200. Main DB SHA36db3b16aa577e5781091df890a0fe776d16fa71231cce798c0e35cb6538134e and worktree DB SHAa17ffecde64671d1b2109662613703394d12a98f1d2b5b1d7086f6c55f176e6d were unchanged. Script writes remained temporary.

## Main source staging after review

After current delta review, all four main destinations (three production files plus existing dictionary service test) were checked against worktree HEAD before any write. Guarded copy created byte-verified backup, preserved file modes, and verified new bytes. Parent exact command is the Python guarded-copy program recorded in this chat; actual exit0 output:

```text
{"copiedFiles": 4, "oldBaseGuards": true, "backupsByteVerified": true, "newBytesVerified": true, "modesPreserved": true, "dictionarySha": "7dd21a8a684ce30dd29d788423ef78c410162efe6ca432d050913079e4f87db6", "runtimeRestarted": false}
```

Receipt .tmp-sentence-mvp/main-bridge-copy-receipt-2026-10-10.json retains old/new SHA, mode and backup path. Production SHA:

```text
7dd21a8a684ce30dd29d788423ef78c410162efe6ca432d050913079e4f87db6 dictionary.py
6f689ac03f8750d55289a1bc5e48d3ca999fe38c046fb7fc13ae3eb2e426ee21 build_dict_sqlite.py
890ca8e441470e54bdff738673458664caf3a7cd8f74ece6fc308b4f40dbe3c6 script_store.py
```

`git diff --check -- local-bridge/app/services/script_store.py local-bridge/app/services/dictionary.py local-bridge/app/scripts/build_dict_sqlite.py local-bridge/tests/test_dictionary_service.py` from main exit0, empty stdout/stderr. This is whitespace inspection, not runtime activation. Main runtime database/input/state were not rebuilt/copied; active Antigravity source/process untouched.

Independent read-only source-delivery review also PASS: actual four main/source/receipt SHA match; four backup SHA match receipt old SHA and main HEAD blob; all source/main/backup modes0644. Reviewer did not directly observe historical pre-copy state, but did verify preserved backup equals HEAD. Own `git -C '/Users/hoangson/Projects/YouTube JP Caption Studio' diff --check` exit0, empty stdout/stderr. Its actual delivery probe stdout ended:

```text
PASS: four actual main files match reviewed worktree/receipt; four actual backups match receipt old SHA and current main HEAD; all modes0644; source delivery only, no native activation proof
```

The copied dictionary test SHA is932392e61f89fee1330ac838a96803cc3ca376d1d43c271b0b329c7682bbf4b8. No test rerun or API/DB mutation in delivery review.
