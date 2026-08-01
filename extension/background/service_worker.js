const BRIDGE = "http://127.0.0.1:8765";
/** Optional Native Messaging fallback only — primary IME path is bridge POST /ime/switch. */
const IME_NATIVE_HOST = "com.ytcaption.ime_switch";

const POLL_BRIDGE_ALARM = "poll_bridge_state";

async function ensureBridgePollAlarm() {
  try {
    if (!chrome.alarms?.create) return;
    const existing = await chrome.alarms.get(POLL_BRIDGE_ALARM);
    if (!existing) {
      await chrome.alarms.create(POLL_BRIDGE_ALARM, { periodInMinutes: 1 });
    }
  } catch (_) {}
}

/** Icon click opens Saved Items popup; side panel via DỊCH toggle / OPEN_SIDE_PANEL. */
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (_) {}
  await ensureBridgePollAlarm();
});

chrome.runtime.onStartup?.addListener?.(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (_) {}
  await ensureBridgePollAlarm();
});

// Enable side panel on YouTube tabs (Chrome native right panel — does not cover the page).
chrome.tabs.onUpdated.addListener(async (tabId, _info, tab) => {
  if (!tab.url) return;
  try {
    const url = new URL(tab.url);
    const onYt = url.hostname === "www.youtube.com" || url.hostname === "youtube.com";
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel/sidepanel.html",
      enabled: onYt,
    });
  } catch (_) {}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "BRIDGE_FETCH") {
    handleBridgeFetch(msg).then(sendResponse).catch((err) =>
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
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
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
    const body = {
      userVocab:
        data.userVocab && typeof data.userVocab === "object" ? data.userVocab : {},
      hardsubSettings:
        data.hardsubSettings && typeof data.hardsubSettings === "object"
          ? data.hardsubSettings
          : null,
      source: "extension",
    };
    const j = JSON.stringify({
      userVocab: body.userVocab,
      hardsubSettings: body.hardsubSettings,
    });
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
        userVocab: patch.userVocab ?? local.userVocab ?? {},
        hardsubSettings: patch.hardsubSettings ?? local.hardsubSettings ?? null,
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
});

// Top-level alarm listener (MV3: must register synchronously so SW wakes on alarm).
if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === POLL_BRIDGE_ALARM) {
      void pullExtensionStateFromBridge();
    }
  });
}

void ensureBridgePollAlarm();

void loadSwState().then(() => {
  void pushExtensionStateToBridge();
  void pullExtensionStateFromBridge();
});

async function handleBridgeFetch(msg) {
  const { path, method = "GET", body, isForm } = msg;
  const url = `${BRIDGE}${path}`;
  const opts = { method };
  if (isForm && body) {
    const blob = dataUrlToBlob(body.imageBase64);
    const fd = new FormData();
    fd.append("image", blob, "roi.webp");
    fd.append("meta", body.meta);
    opts.body = fd;
  } else if (body) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function handleYtFetch(msg) {
  let url = String(msg.url || "");
  if (!url.startsWith("https://www.youtube.com/api/timedtext")) {
    return { ok: false, error: "bad_url" };
  }
  const text = await fetchTimedtextBody(url);
  return { ok: !!text, status: text ? 200 : 0, text: text || "" };
}

/**
 * Caption load cascade (adapted from YSD side-panel pattern):
 * 1) page-provided timedtext baseUrl (content intercepted / player track)
 * 2) scrape watch HTML → ytInitialPlayerResponse.captionTracks
 * 3) ANDROID Innertube player → captionTracks
 * Fetch URL raw first (no forced fmt=json3), parse XML <text>/<p> or json3.
 */
async function handleYtLoadCaptions(msg) {
  const videoId = String(msg.videoId || "").trim();
  const preferLang = String(msg.lang || "ja").toLowerCase();
  if (!videoId) {
    return { ok: false, reason: "no_video_id", cues: [] };
  }

  /** @type {{ url: string, lang: string, asr: boolean, via: string }[]} */
  const candidates = [];
  const seen = new Set();

  const pushUrl = (url, lang, asr, via) => {
    if (!url || !String(url).includes("/api/timedtext")) return;
    const key = String(url);
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
    pushUrl(msg.baseUrl, msg.lang || preferLang, !!msg.asr, "page_link");
  }

  try {
    const webTracks = await fetchWebCaptionTracks(videoId);
    for (const t of sortTracks(webTracks, preferLang)) {
      pushUrl(t.baseUrl, t.languageCode || "", t.kind === "asr", "watch_html");
    }
  } catch (_) {
    /* continue */
  }

  try {
    const androidTracks = await fetchAndroidCaptionTracks(videoId);
    for (const t of sortTracks(androidTracks, preferLang)) {
      pushUrl(t.baseUrl, t.languageCode || "", t.kind === "asr", "android");
    }
  } catch (_) {
    /* continue */
  }

  if (!candidates.length) {
    return { ok: false, reason: "no_tracks", cues: [], via: "none" };
  }

  let lastError = "";
  for (const c of candidates) {
    const body = await fetchTimedtextBody(c.url);
    if (!body) {
      lastError = "empty_or_html";
      continue;
    }
    const cues = parseTimedtextBody(body);
    if (cues.length) {
      return {
        ok: true,
        status: "ok",
        count: cues.length,
        cues,
        lang: c.lang || preferLang,
        asr: c.asr,
        via: c.via,
      };
    }
    lastError = "parse_empty";
  }

  return {
    ok: false,
    reason: lastError || "timedtext_empty",
    cues: [],
    trackCount: candidates.length,
    via: "all_failed",
  };
}

async function fetchWebCaptionTracks(videoId) {
  const headers = {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "ja,en;q=0.9",
  };
  try {
    const cookies = await chrome.cookies.getAll({ domain: ".youtube.com" });
    if (cookies?.length) {
      headers.Cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  } catch (_) {}

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
  ];
  for (const client of clients) {
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
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
    if (lang.startsWith("ja")) s += 90;
    else if (lang.startsWith("en")) s += 40;
  } else if (lang.startsWith(prefer)) {
    s += 100;
  } else if (lang.startsWith("ja")) {
    s += 70;
  }
  if (!asr) s += 25;
  return s;
}

async function fetchTimedtextBody(baseUrl) {
  if (!baseUrl) return "";
  const raw = String(baseUrl);
  const urls = [raw];
  // YSD fetches the URL as-is first. Only then try explicit formats.
  if (!raw.includes("fmt=")) {
    urls.push(`${raw}${raw.includes("?") ? "&" : "?"}fmt=json3`);
    urls.push(`${raw}${raw.includes("?") ? "&" : "?"}fmt=srv3`);
  }
  for (const url of urls) {
    if (!url.startsWith("https://www.youtube.com/api/timedtext")) continue;
    try {
      const headers = {
        Accept: "*/*",
        Referer: "https://www.youtube.com/",
      };
      try {
        const cookies = await chrome.cookies.getAll({ domain: ".youtube.com" });
        if (cookies?.length) {
          headers.Cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        }
      } catch (_) {}
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text) continue;
      const trimmed = text.trim();
      if (trimmed[0] === "{" || trimmed[0] === "<") return text;
    } catch (_) {
      /* next */
    }
  }
  return "";
}

function parseTimedtextBody(body) {
  const trimmed = String(body || "").trim();
  if (!trimmed) return [];
  if (trimmed[0] === "{") {
    try {
      return parseJson3(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  if (trimmed[0] === "<") return parseTimedtextXml(trimmed);
  return [];
}

function parseJson3(data) {
  const events = data?.events || [];
  const nodes = [];
  for (const ev of events) {
    if (!ev || ev.tStartMs == null) continue;
    const segs = ev.segs || [];
    const text = segs
      .map((s) => (s && s.utf8 != null ? String(s.utf8) : ""))
      .join("")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    nodes.push({
      start: Number(ev.tStartMs) / 1000,
      durMs: ev.dDurationMs != null ? Number(ev.dDurationMs) : null,
      text,
    });
  }
  const cues = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    const next = nodes[i + 1];
    // YSD / VTT: end at next cue start. Ignore short dDurationMs on scrolling ASR
    // (YouTube often reports 3000ms while the line stays until the next event).
    let end = next
      ? next.start
      : n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0
        ? n.start + n.durMs / 1000
        : n.start + 2;
    cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
  }
  return cues;
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** YSD uses DOMParser on <text start dur>; we also support timedtext format=3 <p>. */
function parseTimedtextXml(xml) {
  const textCues = parseLegacyTextNodes(xml);
  if (textCues.length) return textCues;
  return parseParagraphNodes(xml);
}

function parseLegacyTextNodes(xml) {
  const cues = [];
  const textRe = /<text\s+([^>]*)>([\s\S]*?)<\/text>/gi;
  let m;
  const nodes = [];
  while ((m = textRe.exec(xml))) {
    const attrs = m[1] || "";
    const start = Number((attrs.match(/\bstart="([\d.]+)"/) || [])[1] || 0);
    const dur = Number((attrs.match(/\bdur="([\d.]+)"/) || [])[1] || 0);
    const text = decodeEntities(
      (m[2] || "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
    nodes.push({ start, dur, text });
  }
  // Match YSD: end = next.start (fallback start+dur)
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (!n.text) continue;
    const next = nodes[i + 1];
    const end = next ? next.start : n.start + Math.max(0.2, n.dur || 2);
    cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
  }
  return cues;
}

function parseParagraphNodes(xml) {
  const pRe = /<p\s+([^>]*)>([\s\S]*?)<\/p>/gi;
  let m;
  const nodes = [];
  while ((m = pRe.exec(xml))) {
    const attrs = m[1] || "";
    const inner = m[2] || "";
    const t = Number((attrs.match(/\bt="(\d+)"/) || [])[1] || 0) / 1000;
    const dRaw = (attrs.match(/\bd="(\d+)"/) || [])[1];
    const text = decodeEntities(
      inner
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (!text) continue;
    nodes.push({
      start: t,
      durMs: dRaw != null ? Number(dRaw) : null,
      text,
    });
  }
  const cues = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    const next = nodes[i + 1];
    // YSD / VTT: end at next cue start (ignore short scrolling-ASR dDurationMs).
    let end = next
      ? next.start
      : n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0
        ? n.start + n.durMs / 1000
        : n.start + 2;
    cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
  }
  return cues;
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)[1];
  const bin = atob(parts[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
