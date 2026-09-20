const { execFileSync, execSync } = require("child_process");
const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");

console.log("======================================================================");
console.log("LIVE SYSTEM INTEGRATION: BRIDGE BACKEND + CHROME RUNTIME VERIFICATION");
console.log("======================================================================\n");

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

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on("error", reject);
  });
}

function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  // 1. Verify Local Bridge Health & Readiness
  console.log("[1/6] Checking Local Bridge (/health) HTTP endpoint...");
  const healthRes = await httpGet("http://127.0.0.1:8765/health");
  console.log("Bridge Health Status:", healthRes.status, JSON.stringify(healthRes.body.models_loaded));
  assert.strictEqual(healthRes.status, 200, "Bridge /health must respond with HTTP 200");
  assert.strictEqual(healthRes.body.ready, true, "Bridge must report ready: true");
  assert.strictEqual(healthRes.body.models_loaded.sudachi, true, "Sudachi tokenizer must be loaded");
  assert.strictEqual(healthRes.body.models_loaded.dict, true, "Dictionary model must be loaded");
  assert.strictEqual(healthRes.body.models_loaded.freq, true, "Frequency rank index must be loaded");
  console.log("-> PASS: Bridge backend is healthy and all NLP models are loaded!\n");

  // 2. Verify Bridge Tokenize & Dictionary API contracts
  console.log("[2/6] Verifying NLP Tokenize & Dictionary API responses...");
  const tokRes = await httpPost("http://127.0.0.1:8765/tokenize", { text: "日本語の勉強" });
  assert.strictEqual(tokRes.status, 200, "/tokenize must return HTTP 200");
  assert.ok(Array.isArray(tokRes.body.tokens) && tokRes.body.tokens.length >= 2, "Tokens array must contain words");
  const nihongoToken = tokRes.body.tokens.find((t) => t.surface === "日本語");
  assert.ok(nihongoToken && nihongoToken.reading === "にほんご", "Token '日本語' must have furigana reading 'にほんご'");
  assert.strictEqual(nihongoToken.jlpt, "n5", "Token '日本語' must have JLPT tag n5");

  const dictRes = await httpPost("http://127.0.0.1:8765/dict", { surface: "勉強", lemma: "勉強" });
  assert.strictEqual(dictRes.status, 200, "/dict must return HTTP 200");
  assert.strictEqual(dictRes.body.found, true, "Word '勉強' must be found in dictionary");
  assert.ok(dictRes.body.senses.length > 0, "Dictionary must provide senses with definitions");
  assert.ok(dictRes.body.senses[0].gloss_en.length > 0, "English glosses must be populated");
  console.log("-> PASS: /tokenize and /dict APIs verified with authentic NLP data!\n");

  // 3. Verify Chrome Video Overlay Bridge Connection Pill
  console.log("[3/6] Verifying Chrome Video Overlay connection to Bridge...");
  // Ensure video is playing or paused at 5s with overlay active
  runChromeJs(`(() => {
    const v = document.querySelector("video");
    if (v) {
      v.currentTime = 5.0;
      v.pause();
    }
    const bar = document.getElementById("hardsub-ocr-bar");
    if (bar && bar.hidden) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", code: "KeyH", bubbles: true }));
    }
  })()`);

  await sleep(1500);

  const bridgePillStatus = JSON.parse(runChromeJs(`(() => {
    const bar = document.getElementById("hardsub-ocr-bar");
    if (!bar) return JSON.stringify({ error: "no_bar" });
    const pill = bar.querySelector(".hardsub-bridge-pill");
    if (!pill) return JSON.stringify({ error: "no_pill" });
    const isReady = pill.classList.contains("ready");
    const rect = pill.getBoundingClientRect();
    return JSON.stringify({
      found: true,
      isReady,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      title: pill.title
    });
  })()`));

  console.log("Bridge Pill in DOM:", bridgePillStatus);
  assert.ok(bridgePillStatus.found, "Bridge pill element must exist in overlay DOM");
  assert.strictEqual(bridgePillStatus.isReady, true, "Bridge pill must have 'ready' class (connected to bridge)");
  console.log("-> PASS: Extension overlay is connected to Local Bridge (green status pill)!\n");

  // 4. Verify Live Token Furigana & JLPT Markup in Chrome DOM
  console.log("[4/6] Verifying live Japanese tokenization and furigana rendering in DOM...");
  const tokenAnalysis = JSON.parse(runChromeJs(`(() => {
    const bar = document.getElementById("hardsub-ocr-bar");
    if (!bar) return JSON.stringify({ error: "no_bar" });
    const jaWrap = bar.querySelector(".lr-text-ja");
    if (!jaWrap) return JSON.stringify({ error: "no_ja_wrap" });
    const rubies = Array.from(jaWrap.querySelectorAll("ruby"));
    const tokens = Array.from(jaWrap.querySelectorAll("[data-surface]"));
    const rubyData = rubies.slice(0, 3).map((r) => ({
      text: r.childNodes[0]?.textContent?.trim() || "",
      rt: r.querySelector("rt")?.textContent?.trim() || ""
    }));
    return JSON.stringify({
      tokenCount: tokens.length,
      rubyCount: rubies.length,
      sampleRubies: rubyData,
      rawText: jaWrap.innerText.replace(/\\s+/g, ' ').trim()
    });
  })()`));

  console.log("Live Token Analysis:", tokenAnalysis);
  assert.ok(tokenAnalysis.tokenCount > 0, "Video subtitle must contain parsed tokens");
  if (/[\u4e00-\u9faf]/.test(tokenAnalysis.rawText)) {
    assert.ok(tokenAnalysis.rubyCount > 0, "Furigana ruby elements must be rendered on kanji words");
  }
  console.log("-> PASS: Authentic furigana and token structures active in Chrome video DOM!\n");

  // 5. Verify Real Hover Word Dictionary Popover in Chrome
  console.log("[5/6] Testing Hover Word Dictionary popover in Chrome...");
  const hoverResult = JSON.parse(runChromeJs(`(() => {
    const bar = document.getElementById("hardsub-ocr-bar");
    const dictEl = document.getElementById("hardsub-ocr-dict");
    if (!bar || !dictEl) return JSON.stringify({ error: "missing_elements" });

    // Pick first content token (exclude punctuation)
    const candidateTokens = Array.from(bar.querySelectorAll(".lr-text-ja ruby, .lr-text-ja span.tok, .lr-text-ja span[data-surface]"));
    const targetTok = candidateTokens.find((el) => {
      const surface = (el.getAttribute("data-surface") || el.childNodes[0]?.textContent || el.innerText || "").trim();
      return surface && !/^[\s\u3000。、.!?,！？「」『』（）()\[\]…・〜～]+$/.test(surface);
    });
    if (!targetTok) return JSON.stringify({ error: "no_target_token" });

    const tokSurface = targetTok.getAttribute("data-surface") || targetTok.childNodes[0]?.textContent?.trim() || targetTok.innerText;
    const tokRect = targetTok.getBoundingClientRect();

    // Dispatch mouseenter on the token
    targetTok.dispatchEvent(new MouseEvent("mouseenter", {
      bubbles: true,
      cancelable: true,
      clientX: tokRect.left + tokRect.width / 2,
      clientY: tokRect.top + tokRect.height / 2
    }));

    return JSON.stringify({
      tokenTarget: tokSurface,
      clientX: Math.round(tokRect.left + tokRect.width / 2),
      clientY: Math.round(tokRect.top + tokRect.height / 2)
    });
  })()`));

  console.log("Hover Triggered on Token:", hoverResult);
  // Wait for /dict async fetch and popover DOM insertion
  await sleep(600);

  const dictPopoverStatus = JSON.parse(runChromeJs(`(() => {
    const dictEl = document.getElementById("hardsub-ocr-dict");
    if (!dictEl) return JSON.stringify({ error: "no_dict_el" });
    const rect = dictEl.getBoundingClientRect();
    const isHidden = dictEl.hidden || getComputedStyle(dictEl).display === "none";
    const head = dictEl.querySelector(".dict-head")?.innerText || "";
    const glosses = Array.from(dictEl.querySelectorAll(".dict-gloss")).map((g) => g.innerText);
    return JSON.stringify({
      isHidden,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      head: head.replace(/\\s+/g, ' ').trim(),
      glossCount: glosses.length,
      sampleGlosses: glosses.slice(0, 3)
    });
  })()`));

  console.log("Dictionary Popover in Chrome DOM:", dictPopoverStatus);
  assert.strictEqual(dictPopoverStatus.isHidden, false, "Dictionary popover must be visible after hover");
  assert.ok(dictPopoverStatus.width > 50, "Dictionary popover width must be measured > 50px");
  assert.ok(dictPopoverStatus.height > 20, "Dictionary popover height must be measured > 20px");
  assert.ok(dictPopoverStatus.head.length > 0, "Dictionary popover must display headword reading");
  console.log("-> PASS: Real dictionary popover rendered successfully on token hover!\n");

  // 6. Capture Visual Screenshot Evidence
  console.log("[6/6] Capturing live visual proof screenshot of Chrome with Bridge active...");
  const artifactsDir = path.resolve(__dirname, "../.artifacts");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  const screenshotPath = path.join(artifactsDir, "chrome_live_bridge_qa.png");

  execSync(`screencapture -x -R0,33,1508,905 "${screenshotPath}"`);
  assert.ok(fs.existsSync(screenshotPath), "Screenshot file must exist");
  const stat = fs.statSync(screenshotPath);
  assert.ok(stat.size > 100000, `Screenshot size (${stat.size} bytes) must be authentic`);
  console.log(`-> Visual proof saved at ${screenshotPath} (${(stat.size / 1024).toFixed(1)} KB)`);

  console.log("\n======================================================================");
  console.log("ALL 6 LIVE BRIDGE & BROWSER VERIFICATION PHASES PASSED WITH 100% SUCCESS!");
  console.log("======================================================================");
}

main().catch((err) => {
  console.error("\n[TEST FAILED]:", err);
  process.exit(1);
});
