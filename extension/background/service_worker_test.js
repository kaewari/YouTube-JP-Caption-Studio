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
  const sessionStore = {};
  const localStore = {};
  let listener = null;
  let alarmListener = null;
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
      onAlarm: { addListener: (fn) => { alarmListener = fn; } },
    },
    storage: {
      local: {
        get: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.map((k) => [k, localStore[k]]));
        },
        set: async (patch) => { Object.assign(localStore, structuredClone(patch)); },
        remove: async (keys) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) delete localStore[k];
        },
      },
      session: {
        get: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.map((k) => [k, sessionStore[k]]));
        },
        set: async (patch) => { Object.assign(sessionStore, structuredClone(patch)); },
        remove: async (keys) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) delete sessionStore[k];
        },
      },
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
  // Test seam: the worker exports its pure helpers only when this flag is set.
  const seam = {};
  sandbox.__JP_CAP_SW_TEST__ = seam;
  sandbox.globalThis = sandbox;
  context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SW_PATH, "utf8"), context, { filename: SW_PATH });

  const send = (msg, sender = { id: "fixture-extension" }) =>
    new Promise((resolve) => {
      assert.ok(listener, "the service worker registered no message listener");
      listener(msg, sender, resolve);
    });

  return { fetches, tabMessages, send, chromeStub, sessionStore, localStore, seam,
    fireAlarm: (name) => alarmListener?.({ name }) };
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

  // 5. A failed bridge read must not drop the queued Drive mirror.
  {
    const sw = loadServiceWorker({
      route: (url) => (url.includes("127.0.0.1:8765")
        ? makeResponse({ status: 500, body: "bridge down" })
        : makeResponse({ status: 404, body: "" })),
    });
    sw.sessionStore.drivePendingMirror = ["vid-1"];
    // Drive is connected, so the mirror really tries to read the bridge.
    sw.localStore.driveConnected = true;
    await sw.fireAlarm("drive_upload_retry");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(
      sw.sessionStore.drivePendingMirror,
      ["vid-1"],
      "a bridge failure must keep the video in the Drive mirror queue",
    );
    console.log("PASS: a failed bridge read keeps the video queued for the Drive mirror");
  }

  // mergeVocabSnapshot: a Drive upload from the bridge must not destroy iPad data.
  {
    const sw = loadServiceWorker({ route: () => makeResponse({ status: 404, body: "" }) });
    const merge = sw.seam?.sw?.mergeVocabSnapshot;
    assert.equal(typeof merge, "function", "the worker must expose mergeVocabSnapshot to the test seam");

    // Drive already holds an iPad word with a gloss; the bridge only knows statuses.
    const remote = [
      { word: "猫", reading: "ねこ", meaning: "con mèo", jlptLevel: 5, frequencyCount: 812, status: "known", savedAt: "2026-10-01T00:00:00Z" },
      { word: "犬", reading: "いぬ", meaning: "con chó", jlptLevel: 5, frequencyCount: 640, status: "", savedAt: "2026-10-01T00:00:00Z" },
      { word: "鳥", reading: "とり", meaning: "con chim", jlptLevel: 4, frequencyCount: 500, status: "special", savedAt: "2026-10-01T00:00:00Z" },
    ];
    const incoming = [
      { word: "猫", reading: "", meaning: "", status: "ignored", jlptLevel: null, frequencyCount: 0, savedAt: "2026-10-22T00:00:00Z" },
      { word: "魚", reading: "", meaning: "", status: "learning", jlptLevel: null, frequencyCount: 0, savedAt: "2026-10-22T00:00:00Z" },
    ];
    const merged = merge(remote, incoming);
    const by = Object.fromEntries(merged.map((v) => [v.word, v]));

    assert.equal(by["猫"].status, "ignored", "the incoming status must win");
    assert.equal(by["猫"].meaning, "con mèo", "the iPad gloss must survive the upload");
    assert.equal(by["猫"].reading, "ねこ", "the iPad reading must survive");
    assert.equal(by["猫"].jlptLevel, 5, "the iPad JLPT level must survive");
    assert.equal(by["猫"].frequencyCount, 812, "the iPad frequency must survive");
    assert.equal(by["猫"].savedAt, "2026-10-22T00:00:00Z", "the incoming timestamp must win");

    assert.ok(by["犬"], "a word that exists only on the iPad must not be dropped");
    assert.equal(by["犬"].meaning, "con chó");
    assert.ok(by["鳥"], "an iPad-only word with a status must not be dropped");
    assert.equal(by["鳥"].status, "special");

    assert.equal(by["魚"].status, "learning", "a new desktop word must be added");
    assert.equal(merged.length, 4, "three remote words plus one new word");

    // Every input is preserved: a blind replace is what caused the data loss.
    const aWords = merge([], incoming).map((v) => v.word).sort();
    const bWords = ["猫", "魚"].sort();
    assert.equal(JSON.stringify(aWords), JSON.stringify(bWords),
      `an empty remote keeps every incoming word: ${JSON.stringify(aWords)} vs ${JSON.stringify(bWords)}`);
    const cWords = merge(remote, []).map((v) => v.word).sort();
    const dWords = ["猫", "犬", "鳥"].sort();
    assert.equal(JSON.stringify(cWords), JSON.stringify(dWords),
      `an empty incoming keeps every remote word: ${JSON.stringify(cWords)} vs ${JSON.stringify(dWords)}`);
    // The merge runs inside the vm realm, so compare its arrays by value, not by prototype.
    assert.equal(JSON.stringify(merge(undefined, undefined)), "[]", "missing arrays must not throw");

    console.log("PASS: the Drive upload merges vocab instead of replacing it");
  }

  // mergeIosVocab: the iPad's vocab-only file carries no status, so merge additively.
  {
    const sw = loadServiceWorker({ route: () => makeResponse({ status: 404, body: "" }) });
    const merge = sw.seam?.sw?.mergeIosVocab;
    assert.equal(typeof merge, "function", "the worker must expose mergeIosVocab to the test seam");

    const local = { "猫": "known", "犬": "ignored" };
    const entries = [
      { word: "猫", reading: "ねこ", meaning: "con mèo" },
      { word: "魚", reading: "さかな", meaning: "con cá" },
      { word: "   " },
      { word: "" },
      {},
      null,
    ];
    const { merged, added } = merge(local, entries);

    assert.equal(added, 1, "only the unknown word is added");
    assert.equal(merged["猫"], "known", "an existing local status must never be overwritten");
    assert.equal(merged["犬"], "ignored", "an untouched local word keeps its status");
    assert.equal(merged["魚"], "learning", "an iPad-only word starts at learning");
    assert.equal(Object.keys(merged).length, 3, "blank entries must not create keys");
    assert.equal(local["魚"], undefined, "the local map must not be mutated in place");

    const empty = merge(undefined, undefined);
    assert.equal(empty.added, 0, "a missing payload is not an error");
    assert.equal(JSON.stringify(empty.merged), "{}", "a missing local map starts empty");

    const fresh = merge({}, [{ word: " 空 " }]);
    assert.equal(fresh.merged["空"], "learning", "a word is trimmed before it is stored");

    const noop = merge({ "猫": "known" }, [{ word: "猫" }]);
    assert.equal(noop.added, 0, "a re-pull of a known word changes nothing");

    console.log("PASS: the iPad vocab file merges additively without overwriting local statuses");
  }

  console.log("ALL SERVICE WORKER TESTS PASSED!");
})().catch((err) => {
  console.error("SERVICE WORKER TESTS FAILED:", err);
  process.exit(1);
});
