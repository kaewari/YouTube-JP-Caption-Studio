<!-- date: 2026-08-02 -->
<!-- source: chat:2a642c98 · Next/Prev + Drive settings -->

---
name: Next prev settings Drive
overview: iPad WKWebView Back/Forward; fix follow flash on cue change; auto-sync settings after Drive Connect. Each step Simulator-green before next.
todos:
  - id: ipad-web-nav
    content: Address-bar Back/Forward → goBack/goForward; Sim test → next
    status: completed
  - id: scroll-nojank
    content: Follow — scroll only if offscreen; no flash on cue change; Sim → next
    status: completed
  - id: drive-settings
    content: caption-studio-settings.json auto pull/push on Connect (ext + iPad); Sim/smoke → docs
    status: completed
isProject: false
---

# iPad nav + follow fix + settings Drive sync

**Gate:** Sim green after each todo before the next. Dest: `iPad (A16)` / `YouTubeJPCaptionStudio`.

## 1. Back/Forward (page history, not cues)

- Buttons beside address bar in [`ContentView`](ipad-app/Views/ContentView.swift).
- [`YouTubePlayerView`](ipad-app/Views/YouTubePlayerView.swift): `goBack`/`goForward`; disable via `canGoBack`/`canGoForward`.
- `PAGE_NAV` keeps `videoID`/`urlField` in sync.

**Sim:** navigate YT → Back/Forward work; disabled at history ends.

## 2. Follow flash on cue change

In [`ContentView.scrollActiveIntoView`](ipad-app/Views/ContentView.swift): on `activeCueId` change, **only** `scrollTo` if row off-screen; skip animation/center rebuild when already visible; don’t nil-then-set active (avoids one-frame blink).

**Sim:** play through several cues — highlight moves, no flash-jump.

## 3. Auto settings sync (`caption-studio-settings.json`)

Wire file next to backup; `updatedAt` LWW. Keys: showFurigana, barShowJa/En/Vi, barScale, opacities, dimHardsub, dictShowSentence, levelHighlightEnabled, levelColors, followTimeline, isDarkTheme, sidePanelFontScale. Skip geometry (`barPos`, panel width, …).

**Auto (no manual Upload):** Connect → pull if newer else push; connected edits → debounce push; foreground/pull path → pull-if-newer.

- Ext: [`service_worker.js`](youtube-jp-caption-studio/extension/background/service_worker.js) in connect/`pullDriveIfNewer` + `hardsubSettings` change.
- iPad: `SettingsSync.swift` ↔ `@AppStorage`; call from Connect + foreground; debounce on sheet edits.
- Smoke: encode/decode roundtrip; missing Drive file → create from local.

**Sim/smoke:** roundtrip assert; OAuth optional if token missing.

## Done

Back/Forward works; no follow flash; Connect auto-syncs settings PC↔iPad; each step Sim-verified.
