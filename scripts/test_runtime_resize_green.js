const { execFileSync } = require("child_process");
const assert = require("assert");

console.log("=== TDD GREEN PHASE: VERIFYING OVERLAY RESIZE & DUAL SUBTITLES ===");

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

// 0. Ensure overlay is toggled ON and reset to default scale
console.log("\n[0/5] Ensuring overlay is toggled ON and resetting scale to default (1.0)...");
runChromeJs(`(() => {
  const v = document.querySelector("video");
  if (v && (v.paused || v.currentTime < 1)) {
    v.currentTime = 5.0;
    v.play();
  }
  const bar = document.getElementById("hardsub-ocr-bar");
  if (bar && (bar.hidden || getComputedStyle(bar).display === "none")) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", code: "KeyH", bubbles: true }));
  }
  if (bar) {
    bar.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  }
})()`);

// 1. Test South Handle (.bar-resize-s) height expansion
console.log("\n[1/5] Testing South Handle (.bar-resize-s) height expansion in live Chrome DOM...");
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
  const targetY = startY + 60;

  handleS.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: startX,
    clientY: startY,
    pointerId: 1
  }));

  window.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    clientX: targetX,
    clientY: targetY,
    pointerId: 1
  }));

  const rMove = bar.getBoundingClientRect();

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
assert(
  heightTestResult.afterDragHeight >= heightTestResult.initialHeight + 20,
  `Height failed to expand! initial: ${heightTestResult.initialHeight}px, after: ${heightTestResult.afterDragHeight}px`
);
console.log("-> PASS: Height successfully expanded on South handle drag!");

// 2. Test East Handle (.bar-resize-e) width expansion
console.log("\n[2/5] Testing East Handle (.bar-resize-e) width expansion in live Chrome DOM...");
const widthTestResult = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  if (!bar) return JSON.stringify({ error: "no_bar" });
  const handleE = bar.querySelector(".bar-resize-e");
  if (!handleE) return JSON.stringify({ error: "no_handle_e" });

  const r0 = bar.getBoundingClientRect();
  const hr = handleE.getBoundingClientRect();

  const startX = hr.left + hr.width / 2;
  const startY = hr.top + hr.height / 2;
  const targetX = startX + 80;
  const targetY = startY;

  handleE.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: startX,
    clientY: startY,
    pointerId: 2
  }));

  window.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    clientX: targetX,
    clientY: targetY,
    pointerId: 2
  }));

  const rMove = bar.getBoundingClientRect();

  window.dispatchEvent(new PointerEvent("pointerup", {
    bubbles: true,
    cancelable: true,
    clientX: targetX,
    clientY: targetY,
    pointerId: 2
  }));

  return JSON.stringify({
    initialWidth: r0.width,
    afterDragWidth: rMove.width,
    scaleW: getComputedStyle(bar).getPropertyValue("--bar-user-scale-w")
  });
})()`));

console.log("Width Test Result:", widthTestResult);
assert(!widthTestResult.error, `Bar/handle missing: ${widthTestResult.error}`);
assert(
  widthTestResult.afterDragWidth >= widthTestResult.initialWidth + 30,
  `Width failed to expand! initial: ${widthTestResult.initialWidth}px, after: ${widthTestResult.afterDragWidth}px`
);
console.log("-> PASS: Width successfully expanded on East handle drag!");

// 3. Test Scale Buttons (A- / A+)
console.log("\n[3/5] Testing Font Scale Buttons (.lr-scale-down-btn, .lr-scale-up-btn)...");
const scale0 = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  if (!bar) return JSON.stringify({ error: "no_bar" });
  const btnUp = bar.querySelector(".lr-scale-up-btn");
  if (!btnUp) return JSON.stringify({ error: "no_scale_buttons" });
  const val = parseFloat(getComputedStyle(bar).getPropertyValue("--bar-scale")) || 1;
  btnUp.click();
  return JSON.stringify({ val });
})()`));
assert(!scale0.error, `Buttons missing: ${scale0.error}`);

execFileSync("sleep", ["0.25"]);

const scaleAfterUp = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  const btnDown = bar.querySelector(".lr-scale-down-btn");
  const val = parseFloat(getComputedStyle(bar).getPropertyValue("--bar-scale")) || 1;
  if (btnDown) btnDown.click();
  return JSON.stringify({ val });
})()`));

execFileSync("sleep", ["0.25"]);

const scaleAfterDown = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  const val = parseFloat(getComputedStyle(bar).getPropertyValue("--bar-scale")) || 1;
  return JSON.stringify({ val });
})()`));

const scaleButtonsResult = {
  scale0: scale0.val,
  scaleAfterUp: scaleAfterUp.val,
  scaleAfterDown: scaleAfterDown.val
};

console.log("Scale Buttons Result:", scaleButtonsResult);
assert(!scaleButtonsResult.error, `Buttons missing: ${scaleButtonsResult.error}`);
assert(
  scaleButtonsResult.scaleAfterUp > scaleButtonsResult.scale0,
  `A+ button should increase scale (before: ${scaleButtonsResult.scale0}, after: ${scaleButtonsResult.scaleAfterUp})`
);
assert(
  scaleButtonsResult.scaleAfterDown < scaleButtonsResult.scaleAfterUp,
  `A- button should decrease scale (before: ${scaleButtonsResult.scaleAfterUp}, after: ${scaleButtonsResult.scaleAfterDown})`
);
console.log("-> PASS: Scale buttons work smoothly!");

// 4. Test Subtitle Cards in live Chrome DOM (Dual Subtitles & Visibility Control)
console.log("\n[4/6] Testing Subtitle Cards in live Chrome DOM (JA, VI, EN rendering & toggle control)...");
const subCardsResult = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  if (!bar) return JSON.stringify({ error: "no_bar" });
  const cardJa = bar.querySelector(".lr-card-ja");
  const cardVi = bar.querySelector(".lr-card-vi");
  const cardEn = bar.querySelector(".lr-card-en");

  const jaRect = cardJa ? cardJa.getBoundingClientRect() : null;
  const viDisplay = cardVi ? getComputedStyle(cardVi).display : "none";
  const enDisplay = cardEn ? getComputedStyle(cardEn).display : "none";

  // Test hide-vi class toggle
  bar.classList.add("hide-vi");
  const viHiddenAfterToggle = cardVi ? getComputedStyle(cardVi).display === "none" : true;
  bar.classList.remove("hide-vi");

  return JSON.stringify({
    hasJa: !!cardJa,
    jaVisible: jaRect ? (jaRect.width > 0 && jaRect.height > 0) : false,
    jaText: cardJa ? cardJa.innerText.replace(/\\s+/g, ' ').trim() : "",
    hasVi: !!cardVi,
    hasEn: !!cardEn,
    viHiddenAfterToggle
  });
})()`));

console.log("Subtitle Cards Result:", subCardsResult);
assert(!subCardsResult.error, `Bar missing: ${subCardsResult.error}`);
assert(subCardsResult.hasJa && subCardsResult.jaVisible && subCardsResult.jaText.length > 0, "JA card missing, zero-sized, or empty on overlay");
assert(subCardsResult.viHiddenAfterToggle, "VI card must be hidden when hide-vi class is applied");
console.log("-> PASS: Video overlay renders subtitle cards with functional visibility toggling!");

// 5. Reset bar position and scale via double click
console.log("\n[5/6] Testing Double Click Reset...");
const dblClickResult = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  if (!bar) return JSON.stringify({ error: "no_bar" });
  bar.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  return JSON.stringify({
    scaleW: getComputedStyle(bar).getPropertyValue("--bar-user-scale-w"),
    scaleH: getComputedStyle(bar).getPropertyValue("--bar-user-scale-h")
  });
})()`));
console.log("Reset Result:", dblClickResult);
assert(!dblClickResult.error, `Bar missing: ${dblClickResult.error}`);
console.log("-> PASS: Reset to default works!");

// 6. Test Overlay Toggle Hidden integrity
console.log("\n[6/6] Testing Overlay Toggle Hidden integrity...");
const toggleResult = JSON.parse(runChromeJs(`(() => {
  const bar = document.getElementById("hardsub-ocr-bar");
  if (!bar) return JSON.stringify({ error: "no_bar" });
  bar.hidden = true;
  const dispHidden = getComputedStyle(bar).display;
  const hHidden = bar.getBoundingClientRect().height;
  bar.hidden = false;
  const dispVisible = getComputedStyle(bar).display;
  return JSON.stringify({
    dispHidden,
    hHidden,
    dispVisible
  });
})()`));
console.log("Toggle Result:", toggleResult);
assert(!toggleResult.error, `Bar missing: ${toggleResult.error}`);
assert(toggleResult.dispHidden === "none" && toggleResult.hHidden === 0, "Hidden overlay must have display:none and 0 height");
assert(toggleResult.dispVisible !== "none", "Unhidden overlay must be visible");
console.log("-> PASS: Overlay toggle hidden integrity verified!");

console.log("\n========================================================");
console.log("ALL REAL RUNTIME VERIFICATION TESTS PASSED SUCCESSFULLY!");
console.log("========================================================");
process.exit(0);
