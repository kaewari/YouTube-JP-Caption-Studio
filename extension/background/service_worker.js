importScripts("../shared/timedtext_parse.js");

const BRIDGE = "http://127.0.0.1:8765";
/** Optional Native Messaging fallback only — primary IME path is bridge POST /ime/switch. */
const IME_NATIVE_HOST = "com.ytcaption.ime_switch";

const POLL_BRIDGE_ALARM = "poll_bridge_state";
const DRIVE_UPLOAD_ALARM = "drive_upload_retry";
const DRIVE_PENDING_MIRROR_KEY = "drivePendingMirror";

async function ensureBridgePollAlarm() {
  try {
    if (!chrome.alarms?.create) return;
    const existing = await chrome.alarms.get(POLL_BRIDGE_ALARM);
    if (!existing) {
      await chrome.alarms.create(POLL_BRIDGE_ALARM, { periodInMinutes: 1 });
    }
  } catch (_) {}
}

async function ensureDriveUploadAlarm() {
  try {
    if (!chrome.alarms?.create) return;
    const existing = await chrome.alarms.get(DRIVE_UPLOAD_ALARM);
    if (!existing) {
      await chrome.alarms.create(DRIVE_UPLOAD_ALARM, { periodInMinutes: 1 });
    }
  } catch (_) {}
}

/** Icon click opens side panel; Saved Items popup accessible via side panel. */
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (_) {}
  await ensureBridgePollAlarm();
  await ensureDriveUploadAlarm();
});

chrome.runtime.onStartup?.addListener?.(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (_) {}
  await ensureBridgePollAlarm();
  await ensureDriveUploadAlarm();
});

/** Site families the extension supports (content scripts + side panel gate). */
function platformFromUrl(url) {
  try {
    const u = new URL(url || "");
    const h = u.hostname;
    if (h === "www.youtube.com" || h === "youtube.com") return "youtube";
    if (h === "abema.tv" || h.endsWith(".abema.tv")) return "abema";
    if (h === "www.netflix.com" || h === "netflix.com" || h.endsWith(".netflix.com")) return "netflix";
    if (u.protocol === "http:" || u.protocol === "https:") return "web";
    return null;
  } catch (_) {
    return null;
  }
}

function isSupportedUrl(url) {
  const p = platformFromUrl(url);
  return p === "youtube" || p === "abema" || p === "netflix";
}

async function isPlatformEnabledForUrl(url) {
  const plat = platformFromUrl(url);
  if (!plat) return false;
  try {
    const data = await chrome.storage.local.get("hardsubSettings");
    const ep = data?.hardsubSettings?.enabledPlatforms || {
      youtube: true,
      netflix: true,
      abema: true,
      web: true,
    };
    return ep[plat] !== false;
  } catch (_) {
    return true;
  }
}

/** Enable side panel only on supported sites; disable (+ close) everywhere else. */
async function syncSidePanelForTab(tabId, url) {
  if (tabId == null) return;
  const enabledByPlat = await isPlatformEnabledForUrl(url);
  const onSupported = isSupportedUrl(url) && enabledByPlat;
  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel/sidepanel.html",
      enabled: onSupported,
    });
  } catch (_) {}
  if (!onSupported) {
    try {
      await closeSidePanel(tabId);
    } catch (_) {}
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, _info, tab) => {
  if (!tab.url) return;
  await syncSidePanelForTab(tabId, tab.url);
});

// onUpdated misses plain tab switches — close panel when leaving YouTube.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await syncSidePanelForTab(tabId, tab?.url);
  } catch (_) {}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "BRIDGE_FETCH") {
    handleBridgeFetch(msg, sender).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, error: String(err) })
    );
    return true;
  }
  if (msg?.type === "YT_FETCH") {
    handleYtFetch(msg).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, error: String(err) })
    );
    return true;
  }
  if (msg?.type === "YT_LOAD_CAPTIONS") {
    handleYtLoadCaptions(msg).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, reason: "exception", error: String(err), cues: [] })
    );
    return true;
  }
  if (msg?.type === "IME_SWITCH") {
    handleImeSwitch(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "SP_CMD_PROXY") {
    const tabId = msg.tabId;
    chrome.tabs
      .sendMessage(tabId, { type: "SP_CMD", cmd: msg.cmd, ...(msg.payload || {}) })
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "CONTENT_GET_TAB_ID") {
    sendResponse({ tabId: sender?.tab?.id ?? null });
    return false;
  }
  if (msg?.type === "OPEN_SIDE_PANEL") {
    const tabId = sender?.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: "no_tab" });
      return false;
    }
    chrome.sidePanel
      .open({ tabId })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "CLOSE_SIDE_PANEL") {
    const tabId = sender?.tab?.id ?? msg.tabId;
    closeSidePanel(tabId)
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "DRIVE_CONNECT") {
    connectDrive()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (msg?.type === "DRIVE_PULL") {
    pullDriveIfNewer()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (msg?.type === "DRIVE_UPLOAD_SCHEDULE") {
    scheduleDriveUpload(msg.videoId);
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "DRIVE_MIRROR_DOWN") {
    driveQueued(() => mirrorFromDrive(msg.videoIds, { maxAgeMs: msg.maxAgeMs }))
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (msg?.type === "DRIVE_UPLOAD_NOW") {
    uploadDriveNow()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (msg?.type === "DRIVE_STATUS") {
    getDriveStatus()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
});

/**
 * Close extension side panel for a tab.
 * Prefer chrome.sidePanel.close (Chrome 141+); fallback: ask panel to window.close().
 */
async function closeSidePanel(tabId) {
  if (tabId == null) return { ok: false, error: "no_tab" };
  if (typeof chrome.sidePanel?.close === "function") {
    try {
      await chrome.sidePanel.close({ tabId });
      return { ok: true, via: "api" };
    } catch (_) {
      /* fall through */
    }
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.windowId != null) {
        await chrome.sidePanel.close({ windowId: tab.windowId });
        return { ok: true, via: "api_window" };
      }
    } catch (_) {
      /* fall through */
    }
  }
  try {
    await chrome.runtime.sendMessage({ type: "SP_CLOSE" });
    return { ok: true, via: "message" };
  } catch (_) {
    return { ok: false, error: "close_failed" };
  }
}

/**
 * Best-effort OS IME: local bridge first (no install.sh), then optional native host.
 * Bridge offline / missing helper → { ok:false } (side panel keeps web lang=ja-JP only).
 * @param {{ cmd?: string }} msg
 */
async function handleImeSwitch(msg) {
  const cmd = String(msg?.cmd || "").trim().toLowerCase();
  if (cmd !== "activate" && cmd !== "deactivate" && cmd !== "status") {
    return { ok: false, error: "bad_cmd" };
  }

  const bridge = await imeViaBridge(cmd);
  if (bridge?.ok) return bridge;

  return imeViaNative(cmd);
}

/** @param {string} cmd */
async function imeViaBridge(cmd) {
  try {
    if (cmd === "status") {
      const res = await fetch(`${BRIDGE}/ime/status`);
      if (!res.ok) return { ok: false, error: `http_${res.status}`, missing: true };
      const data = await res.json();
      return data && typeof data === "object" ? data : { ok: false, error: "bad_json" };
    }
    const to = cmd === "activate" ? "ja" : "restore";
    const res = await fetch(`${BRIDGE}/ime/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}`, missing: true };
    const data = await res.json();
    return data && typeof data === "object" ? data : { ok: false, error: "bad_json" };
  } catch (_) {
    return { ok: false, error: "bridge_offline", missing: true };
  }
}

/** @param {string} cmd */
async function imeViaNative(cmd) {
  if (typeof chrome.runtime.sendNativeMessage !== "function") {
    return { ok: false, error: "no_native_messaging", missing: true };
  }
  try {
    const res = await chrome.runtime.sendNativeMessage(IME_NATIVE_HOST, { cmd });
    if (res && typeof res === "object") return res;
    return { ok: false, error: "empty_native_response", missing: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), missing: true };
  }
}

try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} catch (_) {}

/** Mirror chrome.storage → bridge so localhost:3000 Saved Items can poll. */
let _applyingBridgeState = false;
let _pushTimer = null;
let _lastPushedJson = "";
let _lastBridgeUpdatedAt = 0;

async function loadSwState() {
  try {
    const storage = chrome.storage.session || chrome.storage.local;
    const res = await storage.get(["_lastBridgeUpdatedAt", "_lastPushedJson"]);
    if (res._lastBridgeUpdatedAt) _lastBridgeUpdatedAt = Number(res._lastBridgeUpdatedAt) || 0;
    if (res._lastPushedJson) _lastPushedJson = String(res._lastPushedJson) || "";
  } catch (_) {}
}

async function saveSwState() {
  try {
    const storage = chrome.storage.session || chrome.storage.local;
    await storage.set({
      _lastBridgeUpdatedAt,
      _lastPushedJson,
    });
  } catch (_) {}
}

function schedulePushExtensionState() {
  if (_applyingBridgeState) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    void pushExtensionStateToBridge();
  }, 200);
}

async function pushExtensionStateToBridge() {
  if (_applyingBridgeState) return;
  try {
    const data = await chrome.storage.local.get(["userVocab", "hardsubSettings"]);
    const body = {};
    // Never push a missing key over a non-empty bridge — an empty/fresh local
    // store must not wipe the bridge's vocab copy (see pull-first at startup).
    if (data.userVocab && typeof data.userVocab === "object") {
      body.userVocab = data.userVocab;
    }
    if (data.hardsubSettings && typeof data.hardsubSettings === "object") {
      body.hardsubSettings = data.hardsubSettings;
    }
    body.source = "extension";
    const j = JSON.stringify(body);
    if (j === _lastPushedJson) return;
    const res = await fetch(`${BRIDGE}/extension_state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      _lastPushedJson = j;
      try {
        const out = await res.json();
        if (out?.updatedAt) _lastBridgeUpdatedAt = Number(out.updatedAt) || _lastBridgeUpdatedAt;
      } catch (_) {}
      await saveSwState();
    }
  } catch (_) {
    /* bridge offline */
  }
}

async function pullExtensionStateFromBridge() {
  try {
    const res = await fetch(`${BRIDGE}/extension_state`);
    if (!res.ok) return;
    const remote = await res.json();
    const updatedAt = Number(remote?.updatedAt) || 0;
    if (!updatedAt || updatedAt <= _lastBridgeUpdatedAt) return;
    // Only apply writes that originated outside this extension push loop.
    if (remote.source === "extension" && updatedAt <= _lastBridgeUpdatedAt + 0.05) {
      _lastBridgeUpdatedAt = updatedAt;
      await saveSwState();
      return;
    }
    const patch = {};
    if (remote.userVocab && typeof remote.userVocab === "object") {
      patch.userVocab = remote.userVocab;
    }
    if (remote.hardsubSettings && typeof remote.hardsubSettings === "object") {
      patch.hardsubSettings = remote.hardsubSettings;
    }
    if (!Object.keys(patch).length) {
      _lastBridgeUpdatedAt = updatedAt;
      await saveSwState();
      return;
    }
    const local = await chrome.storage.local.get(["userVocab", "hardsubSettings"]);
    const sameVocab =
      JSON.stringify(local.userVocab || {}) === JSON.stringify(patch.userVocab || local.userVocab || {});
    const sameSettings =
      !patch.hardsubSettings ||
      JSON.stringify(local.hardsubSettings || {}) === JSON.stringify(patch.hardsubSettings);
    if (sameVocab && sameSettings) {
      _lastBridgeUpdatedAt = updatedAt;
      await saveSwState();
      return;
    }
    _applyingBridgeState = true;
    try {
      await chrome.storage.local.set(patch);
      _lastPushedJson = JSON.stringify({
        ...patch,
        source: "extension",
      });
      _lastBridgeUpdatedAt = updatedAt;
      await saveSwState();
    } finally {
      _applyingBridgeState = false;
    }
  } catch (_) {
    /* bridge offline */
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.userVocab || changes.hardsubSettings) {
    schedulePushExtensionState();
  }
  if (changes.userVocab && !_applyingBridgeState) {
    scheduleVocabDrivePush();
  }
  if (
    !_applyingSettings &&
    (changes.hardsubSettings ||
      changes.followTimeline ||
      changes.isDarkTheme ||
      changes.sidePanelFontScale)
  ) {
    scheduleSettingsDrivePush();
  }
  if (changes.hardsubSettings) {
    chrome.tabs?.query?.({}).then((tabs) => {
      for (const tab of tabs || []) {
        if (tab.id != null && tab.url) {
          void syncSidePanelForTab(tab.id, tab.url);
        }
      }
    }).catch(() => {});
  }
});

// Top-level alarm listener (MV3: must register synchronously so SW wakes on alarm).
if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === POLL_BRIDGE_ALARM) {
      void pullExtensionStateFromBridge();
    } else if (alarm?.name === DRIVE_UPLOAD_ALARM) {
      // Crash-recovery path: SW was killed before the setTimeout fired.
      // Read pending IDs from session storage (in-memory Set was lost).
      const storage = chrome.storage.session || chrome.storage.local;
      storage.get([DRIVE_PENDING_MIRROR_KEY]).then((r) => {
        const ids = r[DRIVE_PENDING_MIRROR_KEY] || [];
        if (!ids.length) return;
        storage.remove([DRIVE_PENDING_MIRROR_KEY]).catch(() => {});
        void driveQueued(() => mirrorToDrive(ids));
      }).catch(() => {});
    }
  });
}

void ensureBridgePollAlarm();

void loadSwState().then(() => {
  // Pull before push: if local storage is empty/stale, the bridge copy (or the
  // one the popup/other devices pushed) restores it — a fresh SW must never
  // overwrite non-empty bridge state with an empty local map.
  void pullExtensionStateFromBridge().finally(() => {
    void pushExtensionStateToBridge();
  });
});

// Only endpoints the extension actually calls may go through this proxy — a
// content-script bug must never reach delete/import/IME/backup routes.
const BRIDGE_ALLOWLIST = [
  { re: /^\/health$/, methods: ["GET"] },
  { re: /^\/log$/, methods: ["POST"] },
  { re: /^\/bootstrap$/, methods: ["POST"] },
  { re: /^\/tokenize$/, methods: ["POST"] },
  { re: /^\/tokenize_batch$/, methods: ["POST"] },
  { re: /^\/dict$/, methods: ["POST"] },
  { re: /^\/scripts\/save$/, methods: ["POST"] },
  { re: /^\/scripts\/[A-Za-z0-9_-]{4,64}\/(meta|tokens)$/, methods: ["GET"] },
  { re: /^\/scripts\/[A-Za-z0-9_-]{4,64}$/, methods: ["GET", "DELETE"] },
  // Caption fallback tier; path arrives with its query string attached.
  { re: /^\/captions\/[A-Za-z0-9_-]{4,64}(\?[A-Za-z0-9_=&-]*)?$/, methods: ["GET"] },
];

// DoS guards for BRIDGE_FETCH — per-tab rate limit + body size cap.
const BRIDGE_FETCH_BODY_CAP = 256 * 1024; // 256 KB
const BRIDGE_FETCH_RATE_LIMIT = 50; // max requests per tab per second
const _bridgeRateBuckets = new Map(); // tabId → { count, resetAt }
function _bridgeRateCheck(tabId) {
  const now = Date.now();
  const key = tabId || 0;
  let bucket = _bridgeRateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 1000 };
    _bridgeRateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > BRIDGE_FETCH_RATE_LIMIT) {
    console.debug("bridge.fetch rate limited", { tabId: key, count: bucket.count });
    return false;
  }
  return true;
}

async function handleBridgeFetch(msg, sender) {
  const { path, method = "GET", body, isForm } = msg;
  const rule = BRIDGE_ALLOWLIST.find(
    (r) => r.re.test(path) && r.methods.includes(method),
  );
  if (!rule) return { ok: false, error: "bridge_path_denied" };
  // Per-tab rate limit.
  const tabId = sender?.tab?.id || 0;
  if (!_bridgeRateCheck(tabId)) {
    return { ok: false, error: "bridge_rate_limited" };
  }
  const url = `${BRIDGE}${path}`;
  const opts = { method };
  if (isForm && body) {
    const blob = dataUrlToBlob(body.imageBase64);
    const fd = new FormData();
    fd.append("image", blob, "roi.webp");
    fd.append("meta", body.meta);
    opts.body = fd;
  } else if (body) {
    const serialized = JSON.stringify(body);
    if (new TextEncoder().encode(serialized).length > BRIDGE_FETCH_BODY_CAP) {
      return { ok: false, error: "bridge_body_too_large" };
    }
    opts.headers = { "Content-Type": "application/json" };
    opts.body = serialized;
  }
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.debug("bridge.fetch error", { path, error: String(err) });
    return { ok: false, error: "bridge_fetch_error" };
  }
}

async function handleYtFetch(msg) {
  let url = normalizeTimedtextUrl(msg.url || "");
  if (!url.startsWith("https://www.youtube.com/api/timedtext")) {
    return { ok: false, error: "bad_url" };
  }
  const text = await fetchTimedtextBody(url);
  return { ok: !!text, status: text ? 200 : 0, text: text || "" };
}

function normalizeTimedtextUrl(url) {
  let u = String(url || "").trim();
  if (u.startsWith("//")) u = `https:${u}`;
  return u;
}

function buildTimedtextUrlVariants(baseUrl) {
  const raw = normalizeTimedtextUrl(baseUrl);
  if (!raw) return [];
  const variants = [];
  const add = (u) => {
    if (u && !variants.includes(u)) variants.push(u);
  };
  add(raw);
  // ponytail: two fmt variants max — more variants multiplied burst requests and
  // tripped YouTube's per-IP throttle; re-add srv3/stripped only if a format gap shows up.
  if (!raw.includes("fmt=json3")) {
    const json3 = raw.includes("fmt=")
      ? raw.replace(/([?&])fmt=[^&]+/, "$1fmt=json3")
      : `${raw}${raw.includes("?") ? "&" : "?"}fmt=json3`;
    add(json3);
  }
  return variants;
}

/** Cookie header once per load (not per timedtext URL). */
async function getYtCookieHeader() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: ".youtube.com" });
    if (cookies?.length) {
      return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  } catch (_) {}
  return "";
}

/**
 * Caption load cascade (adapted from YSD side-panel pattern):
 * 1) page-provided timedtext baseUrl (content intercepted / player track)
 * 2) scrape watch HTML → ytInitialPlayerResponse.captionTracks
 * 3) ANDROID Innertube player → captionTracks
 * Prefer fmt=json3; parse XML text/p or json3.
 * Source timeline = ja track only; en and vi packs go to enCues/viCues — never into cues.
 */
/** Negative cache: a just-throttled video returns instantly instead of re-bursting. */
const TT_MISS_TTL_MS = 60_000;
async function getTtMiss(videoId) {
  try {
    const storage = chrome.storage.session || chrome.storage.local;
    const r = await storage.get([`ttMiss:${videoId}`]);
    const at = Number(r[`ttMiss:${videoId}`]) || 0;
    return at && Date.now() - at < TT_MISS_TTL_MS ? at : 0;
  } catch (_) {
    return 0;
  }
}
async function setTtMiss(videoId) {
  try {
    const storage = chrome.storage.session || chrome.storage.local;
    await storage.set({ [`ttMiss:${videoId}`]: Date.now() });
  } catch (_) {}
}

async function handleYtLoadCaptions(msg) {
  const videoId = String(msg.videoId || "").trim();
  const preferLang = String(msg.lang || "ja").toLowerCase();
  if (!videoId) {
    return { ok: false, reason: "no_video_id", cues: [], hasEn: false, hasVi: false };
  }

  // Explicit user action (Reload button) bypasses the negative cache.
  if (!msg.force && (await getTtMiss(videoId))) {
    return {
      ok: false,
      reason: "throttled_recently",
      lastError: "http_429_cached",
      cues: [],
      trackCount: 0,
      via: "all_failed",
      hasEn: false,
      hasVi: false,
    };
  }

  const cookieHeader = await getYtCookieHeader();

  /** @type {{ url: string, lang: string, asr: boolean, via: string }[]} */
  const candidates = [];
  const seen = new Set();
  const lastError = { reason: "" };

  const pushUrl = (url, lang, asr, via) => {
    const key = normalizeTimedtextUrl(url);
    if (!key || !key.includes("/api/timedtext")) return;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      url: key,
      lang: lang || "",
      asr: !!asr,
      via,
    });
  };

  if (msg.baseUrl) {
    // URL lang is truth; msg.lang may be preferLang and mis-tag a VI intercept as ja.
    const urlLang = langFromTimedtextUrl(msg.baseUrl) || msg.lang || preferLang;
    pushUrl(msg.baseUrl, urlLang, !!msg.asr, "page_link");
  }

  // Prefer ANDROID timedtext URLs first — WEB watch HTML baseUrls often 200+empty.
  const [androidTracks, webTracks] = await Promise.all([
    fetchAndroidCaptionTracks(videoId).catch(() => []),
    fetchWebCaptionTracks(videoId, cookieHeader).catch(() => []),
  ]);
  for (const t of sortTracks(androidTracks, preferLang)) {
    pushUrl(t.baseUrl, t.languageCode || "", t.kind === "asr", "android");
  }
  for (const t of sortTracks(webTracks, preferLang)) {
    pushUrl(t.baseUrl, t.languageCode || "", t.kind === "asr", "watch_html");
  }
  // Legacy unsigned URLs last resort — still served anonymously even when
  // signed track URLs come back empty.
  for (const [lang, asr] of [["ja", true], ["en", true], ["vi", false]]) {
    pushUrl(
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${lang}&fmt=json3`,
      lang,
      asr,
      "direct",
    );
  }

  const hasEn = candidates.some((c) => matchLangFamily(c.lang, "en"));
  const hasVi = candidates.some((c) => matchLangFamily(c.lang, "vi"));

  if (!candidates.length) {
    return { ok: false, reason: "no_tracks", cues: [], via: "none", hasEn, hasVi };
  }

  // Best track per lang family (manual before ASR), fetched in parallel.
  const [jaPack, enPack, viPack] = await Promise.all([
    fetchBestLangPack(candidates, "ja", lastError),
    fetchBestLangPack(candidates, "en", lastError),
    fetchBestLangPack(candidates, "vi", lastError),
  ]);

  const secondary = {
    ...(enPack?.cues?.length ? { enCues: enPack.cues } : {}),
    ...(viPack?.cues?.length ? { viCues: viPack.cues } : {}),
  };

  if (jaPack?.cues?.length) {
    return {
      ok: true,
      status: "ok",
      count: jaPack.cues.length,
      cues: jaPack.cues,
      lang: jaPack.lang || "ja",
      asr: jaPack.asr,
      via: jaPack.via,
      hasEn,
      hasVi,
      ...secondary,
    };
  }

  // No JA: keep en/vi in secondary columns only — never put them into source cues.
  if (enPack?.cues?.length || viPack?.cues?.length) {
    return {
      ok: true,
      status: "ok",
      count: 0,
      cues: [],
      lang: "ja",
      asr: false,
      via: "secondary_only",
      hasEn,
      hasVi,
      ...secondary,
    };
  }

  // Throttle miss → remember briefly so Reload/navigate doesn't re-burst.
  if (isThrottleError(lastError)) await setTtMiss(videoId);
  return {
    ok: false,
    reason: "timedtext_empty",
    lastError: lastError.reason || "",
    cues: [],
    trackCount: candidates.length,
    via: "all_failed",
    hasEn,
    hasVi,
  };
}

function langFromTimedtextUrl(url) {
  try {
    return new URL(String(url)).searchParams.get("lang") || "";
  } catch {
    return "";
  }
}

async function fetchWebCaptionTracks(videoId, cookieHeader = "") {
  const headers = {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "ja,en;q=0.9",
  };
  if (cookieHeader) headers.Cookie = cookieHeader;

  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return [];
  const html = await res.text();
  const pr = extractYtInitialPlayerResponse(html);
  return pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
}

function extractYtInitialPlayerResponse(html) {
  const marker = "ytInitialPlayerResponse";
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const eq = html.indexOf("=", idx);
  if (eq < 0) return null;
  return parseJsonObjectAt(html, eq + 1);
}

function parseJsonObjectAt(text, start) {
  let i = start;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (text[i] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < text.length; j += 1) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function fetchAndroidCaptionTracks(videoId) {
  const clients = [
    { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30 },
    { clientName: "ANDROID", clientVersion: "19.44.38", androidSdkVersion: 30 },
    { clientName: "IOS", clientVersion: "19.45.4", deviceModel: "iPhone14,5" },
  ];
  for (const client of clients) {
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { client: { ...client, hl: "ja", gl: "JP" } },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length) return tracks;
    } catch (_) {
      /* try next */
    }
  }
  return [];
}

/** Lang family aliases: normalized base code → 2-letter family. */
const LANG_FAMILY_ALIASES = {
  ja: ["ja", "jpn", "jp"],
  en: ["en", "eng"],
  vi: ["vi", "vie", "viet", "vn"],
};

/**
 * Match a track lang code (vi, vi-VN, vie, VI, vi_vn, en-US…) to a family
 * (ja / en / vi). Normalizes case + separators; falls back to 3-letter aliases.
 */
function matchLangFamily(lang, family) {
  const raw = String(lang || "")
    .toLowerCase()
    .replace(/_/g, "-")
    .trim();
  if (!raw) return false;
  const base = raw.split("-")[0];
  const aliases = LANG_FAMILY_ALIASES[family] || [];
  if (aliases.includes(raw) || aliases.includes(base)) return true;
  // Compound like "vi-vn" or "en-us": base match covers it above; keep the
  // family-prefix fallback for exotic forms like "vietnamese-vi".
  return raw.startsWith(family + "-");
}

function sortTracks(tracks, preferLang) {
  return [...(tracks || [])].sort(
    (a, b) => scoreTrack(b, preferLang) - scoreTrack(a, preferLang)
  );
}

function scoreTrack(track, preferLang) {
  const lang = String(track.languageCode || "").toLowerCase();
  const prefer = String(preferLang || "ja").toLowerCase();
  const asr = track.kind === "asr";
  let s = 0;
  if (prefer === "auto") {
    if (matchLangFamily(lang, "ja")) s += 90;
    else if (matchLangFamily(lang, "en")) s += 40;
  } else if (matchLangFamily(lang, prefer)) {
    s += 100;
  } else if (matchLangFamily(lang, "ja")) {
    s += 70;
  }
  if (!asr) s += 25;
  return s;
}

/**
 * Best timedtext for a lang prefix (ja / en / vi) from candidates.
 * Manual preferred over ASR. Returns { cues, lang, asr, via } or null.
 * (Do not put lang globs like en-star in block comments — breaks the SW parse.)
 */
async function fetchBestLangPack(candidates, prefix, lastError = null) {
  const ranked = (candidates || [])
    .filter((x) => x && matchLangFamily(x.lang, prefix))
    .sort((a, b) => {
      const sa = (matchLangFamily(a.lang, prefix) ? 100 : 0) + (a.asr ? 0 : 25);
      const sb = (matchLangFamily(b.lang, prefix) ? 100 : 0) + (b.asr ? 0 : 25);
      return sb - sa;
    });
  for (const x of ranked) {
    // Throttled (429/502) is per-IP: further attempts cannot succeed this load.
    if (isThrottleError(lastError)) return null;
    const body = await fetchTimedtextBody(x.url, lastError);
    if (!body) continue;
    const cues = parseTimedtextBody(body);
    if (cues.length) {
      return { cues, lang: x.lang || prefix, asr: !!x.asr, via: x.via || "track" };
    }
  }
  return null;
}

/** YouTube throttles bursts per-IP — stop fanning out once flagged. */
function isThrottleError(lastError) {
  return !!lastError && /http_(429|502|503)/.test(String(lastError.reason || ""));
}

/**
 * Fetch one timedtext URL. Anonymous first (credentials: omit) — signed baseUrls
 * issued to an anonymous innertube call get rejected (200 + empty) when replayed
 * with the user's Google cookies; cookie session only retried when omit came back
 * empty (member/age-gated tracks). Keeps the per-load request fan-out small so
 * YouTube's per-IP throttle never trips.
 */
async function fetchTimedtextBody(baseUrl, lastError = null) {
  if (!baseUrl) return "";
  const urls = buildTimedtextUrlVariants(baseUrl);
  for (const cred of ["omit", "include"]) {
    for (const url of urls) {
      if (!url.startsWith("https://www.youtube.com/api/timedtext")) continue;
      try {
        const headers = {
          Accept: "*/*",
          Referer: "https://www.youtube.com/",
        };
        const res = await fetch(url, { headers, credentials: cred, cache: "no-store" });
        if (!res.ok) {
          if (lastError && res.status >= 400) {
            lastError.reason = `http_${res.status}_${cred}`;
          }
          // 429/502 = per-IP throttle; retrying other variants cannot succeed.
          if (res.status === 429 || res.status === 502 || res.status === 503) return "";
          continue;
        }
        const text = await res.text();
        if (!text) {
          if (lastError) lastError.reason = `empty_${cred}`;
          continue;
        }
        const trimmed = text.trim();
        if (trimmed[0] === "{" || trimmed[0] === "<") return text;
        if (lastError) {
          lastError.reason = `html_like_${trimmed.slice(0, 24).replace(/\s+/g, " ")}_${cred}`;
        }
      } catch (err) {
        if (lastError) lastError.reason = `fetch_err ${String(err).slice(0, 60)}`;
      }
    }
  }
  return "";
}

const decodeEntities = (s) => HardsubTimedtextParse.decodeEntities(s);
const parseJson3 = (data) => HardsubTimedtextParse.parseJson3Cues(data);
const parseTimedtextXml = (xml) => HardsubTimedtextParse.parseTimedtextXml(xml);
const parseTimedtextBody = (body) => HardsubTimedtextParse.parseTimedtextBody(body);

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)[1];
  const bin = atob(parts[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// --- Drive sync: vocab in caption-studio-backup.json, scripts as <videoId>/ folders ---
const DRIVE_FOLDER_ID = "1K8LPtKici0gVaq5FuTMDmYDWzPpBokFA";
const DRIVE_BACKUP_NAME = "caption-studio-backup.json";
const DRIVE_SETTINGS_NAME = "caption-studio-settings.json";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const MIRROR_FILES = ["cues.json", "meta.json", "script.txt"];
/** ponytail: setTimeout, so a killed MV3 worker drops the pending mirror. Upgrade: chrome.alarms (1 min floor). */
const DRIVE_UPLOAD_DEBOUNCE_MS = 5000;
const DRIVE_SETTINGS_DEBOUNCE_MS = 1500;
const DRIVE_STORAGE_KEYS = [
  "driveFileId",
  "driveLastAppliedUpdatedAt",
  "driveSyncStatus",
  "driveConnected",
  "driveSettingsFileId",
  "settingsLastAppliedUpdatedAt",
];

let _driveUploadTimer = null;
let _driveBusy = false;
let _settingsUploadTimer = null;
let _vocabUploadTimer = null;
let _applyingSettings = false;

const DEFAULT_LEVEL_COLORS = {
  n5: { on: true, color: "#7fd6a8" },
  n4: { on: true, color: "#8fd3ff" },
  n3: { on: true, color: "#f5d76e" },
  n2: { on: true, color: "#e08a4a" },
  n1: { on: true, color: "#e74c5c" },
  unknown: { on: true, color: "#c5c5d0" },
};

async function setDriveStatus(text) {
  try {
    await chrome.storage.local.set({ driveSyncStatus: String(text || "") });
  } catch (_) {}
  try {
    chrome.runtime.sendMessage({ type: "DRIVE_STATUS_CHANGED", status: String(text || "") }).catch(() => {});
  } catch (_) {}
}

async function getDriveStatus() {
  const data = await chrome.storage.local.get(DRIVE_STORAGE_KEYS);
  return {
    ok: true,
    connected: !!data.driveConnected && !!data.driveFileId,
    fileId: data.driveFileId || "",
    lastApplied: data.driveLastAppliedUpdatedAt || "",
    status: data.driveSyncStatus || (data.driveFileId ? "Connected" : ""),
  };
}

async function getAuthToken(interactive) {
  const r = await chrome.identity.getAuthToken({ interactive: !!interactive });
  const token = typeof r === "string" ? r : r?.token;
  if (!token) throw new Error("OAuth token missing — set oauth2.client_id in manifest.json");
  return token;
}

async function clearAuthToken(token) {
  if (!token) return;
  try {
    await chrome.identity.removeCachedAuthToken({ token });
  } catch (_) {}
}

async function driveRequest(path, opts = {}, interactive = false) {
  let token = await getAuthToken(interactive);
  const doFetch = (t) =>
    fetch(path.startsWith("http") ? path : `${DRIVE_API}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${t}`,
        ...(opts.headers || {}),
      },
    });
  let res = await doFetch(token);
  if (res.status === 401) {
    await clearAuthToken(token);
    token = await getAuthToken(true);
    res = await doFetch(token);
  }
  return res;
}

async function ensureDriveFileId(interactive = false) {
  const stored = await chrome.storage.local.get(["driveFileId"]);
  if (stored.driveFileId) return stored.driveFileId;

  const q = encodeURIComponent(
    `'${DRIVE_FOLDER_ID}' in parents and name='${DRIVE_BACKUP_NAME}' and trashed=false`
  );
  const listRes = await driveRequest(
    `/files?q=${q}&fields=files(id,name)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {},
    interactive
  );
  if (!listRes.ok) {
    const errText = await listRes.text().catch(() => "");
    throw new Error(`Drive list ${listRes.status}: ${errText.slice(0, 160)}`);
  }
  const list = await listRes.json();
  let fileId = list?.files?.[0]?.id || "";
  if (!fileId) {
    const createRes = await driveRequest(
      `/files?supportsAllDrives=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: DRIVE_BACKUP_NAME,
          parents: [DRIVE_FOLDER_ID],
          mimeType: "application/json",
        }),
      },
      interactive
    );
    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      throw new Error(`Drive create ${createRes.status}: ${errText.slice(0, 160)}`);
    }
    const created = await createRes.json();
    fileId = created?.id || "";
    if (!fileId) throw new Error("Drive create returned no id");
    const empty = {
      version: 1,
      updatedAt: new Date().toISOString(),
      scripts: [],
      vocab: [],
    };
    await uploadDriveSnapshot(fileId, empty, interactive);
    // Mark seed applied so pullDriveIfNewer does not POST empty → wipe local scripts.
    await chrome.storage.local.set({
      driveFileId: fileId,
      driveConnected: true,
      driveLastAppliedUpdatedAt: empty.updatedAt,
    });
    return fileId;
  }
  await chrome.storage.local.set({ driveFileId: fileId, driveConnected: true });
  return fileId;
}

async function downloadDriveSnapshot(fileId, interactive = false) {
  const res = await driveRequest(
    `/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    {},
    interactive
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Drive download ${res.status}: ${errText.slice(0, 160)}`);
  }
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error("Drive file is not valid JSON");
  }
}

async function uploadDriveSnapshot(fileId, snapshot, interactive = false) {
  const body = JSON.stringify(snapshot);
  const res = await driveRequest(
    `${DRIVE_UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    },
    interactive
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Drive upload ${res.status}: ${errText.slice(0, 160)}`);
  }
}

let _driveQueue = Promise.resolve();
/** videoId → last Drive freshness probe, so navigation does not hit Drive every time. */
const _freshCheckedAt = new Map();

/** Serialize Drive work: two concurrent mirrors must not create the same subfolder twice. */
function driveQueued(fn) {
  const run = _driveQueue.then(fn, fn);
  _driveQueue = run.catch(() => {});
  return run;
}

async function driveConnected() {
  const s = await chrome.storage.local.get(["driveFileId", "driveConnected"]);
  return !!(s.driveConnected || s.driveFileId);
}

async function bridgeJson(path) {
  const res = await fetch(`${BRIDGE}${path}`);
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function driveList(q) {
  const res = await driveRequest(
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=200` +
      `&supportsAllDrives=true&includeItemsFromAllDrives=true`
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Drive list ${res.status}: ${errText.slice(0, 160)}`);
  }
  return (await res.json())?.files || [];
}

async function driveChildren(folderId) {
  const files = await driveList(`'${folderId}' in parents and trashed=false`);
  return new Map(files.map((f) => [f.name, f.id]));
}

async function ensureVideoFolder(videoId) {
  const found = await driveList(
    `'${DRIVE_FOLDER_ID}' in parents and name='${videoId}' ` +
      `and mimeType='${DRIVE_FOLDER_MIME}' and trashed=false`
  );
  if (found[0]?.id) return found[0].id;
  const res = await driveRequest(`/files?supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: videoId,
      parents: [DRIVE_FOLDER_ID],
      mimeType: DRIVE_FOLDER_MIME,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Drive mkdir ${res.status}: ${errText.slice(0, 160)}`);
  }
  const id = (await res.json())?.id;
  if (!id) throw new Error("Drive mkdir returned no id");
  return id;
}

async function drivePutText(folderId, name, text, fileId) {
  const mime = `${name.endsWith(".json") ? "application/json" : "text/plain"}; charset=UTF-8`;
  if (fileId) {
    const res = await driveRequest(
      `${DRIVE_UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`,
      { method: "PATCH", headers: { "Content-Type": mime }, body: text }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Drive update ${name} ${res.status}: ${errText.slice(0, 120)}`);
    }
    return fileId;
  }
  const b = "yjcs-mirror-boundary";
  const body =
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name, parents: [folderId] })}\r\n` +
    `--${b}\r\nContent-Type: ${mime}\r\n\r\n${text}\r\n--${b}--`;
  const res = await driveRequest(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&supportsAllDrives=true`,
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` }, body }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Drive create ${name} ${res.status}: ${errText.slice(0, 120)}`);
  }
  return (await res.json())?.id || "";
}

async function driveGetText(fileId) {
  const res = await driveRequest(
    `/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Drive download ${res.status}: ${errText.slice(0, 120)}`);
  }
  return res.text();
}

/** Disk → Drive `<videoId>/` (3 files). Skips videos whose rev is already up there. */
async function mirrorToDrive(videoIds) {
  if (!(await driveConnected())) return { ok: true, skipped: "not_connected" };
  const ids = videoIds?.length
    ? videoIds
    : ((await bridgeJson("/scripts")) || []).map((s) => s.video_id);
  const { lastMirroredRev = {} } = await chrome.storage.local.get(["lastMirroredRev"]);
  const mirrored = [];
  for (const id of ids) {
    const meta = await bridgeJson(`/scripts/${encodeURIComponent(id)}/meta`);
    if (!meta) continue;
    if (lastMirroredRev[id] === meta.rev) continue;
    const files = (await bridgeJson(`/scripts/${encodeURIComponent(id)}/files`))?.files;
    if (!files) continue;
    const folderId = await ensureVideoFolder(id);
    const existing = await driveChildren(folderId);
    for (const name of MIRROR_FILES) {
      if (typeof files[name] !== "string") continue;
      await drivePutText(folderId, name, files[name], existing.get(name));
    }
    lastMirroredRev[id] = meta.rev;
    mirrored.push(id);
  }
  await chrome.storage.local.set({ lastMirroredRev });
  const status = mirrored.length ? `Uploaded ${mirrored.length}` : "Connected";
  await setDriveStatus(status);
  return { ok: true, mirrored, status };
}

/** Drive → disk for every `<videoId>/` whose meta.json rev beats the bridge's. */
async function mirrorFromDrive(videoIds, opts = {}) {
  if (!(await driveConnected())) return { ok: true, skipped: "not_connected" };
  const want = videoIds?.length ? videoIds : null;
  if (want && opts.maxAgeMs) {
    const now = Date.now();
    const fresh = want.filter((id) => now - (_freshCheckedAt.get(id) || 0) < opts.maxAgeMs);
    if (fresh.length === want.length) return { ok: true, skipped: "checked_recently" };
    for (const id of want) _freshCheckedAt.set(id, now);
  }
  const folders = await driveList(
    `'${DRIVE_FOLDER_ID}' in parents and mimeType='${DRIVE_FOLDER_MIME}' and trashed=false`
  );
  const { lastMirroredRev = {} } = await chrome.storage.local.get(["lastMirroredRev"]);
  const pulled = [];
  for (const folder of folders) {
    if (want && !want.includes(folder.name)) continue;
    const children = await driveChildren(folder.id);
    if (!children.has("meta.json") || !children.has("cues.json")) continue;
    const metaText = await driveGetText(children.get("meta.json"));
    let remoteRev = 0;
    try {
      remoteRev = Number(JSON.parse(metaText)?.rev) || 0;
    } catch (_) {
      continue; // corrupt mirror — leave disk alone
    }
    const local = await bridgeJson(`/scripts/${encodeURIComponent(folder.name)}/meta`);
    if (remoteRev <= (Number(local?.rev) || 0)) continue;
    const files = { "meta.json": metaText };
    for (const name of MIRROR_FILES) {
      if (name === "meta.json" || !children.has(name)) continue;
      files[name] = await driveGetText(children.get(name));
    }
    const res = await fetch(`${BRIDGE}/scripts/${encodeURIComponent(folder.name)}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    if (!res.ok) continue;
    // Disk now equals Drive — do not bounce the same bytes straight back up.
    lastMirroredRev[folder.name] = remoteRev;
    pulled.push(folder.name);
  }
  if (pulled.length) {
    await chrome.storage.local.set({ lastMirroredRev });
    await notifyDriveRestored(pulled);
  }
  return { ok: true, pulled };
}

/** Content scripts need tabs.sendMessage (runtime broadcast won't reach them). */
async function notifyDriveRestored(videoIds) {
  try {
    const tabs = await chrome.tabs.query({
      url: [
        "https://www.youtube.com/*",
        "https://youtube.com/*",
        "https://abema.tv/*",
        "https://*.abema.tv/*",
        "https://www.netflix.com/*",
        "https://netflix.com/*",
      ],
    });
    for (const tab of tabs || []) {
      if (tab?.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { type: "DRIVE_RESTORED", videoIds }).catch(() => {});
    }
  } catch (_) {}
}

function updatedAtMs(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : 0;
}

// --- caption-studio-settings.json (LWW; no geometry) ---

async function ensureSettingsFileId(interactive = false, createIfMissing = true) {
  const stored = await chrome.storage.local.get(["driveSettingsFileId"]);
  if (stored.driveSettingsFileId) return stored.driveSettingsFileId;

  const q = encodeURIComponent(
    `'${DRIVE_FOLDER_ID}' in parents and name='${DRIVE_SETTINGS_NAME}' and trashed=false`
  );
  const listRes = await driveRequest(
    `/files?q=${q}&fields=files(id,name)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {},
    interactive
  );
  if (!listRes.ok) {
    const errText = await listRes.text().catch(() => "");
    throw new Error(`Drive settings list ${listRes.status}: ${errText.slice(0, 160)}`);
  }
  const list = await listRes.json();
  let fileId = list?.files?.[0]?.id || "";
  if (!fileId) {
    if (!createIfMissing) return "";
    const createRes = await driveRequest(
      `/files?supportsAllDrives=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: DRIVE_SETTINGS_NAME,
          parents: [DRIVE_FOLDER_ID],
          mimeType: "application/json",
        }),
      },
      interactive
    );
    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      throw new Error(`Drive settings create ${createRes.status}: ${errText.slice(0, 160)}`);
    }
    fileId = (await createRes.json())?.id || "";
    if (!fileId) throw new Error("Drive settings create returned no id");
  }
  await chrome.storage.local.set({ driveSettingsFileId: fileId });
  return fileId;
}

async function buildLocalSettingsSnapshot() {
  const data = await chrome.storage.local.get([
    "hardsubSettings",
    "followTimeline",
    "isDarkTheme",
    "sidePanelFontScale",
  ]);
  const s = data.hardsubSettings && typeof data.hardsubSettings === "object" ? data.hardsubSettings : {};
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    showFurigana: s.showFurigana !== false,
    barShowJa: s.barShowJa !== false,
    barShowEn: s.barShowEn !== false,
    barShowVi: s.barShowVi !== false,
    barScale: Number(s.barScale) || 1,
    barBgOpacity: s.barBgOpacity != null ? Number(s.barBgOpacity) : 0.82,
    barTextOpacity: s.barTextOpacity != null ? Number(s.barTextOpacity) : 1,
    dimHardsub: !!s.dimHardsub,
    dictShowSentence: s.dictShowSentence !== false,
    levelHighlightEnabled: s.levelHighlightEnabled !== false,
    levelColors: s.levelColors && typeof s.levelColors === "object" ? s.levelColors : DEFAULT_LEVEL_COLORS,
    followTimeline: data.followTimeline !== false,
    isDarkTheme: data.isDarkTheme !== false,
    sidePanelFontScale: data.sidePanelFontScale != null ? Number(data.sidePanelFontScale) : 1,
  };
}

async function applySettingsSnapshot(remote) {
  if (!remote || typeof remote !== "object") return;
  _applyingSettings = true;
  try {
    const data = await chrome.storage.local.get(["hardsubSettings"]);
    const prev = data.hardsubSettings && typeof data.hardsubSettings === "object" ? data.hardsubSettings : {};
    const next = { ...prev };
    if (remote.showFurigana != null) next.showFurigana = !!remote.showFurigana;
    if (remote.barShowJa != null) next.barShowJa = !!remote.barShowJa;
    if (remote.barShowEn != null) next.barShowEn = !!remote.barShowEn;
    if (remote.barShowVi != null) next.barShowVi = !!remote.barShowVi;
    if (remote.barScale != null) next.barScale = Number(remote.barScale) || 1;
    if (remote.barBgOpacity != null) next.barBgOpacity = Number(remote.barBgOpacity);
    if (remote.barTextOpacity != null) next.barTextOpacity = Number(remote.barTextOpacity);
    if (remote.dimHardsub != null) next.dimHardsub = !!remote.dimHardsub;
    if (remote.dictShowSentence != null) next.dictShowSentence = !!remote.dictShowSentence;
    if (remote.levelHighlightEnabled != null) next.levelHighlightEnabled = !!remote.levelHighlightEnabled;
    if (remote.levelColors && typeof remote.levelColors === "object") next.levelColors = remote.levelColors;
    const patch = { hardsubSettings: next };
    if (remote.followTimeline != null) patch.followTimeline = !!remote.followTimeline;
    if (remote.isDarkTheme != null) patch.isDarkTheme = !!remote.isDarkTheme;
    if (remote.sidePanelFontScale != null) patch.sidePanelFontScale = Number(remote.sidePanelFontScale) || 1;
    if (remote.updatedAt) patch.settingsLastAppliedUpdatedAt = String(remote.updatedAt);
    await chrome.storage.local.set(patch);
  } finally {
    _applyingSettings = false;
  }
}

async function pushSettingsSnapshot() {
  if (!(await driveConnected())) return { skipped: "not_connected" };
  const fileId = await ensureSettingsFileId(false, true);
  const snap = await buildLocalSettingsSnapshot();
  await uploadDriveSnapshot(fileId, snap, false);
  await chrome.storage.local.set({ settingsLastAppliedUpdatedAt: snap.updatedAt });
  return { ok: true, updatedAt: snap.updatedAt };
}

/** Connect / pull path: pull if remote newer, else push (creates file from local if missing). */
async function syncSettingsOnConnect() {
  if (!(await driveConnected())) return { skipped: "not_connected" };
  const stored = await chrome.storage.local.get(["settingsLastAppliedUpdatedAt"]);
  const fileId = await ensureSettingsFileId(false, true);
  const remote = await downloadDriveSnapshot(fileId, false);
  const remoteAt = updatedAtMs(remote?.updatedAt);
  const localAt = updatedAtMs(stored.settingsLastAppliedUpdatedAt);
  if (remote && remoteAt > localAt) {
    await applySettingsSnapshot(remote);
    return { action: "pulled", updatedAt: remote.updatedAt || "" };
  }
  const pushed = await pushSettingsSnapshot();
  return { action: "pushed", updatedAt: pushed.updatedAt || "" };
}

function scheduleSettingsDrivePush() {
  if (_applyingSettings) return;
  if (_settingsUploadTimer) clearTimeout(_settingsUploadTimer);
  _settingsUploadTimer = setTimeout(() => {
    _settingsUploadTimer = null;
    void pushSettingsSnapshot().catch(() => {});
  }, DRIVE_SETTINGS_DEBOUNCE_MS);
}

/** userVocab → bridge then Drive backup.json (vocab-only). */
function scheduleVocabDrivePush() {
  if (_applyingBridgeState) return;
  if (_vocabUploadTimer) clearTimeout(_vocabUploadTimer);
  _vocabUploadTimer = setTimeout(() => {
    _vocabUploadTimer = null;
    void (async () => {
      await pushExtensionStateToBridge();
      await uploadDriveFromBridge();
    })().catch(() => {});
  }, DRIVE_SETTINGS_DEBOUNCE_MS);
}

/** @param {{ pull?: boolean }} [opts] pull=false when about to upload local as source of truth */
async function connectDrive(opts = {}) {
  try {
    await getAuthToken(true);
    const fileId = await ensureDriveFileId(true);
    await chrome.storage.local.set({ driveConnected: true, driveFileId: fileId });
    await setDriveStatus("Connected");
    // Pull once after connect so PC picks up iPad writes (skip when caller will upload).
    if (opts.pull !== false) {
      await pullDriveIfNewer();
    } else {
      await syncSettingsOnConnect();
    }
    return { ok: true, fileId, status: "Connected" };
  } catch (err) {
    const msg = String(err?.message || err);
    await setDriveStatus(`error: ${msg.slice(0, 80)}`);
    return { ok: false, error: msg };
  }
}

/** Vocab only — scripts travel as `<videoId>/` folders, not through the snapshot. */
async function pullVocabSnapshot() {
  const stored = await chrome.storage.local.get(["driveLastAppliedUpdatedAt"]);
  const fileId = await ensureDriveFileId(false);
  const snap = await downloadDriveSnapshot(fileId, false);
  if (!snap || typeof snap !== "object") return { skipped: "empty" };
  const remoteAt = updatedAtMs(snap.updatedAt);
  if (!remoteAt || remoteAt <= updatedAtMs(stored.driveLastAppliedUpdatedAt)) {
    return { skipped: "up_to_date", updatedAt: snap.updatedAt || "" };
  }
  const res = await fetch(`${BRIDGE}/backup/snapshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snap),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`bridge POST ${res.status}: ${errText.slice(0, 120)}`);
  }
  const applied = String(snap.updatedAt || "");
  await chrome.storage.local.set({ driveLastAppliedUpdatedAt: applied });
  return { updatedAt: applied };
}

async function pullDriveIfNewer() {
  if (_driveBusy) return { ok: true, skipped: "busy" };
  _driveBusy = true;
  try {
    if (!(await driveConnected())) return { ok: true, skipped: "not_connected" };
    const vocab = await pullVocabSnapshot();
    const settings = await syncSettingsOnConnect();
    const mirror = await driveQueued(() => mirrorFromDrive());
    const restored = !!mirror.pulled?.length;
    await setDriveStatus(restored ? "Restored" : "Connected");
    return {
      ok: true,
      restored,
      pulled: mirror.pulled || [],
      updatedAt: vocab.updatedAt || "",
      settings: settings?.action || "",
    };
  } catch (err) {
    const msg = String(err?.message || err);
    await setDriveStatus(`error: ${msg.slice(0, 80)}`);
    return { ok: false, error: msg };
  } finally {
    _driveBusy = false;
  }
}

/** videoIds seen since the last flush — one save burst must not mirror the whole library. */
const _pendingMirror = new Set();

function scheduleDriveUpload(videoId) {
  if (videoId) _pendingMirror.add(String(videoId));
  if (_driveUploadTimer) clearTimeout(_driveUploadTimer);
  // Persist pending IDs for crash-recovery alarm (MV3 may kill SW between timer and fire).
  const storage = chrome.storage.session || chrome.storage.local;
  storage.set({ [DRIVE_PENDING_MIRROR_KEY]: Array.from(_pendingMirror) }).catch(() => {});
  // Alarm is the crash-recovery path; timer preserves the existing 5s UI debounce.
  void chrome.alarms?.create?.(DRIVE_UPLOAD_ALARM, { delayInMinutes: 1 }).catch?.(() => {});
  _driveUploadTimer = setTimeout(() => {
    _driveUploadTimer = null;
    const ids = Array.from(_pendingMirror);
    _pendingMirror.clear();
    storage.remove([DRIVE_PENDING_MIRROR_KEY]).catch(() => {});
    void driveQueued(() => mirrorToDrive(ids));
  }, DRIVE_UPLOAD_DEBOUNCE_MS);
}

/** Immediate full mirror (sidepanel button). Connect first if needed; cancels pending debounce. */
async function uploadDriveNow() {
  if (_driveUploadTimer) {
    clearTimeout(_driveUploadTimer);
    _driveUploadTimer = null;
  }
  _pendingMirror.clear();
  if (!(await driveConnected())) {
    // No pull before push — pull of empty/stale Drive would wipe local then upload the wipe.
    const c = await connectDrive({ pull: false });
    if (!c?.ok) return c;
  }
  await setDriveStatus("Uploading…");
  const vocab = await uploadDriveFromBridge();
  if (!vocab?.ok) return vocab;
  return driveQueued(() => mirrorToDrive());
}

async function uploadDriveFromBridge() {
  if (_driveBusy) {
    setTimeout(() => void uploadDriveFromBridge(), 800);
    return { ok: true, deferred: true };
  }
  if (!(await driveConnected())) return { ok: true, skipped: "not_connected" };
  _driveBusy = true;
  try {
    const fileId = await ensureDriveFileId(false);
    const res = await fetch(`${BRIDGE}/backup/snapshot`);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`bridge GET ${res.status}: ${errText.slice(0, 120)}`);
    }
    const snap = await res.json();
    if (!snap || typeof snap !== "object") throw new Error("bridge snapshot invalid");
    // Stamp write time if bridge omitted updatedAt.
    if (!snap.updatedAt) snap.updatedAt = new Date().toISOString();
    await uploadDriveSnapshot(fileId, snap, false);
    const applied = String(snap.updatedAt || "");
    await chrome.storage.local.set({ driveLastAppliedUpdatedAt: applied });
    await setDriveStatus("Uploaded");
    return { ok: true, uploaded: true, updatedAt: applied };
  } catch (err) {
    const msg = String(err?.message || err);
    await setDriveStatus(`error: ${msg.slice(0, 80)}`);
    return { ok: false, error: msg };
  } finally {
    _driveBusy = false;
  }
}
