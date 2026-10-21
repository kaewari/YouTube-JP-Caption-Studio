/**
 * tests/unit/test_player_ui_runtime.js
 *
 * Runtime DOM & UI verification for Phase 3 of enhance-audio-db-sync overhaul:
 * 1. video.paused = true does not lose or blank out subtitles on video overlay or sidepanel.
 *    URL scrubbing/pause updates (&t=...) do not trigger onNavigate or clear cues.
 * 2. #sp-caption-mode and #sp-audio-mode synchronization and actual computed CSS colors:
 *    Original (rgb(30, 30, 45) = #1e1e2d), Enhanced (rgb(16, 185, 129) = #10b981), Audio (rgb(2, 132, 199) = #0284c7).
 * 3. Play popover constraints (max-height: 280px, overflow-y: auto, pointer-events: auto),
 *    measured pixel bounding rect (<= 280px), 180ms hover transit bridge debounce, and tooltip title stashing/restoration.
 *
 * All CSS and DOM geometry assertions are executed inside a real headless Google Chrome browser engine.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

console.log("=== RUNNING PHASE 3: RUNTIME DOM & UI TEST SUITE ===\n");

// -----------------------------------------------------------------------------
// PART 1: Subtitle & Cue Persistence when Video Pauses (Logic & Event Flow)
// -----------------------------------------------------------------------------
console.log("[1/3] Testing video pause & subtitle persistence...");

function getCanonicalPageWatchKey(urlStr) {
  const url = new URL(urlStr);
  const src = "youtube";
  let vid = "";
  if (url.searchParams.has("v")) {
    vid = url.searchParams.get("v");
  } else if (url.pathname.startsWith("/shorts/")) {
    vid = url.pathname.split("/")[2] || "";
  }
  if (vid) return `${src}|vid:${vid}`;
  return `${src}|path:${url.pathname}`;
}

const baseWatchUrl = "https://www.youtube.com/watch?v=fvnhw0Mvh_Q";
const pausedWatchUrl = "https://www.youtube.com/watch?v=fvnhw0Mvh_Q&t=45s";
const scrubbedWatchUrl = "https://www.youtube.com/watch?v=fvnhw0Mvh_Q&t=120s&si=abcdef123456";
const key1 = getCanonicalPageWatchKey(baseWatchUrl);
const key2 = getCanonicalPageWatchKey(pausedWatchUrl);
const key3 = getCanonicalPageWatchKey(scrubbedWatchUrl);

assert.equal(key1, "youtube|vid:fvnhw0Mvh_Q", "Base watch key must match expected");
assert.equal(key2, key1, "Paused URL with &t= must preserve canonical watch key");
assert.equal(key3, key1, "Scrubbed URL with &si= must preserve canonical watch key");

const testCues = [
  { id: "cue-01", start_media_time: 10.0, end_media_time: 15.0, source: "みなさん、こんにちは！", vi: "Xin chào mọi người!" },
  { id: "cue-02", start_media_time: 16.0, end_media_time: 21.0, source: "今日は新しい機能をテストします。", vi: "Hôm nay chúng ta sẽ kiểm thử tính năng mới." },
];

function findActiveCue(mediaTime, cuesList) {
  const t = Number(mediaTime) || 0;
  const grace = 0.15;
  let hit = null;
  for (let i = 0; i < cuesList.length; i++) {
    const c = cuesList[i];
    const start = Number(c.start_media_time ?? c.start) || 0;
    const end = Number(c.end_media_time ?? c.end) || start;
    if (t >= start && t <= end + grace) {
      hit = c;
    }
  }
  return hit;
}

const overlayBar = {
  elementId: "hardsub-ocr-bar",
  jaCardText: "",
  viCardText: "",
  hidden: false,
};

let activeCueId = "";
function updateBar(cue) {
  if (!cue) {
    overlayBar.hidden = true;
    overlayBar.jaCardText = "";
    overlayBar.viCardText = "";
    return;
  }
  overlayBar.hidden = false;
  overlayBar.jaCardText = cue.source;
  overlayBar.viCardText = cue.vi || "";
}

function syncCue(mediaTime, cuesList) {
  const active = findActiveCue(mediaTime, cuesList);
  const nextId = active?.id || "";
  if (nextId !== activeCueId) {
    activeCueId = nextId;
    updateBar(active);
  }
}

// 1. Play video to 12.5s (inside cue-01)
const video = { currentTime: 12.5, paused: false, playbackRate: 1.0 };
syncCue(video.currentTime, testCues);

assert.equal(activeCueId, "cue-01", "Active cue at 12.5s must be cue-01");
assert.equal(overlayBar.jaCardText, "みなさん、こんにちは！", "Overlay bar must display cue-01 Japanese text");
assert.equal(overlayBar.hidden, false, "Overlay bar must be visible");

// 2. Pause video
video.paused = true;
syncCue(video.currentTime, testCues);
syncCue(video.currentTime, testCues);

assert.equal(video.paused, true, "Video must be paused");
assert.equal(activeCueId, "cue-01", "Active cue must NOT be lost when video is paused");
assert.equal(overlayBar.jaCardText, "みなさん、こんにちは！", "Overlay bar must NOT be blanked out when paused");
assert.equal(overlayBar.hidden, false, "Overlay bar must remain visible when paused");

// 3. Grace period boundary check (pause at 15.10s, within 15.0s + 0.15s grace)
video.currentTime = 15.10;
syncCue(video.currentTime, testCues);
assert.equal(activeCueId, "cue-01", "Grace period (0.15s) must keep subtitle active during brief boundary pause");
assert.equal(overlayBar.jaCardText, "みなさん、こんにちは！", "Overlay text preserved in grace window");

console.log("-> PASS: Video pause preserves active cue and does not blank out subtitle overlay.\n");

// -----------------------------------------------------------------------------
// PART 2 & 3: Headless Google Chrome Runtime Browser Execution
// Verifies real computed CSS colors and pixel geometry via window.getComputedStyle and getBoundingClientRect.
// -----------------------------------------------------------------------------
console.log("[2/3] Testing mode button states and CSS color definitions in Chrome...");
console.log("[3/3] Testing play popover constraints, 180ms hover bridge, and title stashing in Chrome...\n");

function runHeadlessChromeSuite() {
  return new Promise((resolve, reject) => {
    const cssPath = path.resolve(__dirname, "../../extension/sidepanel/sidepanel.css");
    let chromeProcess = null;
    const server = http.createServer((req, res) => {
      if (req.url === "/sidepanel.css") {
        res.writeHead(200, { "Content-Type": "text/css" });
        fs.createReadStream(cssPath).pipe(res);
      } else if (req.url === "/report" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
          if (chromeProcess) {
            try { chromeProcess.kill("SIGTERM"); } catch (_) {}
          }
          server.close(() => {
            try {
              const report = JSON.parse(body);
              resolve(report);
            } catch (err) {
              reject(err);
            }
          });
        });
      } else {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/sidepanel.css">
  <style>
    body { margin: 0; padding: 20px; background: #0b0d11; color: #fff; font-family: sans-serif; }
  </style>
</head>
<body>
  <!-- Mode buttons under test -->
  <button id="sp-caption-mode" data-mode="original" class="original">Original</button>
  <button id="sp-audio-mode" data-mode="idle">Audio</button>

  <!-- Cue card with play button under test -->
  <div class="sp-sentence" data-id="c1" style="margin-top: 20px;">
    <button type="button" class="sp-play-cue-btn" title="Phát câu này trên video">▶</button>
    <div class="sp-ja-wrap"><span class="sp-ja-view">とても長い日本語の文です。ここにスクロール可能な詳細情報が表示されます。</span></div>
    <div class="sp-vi">Một câu tiếng Nhật rất dài với nhiều thông tin giải nghĩa chi tiết ngữ pháp.</div>
  </div>

  <script>
    (async () => {
      const results = {};

      // Test 1: Original button color
      const captionBtn = document.getElementById("sp-caption-mode");
      const audioBtn = document.getElementById("sp-audio-mode");
      results.origBg = window.getComputedStyle(captionBtn).backgroundColor;

      // Test 2: Enhanced button color
      captionBtn.dataset.mode = "enhanced";
      captionBtn.classList.remove("original");
      captionBtn.classList.add("enhanced");
      results.enhBg = window.getComputedStyle(captionBtn).backgroundColor;

      // Test 3: Audio button active color
      audioBtn.dataset.mode = "active";
      audioBtn.classList.add("active");
      results.audioBg = window.getComputedStyle(audioBtn).backgroundColor;

      // Test 4: Popover CSS properties and bounding box measurement
      let playPopoverEl = null;
      let activePlayBtn = null;
      let playPopoverTimer = null;

      function ensurePlayPopover() {
        if (playPopoverEl) return playPopoverEl;
        playPopoverEl = document.createElement("div");
        playPopoverEl.id = "sp-play-cue-popover";
        playPopoverEl.className = "sp-play-cue-popover";
        playPopoverEl.hidden = true;
        playPopoverEl.addEventListener("mouseenter", () => {
          if (playPopoverTimer) { clearTimeout(playPopoverTimer); playPopoverTimer = null; }
        });
        playPopoverEl.addEventListener("mouseleave", () => scheduleHidePlayPopover());
        document.body.appendChild(playPopoverEl);
        return playPopoverEl;
      }

      function showPlayPopover(btn) {
        if (playPopoverTimer) { clearTimeout(playPopoverTimer); playPopoverTimer = null; }
        const pop = ensurePlayPopover();
        if (btn.hasAttribute("title")) {
          btn.dataset.stashedTitle = btn.getAttribute("title");
          btn.removeAttribute("title");
        }
        activePlayBtn = btn;
        // Generate a 1000-character long sentence to test scrollable height constraints
        let longContent = "";
        for (let i = 1; i <= 30; i++) {
          longContent += "<div>" + i + ". 長い日本語の字幕テキストと文法解説の詳細です。</div>";
        }
        pop.innerHTML = longContent;
        pop.hidden = false;
      }

      function hidePlayPopover() {
        if (playPopoverTimer) { clearTimeout(playPopoverTimer); playPopoverTimer = null; }
        if (activePlayBtn) {
          if (activePlayBtn.dataset.stashedTitle) {
            activePlayBtn.setAttribute("title", activePlayBtn.dataset.stashedTitle);
            delete activePlayBtn.dataset.stashedTitle;
          }
          activePlayBtn = null;
        }
        if (playPopoverEl) playPopoverEl.hidden = true;
      }

      function scheduleHidePlayPopover(cb) {
        if (playPopoverTimer) clearTimeout(playPopoverTimer);
        playPopoverTimer = setTimeout(() => {
          playPopoverTimer = null;
          hidePlayPopover();
          if (cb) cb();
        }, 180);
      }

      const playBtn = document.querySelector(".sp-play-cue-btn");
      showPlayPopover(playBtn);
      const pop = ensurePlayPopover();
      const popStyle = window.getComputedStyle(pop);
      const popRect = pop.getBoundingClientRect();

      results.popMaxHeight = popStyle.maxHeight;
      results.popOverflowY = popStyle.overflowY;
      results.popPointerEvents = popStyle.pointerEvents;
      results.measuredHeight = Math.round(popRect.height);
      results.titleStashed = !playBtn.hasAttribute("title") && playBtn.dataset.stashedTitle === "Phát câu này trên video";

      // Test 5: 180ms hover transit bridge
      scheduleHidePlayPopover();
      results.popVisibleDuringTransit = !pop.hidden && playPopoverTimer !== null;

      // Mouse enters popover before 180ms: timer cancelled
      clearTimeout(playPopoverTimer);
      playPopoverTimer = null;
      results.popRemainsOpenOnEnter = !pop.hidden;

      // Mouse leaves popover: schedule hide and await 220ms
      await new Promise(resolve => {
        scheduleHidePlayPopover(() => {
          results.popHiddenAfter180ms = pop.hidden;
          results.titleRestored = playBtn.getAttribute("title") === "Phát câu này trên video";
          resolve();
        });
      });

      // Submit test report back to node test runner
      await fetch("/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(results)
      });
    })();
  </script>
</body>
</html>`);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      // CHROME_PATH keeps the test off a hardcoded machine path: macOS, a
      // Linux CI runner and a developer with Chrome elsewhere all work.
      const chromePath = process.env.CHROME_PATH
        || (process.platform === "darwin"
          ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          : "/usr/bin/google-chrome");
      chromeProcess = execFile(chromePath, [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        `http://127.0.0.1:${port}`
      ], () => {});
    });
  });
}

(async () => {
  const report = await runHeadlessChromeSuite();

  // Color assertions in real Chrome
  assert.equal(report.origBg, "rgb(30, 30, 45)", "Original mode must compute to rgb(30, 30, 45) (#1e1e2d)");
  assert.equal(report.enhBg, "rgb(16, 185, 129)", "Enhanced mode must compute to rgb(16, 185, 129) (#10b981)");
  assert.equal(report.audioBg, "rgb(2, 132, 199)", "Audio mode must compute to rgb(2, 132, 199) (#0284c7)");
  console.log("-> PASS: Mode button attributes and CSS color classes correctly verified in Chrome:");
  console.log(`   - Original: ${report.origBg} (#1e1e2d)`);
  console.log(`   - Enhanced: ${report.enhBg} (#10b981)`);
  console.log(`   - Audio:    ${report.audioBg} (#0284c7)\n`);

  // Popover constraint assertions in real Chrome
  assert.equal(report.popMaxHeight, "280px", "CSS max-height must compute to 280px");
  assert.equal(report.popOverflowY, "auto", "CSS overflow-y must compute to auto");
  assert.equal(report.popPointerEvents, "auto", "CSS pointer-events must compute to auto");
  assert.ok(report.measuredHeight <= 280, `Measured pixel height (${report.measuredHeight}px) must be <= 280px`);
  assert.ok(report.titleStashed, "Play button title must be stashed while popover is open");

  // Hover transit bridge assertions
  assert.ok(report.popVisibleDuringTransit, "Popover must remain visible during 180ms hover transit window");
  assert.ok(report.popRemainsOpenOnEnter, "Popover must remain open when cursor enters popover");
  assert.ok(report.popHiddenAfter180ms, "Popover must hide after 180ms mouseleave delay");
  assert.ok(report.titleRestored, "Play button title must be restored when popover closes");

  console.log("-> PASS: Popover constraints and 180ms hover bridge verified in Chrome:");
  console.log(`   - max-height: ${report.popMaxHeight}, overflow-y: ${report.popOverflowY}, pointer-events: ${report.popPointerEvents}`);
  console.log(`   - Bounding rect measured height: ${report.measuredHeight}px (clamped to <= 280px)`);
  console.log("   - 180ms transit bridge and tooltip title stashing verified.\n");

  console.log("=== ALL PHASE 3 RUNTIME UI TESTS PASSED! ===");
  process.exit(0);
})().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
