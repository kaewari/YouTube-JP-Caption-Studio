/**
 * Runtime checks for the hardened service worker (P1 audit 2026-10-18).
 *
 * The real service_worker.js is executed inside a vm sandbox with stubbed
 * chrome / fetch globals, so the assertions below run production code paths
 * (no source-text matching):
 *   1. SP_CMD_PROXY forwards only allowlisted commands to a real tab id.
 *   2. YT_FETCH answers with the real HTTP status (a throttled 429 must not
 *      read like an empty 200).
 *   3. Every timedtext / bridge / watch-HTML fetch carries a timeout signal.
 *   4. The watch-HTML request only carries the cookies that decide login and
 *      consent state — not the whole .youtube.com jar.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SW_PATH = path.join(__dirname, "service_worker.js");
const BACKGROUND_DIR = __dirname;

function makeResponse({ status = 200, body = "", headers = {} } = {}) {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (lower.has(String(name).toLowerCase()) ? lower.get(String(name).toLowerCase()) : null) },
    async text() { return body; },
    async json() { return JSON.parse(body); },
  };
}

/**
 * @param {(url: string, options: object) => object} route decides the response
 */
function loadServiceWorker({ route, cookies = [] } = {}) {
  const fetches = [];
  const tabMessages = [];
  let listener = null;
  let context = null;

  const fetchImpl = async (url, options = {}) => {
    fetches.push({ url: String(url), options: options || {} });
    const response = route(String(url), options || {});
    if (response instanceof Error) throw response;
    return response;
  };

  const chromeStub = {
    runtime: {
      id: "fixture-extension",
      getURL: (p) => "chrome-extension://fixture-extension/" + p,
      getManifest: () => ({ version: "0.0.0-test" }),
      onMessage: { addListener: (fn) => { listener = fn; } },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      sendMessage: async () => undefined,
    },
    action: { onClicked: { addListener: () => {} } },
    commands: { onCommand: { addListener: () => {} } },
    alarms: {
      create: async () => {},
      get: async () => null,
      onAlarm: { addListener: () => {} },
    },
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    },
    tabs: {
      sendMessage: async (tabId, msg) => { tabMessages.push({ tabId, msg }); return { ok: true }; },
      get: async (tabId) => ({ id: tabId, windowId: 1, url: "https://www.youtube.com/watch?v=fixture" }),
      query: async () => [],
      create: async () => {},
      onUpdated: { addListener: () => {} },
      onActivated: { addListener: () => {} },
    },
    sidePanel: {
      setOptions: async () => {},
      setPanelBehavior: async () => {},
      open: async () => {},
      close: async () => {},
    },
    cookies: { getAll: async () => cookies },
    identity: {
      getAuthToken: async () => "",
      removeCachedAuthToken: async () => {},
      clearAllCachedAuthTokens: async () => {},
    },
    offscreen: {
      createDocument: async () => {},
      closeDocument: async () => {},
      hasDocument: async () => false,
    },
    tabCapture: { getMediaStreamId: async () => "fixture-stream" },
    storageOnChanged: null,
  };
  chromeStub.storage.onChanged = { addListener: () => {} };
  chromeStub.runtime.getContexts = async () => [];

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    TextEncoder,
    TextDecoder,
    Blob,
    FormData,
    Headers,
    crypto: globalThis.crypto,
    atob: (s) => Buffer.from(String(s), "base64").toString("binary"),
    btoa: (s) => Buffer.from(String(s), "binary").toString("base64"),
    fetch: fetchImpl,
    chrome: chromeStub,
    importScripts: (...files) => {
      for (const file of files) {
        const resolved = path.resolve(BACKGROUND_DIR, file);
        vm.runInContext(fs.readFileSync(resolved, "utf8"), context, { filename: resolved });
      }
    },
  };
  sandbox.globalThis = sandbox;
  context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SW_PATH, "utf8"), context, { filename: SW_PATH });

  const send = (msg, sender = { id: "fixture-extension" }) =>
    new Promise((resolve) => {
      assert.ok(listener, "the service worker registered no message listener");
      listener(msg, sender, resolve);
    });

  return { fetches, tabMessages, send, chromeStub };
}

const timedtextUrl = "https://www.youtube.com/api/timedtext?v=fixture&lang=ja&fmt=json3";

(async () => {
  // 1. SP_CMD_PROXY refuses a command outside the allowlist.
  {
    const sw = loadServiceWorker({ route: () => makeResponse({ status: 404, body: "" }) });
    const res = await sw.send({ type: "SP_CMD_PROXY", tabId: 7, cmd: "wipe_everything", payload: {} });
    assert.equal(res.ok, false, "an unknown command must be refused");
    assert.equal(res.error, "sp_cmd_denied");
    assert.equal(sw.tabMessages.length, 0, "a refused command must never reach a tab");
    console.log("PASS: SP_CMD_PROXY refuses a command outside the side panel allowlist");
  }

  // 2. SP_CMD_PROXY forwards an allowlisted command to the requested tab.
  {
    const sw = loadServiceWorker({ route: () => makeResponse({ status: 404, body: "" }) });
    const res = await sw.send({ type: "SP_CMD_PROXY", tabId: 7, cmd: "get_state" });
    assert.equal(res.ok, true);
    assert.equal(sw.tabMessages.length, 1);
    assert.equal(sw.tabMessages[0].tabId, 7);
    assert.equal(sw.tabMessages[0].msg.type, "SP_CMD");
    assert.equal(sw.tabMessages[0].msg.cmd, "get_state");
    console.log("PASS: SP_CMD_PROXY forwards an allowlisted command to the requested tab");
  }

  // 3. A bogus tab id is refused as well.
  {
    const sw = loadServiceWorker({ route: () => makeResponse({ status: 404, body: "" }) });
    const res = await sw.send({ type: "SP_CMD_PROXY", tabId: "not-a-tab", cmd: "get_state" });
    assert.equal(res.ok, false);
    assert.equal(res.error, "sp_cmd_denied");
    assert.equal(sw.tabMessages.length, 0);
    console.log("PASS: SP_CMD_PROXY refuses a non numeric tab id");
  }

  // 4. YT_FETCH reports the real throttling status instead of a fabricated 200.
  {
    const sw = loadServiceWorker({
      route: (url) => (url.includes("/api/timedtext")
        ? makeResponse({ status: 429, body: "rate limited" })
        : makeResponse({ status: 404, body: "" })),
    });
    const res = await sw.send({ type: "YT_FETCH", url: timedtextUrl });
    assert.equal(res.ok, false);
    assert.equal(res.status, 429, "a throttled timedtext fetch must report HTTP 429");
    assert.equal(res.text, "");
    console.log("PASS: YT_FETCH reports the real HTTP status (429), not a fabricated 200/0");
  }

  // 5. YT_FETCH returns the body with status 200 on success.
  {
    const body = JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "こんにちは" }] }] });
    const sw = loadServiceWorker({
      route: (url) => (url.includes("/api/timedtext")
        ? makeResponse({ status: 200, body })
        : makeResponse({ status: 404, body: "" })),
    });
    const res = await sw.send({ type: "YT_FETCH", url: timedtextUrl });
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("こんにちは"), "the timedtext body must be returned");
    console.log("PASS: YT_FETCH returns the caption body with HTTP 200");
  }

  // 6. Every timedtext fetch carries a timeout signal.
  {
    const sw = loadServiceWorker({
      route: (url) => (url.includes("/api/timedtext")
        ? makeResponse({ status: 200, body: "{}" })
        : makeResponse({ status: 404, body: "" })),
    });
    await sw.send({ type: "YT_FETCH", url: timedtextUrl });
    const timedtextCalls = sw.fetches.filter((f) => f.url.includes("/api/timedtext"));
    assert.ok(timedtextCalls.length > 0, "the timedtext request must have been made");
    for (const call of timedtextCalls) {
      assert.ok(call.options.signal, "a timedtext fetch without a timeout signal can hang the worker");
      assert.ok(call.options.signal instanceof AbortSignal, "the timeout signal must be an AbortSignal");
      assert.equal(call.options.signal.aborted, false);
    }
    console.log("PASS: timedtext fetches carry an AbortSignal timeout");
  }

  // 7. A bridge fetch carries a timeout signal too.
  {
    const sw = loadServiceWorker({ route: () => makeResponse({ status: 404, body: "" }) });
    const res = await sw.send({
      type: "BRIDGE_FETCH",
      path: "/health",
      method: "GET",
    }, { id: "fixture-extension", tab: { id: 3, url: "https://www.youtube.com/watch?v=fixture" } });
    assert.equal(res.ok, false);
    const bridgeCalls = sw.fetches.filter((f) => f.url.includes("127.0.0.1:8765"));
    assert.ok(bridgeCalls.length > 0, "the bridge request must have been made");
    for (const call of bridgeCalls) {
      assert.ok(call.options.signal, "a bridge fetch without a timeout signal can hang the worker");
      assert.ok(call.options.signal instanceof AbortSignal);
    }
    console.log("PASS: bridge fetches carry an AbortSignal timeout");
  }

  // 8. The watch-HTML request only carries the cookies that matter.
  {
    const cookieJar = [
      { name: "SAPISID", value: "keep-sapisid" },
      { name: "CONSENT", value: "keep-consent" },
      { name: "VISITOR_INFO1", value: "keep-visitor" },
      { name: "VISITOR_INFO1_LIVE", value: "keep-visitor-live" },
      { name: "LOGIN_INFO", value: "drop-login" },
      { name: "PREF", value: "drop-pref" },
      { name: "YSC", value: "drop-ysc" },
    ];
    const sw = loadServiceWorker({
      route: (url) => (url.includes("/watch?v=")
        ? makeResponse({ status: 200, body: "<html></html>" })
        : url.includes("youtubei/v1/player")
          ? makeResponse({ status: 200, body: JSON.stringify({ captions: {} }) })
          : makeResponse({ status: 404, body: "" })),
      cookies: cookieJar,
    });
    await sw.send({ type: "YT_LOAD_CAPTIONS", videoId: "fixture", lang: "ja" });
    const watchCalls = sw.fetches.filter((f) => f.url.includes("/watch?v="));
    assert.ok(watchCalls.length > 0, "the watch-HTML request must have been made");
    const cookieHeader = watchCalls[0].options.headers?.Cookie || "";
    assert.ok(cookieHeader.includes("SAPISID=keep-sapisid"), "the login cookie must be sent");
    assert.ok(cookieHeader.includes("CONSENT=keep-consent"), "the consent cookie must be sent");
    assert.ok(cookieHeader.includes("VISITOR_INFO1=keep-visitor"), "the visitor cookie must be sent");
    assert.ok(!cookieHeader.includes("LOGIN_INFO"), "an unrelated login cookie must not be sent");
    assert.ok(!cookieHeader.includes("PREF"), "the tracking cookie PREF must not be sent");
    assert.ok(!cookieHeader.includes("YSC"), "the tracking cookie YSC must not be sent");
    console.log("PASS: the watch-HTML request only carries the SAPISID/CONSENT/VISITOR_INFO cookies");
  }

  console.log("ALL SERVICE WORKER TESTS PASSED!");
})().catch((err) => {
  console.error("SERVICE WORKER TESTS FAILED:", err);
  process.exit(1);
});
