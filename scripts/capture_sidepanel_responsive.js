/**
 * capture_sidepanel_responsive.js
 * Opens Chrome sidepanel at exact sidepanel dimensions (380px width, matching user screenshot)
 * and captures high-resolution screenshots of the Subtitles, Words, and Saved views.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("Capturing responsive sidepanel UI at 380px width...");

  // Open sidepanel in a popup window with 380px width
  const appleScript = `tell application "Google Chrome"
    set newWin to make new window with properties {mode:"normal"}
    set bounds of newWin to {200, 100, 580, 800} -- width 380, height 700
    set URL of active tab of newWin to "chrome-extension://oiocgalcdfmkbcikemohekbjjmlbpoll/sidepanel/sidepanel.html"
    activate
    return id of newWin
  end tell`;

  const winId = execFileSync("osascript", ["-e", appleScript], { encoding: "utf8" }).trim();
  console.log("Opened test window ID:", winId);

  await sleep(2000);

  // Take screenshot of window
  const outPathSub = "/Users/hoangson/.gemini/antigravity-ide/brain/2f76f313-60e2-4254-97b4-ea3f59db94b6/sidepanel_subtitles_responsive.png";
  execFileSync("screencapture", ["-x", outPathSub]);
  console.log("Captured Subtitles view screenshot to:", outPathSub);

  // Switch to Words tab
  const switchWordsScript = `tell application "Google Chrome"
    tell active tab of front window
      execute javascript "document.querySelector('.sp-tab[data-tab=\\"words\\"]').click();"
    end tell
  end tell`;
  execFileSync("osascript", ["-e", switchWordsScript]);
  await sleep(1000);

  const outPathWords = "/Users/hoangson/.gemini/antigravity-ide/brain/2f76f313-60e2-4254-97b4-ea3f59db94b6/sidepanel_words_responsive.png";
  execFileSync("screencapture", ["-x", outPathWords]);
  console.log("Captured Words view screenshot to:", outPathWords);

  // Switch to Saved tab
  const switchSavedScript = `tell application "Google Chrome"
    tell active tab of front window
      execute javascript "document.querySelector('.sp-tab[data-tab=\\"saved\\"]').click();"
    end tell
  end tell`;
  execFileSync("osascript", ["-e", switchSavedScript]);
  await sleep(1000);

  const outPathSaved = "/Users/hoangson/.gemini/antigravity-ide/brain/2f76f313-60e2-4254-97b4-ea3f59db94b6/sidepanel_saved_responsive.png";
  execFileSync("screencapture", ["-x", outPathSaved]);
  console.log("Captured Saved view screenshot to:", outPathSaved);

  // Close test window
  const closeWinScript = `tell application "Google Chrome"
    close front window
  end tell`;
  execFileSync("osascript", ["-e", closeWinScript]);
  console.log("Closed test window cleanly.");
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
