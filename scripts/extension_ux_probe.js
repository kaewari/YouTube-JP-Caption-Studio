#!/usr/bin/env node
/** Real-Chrome UX probe for the extension: load unpacked, drive a live YouTube
 * video, screenshot each flow, assert rendered state (never source strings).
 * Usage: node scripts/extension_ux_probe.js --out /tmp/uxshots [--video ID]
 * Chrome headless=new + --load-extension; CDP screencast recorded to ux.mp4.
 *
 * LIMIT (verified 2026-10-23): branded Google Chrome IGNORES --load-extension
 * ("--load-extension is not allowed in Google Chrome, ignoring" in verbose log),
 * so this script needs Chromium / Chrome Dev / a pre-loaded profile. It does NOT
 * work with stock Google Chrome from CLI.
 */
"use strict";
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CHROME =
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
   "/usr/bin/google-chrome", "/usr/bin/chromium"].find((f) => f && fs.existsSync(f)) || "";
if (!CHROME) { console.error("no chrome binary"); process.exit(2); }

const args = process.argv.slice(2);
const outDir = args[args.indexOf("--out") + 1] || "/tmp/uxshots";
const VIDEO = args[args.indexOf("--video") + 1] || "MNGOykySDto";
fs.mkdirSync(outDir, { recursive: true });

class PipeCdp {
  constructor(extraArgs) {
    const userDataDir = fs.mkdtempSync("/tmp/uxprobe-profile-");
    this.child = spawn(CHROME, [
      "--headless=new", "--remote-debugging-pipe",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run", "--no-default-browser-check", "--disable-gpu",
      "--window-size=1360,900",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
      ...extraArgs, "about:blank",
    ], { stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] });
    this.nextId = 1; this.pending = new Map(); this._buffer = Buffer.alloc(0);
    this.child.stdio[4].on("data", (c) => this._onData(c));
  }
  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    for (;;) {
      const end = this._buffer.indexOf(0);
      if (end === -1) return;
      const raw = this._buffer.subarray(0, end).toString("utf8");
      this._buffer = this._buffer.subarray(end + 1);
      let msg; try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result || {});
      } else if (msg.method === "Page.screencastFrame") {
        this.onFrame?.(msg.params);
        this.send("Page.screencastFrameAck", { sessionId: msg.params.sessionId }).catch(() => {});
      }
    }
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.child.stdio[3].write(JSON.stringify(payload) + "\0");
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }
      }, 30000);
    });
  }
  async newPage(url) {
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    const page = { send: (m, p) => this.send(m, p, sessionId), targetId };
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    if (url) { await page.send("Page.navigate", { url }); }
    return page;
  }
  kill() { this.child.kill(); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evalJs(page, expr) {
  const r = await page.send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error("page js failed: " + JSON.stringify(r.exceptionDetails.text || r.exceptionDetails).slice(0, 200));
  return r.result?.result?.value;
}
async function waitFor(page, expr, timeoutMs, label) {
  const t0 = Date.now();
  for (;;) {
    const v = await evalJs(page, expr).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting: ${label}`);
    await sleep(1000);
  }
}
async function shot(page, name) {
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  const p = path.join(outDir, name);
  fs.writeFileSync(p, Buffer.from(data, "base64"));
  console.log("shot:", name);
}
async function clickSelector(page, selector) {
  const quad = await evalJs(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  })()`);
  if (!quad) throw new Error("no element: " + selector);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: quad[0], y: quad[1] });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: quad[0], y: quad[1], button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: quad[0], y: quad[1], button: "left", clickCount: 1 });
}

(async () => {
  const results = {};
  const cdp = new PipeCdp([`--load-extension=${path.join(ROOT, "extension")}`]);
  // NOTE: no --disable-extensions-except — with a path value it disables the
  // just-loaded extension itself (verified: no isolated world, empty
  // chrome://extensions). A fresh profile has nothing else to disable.
  const frames = [];
  cdp.onFrame = (p) => frames.push(Buffer.from(p.data, "base64"));
  try {
    // Extension id from the service-worker target (poll: the SW starts lazily).
    let sw = null, seen = [];
    for (let i = 0; i < 15 && !sw; i++) {
      const { targetInfos } = await cdp.send("Target.getTargets");
      seen = targetInfos || [];
      sw = seen.find((t) => t.type === "service_worker" && String(t.url || "").startsWith("chrome-extension://"));
      if (!sw) await sleep(1000);
    }
    if (!sw) throw new Error("extension service worker target not found; targets=" + JSON.stringify(seen.map((t) => t.url).slice(0, 8)));
    const EXT = new URL(sw.url).hostname;
    console.log("extension id:", EXT);

    // Flow 1: live video + overlay.
    const yt = await cdp.newPage(`https://www.youtube.com/watch?v=${VIDEO}`);
    await yt.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 10 }).catch(() => {});
    const overlayText = await waitFor(yt,
      `(() => { const b = document.querySelector("#hardsub-ocr-bar"); return (b && !b.hidden && b.innerText.trim().length > 3) ? b.innerText.trim().slice(0, 80) : null; })()`,
      90000, "caption overlay with text");
    results.overlay_text = overlayText;
    console.log("overlay:", JSON.stringify(overlayText));
    await shot(yt, "ux_1_overlay.png");

    // Flow 2: dict popup via token click (first clickable token in the bar).
    const tokSel = await evalJs(yt, `(() => {
      const bar = document.querySelector("#hardsub-ocr-bar");
      if (!bar) return null;
      const cand = [...bar.querySelectorAll("span,ruby")].find((el) => (el.innerText || "").trim().length >= 1);
      if (!cand) return null;
      cand.setAttribute("data-ux-token", "1");
      return "[data-ux-token]";
    })()`);
    if (tokSel) {
      await clickSelector(yt, tokSel);
      await sleep(1500);
      const dictVisible = await evalJs(yt, `(() => { const d = document.querySelector("#hardsub-ocr-dict"); return !!(d && !d.hidden && d.innerText.trim()); })()`).catch(() => false);
      results.dict_popup = !!dictVisible;
      await shot(yt, "ux_2_dict.png");
    } else { results.dict_popup = "no-token-found"; await shot(yt, "ux_2_dict.png"); }

    // Flow 3: star the active cue (real click on the star button).
    await clickSelector(yt, ".lr-star-btn");
    await sleep(2000);
    const starState = await evalJs(yt, `(() => document.querySelector(".lr-star-btn")?.textContent)()`);
    results.star_button = starState;
    if (starState !== "★") throw new Error("star button did not activate, got: " + JSON.stringify(starState));
    await shot(yt, "ux_3_starred.png");

    // Flow 4: Saved Items page shows the starred cue with the video title (C-7 end to end).
    const saved = await cdp.newPage(`chrome-extension://${EXT}/popup/index.html`);
    await sleep(4000);
    const tabClicked = await evalJs(saved, `(() => {
      const btns = [...document.querySelectorAll("button")];
      const t = btns.find((b) => (b.innerText || "").includes("Câu đã lưu"));
      if (t) { t.click(); return true; }
      return "no-tab-button";
    })()`).catch((e) => "eval-failed:" + String(e).slice(0, 80));
    results.saved_tab = tabClicked;
    await sleep(2000);
    const savedInfo = await evalJs(saved, `(() => ({
      hasSearch: !!document.querySelector('[aria-label="Tìm câu đã lưu"]'),
      bodyText: document.body.innerText.slice(0, 400),
    }))()`);
    results.saved_hydrate = savedInfo;
    await shot(saved, "ux_4_saved.png");

    // Flow 5: sidepanel page render.
    const sp = await cdp.newPage(`chrome-extension://${EXT}/sidepanel/sidepanel.html`);
    await sleep(3000);
    const spText = await evalJs(sp, `(() => document.body.innerText.trim().slice(0, 120))()`).catch(() => "");
    results.sidepanel_text = spText;
    await shot(sp, "ux_5_sidepanel.png");

    // Screencast frames were collected only if enabled; assemble what we have.
    results.frames = frames.length;
    console.log("RESULT " + JSON.stringify(results, null, 1));
    const fails = Object.entries(results).filter(([k, v]) => v === false || v === null || v === "no-token-found");
    if (fails.length) { console.error("FLOW FAILURES:", JSON.stringify(fails)); process.exitCode = 1; }
  } finally {
    // Write screencast frames for the report video (may be empty if never started).
    if (frames.length) {
      fs.writeFileSync(path.join(outDir, "ux_frames.json"), JSON.stringify({ count: frames.length }));
      frames.forEach((f, i) => fs.writeFileSync(path.join(outDir, `ux_f${String(i).padStart(4, "0")}.jpg`), f));
    }
    cdp.kill();
  }
})().catch((e) => { console.error("PROBE FAILED:", e.message); process.exitCode = 1; });
