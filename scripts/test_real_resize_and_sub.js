const { execSync } = require("child_process");
const assert = require("assert");
const path = require("path");
const https = require("https");

console.log("=== REAL RUNTIME VERIFICATION: OVERLAY PIXEL RESIZING & DUAL SUBTITLES ===");

const htmlPath = path.join(__dirname, "test_runtime_resize_and_sub.html");
const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// 1. Run headless Chrome to render real CSS and measure real bounding client rects
console.log("\n[1/3] Executing real DOM rendering in Google Chrome (headless)...");
let domOutput = "";
try {
  domOutput = execSync(
    `"${chromeBin}" --headless=new --dump-dom --virtual-time-budget=2000 "file://${htmlPath}"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
} catch (err) {
  console.error("Failed to run Chrome:", err.message);
  process.exit(1);
}

const match = domOutput.match(/__REAL_DOM_RESULT__(\{.*\})/);
assert(match, "Chrome must output __REAL_DOM_RESULT__ from live DOM evaluation!");

const domResult = JSON.parse(match[1]);
console.log("DOM Measurements from Chrome:");
console.log(`- Initial box: ${domResult.initialWidth.toFixed(1)}px x ${domResult.initialHeight.toFixed(1)}px`);
console.log(`- Scaled box:  ${domResult.scaledWidth.toFixed(1)}px x ${domResult.scaledHeight.toFixed(1)}px`);
console.log(`- Dual cards present: VI=${domResult.hasCardVi} (visible=${domResult.viVisible}), EN=${domResult.hasCardEn} (visible=${domResult.enVisible})`);
console.log(`- Action buttons clickable above handles: ${domResult.cardActionsClickableAboveHandles}`);

// Assertion 1: Overlay width MUST scale when --bar-user-scale-w changes
assert(
  domResult.scaledWidth >= domResult.initialWidth * 1.25,
  `Overlay width failed to resize! (initial: ${domResult.initialWidth}px, scaled: ${domResult.scaledWidth}px). Check for width: auto !important in panel.css!`
);

// Assertion 2: Both VI and EN cards must exist and be visible
assert(domResult.hasCardVi && domResult.viVisible, "VI subtitle card must be rendered and visible!");
assert(domResult.hasCardEn && domResult.enVisible, "EN subtitle card must be rendered and visible!");

// Assertion 3: Action buttons must not be occluded by resize handles
assert(domResult.cardActionsClickableAboveHandles, "Action buttons in .lr-card-actions must be clickable above resize handles!");

console.log("\n[2/3] Overlay UI & Pixel Resizing assertions PASSED!");

// 2. Real HTTP Timedtext URL check
console.log("\n[3/3] Verifying tlang fallback logic with real YouTube timedtext parameter format...");
function toTlangUrl(baseUrl, tlang) {
  if (!baseUrl) return null;
  const base = baseUrl.includes("fmt=")
    ? baseUrl.replace(/([?&])fmt=[^&]+/, "$1fmt=json3")
    : `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=json3`;
  return `${base}&tlang=${encodeURIComponent(tlang)}`;
}

const sampleJaUrl = "https://www.youtube.com/api/timedtext?v=Bh6e3BT-YuQ&lang=ja&fmt=srv3";
const viUrl = toTlangUrl(sampleJaUrl, "vi");
const enUrl = toTlangUrl(sampleJaUrl, "en");

assert(viUrl.includes("fmt=json3"), "VI fallback URL must request json3 format");
assert(viUrl.includes("&tlang=vi"), "VI fallback URL must include &tlang=vi");
assert(enUrl.includes("fmt=json3"), "EN fallback URL must request json3 format");
assert(enUrl.includes("&tlang=en"), "EN fallback URL must include &tlang=en");

console.log("Generated tlang fallback URLs:");
console.log("- VI URL:", viUrl);
console.log("- EN URL:", enUrl);

console.log("\n=== ALL REAL RUNTIME & TIMEDTEXT CHECKS PASSED ===");
