<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: thực hiện plan, không dừng giữa chừng -->
# Sentence metric player clock consistency

STATUS: PASS for independently reviewed bounded sampler fix; native activation and release KPI NOT VERIFIED.

Native export contained237 discontinuities. This prompted tracing every syncCueAtMediaTime caller from disk: tick/timeupdate/seeked use video.currentTime; requestVideoFrameCallback uses decoded metadata.mediaTime. The sampler previously used whichever timestamp the renderer received. A late presentation timestamp can falsely move the sampler clock backward, increment pass and count the same real onset twice.

## Reproduced root cause and minimum change

Permanent production-function runtime regression: `scripts/sentence_benchmark_sanity.js --clock-only`.
Before fix it exited1 with AssertionError: one player clock must not jump backward when frame timestamps lag; actual1,expected0. The independent reviewer reproduced old behavior in VM by replacing only the new sampler expression with the old one:1discontinuity/2onsets. This is a behavioral Red, not source string testing.

Production diff is ONE line in extension/content/content.js: sampler time is now video.currentTime. Renderer currentMediaTime, findActiveCue(mediaTime), painting, auto-pause and sidepanel time continue to receive caller presentation time. Current production Green sampler inputs[.99,1.01,1.02,1.03], renderer/cue/sidepanel inputs[.98,1.01,.99,1.03]:0discontinuities/1onset. Existing seeking fixture now supplies actual currentTime so the guard is still exercised. No dependency, new UI or database changes.

## Actual parent commands

```text
COMMAND: node scripts/sentence_benchmark_sanity.js --clock-only
EXIT: 0
PASS: production sync measures one player clock across interleaved frame/timeupdate/tick calls; one onset, no artificial discontinuity, renderer timestamps preserved
```

```text
COMMAND: node scripts/sentence_benchmark_sanity.js
EXIT: 0
PASS: actual content sync excludes seeking onset
PASS: actual paint observer rechecks hidden tab, Japanese and overlay settings inside RAF
PASS: production sync measures one player clock across interleaved frame/timeupdate/tick calls; one onset, no artificial discontinuity, renderer timestamps preserved
PASS: empty metrics remain NOT VERIFIED; cold/warm onset bounds distinguish ready/missing/uncertain; seek/gaps excluded; real receipt IDs deduplicate HTTP attempts; no fabricated cost
```

```text
COMMAND: node scripts/sentence_cost_sanity.js
EXIT: 0
PASS: actual HTTP200 VI/EN batch dedup keeps thinking/cache usage; rejected translation retains usage; cache exports no historical request; list-price estimate is separate from unverified billing
PASS: missing/expired/unknown/invalid usage never becomes zero-cost success; totals include thinking; incomplete trace estimates are explicitly partial
```

```text
COMMAND: git diff --check
EXIT: 0
(stdout/stderr empty)
```

## Independent read-only evidence

Reviewer read original DATA-02 requirements, current diff and all real callers; reran commands above independently, exit0. Separate production VM Red:exit1, stdout oldSampler discontinuity1/onset2, rendererTimestampPreservedtrue, assertion1!==0. Green:exit0; outputs:

```text
{"green":{"discontinuity":0,"onset":1},"samplerInputs":[0.99,1.01,1.02,1.03],"rendererInputs":[0.98,1.01,0.99,1.03],"sidepanelInputs":[0.98,1.01,0.99,1.03]}
{"guard":"paused","onset":0,"discontinuity":0}
{"guard":"seeking","onset":0,"discontinuity":0}
{"guard":"hidden","onset":0,"discontinuity":0}
{"guard":"rate","onset":0,"discontinuity":1}
{"guard":"backwards","onset":0,"discontinuity":1}
{"guard":"gap","onset":0,"discontinuity":1}
{"guard":"jump","onset":0,"discontinuity":1}
PASS: production sync single metric clock; renderer/cue lookup/sidepanel keep exact caller times; paused/seeking/hidden/rate/backwards/gap/jump exclusions survive
```

No blocking finding. The native export has10 DISTINCT mode/media anchors (3.879,4.08,13.48,20.48,21.119,21.56,25.16,29.96,32.559,40.8), parent Python counter exit0; no duplicated anchor in that particular file. Missing raw samples prevent attributing all237native discontinuities to this mechanism. Earlier [native artifact review](youtube-sentence-mvp-native-metrics-activation-2026-10-10.md) remains integrity/arithmetic evidence only; it does not certify completeness or release rates. The source clock bug is now confirmed and corrected in the bounded fixture, not yet native playback.

## Main copy and remaining work

After independent PASS, main content.js previous SHA matched prior deployment receipt; main/worktree diff was exactly the one sampler line. Original bytes backed up, file mode preserved and new bytes rechecked. Copy script exit0:

```text
GUARDED COPY extension/content/content.js SHA256 ada83d2a0078d34b25d6b77e56c3e24be4021228645b9806d45d5f97fb84b457 permissions preserved
```

Ignored backup/receipt `.tmp-sentence-mvp/chrome-clock-before-2026-10-10/receipt.json`. Native Chrome Reload/new playback after this copy NOT VERIFIED. New cost addition is likewise awaiting activation. Need controlled native language/rate/seek/background runs after Reload; do not treat prior prepared-text counts as paint proof or runtime release gate.

REQUIREMENTS: sampler consistency and preservation of renderer contract VERIFIED; genuine discontinuity/exclusion guards VERIFIED within production VM; native activation/full DATA-02 NOT VERIFIED.
API_CHECKS: actual localhost HTTP cost regression exit0; no live Gemini/native HTTP in clock review.
DATABASE_CHECKS: not applicable.
PROBLEMS / REQUIRED_FIXES: native replay, live translation/gold/protected compatibility/Drive and release KPI remain open; full goal active.
