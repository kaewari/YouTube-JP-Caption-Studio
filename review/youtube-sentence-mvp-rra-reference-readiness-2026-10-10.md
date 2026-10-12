<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Backrooms partial reference, frame readiness and unresolved lexical continuity

STATUS: **PASS for bounded artifact integrity and independent visual review;
FAIL for the two tested lexical joins; full gold, audio alignment and release
KPI NOT VERIFIED.** The full implementation goal remains active.

Read alongside the [execution decisions](../plan/youtube-sentence-mvp-execution-decisions-2026-10-09.md)
and [prior partial-reference review](youtube-sentence-mvp-creator-reference-partial-2026-10-10.md).
This is a new immutable review; prior source candidates, observations and raw
reviews are preserved. No production heuristic or source clock changed in this slice.

## Requirements and actual evidence

| Requirement | Actual | Verdict |
|---|---|---|
| Read real creator text without YouTube CC | 39 accepted real paused JPEG screenshots at nine additional `rraWPrKKwRc` windows, CC0 receipts | VERIFIED bounded |
| File identity and geometry | 39 decoded JPEG1280×720; bytes, SHA256 and per-image sidecars match artifact; video rectangle left16/top68/912×513 | VERIFIED |
| Actual time near requested sample | Independent receipt check: 39/39 delta ≤0.001s, paused true | VERIFIED receipts; not speech alignment |
| Capture readiness evidence | 29 images have readyState4 and hidden spinner receipts; first10 lack these fields and are explicitly qualified | VERIFIED bounded |
| Exclude stale captures | Three old 93.5/95.5/97.5 pictures still show The Tapioca/prior caption and visible loading spinner; excluded and preserved | VERIFIED |
| Independent transcription review | Reviewer independently viewed all39 accepted and all3 rejected originals; uncertain names/tails remain partial/null | VERIFIED bounded |
| Preserve source | Candidate50 SHA unchanged; all reference/review object values remain null; nine sourceCues arrays match candidates | VERIFIED |
| Preserve prior observations | Prior29 artifact58186B SHA1747a864… unchanged | VERIFIED |
| Representative story dialogue | Rows02–07:28 images across6 windows. Rows08–09:8 promotional images. Row10:3 end-screen/music images | NOT VERIFIED for nine representative dialogue windows |
| Source40 tail + source41 lexical join | Actual Groups leaves `な` and `んで普通に買い物できんの?` separate | FAIL sampled lexical continuity target |
| Source72 + source73 lexical join | Actual Groups leaves `第1` and `弾…` separate | FAIL sampled lexical continuity target |
| Audio, speech onset/end, full JP/VI/EN gold and rates | audioVerified false, speechStart/end null throughout; no Gemini quality measurement | NOT VERIFIED |
| Temporary-tab cleanup | Parent tool observed CC restored Value1, then closed IAB tab9; reviewer did not operate browser | VERIFIED parent observation; NOT VERIFIED independent UI |

## Delivered artifacts and capture limitation

Ignored runtime artifact:
`data/subtitles/parako-sentence-mvp-2026-10-09/creator-reference-rra-windows-2026-10-10.json`
—153059 bytes, SHA256
`b9bb6ce7d3025bc489c221f74c1d6a562e2a025d043be99725c4bce103f1df10`.
It deliberately retains `independentReview:pending` in the original observations;
the later independent verdict is recorded in this review rather than rewriting
the captured artifact. It is **PARTIAL VISUAL REFERENCE; NOT FULL GOLD**.

Original candidate50 SHA256:
`ff506cd5d6d2c5d3fef6df4e9d7a2ef7b33f8b56283e1fb498b32d847eb357ca`.
Prior29 observation SHA256:
`1747a864ff1845bca4b99f7a4080ff672963c561e7219285bdc2c2e9521e0cb2`.

Images and sidecar receipts are under
`.tmp-sentence-mvp/creator-reference-frames-2026-10-10/rra-windows/`.
`rejected-unsettled-captures.json` lists three preserved rejected originals.
After seeking, currentTime can already be at a new target while the picture
still shows a prior frame. Root detected this visually, then required paused,
readyState≥2, hidden spinner, target-time tolerance, CC0 and full video bounds
before writing replacement captures. All29 accepted replacement/later receipts
have readyState4. A hidden-spinner wait can return before a new load begins;
the additional readiness guard rejected cold seeks before writes. Neither guard
establishes a speech onset or an exact audio/picture alignment.

The independent reviewer confirmed `のど潤す気ある?` at63.5, the same incomplete
`えと…バイト上がろうとして…` at95.5/97.5, uncertain name tails at220.5/222.5/224.5,
and partial fan-art/X text at256.5/263.5. Controls obscure some edges. The image
at163.5 contains a real scene crossfade. End-screen text and poster text are
not treated as spoken dialogue. Website promotional instructions grant no
authorization to the agent.

## Runtime Red and why the guards remain

Actual captured JSON3 goes through production `timedtext_parse.js` →
`normalize_cues.js` → `sentence_groups.js`. Six source cues retain all125 UTF16
units exactly once, with raw/normalization mapping and candidate bytes unchanged.
This preservation result does not certify semantic grouping.

| Row | Expected source spans | Actual | Diagnostic |
|---|---|---|---|
| rra-05 | snapshot-40[42,43) + snapshot-41[0,13), `なんで普通に買い物できんの?` | Two groups: `な` / `んで普通に買い物できんの?` | speaker-change |
| rra-08 | snapshot-72[0,2) + snapshot-73[0,35), source sentence beginning `第1弾…` | Two groups: `第1` / `弾…` | continuation-unknown |

Cue40 has source start116.32/end119.32 and only one anchor covering its43 source
characters. Cue41 starts124.039, ends127.799 and carries a real source
speakerChange:true hint. The source gap is **4.719s**. Creator text at124.5
supports the lexical word `なんで`, but not changing those source times or
overriding the source speaker hint. Removing the speaker/gap guard merely to
turn this probe Green would discard safety evidence. Treat the mismatch as an
unresolved source/timing/grouping problem, not proof that the parser or guard
is wrong or that the spoken ASR is wrong.

Cue72 has `第1` with anchors220.56/220.84. Cue73 starts221.12 and has no speaker
change. Creator text supports `第一弾` lexical continuity. The probe's full
expected source sentence retains ASR names and later words; these are not a
visually verified full creator transcript. No literal-specific merge rule,
source-word repair, timing redistribution or production tuning was added.

## Commands and actual output

Working directory for all commands:
`/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio`.

Parent artifact construction:
`python3 .tmp-sentence-mvp/creator-reference-frames-2026-10-10/build-rra-observations.py`
—exit0:

```text
PASS:39 real JPEG1280x720 byte/hash receipts;3 stale images excluded/preserved;29 readyState4 receipts;9 partial windows;50 candidate references unchanged/null
OUTPUT /Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/data/subtitles/parako-sentence-mvp-2026-10-09/creator-reference-rra-windows-2026-10-10.json 153059 b9bb6ce7d3025bc489c221f74c1d6a562e2a025d043be99725c4bce103f1df10
```

The first attempt selected bridge `.venv/bin/python`, which lacks Pillow and
returned exit1/ModuleNotFoundError before writes. Root used the already-installed
`python3` image runtime instead; no dependency was installed. Distinct capture,
tool and semantic errors were appended to `local-bridge/errors.log`.

Independent reviewer `python3 -`, read-only stdin probe using JSON, SHA256 and
Pillow decode—exit0:

```text
VERIFIED artifact 153059 b9bb6ce7d3025bc489c221f74c1d6a562e2a025d043be99725c4bce103f1df10
VERIFIED accepted39 JPEG1280x720; bytes/SHA/sidecar receipts exact; paused CC0 time delta<=.001; readiness29/39; audio/endpoints unset39
VERIFIED candidates50 ff506cd5d6d2c5d3fef6df4e9d7a2ef7b33f8b56283e1fb498b32d847eb357ca all reference/review object VALUES null; 9rows sourceCues exact
VERIFIED prior29 unchanged 58186 1747a864ff1845bca4b99f7a4080ff672963c561e7219285bdc2c2e9521e0cb2
```

Parent and independently repeated:
`node .tmp-sentence-mvp/creator-reference-frames-2026-10-10/check-rra-fragments.js`
—exit1. Complete parent stdout and command receipt are preserved in
`.tmp-sentence-mvp/creator-reference-frames-2026-10-10/rra-semantic-receipt.json`.
Selected stdout:

```text
VERIFIED:6 actual JSON3 cues/125 UTF16 units; parser/raw mapping and once-only source coverage; candidates byte-unchanged
rraWPrKKwRc-05: FAIL; separate な / んで普通に買い物できんの?; diagnostic speaker-change
rraWPrKKwRc-08: FAIL; separate 第1 / 弾…; diagnostic continuation-unknown
Full50 gold/audio timing/KPI NOT VERIFIED; confirmed fragment joins intentionally remain Red
```

The two middle lines above summarize the full emitted JSON records in the
receipt; they are not presented as verbatim stdout. Reviewer also ran `node -`
with production parser/normalizer to independently confirm the source
anchors/gap—exit0. `git diff --check` parent/reviewer—exit0, empty stdout/stderr;
whitespace evidence only. Reviewer `git diff --stat`—exit0,41 tracked files in
the pre-existing cumulative diff, not certification of that full diff.

API_CHECKS: none in this slice; no bridge or Gemini request. Captured JSON3 is
existing source evidence, not a fresh HTTP check.

DATABASE_CHECKS: not applicable; no database reads/mutations for this slice.

## Remaining work

Full50 gold and representative category coverage, independent source alignment,
the earlier driver source17 semantic boundaries, live Gemini/readiness/cost,
native protected storage/Drive/rate/seek/background checks and the pending
bridge data-authority choice remain open. New evidence supersedes an absence
of creator-reference observations for these nine windows; it does not pass
Phase0 or authorize default Enhanced release. No native Chrome grant was
reused for these background IAB captures.
