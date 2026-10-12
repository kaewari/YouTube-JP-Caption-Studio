<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Chrome đang sẵn sàng thêm 2 phút -->

# Native lifecycle activation follow-up

STATUS: PASS for basic native lifecycle activation and independent artifact integrity/arithmetic. Individual native rollback toggles, translation lifecycle, full readiness baseline and MVP release remain NOT VERIFIED.

## Native actions and delivered evidence

The user granted a fresh two-minute Chrome window. Native AX showed profile Katou, extension 0.11.2 enabled, loaded from `~/Projects/YouTube JP Caption Studio/extension`. Root clicked the installed extension's Reload, navigated the existing video tab to a fresh `TJ2zrbH0BB4` document, enabled LR, exported measurements using the real sidepanel and native Save dialog, and observed the download `201 KB • Done`. Root returned LR to OFF; AX confirmed value0 and screenshot showed `Dịch OFF`. No credentials, OAuth or Drive actions were performed. Screenshot was displayed in the tool output; no saved screenshot file is claimed.

Artifact: `/Users/hoangson/Downloads/yt-caption-TJ2zrbH0BB4-lifecycle-2026-10-10.json`.
Actual bytes206063; SHA256 `bde3b76b6281ba673040d8eb8ed37316ae26a9b797d20beda053dc5b85e5ba85`.

The trace has1006 events:996 `group_prepared`,4 `track_loaded`,5 `onset`,1 `jp_paint`. Preparation ordinals are exactly1..996 and unique within this trace. All preparation records have sourceCount1/protectedfalse. Independent audit found746 distinct clock/protection/source-count tuples; preparation revisions must not be described as996 independent sentences or quality samples.

Original JA only:3 cold and2 warm onset observations, all ready; distinct media anchors2.32/4.359/6.2/10.759/15.519. Sampling windows11.6–80.7ms. Labels are elapsed trace warmup, not verified network-cache states. Five observations do not certify the release KPI. No translation events or HTTP attempts occurred. Request latency, actual billing and estimated cost remain null/NOT VERIFIED. Dropped events and discontinuity events are zero.

Track-load elapsed1768.400ms and TTFV4991.600ms reconcile with exported monotonic timestamps. Actual paint rectangle width664.4140625/height126.8046875/top371.5859375/left210.3125. This is a measured paint, not a before/after layout test or API latency. Events span3186.9–16847.2ms; this is not a continuous two-minute playback run.

## Commands and actual output

Root ran a Python heredoc (`python3 - <<'PY'`) loading the actual artifact with `json.loads`, comparing current main/worktree bytes with `Path.read_bytes`, checking event schema, finite ordered clocks, unique consecutive ordinals, recomputing readiness from onset events, and recomputing elapsed load/paint times. Exit0, actual stdout:

```text
BYTE MATCH extension/content/content.js 5f5335d85454f21b911afb49c7c3a058261b1d03867452ea4af1b034349d9db0
BYTE MATCH extension/shared/sentence_benchmark.js cf6a849e63d726830992f79de7fe6c2adc9042f661ccd49d7f53ee6589f5106c
BYTE MATCH extension/shared/gemini_translate.js 2a5813aaeba99236990c4854a5564f92964bd8254983633d8d81cd78f0fd1c88
PASS: native JSON parsed; 996 consecutive unique preparation ordinals, allowed lifecycle fields only, zero drops, five JA onset summaries and measured paint/clock arithmetic reconcile; zero HTTP leaves cost null
RECT {'width': 664.4140625, 'height': 126.8046875, 'top': 371.5859375, 'left': 210.3125}
SOURCE_COUNTS {1: 996}
PROTECTED 0
```

Independent read-only reviewer parsed and recomputed the artifact without operating Chrome, and read the actual collector schema. Its own integrity/arithmetic checks passed. Browser actions remain root-observed, not reviewer-operated. Source schema inspection is not counted as a UI test. Actual native export/paint and independently parsed artifact establish the bounded activation claim.

One root audit first guessed `extension/content.js` and failed before doing assertions; corrected using `rg --files extension`, then the above actual audit exited0. A wiki read guessed the wrong topic filename; corrected using the live catalog. Both errors were appended to `local-bridge/errors.log`.

API_CHECKS: no Gemini request in this native trace; latency/cost NOT VERIFIED.
DATABASE_CHECKS: none in this slice; no persistence/Drive roundtrip claim.
PROBLEMS / REQUIRED_FIXES: live translation, individual native flags toggle tests, protected data persistence, audio-reviewed gold and rate/seek/background matrix remain open. The installed content includes the reviewed flags, but this session did not toggle them separately. The full goal remains active.

This follow-up supersedes the basic lifecycle pending-activation state in the [previous raw lifecycle review](youtube-sentence-mvp-lifecycle-instrumentation-2026-10-10.md), while preserving its historical boundary. It does not supersede native flags-behavior or translation acceptance gates.
