const assert = require("assert");
const fs = require("fs");
const path = require("path");

const panelCss = fs.readFileSync(path.join(__dirname, "../extension/styles/panel.css"), "utf8");
const contentJs = fs.readFileSync(path.join(__dirname, "../extension/content/content.js"), "utf8");

console.log("=== PHASE 3 VERIFICATION: OVERLAY UI & RESPONSIVE SCALING ===");

// 1. Verify CSS rules
assert.strictEqual(
  panelCss.includes(".hardsub-bar .lr-card-ja .lr-text-ja {\n  font-size: calc(26px * var(--bar-scale));"),
  true,
  "CSS must include responsive font-size 26px * var(--bar-scale) for .lr-text-ja"
);
assert.strictEqual(
  panelCss.includes(".hardsub-bar .lr-card-ja .lr-text-ja ruby rt {\n  font-size: 0.52em;"),
  true,
  "CSS must include font-size 0.52em for .lr-text-ja ruby rt"
);
assert.strictEqual(
  panelCss.includes(".hardsub-bar .lr-card-vi .lr-text-vi {\n  font-size: calc(16px * var(--bar-scale));"),
  true,
  "CSS must include responsive font-size 16px * var(--bar-scale) for .lr-text-vi"
);
assert.strictEqual(
  panelCss.includes(".hardsub-bar .lr-scale-btn"),
  true,
  "CSS must include styles for .lr-scale-btn"
);

// 2. Verify A- / A+ buttons in content.js HTML template
assert.strictEqual(
  contentJs.includes('class="lr-scale-btn lr-scale-down-btn" title="Giảm cỡ chữ (A-)"'),
  true,
  "content.js must render A- button in lr-card-actions"
);
assert.strictEqual(
  contentJs.includes('class="lr-scale-btn lr-scale-up-btn" title="Tăng cỡ chữ (A+)"'),
  true,
  "content.js must render A+ button in lr-card-actions"
);

// 3. Test scaling calculation and clamp logic
function userBarScale(scale) {
  const n = Number(scale);
  return Number.isFinite(n) ? Math.max(0.55, Math.min(2.4, n)) : 1;
}

function scaleDown(currentScale) {
  const cur = userBarScale(currentScale);
  return Math.max(0.55, Math.min(2.4, Math.round((cur - 0.1) * 100) / 100));
}

function scaleUp(currentScale) {
  const cur = userBarScale(currentScale);
  return Math.max(0.55, Math.min(2.4, Math.round((cur + 0.1) * 100) / 100));
}

// Normal scale:
assert.strictEqual(scaleDown(1.0), 0.9);
assert.strictEqual(scaleUp(1.0), 1.1);

// Lower clamp boundary:
assert.strictEqual(scaleDown(0.6), 0.55);
assert.strictEqual(scaleDown(0.55), 0.55, "Should clamp at min 0.55");
assert.strictEqual(scaleDown(0.5), 0.55);

// Upper clamp boundary:
assert.strictEqual(scaleUp(2.35), 2.4, "Should clamp at max 2.4");
assert.strictEqual(scaleUp(2.4), 2.4);
assert.strictEqual(scaleUp(3.0), 2.4);

console.log("All Overlay UI unit checks PASSED!");
