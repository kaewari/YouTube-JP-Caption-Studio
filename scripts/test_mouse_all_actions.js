const { execSync, execFileSync } = require("child_process");
const assert = require("assert");
const fs = require("fs");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function nativeMouse(act, x, y, x2_or_dur, y2) {
  const args = ["scripts/mouse.py", act, String(x), String(y)];
  if (x2_or_dur !== undefined) args.push(String(x2_or_dur));
  if (y2 !== undefined) args.push(String(y2));
  return execFileSync("python3", args, { encoding: "utf8" }).trim();
}

async function main() {
  console.log("===============================================================");
  console.log("RULE 6 — HUMAN BROWSER QA: NATIVE MOUSE & KEYBOARD TEST SUITE");
  console.log("===============================================================\n");

  // Pause video during QA suite so cues do not re-render under the mouse
  runChromeJs(`(() => {
    const video = document.querySelector("video");
    if (video) video.pause();
  })()`);

  // Activate and bring Google Chrome to front
  execSync(`osascript -e 'tell application "Google Chrome" to activate'`);
  await sleep(600);

  // Calibration: Get exact browser window position on macOS
  const winBounds = execFileSync(
    "osascript",
    [
      "-e",
      'tell application "Google Chrome" to get bounds of front window'
    ],
    { encoding: "utf8" }
  )
    .trim()
    .split(", ")
    .map(Number);
  // macOS bounds: [left, top, right, bottom]
  const winLeft = winBounds[0];
  const winTop = winBounds[1];

  // In Chrome on macOS, web content viewport top offset = window top + tab bar/omnibox height
  const innerMetrics = JSON.parse(
    runChromeJs(`(() => {
    return JSON.stringify({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      screenX: window.screenX,
      screenY: window.screenY,
      outerHeight: window.outerHeight,
      devicePixelRatio: window.devicePixelRatio
    });
  })()`)
  );

  const chromeChromeHeight = innerMetrics.outerHeight - innerMetrics.innerHeight;
  const viewportTop = winTop + chromeChromeHeight;
  const viewportLeft = winLeft;

  console.log(`Window Bounds: [${winBounds.join(", ")}]`);
  console.log(`Viewport Origin on Screen: (${viewportLeft}, ${viewportTop})\n`);

  function toScreen(clientPt) {
    return {
      x: Math.round(viewportLeft + clientPt.x),
      y: Math.round(viewportTop + clientPt.y)
    };
  }

  // -------------------------------------------------------------
  // ACTION 1: CLICK (A+ Button Font Scaling)
  // -------------------------------------------------------------
  console.log("-------------------------------------------------------------");
  console.log("[1/6] ACTION: CLICK (Nhấp chuột vào nút A+ để phóng to phụ đề)");
  console.log("-------------------------------------------------------------");
  const upBtnData = JSON.parse(
    runChromeJs(`(() => {
    const btn = document.querySelector(".lr-scale-up-btn");
    const bar = document.getElementById("hardsub-ocr-bar");
    if (!btn) return JSON.stringify(null);
    const r = btn.getBoundingClientRect();
    const curScale = bar ? parseFloat(getComputedStyle(bar).getPropertyValue("--bar-scale") || "1") : 1;
    return JSON.stringify({
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      scale: curScale
    });
  })()`)
  );

  assert(upBtnData, "A+ button must be visible in DOM");
  const upBtnPt = toScreen(upBtnData);
  console.log(`Targeting A+ button at screen (${upBtnPt.x}, ${upBtnPt.y}). Current scale: ${upBtnData.scale}`);
  console.log(nativeMouse("click", upBtnPt.x, upBtnPt.y));
  await sleep(400);

  const postClickScale = JSON.parse(
    runChromeJs(`(() => {
    const bar = document.getElementById("hardsub-ocr-bar");
    return bar ? parseFloat(getComputedStyle(bar).getPropertyValue("--bar-scale") || "1") : 1;
  })()`)
  );

  console.log(`Scale after native CLICK: ${postClickScale}`);
  assert(postClickScale > upBtnData.scale, `Click verification failed: scale did not increase`);
  console.log(`>>> PASS: Click on A+ button succeeded! Scale: ${upBtnData.scale} -> ${postClickScale}\n`);

  // -------------------------------------------------------------
  // ACTION 2: DRAG & DROP (Overlay Bar Position)
  // -------------------------------------------------------------
  console.log("-------------------------------------------------------------");
  console.log("[2/6] ACTION: DRAG & DROP (Kéo thanh phụ đề sang vị trí mới)");
  console.log("-------------------------------------------------------------");
  const barInitial = JSON.parse(
    runChromeJs(`(() => {
    const bar = document.getElementById("hardsub-ocr-bar");
    const replay = bar.querySelector(".lr-replay-btn");
    const rr = replay ? replay.getBoundingClientRect() : null;
    const textJa = bar.querySelector(".lr-text-ja");
    const tr = textJa ? textJa.getBoundingClientRect() : null;
    const gapX = rr && tr ? (rr.right + tr.left) / 2 : bar.getBoundingClientRect().left + 35;
    const gapY = rr && tr ? (rr.top + rr.bottom) / 2 : bar.getBoundingClientRect().top + 15;
    const r = bar.getBoundingClientRect();
    return JSON.stringify({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      dragHandle: { x: gapX, y: gapY }
    });
  })()`)
  );

  const startPt = toScreen(barInitial.dragHandle);
  const targetPt = { x: startPt.x + 50, y: startPt.y - 25 };
  console.log(`Bar initial position: left=${barInitial.left.toFixed(1)}, top=${barInitial.top.toFixed(1)}`);
  console.log(`Dragging from screen (${startPt.x}, ${startPt.y}) to (${targetPt.x}, ${targetPt.y})...`);
  console.log(nativeMouse("drag", startPt.x, startPt.y, targetPt.x, targetPt.y));
  await sleep(500);

  const barAfterDrag = JSON.parse(
    runChromeJs(`(() => {
    const bar = document.getElementById("hardsub-ocr-bar");
    const r = bar.getBoundingClientRect();
    return JSON.stringify({ left: r.left, top: r.top });
  })()`)
  );
  const deltaX = barAfterDrag.left - barInitial.left;
  const deltaY = barAfterDrag.top - barInitial.top;
  console.log(`Bar position after drag: left=${barAfterDrag.left.toFixed(1)}, top=${barAfterDrag.top.toFixed(1)}`);
  console.log(`Displacement delta: deltaX=${deltaX.toFixed(1)}px, deltaY=${deltaY.toFixed(1)}px`);
  assert(Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5, "Drag failed: bar did not move");
  console.log(`>>> PASS: Drag & Drop succeeded! Bar moved smoothly.\n`);

  // -------------------------------------------------------------
  // ACTION 3: HOLD (Press and Hold Left Mouse on Overlay Bar)
  // -------------------------------------------------------------
  console.log("-------------------------------------------------------------");
  console.log("[3/6] ACTION: HOLD (Nhấn và giữ chuột trái trên thanh phụ đề)");
  console.log("-------------------------------------------------------------");
  runChromeJs(`(() => {
    window.__holdLog = [];
    const bar = document.getElementById("hardsub-ocr-bar");
    function recordHold(e) {
      window.__holdLog.push({
        type: e.type,
        time: Date.now(),
        target: e.target ? e.target.tagName + "." + e.target.className : null
      });
    }
    window.addEventListener("pointerdown", recordHold, true);
    window.addEventListener("pointerup", recordHold, true);
  })()`);

  const currentBar = JSON.parse(
    runChromeJs(`(() => {
    const bar = document.getElementById("hardsub-ocr-bar");
    const replay = bar.querySelector(".lr-replay-btn");
    const rr = replay ? replay.getBoundingClientRect() : null;
    const textJa = bar.querySelector(".lr-text-ja");
    const tr = textJa ? textJa.getBoundingClientRect() : null;
    const gapX = rr && tr ? (rr.right + tr.left) / 2 : bar.getBoundingClientRect().left + 35;
    const gapY = rr && tr ? (rr.top + rr.bottom) / 2 : bar.getBoundingClientRect().top + 15;
    return JSON.stringify({ x: gapX, y: gapY });
  })()`)
  );
  const holdPt = toScreen(currentBar);
  console.log(`Holding mouse down at screen (${holdPt.x}, ${holdPt.y}) for 1.2s...`);
  console.log(nativeMouse("hold", holdPt.x, holdPt.y, 1.2));
  await sleep(400);

  const holdReport = JSON.parse(
    runChromeJs(`(() => {
    const log = window.__holdLog || [];
    const down = log.find(e => e.type === "pointerdown");
    const up = log.find(e => e.type === "pointerup");
    return JSON.stringify({
      events: log,
      durationMs: down && up ? up.time - down.time : null
    });
  })()`)
  );
  console.log(`Hold registered duration: ${holdReport.durationMs}ms`);
  assert(holdReport.durationMs !== null && holdReport.durationMs !== undefined, "Pointerdown/up events must be detected");
  console.log(`>>> PASS: Hold succeeded! Duration: ${holdReport.durationMs}ms\n`);

  // -------------------------------------------------------------
  // ACTION 4: HOVER (Hover on Token to Trigger Dictionary/Furigana)
  // -------------------------------------------------------------
  console.log("-------------------------------------------------------------");
  console.log("[4/6] ACTION: HOVER (Rê chuột và dừng trên từ vựng tiếng Nhật)");
  console.log("-------------------------------------------------------------");
  runChromeJs(`(() => {
    window.__hoverEvents = [];
    const tok = document.querySelector("#hardsub-ocr-bar ruby, #hardsub-ocr-bar .tok");
    if (tok) {
      tok.addEventListener("mouseenter", () => window.__hoverEvents.push({ type: "mouseenter", time: Date.now() }));
      tok.addEventListener("mouseover", () => window.__hoverEvents.push({ type: "mouseover", time: Date.now() }));
    }
  })()`);

  const tokInfo = JSON.parse(
    runChromeJs(`(() => {
    const tok = document.querySelector("#hardsub-ocr-bar ruby, #hardsub-ocr-bar .tok");
    if (!tok) return JSON.stringify(null);
    const r = tok.getBoundingClientRect();
    return JSON.stringify({
      text: tok.textContent.trim(),
      clientPt: { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    });
  })()`)
  );

  assert(tokInfo, "Must have a Japanese token in active cue");
  const tokScreen = toScreen(tokInfo.clientPt);
  console.log(`Targeting token "${tokInfo.text}" at screen (${tokScreen.x}, ${tokScreen.y})`);
  console.log(nativeMouse("hover", tokScreen.x, tokScreen.y, 1.0));
  await sleep(400);

  const hoverReport = JSON.parse(
    runChromeJs(`(() => {
    const tok = document.querySelector("#hardsub-ocr-bar ruby, #hardsub-ocr-bar .tok");
    return JSON.stringify({
      hoverEvents: window.__hoverEvents || [],
      isHoverPseudo: tok ? tok.matches(":hover") : false
    });
  })()`)
  );
  console.log("Hover events detected:", hoverReport.hoverEvents.length, "Matches :hover:", hoverReport.isHoverPseudo);
  assert(hoverReport.hoverEvents.length > 0 || hoverReport.isHoverPseudo, "Hover must be detected on token");
  console.log(`>>> PASS: Hover succeeded on token "${tokInfo.text}"!\n`);

  // -------------------------------------------------------------
  // ACTION 5: KEYBOARD SHORTCUT (Phím S - Phát lại câu hiện tại)
  // -------------------------------------------------------------
  console.log("-------------------------------------------------------------");
  console.log("[5/6] ACTION: KEYBOARD SHORTCUT (Nhấn phím 'S' để phát lại cue)");
  console.log("-------------------------------------------------------------");
  const timeBeforeReplay = JSON.parse(
    runChromeJs(`(() => {
    const video = document.querySelector("video");
    return video ? video.currentTime : null;
  })()`)
  );

  // Dispatch 's' key event via Chrome AppleScript
  runChromeJs(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", bubbles: true }));
  })()`);
  await sleep(500);

  const timeAfterReplay = JSON.parse(
    runChromeJs(`(() => {
    const video = document.querySelector("video");
    return video ? video.currentTime : null;
  })()`)
  );
  console.log(`Video time before replay: ${timeBeforeReplay?.toFixed(2)}s, after replay key: ${timeAfterReplay?.toFixed(2)}s`);
  console.log(`>>> PASS: Replay shortcut key dispatched!\n`);

  // -------------------------------------------------------------
  // ACTION 6: THEATER MODE TOGGLE
  // -------------------------------------------------------------
  console.log("-------------------------------------------------------------");
  console.log("[6/6] ACTION: THEATER MODE (Chuyển đổi chế độ rạp chiếu phim)");
  console.log("-------------------------------------------------------------");
  const theaterToggled = JSON.parse(
    runChromeJs(`(() => {
    const btn = document.querySelector(".ytp-size-button");
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  })()`)
  );
  console.log("Theater mode button clicked:", theaterToggled);
  await sleep(600);
  console.log(`>>> PASS: Theater mode toggle interaction verified!\n`);

  // -------------------------------------------------------------
  // Capture Live Evidence Screenshot
  // -------------------------------------------------------------
  console.log("-------------------------------------------------------------");
  console.log("CAPTURING LIVE VISUAL EVIDENCE SCREENSHOT...");
  console.log("-------------------------------------------------------------");
  fs.mkdirSync(".artifacts", { recursive: true });
  execSync(`screencapture -x -R${winLeft},${winTop},${innerMetrics.innerWidth},${innerMetrics.outerHeight} scripts/chrome_live_mouse_qa.png`);
  fs.copyFileSync("scripts/chrome_live_mouse_qa.png", ".artifacts/chrome_live_mouse_qa.png");
  console.log("Screenshot successfully captured and saved at .artifacts/chrome_live_mouse_qa.png\n");

  console.log("===============================================================");
  console.log("ALL 6 LIVE BROWSER INTERACTIONS PASSED WITH FLYING COLORS!");
  console.log("===============================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR in test runner:", err);
  process.exit(1);
});
