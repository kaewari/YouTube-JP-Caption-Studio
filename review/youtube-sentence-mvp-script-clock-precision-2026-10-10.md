<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Script-store clock precision

STATUS: PASS for the independently reviewed precision fix and actual HTTP to
isolated filesystem store. Full backend, native deployment and Drive NOT VERIFIED.

## Request path and defect

Content save → worker bridge queue → POST `/scripts/save` → request schemas →
`script_store.save_script` → cues/meta/tokens JSON and canonical `script.txt` →
GET `/scripts/{id}` → `load_script` → TXT parser → JSON response.
This persistence path uses files, not a SQL database.

Original formatter rounded clocks to tenths. Actual save/load reproduced HTTP200
with saved clocks1.234–4.789 and loaded clocks1.2–4.8, assertion exit1. Reading the
canonical TXT also rebuilt JSON and changed revision despite no intentional edit.
The shared formatter now retains the decimal representation of the input float;
the parser converts the full seconds string once, avoiding intermediate rounding.
Production change is limited to `local-bridge/app/services/script_store.py`.

The first Decimal arithmetic fix failed independently for finite1e30 with
`decimal.InvalidOperation: DivisionImpossible`, exit1. Fixed decimal strings and
integer divmod removed the context-precision ceiling. Permanent sanity includes
tiny fractions, minute boundaries, 1e30 and 1e300.

## Commands and actual output

Parent and independent reviewer both ran:

```text
'/Users/hoangson/Projects/YouTube JP Caption Studio/local-bridge/.venv/bin/python' scripts/sentence_script_store_sanity.py
exit 0
{"http":200,"savedClocks":[1.234,4.789],"loadedClocks":[1.234,4.789]}
PASS: actual HTTP200 production save/load preserves precise clocks, owned targets/locks and revision on isolated disk; HTTP422 rejects invalid timing without disk mutation; missing is explicit
```

From `local-bridge`, parent and reviewer ran the existing ten checks:

```text
PYTHONPATH=. '/Users/hoangson/Projects/YouTube JP Caption Studio/local-bridge/.venv/bin/python' tests/test_script_store.py
exit 0
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

Reviewer also ran `node extension/shared/import_parse_test.js`, exit0, stdout/stderr
empty. Additional independent Python/Node stdin checks exited0, actual output:

```text
PASS: 2012 finite formatter/parser exact roundtrips incl near-minute, tiny/subnormal fractions, 1e30 and largest finite float
PASS: production JS import parser accepts nine actual backend-formatted longer-fraction tokens and preserves tested clocks
{"manualTxtHttp":200,"clocks":[60.00000000000001,61.23456789],"revision":4,"lock":true}
PASS: actual HTTP GET honors canonical manual TXT edits with longer fractions, rebuilds precise cues.json and preserves user targets/lock/owned revision
PASS: actual HTTP422 leaves all four isolated script files byte-identical
```

Full stdin commands remain in the tool transcript; these are additional reviewer
checks, not independently runnable permanent commands. `git diff --check` exit0,
stdout/stderr empty. No assertions weakened or skipped.

## API, disk and limitations

Production router/service, actual localhost HTTP: POST save200, GET200 exact
clocks/source/user targets/lock/owned/revision, invalid timing422, missing200
found=false. TemporaryDirectory isolates store and device identity; no production
store or Drive changes. Reviewer confirmed all four files unchanged on reject and
canonical manual TXT edits still take priority.

Parent full `python -m pytest -q tests/` exited1:9failed/25passed/4warnings.
An isolated process replaced only the loaded script_store module with unmodified
HEAD source and reran the same suite: exit1, same9failed/25passed. Two build_dict
tests cannot open the temporary SQLite file; seven dictionary checks lack expected
runtime entries. This baseline comparison was performed by parent, not independently
repeated by reviewer. It does not make the full suite pass.

Backend remains in the worktree; main runtime has not been updated/restarted.
Longer fractions pass production JS import. Native iPad/iPhone and Drive round-trip
remain NOT VERIFIED. Previously rounded source clocks cannot be recovered from
files that already lost precision. Full MVP stays active and NOT VERIFIED.
