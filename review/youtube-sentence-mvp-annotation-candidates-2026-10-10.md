<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu, đổi tên và thực hiện plan nâng cấp phụ đề YouTube -->

# Fifty source windows for reference review

STATUS: PASS for independently checked snapshot integrity. Gold, sentence quality,
translation quality, time alignment and representative category coverage NOT VERIFIED.

Runtime artifact is ignored `data/subtitles/parako-sentence-mvp-2026-10-09/annotation-candidates-50.json`,
588672 bytes, SHA256 ff506cd5d6d2c5d3fef6df4e9d7a2ef7b33f8b56283e1fb498b32d847eb357ca.
It contains fifty windows, ten per video, with three actual normalized source cues
per window. First three videos are tune30; last two holdout20, assigned before
quality tuning. Selection is uniform across source indices except two mandatory
continuation examples on ylnxFdPhLCo. No prediction is used as a reference.

## Independent result

Reviewer ran a Node stdin behavioral data check, exit0. It reparsed all five actual
JSON3 captures with production parser/normalizer and compared raw metadata, clocks,
normalization and all full UTF16 source refs. Actual result:

```text
bytes588672
SHA256 ff506cd5d6d2c5d3fef6df4e9d7a2ef7b33f8b56283e1fb498b32d847eb357ca
50 unique row IDs, tune30/holdout20,10/video
All5 raw SHA match manifest+rows
All150 source records exact;150 unique(videoId,cueId)
Mandatory yln rows03/04 exact17–19/20–22; both continuation examples present
All reference/review values null; evidenceStatus NOT VERIFIED
```

Full stdin command remains in the tool transcript. This is data integrity checking,
not a software or live API/KPI test. Parser-produced normalized source counts are
101/95/88/112/116, total512; the selected150 records cover29.296875%. IDs such as
snapshot-88 are scoped to video, not globally unique. Source cue clocks overlap
within44/50 windows; mandatory windows03/04 overlap in media time despite disjoint
source IDs. These original clocks are retained, not stretched into invented alignment.

## Remaining evidence

No speaker changes, JP/VI/EN references, gold boundaries, error classifications or
time-alignment labels are filled. Uniform windows do not establish fast speech,
silence, slang, negation, multi-speaker and multi-sentence category coverage.
Holdout naming alone does not establish a representative independent test set.

Parent opened the public mandatory video at65s in the separate in-app browser and
paused at73s. The observed frame contained YouTube CC, not a creator-written
reference; no audio was inspected. Nothing was promoted to gold. Temporary tab
closed. Chrome installed-extension checks remain separately pending stable control.

These candidates prepare review work; they cannot support broken_sentence_rate,
wrong_merge_rate, translation-quality or ASR claims. Original stays default and
the full goal remains active, incomplete.
