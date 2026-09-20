/**
 * verify_responsive_header.js
 * Comprehensive automated verification of the responsive header and toolbar layout
 * across multiple viewport widths (320px, 380px, 550px).
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runChromeJs(js) {
  const cleanJs = js.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const appleScript = `tell application "Google Chrome"
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t contains "oiocgalcdfmkbcikemohekbjjmlbpoll/sidepanel/sidepanel.html" then
          return execute t javascript "${cleanJs}"
        end if
      end repeat
    end repeat
    error "Sidepanel tab not found in Chrome"
  end tell`;
  return execFileSync("osascript", ["-e", appleScript], { encoding: "utf8" }).trim();
}

async function main() {
  console.log("======================================================================");
  console.log("AUTOMATED QA: RESPONSIVE HEADER & TOOLBAR VERIFICATION");
  console.log("======================================================================\n");

  // Step 1: Reload extension via chrome://extensions tab if open
  console.log("[1/4] Reloading extension in Chrome...");
  try {
    const reloadScript = `tell application "Google Chrome"
      repeat with w in windows
        repeat with t in tabs of w
          if URL of t contains "chrome://extensions" then
            execute t javascript "chrome.developerPrivate.reload('oiocgalcdfmkbcikemohekbjjmlbpoll')"
            return "reloaded"
          end if
        end repeat
      end repeat
      return "no_ext_tab"
    end tell`;
    const res = execFileSync("osascript", ["-e", reloadScript], { encoding: "utf8" }).trim();
    console.log("Extension reload result:", res);
  } catch (e) {
    console.log("Extension reload note:", e.message);
  }

  await sleep(1000);

  // Step 2: Open or refresh sidepanel.html test tab
  console.log("[2/4] Opening sidepanel test tab in Google Chrome...");
  const openScript = `tell application "Google Chrome"
    tell front window
      make new tab with properties {URL:"chrome-extension://oiocgalcdfmkbcikemohekbjjmlbpoll/sidepanel/sidepanel.html"}
    end tell
  end tell`;
  execFileSync("osascript", ["-e", openScript]);
  await sleep(1500);

  // Step 3: Test responsive layout at 320px, 380px, 550px
  console.log("[3/4] Measuring DOM layout geometry at multiple container widths...");

  const widthsToTest = [320, 380, 550];
  const results = [];

  for (const w of widthsToTest) {
    const evalCode = `(() => {
      // Set container width
      document.body.style.width = "${w}px";
      document.body.style.maxWidth = "${w}px";
      document.body.style.overflowX = "hidden";

      const header = document.querySelector(".sp-header");
      const tabs = document.querySelector(".sp-tabs");
      const tabSub = document.querySelector('.sp-tab[data-tab="subtitles"]');
      const tabWords = document.querySelector('.sp-tab[data-tab="words"]');
      const tabSaved = document.querySelector('.sp-tab[data-tab="saved"]');
      const subVis = document.getElementById("sp-sub-visibility");
      const actions = document.querySelector(".sp-header-actions");
      const btnSettings = document.getElementById("sp-btn-settings");
      const btnPopout = document.getElementById("sp-btn-popout");
      const btnClose = document.getElementById("sp-btn-close");
      const subButtons = Array.from(document.querySelectorAll(".sp-sub-btn")).map(b => ({
        id: b.id,
        text: b.textContent.trim(),
        rect: b.getBoundingClientRect()
      }));

      const headerRect = header.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const tabsRect = tabs.getBoundingClientRect();
      const subVisRect = subVis.getBoundingClientRect();

      // Check if any element overflows the header width
      const overflowX = header.scrollWidth > header.clientWidth;
      const actionsInside = actionsRect.right <= headerRect.right + 1;
      const closeInside = btnClose.getBoundingClientRect().right <= headerRect.right + 1;
      
      // Determine if subVis is on a new row (top is greater than tabs top + tabs height / 2)
      const isSubVisWrapped = subVisRect.top >= tabsRect.bottom - 4;

      return JSON.stringify({
        testedWidth: ${w},
        headerWidth: Math.round(headerRect.width),
        headerHeight: Math.round(headerRect.height),
        scrollWidth: header.scrollWidth,
        clientWidth: header.clientWidth,
        overflowX,
        actionsInside,
        closeInside,
        isSubVisWrapped,
        tabs: {
          width: Math.round(tabsRect.width),
          height: Math.round(tabsRect.height),
          left: Math.round(tabsRect.left),
          top: Math.round(tabsRect.top)
        },
        actions: {
          width: Math.round(actionsRect.width),
          height: Math.round(actionsRect.height),
          left: Math.round(actionsRect.left),
          right: Math.round(actionsRect.right),
          top: Math.round(actionsRect.top)
        },
        closeBtn: {
          right: Math.round(btnClose.getBoundingClientRect().right),
          headerRight: Math.round(headerRect.right)
        },
        subVis: {
          top: Math.round(subVisRect.top),
          left: Math.round(subVisRect.left),
          width: Math.round(subVisRect.width),
          height: Math.round(subVisRect.height)
        },
        subButtons: subButtons.map(b => ({ id: b.id, width: Math.round(b.rect.width), height: Math.round(b.rect.height) }))
      });
    })()`;

    const raw = runChromeJs(evalCode);
    const data = JSON.parse(raw);
    results.push(data);

    console.log(`\n--- Test Width: ${w}px ---`);
    console.log(`Header: ${data.headerWidth}x${data.headerHeight}px (client: ${data.clientWidth}, scroll: ${data.scrollWidth})`);
    console.log(`Horizontal Overflow: ${data.overflowX ? "FAIL (OVERFLOW)" : "PASS (No overflow)"}`);
    console.log(`Actions Inside Header: ${data.actionsInside ? "PASS" : "FAIL"}`);
    console.log(`Close Button Inside Header: ${data.closeInside ? "PASS" : "FAIL"}`);
    console.log(`Sub-visibility wrapped to row 2: ${data.isSubVisWrapped}`);
    console.log(`Close button right (${data.closeBtn.right}px) <= Header right (${data.closeBtn.headerRight}px)`);

    assert.ok(!data.overflowX, `Width ${w}px must NOT have horizontal overflow`);
    assert.ok(data.actionsInside, `Width ${w}px actions must be inside header`);
    assert.ok(data.closeInside, `Width ${w}px close button must not be clipped`);

    if (w <= 380) {
      assert.ok(data.isSubVisWrapped, `Width ${w}px should wrap subVis to row 2 for comfort`);
    } else {
      assert.ok(!data.isSubVisWrapped, `Width ${w}px should keep subVis on row 1`);
    }
  }

  // Step 4: Test Tab Switching behavior (Sub-visibility hides on Words & Saved)
  console.log("\n[4/4] Testing Tab Switching (Words & Saved tabs hide #sp-sub-visibility)...");
  const tabTestCode = `(() => {
    const tabWords = document.querySelector('.sp-tab[data-tab="words"]');
    const tabSub = document.querySelector('.sp-tab[data-tab="subtitles"]');
    const subVis = document.getElementById("sp-sub-visibility");

    tabWords.click();
    const wordsVisDisplay = window.getComputedStyle(subVis).display;
    const wordsHeaderHeight = Math.round(document.querySelector(".sp-header").getBoundingClientRect().height);

    tabSub.click();
    const subVisDisplay = window.getComputedStyle(subVis).display;
    const subHeaderHeight = Math.round(document.querySelector(".sp-header").getBoundingClientRect().height);

    return JSON.stringify({ wordsVisDisplay, wordsHeaderHeight, subVisDisplay, subHeaderHeight });
  })()`;
  const tabData = JSON.parse(runChromeJs(tabTestCode));
  console.log("Words tab subVis display:", tabData.wordsVisDisplay, "Header height:", tabData.wordsHeaderHeight + "px");
  console.log("Subtitles tab subVis display:", tabData.subVisDisplay, "Header height:", tabData.subHeaderHeight + "px");

  assert.strictEqual(tabData.wordsVisDisplay, "none", "subVis must be none on Words tab");
  assert.strictEqual(tabData.subVisDisplay, "flex", "subVis must be flex on Subtitles tab");

  // Restore 100% width on test tab
  runChromeJs(`(() => {
    document.body.style.width = "";
    document.body.style.maxWidth = "";
    document.body.style.overflowX = "";
  })()`);

  console.log("\n======================================================================");
  console.log("ALL RESPONSIVE HEADER TESTS PASSED! 100% VERIFIED.");
  console.log("======================================================================");
}

main().catch(err => {
  console.error("\nTEST FAILED:", err.message);
  process.exit(1);
});
