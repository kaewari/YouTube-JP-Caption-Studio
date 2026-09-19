const { execFileSync } = require("child_process");
const assert = require("assert");

console.log("=== TDD RED PHASE: VERIFYING RESIZE AND TIMEDTEXT DEFECTS ===");

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

// 1. Test Height Resizing via South Handle
console.log("\n[1/3] Testing South Handle (.bar-resize-s) height expansion in live Chrome DOM...");
const heightTestResult = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  if (!bar) return JSON.stringify({ error: "no_bar" });
  const handleS = bar.querySelector(".bar-resize-s");
  if (!handleS) return JSON.stringify({ error: "no_handle_s" });

  const r0 = bar.getBoundingClientRect();
  const hr = handleS.getBoundingClientRect();

  const startX = hr.left + hr.width / 2;
  const startY = hr.top + hr.height / 2;
  const targetX = startX;
  const targetY = startY + 80;

  // Pointerdown
  handleS.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: startX,
    clientY: startY,
    pointerId: 1
  }));

  // Pointermove
  window.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    clientX: targetX,
    clientY: targetY,
    pointerId: 1
  }));

  const rMove = bar.getBoundingClientRect();

  // Pointerup
  window.dispatchEvent(new PointerEvent("pointerup", {
    bubbles: true,
    cancelable: true,
    clientX: targetX,
    clientY: targetY,
    pointerId: 1
  }));

  return JSON.stringify({
    initialHeight: r0.height,
    afterDragHeight: rMove.height,
    scaleH: getComputedStyle(bar).getPropertyValue("--bar-user-scale-h")
  });
})()`));

console.log("Height Test Result:", heightTestResult);
assert(!heightTestResult.error, `Bar/handle missing: ${heightTestResult.error}`);

// This assertion must FAIL during RED phase because height: auto !important locks height
assert(
  heightTestResult.afterDragHeight >= heightTestResult.initialHeight + 30,
  `RED TEST CONFIRMED: Height failed to resize! (initial: ${heightTestResult.initialHeight}px, after drag: ${heightTestResult.afterDragHeight}px). Height is locked!`
);

console.log("PASS (Unexpected in RED phase)");
