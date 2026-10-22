/**
 * test_bugfixes_qa.js
 *
 * Live Chrome QA for the video overlay's DOM contract. Requires Google Chrome
 * running with this extension loaded, on a YouTube watch page with a Japanese
 * caption track playing. Manual-only — it is not in CI because it needs a real
 * browser session.
 *
 * Asserts against the DOM the content script actually builds
 * (extension/content/content.js, renderOverlay):
 *   - one Japanese card (.lr-card-ja) with non-empty text
 *   - the legacy .lr-card-vi / .lr-card-en wrapper cards are gone
 *   - secondary VI/EN rows live INSIDE .lr-card-ja as .bar-vi / .bar-en
 *
 * The two source-text assertions that used to live here ("sidepanel.html must not
 * contain ...", and a .includes() call on a hardcoded HTML literal) were removed:
 * they inspected source text and could never fail. See AGENTS.md, no pseudo tests.
 */

const { execFileSync } = require("child_process");
const assert = require("assert");

function runChromeJs(jsCode) {
  const cleanJs = jsCode.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const appleScript = `tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "youtube.com/watch" then
        return execute t javascript "${cleanJs}"
      end if
    end repeat
  end repeat
  error "YouTube watch tab not found in Google Chrome"
end tell`;
  return execFileSync("osascript", ["-e", appleScript], { encoding: "utf8" }).trim();
}

function main() {
  console.log("==================================================");
  console.log("LIVE QA: VIDEO OVERLAY DOM CONTRACT");
  console.log("==================================================\n");

  const status = JSON.parse(
    runChromeJs(`(() => {
      const bar = document.getElementById("hardsub-ocr-bar");
      if (!bar) return JSON.stringify({ error: "no_bar" });
      const cardJa = bar.querySelector(".lr-card-ja");
      const rowVi = bar.querySelector(".bar-vi");
      const rowEn = bar.querySelector(".bar-en");
      const rect = bar.getBoundingClientRect();
      return JSON.stringify({
        hasJaCard: !!cardJa,
        jaText: cardJa ? cardJa.innerText.replace(/\\s+/g, " ").trim().slice(0, 80) : "",
        hasLegacyViCard: !!bar.querySelector(".lr-card-vi"),
        hasLegacyEnCard: !!bar.querySelector(".lr-card-en"),
        hasViRow: !!rowVi,
        viRowInsideJaCard: !!(rowVi && rowVi.closest(".lr-card-ja")),
        hasEnRow: !!rowEn,
        enRowInsideJaCard: !!(rowEn && rowEn.closest(".lr-card-ja")),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      });
    })()`)
  );

  console.log("Overlay:", status);
  assert.strictEqual(status.error, undefined, "overlay bar #hardsub-ocr-bar was not found on the page");
  assert.ok(status.hasJaCard, "overlay must render the Japanese card .lr-card-ja");
  assert.ok(status.jaText.length > 0, "the Japanese card must contain text");
  assert.strictEqual(status.hasLegacyViCard, false, "the legacy .lr-card-vi wrapper must not exist");
  assert.strictEqual(status.hasLegacyEnCard, false, "the legacy .lr-card-en wrapper must not exist");
  assert.ok(status.width > 200, `overlay width must be authentic, got ${status.width}px`);
  assert.ok(status.height > 0, `overlay height must be non-zero, got ${status.height}px`);
  if (status.hasViRow) {
    assert.ok(status.viRowInsideJaCard, "the Vietnamese row must sit inside .lr-card-ja");
  }
  if (status.hasEnRow) {
    assert.ok(status.enRowInsideJaCard, "the English row must sit inside .lr-card-ja");
  }

  console.log("\n-> PASS: overlay matches the DOM contract.");
}

try {
  main();
} catch (err) {
  console.error("Test failed:", err.message);
  process.exit(1);
}
