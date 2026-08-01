/**
 * Page-world helpers: media time, seek/play, YouTube timedtext cues.
 * ROI capture retained for debug only — product path is caption-only.
 */
(function () {
  if (window.__HARDSubOCRCapture) return;

  const state = {
    video: null,
    roi: { top: 0.72, left: 0.05, width: 0.9, height: 0.22 },
    targetHeight: 200,
    captions: {
      videoId: "",
      cues: [], // { start, end, text }
      track: null,
      status: "idle", // idle|loading|ok|none|error
      error: "",
    },
    // Like YSD SUBS_LINK: capture timedtext URL/body when the player fetches it.
    timedtext: {
      url: "",
      videoId: "",
      body: "",
      cues: [],
    },
  };

  /** videoId for which we already tried player.setOption captions (once per video). */
  let ccTriggerVideoId = "";

  function findVideo() {
    return document.querySelector("video.html5-main-video") || document.querySelector("video");
  }

  function bindVideo() {
    state.video = findVideo();
    return !!state.video;
  }

  function captureRoi() {
    const video = state.video || findVideo();
    if (!video || video.readyState < 2 || !video.videoWidth) {
      return { ok: false, reason: "no_video", paused: !!(video && video.paused) };
    }
    if (video.paused) {
      return {
        ok: true,
        paused: true,
        mediaTime: video.currentTime || 0,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      };
    }
    state.video = video;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const sx = Math.floor(vw * state.roi.left);
    const sy = Math.floor(vh * state.roi.top);
    const sw = Math.max(1, Math.floor(vw * state.roi.width));
    const sh = Math.max(1, Math.floor(vh * state.roi.height));

    const scale = state.targetHeight / sh;
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = state.targetHeight;

    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    try {
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
    } catch (err) {
      return { ok: false, reason: "taint_or_draw", message: String(err) };
    }

    let dataUrl;
    try {
      dataUrl = canvas.toDataURL("image/webp", 0.85);
      if (!dataUrl || dataUrl.length < 32) {
        dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      }
    } catch (err) {
      return { ok: false, reason: "taint", message: String(err) };
    }

    return {
      ok: true,
      paused: false,
      dataUrl,
      mediaTime: video.currentTime || 0,
      videoWidth: vw,
      videoHeight: vh,
    };
  }

  function getMediaTime() {
    const video = state.video || findVideo();
    if (!video) return { ok: false, reason: "no_video", mediaTime: 0, paused: true };
    state.video = video;
    return {
      ok: true,
      mediaTime: video.currentTime || 0,
      paused: !!video.paused,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    };
  }

  function seekTo(t) {
    const video = state.video || findVideo();
    if (!video) return false;
    video.currentTime = Math.max(0, Number(t) || 0);
    return true;
  }

  function playAt(t) {
    const video = state.video || findVideo();
    if (!video) return { ok: false, reason: "no_video" };
    video.currentTime = Math.max(0, Number(t) || 0);
    const playResult = video.play();
    if (playResult && typeof playResult.then === "function") {
      playResult.catch(() => {});
    }
    return { ok: true };
  }

  function videoIdFromLocation() {
    try {
      return new URLSearchParams(location.search).get("v") || "";
    } catch {
      return "";
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function prVideoId(pr) {
    return pr?.videoDetails?.videoId || pr?.videoDetails?.id || "";
  }

  function tracksFromPr(pr) {
    return pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
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
          } catch (_) {
            return null;
          }
        }
      }
    }
    return null;
  }

  function scrapePlayerResponseFromDom(wantId) {
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i += 1) {
      const text = scripts[i].textContent || "";
      if (!text.includes("ytInitialPlayerResponse")) continue;
      const marker = text.indexOf("ytInitialPlayerResponse");
      const eq = text.indexOf("=", marker);
      if (eq < 0) continue;
      const pr = parseJsonObjectAt(text, eq + 1);
      if (!pr || typeof pr !== "object") continue;
      const id = prVideoId(pr);
      if (wantId && id && id !== wantId) continue;
      if (tracksFromPr(pr).length) return pr;
      if (!wantId || !id || id === wantId) {
        // keep scanning for a PR that has captions
      }
    }
    return null;
  }

  function getPlayerResponse(wantId) {
    const candidates = [];
    try {
      const player =
        document.getElementById("movie_player") ||
        document.querySelector(".html5-video-player");
      if (player && typeof player.getPlayerResponse === "function") {
        const pr = player.getPlayerResponse();
        if (pr) candidates.push(pr);
      }
    } catch (_) {}
    try {
      if (window.ytInitialPlayerResponse) candidates.push(window.ytInitialPlayerResponse);
    } catch (_) {}
    try {
      const raw = window.ytplayer?.config?.args?.player_response;
      if (typeof raw === "string" && raw) candidates.push(JSON.parse(raw));
      else if (raw && typeof raw === "object") candidates.push(raw);
    } catch (_) {}

    let best = null;
    for (const pr of candidates) {
      if (!pr) continue;
      const id = prVideoId(pr);
      if (wantId && id && id !== wantId) continue;
      if (tracksFromPr(pr).length) return pr;
      if (!best) best = pr;
    }
    if (best) return best;
    return scrapePlayerResponseFromDom(wantId);
  }

  function ytcfgGet(key) {
    try {
      if (window.ytcfg && typeof window.ytcfg.get === "function") {
        const v = window.ytcfg.get(key);
        if (v != null) return v;
      }
    } catch (_) {}
    try {
      const data = window.ytcfg?.data_;
      if (data && data[key] != null) return data[key];
    } catch (_) {}
    return null;
  }

  async function fetchPlayerViaInnertube(videoId) {
    const attempts = [];
    // ANDROID client returns usable timedtext URLs; WEB player URLs often empty.
    attempts.push({
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      androidSdkVersion: 30,
    });
    const apiKey =
      ytcfgGet("INNERTUBE_API_KEY") || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    let clientName = ytcfgGet("INNERTUBE_CLIENT_NAME") || "WEB";
    if (typeof clientName === "number") clientName = "WEB";
    const clientVersion = ytcfgGet("INNERTUBE_CLIENT_VERSION") || "2.20240701.00.00";
    attempts.push({
      clientName: String(clientName),
      clientVersion: String(clientVersion),
      useKey: true,
    });

    for (const client of attempts) {
      try {
        const url = client.useKey
          ? `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`
          : "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
        const bodyClient = {
          clientName: client.clientName,
          clientVersion: client.clientVersion,
          hl: document.documentElement.lang || "ja",
        };
        if (client.androidSdkVersion) bodyClient.androidSdkVersion = client.androidSdkVersion;
        const res = await fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: { client: bodyClient },
            videoId,
            contentCheckOk: true,
            racyCheckOk: true,
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (tracksFromPr(data).length) return data;
      } catch (_) {
        /* next client */
      }
    }
    return null;
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

  function parseTimedtextXml(xml) {
    // YSD parseYouTubeSubtitles: <text start="" dur="">
    const textCues = [];
    const textNodes = [];
    const textRe = /<text\s+([^>]*)>([\s\S]*?)<\/text>/gi;
    let m;
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
      textNodes.push({ start, dur, text });
    }
    for (let i = 0; i < textNodes.length; i += 1) {
      const n = textNodes[i];
      if (!n.text) continue;
      const next = textNodes[i + 1];
      const end = next ? next.start : n.start + Math.max(0.2, n.dur || 2);
      textCues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
    }
    if (textCues.length) return textCues;

    const cues = [];
    const pNodes = [];
    const pRe = /<p\s+([^>]*)>([\s\S]*?)<\/p>/gi;
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
      pNodes.push({
        start: t,
        durMs: dRaw != null ? Number(dRaw) : null,
        text,
      });
    }
    for (let i = 0; i < pNodes.length; i += 1) {
      const n = pNodes[i];
      const next = pNodes[i + 1];
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

  async function fetchJson3Cues(url) {
    if (!url) return { cues: [], error: "no_url" };
    // Prefer raw URL first (YSD style); only then explicit formats.
    const urls = [String(url)];
    const u0 = urls[0];
    if (!u0.includes("fmt=")) {
      urls.push(`${u0}${u0.includes("?") ? "&" : "?"}fmt=json3`);
      urls.push(`${u0}${u0.includes("?") ? "&" : "?"}fmt=srv3`);
    }
    let lastError = "empty_or_html";
    for (const u of urls) {
      try {
        const res = await fetch(u, { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) {
          lastError = `http_${res.status}`;
          continue;
        }
        const body = await res.text();
        if (!body || !body.trim()) {
          lastError = "empty_or_html";
          continue;
        }
        const cues = parseTimedtextBody(body);
        if (cues.length) return { cues, error: "" };
        lastError = "no_events";
      } catch (err) {
        lastError = String(err);
      }
    }
    return { cues: [], error: lastError };
  }

  function noteTimedtext(url, body) {
    if (!url || !String(url).includes("/api/timedtext")) return;
    let vid = "";
    try {
      vid = new URL(String(url), location.origin).searchParams.get("v") || "";
    } catch (_) {}
    state.timedtext.url = String(url);
    state.timedtext.videoId = vid || videoIdFromLocation();
    if (body && String(body).trim().length > 10) {
      state.timedtext.body = String(body);
      const cues = parseTimedtextBody(body);
      if (cues.length) state.timedtext.cues = cues;
    }
  }

  function installTimedtextHooks() {
    if (window.__hardsubTimedtextHooks) return;
    window.__hardsubTimedtextHooks = true;
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await origFetch.apply(this, args);
      try {
        const req = args[0];
        const url = typeof req === "string" ? req : req && req.url ? req.url : "";
        if (url && String(url).includes("/api/timedtext")) {
          res
            .clone()
            .text()
            .then((t) => noteTimedtext(url, t))
            .catch(() => noteTimedtext(url, ""));
        }
      } catch (_) {}
      return res;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__hardsubTtUrl = url;
      return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener("load", function () {
        try {
          if (this.__hardsubTtUrl && String(this.__hardsubTtUrl).includes("/api/timedtext")) {
            noteTimedtext(this.__hardsubTtUrl, this.responseText || "");
          }
        } catch (_) {}
      });
      return origSend.apply(this, args);
    };
  }

  function hasInterceptForVideo(videoId) {
    if (!videoId) return false;
    const tt = state.timedtext;
    if (tt.videoId && tt.videoId !== videoId) return false;
    return !!(tt.cues?.length || (tt.body && String(tt.body).trim().length > 10) || tt.url);
  }

  /**
   * Last-resort: enable player CC so timedtext intercept can fire.
   * Once per videoId — never spam setOption (causes timeline stutter).
   * Skip if track already matches prefer/ja, or intercept already has data.
   */
  function tryEnablePlayerCaptions(videoId, preferLang) {
    const vid = String(videoId || "").trim();
    if (!vid) return false;
    if (ccTriggerVideoId === vid) return false;
    if (hasInterceptForVideo(vid)) {
      ccTriggerVideoId = vid;
      return false;
    }
    try {
      const player =
        document.getElementById("movie_player") ||
        document.querySelector(".html5-video-player");
      if (!player) return false;
      if (typeof player.loadModule === "function") {
        try {
          player.loadModule("captions");
        } catch (_) {}
      }
      const prefer = String(preferLang || "ja").toLowerCase();
      const list =
        (typeof player.getOption === "function" &&
          player.getOption("captions", "tracklist")) ||
        [];
      const cur =
        typeof player.getOption === "function"
          ? player.getOption("captions", "track")
          : null;
      const curLang = String(
        cur?.languageCode || cur?.translationLanguage || ""
      ).toLowerCase();
      if (
        curLang &&
        (curLang.startsWith(prefer) || curLang.startsWith("ja"))
      ) {
        ccTriggerVideoId = vid;
        return false;
      }
      if (Array.isArray(list) && list.length && typeof player.setOption === "function") {
        let best = list[0];
        for (const t of list) {
          const lang = String(t.languageCode || t.translationLanguage || "").toLowerCase();
          if (lang.startsWith(prefer)) {
            best = t;
            break;
          }
          if (lang.startsWith("ja")) best = t;
        }
        player.setOption("captions", "track", best);
        ccTriggerVideoId = vid;
        return true;
      }
      // Mark attempted even if no tracklist yet — avoid repeat setOption spam.
      ccTriggerVideoId = vid;
      return false;
    } catch (_) {
      ccTriggerVideoId = vid;
      return false;
    }
  }

  async function waitForInterceptedCues(videoId, maxMs = 2500) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (
        state.timedtext.cues?.length &&
        (!state.timedtext.videoId || state.timedtext.videoId === videoId)
      ) {
        return state.timedtext.cues;
      }
      await sleep(200);
    }
    return null;
  }

  async function waitForCaptionTracks(videoId, preferLang, maxMs = 8000) {
    const t0 = Date.now();
    let lastPr = null;
    let innertubeTried = false;
    while (Date.now() - t0 < maxMs) {
      let pr = getPlayerResponse(videoId);
      if ((!pr || !tracksFromPr(pr).length) && !innertubeTried && Date.now() - t0 > 400) {
        innertubeTried = true;
        try {
          const fromApi = await fetchPlayerViaInnertube(videoId);
          if (fromApi) pr = fromApi;
        } catch (_) {}
      }
      lastPr = pr || lastPr;
      const tracks = tracksFromPr(pr);
      if (tracks.length) {
        const track = pickCaptionTrack(tracks, preferLang);
        if (track?.baseUrl) return { pr, track, tracks };
      }
      await sleep(250);
    }
    if (!innertubeTried) {
      try {
        const fromApi = await fetchPlayerViaInnertube(videoId);
        if (fromApi) lastPr = fromApi;
      } catch (_) {}
    }
    const tracks = tracksFromPr(lastPr);
    return { pr: lastPr, track: pickCaptionTrack(tracks, preferLang), tracks };
  }

  async function fetchTimedtextFallback(videoId, preferLang) {
    const langs =
      preferLang === "en"
        ? ["en", "ja", "ja-orig"]
        : preferLang === "auto"
          ? ["ja", "ja-orig", "en"]
          : [preferLang, "ja", "ja-orig", "en"];
    const seen = new Set();
    for (const lang of langs) {
      if (!lang || seen.has(lang)) continue;
      seen.add(lang);
      for (const kind of ["asr", ""]) {
        const params = new URLSearchParams({
          v: videoId,
          lang,
          fmt: "json3",
        });
        if (kind) params.set("kind", "asr");
        try {
          const got = await fetchJson3Cues(
            `https://www.youtube.com/api/timedtext?${params.toString()}`
          );
          if (got.cues.length) {
            return { cues: got.cues, lang, asr: kind === "asr" || lang.includes("orig") };
          }
        } catch (_) {}
      }
    }
    return null;
  }

  function okCaptionResult(cues, trackMeta, extra = {}) {
    state.captions.track = trackMeta;
    state.captions.cues = cues;
    state.captions.status = "ok";
    state.captions.error = "";
    return {
      ok: true,
      status: "ok",
      count: cues.length,
      cues: cues.map((c) => ({ start: c.start, end: c.end, text: c.text })),
      lang: trackMeta.languageCode || "",
      asr: trackMeta.kind === "asr",
      ...extra,
    };
  }

  async function loadCaptions(payload) {
    const videoId = (payload && payload.videoId) || videoIdFromLocation();
    const preferLang = (payload && payload.lang) || "ja";
    if (!videoId) {
      state.captions = { videoId: "", cues: [], track: null, status: "none", error: "no_video_id" };
      return { ok: false, reason: "no_video_id", status: "none", count: 0, cues: [] };
    }
    if (
      !(payload && payload.force) &&
      state.captions.videoId === videoId &&
      state.captions.status === "ok" &&
      state.captions.cues.length
    ) {
      return {
        ok: true,
        status: "ok",
        count: state.captions.cues.length,
        cues: state.captions.cues.map((c) => ({ start: c.start, end: c.end, text: c.text })),
        lang: state.captions.track?.languageCode || "",
        asr: state.captions.track?.kind === "asr",
      };
    }
    // force Reload may need another CC trigger for this video.
    if (payload && payload.force && ccTriggerVideoId === videoId) {
      ccTriggerVideoId = "";
    }
    state.captions = { videoId, cues: [], track: null, status: "loading", error: "" };
    try {
      // Last-resort once-per-videoId: enable CC only if intercept has nothing yet.
      tryEnablePlayerCaptions(videoId, preferLang);
      const intercepted = await waitForInterceptedCues(videoId, 900);
      if (intercepted?.length) {
        return okCaptionResult(
          intercepted,
          {
            languageCode: preferLang,
            kind: "asr",
            name: "intercept",
          },
          { via: "intercept", baseUrl: state.timedtext.url || "" }
        );
      }

      const { track, tracks } = await waitForCaptionTracks(videoId, preferLang, 8000);
      let lastFetchError = "";

      const tryTracks = [];
      if (state.timedtext.url && (!state.timedtext.videoId || state.timedtext.videoId === videoId)) {
        tryTracks.push({
          baseUrl: state.timedtext.url,
          languageCode: preferLang,
          kind: "asr",
          name: { simpleText: "intercept-url" },
        });
      }
      if (track?.baseUrl) tryTracks.push(track);
      for (const t of tracks || []) {
        if (t?.baseUrl && t !== track) tryTracks.push(t);
      }

      for (const t of tryTracks) {
        const got = await fetchJson3Cues(t.baseUrl);
        if (got.cues.length) {
          return okCaptionResult(got.cues, {
            languageCode: t.languageCode || "",
            kind: t.kind || "",
            name: t.name?.simpleText || "",
          });
        }
        lastFetchError = got.error || lastFetchError;
      }

      // Fresh Innertube tracks if player PR URLs returned empty HTML.
      try {
        const fromApi = await fetchPlayerViaInnertube(videoId);
        const apiTracks = tracksFromPr(fromApi);
        const t = pickCaptionTrack(apiTracks, preferLang);
        if (t?.baseUrl) {
          const got = await fetchJson3Cues(t.baseUrl);
          if (got.cues.length) {
            return okCaptionResult(
              got.cues,
              {
                languageCode: t.languageCode || "",
                kind: t.kind || "",
                name: t.name?.simpleText || "innertube",
              },
              { via: "innertube" }
            );
          }
          lastFetchError = got.error || lastFetchError;
        }
      } catch (_) {}

      const fb = await fetchTimedtextFallback(videoId, preferLang);
      if (fb?.cues?.length) {
        return okCaptionResult(
          fb.cues,
          {
            languageCode: fb.lang || "",
            kind: fb.asr ? "asr" : "",
            name: "timedtext-fallback",
          },
          { fallback: true }
        );
      }

      const reason =
        (tracks && tracks.length) || tryTracks.length
          ? lastFetchError || "timedtext_empty"
          : "no_tracks";
      state.captions.status = "none";
      state.captions.error = reason;
      return {
        ok: false,
        reason,
        status: "none",
        count: 0,
        cues: [],
        trackCount: (tracks && tracks.length) || 0,
        baseUrl: tryTracks[0]?.baseUrl || track?.baseUrl || state.timedtext.url || "",
        lang: tryTracks[0]?.languageCode || track?.languageCode || "",
        asr: (tryTracks[0] || track)?.kind === "asr",
      };
    } catch (err) {
      state.captions.status = "error";
      state.captions.error = String(err);
      return {
        ok: false,
        reason: "exception",
        message: String(err),
        status: "error",
        count: 0,
        cues: [],
      };
    }
  }

  /** Read-only: never call tryEnablePlayerCaptions (poll path must not stutter player). */
  function getTimedtextLink(payload) {
    const videoId = (payload && payload.videoId) || videoIdFromLocation();
    const preferLang = (payload && payload.lang) || "ja";
    const pr = getPlayerResponse(videoId);
    const tracks = tracksFromPr(pr);
    const track = pickCaptionTrack(tracks, preferLang);
    const url =
      (state.timedtext.videoId === videoId && state.timedtext.url) ||
      track?.baseUrl ||
      state.timedtext.url ||
      "";
    const cuesForVid =
      state.timedtext.cues?.length &&
      (!state.timedtext.videoId || state.timedtext.videoId === videoId)
        ? state.timedtext.cues
        : [];
    if (cuesForVid.length) ccTriggerVideoId = videoId;
    return {
      ok: !!url || !!cuesForVid.length,
      baseUrl: url,
      videoId,
      lang: track?.languageCode || "",
      asr: track?.kind === "asr",
      intercepted: !!cuesForVid.length,
      cues: cuesForVid,
    };
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

  function pickCaptionTrack(tracks, preferLang) {
    if (!tracks?.length) return null;
    let best = null;
    let bestScore = -1;
    for (const t of tracks) {
      if (!t?.baseUrl) continue;
      const sc = scoreTrack(t, preferLang);
      if (sc > bestScore) {
        bestScore = sc;
        best = t;
      }
    }
    return best;
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
    let end;
    if (n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0) {
      end = n.start + n.durMs / 1000;
    } else if (n.dur != null && Number.isFinite(n.dur) && n.dur > 0) {
      end = n.start + n.dur;
    } else {
      end = next ? next.start : n.start + 2;
    }
    cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
  }
    return cues;
  }

  function captionAt(mediaTime) {
    const t = Number(mediaTime) || 0;
    const cues = state.captions.cues || [];
    if (!cues.length) {
      return { ok: false, text: "", status: state.captions.status || "idle" };
    }
    let active = null;
    for (const c of cues) {
      const start = Number(c.start) || 0;
      const end = Number(c.end) || 0;
      if (t >= start && t < end) active = c;
    }
    if (!active) return { ok: false, text: "", status: "miss" };
    return { ok: true, text: active.text, start: active.start, end: active.end, status: "ok" };
  }

  window.__HARDSubOCRCapture = {
    bindVideo,
    captureRoi,
    getMediaTime,
    seekTo,
    playAt,
    loadCaptions,
    captionAt,
    getTimedtextLink,
    setRoi(roi) {
      state.roi = { ...state.roi, ...roi };
    },
    getRoi() {
      return { ...state.roi };
    },
  };

  window.addEventListener("message", (ev) => {
    if (!ev.data || ev.data.source !== "hardsub-ocr-ext") return;
    const { type, requestId, payload } = ev.data;

    const reply = (result) => {
      window.postMessage({ source: "hardsub-ocr-page", requestId, result }, "*");
    };

    try {
      if (type === "PING") reply({ ok: true, ready: true });
      else if (type === "BIND") reply({ ok: bindVideo() });
      else if (type === "CAPTURE") reply(captureRoi());
      else if (type === "GET_MEDIA_TIME") reply(getMediaTime());
      else if (type === "SET_ROI") {
        window.__HARDSubOCRCapture.setRoi(payload || {});
        reply({ ok: true, roi: window.__HARDSubOCRCapture.getRoi() });
      } else if (type === "SEEK") reply({ ok: seekTo(payload && payload.mediaTime) });
      else if (type === "PLAY_AT") reply(playAt(payload && payload.mediaTime));
      else if (type === "LOAD_CAPTIONS") {
        loadCaptions(payload || {})
          .then(reply)
          .catch((err) =>
            reply({ ok: false, reason: "exception", message: String(err), cues: [] })
          );
      } else if (type === "GET_TIMEDTEXT_LINK") reply(getTimedtextLink(payload || {}));
      else if (type === "CAPTION_AT") reply(captionAt(payload && payload.mediaTime));
      else reply({ ok: false, reason: "unknown" });
    } catch (err) {
      reply({ ok: false, reason: "exception", message: String(err) });
    }
  });

  document.addEventListener("yt-navigate-finish", () => {
    bindVideo();
    ccTriggerVideoId = "";
    state.captions = { videoId: "", cues: [], track: null, status: "idle", error: "" };
    state.timedtext = { url: "", videoId: "", body: "", cues: [] };
  });
  installTimedtextHooks();
  bindVideo();
})();
