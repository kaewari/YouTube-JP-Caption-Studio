#!/usr/bin/env node
/**
 * Real-browser probe for the Saved Items popup, with no automation dependency.
 *
 * Chrome is driven over `--remote-debugging-pipe` (CDP messages on fd 3/4,
 * NUL-separated), which is the same protocol puppeteer speaks, so this needs no
 * `playwright`/`puppeteer`/`ws` install and downloads no browser: it reuses the
 * Chrome for Testing that is already on the machine.
 *
 * Modes:
 *   --self-test              load the popup, prove hydration + a11y + paint
 *   --measure-words[=N]      seed N words and report render metrics (default 5000)
 *   --serve                  keep the static server up (debugging)
 *
 * Exit codes: 0 = passed, 77 = no Chrome binary found (skipped), 1 = failed.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const POPUP_DIR = path.join(ROOT, "extension", "popup");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

function findChrome() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache).filter((n) => n.startsWith("chromium-")).sort().reverse()) {
      candidates.push(
        path.join(cache, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        path.join(cache, dir, "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        path.join(cache, dir, "chrome-linux/chrome"),
      );
    }
  }
  candidates.push(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  );
  return candidates.find((file) => file && fs.existsSync(file)) || "";
}

/** CDP over the `--remote-debugging-pipe` transport: NUL-framed JSON on fd 3/4. */
class PipeCdp {
  constructor(chrome, userDataDir) {
    this.child = spawn(
      chrome,
      [
        "--headless=new",
        "--remote-debugging-pipe",
        `--user-data-dir=${userDataDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "--disable-background-networking",
        "--window-size=1280,900",
        "about:blank",
      ],
      // fd 3 = browser reads CDP, fd 4 = browser writes CDP.
      { stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] },
    );
    this.nextId = 1;
    this.pending = new Map();
    this.exceptions = [];
    this._buffer = Buffer.alloc(0);
    this.child.stdio[4].on("data", (chunk) => this._onData(chunk));
    this.exited = new Promise((resolve) => this.child.on("close", resolve));
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    for (;;) {
      const end = this._buffer.indexOf(0);
      if (end === -1) return;
      const raw = this._buffer.subarray(0, end).toString("utf8");
      this._buffer = this._buffer.subarray(end + 1);
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (_) {
        continue;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result || {});
      } else if (msg.method === "Runtime.exceptionThrown") {
        this.exceptions.push(msg.params?.exceptionDetails?.text || "exception");
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
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  /** A page session: attach to a fresh target and enable the domains we use. */
  async newPage() {
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    const page = {
      send: (method, params) => this.send(method, params, sessionId),
    };
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    return page;
  }

  close() {
    try {
      this.child.kill("SIGKILL");
    } catch (_) {}
  }
}

function serveStatic(dir) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.join(dir, rel);
    if (!file.startsWith(dir)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const SEED_LOCAL_STORAGE = (words) => `
  (() => {
    const words = ${JSON.stringify(words)};
    try {
      localStorage.setItem("ytcaption.savedWords.v1", JSON.stringify({ version: 1, data: words }));
      localStorage.removeItem("ytcaption.savedWords.v1.unsupported");
    } catch (_) {}
  })();
`;

function makeWords(count) {
  const words = [];
  for (let i = 0; i < count; i += 1) {
    words.push({
      lemma: `語${i}`,
      reading: `ご${i}`,
      glossVi: `nghĩa ${i}`,
      glossEn: `meaning ${i}`,
      status: i % 4 === 0 ? "known" : "learning",
      jlpt: ["n5", "n4", "n3", "n2", "n1"][i % 5],
      contextJa: `文脈 ${i}`,
      videoTitle: `video ${i % 50}`,
      updatedAt: 1_700_000_000_000 + i,
    });
  }
  return words;
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(`evaluate failed: ${String(detail).slice(0, 400)}`);
  }
  return result.result?.value;
}

async function waitFor(page, expression, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(page, expression)) return true;
    } catch (_) {
      // The document may not exist yet on the first polls: not an error here.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/** Runs `fn(page)` against a hydrated popup page and always tears Chrome down. */
async function withPage({ words, width = 1280, height = 900 }, fn) {
  const chrome = findChrome();
  if (!chrome) {
    console.log("SKIP: browser_probe.js found no Chrome binary (set CHROME_PATH)");
    return 77;
  }
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "jp-browser-probe-"));
  const cdp = new PipeCdp(chrome, userDataDir);
  let served;
  try {
    served = await serveStatic(POPUP_DIR);
    const page = await cdp.newPage();
    await page.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    if (words) {
      await page.send("Page.addScriptToEvaluateOnNewDocument", {
        source: SEED_LOCAL_STORAGE(words),
      });
    }
    await page.send("Page.navigate", { url: `http://127.0.0.1:${served.port}/index.html` });
    // The static export ships a "Đang tải…" placeholder; hydration replaces it.
    const hydrated = await waitFor(
      page,
      `!!document.body && !document.body.innerText.includes("Đang tải…")`,
      25000,
    );
    if (!hydrated) throw new Error("the popup never hydrated (still shows Đang tải…)");
    return await fn(page, cdp);
  } finally {
    cdp.close();
    await cdp.exited.catch(() => {});
    if (served) served.server.close();
    // Chrome's profile writes outlive the process kill by a moment.
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (_) {}
  }
}

async function selfTest() {
  return withPage({ words: makeWords(3) }, async (page, cdp) => {
    await waitFor(page, `document.querySelectorAll("main article").length >= 3`, 15000);
    const probe = await evaluate(
      page,
      `(() => {
        const searches = [...document.querySelectorAll('input[type="search"]')];
        const named = searches.filter((el) => (el.getAttribute('aria-label') || '').trim());
        const svgs = [...document.querySelectorAll('svg')];
        return {
          rows: document.querySelectorAll('main article').length,
          searchCount: searches.length,
          namedSearches: named.length,
          svgs: svgs.length,
          hiddenSvgs: svgs.filter((el) => el.getAttribute('aria-hidden') === 'true').length,
          bodyText: (document.body.innerText || '').slice(0, 160),
        };
      })()`,
    );
    const shot = await page.send("Page.captureScreenshot", { format: "png" });
    const png = Buffer.from(shot.data, "base64");

    const problems = [];
    if (probe.rows < 3) problems.push(`seeded 3 words but rendered ${probe.rows} rows`);
    if (probe.searchCount < 1) problems.push("no search input rendered");
    if (probe.namedSearches !== probe.searchCount) problems.push("a search input has no aria-label");
    if (png.length < 5000) problems.push(`screenshot too small: ${png.length} bytes`);
    if (cdp.exceptions.length) problems.push(`page exception: ${cdp.exceptions[0]}`);
    if (problems.length) {
      console.error("FAIL browser self-test:");
      for (const p of problems) console.error(`  - ${p}`);
      return 1;
    }
    console.log(
      `PASS real Chrome ${await evaluate(page, "navigator.userAgent")}: hydrated, ${probe.rows} rows, ` +
        `${probe.namedSearches}/${probe.searchCount} named search inputs, ` +
        `${probe.hiddenSvgs}/${probe.svgs} svg aria-hidden, screenshot ${png.length} bytes`,
    );
    return 0;
  });
}

async function measureWords(count) {
  return withPage({ words: makeWords(count) }, async (page, cdp) => {
    const started = Date.now();
    await waitFor(page, `document.querySelectorAll("main article").length > 0`, 25000);
    const firstRowMs = Date.now() - started;
    const snapshot = () =>
      evaluate(
        page,
        `(() => ({
          rows: document.querySelectorAll('main article').length,
          scrollHeight: Math.round(document.documentElement.scrollHeight),
          viewport: window.innerHeight,
        }))()`,
      );
    const initial = await snapshot();
    // Scroll to the bottom twice; an incremental list grows on each pass.
    for (let i = 0; i < 2; i += 1) {
      await evaluate(page, "window.scrollTo(0, document.documentElement.scrollHeight)");
      await new Promise((r) => setTimeout(r, 400));
    }
    const afterScroll = await snapshot();
    const hasShowAll = await evaluate(
      page,
      `[...document.querySelectorAll('button')].some((b) => /Hiện tất cả/.test(b.innerText))`,
    );
    if (hasShowAll) {
      await evaluate(
        page,
        `[...document.querySelectorAll('button')].find((b) => /Hiện tất cả/.test(b.innerText)).click()`,
      );
      await new Promise((r) => setTimeout(r, 600));
    }
    const afterShowAll = await snapshot();
    const shot = await page.send("Page.captureScreenshot", { format: "png" });
    console.log(
      JSON.stringify(
        {
          seeded: count,
          firstRowMs,
          initial,
          afterScroll,
          afterShowAll,
          hasShowAll,
          exceptions: cdp.exceptions.length,
          screenshotBytes: Buffer.from(shot.data, "base64").length,
        },
        null,
        2,
      ),
    );
    return cdp.exceptions.length ? 1 : 0;
  });
}

(async () => {
  const args = process.argv.slice(2);
  try {
    if (args.includes("--self-test")) process.exit(await selfTest());
    const measure = args.find((a) => a.startsWith("--measure-words"));
    if (measure) {
      const count = Number(measure.split("=")[1] || 5000);
      process.exit(await measureWords(count));
    }
    if (args.includes("--serve")) {
      const served = await serveStatic(POPUP_DIR);
      console.log(`serving ${POPUP_DIR} on http://127.0.0.1:${served.port}/index.html (ctrl-c to stop)`);
      return;
    }
    console.error("usage: browser_probe.js --self-test | --measure-words[=N] | --serve");
    process.exit(2);
  } catch (err) {
    console.error("FAIL browser probe:", err.message);
    process.exit(1);
  }
})();
