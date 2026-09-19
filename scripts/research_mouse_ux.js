const { execFileSync, execSync } = require("child_process");

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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== STARTING DEEP MOUSE UX/UI RESEARCH ON LIVE CHROME ===");

  // Check window & calibration
  execSync(`osascript -e 'tell application "Google Chrome" to activate'`);
  await sleep(400);

  const winBounds = execFileSync(
    "osascript",
    ["-e", 'tell application "Google Chrome" to get bounds of front window'],
    { encoding: "utf8" }
  ).trim().split(", ").map(Number);
  const winLeft = winBounds[0];
  const winTop = winBounds[1];

  const innerMetrics = JSON.parse(
    runChromeJs(`(() => JSON.stringify({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerHeight: window.outerHeight
    }))()`)
  );
  const viewportTop = winTop + (innerMetrics.outerHeight - innerMetrics.innerHeight);
  const viewportLeft = winLeft;

  function toScreen(pt) {
    return { x: Math.round(viewportLeft + pt.x), y: Math.round(viewportTop + pt.y) };
  }

  // TEST 1: Vertical Resize Handle (bar-resize-s and bar-resize-n)
  console.log("\n[1] Testing Vertical Resize Handle...");
  const sHandle = JSON.parse(runChromeJs(`(() => {
    const bar = document.getElementById("hardsub-ocr-bar");
    const h = bar.querySelector(".bar-resize-s");
    if (!h) return JSON.stringify(null);
    const r = h.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    return JSON.stringify({
      handlePt: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      barHeight: br.height,
      barWidth: br.width
    });
  })()`));

  if (sHandle) {
    const startPt = toScreen(sHandle.handlePt);
    const endPt = { x: startPt.x, y: startPt.y + 40 }; // drag down 40px
    console.log(`Dragging bar-resize-s down 40px...`);
    nativeMouse("drag", startPt.x, startPt.y, endPt.x, endPt.y);
    await sleep(400);

    const postS = JSON.parse(runChromeJs(`(() => {
      const bar = document.getElementById("hardsub-ocr-bar");
      const br = bar.getBoundingClientRect();
      const cs = window.getComputedStyle(bar);
      return JSON.stringify({
        barHeight: br.height,
        scaleH: cs.getPropertyValue("--bar-user-scale-h"),
        actualHeightChanged: br.height - ${sHandle.barHeight}
      });
    })()`));
    console.log("Result after dragging bar-resize-s down 40px:", postS);
    if (Math.abs(postS.actualHeightChanged) < 2) {
      console.log("=> FLAW CONFIRMED: Height of overlay did NOT grow (actualHeightChanged ≈ 0px) despite --bar-user-scale-h changing!");
    }
  }

  // TEST 2: Nav Buttons (Next vs Prev)
  console.log("\n[2] Testing Nav Buttons click and jump...");
  const navBtns = JSON.parse(runChromeJs(`(() => {
    const prev = document.getElementById("lr-btn-prev");
    const next = document.getElementById("lr-btn-next");
    const video = document.querySelector("video");
    return JSON.stringify({
      curTime: video ? video.currentTime : null,
      prevPt: prev ? { x: prev.getBoundingClientRect().left + 15, y: prev.getBoundingClientRect().top + 15 } : null,
      nextPt: next ? { x: next.getBoundingClientRect().left + 15, y: next.getBoundingClientRect().top + 15 } : null,
      order: [
        { id: prev?.id, left: prev?.getBoundingClientRect().left },
        { id: next?.id, left: next?.getBoundingClientRect().left }
      ]
    });
  })()`));
  console.log("Nav Buttons layout:", navBtns);
  if (navBtns.order[0].left > navBtns.order[1].left) {
    console.log("=> FLAW CONFIRMED: lr-btn-next is visually positioned on the LEFT of lr-btn-prev!");
  }

  // Click Next button
  if (navBtns.nextPt) {
    const scrPt = toScreen(navBtns.nextPt);
    console.log(`Clicking Next button at (${scrPt.x}, ${scrPt.y})...`);
    nativeMouse("click", scrPt.x, scrPt.y);
    await sleep(400);
    const tAfter = JSON.parse(runChromeJs(`(() => {
      const v = document.querySelector("video");
      return JSON.stringify({ currentTime: v ? v.currentTime : null });
    })()`));
    console.log(`Time before Next: ${navBtns.curTime}s -> Time after Next: ${tAfter.currentTime}s`);
  }

  // TEST 3: Hover on Token and Dict Popover
  console.log("\n[3] Testing Hover on Token and Dict Popover...");
  const tok = JSON.parse(runChromeJs(`(() => {
    const t = document.querySelector("#hardsub-ocr-bar ruby, #hardsub-ocr-bar .tok");
    const dict = document.getElementById("hardsub-ocr-dict");
    if (!t) return JSON.stringify(null);
    const r = t.getBoundingClientRect();
    return JSON.stringify({
      text: t.textContent.trim(),
      pt: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      dictVisibleBefore: dict ? !dict.hidden && window.getComputedStyle(dict).display !== "none" : false
    });
  })()`));

  if (tok) {
    const scrPt = toScreen(tok.pt);
    console.log(`Hovering token "${tok.text}" at (${scrPt.x}, ${scrPt.y})...`);
    nativeMouse("hover", scrPt.x, scrPt.y, 1.2);
    await sleep(400);

    const dictAfter = JSON.parse(runChromeJs(`(() => {
      const dict = document.getElementById("hardsub-ocr-dict");
      if (!dict) return JSON.stringify({ exists: false });
      const cs = window.getComputedStyle(dict);
      const dr = dict.getBoundingClientRect();
      return JSON.stringify({
        exists: true,
        hidden: dict.hidden,
        display: cs.display,
        text: dict.innerText.replace(/\\s+/g, ' ').trim().slice(0, 100),
        rect: { left: dr.left, top: dr.top, width: dr.width, height: dr.height }
      });
    })()`));
    console.log("Dict popover after hover:", dictAfter);
  }

  // TEST 4: Pointer Events and Hit Testing around the overlay
  console.log("\n[4] Testing pointer-events transparency on Overlay Container...");
  const hitTest = JSON.parse(runChromeJs(`(() => {
    const bar = document.getElementById("hardsub-ocr-bar");
    const r = bar.getBoundingClientRect();
    // Test hit at the margin/gap inside bar but outside cards
    const hitEl = document.elementFromPoint(r.left + 5, r.top + 5);
    return JSON.stringify({
      barRect: { left: r.left, top: r.top, width: r.width, height: r.height },
      hitTag: hitEl ? hitEl.tagName + (hitEl.id ? '#' + hitEl.id : '') + (hitEl.className ? '.' + hitEl.className.replace(/\\s+/g, '.') : '') : null
    });
  })()`));
  console.log("Hit test inside overlay container:", hitTest);

  console.log("\n=== COMPLETED LIVE MOUSE RESEARCH ===");
}

run().catch(console.error);
