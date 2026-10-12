<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Partial creator reference and confirmed sentence boundary failure

STATUS: **FAIL for the mandatory source17 semantic boundary. PASS for bounded
image/receipt integrity. Full50 gold, audio alignment and release KPI NOT VERIFIED.**

This review advances Phase0 of the [authorized plan](../plan/youtube-sentence-enhancement-mvp-2026-10-09.md).
Actual creator text in29 sampled stills across five Parako videos is recorded
separately from the unchanged50 source candidates. No production code, source
caption, speech clock, active bridge state or credential was changed in this slice.
Original remains the default; this is not a full MVP completion claim.

## REQUIREMENTS

| Criterion | Actual | Status |
|---|---|---|
| Existing15 image/receipt identities | Independent reviewer verified SHA, decoded dimensions and byte equality with original tool image payloads | VERIFIED |
| Additional14 sampled stills | Decoded JPEG1280×720, byte/SHA match per-file metadata, paused/CC0, target error under0.001s | VERIFIED for artifact consistency |
| Correct image MIME | Existing15 `.png` filenames contain JPEG/JFIF; new14 use `.jpg`; partial artifact records actual `image/jpeg` | VERIFIED with earlier filename contradiction retained |
| Complete video picture | New14 video bounds have top=-94; upper picture clipped, captions readable with listed control occlusions | NOT full-frame evidence |
| Cross-cue `どこ`+`行くんですか?` | Actual production Groups yields one question with source20[17,19)+21[0,7) | VERIFIED for this sample |
| Separate driver tail/reply/new question in source17 | One group crosses visually supported offsets4 and9 | CONTRADICTED |
| Immutable source candidates | Same588672B SHA; reference/review objects still contain only null values | VERIFIED |
| JP/VI/EN audio transcript, speech onset/end and silence | No audio inspection; stills prove sampled visibility only | NOT VERIFIED |
| Full50 independent semantic rates and representative categories |29 stills cover opening/mandatory regions, not50 fully annotated windows | NOT VERIFIED |

## Evidence artifacts

Ignored runtime observations:
`data/subtitles/parako-sentence-mvp-2026-10-09/creator-reference-observations-2026-10-10.json`
58186B, SHA256 `1747a864ff1845bca4b99f7a4080ff672963c561e7219285bdc2c2e9521e0cb2`.
They include actual MIME/hash, sample times, uncertainty, provisional VI/EN samples
and two visual boundaries. Speech start/end fields remain null.

Unchanged source candidates:
`data/subtitles/parako-sentence-mvp-2026-10-09/annotation-candidates-50.json`
588672B, SHA256 `ff506cd5d6d2c5d3fef6df4e9d7a2ef7b33f8b56283e1fb498b32d847eb357ca`.
Reference/review are objects whose values are null, not null objects. An initial
builder assertion confused those shapes; it failed before output or source writes
and was corrected to check every value. This was an audit-adapter failure.

Frames live under ignored `.tmp-sentence-mvp/creator-reference-frames-2026-10-10/`.
The original `frames.json` lost ten metadata entries and remains preserved.
Recovered latest exact capture receipts are in
`frames-recovered-receipts-2026-10-10.json`, SHA256
`61f1e4d9a10680cd5e326f68c4546bcf794720a511dddb1eabe67dd59a4c6f07`.
Reviewer independently compared all15 current bytes with original base64 image
payloads, not only hashes copied into receipts. All15 are JPEG despite filenames.
The additional14 images each have a `.jpg.json` measurement/hash record.

## Confirmed semantic failure

Mandatory row IDs are `ylnxFdPhLCo-03` (source17–19) and
`ylnxFdPhLCo-04` (source20–22). They are positions2/3 when indexing from zero.

Actual source17 at65.04–73.28:

```text
だなんて言い方きし家族とか友達は乗せて
```

All its raw segment anchors have `speakerChange:false`. Actual source18 starts
`ないんですか?ああ`. Production parser→normalizer→Groups currently yields:

```text
だなんて言い方きし家族とか友達は乗せてないんですか?
```

It covers source17[0,19)+source18[0,7). Source preservation is correct, but the
sentence combines the driver's prior fragment, another character's reply and
his subsequent question. Creator stills independently support:

| Sample times | Visible creator wording | Visual reference |
|---|---|---|
|63.5/65.5s | `初めて助手席に乗ってくれるのが` / `ひかるくん…君だなんて` | Driver's prior utterance; fragment/context not a complete audio transcript |
|66.5/67s | `言い方きしょ` | Separate reply by teal-haired passenger |
|68.5s | `家族とか友達は?` | New question by the same passenger |
|69.5/70.5s | `乗せてないんですか?` | Negative question continuation |
|78.5/79s | `どこ行くんですか!?` | One question by orange-haired passenger |
|80.5/81.5/82.5s | `目的地はない…当てもなく、だ〔よ?〕` | Driver reply; right end partly under controls |

The separate visual reference maps boundaries to normalized/raw UTF16 source17
offset4 before `言い方` and offset9 before `家族`. A YouTube segment starts at
offset4/time66; that is a source segment-start observation, not audio-aligned
speech timing. Offset9 has no exact source segment-start anchor; no interpolation
or fabricated display/speech clock is supplied.

Creator `きしょ` differs from source `きし`. This is a verified visible mismatch;
audio ASR error remains NOT VERIFIED. Source words are retained. An explicit
speaker hint alone would also leave the same-speaker boundary before `家族`
unresolved. No video/cue/literal rule has been added to production.

## Other partial observations

- `rraWPrKKwRc`: `ありがとうございましたー`, `そろそろ上がる時間か`, then
  sampled ellipsis. Current grouping separates `ああ、そろそろ` from
  `上がる時間か。`; a possible missed continuation needs full reference/POS review.
- `CLs0YSeggXk`: `なんか今日女子多いな…`; name in `〔新?〕ちゃん、大丈夫か`
  is uncertain and remains null in lexical reference, with the reading uncertainty
  recorded. Do not turn kana/kanji styling into a claimed ASR error.
- `_aMBGfcwtGY`: `2分49、50、51、52…` and stylized `あー惜しい`.
  Source lacks visible51/52; this does not establish an audio omission. Holdout
  opening observation was not used for algorithm tuning.
- `oLYBgoeslnk`: `あ、あのー` and `遅れたものはしょうがないし`.
  Clause-finalし remains continuation; no whole-sentence boundary is inferred.
- Drive71.5/72.5s show ellipsis,74.5s shows no lexical creator caption.
  Actual source19 is `、` at73.28–78.08 with anchor73.28 and its own punctuation
  group. The ellipsis samples precede source19; none proves an audio silence
  interval or authorizes replacing punctuation. Source19 is preserved.
- Drive75.5/76.5s show `…さあ出発するよ`;77.5s `なんかすいません`;
 84.5/85.5s `大学生ってやっぱ暇なんだー〔!!〕`. End punctuation/elongation
  is uncertain where player controls overlap. Repeated stills are not independent
  sentence samples or proof of continuous visibility between samples.

VI/EN examples in the runtime artifact translate the visible text provisionally,
retain negation and mark contextual pronouns. They do not score actual Gemini
translations, settle name pronunciation or constitute full translation gold.

## COMMANDS

Parent data-artifact build:

```sh
python3 .tmp-sentence-mvp/creator-reference-frames-2026-10-10/build-partial-observations.py
```

Exit0, actual stdout:

```text
PASS:29 decoded JPEG1280x720 byte/hash identities; partial observations written; candidates unchanged/all50 refs null
OUTPUT /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/data/subtitles/parako-sentence-mvp-2026-10-09/creator-reference-observations-2026-10-10.json 58186 1747a864ff1845bca4b99f7a4080ff672963c561e7219285bdc2c2e9521e0cb2
```

The builder refuses overwrite of filed observations. It is an artifact-integrity
check, not software or live API verification.

Actual production semantic check:

```sh
node .tmp-sentence-mvp/creator-reference-frames-2026-10-10/check-semantic-boundaries.js
```

Exit1, no stderr after adapter correction, actual stdout:

```text
VERIFIED: actual JSON3 parser→normalizer→Groups; exact source/raw mapping and once-only UTF16 coverage retained
{"rowId":"ylnxFdPhLCo-03","kind":"speaker-change","cueId":"snapshot-17","charOffset":4,"status":"FAIL","crossingText":["だなんて言い方きし家族とか友達は乗せてないんですか?"]}
{"rowId":"ylnxFdPhLCo-03","kind":"new-question-same-speaker","cueId":"snapshot-17","charOffset":9,"status":"FAIL","crossingText":["だなんて言い方きし家族とか友達は乗せてないんですか?"]}
{"rowId":"ylnxFdPhLCo-04","kind":"mandatory-question-join","status":"PASS","text":"どこ行くんですか?"}
Full50 semantic KPI/audio alignment NOT VERIFIED; failing visual boundary audit intentionally remains Red
```

It executes production functions against the actual captured JSON3; it does not
inspect source-code strings. Before grouping, it checks exact parsed raw metadata
and normalization against the immutable source snapshot. After grouping it checks
once-only UTF16 coverage, unchanged cues/candidate bytes and visual boundary
crossing. The Red remains open; no assertion was weakened to claim PASS.
An initial adapter looked for parser `source` instead of its actual `text` field
and failed before grouping; this diagnostic error was corrected and logged.
Exact command/exit/stdout/stderr receipt is preserved as
`.tmp-sentence-mvp/creator-reference-frames-2026-10-10/semantic-boundary-receipt.json`.

Independent reviewer separately viewed all29 actual images and ran JSON3 production
probes. First15 also match original tool image payloads. New14 metadata audit exit0:

```text
PASS:14 decodedJPEG1280x720/hash/bytes/MIME/paused/CC0/sample time metadata; all14 upper video picture clipped top=-94
```

Independent source19 probe exit0:

```text
{"cue":"snapshot-19","source":"、","start":73.28,"end":78.08,"anchors":[{"charStart":0,"charEnd":1,"time":73.28,"speakerChange":false}],"group":"、"}
PASS:actual JSON3→normalize→Groups preserves punctuation-only source19; stills71.5/72.5 ellipsis and74.5 no lexical caption do not establish audio silence or substitute a transcript
```

Reviewer `node extension/shared/sentence_groups_test.js` exit0 passes all11 existing
metadata-contract assertions. That result does not close the real-data semantic
Red. Parent and reviewer `git diff --check` exit0/no output is whitespace proof only.

## API_CHECKS / DATABASE_CHECKS

No new API or database operation. Actual browser playback provided sampled images,
not downloaded media/audio. Parent used a separate background IAB tab, restored
CC1 (actual AX Value1) and closed it. Reviewer did not independently control the
browser; cleanup is parent tool-observed. The earlier native Chrome availability
was already consumed; no native Chrome action was performed in this slice.

## PROBLEMS / REQUIRED_FIXES

1. Complete representative JP references and boundaries for50 windows, retaining
   uncertain source_ASR/parser/segmentation/renderer/translation labels separately.
2. Resolve the real-data false boundary through evidence and a general mechanism;
   do not guess speaker identities from text or use cue-specific production rules.
3. Preserve exact raw mapping and source windows when references lack precise
   timing; a sampled still does not justify speech retiming.
4. Keep semantic quality FAIL and full KPI NOT VERIFIED until real checks pass.
   The full goal remains active. Pending bridge-data authority, native protected
   roundtrip, live Gemini/cost and rate/seek/background checks remain separate gaps.
