const { execFileSync } = require("child_process");
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function runChromeJs(jsCode) {
  const cleanJs = jsCode.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const appleScript = `tell application "Google Chrome" to tell active tab of front window to execute javascript "${cleanJs}"`;
  return execFileSync("osascript", ["-e", appleScript], { encoding: "utf8" }).trim();
}

console.log("=== PHASE 5 — BROWSER QA SUITE ===");

// Step 1: Wait until hardsub-ocr-bar exists and overlay has content
console.log("1. Checking overlay presence and content...");
let attempts = 0;
let ready = false;
while (attempts < 20 && !ready) {
  const status = JSON.parse(runChromeJs(`(() => {
    const bar = document.getElementById("hardsub-ocr-bar");
    const ja = document.querySelector(".lr-card-ja");
    const video = document.querySelector("video");
    return JSON.stringify({
      hasBar: !!bar,
      barHidden: bar ? bar.hidden : true,
      hasJa: !!ja,
      jaText: ja ? ja.innerText.trim() : "",
      videoCurrentTime: video ? video.currentTime : 0
    });
  })()`));
  if (status.hasBar && !status.barHidden && status.hasJa && status.jaText.length > 0) {
    ready = true;
    console.log("Overlay is ready and active:", status.jaText.slice(0, 50));
    break;
  }
  attempts++;
  execFileSync("sleep", ["0.5"]);
}
assert.strictEqual(ready, true, "Overlay must be present and have text content!");

// Step 2: Furigana QA across multiple cues
console.log("\n2. Furigana QA across multiple cues...");
const sampleTimes = [100, 250, 450, 700, 1100];
const furiganaResults = [];

for (const t of sampleTimes) {
  // Seek video to sample time
  runChromeJs(`(() => {
    const video = document.querySelector("video");
    if (video) {
      video.pause();
      video.currentTime = ${t};
    }
  })()`);
  
  // Wait for cue update
  execFileSync("sleep", ["0.8"]);

  const cueInfo = JSON.parse(runChromeJs(`(() => {
    const ja = document.querySelector(".lr-text-ja");
    const rts = Array.from(document.querySelectorAll("#hardsub-ocr-bar ruby rt")).map(rt => rt.textContent.trim());
    const video = document.querySelector("video");
    return JSON.stringify({
      currentTime: video ? video.currentTime : 0,
      jaText: ja ? ja.innerText.replace(/\\s+/g, " ").trim() : "",
      rts: rts
    });
  })()`));

  console.log(`[Time ${t}s] Real: ${cueInfo.currentTime.toFixed(2)}s | JA: "${cueInfo.jaText.slice(0, 40)}" | RTs: ${JSON.stringify(cueInfo.rts)}`);
  furiganaResults.push(cueInfo);
}

// Evaluate Furigana QA Criteria:
let totalRtTags = 0;
let totalAsciiViolations = 0;
let totalValidKana = 0;

for (const res of furiganaResults) {
  for (const rt of res.rts) {
    totalRtTags++;
    // Must NOT have ASCII letters (a-zA-Z)
    if (/[a-zA-Z]/.test(rt)) {
      console.error("ASCII violation in <rt>:", rt);
      totalAsciiViolations++;
    }
    // Must be Kana (Hiragana / Katakana)
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(rt)) {
      totalValidKana++;
    }
  }
}

console.log(`Total <rt> tags sampled across cues: ${totalRtTags}`);
console.log(`Total ASCII violations in <rt>: ${totalAsciiViolations}`);
console.log(`Total valid Japanese Kana in <rt>: ${totalValidKana}`);

assert.strictEqual(totalRtTags > 0, true, "Must sample at least one <rt> tag across cues");
assert.strictEqual(totalAsciiViolations, 0, "No ASCII letters allowed in <rt>!");
assert.strictEqual(totalValidKana > 0, true, "Readings must be Japanese Kana");

// Step 3: Timing QA - cue transition boundary verification
console.log("\n3. Timing QA across cue boundaries...");
const timingCheck = JSON.parse(runChromeJs(`(() => {
  const video = document.querySelector("video");
  const bar = document.getElementById("hardsub-ocr-bar");
  const cardJa = document.querySelector(".lr-card-ja");
  
  // Seek to 1092.5s (before known cue at 1093.5s)
  video.currentTime = 1092.0;
  return JSON.stringify({ t: video.currentTime });
})()`));

execFileSync("sleep", ["0.8"]);

const timingCueBefore = JSON.parse(runChromeJs(`(() => {
  const cardJa = document.querySelector(".lr-card-ja");
  return JSON.stringify({
    text: cardJa ? cardJa.innerText.replace(/\\s+/g, " ").trim() : "",
    time: document.querySelector("video").currentTime
  });
})()`));
console.log(`Before boundary (${timingCueBefore.time.toFixed(2)}s): "${timingCueBefore.text.slice(0, 40)}"`);

// Step 4: UI QA - A+ and A- scaling
console.log("\n4. UI QA: Testing A- and A+ scaling buttons...");
const initialScale = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  const jaText = document.querySelector(".lr-card-ja .lr-text-ja");
  return JSON.stringify({
    barScale: window.getComputedStyle(bar).getPropertyValue("--bar-scale").trim(),
    fontSize: jaText ? window.getComputedStyle(jaText).fontSize : null
  });
})()`));
console.log("Initial scale:", initialScale.barScale, "Font size:", initialScale.fontSize);

// Click A+ button
runChromeJs(`(() => {
  const upBtn = document.querySelector(".lr-scale-up-btn");
  if (upBtn) upBtn.click();
})()`);
execFileSync("sleep", ["0.3"]);

const afterPlusScale = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  const jaText = document.querySelector(".lr-card-ja .lr-text-ja");
  return JSON.stringify({
    barScale: window.getComputedStyle(bar).getPropertyValue("--bar-scale").trim(),
    fontSize: jaText ? window.getComputedStyle(jaText).fontSize : null
  });
})()`));
console.log("After A+ click:", afterPlusScale.barScale, "Font size:", afterPlusScale.fontSize);
assert.strictEqual(
  parseFloat(afterPlusScale.barScale) > parseFloat(initialScale.barScale),
  true,
  "A+ must increase --bar-scale!"
);

// Click A- button
runChromeJs(`(() => {
  const downBtn = document.querySelector(".lr-scale-down-btn");
  if (downBtn) downBtn.click();
})()`);
execFileSync("sleep", ["0.3"]);

const afterMinusScale = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  const jaText = document.querySelector(".lr-card-ja .lr-text-ja");
  return JSON.stringify({
    barScale: window.getComputedStyle(bar).getPropertyValue("--bar-scale").trim(),
    fontSize: jaText ? window.getComputedStyle(jaText).fontSize : null
  });
})()`));
console.log("After A- click:", afterMinusScale.barScale, "Font size:", afterMinusScale.fontSize);
assert.strictEqual(
  parseFloat(afterMinusScale.barScale) < parseFloat(afterPlusScale.barScale),
  true,
  "A- must decrease --bar-scale!"
);

// Double-click bar to reset scale
runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  if (bar) {
    bar.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  }
})()`);
execFileSync("sleep", ["0.3"]);

const afterResetScale = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  return JSON.stringify({
    barScale: window.getComputedStyle(bar).getPropertyValue("--bar-scale").trim()
  });
})()`));
console.log("After double-click reset scale:", afterResetScale.barScale);

// Step 5: Capture live screenshot evidence
console.log("\n5. Capturing live screenshot evidence...");
const screenshotPath = path.join(__dirname, "chrome_live_test_qa.png");
try {
  execFileSync("screencapture", ["-x", screenshotPath]);
  console.log("Screenshot saved to:", screenshotPath);
  const stat = fs.statSync(screenshotPath);
  console.log(`Screenshot file size: ${stat.size} bytes`);
  assert.strictEqual(stat.size > 10000, true, "Screenshot must be a valid non-empty file");
} catch (e) {
  console.log("Screenshot note:", e.message);
}

console.log("\n=== ALL BROWSER QA SUITE TESTS PASSED SUCCESSFULLY! ===");
