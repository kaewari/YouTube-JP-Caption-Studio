const { execFileSync } = require("child_process");

function runChromeJs(jsCode) {
  const cleanJs = jsCode.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const appleScript = `tell application "Google Chrome" to tell active tab of front window to execute javascript "${cleanJs}"`;
  return execFileSync("osascript", ["-e", appleScript], { encoding: "utf8" }).trim();
}

try {
  const result = runChromeJs(`(() => {
    const video = document.querySelector('video');
    const pill = document.querySelector('.lr-yt-pill');
    const nav = document.getElementById('lr-nav-left');
    const ctrl = document.getElementById('lr-ctrl-right');
    const hardsub = document.getElementById('hardsub-container');
    const cardJa = document.querySelector('.lr-card-ja');
    const cardVi = document.querySelector('.lr-card-vi');
    
    return JSON.stringify({
      title: document.title,
      url: window.location.href,
      hasPill: !!pill,
      pillText: pill ? pill.innerText.replace(/\\s+/g, ' ').trim() : null,
      hasNav: !!nav,
      navDisplay: nav ? window.getComputedStyle(nav).display : null,
      hasCtrl: !!ctrl,
      hasHardsubContainer: !!hardsub,
      hardsubDisplay: hardsub ? window.getComputedStyle(hardsub).display : null,
      jaText: cardJa ? cardJa.innerText.replace(/\\s+/g, ' ').trim() : null,
      viText: cardVi ? cardVi.innerText.replace(/\\s+/g, ' ').trim() : null,
      videoDuration: video ? video.duration : null,
      videoCurrentTime: video ? video.currentTime : null,
      videoPaused: video ? video.paused : null
    });
  })()`);
  
  console.log("LIVE CHROME STATUS:");
  console.log(JSON.stringify(JSON.parse(result), null, 2));
} catch (err) {
  console.error("Error inspecting Chrome:", err.message);
}
