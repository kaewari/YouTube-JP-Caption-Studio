/**
 * test_scroll_button_qa.js
 * End-to-end verification of Sidepanel Toolbar & Scroll Button (#sp-follow):
 * 1. Checks sidepanel.html for 2-row toolbar structure (.sp-footer-row) and all 10 buttons.
 * 2. Opens Chrome extension sidepanel page in Google Chrome.
 * 3. Asserts live layout geometry and semantic colors of all 10 buttons across 2 rows.
 * 4. Verifies #sp-follow initial active state (text: "▶ Cuộn", emerald bg rgb(20, 53, 34)).
 * 5. Clicks to toggle OFF -> asserts inactive state (text: "⏸ Cuộn", neutral bg rgb(34, 34, 48)).
 * 6. Clicks to toggle ON -> asserts active state restored (text: "▶ Cuộn", emerald bg rgb(20, 53, 34)).
 * 7. Verifies programmatic scroll does NOT turn off follow.
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
  console.log("QA TEST: SIDEPANEL 2-ROW TOOLBAR & SEMANTIC BUTTONS VERIFICATION");
  console.log("======================================================================\n");

  // Step 1: Static verification of sidepanel.html
  console.log("[1/5] Verifying sidepanel.html has 2-row toolbar and all 10 buttons...");
  const htmlPath = path.resolve(__dirname, "../extension/sidepanel/sidepanel.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  assert.ok(html.includes('class="sp-footer-row"'), "sidepanel.html must contain .sp-footer-row");
  const requiredIds = [
    "sp-add-cue",
    "sp-reload",
    "sp-overlay",
    "sp-follow",
    "sp-settings",
    "sp-import",
    "sp-export",
    "sp-drive-upload",
    "sp-clear-mt",
    "sp-wipe-script",
  ];
  for (const id of requiredIds) {
    assert.ok(html.includes(`id="${id}"`), `sidepanel.html must contain id="${id}"`);
  }
  console.log("-> PASS: sidepanel.html contains 2-row structure and all 10 buttons.\n");

  // Step 2: Open sidepanel page in Chrome
  console.log("[2/5] Opening sidepanel in Chrome for live runtime testing...");
  execFileSync("osascript", ["-e", `tell application "Google Chrome"
    tell front window
      make new tab with properties {URL:"chrome-extension://oiocgalcdfmkbcikemohekbjjmlbpoll/sidepanel/sidepanel.html"}
    end tell
  end tell`]);

  await sleep(1200);

  try {
    // Step 3: Measure real DOM geometry and semantic styles of all 10 buttons
    console.log("[3/5] Measuring live DOM layout geometry & semantic styles of all 10 buttons...");
    const toolbarInfo = JSON.parse(runChromeJs(`(() => {
      const rows = document.querySelectorAll(".sp-footer-row");
      const buttons = [
        "sp-add-cue",
        "sp-reload",
        "sp-overlay",
        "sp-follow",
        "sp-settings",
        "sp-import",
        "sp-export",
        "sp-drive-upload",
        "sp-clear-mt",
        "sp-wipe-script"
      ];
      const details = {};
      for (const id of buttons) {
        const el = document.getElementById(id);
        if (!el) {
          details[id] = { error: "not_found" };
          continue;
        }
        const rect = el.getBoundingClientRect();
        const comp = window.getComputedStyle(el);
        details[id] = {
          text: el.textContent.trim(),
          hidden: el.hidden,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          bg: comp.backgroundColor,
          color: comp.color,
          border: comp.borderColor,
          classes: Array.from(el.classList)
        };
      }
      return JSON.stringify({ rowCount: rows.length, details });
    })()`));

    console.log("Toolbar Rows detected:", toolbarInfo.rowCount);
    assert.strictEqual(toolbarInfo.rowCount, 2, "Must have exactly 2 toolbar rows");

    const d = toolbarInfo.details;
    console.log("\nButton Details & Semantic Colors:");
    for (const [id, info] of Object.entries(d)) {
      console.log(`- ${id}: [${info.text}] bg=${info.bg}, color=${info.color}, size=${info.width}x${info.height}px`);
      assert.ok(!info.hidden, `Button ${id} must be visible`);
      assert.ok(info.width > 20, `Button ${id} width must be > 20px`);
      assert.ok(info.height > 18, `Button ${id} height must be > 18px`);
    }

    // Verify semantic colors
    // 1. + Cue: Emerald / Green
    assert.strictEqual(d["sp-add-cue"].bg, "rgb(22, 44, 32)", "+ Cue bg must be emerald rgb(22, 44, 32)");
    // 2. Reload: Blue
    assert.strictEqual(d["sp-reload"].bg, "rgb(23, 37, 59)", "Reload bg must be blue rgb(23, 37, 59)");
    // 3. Overlay: Violet / Purple
    assert.strictEqual(d["sp-overlay"].bg, "rgb(39, 28, 59)", "Overlay bg must be violet rgb(39, 28, 59)");
    // 4. Follow: Emerald active
    assert.strictEqual(d["sp-follow"].bg, "rgb(20, 53, 34)", "Follow initial bg must be emerald rgb(20, 53, 34)");
    assert.strictEqual(d["sp-follow"].text, "▶ Cuộn", "Follow initial text must be '▶ Cuộn'");
    // 5. Import: Cyan / Slate
    assert.strictEqual(d["sp-import"].bg, "rgb(24, 40, 51)", "Import bg must be cyan/slate rgb(24, 40, 51)");
    // 6. Export: Cyan / Slate
    assert.strictEqual(d["sp-export"].bg, "rgb(24, 40, 51)", "Export bg must be cyan/slate rgb(24, 40, 51)");
    // 7. Drive: Sky Blue
    assert.strictEqual(d["sp-drive-upload"].bg, "rgb(21, 44, 63)", "Drive bg must be sky blue rgb(21, 44, 63)");
    // 8. Clear MT: Amber Warning
    assert.strictEqual(d["sp-clear-mt"].bg, "rgb(53, 33, 18)", "Clear MT bg must be amber rgb(53, 33, 18)");
    // 9. Wipe Script: Crimson Danger
    assert.strictEqual(d["sp-wipe-script"].bg, "rgb(54, 21, 27)", "Wipe Script bg must be crimson rgb(54, 21, 27)");
    // 10. Settings: Slate
    assert.strictEqual(d["sp-settings"].bg, "rgb(36, 36, 52)", "Settings bg must be slate rgb(36, 36, 52)");

    console.log("-> PASS: All 10 buttons accurately matched their semantic colors!\n");

    // Step 4: Test #sp-follow interactive toggle cycle
    console.log("[4/5] Testing interactive toggle cycle of #sp-follow (click OFF, click ON)...");
    
    // Click 1: Toggle OFF
    runChromeJs(`document.getElementById("sp-follow").click()`);
    await sleep(250);
    const stateOff = JSON.parse(runChromeJs(`(() => {
      const btn = document.getElementById("sp-follow");
      const comp = window.getComputedStyle(btn);
      return JSON.stringify({
        text: btn.textContent.trim(),
        active: btn.classList.contains("active"),
        bg: comp.backgroundColor,
        color: comp.color
      });
    })()`));
    console.log("After Click 1 (OFF):", stateOff);
    assert.strictEqual(stateOff.text, "⏸ Cuộn", "Inactive text must be '⏸ Cuộn'");
    assert.strictEqual(stateOff.active, false, "Active class must be removed");
    assert.strictEqual(stateOff.bg, "rgb(34, 34, 48)", "Inactive bg must be neutral slate rgb(34, 34, 48)");

    // Click 2: Toggle ON
    runChromeJs(`document.getElementById("sp-follow").click()`);
    await sleep(250);
    const stateOn = JSON.parse(runChromeJs(`(() => {
      const btn = document.getElementById("sp-follow");
      const comp = window.getComputedStyle(btn);
      return JSON.stringify({
        text: btn.textContent.trim(),
        active: btn.classList.contains("active"),
        bg: comp.backgroundColor,
        color: comp.color
      });
    })()`));
    console.log("After Click 2 (ON):", stateOn);
    assert.strictEqual(stateOn.text, "▶ Cuộn", "Active text must be '▶ Cuộn'");
    assert.strictEqual(stateOn.active, true, "Active class must be restored");
    assert.strictEqual(stateOn.bg, "rgb(20, 53, 34)", "Active bg must be emerald rgb(20, 53, 34)");

    // Step 5: Test programmatic scroll does NOT turn off follow
    console.log("[5/5] Testing programmatic scroll resilience...");
    const resilience = JSON.parse(runChromeJs(`(() => {
      const list = document.getElementById("sp-list");
      list.scrollTop = 120; // Programmatic scroll
      return JSON.stringify({
        followActive: document.getElementById("sp-follow").classList.contains("active"),
        followText: document.getElementById("sp-follow").textContent.trim()
      });
    })()`));
    await sleep(250);
    assert.strictEqual(resilience.followActive, true, "Programmatic scroll must NOT disable follow");
    assert.strictEqual(resilience.followText, "▶ Cuộn", "Programmatic scroll must keep '▶ Cuộn'");
    console.log("-> PASS: Programmatic scroll resilience verified! Follow stayed ACTIVE.\n");

    console.log("======================================================================");
    console.log("ALL 5 QA VERIFICATION CHECKS PASSED WITH FLYING COLORS!");
    console.log("======================================================================");

  } finally {
    // Clean up test tab
    execFileSync("osascript", ["-e", `tell application "Google Chrome"
      repeat with w in windows
        repeat with t in tabs of w
          if URL of t contains "oiocgalcdfmkbcikemohekbjjmlbpoll/sidepanel/sidepanel.html" then
            close t
            exit repeat
          end if
        end repeat
      end repeat
    end tell`]);
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
