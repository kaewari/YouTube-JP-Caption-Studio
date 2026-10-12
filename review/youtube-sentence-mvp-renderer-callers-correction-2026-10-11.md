<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: execute plan; correct filed renderer caller names -->

# Renderer caller-name correction

The [filed independent renderer review](youtube-sentence-mvp-renderer-independent-2026-10-11.md) incorrectly names the overlay caller `renderOverlayCue` and sidepanel callers `renderViHtml`/`renderEnHtml`. Those names were not verified before filing. Current on-disk names are `updateBar` (content.js:4483, calls shared renderer at4524–4525), `renderBilingualVi` (sidepanel.js:1382, call1385), and `renderBilingualEn` (sidepanel.js:1398, call1401). The actual shared calls, cue tokens/settings, production diff and executed tests in that review remain valid. This is a source-label correction, not a new behavior or runtime test.

Static source inspection, exit0:

```text
COMMAND: rg -n 'function .*|renderOverlayCue|renderViHtml|renderEnHtml' extension/content/content.js | rg '44[0-9][0-9]|45[0-9][0-9]|renderOverlayCue'
STDOUT:
4416:  async function copyCue(idx, format) {
4444:  function barCueFingerprint(cue) {
4471:  function recordSentencePaint(bar, cue) {
4483:  function updateBar(cue) {
STDERR: (empty)
```

The current call blocks were separately reread from disk with `sed -n '4500,4528p' extension/content/content.js` and `sed -n '1368,1406p' extension/sidepanel/sidepanel.js`, both exit0. This static inspection establishes symbol/caller identity only. The earlier raw stays immutable; native activation and full MVP remain NOT VERIFIED.
