/**
 * Content script: YouTube caption overlay (no OCR, no machine translation).
 * Load timedtext → normalize → merge cache → timeline overlay.
 * EN/VI from import or manual edit; furigana via bridge /tokenize.
 */
(() => {
  const Vocab = globalThis.HardsubVocab || {
    DEFAULT_VOCAB_SETTINGS: {},
    DEFAULT_VOCAB_COLORS: {},
    DEFAULT_LEVEL_COLORS: {},
    classForToken: () => "",
    applyColorVars: () => {},
    applyHighlightVars: (el, s) => {
      // stub: status colors only if shared script missing
      const apply = globalThis.HardsubVocab?.applyColorVars;
      if (apply) apply(el, s?.vocabColors);
    },
    normalizeLevelColors: (c) => c || {},
    tokensNeedEnrich: () => false,
  };

  const DEFAULTS = {
    /** Caption engine (tick / overlay / panel sync). */
    enabled: true,
    showOnVideo: false,
    /** Try open side panel once per tab session (default off — use DỊCH toggle). */
    autoOpen: false,
    showFurigana: true,
    dimHardsub: false,
    sourceLang: "ja",
    copyFormat: "full",
    exportFormat: "ja_en_vi",
    roi: { top: 0.75, left: 0.05, width: 0.9, height: 0.2 },
    maxSentences: 2000,
    panelWidth: 480,
    barPos: null,
    /** User multiplier on video-height-derived overlay fonts/padding (1 = default). */
    barScale: 1,
    /** Independent box size multipliers (width / height). */
    barScaleW: 1,
    barScaleH: 1,
    /** Overlay background alpha (0–1). */
    barBgOpacity: 0.82,
    /** Overlay text alpha (0–1). */
    barTextOpacity: 1,
    barShowJa: true,
    barShowEn: true,
    barShowVi: true,
    /** Dict popup: show cue sentence (VI/EN) under the gloss. */
    dictShowSentence: true,
    ...Vocab.DEFAULT_VOCAB_SETTINGS,
  };

  const CACHE_MATCH_TOL = 0.35;
  const SAVE_DEBOUNCE_MS = 400;

  const Normalize = globalThis.HardsubNormalize || {
    normalizeCues: (cues) => cues || [],
  };

  const CueTiming = globalThis.HardsubCueTiming || {
    clampCueEndsToNextStart: (cues) => cues || [],
    MIN_DUR: 0.45,
    GAP: 0.05,
  };

  const FillYtSecondary = globalThis.HardsubFillYtSecondary || {
    fillYtSecondary: () => 0,
  };

  let settings = { ...DEFAULTS };
  /** @type {Record<string, string>} */
  let userVocab = {};
  let caps = { max_in_flight: 3, max_fps: 10 };
  let translatingIds = new Set();
  let loopTimer = null;
  let healthTimer = null;
  let saveTimer = null;
  let reqSeq = 0;
  const pending = new Map();
  /** @type {Cue[]} */
  let cues = [];
  let currentVideoId = "";
  /** Bumps on each yt-navigate; stale onNavigate/loadAllCaptions bail out. */
  let navigateGen = 0;
  let bridgeReady = false;
  let captionsStatus = "idle";
  let captionsInfo = "";
  let activeCueId = "";
  let listDirty = true;
  /** @returns {{ owned: boolean, tombstones: string[], rev: number, deviceId: string }} */
  const emptyMeta = () => ({ owned: false, tombstones: [], rev: 0, deviceId: "" });
  let transcriptMeta = emptyMeta();
  /** Which copy loadCachedCues last picked — shown in the side panel status line. */
  let scriptSource = { origin: "", rev: 0, updatedAt: "" };
  /** Session: side panel auto-open attempted once per tab (not per navigate). */
  let autoOpenPanelTried = false;
  /** Chrome blocked sidePanel.open — retry on next player gesture. */
  let pendingOpenSidePanel = false;
  let gestureOpenBound = false;
  /** Performance: cached sorted cues + last index hint for O(1) amortized lookup */
  let sortedCuesCache = null;
  let sortedCuesGen = -1;
  let lastCueIndex = 0;
  /** Performance: dynamic tick interval based on playback state */
  let tickIntervalMs = 250;
  let isPlaying = false;

  /**
   * @typedef {{
   *   id: string,
   *   start_media_time: number,
   *   end_media_time: number,
   *   source: string,
   *   en: string,
   *   vi: string,
   *   tokens: any[],
   *   translated: boolean,
   *   text_source: string,
   *   mt_locked?: boolean,
   *   translation_source?: string,
   * }} Cue
   */

  /** User/import owns EN/VI — do not overwrite on cache merge (tokens enrich OK). */
  function isMtLocked(c) {
    if (!c) return false;
    if (c.mt_locked) return true;
    const src = String(c.translation_source || "");
    return src === "user" || src === "import";
  }

  function lockCueTranslation(c, source) {
    if (!c) return;
    c.mt_locked = true;
    c.translation_source = source === "import" ? "import" : "user";
  }

  function unlockCueTranslation(c) {
    if (!c) return;
    c.mt_locked = false;
    c.translation_source = "";
  }

  // Must match page_capture.js API_VER — stale MAIN-world inject lacks FETCH_MULTI_LANG.
  const PAGE_API_VER = 3;

  function injectPageScript(force = false) {
    const existing = document.getElementById("hardsub-ocr-page-script");
    if (existing && !force) return;
    if (existing) existing.remove();
    if (force) {
      // Clear MAIN-world guard so re-fetched page_capture.js can rebind.
      const boot = document.createElement("script");
      boot.textContent =
        "try{if(window.__hardsubPageMsgHandler){window.removeEventListener('message',window.__hardsubPageMsgHandler);delete window.__hardsubPageMsgHandler;}delete window.__HARDSubOCRCapture;}catch(e){}";
      (document.documentElement || document.head).appendChild(boot);
      boot.remove();
    }
    const s = document.createElement("script");
    s.id = "hardsub-ocr-page-script";
    s.src =
      chrome.runtime.getURL("injected/page_capture.js") +
      "?v=" +
      encodeURIComponent(chrome.runtime.getManifest().version);
    (document.head || document.documentElement).appendChild(s);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitForPageBridge(maxMs = 8000) {
    injectPageScript(false);
    const t0 = Date.now();
    let forced = false;
    while (Date.now() - t0 < maxMs) {
      const r = await pageCall("PING", {}, 300);
      if (r?.ok && Number(r.apiVer) === PAGE_API_VER) return true;
      if (r?.ok && Number(r.apiVer) !== PAGE_API_VER && !forced) {
        forced = true;
        injectPageScript(true);
      } else if (!r?.ok && !forced && Date.now() - t0 > 600) {
        forced = true;
        injectPageScript(true);
      }
      await sleep(150);
    }
    return false;
  }

  function pageCall(type, payload, timeoutMs = 800) {
    const requestId = `r${++reqSeq}`;
    return new Promise((resolve) => {
      pending.set(requestId, resolve);
      window.postMessage({ source: "hardsub-ocr-ext", type, requestId, payload }, "*");
      setTimeout(() => {
        if (pending.has(requestId)) {
          pending.delete(requestId);
          resolve({ ok: false, reason: "timeout" });
        }
      }, timeoutMs);
    });
  }

  function parseJson3Cues(data) {
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
    // YSD-style <text start="" dur="">
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
    if (textNodes.length) {
      const cues = [];
      for (let i = 0; i < textNodes.length; i += 1) {
        const n = textNodes[i];
        if (!n.text) continue;
        const next = textNodes[i + 1];
        const end = next ? next.start : n.start + Math.max(0.2, n.dur || 2);
        cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
      }
      if (cues.length) return cues;
    }

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
        return parseJson3Cues(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }
    if (trimmed[0] === "<") return parseTimedtextXml(trimmed);
    return [];
  }

  async function loadCaptionsViaBackground(videoId, lang, extra = {}) {
    try {
      const r = await chrome.runtime.sendMessage({
        type: "YT_LOAD_CAPTIONS",
        videoId,
        lang: lang || "ja",
        baseUrl: extra.baseUrl || "",
        asr: !!extra.asr,
      });
      if (r?.ok && Array.isArray(r.cues) && r.cues.length) return r;
      return r || { ok: false, reason: "sw_empty", cues: [] };
    } catch (err) {
      return { ok: false, reason: "sw_exception", message: String(err), cues: [] };
    }
  }

  async function fetchTimedtextInContent(baseUrl) {
    if (!baseUrl) return null;
    let url = String(baseUrl);
    const tryUrls = [url];
    if (!url.includes("fmt=")) {
      tryUrls.push(`${url}${url.includes("?") ? "&" : "?"}fmt=json3`);
    }
    for (const u of tryUrls) {
      try {
        const res = await fetch(u, { credentials: "include", cache: "no-store" });
        if (res.ok) {
          const cues = parseTimedtextBody(await res.text());
          if (cues.length) return cues;
        }
      } catch {
        /* next */
      }
      try {
        const sw = await chrome.runtime.sendMessage({ type: "YT_FETCH", url: u });
        if (sw?.text) {
          const cues = parseTimedtextBody(sw.text);
          if (cues.length) return cues;
        }
      } catch {
        /* next */
      }
    }
    return null;
  }

  async function syncToPlayhead() {
    if (!cues.length) {
      activeCueId = "";
      updateBar(null);
      return null;
    }
    const mtRes = await pageCall("GET_MEDIA_TIME", {}, 400);
    const mediaTime = Number(mtRes?.mediaTime);
    if (!Number.isFinite(mediaTime)) return null;
    const active = findActiveCue(mediaTime);
    activeCueId = active?.id || "";
    updateBar(active);
    return active;
  }

  async function applyLoadedCues(rawCues, info, opts = {}) {
    const gen = navigateGen;
    const vid = currentVideoId;
    captionsStatus = "ok";
    captionsInfo = info;
    const normalized = CueTiming.clampCueEndsToNextStart(
      Normalize.normalizeCues(rawCues)
    );
    // Fresh YT only — skip chrome.storage + disk merge (after wipe / hard reset).
    if (opts.skipCache) {
      if (gen !== navigateGen || currentVideoId !== vid) return;
      transcriptMeta = emptyMeta();
      cues = mergeCache(normalized, [], transcriptMeta);
      // Invalidate sorted cache on cues change
      sortedCuesGen = -1;
      sortedCuesCache = null;
      lastCueIndex = 0;
      applyYtSecondaryFill(opts);
      listDirty = true;
      await syncToPlayhead();
      updateCaptionStatusLine();
      await saveTranscript({ force: true, awaitDisk: true });
      // B8: tokenize every video after first JA publish (not only owned).
      void enrichTokensAfterImport();
      return;
    }
    const cached = await loadCachedCues(currentVideoId);
    if (gen !== navigateGen || currentVideoId !== vid) return;
    const meta = await loadTranscriptMeta(currentVideoId);
    if (gen !== navigateGen || currentVideoId !== vid) return;
    transcriptMeta = meta;
    const merged = mergeCache(normalized, cached, meta);
    // Owned/import script wins: mergeCache keeps file timeline and does not
    // append unmatched YT cues (score-based pick used to prefer polluted merges).
    if (meta.owned && cached.some(isOwnedCue)) {
      cues = merged.length ? merged : cuesFromSavedScript(cached);
      captionsInfo = `${info} · owned script`;
    } else {
      // Heal previously saved rolling-ASR overlaps (cache still had long ends).
      cues = CueTiming.clampCueEndsToNextStart(merged);
    }
    // Invalidate sorted cache on cues change
    sortedCuesGen = -1;
    sortedCuesCache = null;
    lastCueIndex = 0;
    applyYtSecondaryFill(opts);
    listDirty = true;
    // Align list/overlay to current playhead before first publish (mid-video open).
    await syncToPlayhead();
    if (gen !== navigateGen || currentVideoId !== vid) return;
    // Status first so the publish includes real cached N/M (not stale 0/0).
    updateCaptionStatusLine();
    // Never auto-save a YT merge that would clobber a richer owned script.
    if (!meta.owned || scriptListScore(cues) >= scriptListScore(cached)) {
      scheduleSaveTranscript();
    }
    // B8: always enrich when cues lack tokens — remove owned gate.
    void enrichTokensAfterImport();
  }

  /**
   * Union-merge YT en/vi into cue rows (±tol or overlap): fill empty unlocked,
   * append orphans when not owned. Triggers save + panel via callers.
   */
  function applyYtSecondaryFill(opts) {
    const n = FillYtSecondary.fillYtSecondary(cues, opts?.enCues, opts?.viCues, {
      tol: CACHE_MATCH_TOL,
      isLocked: isMtLocked,
      // Owned timeline is authoritative — paint blanks only, no orphan rows.
      appendOrphans: !transcriptMeta.owned,
    });
    // Heal pending count when en/vi already present but translated flag lagged.
    for (const c of cues) {
      if (c.translated) continue;
      if (String(c.en || "").trim() || String(c.vi || "").trim()) {
        c.translated = true;
      }
    }
    return n;
  }

  function langFromTimedtextUrl(url) {
    try {
      return new URL(String(url || ""), location.href).searchParams.get("lang") || "";
    } catch {
      return "";
    }
  }

  function isJaLang(lang) {
    return String(lang || "")
      .toLowerCase()
      .startsWith("ja");
  }

  function stampSecondaryStatus(enN, viN) {
    const base = String(captionsInfo || "").replace(/\s*·\s*en:\d+\s+vi:\d+\s*$/i, "");
    captionsInfo = `${base} · en:${enN} vi:${viN}`;
  }

  function logYtSecondaryMiss(sw, enN, viN) {
    const msg = `yt secondary miss video=${currentVideoId || "?"} hasEn=${!!sw?.hasEn} hasVi=${!!sw?.hasVi} en:${enN} vi:${viN}`;
    void bridgeFetch("/log", {
      method: "POST",
      body: { level: "WARNING", message: msg },
    }).catch(() => {});
  }

  /**
   * Await SW pack, union-fill EN/VI, publish. Never fire-and-forget — silent n===0
   * left VI/EN blank after ja-intercept early-win.
   */
  async function applySecondaryFromSw(sw) {
    if (!sw) return 0;
    const enN = Array.isArray(sw.enCues) ? sw.enCues.length : 0;
    const viN = Array.isArray(sw.viCues) ? sw.viCues.length : 0;
    const n = applyYtSecondaryFill({ enCues: sw.enCues, viCues: sw.viCues });
    stampSecondaryStatus(enN, viN);
    if ((sw.hasEn || sw.hasVi) && enN + viN === 0) {
      logYtSecondaryMiss(sw, enN, viN);
    }
    if (n) {
      listDirty = true;
      scheduleSaveTranscript();
    }
    // Always push cue rows — status-only publish left EN/VI blank in the panel.
    updateCaptionStatusLine();
    publishSidePanelState({ forceList: true });
    return n;
  }

  /**
   * B6: when SW hasEn/hasVi but empty packs (or no packs), page-fetch (web then
   * ANDROID rescue) — no setOption per lang. VI stays in viCues only.
   */
  async function ensureSecondaryPacks(sw) {
    let enCues = Array.isArray(sw?.enCues) ? sw.enCues : [];
    let viCues = Array.isArray(sw?.viCues) ? sw.viCues : [];
    let hasEn = !!sw?.hasEn;
    let hasVi = !!sw?.hasVi;
    const needPage =
      (hasEn && !enCues.length) ||
      (hasVi && !viCues.length) ||
      (!enCues.length && !viCues.length);
    if (!needPage) {
      return { enCues, viCues, hasEn, hasVi };
    }
    // Stale page API (pre-FETCH_MULTI_LANG) → force reinject before multi-fetch.
    const ping = await pageCall("PING", {}, 400);
    if (!ping?.ok || Number(ping.apiVer) !== PAGE_API_VER) {
      injectPageScript(true);
      await sleep(200);
    }
    const page = await pageCall(
      "FETCH_MULTI_LANG",
      { videoId: currentVideoId, lang: settings.sourceLang },
      20000
    );
    if (Array.isArray(page?.enCues) && page.enCues.length) enCues = page.enCues;
    if (Array.isArray(page?.viCues) && page.viCues.length) viCues = page.viCues;
    if (page?.hasEn) hasEn = true;
    if (page?.hasVi) hasVi = true;
    if ((hasEn || hasVi) && !enCues.length && !viCues.length) {
      logYtSecondaryMiss(
        { hasEn, hasVi, via: page?.via || page?.reason || "page_multi" },
        0,
        0
      );
    }
    return {
      enCues,
      viCues,
      hasEn,
      hasVi,
      // Optional JA rescue for callers that still need source — never put VI here.
      cues: Array.isArray(page?.cues) ? page.cues : [],
      via: page?.via || "page_multi",
    };
  }

  /** B7: fill EN/VI async after JA paint — do not block panel return. */
  function kickSecondaryFill(sw) {
    const gen = navigateGen;
    const vid = currentVideoId;
    void (async () => {
      try {
        const packs = await ensureSecondaryPacks(sw);
        if (gen !== navigateGen || currentVideoId !== vid) return;
        await applySecondaryFromSw(packs);
      } catch (_) {
        /* secondary miss already logged inside apply when needed */
      }
    })();
  }

  window.addEventListener("message", (ev) => {
    if (!ev.data || ev.data.source !== "hardsub-ocr-page") return;
    const { requestId, result } = ev.data;
    const resolve = pending.get(requestId);
    if (resolve) {
      pending.delete(requestId);
      resolve(result);
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "DRIVE_RESTORED") {
      const only = Array.isArray(msg.videoIds) ? msg.videoIds : null;
      if (only && currentVideoId && !only.includes(currentVideoId)) {
        sendResponse({ ok: true, skipped: "other_video" });
        return true;
      }
      // Bridge disk updated from Drive — drop the stale cue cache only. Keeping
      // transcriptMeta keeps `owned` alive, which is what made restores fall back to YT.
      void (async () => {
        try {
          if (currentVideoId) {
            await chrome.storage.local.remove([`transcript:${currentVideoId}`]);
          }
          const restored = await tryApplySavedScript("drive", { quiet: true });
          if (!restored) {
            await loadAllCaptions(true, { skipCache: false });
          } else if (cues.some(isOwnedCue)) {
            transcriptMeta.owned = true;
            await saveTranscriptMeta();
          }
        } catch (_) {}
      })();
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type !== "SP_CMD") return;
    handleSidePanelCmd(msg)
      .then((r) => sendResponse(r || { ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  });

  async function handleSidePanelCmd(msg) {
    const cmd = msg.cmd;
    if (cmd === "ping") {
      // Side panel open / reconnect must always receive the full cue list.
      publishSidePanelState({ forceList: true });
      return { ok: true, videoId: currentVideoId, count: cues.length };
    }
    if (cmd === "reload") {
      toast("Đang tải caption…");
      // Force fresh YT timeline (skip stale overlapping chrome/disk ends).
      await loadAllCaptions(true, { skipCache: false });
      if (cues.length && !transcriptMeta.owned) {
        cues = CueTiming.clampCueEndsToNextStart(cues);
        listDirty = true;
        scheduleSaveTranscript();
        publishSidePanelState({ forceList: true });
      }
      if (cues.length) toast(`Đã tải ${cues.length} câu`);
      else toast(`Không có caption (${captionsInfo || captionsStatus})`);
      return { ok: true, count: cues.length };
    }
    if (cmd === "refresh_script") {
      await checkDriveFresh(currentVideoId, { force: true });
      const ok = await tryApplySavedScript("refresh", { quiet: true });
      toast(ok ? `Đã làm mới (${cues.length} câu)` : "Không có bản lưu nào mới");
      return { ok: true, count: cues.length };
    }
    if (cmd === "wipe_saved_and_reload") {
      await wipeSavedScriptAndReload();
      return { ok: true, count: cues.length };
    }
    if (cmd === "toggle_overlay") {
      const showOnVideo = await toggleShowOnVideo();
      return { ok: true, showOnVideo };
    }
    if (cmd === "export") {
      exportTxt();
      return { ok: true };
    }
    if (cmd === "play") {
      pageCall("PLAY_AT", { mediaTime: Number(msg.mediaTime) });
      return { ok: true };
    }
    if (cmd === "copy") {
      const ok = await copyCue(resolveCueIndex(msg), msg.format || "full");
      return { ok: !!ok };
    }
    if (cmd === "edit_ja") {
      await onJaEdit(resolveCueIndex(msg), msg.text);
      return { ok: true };
    }
    if (cmd === "edit_en") {
      await onEnEdit(resolveCueIndex(msg), msg.text);
      return { ok: true };
    }
    if (cmd === "edit_vi") {
      await onViEdit(resolveCueIndex(msg), msg.text);
      return { ok: true };
    }
    if (cmd === "edit_timeline") {
      await onTimelineEdit(resolveCueIndex(msg), msg.start, msg.end);
      return { ok: true };
    }
    if (cmd === "add_cue") {
      const added = await addCue({
        afterId: msg.afterId || "",
        atTime: msg.atTime,
      });
      return { ok: !!added, id: added?.id || "", count: cues.length };
    }
    if (cmd === "delete_cue") {
      const ok = await deleteCueById(String(msg.id || ""));
      return { ok, count: cues.length };
    }
    if (cmd === "clear_translations") {
      await clearTranslations();
      return { ok: true, count: cues.length };
    }
    if (cmd === "import_cues") {
      const mode = msg.mode === "replace" ? "replace" : "merge";
      const stats = await importCues(msg.cues || [], {
        mode,
        // Full replace always includes JA + timeline from the file.
        includeJa: mode === "replace" ? true : !!msg.includeJa,
      });
      return { ok: true, count: cues.length, ...stats };
    }
    if (cmd === "set_user_vocab") {
      await setUserVocabStatus(msg.lemma, msg.status || "");
      return { ok: true };
    }
    if (cmd === "SHOW_PAGE_DICT" || cmd === "show_dict") {
      ensureUI();
      await showPageDictFromSidePanel(msg);
      return { ok: true };
    }
    if (cmd === "HIDE_PAGE_DICT" || cmd === "hide_dict") {
      // Longer grace: pointer must cross from side panel chrome onto the page popup.
      scheduleHideDict(520);
      return { ok: true };
    }
    return { ok: false, reason: "unknown_cmd" };
  }
  function bridgeFetch(path, opts = {}) {
    return chrome.runtime.sendMessage({
      type: "BRIDGE_FETCH",
      path,
      method: opts.method || "GET",
      body: opts.body,
      isForm: !!opts.isForm,
    });
  }

  function videoIdFromUrl() {
    try {
      return new URLSearchParams(location.search).get("v") || "";
    } catch {
      return "";
    }
  }

  async function loadSettings() {
    const data = await chrome.storage.local.get(["hardsubSettings", "userVocab"]);
    settings = { ...DEFAULTS, ...(data.hardsubSettings || {}) };
    if (settings.vocabColors) {
      settings.vocabColors = {
        ...(Vocab.DEFAULT_VOCAB_COLORS || {}),
        ...settings.vocabColors,
      };
    }
    settings.levelColors = Vocab.normalizeLevelColors(
      settings.levelColors || Vocab.DEFAULT_LEVEL_COLORS
    );
    if (settings.levelHighlightEnabled == null) {
      settings.levelHighlightEnabled = true;
    }
    if (settings.dictShowSentence == null) settings.dictShowSentence = true;
    if (settings.autoOpen == null) settings.autoOpen = DEFAULTS.autoOpen;
    if (settings.showOnVideo == null) settings.showOnVideo = DEFAULTS.showOnVideo;
    if (settings.barBgOpacity == null) settings.barBgOpacity = DEFAULTS.barBgOpacity;
    if (settings.barTextOpacity == null) settings.barTextOpacity = DEFAULTS.barTextOpacity;
    if (settings.barShowJa == null) settings.barShowJa = true;
    if (settings.barShowEn == null) settings.barShowEn = true;
    if (settings.barShowVi == null) settings.barShowVi = true;
    if (settings.barScale == null || !Number.isFinite(Number(settings.barScale))) {
      settings.barScale = DEFAULTS.barScale;
    }
    // Migrate legacy uniform barScale → independent W/H when missing.
    if (settings.barScaleW == null || !Number.isFinite(Number(settings.barScaleW))) {
      settings.barScaleW = Number(settings.barScale) || DEFAULTS.barScaleW;
    }
    if (settings.barScaleH == null || !Number.isFinite(Number(settings.barScaleH))) {
      settings.barScaleH = Number(settings.barScale) || DEFAULTS.barScaleH;
    }
    userVocab = data.userVocab && typeof data.userVocab === "object" ? data.userVocab : {};
  }

  async function saveSettings() {
    await chrome.storage.local.set({ hardsubSettings: settings });
  }

  async function setUserVocabStatus(lemma, status) {
    const key = String(lemma || "").trim();
    if (!key) return;
    if (!status) {
      delete userVocab[key];
    } else {
      userVocab[key] = status;
    }
    await chrome.storage.local.set({ userVocab: { ...userVocab } });
    listDirty = true;
    const active = cues.find((c) => c.id === activeCueId);
    if (active) updateBar(active);
    publishSidePanelState();
  }

  function markButtonsHtml(lemma) {
    const cur = userVocab[lemma] || "";
    const marks = [
      ["known", "Đã biết"],
      ["learning", "Học"],
      ["ignored", "Đừng học"],
      ["special", "Đặc biệt"],
    ];
    return `<div class="dict-marks" data-lemma="${escapeAttr(lemma)}">${marks
      .map(
        ([id, label]) =>
          `<button type="button" data-mark="${id}" class="${cur === id ? "active" : ""}">${label}</button>`
      )
      .join("")}<button type="button" data-mark="">Xóa</button></div>`;
  }

  function bindDictMarks(dictEl) {
    dictEl.querySelectorAll(".dict-marks button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wrap = btn.closest(".dict-marks");
        const lemma = wrap?.dataset.lemma || "";
        const mark = btn.dataset.mark || "";
        setUserVocabStatus(lemma, mark);
        if (wrap) {
          wrap.querySelectorAll("button").forEach((b) => {
            b.classList.toggle("active", b.dataset.mark === mark && !!mark);
          });
        }
      });
    });
  }

  function compactSource(s) {
    return String(s || "")
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .trim();
  }

  function flattenCached(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      if (Array.isArray(item.segments)) {
        for (const seg of item.segments) {
          if (!seg) continue;
          out.push({
            start_media_time: Number(seg.start_media_time) || 0,
            end_media_time: Number(seg.end_media_time) || Number(seg.start_media_time) || 0,
            source: seg.source || "",
            en: seg.en || "",
            vi: seg.vi || "",
            tokens: seg.tokens || [],
            translated: !!(seg.translated || (seg.vi && String(seg.vi).trim())),
          });
        }
        continue;
      }
      out.push({
        start_media_time: Number(item.start_media_time ?? item.start ?? item.media_time) || 0,
        end_media_time: Number(item.end_media_time ?? item.end ?? item.start_media_time) || 0,
        source: item.source || item.text || "",
        en: item.en || "",
        vi: item.vi || "",
        tokens: item.tokens || [],
        translated: !!(item.translated || (item.vi && String(item.vi).trim())),
        id: item.id || "",
        text_source: item.text_source || "yt",
        mt_locked: !!item.mt_locked,
        translation_source: item.translation_source || "",
      });
    }
    return out;
  }

  function cacheCueScore(c) {
    let s = 0;
    if (c?.translated) s += 4;
    if (String(c?.vi || "").trim()) s += 2;
    if (String(c?.en || "").trim()) s += 1;
    if (Array.isArray(c?.tokens) && c.tokens.length) s += 1;
    if (isOwnedCue(c)) s += 3;
    if (String(c?.source || "").trim()) s += 1;
    else s += 0.5; // empty draft still counts
    return s;
  }

  function scriptListScore(list) {
    let s = 0;
    for (const c of list || []) s += cacheCueScore(c);
    s += (list || []).length * 0.25;
    return s;
  }

  function isOwnedCue(c) {
    const src = String(c?.text_source || "");
    return src === "edit" || src === "manual" || src === "script";
  }

  function cacheCueKey(c) {
    const start = Number(c?.start_media_time) || 0;
    return `${start.toFixed(2)}|${compactSource(c?.source)}`;
  }

  function tombstoneKey(c) {
    return cacheCueKey(c);
  }

  function metaStorageKey(videoId) {
    return `transcriptMeta:${videoId}`;
  }

  /** Cheap freshness probe (~113 B) — compare rev before pulling a 144 KB body. */
  async function loadDiskMeta(videoId) {
    if (!videoId) return null;
    try {
      const res = await bridgeFetch(`/scripts/${encodeURIComponent(videoId)}/meta`, {
        method: "GET",
      });
      if (!res?.ok || !res.data?.video_id) return null;
      return res.data;
    } catch (_) {
      return null;
    }
  }

  /**
   * chrome.storage may be wiped (Drive restore, profile reset) while disk keeps the
   * truth, so `owned` / `rev` / `deviceId` come from whichever side has the higher rev.
   * Tombstones only ever live in chrome.storage.
   */
  async function loadTranscriptMeta(videoId) {
    if (!videoId) return emptyMeta();
    const key = metaStorageKey(videoId);
    const data = await chrome.storage.local.get([key]);
    const raw = data[key] || {};
    const disk = (await loadDiskMeta(videoId)) || {};
    const localRev = Number(raw.rev) || 0;
    const diskRev = Number(disk.rev) || 0;
    const owner = diskRev > localRev || !data[key] ? disk : raw;
    return {
      owned: !!owner.owned,
      rev: Math.max(localRev, diskRev),
      deviceId: String(raw.deviceId || disk.deviceId || ""),
      tombstones: Array.isArray(raw.tombstones)
        ? raw.tombstones.map(String).filter(Boolean)
        : [],
    };
  }

  async function saveTranscriptMeta() {
    if (!currentVideoId) return;
    const key = metaStorageKey(currentVideoId);
    await chrome.storage.local.set({
      [key]: {
        owned: !!transcriptMeta.owned,
        rev: Number(transcriptMeta.rev) || 0,
        deviceId: String(transcriptMeta.deviceId || ""),
        updatedAt: new Date().toISOString(),
        tombstones: Array.from(new Set(transcriptMeta.tombstones || [])),
      },
    });
  }

  async function markScriptOwned() {
    transcriptMeta.owned = true;
    await saveTranscriptMeta();
  }

  /** Prefer richer MT among chrome.storage + disk script caches. */
  function mergeCacheLists(...lists) {
    const byKey = new Map();
    for (const list of lists) {
      for (const c of flattenCached(list)) {
        // Keep empty drafts (owned/manual) — only drop totally empty unknown rows.
        if (!c.source && !c.vi && !c.en && !c.id && !isOwnedCue(c)) continue;
        const key = c.id ? `id:${c.id}` : cacheCueKey(c);
        const prev = byKey.get(key);
        if (!prev) {
          byKey.set(key, c);
          continue;
        }
        // Same stable id: richer wins. A poor YT auto-save in chrome.storage
        // must not permanently shadow an owned/translated disk script (same ids).
        // "Xóa dịch" awaits disk, so cleared chrome is not resurrected from stale disk.
        if (cacheCueScore(c) > cacheCueScore(prev)) byKey.set(key, c);
      }
    }
    return Array.from(byKey.values());
  }

  async function loadDiskScript(videoId) {
    if (!videoId) return [];
    try {
      const res = await bridgeFetch(`/scripts/${encodeURIComponent(videoId)}`, {
        method: "GET",
      });
      if (!res?.ok || !res.data?.found) return [];
      return flattenCached(res.data.cues || []);
    } catch (_) {
      return [];
    }
  }

  /**
   * Lamport rev decides, so deletes survive; equal revs fall back to richness and
   * finally deviceId so two machines at the same rev still agree on a winner.
   * @returns {"local"|"disk"}
   */
  function pickCacheSide(local, disk) {
    const lRev = Number(local?.rev) || 0;
    const dRev = Number(disk?.rev) || 0;
    if (lRev !== dRev) return lRev > dRev ? "local" : "disk";
    const lScore = Number(local?.score) || 0;
    const dScore = Number(disk?.score) || 0;
    if (lScore !== dScore) return lScore > dScore ? "local" : "disk";
    return String(local?.deviceId || "") >= String(disk?.deviceId || "") ? "local" : "disk";
  }

  /** Sole gate every load path goes through (navigate / restore / YT merge). */
  async function loadCachedCues(videoId) {
    if (!videoId) return [];
    const key = `transcript:${videoId}`;
    const mKey = metaStorageKey(videoId);
    const data = await chrome.storage.local.get([key, mKey]);
    const local = flattenCached(data[key] || []);
    const localMeta = data[mKey] || {};
    const diskMeta = (await loadDiskMeta(videoId)) || {};
    const noteSide = (side) => {
      const m = side === "local" ? localMeta : diskMeta;
      scriptSource = {
        origin: side === "local" ? "chrome" : "disk",
        rev: Math.max(Number(localMeta.rev) || 0, Number(diskMeta.rev) || 0),
        updatedAt: String(m.updatedAt || m.updated_at || ""),
      };
      return side;
    };
    const sameRev = (Number(localMeta.rev) || 0) === (Number(diskMeta.rev) || 0);
    // Same rev from the same writer is the same save — the copy in hand will do.
    if (sameRev && local.length && localMeta.deviceId && localMeta.deviceId === diskMeta.deviceId) {
      noteSide("local");
      return hydrateTokens(videoId, local);
    }
    // A real tie (two writers at one rev) is the only case needing both bodies.
    if (sameRev) {
      const disk = await loadDiskScript(videoId);
      const side = noteSide(
        pickCacheSide(
          { rev: localMeta.rev, score: scriptListScore(local), deviceId: localMeta.deviceId },
          { rev: diskMeta.rev, score: scriptListScore(disk), deviceId: diskMeta.deviceId }
        )
      );
      return hydrateTokens(
        videoId,
        side === "local" ? mergeCacheLists(local, disk) : mergeCacheLists(disk, local)
      );
    }
    if (noteSide(pickCacheSide(localMeta, diskMeta)) === "local" && local.length) {
      return hydrateTokens(videoId, local);
    }
    const disk = await loadDiskScript(videoId);
    noteSide(disk.length ? "disk" : "local");
    return hydrateTokens(videoId, disk.length ? disk : local);
  }

  /** cues.json / chrome.storage carry no tokens — refill from tokens.json for furigana. */
  async function hydrateTokens(videoId, list) {
    if (!list.length) return list;
    // Fill only cues still missing tokens (partial in-memory tokens must not skip the rest).
    if (list.every((c) => !String(c.source || "").trim() || c.tokens?.length)) return list;
    try {
      const res = await bridgeFetch(`/scripts/${encodeURIComponent(videoId)}/tokens`, {
        method: "GET",
      });
      const map = res?.ok && res.data && typeof res.data === "object" ? res.data : null;
      if (!map) return list;
      for (const c of list) {
        if (c.tokens?.length) continue;
        const t = map[c.id];
        if (Array.isArray(t) && t.length) c.tokens = t;
      }
    } catch (_) {}
    return list;
  }

  function scheduleSaveTranscript() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveTranscript();
    }, SAVE_DEBOUNCE_MS);
  }

  function pageTitle() {
    try {
      const t =
        document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent ||
        document.querySelector("h1.title")?.textContent ||
        document.title ||
        "";
      return String(t)
        .replace(/\s*-\s*YouTube\s*$/i, "")
        .trim();
    } catch {
      return "";
    }
  }

  async function saveTranscriptToDisk(payload) {
    if (!currentVideoId || !payload?.length) return;
    const videoId = currentVideoId;
    try {
      const res = await bridgeFetch("/scripts/save", {
        method: "POST",
        body: {
          video_id: videoId,
          url: location.href || "",
          title: pageTitle(),
          cues: payload,
          owned: !!transcriptMeta.owned,
          rev: Number(transcriptMeta.rev) || 0,
        },
      });
      // Bridge answers with the Lamport rev it just wrote — adopt it, never guess.
      const rev = Number(res?.data?.rev) || 0;
      if (rev && videoId === currentVideoId && rev > (Number(transcriptMeta.rev) || 0)) {
        transcriptMeta.rev = rev;
        await saveTranscriptMeta();
      }
      // Idle-debounced Drive mirror of this one video's folder.
      try {
        chrome.runtime
          .sendMessage({ type: "DRIVE_UPLOAD_SCHEDULE", videoId })
          .catch(() => {});
      } catch (_) {}
    } catch (_) {
      /* bridge offline — chrome.storage still holds a copy */
    }
  }

  async function saveTranscript(opts = {}) {
    if (!currentVideoId) return;
    const force = !!opts.force;
    const key = `transcript:${currentVideoId}`;
    const payload = cues.slice(0, settings.maxSentences).map((c) => ({
      id: c.id,
      start_media_time: c.start_media_time,
      end_media_time: c.end_media_time,
      source: c.source,
      en: c.en,
      vi: c.vi,
      tokens: c.tokens || [],
      translated: !!c.translated,
      text_source: c.text_source || "yt",
      mt_locked: !!c.mt_locked,
      translation_source: c.translation_source || "",
    }));
    // Guard: an in-memory list older than what is cached must not roll it back.
    // force=true for intentional clears / replace so a wipe is never blocked.
    const rev = Number(transcriptMeta.rev) || 0;
    try {
      if (!force) {
        const mKey = metaStorageKey(currentVideoId);
        const existingMeta = (await chrome.storage.local.get([mKey]))[mKey];
        if (rev < (Number(existingMeta?.rev) || 0)) return;
      }
    } catch (_) {}
    // chrome.storage copy stays slim: tokens live in tokens.json (hydrateTokens refills).
    await chrome.storage.local.set({
      [key]: payload.map(({ tokens, ...rest }) => rest),
    });
    await saveTranscriptMeta();
    if (!force) {
      try {
        const diskMeta = await loadDiskMeta(currentVideoId);
        if (rev < (Number(diskMeta?.rev) || 0)) return;
      } catch (_) {}
    }
    // Persist readable script.txt + cues.json under scripts/{videoId}/ via bridge.
    if (opts.awaitDisk) {
      await saveTranscriptToDisk(payload);
    } else {
      void saveTranscriptToDisk(payload);
    }
  }

  function cueId(start, source) {
    return `c-${start.toFixed(3)}-${compactSource(source).slice(0, 24)}`;
  }

  function newStableCueId() {
    return `c-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function findCachedMatch(cacheList, start, source) {
    const compact = compactSource(source);
    let hit = null;
    for (const prev of cacheList || []) {
      const dt = Math.abs((Number(prev.start_media_time) || 0) - start);
      if (dt > CACHE_MATCH_TOL) continue;
      const prevSrc = String(prev.source || "");
      if (prevSrc === source || compactSource(prevSrc) === compact) {
        hit = prev;
        break;
      }
    }
    return hit;
  }

  /**
   * Merge YT timedtext with saved cache.
   * Owned scripts: keep saved timing/source; skip tombstones; never append YT.
   */
  function mergeCache(ytCues, cached, meta = transcriptMeta) {
    const cacheList = cached || [];
    const stones = new Set(meta?.tombstones || []);
    const owned = !!meta?.owned || cacheList.some(isOwnedCue);

    if (owned && cacheList.length) {
      // Owned/import timeline is authoritative — keep script start/end exactly.
      // Do not append unmatched YT cues (Reload must not pollute import replace).
      const out = cuesFromSavedScript(cacheList);
      for (const raw of ytCues || []) {
        const start = Number(raw.start) || 0;
        const source = String(raw.text || "").trim();
        const tKey = `${start.toFixed(2)}|${compactSource(source)}`;
        if (stones.has(tKey)) continue;
        for (const prev of out) {
          const dt = Math.abs((Number(prev.start_media_time) || 0) - start);
          if (dt > CACHE_MATCH_TOL) continue;
          const prevSrc = String(prev.source || "");
          if (
            !(
              prevSrc === source ||
              compactSource(prevSrc) === compactSource(source) ||
              (isOwnedCue(prev) && dt <= CACHE_MATCH_TOL)
            )
          ) {
            continue;
          }
          // Fill missing MT from cache hit only if owned cue lacks it.
          if (!prev.translated) {
            const hit = findCachedMatch(cacheList, start, source);
            if (hit && (hit.vi || hit.en)) {
              prev.en = hit.en || prev.en || "";
              prev.vi = hit.vi || prev.vi || "";
              prev.tokens = hit.tokens || prev.tokens || [];
              prev.translated = !!(prev.vi || prev.en);
              if (hit.mt_locked) {
                prev.mt_locked = true;
                prev.translation_source =
                  hit.translation_source || prev.translation_source || "import";
              }
            }
          }
          break;
        }
      }
      out.sort((a, b) => a.start_media_time - b.start_media_time);
      return out;
    }

    // Fresh / non-owned: YT timeline + MT from cache; honor tombstones.
    return (ytCues || [])
      .map((c) => {
        const start = Number(c.start) || 0;
        const end = Number(c.end) || start + 2;
        const source = String(c.text || "").trim();
        const tKey = `${start.toFixed(2)}|${compactSource(source)}`;
        if (stones.has(tKey)) return null;
        const hit = findCachedMatch(cacheList, start, source);
        const hasMt = !!(hit && (String(hit.vi || "").trim() || String(hit.en || "").trim()));
        const translated = !!(hit && hit.translated && hasMt);
        return {
          id: (hit && hit.id) || cueId(start, source),
          start_media_time: hit && isOwnedCue(hit) ? Number(hit.start_media_time) || start : start,
          end_media_time: hit && isOwnedCue(hit) ? Number(hit.end_media_time) || end : end,
          source: hit && isOwnedCue(hit) ? String(hit.source || source) : source,
          en: translated ? hit.en || "" : "",
          vi: translated ? hit.vi || "" : "",
          tokens: translated ? hit.tokens || [] : [],
          translated,
          text_source: hit && isOwnedCue(hit) ? hit.text_source : "yt",
          mt_locked: !!(hit && hit.mt_locked),
          translation_source: (hit && hit.translation_source) || "",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.start_media_time - b.start_media_time);
  }

  /** Build overlay cues entirely from a saved disk/chrome script (no YT timedtext). */
  function cuesFromSavedScript(cached) {
    return (cached || [])
      .map((c) => {
        const start = Number(c.start_media_time) || 0;
        const endRaw = Number(c.end_media_time);
        const end = Number.isFinite(endRaw) && endRaw > start ? endRaw : start + 2;
        const source = String(c.source || "");
        const hasMt = !!(String(c.vi || "").trim() || String(c.en || "").trim());
        const translated = !!(c.translated && hasMt);
        return {
          id: c.id || cueId(start, source || "empty"),
          start_media_time: start,
          end_media_time: end,
          source,
          en: hasMt ? c.en || "" : "",
          vi: hasMt ? c.vi || "" : "",
          tokens: hasMt ? c.tokens || [] : [],
          translated,
          text_source: c.text_source || "yt",
          mt_locked: !!c.mt_locked,
          translation_source: c.translation_source || "",
        };
      })
      .sort((a, b) => a.start_media_time - b.start_media_time);
  }

  /** Ask the SW whether Drive holds a newer rev for this video (SW caches the probe). */
  function checkDriveFresh(videoId, opts = {}) {
    if (!videoId) return Promise.resolve(null);
    return chrome.runtime
      .sendMessage({
        type: "DRIVE_MIRROR_DOWN",
        videoIds: [videoId],
        maxAgeMs: opts.force ? 0 : 10000,
      })
      .catch(() => null);
  }

  async function tryApplySavedScript(reason = "disk", opts = {}) {
    const gen = navigateGen;
    const vid = currentVideoId;
    const cached = await loadCachedCues(currentVideoId);
    if (gen !== navigateGen || currentVideoId !== vid) return false;
    const meta = await loadTranscriptMeta(currentVideoId);
    if (gen !== navigateGen || currentVideoId !== vid) return false;
    transcriptMeta = meta;
    if (cached.some(isOwnedCue)) transcriptMeta.owned = true;
    let fromScript = cuesFromSavedScript(cached);
    if (!fromScript.length) return false;
    // Auto-saved YT scripts often still have rolling ASR overlaps — heal on restore.
    if (!transcriptMeta.owned) {
      fromScript = CueTiming.clampCueEndsToNextStart(fromScript);
    }
    captionsStatus = "ok";
    captionsInfo = `${reason} · ${fromScript.length} cues`;
    cues = fromScript;
    // Invalidate sorted cache on script restore
    sortedCuesGen = -1;
    sortedCuesCache = null;
    lastCueIndex = 0;
    listDirty = true;
    await syncToPlayhead();
    if (gen !== navigateGen || currentVideoId !== vid) return false;
    updateCaptionStatusLine();
    scheduleSaveTranscript();
    // B8: tokenize whenever cues lack tokens (owned or YT).
    void enrichTokensAfterImport();
    if (!opts.quiet) toast(`Đã tải script đã lưu (${fromScript.length} câu)`);
    return true;
  }

  let videoLayoutObserver = null;
  let videoLayoutTimer = null;
  let playerToggleObserver = null;
  let playerToggleEnsureScheduled = false;
  const PLAYER_TOGGLE_ID = "hardsub-ocr-player-toggle";
  let dictHideTimer = null;
  let dictReqSeq = 0;
  let lastBarFingerprint = "";
  let activeDictTokEl = null;

  function getVideoRect() {
    const candidates = [
      document.querySelector("video.html5-main-video"),
      document.querySelector("#movie_player video"),
      document.querySelector("ytd-player video"),
      document.querySelector("#player video"),
      document.querySelector("#movie_player"),
      document.querySelector("#player-container"),
      document.querySelector("ytd-player"),
    ];
    for (const el of candidates) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= 80 && r.height >= 60) return r;
    }
    return null;
  }

  let _listenersAttached = false;

  function ensureVideoLayoutSync() {
    if (videoLayoutTimer) return;
    videoLayoutTimer = setInterval(() => {
      applyBarPosition();
      applyDim();
      ensurePlayerToggle();
    }, 250);
    const observeTarget =
      document.querySelector("#movie_player") ||
      document.querySelector("ytd-player") ||
      document.querySelector("#player-container") ||
      document.body;
    if (typeof ResizeObserver !== "undefined" && observeTarget) {
      if (videoLayoutObserver) videoLayoutObserver.disconnect();
      videoLayoutObserver = new ResizeObserver(() => applyBarPosition());
      videoLayoutObserver.observe(observeTarget);
      const vid = document.querySelector("video.html5-main-video");
      if (vid) videoLayoutObserver.observe(vid);
    }
    if (!_listenersAttached) {
      _listenersAttached = true;
      window.addEventListener("resize", applyBarPosition);
      document.addEventListener("fullscreenchange", applyBarPosition);
    }
  }

  function ensureUI() {
    if (document.getElementById("hardsub-ocr-root")) return;
    const root = document.createElement("div");
    root.id = "hardsub-ocr-root";
    // On-video overlay only — cue list lives in Chrome Side Panel (right).
    root.innerHTML = `
      <div id="hardsub-ocr-bar" class="hardsub-bar" hidden></div>
      <div id="hardsub-ocr-dict" class="hardsub-dict" hidden></div>
      <div id="hardsub-dim" class="hardsub-dim" hidden></div>
    `;
    document.documentElement.appendChild(root);
    setupBarDrag();
    setupBarDict();
    ensureVideoLayoutSync();
    ensurePlayerToggleObserver();
    ensurePlayerToggle();
    applyBarPosition();
  }

  function applyPanelWidth() {
    /* Side panel width is controlled by Chrome — no page overlay panel. */
  }

  function setupPanelResize() {
    /* no-op */
  }

  function userBarScale() {
    const n = Number(settings.barScale);
    return Number.isFinite(n) ? Math.max(0.55, Math.min(2.4, n)) : 1;
  }

  function clampBarBoxScale(n) {
    const x = Number(n);
    return Number.isFinite(x) ? Math.max(0.55, Math.min(2.4, x)) : 1;
  }

  function userBarScaleW() {
    return clampBarBoxScale(settings.barScaleW);
  }

  function userBarScaleH() {
    return clampBarBoxScale(settings.barScaleH);
  }

  /**
   * Edge/corner resize: adjust W and/or H; keep the opposite edge fixed via left/top.
   * dir is one of n,s,e,w,nw,ne,sw,se.
   */
  function computeBarEdgeResize(dir, start, dx, dy) {
    const w0 = Math.max(1, start.w0);
    const h0 = Math.max(1, start.h0);
    let scaleW = start.scaleW;
    let scaleH = start.scaleH;
    let left = start.left;
    let top = start.top;
    if (dir.includes("e")) scaleW = clampBarBoxScale((start.boxW + dx) / w0);
    if (dir.includes("w")) {
      scaleW = clampBarBoxScale((start.boxW - dx) / w0);
      left = start.left + (start.boxW - scaleW * w0);
    }
    if (dir.includes("s")) scaleH = clampBarBoxScale((start.boxH + dy) / h0);
    if (dir.includes("n")) {
      scaleH = clampBarBoxScale((start.boxH - dy) / h0);
      top = start.top + (start.boxH - scaleH * h0);
    }
    return { scaleW, scaleH, left, top };
  }

  /**
   * Caption-box reference size from video rect (at userScale=1).
   * CSS multiplies by --bar-user-scale-w/h so edge handles grow each axis alone.
   * Content length must not grow the box (overflow scrolls inside).
   */
  function applyBarBoxSize(bar, rect, scaleW, scaleH) {
    if (!bar) return;
    const sw = clampBarBoxScale(scaleW);
    const sh = clampBarBoxScale(scaleH);
    let w0;
    let h0;
    if (!rect) {
      w0 = Math.min(920, window.innerWidth * 0.7);
      h0 = Math.max(96, Math.min(220, window.innerHeight * 0.16));
    } else {
      w0 = Math.min(rect.width * 0.68, 920);
      // ~3 caption lines zone at scale 1; user scales grow it via CSS.
      h0 = Math.max(88, Math.min(rect.height * 0.22, 240));
    }
    bar.style.setProperty("--bar-box-w0", `${Math.round(w0)}px`);
    bar.style.setProperty("--bar-box-h0", `${Math.round(h0)}px`);
    bar.style.setProperty("--bar-user-scale-w", String(sw));
    bar.style.setProperty("--bar-user-scale-h", String(sh));
    // Drop legacy inline dims so CSS calc owns size.
    bar.style.width = "";
    bar.style.height = "";
    bar.style.maxWidth = "";
    bar.style.minWidth = "";
    bar.style.maxHeight = "";
    bar.style.minHeight = "";
  }

  function applyBarPosition() {
    const bar = document.getElementById("hardsub-ocr-bar");
    if (!bar) return;
    const rect = getVideoRect();
    const pos = settings.barPos;
    const userScale = userBarScale();
    const scaleW = userBarScaleW();
    const scaleH = userBarScaleH();

    if (!rect) {
      // Fallback before player mounts — viewport lower-third.
      bar.style.left = "50%";
      bar.style.top = "";
      bar.style.bottom = "14vh";
      bar.style.transform = "translateX(-50%)";
      bar.style.setProperty("--bar-scale", String(userScale));
      applyBarBoxSize(bar, null, scaleW, scaleH);
      applyBarStyle(bar);
      return;
    }

    const base = Math.max(0.55, Math.min(1.45, rect.height / 720));
    const scale = base * userScale;
    bar.style.setProperty("--bar-scale", String(scale));
    applyBarBoxSize(bar, rect, scaleW, scaleH);
    applyBarStyle(bar);
    bar.style.bottom = "auto";

    // Legacy absolute px drag → migrate to normalized video coords once.
    if (pos && pos.left != null && pos.top != null && pos.nx == null) {
      settings.barPos = {
        nx: (pos.left - rect.left) / Math.max(1, rect.width),
        ny: (pos.top - rect.top) / Math.max(1, rect.height),
      };
    }

    const np = settings.barPos;
    if (np && np.nx != null && np.ny != null) {
      const left = rect.left + np.nx * rect.width;
      const top = rect.top + np.ny * rect.height;
      bar.style.transform = "none";
      bar.style.left = `${Math.max(rect.left + 4, Math.min(rect.right - 40, left))}px`;
      bar.style.top = `${Math.max(rect.top + 4, Math.min(rect.bottom - 24, top))}px`;
    } else {
      // Default: horizontally centered, lower-third caption zone (~above hardsubs).
      const left = rect.left + rect.width / 2;
      const top = rect.top + rect.height * 0.70;
      bar.style.transform = "translateX(-50%)";
      bar.style.left = `${left}px`;
      bar.style.top = `${top}px`;
    }

    const dim = document.getElementById("hardsub-dim");
    if (dim) {
      dim.style.left = `${rect.left + rect.width * 0.05}px`;
      dim.style.width = `${rect.width * 0.9}px`;
      dim.style.top = `${rect.top + rect.height * 0.78}px`;
      dim.style.bottom = "auto";
      dim.style.height = `${rect.height * 0.18}px`;
    }
  }

  const BAR_RESIZE_DIRS = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

  function ensureBarResizeHandle(bar) {
    if (!bar) return;
    // Upgrade legacy single corner handle → 8 edge/corner handles.
    if (!bar.querySelector(".bar-resize-se") || bar.querySelectorAll(".bar-resize").length < 8) {
      bar.querySelectorAll(".bar-resize").forEach((el) => el.remove());
    } else {
      return;
    }
    for (const dir of BAR_RESIZE_DIRS) {
      const handle = document.createElement("div");
      handle.className = `bar-resize bar-resize-${dir}`;
      handle.dataset.dir = dir;
      handle.title = "Kéo cạnh để đổi kích thước";
      bar.appendChild(handle);
    }
  }

  function setupBarDrag() {
    const bar = document.getElementById("hardsub-ocr-bar");
    if (!bar || bar.dataset.dragBound) return;
    bar.dataset.dragBound = "1";
    ensureBarResizeHandle(bar);
    let dragging = false;
    let resizing = false;
    let resizeDir = "";
    let ox = 0;
    let oy = 0;
    let startX = 0;
    let startY = 0;
    /** @type {{ scaleW: number, scaleH: number, left: number, top: number, boxW: number, boxH: number, w0: number, h0: number } | null} */
    let resizeStart = null;
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".hardsub-dict")) return;
      const resizeEl = e.target.closest(".bar-resize");
      if (resizeEl) {
        resizing = true;
        resizeDir = resizeEl.dataset.dir || "se";
        const br = bar.getBoundingClientRect();
        const w0 = parseFloat(getComputedStyle(bar).getPropertyValue("--bar-box-w0")) || br.width;
        const h0 = parseFloat(getComputedStyle(bar).getPropertyValue("--bar-box-h0")) || br.height;
        resizeStart = {
          scaleW: userBarScaleW(),
          scaleH: userBarScaleH(),
          left: br.left,
          top: br.top,
          boxW: br.width,
          boxH: br.height,
          w0,
          h0,
        };
        startX = e.clientX;
        startY = e.clientY;
        bar.classList.add("resizing");
        bar.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Keep token hover / dict clicks from starting a drag.
      if (e.target.closest("ruby, .tok")) return;
      dragging = true;
      bar.classList.add("dragging");
      const rect = bar.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      bar.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    bar.addEventListener("pointermove", (e) => {
      if (resizing && resizeStart) {
        const next = computeBarEdgeResize(
          resizeDir,
          resizeStart,
          e.clientX - startX,
          e.clientY - startY
        );
        settings.barScaleW = next.scaleW;
        settings.barScaleH = next.scaleH;
        const vrect = getVideoRect();
        let left = next.left;
        let top = next.top;
        const w = next.scaleW * resizeStart.w0;
        const h = next.scaleH * resizeStart.h0;
        if (vrect) {
          left = Math.max(vrect.left + 4, Math.min(vrect.right - w - 4, left));
          top = Math.max(vrect.top + 4, Math.min(vrect.bottom - h - 4, top));
          settings.barPos = {
            nx: (left - vrect.left) / Math.max(1, vrect.width),
            ny: (top - vrect.top) / Math.max(1, vrect.height),
          };
        } else {
          left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
          top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
          settings.barPos = { left, top };
        }
        bar.style.transform = "none";
        bar.style.bottom = "auto";
        bar.style.left = `${left}px`;
        bar.style.top = `${top}px`;
        applyBarBoxSize(bar, vrect, next.scaleW, next.scaleH);
        return;
      }
      if (!dragging) return;
      const vrect = getVideoRect();
      const w = bar.offsetWidth;
      const h = bar.offsetHeight;
      let left = e.clientX - ox;
      let top = e.clientY - oy;
      if (vrect) {
        left = Math.max(vrect.left + 4, Math.min(vrect.right - w - 4, left));
        top = Math.max(vrect.top + 4, Math.min(vrect.bottom - h - 4, top));
        settings.barPos = {
          nx: (left - vrect.left) / Math.max(1, vrect.width),
          ny: (top - vrect.top) / Math.max(1, vrect.height),
        };
      } else {
        left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
        top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
        settings.barPos = { left, top };
      }
      bar.style.transform = "none";
      bar.style.bottom = "auto";
      bar.style.left = `${left}px`;
      bar.style.top = `${top}px`;
    });
    bar.addEventListener("pointerup", async () => {
      if (resizing) {
        resizing = false;
        resizeStart = null;
        bar.classList.remove("resizing");
        await saveSettings();
        return;
      }
      if (!dragging) return;
      dragging = false;
      bar.classList.remove("dragging");
      await saveSettings();
    });
    bar.addEventListener("dblclick", async (e) => {
      if (e.target.closest("ruby, .tok, .bar-resize")) return;
      settings.barPos = null;
      settings.barScale = 1;
      settings.barScaleW = 1;
      settings.barScaleH = 1;
      await saveSettings();
      applyBarPosition();
      toast("Overlay về kích thước & vị trí mặc định");
    });
  }

  function clearDictHideTimer() {
    if (dictHideTimer) {
      clearTimeout(dictHideTimer);
      dictHideTimer = null;
    }
  }

  function clearDictTokActive() {
    if (activeDictTokEl) {
      activeDictTokEl.classList.remove("tok-dict-active");
      activeDictTokEl = null;
    }
    document
      .querySelectorAll("#hardsub-ocr-bar .tok-dict-active")
      .forEach((el) => el.classList.remove("tok-dict-active"));
  }

  function setDictTokActive(el) {
    if (!el) return;
    if (activeDictTokEl && activeDictTokEl !== el) {
      activeDictTokEl.classList.remove("tok-dict-active");
    }
    activeDictTokEl = el;
    el.classList.add("tok-dict-active");
  }

  function isInsideDictOrToken(node) {
    if (!node || node.nodeType !== 1) return false;
    return !!(
      node.closest?.("#hardsub-ocr-dict") ||
      node.closest?.("#hardsub-ocr-bar ruby, #hardsub-ocr-bar .tok")
    );
  }

  function scheduleHideDict(ms = 400) {
    clearDictHideTimer();
    dictHideTimer = setTimeout(() => {
      const dictEl = document.getElementById("hardsub-ocr-dict");
      if (!dictEl) return;
      // Keep open while pointer is on the page popup (side-panel → page hop).
      if (dictEl.matches(":hover")) return;
      dictEl.hidden = true;
      dictEl.innerHTML = "";
      dictEl.dataset.dictSource = "";
      clearDictTokActive();
    }, ms);
  }

  function setupBarDict() {
    const dictEl = document.getElementById("hardsub-ocr-dict");
    if (!dictEl || dictEl.dataset.bound) return;
    dictEl.dataset.bound = "1";
    dictEl.addEventListener("pointerenter", clearDictHideTimer);
    dictEl.addEventListener("mouseenter", clearDictHideTimer);
    dictEl.addEventListener("mouseleave", (e) => {
      if (isInsideDictOrToken(e.relatedTarget)) return;
      scheduleHideDict(400);
    });
  }

  function isPunctuationSurface(surface) {
    return !surface || /^[\s\u3000。、.!?,！？「」『』（）()\[\]…・〜～]+$/.test(surface);
  }

  function placeDictNear(ev, el) {
    const dictEl = document.getElementById("hardsub-ocr-dict");
    if (!dictEl || !el) return;
    const tokRect = el.getBoundingClientRect();
    const bar = el.closest(".hardsub-bar");
    const barRect = bar ? bar.getBoundingClientRect() : null;
    const pad = 8;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dw = dictEl.offsetWidth || 420;
    const dh = dictEl.offsetHeight || 160;

    // Prefer left of token; then left of caption bar; then right of token; clamp.
    let x = tokRect.left - dw - gap;
    if (x < pad && barRect) x = barRect.left - dw - gap;
    if (x < pad) {
      x = tokRect.right + gap;
      if (x + dw > vw - pad) x = pad;
    }
    x = Math.max(pad, Math.min(vw - dw - pad, x));

    let y = tokRect.top;
    y = Math.max(pad, Math.min(vh - dh - pad, y));

    dictEl.style.right = "auto";
    dictEl.style.left = `${x}px`;
    dictEl.style.top = `${y}px`;
  }

  /** Side-panel hover: dock to the right edge of the page viewport (left of panel). */
  function placePageDictAtPanelEdge(screenY) {
    const dictEl = document.getElementById("hardsub-ocr-dict");
    if (!dictEl) return;
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dw = dictEl.offsetWidth || 420;
    const dh = dictEl.offsetHeight || 160;
    const screenTop = window.screenTop ?? window.screenY ?? 0;
    const chromeUi = Math.max(0, (window.outerHeight || 0) - (window.innerHeight || 0));
    let y = Number(screenY);
    if (Number.isFinite(y)) {
      // Absolute screenY → page clientY (toolbar chrome when outer/inner differ).
      const withChrome = y - screenTop - chromeUi;
      const bare = y - screenTop;
      // Prefer chrome-adjusted unless it lands far above the viewport (shared content top).
      y = withChrome >= -40 ? withChrome : bare;
    } else {
      y = pad;
    }
    y = Math.max(pad, Math.min(vh - dh - pad, y));
    // Visual: just left of the Chrome side panel (page viewport right edge).
    dictEl.style.right = "auto";
    dictEl.style.left = `${Math.max(pad, vw - dw - pad)}px`;
    dictEl.style.top = `${y}px`;
  }

  function stripSentenceCtx(text) {
    return stripStubPrefix(text);
  }

  function sentenceBlockHtml(ctx) {
    const vi = stripSentenceCtx(ctx?.sentenceVi);
    const en = stripSentenceCtx(ctx?.sentenceEn);
    const ja = String(ctx?.sentenceJa || "").trim();
    if (!vi && !en && !ja) return "";
    const parts = [];
    if (vi) parts.push(`<div class="dict-sentence-vi">${escapeHtml(vi)}</div>`);
    else if (en) parts.push(`<div class="dict-sentence-en">${escapeHtml(en)}</div>`);
    else parts.push(`<div class="dict-sentence-ja">${escapeHtml(ja)}</div>`);
    if (vi && en) parts.push(`<div class="dict-sentence-en">${escapeHtml(en)}</div>`);
    return `<div class="dict-sep" aria-hidden="true"></div>
      <div class="dict-sentence">${parts.join("")}</div>`;
  }

  function primaryGlossLine(d) {
    const senses = d?.senses || [];
    const viParts = [];
    const enParts = [];
    for (const sense of senses.slice(0, 4)) {
      for (const g of sense.gloss_vi || []) {
        if (g && !viParts.includes(g)) viParts.push(g);
      }
      for (const g of sense.gloss_en || []) {
        if (g && !enParts.includes(g)) enParts.push(g);
      }
    }
    return {
      vi: viParts.slice(0, 5).join(", "),
      en: enParts.slice(0, 4).join("; "),
    };
  }

  function glossBlocksHtml(d) {
    const { vi, en } = primaryGlossLine(d);
    if (!vi && !en) return "";
    const parts = [];
    if (vi) {
      parts.push(
        `<div class="dict-gloss-row dict-gloss-vi"><span class="dict-lang">VI</span><span class="dict-gloss">${escapeHtml(vi)}</span></div>`
      );
    }
    if (en) {
      parts.push(
        `<div class="dict-gloss-row dict-gloss-en"><span class="dict-lang">EN</span><span class="dict-gloss">${escapeHtml(en)}</span></div>`
      );
    }
    return `<div class="dict-gloss-block">${parts.join("")}</div>`;
  }

  function dictSentToggleHtml(hasSentence) {
    if (!hasSentence) return "";
    const on = settings.dictShowSentence !== false;
    return `<button type="button" class="dict-sent-toggle" aria-pressed="${on ? "true" : "false"}" title="Hiện/ẩn phần dịch câu"></button>`;
  }

  function bindDictSentenceToggle(dictEl) {
    const btn = dictEl.querySelector(".dict-sent-toggle");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const next = !(settings.dictShowSentence !== false);
      settings.dictShowSentence = next;
      btn.setAttribute("aria-pressed", next ? "true" : "false");
      dictEl.classList.toggle("dict-hide-sentence", !next);
      await saveSettings();
    });
  }

  function renderDictHtml(dictEl, surface, lemma, d, ctx = {}) {
    const showSent = settings.dictShowSentence !== false;
    dictEl.classList.toggle("dict-hide-sentence", !showSent);
    const sentenceHtml = sentenceBlockHtml(ctx);
    const hasSentence = !!sentenceHtml;

    if (!d?.found) {
      dictEl.innerHTML = `<div class="dict-top">
          ${dictSentToggleHtml(hasSentence)}
          <div class="dict-head-main">
            <strong class="dict-head">${escapeHtml(surface)}</strong>
            <span class="dict-gloss">${escapeHtml(d?.message || "không có trong từ điển")}</span>
          </div>
        </div>${sentenceHtml}`;
      bindDictSentenceToggle(dictEl);
      return;
    }

    const term = d.matched || surface;
    const reading = d.reading || (d.senses?.[0]?.reading || "");
    const glossHtml = glossBlocksHtml(d);
    const markLemma = d.matched || lemma || surface;
    dictEl.innerHTML = `<div class="dict-top">
        ${dictSentToggleHtml(hasSentence)}
        <div class="dict-head-main">
          <strong class="dict-head">${escapeHtml(term)}</strong>${
            reading ? `<span class="dict-reading-top">${escapeHtml(reading)}</span>` : ""
          }
        </div>
      </div>${glossHtml}${sentenceHtml}${markButtonsHtml(markLemma)}`;
    bindDictMarks(dictEl);
    bindDictSentenceToggle(dictEl);
  }

  async function fetchAndFillDict(dictEl, surface, lemma, place, ctx = {}) {
    dictEl.hidden = false;
    dictEl.classList.toggle("dict-hide-sentence", settings.dictShowSentence === false);
    const sentenceHtml = sentenceBlockHtml(ctx);
    dictEl.innerHTML = `<div class="dict-top">
        ${dictSentToggleHtml(!!sentenceHtml)}
        <div class="dict-head-main">
          <strong class="dict-head">${escapeHtml(surface)}</strong>
          <span class="dict-gloss">…</span>
        </div>
      </div>${sentenceHtml}`;
    bindDictSentenceToggle(dictEl);
    place();

    const seq = ++dictReqSeq;
    const res = await bridgeFetch("/dict", {
      method: "POST",
      body: { surface, lemma, sentence_id: "" },
    });
    if (seq !== dictReqSeq) return;
    if (!res?.ok) {
      dictEl.innerHTML = `<div class="dict-top">
          ${dictSentToggleHtml(!!sentenceHtml)}
          <div class="dict-head-main">
            <strong class="dict-head">${escapeHtml(surface)}</strong>
            <span class="dict-gloss">Bridge offline</span>
          </div>
        </div>${sentenceHtml}`;
      bindDictSentenceToggle(dictEl);
      place();
      return;
    }
    renderDictHtml(dictEl, surface, lemma, res.data || {}, ctx);
    place();
  }

  async function showBarDict(ev, el) {
    clearDictHideTimer();
    setDictTokActive(el);
    const dictEl = document.getElementById("hardsub-ocr-dict");
    if (!dictEl) return;
    const surface = (el.dataset.surface || el.textContent || "").trim();
    const lemma = (el.dataset.lemma || "").trim();
    if (isPunctuationSurface(surface)) return;
    dictEl.dataset.dictSource = "bar";
    const cue = cues.find((c) => c.id === activeCueId);
    const ctx = {
      sentenceVi: cue?.vi || "",
      sentenceEn: cue?.en || "",
      sentenceJa: cue?.source || "",
    };
    await fetchAndFillDict(dictEl, surface, lemma, () => placeDictNear(ev, el), ctx);
  }

  async function showPageDictFromSidePanel(msg) {
    clearDictHideTimer();
    const dictEl = document.getElementById("hardsub-ocr-dict");
    if (!dictEl) return;
    const surface = String(msg.surface || "").trim();
    const lemma = String(msg.lemma || "").trim();
    if (isPunctuationSurface(surface)) return;
    const screenY = Number(msg.screenY ?? msg.anchorScreenY);
    dictEl.dataset.dictSource = "sidepanel";
    const ctx = {
      sentenceVi: msg.sentenceVi || msg.vi || "",
      sentenceEn: msg.sentenceEn || msg.en || "",
      sentenceJa: msg.sentenceJa || msg.source || msg.ja || "",
    };
    await fetchAndFillDict(
      dictEl,
      surface,
      lemma,
      () => placePageDictAtPanelEdge(screenY),
      ctx
    );
  }

  function bindBarTokenDict(bar) {
    bar.querySelectorAll("ruby, .tok").forEach((tok) => {
      tok.addEventListener("mouseenter", (e) => {
        clearDictHideTimer();
        showBarDict(e, tok);
      });
      tok.addEventListener("mouseleave", (e) => {
        if (isInsideDictOrToken(e.relatedTarget)) {
          clearDictHideTimer();
          return;
        }
        scheduleHideDict(400);
      });
      tok.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        showBarDict(e, tok);
      });
    });
  }

  let lastStatusText = "";
  let contentTabId = null;
  let spPublishSeq = 0;
  const spSessionId = `${Date.now()}-${Math.random()}`;

  async function ensureContentTabId() {
    if (contentTabId != null) return contentTabId;
    try {
      const r = await chrome.runtime.sendMessage({ type: "CONTENT_GET_TAB_ID" });
      if (r?.tabId != null) contentTabId = r.tabId;
    } catch (_) {}
    return contentTabId;
  }

  function publishSidePanelState(extra = {}) {
    const st = cacheStats();
    const status =
      lastStatusText ||
      `YT · cached ${st.cached}/${st.n}${bridgeReady ? "" : " · bridge?"}`;
    const seq = ++spPublishSeq;
    const forceCues = !!extra.forceList || listDirty;
    const payload = {
      videoId: currentVideoId,
      status,
      activeCueId,
      showOnVideo: !!settings.showOnVideo,
      showFurigana: !!settings.showFurigana,
      bridgeReady: !!bridgeReady,
      vocabLevel: settings.vocabLevel,
      vocabHighlight: settings.vocabHighlight,
      showKnownGreen: settings.showKnownGreen,
      hideRareWords: settings.hideRareWords,
      vocabColors: settings.vocabColors,
      vocabCats: settings.vocabCats,
      levelHighlightEnabled: settings.levelHighlightEnabled !== false,
      levelColors: settings.levelColors,
      userVocab,
      scriptSource,
      ...extra,
      _seq: seq,
      _session: spSessionId,
    };
    if (forceCues) {
      payload.cues = cues.map((c) => ({
        id: c.id,
        source: c.source,
        en: c.en,
        vi: c.vi,
        tokens: c.tokens || [],
        translated: !!c.translated,
        start_media_time: c.start_media_time,
        end_media_time: c.end_media_time,
        mt_locked: !!c.mt_locked,
        translation_source: c.translation_source || "",
      }));
      listDirty = false;
    }
    ensureContentTabId().then((tabId) => {
      chrome.runtime
        .sendMessage({ type: "SP_STATE", tabId, forceList: !!forceCues, payload })
        .catch(() => {});
    });
  }

  /** Status/toast only — omit cues so side panel does not rebuild mid-edit. */
  function publishSidePanelPartial(extra = {}) {
    ensureContentTabId().then((tabId) => {
      chrome.runtime
        .sendMessage({
          type: "SP_STATE",
          tabId,
          payload: {
            status: lastStatusText,
            activeCueId,
            bridgeReady: !!bridgeReady,
            ...extra,
          },
        })
        .catch(() => {});
    });
  }

  function setStatus(text) {
    lastStatusText = text || "";
    publishSidePanelPartial();
  }

  function toast(msg) {
    publishSidePanelPartial({ toast: String(msg || "") });
  }

  function applyBarStyle(bar = document.getElementById("hardsub-ocr-bar")) {
    if (!bar) return;
    const bg = Math.max(0, Math.min(1, Number(settings.barBgOpacity) || DEFAULTS.barBgOpacity));
    const fg = Math.max(0, Math.min(1, Number(settings.barTextOpacity) || DEFAULTS.barTextOpacity));
    bar.style.setProperty("--bar-bg-a", String(bg));
    bar.style.setProperty("--bar-fg-a", String(fg));
    bar.classList.toggle("hide-ja", settings.barShowJa === false);
    bar.classList.toggle("hide-en", settings.barShowEn === false);
    bar.classList.toggle("hide-vi", settings.barShowVi === false);
  }

  function applyBarVisibility() {
    const bar = document.getElementById("hardsub-ocr-bar");
    if (bar) {
      applyBarStyle(bar);
      if (!settings.showOnVideo) bar.hidden = true;
      else bar.hidden = !bar.dataset.hasText;
    }
    syncPlayerToggle();
  }

  function playerToggleLabel() {
    return settings.showOnVideo ? "DỊCH ON" : "DỊCH OFF";
  }

  function syncPlayerToggle() {
    const btn = document.getElementById(PLAYER_TOGGLE_ID);
    if (!btn) return;
    const on = !!settings.showOnVideo;
    btn.classList.toggle("hardsub-ytp-toggle--on", on);
    btn.classList.toggle("hardsub-ytp-toggle--off", !on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on ? "Tắt overlay trên video" : "Bật overlay trên video (+ mở side panel)";
    btn.setAttribute(
      "aria-label",
      on ? "Tắt overlay dịch" : "Bật overlay dịch"
    );
    const label = btn.querySelector(".hardsub-ytp-toggle__label");
    if (label) label.textContent = playerToggleLabel();
  }

  async function setShowOnVideo(on, { persist = true, toastMsg = true } = {}) {
    const next = !!on;
    const changed = settings.showOnVideo !== next;
    if (changed) {
      settings.showOnVideo = next;
      if (persist) await saveSettings();
    }
    applyBarVisibility();
    // ON opens panel; OFF only hides overlay (leave side panel open).
    if (next) await openSidePanel();
    if (toastMsg && changed) toast(next ? "Dịch ON" : "Dịch OFF");
    publishSidePanelState();
    return next;
  }

  async function toggleShowOnVideo() {
    return setShowOnVideo(!settings.showOnVideo);
  }

  function openSidePanel() {
    return chrome.runtime
      .sendMessage({ type: "OPEN_SIDE_PANEL" })
      .then((r) => {
        if (r?.ok) {
          pendingOpenSidePanel = false;
          return true;
        }
        pendingOpenSidePanel = true;
        bindGestureOpenSidePanel();
        return false;
      })
      .catch(() => {
        pendingOpenSidePanel = true;
        bindGestureOpenSidePanel();
        return false;
      });
  }

  function bindGestureOpenSidePanel() {
    if (gestureOpenBound) return;
    gestureOpenBound = true;
    const onGesture = () => {
      if (!pendingOpenSidePanel) return;
      openSidePanel();
    };
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!pendingOpenSidePanel) return;
        const player =
          e.target?.closest?.("#movie_player, ytd-player, #player-container, video");
        if (!player) return;
        onGesture();
      },
      true
    );
  }

  /**
   * autoOpen: try open side panel once per tab session.
   * Does not force overlay ON — overlay defaults off; user toggles DỊCH / Overlay.
   */
  async function maybeAutoOpenOnNavigate() {
    if (!settings.autoOpen) return;
    if (!currentVideoId) return;
    applyBarVisibility();
    if (autoOpenPanelTried) return;
    autoOpenPanelTried = true;
    const opened = await openSidePanel();
    if (!opened) pendingOpenSidePanel = true;
  }

  function scheduleEnsurePlayerToggle() {
    if (playerToggleEnsureScheduled) return;
    playerToggleEnsureScheduled = true;
    requestAnimationFrame(() => {
      playerToggleEnsureScheduled = false;
      ensurePlayerToggle();
    });
  }

  /** Compact DỊCH ON/OFF pill in `.ytp-left-controls` (after time display). */
  function ensurePlayerToggle() {
    const left = document.querySelector(
      "#movie_player .ytp-left-controls, ytd-player .ytp-left-controls, .ytp-left-controls"
    );
    if (!left) return false;

    let btn = document.getElementById(PLAYER_TOGGLE_ID);
    if (btn && left.contains(btn)) {
      syncPlayerToggle();
      return true;
    }
    if (btn) btn.remove();

    btn = document.createElement("button");
    btn.id = PLAYER_TOGGLE_ID;
    btn.type = "button";
    btn.className = "ytp-button hardsub-ytp-toggle";
    btn.setAttribute("aria-label", "Bật/tắt overlay dịch");
    btn.innerHTML =
      '<span class="hardsub-ytp-toggle__pill" aria-hidden="true">' +
      '<span class="hardsub-ytp-toggle__badge">VI</span>' +
      '<span class="hardsub-ytp-toggle__label"></span></span>';
    const stopBubble = (e) => e.stopPropagation();
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Overlay visibility; ON also opens side panel (OFF leaves panel open).
      await toggleShowOnVideo();
    });
    btn.addEventListener("mousedown", stopBubble);
    btn.addEventListener("mouseup", stopBubble);
    btn.addEventListener("pointerdown", stopBubble);

    const timeDisplay = left.querySelector(".ytp-time-display");
    if (timeDisplay) timeDisplay.insertAdjacentElement("afterend", btn);
    else left.appendChild(btn);
    syncPlayerToggle();
    return true;
  }

  function ensurePlayerToggleObserver() {
    const target =
      document.querySelector("#movie_player") ||
      document.querySelector("ytd-player") ||
      document.body;
    if (playerToggleObserver) playerToggleObserver.disconnect();
    playerToggleObserver = new MutationObserver(() => {
      const btn = document.getElementById(PLAYER_TOGGLE_ID);
      const left = document.querySelector(".ytp-left-controls");
      if (!left || !btn || !left.contains(btn)) scheduleEnsurePlayerToggle();
    });
    playerToggleObserver.observe(target, { childList: true, subtree: true });
    ensurePlayerToggle();
  }

  function applyDim() {
    const dim = document.getElementById("hardsub-dim");
    if (!dim) return;
    dim.hidden = !settings.dimHardsub;
  }

  function rubyHtml(cue) {
    // Always emit per-token markup when tokens exist so overlay hover-dict works;
    // furigana <rt> is optional via settings.showFurigana.
    if (!cue.tokens?.length) {
      return escapeHtml(cue.source);
    }
    return cue.tokens
      .map((t) => {
        const s = escapeHtml(t.surface);
        const lemma = escapeAttr(t.lemma || t.surface);
        const surfaceAttr = escapeAttr(t.surface);
        const cls = Vocab.classForToken(t, settings, userVocab);
        const classAttr = cls ? ` tok ${cls}` : " tok";
        if (settings.showFurigana && t.reading) {
          return `<ruby class="${classAttr.trim()}" data-surface="${surfaceAttr}" data-lemma="${lemma}">${s}<rt>${escapeHtml(t.reading)}</rt></ruby>`;
        }
        return `<span class="${classAttr.trim()}" data-surface="${surfaceAttr}" data-lemma="${lemma}">${s}</span>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function stripStubPrefix(text) {
    return String(text || "")
      .replace(/^\[(vi|en)\]\s*/i, "")
      .trim();
  }

  function formatCopy(cue, format) {
    const furi = (cue.tokens || [])
      .map((t) => (t.reading ? `${t.surface}(${t.reading})` : t.surface))
      .join("");
    const fmt = format || settings.copyFormat;
    const vi = stripStubPrefix(cue.vi);
    const en = stripStubPrefix(cue.en);
    if (fmt === "ja") return cue.source;
    if (fmt === "vi") return vi;
    if (fmt === "ja_vi") return `JA: ${cue.source}\nVI: ${vi}`;
    return `JA: ${cue.source}\n   (${furi || cue.source})\nEN: ${en}\nVI: ${vi}`;
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function cacheStats() {
    const n = cues.length;
    let cached = 0;
    let pendingCount = 0;
    for (const c of cues) {
      if (c.translated) cached += 1;
      else pendingCount += 1;
    }
    return { n, cached, pending: pendingCount, translating: translatingIds.size };
  }

  function updateCaptionStatusLine() {
    const st = cacheStats();
    const capTag =
      captionsStatus === "ok"
        ? `YT · ${captionsInfo}`
        : captionsStatus === "loading"
          ? "YT…"
          : captionsStatus === "none" || captionsStatus === "error"
            ? `YT ${captionsInfo || captionsStatus}`
            : "YT";
    const queueTag =
      st.translating > 0
        ? `translating…`
        : st.pending > 0
          ? `pending ${st.pending}`
          : "idle";
    lastStatusText = `${capTag} · cached ${st.cached}/${st.n} · ${queueTag}${
      bridgeReady ? "" : " · bridge?"
    }`;
    // Keep listDirty — publishSidePanelState includes cues only when dirty.
    publishSidePanelState();
  }

  function swOk(sw) {
    return !!(sw?.ok && Array.isArray(sw.cues) && sw.cues.length);
  }

  function swUsable(sw) {
    return !!(
      sw?.ok &&
      (swOk(sw) ||
        (Array.isArray(sw.enCues) && sw.enCues.length) ||
        (Array.isArray(sw.viCues) && sw.viCues.length))
    );
  }

  /** Intercept body is only JA when timedtext URL lang is ja* — never trust pageLink.lang. */
  function interceptIsJa(pageLink) {
    return !!(pageLink?.cues?.length && isJaLang(langFromTimedtextUrl(pageLink.baseUrl)));
  }

  async function loadAllCaptions(force = false, opts = {}) {
    const gen = navigateGen;
    const vid = currentVideoId;
    const stale = () => gen !== navigateGen || currentVideoId !== vid;

    if (!currentVideoId) {
      captionsStatus = "none";
      captionsInfo = "no_video_id";
      cues = [];
      // Invalidate sorted cache on clear
      sortedCuesGen = -1;
      sortedCuesCache = null;
      lastCueIndex = 0;
      listDirty = true;
      renderList(true);
      updateCaptionStatusLine();
      return;
    }
    // Once-per-videoId: reuse loaded cues unless force (Reload / wipe / navigate).
    if (
      !force &&
      !opts.skipCache &&
      captionsStatus === "ok" &&
      cues.length > 0
    ) {
      updateCaptionStatusLine();
      return;
    }
    const skipCache = !!opts.skipCache;
    const applyOpts = skipCache ? { skipCache: true } : {};
    const swApplyOpts = (sw) => ({
      ...applyOpts,
      fromSw: true,
      enCues: sw?.enCues,
      viCues: sw?.viCues,
    });
    const swLabel = (sw) =>
      swOk(sw)
        ? `${sw.lang || "?"}${sw.asr ? " auto" : ""} · ${sw.count || sw.cues.length} cues`
        : `secondary · en:${sw?.enCues?.length || 0} vi:${sw?.viCues?.length || 0}`;

    captionsStatus = "loading";
    captionsInfo = "";
    updateCaptionStatusLine();

    // Reuse SW promise from onNavigate when provided (started ‖ bridge).
    let pageLink = null;
    const swPromise =
      opts.swPromise ||
      loadCaptionsViaBackground(currentVideoId, settings.sourceLang, {
        baseUrl: "",
        lang: settings.sourceLang,
      });

    const ready =
      opts.bridgeReady === true
        ? true
        : opts.bridgeReady === false
          ? false
          : await waitForPageBridge(2500);
    if (stale()) return;

    if (ready) {
      pageLink = await pageCall(
        "GET_TIMEDTEXT_LINK",
        { videoId: currentVideoId, lang: settings.sourceLang },
        800
      );
      if (stale()) return;
      // Early-win only when URL lang is ja* — then kick secondary async.
      if (interceptIsJa(pageLink)) {
        await applyLoadedCues(
          pageLink.cues,
          `ja intercept · ${pageLink.cues.length} cues`,
          applyOpts
        );
        if (stale()) return;
        kickSecondaryFill(await swPromise);
        return;
      }

      let swEarly = null;
      swPromise.then((r) => {
        swEarly = r;
      });
      const raceDeadline = Date.now() + 700;
      while (Date.now() < raceDeadline) {
        if (stale()) return;
        if (swUsable(swEarly)) {
          // Paint JA ASAP; EN/VI fill async (do not await full pack).
          if (swOk(swEarly)) {
            await applyLoadedCues(
              swEarly.cues || [],
              swLabel(swEarly),
              swApplyOpts(swEarly)
            );
          }
          if (stale()) return;
          kickSecondaryFill(swEarly);
          if (swOk(swEarly)) return;
          break;
        }
        await sleep(120);
        pageLink = await pageCall(
          "GET_TIMEDTEXT_LINK",
          { videoId: currentVideoId, lang: settings.sourceLang },
          400
        );
        if (stale()) return;
        if (interceptIsJa(pageLink)) {
          await applyLoadedCues(
            pageLink.cues,
            `ja intercept · ${pageLink.cues.length} cues`,
            applyOpts
          );
          if (stale()) return;
          kickSecondaryFill(await swPromise);
          return;
        }
      }
    }

    let sw = await swPromise;
    if (stale()) return;
    if (!swUsable(sw) && pageLink?.baseUrl) {
      const urlLang = langFromTimedtextUrl(pageLink.baseUrl);
      sw = await loadCaptionsViaBackground(currentVideoId, settings.sourceLang, {
        baseUrl: pageLink.baseUrl,
        asr: !!pageLink.asr,
        lang: urlLang || pageLink.lang || settings.sourceLang,
      });
      if (stale()) return;
    }
    if (swUsable(sw)) {
      if (swOk(sw)) {
        await applyLoadedCues(sw.cues || [], swLabel(sw), swApplyOpts(sw));
        if (stale()) return;
      }
      kickSecondaryFill(sw);
      if (swOk(sw)) return;
    }

    if (ready) {
      // Prefer page multi-fetch (no setOption per lang) before LOAD_CAPTIONS CC path.
      const multi = await pageCall(
        "FETCH_MULTI_LANG",
        { videoId: currentVideoId, lang: settings.sourceLang },
        20000
      );
      if (stale()) return;
      if (Array.isArray(multi?.cues) && multi.cues.length) {
        await applyLoadedCues(
          multi.cues,
          `ja page · ${multi.cues.length} cues`,
          applyOpts
        );
        if (stale()) return;
        kickSecondaryFill({
          ...(sw || {}),
          enCues: multi.enCues,
          viCues: multi.viCues,
          hasEn: multi.hasEn,
          hasVi: multi.hasVi,
        });
        return;
      }

      const r = await pageCall(
        "LOAD_CAPTIONS",
        { videoId: currentVideoId, lang: settings.sourceLang, force: !!force },
        45000
      );
      if (stale()) return;
      const pageLang = langFromTimedtextUrl(r?.baseUrl) || r?.lang || "";
      if (
        r?.ok &&
        r.status === "ok" &&
        Array.isArray(r.cues) &&
        r.cues.length &&
        isJaLang(pageLang)
      ) {
        await applyLoadedCues(
          r.cues,
          `ja${r.asr ? " auto" : ""} · ${r.count || r.cues.length} cues`,
          applyOpts
        );
        if (stale()) return;
        kickSecondaryFill(sw);
        return;
      }
      if (r?.baseUrl && isJaLang(langFromTimedtextUrl(r.baseUrl) || r.lang)) {
        const rescued = await fetchTimedtextInContent(r.baseUrl);
        if (stale()) return;
        if (rescued?.length) {
          await applyLoadedCues(
            rescued,
            `ja rescue · ${rescued.length} cues`,
            applyOpts
          );
          if (stale()) return;
          kickSecondaryFill(sw);
          return;
        }
      }
      captionsStatus = r?.status || sw?.status || "none";
      captionsInfo = sw?.reason || r?.reason || r?.message || "empty";
      if (sw?.hasEn || sw?.hasVi) {
        stampSecondaryStatus(
          Array.isArray(sw.enCues) ? sw.enCues.length : 0,
          Array.isArray(sw.viCues) ? sw.viCues.length : 0
        );
        logYtSecondaryMiss(
          sw,
          Array.isArray(sw.enCues) ? sw.enCues.length : 0,
          Array.isArray(sw.viCues) ? sw.viCues.length : 0
        );
        kickSecondaryFill(sw);
      }
    } else {
      captionsStatus = "none";
      captionsInfo = sw?.reason || "page_bridge_timeout";
    }

    // Prefer previously saved script over empty session (reload / bridge race).
    // Hard wipe must not resurrect disk/chrome script.
    if (!skipCache && (await tryApplySavedScript("script"))) return;
    if (stale()) return;

    cues = [];
    // Invalidate sorted cache on clear
    sortedCuesGen = -1;
    sortedCuesCache = null;
    lastCueIndex = 0;
    listDirty = true;
    renderList(true);
    updateCaptionStatusLine();
    toast(
      captionsInfo === "timedtext_empty" || captionsInfo === "empty_or_html"
        ? "Có track nhưng tải caption lỗi — bấm Reload"
        : captionsInfo === "no_tracks"
          ? "Không thấy track caption"
          : `Caption: ${captionsInfo}`
    );
  }

  async function syncHealth() {
    const res = await bridgeFetch("/health");
    if (!res?.ok) {
      bridgeReady = false;
      setStatus("bridge offline");
      return;
    }
    const h = res.data;
    const wasReady = bridgeReady;
    bridgeReady = !!h.ready;
    caps = h.caps || caps;
    const boot = h.bootstrap;
    if (boot && !boot.done && boot.stage !== "idle") {
      setStatus(`bootstrap ${Math.round(boot.percent || 0)}%`);
    } else {
      updateCaptionStatusLine();
    }
    // B8: retry tokenize when bridge comes ready after JA already painted.
    if (!wasReady && bridgeReady && cues.some((c) => Vocab.tokensNeedEnrich(c))) {
      void enrichTokensAfterImport();
    }
  }

  function renderList(force = false) {
    if (!force && !listDirty) return;
    // forceList so cues ship even if a prior caller cleared listDirty.
    publishSidePanelState({ forceList: true });
  }

  function patchCueRow(_idx) {
    listDirty = true;
    renderList(true);
    updateCaptionStatusLine();
  }

  const Timing = globalThis.HardsubCueTiming || {
    applyManualTimes: (c, a, b) => {
      c.start_media_time = Number(a) || 0;
      c.end_media_time = Number(b) || c.start_media_time;
      return { start: c.start_media_time, end: c.end_media_time };
    },
    parseTimeInput: (s) => Number(s),
    formatTimeInput: (s) => String(s),
    MIN_DUR: 0.45,
  };

  function neighborCues(idx) {
    return {
      prevCue: idx > 0 ? cues[idx - 1] : null,
      nextCue: idx < cues.length - 1 ? cues[idx + 1] : null,
    };
  }

  function resolveCueIndex(msg) {
    if (msg?.id) {
      const i = cues.findIndex((c) => c.id === msg.id);
      if (i >= 0) return i;
    }
    const idx = Number(msg?.idx);
    return Number.isFinite(idx) ? idx : -1;
  }

  function findCueIndexById(id) {
    return cues.findIndex((c) => c.id === id);
  }

  async function onJaEdit(idx, text) {
    const cue = cues[idx];
    if (!cue) return;
    const next = String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Allow empty source for draft cues (persist); skip tokenize when empty.
    if (next === cue.source && cue.tokens?.length) {
      publishSidePanelState();
      return;
    }
    cue.source = next;
    cue.text_source = "edit";
    // Timeline stays YouTube / import / manual — do not retime from text length.
    // JA changed: re-tokenize for furigana, but keep user/import EN/VI.
    // (Previously this auto-cleared EN/VI + unlocked translation, which removed
    // the translation when you edited script.)
    cue.tokens = [];
    cue._txGen = (cue._txGen || 0) + 1;
    listDirty = true;
    await markScriptOwned();
    scheduleSaveTranscript();
    publishSidePanelState();
    updateCaptionStatusLine();

    if (!next) {
      patchCueRow(idx);
      return;
    }

    const trackId = cue.id;
    translatingIds.add(trackId);
    try {
      await enrichTokensAfterImport(new Set([cue.id]));
    } finally {
      translatingIds.delete(trackId);
      updateCaptionStatusLine();
    }
    patchCueRow(idx);
  }

  async function onEnEdit(idx, text) {
    const cue = cues[idx];
    if (!cue) return;
    const next = String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const prev = String(cue.en || "");
    if (next === prev) {
      publishSidePanelState();
      return;
    }
    cue.en = next;
    cue.text_source = "edit";
    const hasMt = !!(next || String(cue.vi || "").trim());
    cue.translated = hasMt;
    // EN Enter = persist only. Lock so import merge cannot overwrite casually.
    if (hasMt) lockCueTranslation(cue, "user");
    else unlockCueTranslation(cue);
    cue._txGen = (cue._txGen || 0) + 1;
    listDirty = true;
    await markScriptOwned();
    scheduleSaveTranscript();
    patchCueRow(idx);
    updateBar(cues.find((c) => c.id === activeCueId) || cue);
  }

  async function onViEdit(idx, text) {
    const cue = cues[idx];
    if (!cue) return;
    const next = String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const prev = String(cue.vi || "");
    if (next === prev) {
      publishSidePanelState();
      return;
    }
    cue.vi = next;
    cue.text_source = "edit";
    const hasMt = !!(next || String(cue.en || "").trim());
    cue.translated = hasMt;
    // VI Enter = persist only. Lock so import merge cannot overwrite casually.
    if (hasMt) lockCueTranslation(cue, "user");
    else unlockCueTranslation(cue);
    listDirty = true;
    await markScriptOwned();
    scheduleSaveTranscript();
    patchCueRow(idx);
    updateBar(cues.find((c) => c.id === activeCueId) || cue);
  }

  async function onTimelineEdit(idx, startRaw, endRaw) {
    const cue = cues[idx];
    if (!cue) return;
    const start =
      typeof startRaw === "number"
        ? startRaw
        : Timing.parseTimeInput(startRaw);
    const end =
      typeof endRaw === "number" ? endRaw : Timing.parseTimeInput(endRaw);
    const { prevCue, nextCue } = neighborCues(idx);
    Timing.applyManualTimes(cue, start, end, { prevCue, nextCue });
    cue.text_source = "edit";
    listDirty = true;
    await markScriptOwned();
    scheduleSaveTranscript();
    patchCueRow(idx);
    updateBar(cues.find((c) => c.id === activeCueId) || null);
  }

  async function addCue({ afterId = "", atTime } = {}) {
    let insertAt = cues.length;
    let start = Number(atTime);
    const fromAfter = !!afterId;
    if (afterId) {
      const afterIdx = findCueIndexById(afterId);
      if (afterIdx >= 0) {
        insertAt = afterIdx + 1;
        const prev = cues[afterIdx];
        start = Number(prev.end_media_time) || Number(prev.start_media_time) || 0;
      }
    }
    if (!Number.isFinite(start)) {
      try {
        const mtRes = await pageCall("GET_MEDIA_TIME", {}, 400);
        start = Number(mtRes?.mediaTime);
      } catch (_) {
        start = NaN;
      }
    }
    if (!Number.isFinite(start)) {
      const last = cues[cues.length - 1];
      start = last ? Number(last.end_media_time) || 0 : 0;
    }

    // "+ Cue" at playhead: insert chronologically (not always append at list end).
    if (!fromAfter) {
      insertAt = cues.findIndex((c) => (Number(c.start_media_time) || 0) > start);
      if (insertAt < 0) insertAt = cues.length;
    }

    let prevCue = insertAt > 0 ? cues[insertAt - 1] : null;
    let nextCue = insertAt < cues.length ? cues[insertAt] : null;
    // Playhead inside an existing cue → place after that cue instead.
    if (!fromAfter && prevCue) {
      const pStart = Number(prevCue.start_media_time) || 0;
      const pEnd = Number(prevCue.end_media_time) || pStart;
      if (start >= pStart && start < pEnd) {
        start = pEnd;
        insertAt = cues.indexOf(prevCue) + 1;
        nextCue = insertAt < cues.length ? cues[insertAt] : null;
      }
    }

    const minDur = Timing.MIN_DUR || 0.45;
    const id = newStableCueId();
    const cue = {
      id,
      start_media_time: start,
      end_media_time: start + minDur + 1.2,
      source: "",
      en: "",
      vi: "",
      tokens: [],
      translated: false,
      text_source: "manual",
    };
    Timing.applyManualTimes(cue, cue.start_media_time, cue.end_media_time, {
      prevCue,
      nextCue,
    });
    cues.splice(insertAt, 0, cue);
    activeCueId = id;
    listDirty = true;
    await markScriptOwned();
    scheduleSaveTranscript();
    publishSidePanelState();
    updateCaptionStatusLine();
    updateBar(cue);
    toast("Đã thêm cue");
    return cue;
  }

  async function deleteCueById(id) {
    if (!id) return false;
    const idx = findCueIndexById(id);
    if (idx < 0) return false;
    const cue = cues[idx];
    const stone = tombstoneKey(cue);
    if (stone && !transcriptMeta.tombstones.includes(stone)) {
      transcriptMeta.tombstones.push(stone);
    }
    translatingIds.delete(cue.id);
    cues.splice(idx, 1);
    if (activeCueId === id) {
      const neighbor = cues[idx] || cues[idx - 1] || null;
      activeCueId = neighbor?.id || "";
      updateBar(neighbor);
    }
    listDirty = true;
    await markScriptOwned();
    await saveTranscriptMeta();
    scheduleSaveTranscript();
    publishSidePanelState();
    updateCaptionStatusLine();
    toast("Đã xóa cue");
    return true;
  }

  async function copyCue(idx, format) {
    const cue = cues[idx];
    if (!cue) return false;
    const text = formatCopy(cue, format);
    try {
      await navigator.clipboard.writeText(text);
      toast("Đã sao chép");
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.documentElement.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        toast(ok ? "Đã sao chép" : "Copy thất bại");
        return !!ok;
      } catch {
        toast("Copy thất bại");
        return false;
      }
    }
  }

  function barCueFingerprint(cue) {
    if (!cue) return "";
    const showJa = settings.barShowJa !== false ? "1" : "0";
    const showEn = settings.barShowEn !== false ? "1" : "0";
    const showVi = settings.barShowVi !== false ? "1" : "0";
    const en = stripStubPrefix(cue.en);
    const vi = stripStubPrefix(cue.vi);
    const tokKey = (cue.tokens || [])
      .map((t) => `${t.surface || ""}|${t.reading || ""}|${t.jlpt || ""}|${t.lemma || ""}`)
      .join(",");
    return [
      cue.id,
      cue.source || "",
      en,
      vi,
      tokKey,
      showJa,
      showEn,
      showVi,
    ].join("\0");
  }

  function updateBar(cue) {
    const bar = document.getElementById("hardsub-ocr-bar");
    if (!bar) return;
    if (!cue) {
      lastBarFingerprint = "";
      clearDictTokActive();
      bar.dataset.hasText = "";
      bar.hidden = true;
      bar.innerHTML = "";
      const dictEl = document.getElementById("hardsub-ocr-dict");
      if (dictEl) {
        dictEl.hidden = true;
        dictEl.innerHTML = "";
      }
      return;
    }
    const fp = barCueFingerprint(cue);
    // Same cue content: skip innerHTML rebuild so hover dict nodes stay alive.
    if (fp === lastBarFingerprint && bar.dataset.hasText === "1") {
      Vocab.applyHighlightVars(bar, settings);
      applyBarStyle(bar);
      applyBarPosition();
      applyBarVisibility();
      return;
    }
    lastBarFingerprint = fp;
    const en = stripStubPrefix(cue.en);
    const vi = stripStubPrefix(cue.vi);
    bar.dataset.hasText = "1";
    Vocab.applyHighlightVars(bar, settings);
    applyBarStyle(bar);
    const showJa = settings.barShowJa !== false;
    const showEn = settings.barShowEn !== false;
    const showVi = settings.barShowVi !== false;
    bar.innerHTML = `
      <div class="bar-body">
        ${showJa ? `<div class="bar-ja">${rubyHtml(cue)}</div>` : ""}
        ${showEn && en ? `<div class="bar-en">${escapeHtml(en)}</div>` : ""}
        ${
          showVi
            ? vi
              ? `<div class="bar-vi">${escapeHtml(vi)}</div>`
              : showJa
                ? ""
                : `<div class="bar-vi">${escapeHtml(cue.source)}</div>`
            : ""
        }
      </div>
    `;
    ensureBarResizeHandle(bar);
    bindBarTokenDict(bar);
    applyBarPosition();
    applyBarVisibility();
  }

  /**
   * Playhead match — hold through gaps until next cue starts (YT durations often end early).
   * Last cue: +150ms grace past end. Last match wins on ties. (iPad ScriptCue.active)
   * OPTIMIZED: Uses cached sorted cues + binary search + index hint for O(log n) lookup.
   */
  function findActiveCue(mediaTime) {
    const t = Number(mediaTime) || 0;
    const grace = 0.15;
    
    // Invalidate cache if cues changed
    if (sortedCuesGen !== navigateGen || !sortedCuesCache) {
      sortedCuesCache = cues.slice().sort(
        (a, b) => (Number(a.start_media_time) || 0) - (Number(b.start_media_time) || 0)
      );
      sortedCuesGen = navigateGen;
      lastCueIndex = 0;
    }
    
    const live = sortedCuesCache;
    if (!live.length) return null;
    
    // Fast path: check last active cue first (amortized O(1) for continuous playback)
    if (lastCueIndex >= 0 && lastCueIndex < live.length) {
      const c = live[lastCueIndex];
      const start = Number(c.start_media_time) || 0;
      const end = Number(c.end_media_time) || start;
      const next = live[lastCueIndex + 1];
      const holdEnd = next ? (Number(next.start_media_time) || 0) : end + grace;
      if (t >= start && t < holdEnd) return c;
    }
    
    // Binary search for insertion point (find rightmost cue where start <= t)
    let lo = 0, hi = live.length - 1;
    let hit = null;
    let bestIdx = -1;
    
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = live[mid];
      const start = Number(c.start_media_time) || 0;
      
      if (start <= t) {
        bestIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    
    // Check candidate and neighbors for hold-through-gap logic
    const candidates = [];
    if (bestIdx >= 0) candidates.push(bestIdx);
    if (bestIdx > 0) candidates.push(bestIdx - 1);
    if (bestIdx + 1 < live.length) candidates.push(bestIdx + 1);
    
    for (const idx of candidates) {
      const c = live[idx];
      const start = Number(c.start_media_time) || 0;
      const end = Number(c.end_media_time) || start;
      const next = live[idx + 1];
      const holdEnd = next ? (Number(next.start_media_time) || 0) : end + grace;
      if (t >= start && t < holdEnd) {
        hit = c;
        lastCueIndex = idx;
      }
    }
    
    return hit;
  }

  /**
   * Token enrich via /tokenize_batch. Keeps en/vi/mt_locked intact.
   * Used after import and JA Enter. Retries later via syncHealth if bridge offline.
   */
  async function enrichTokensAfterImport(cueIds = null) {
    if (!bridgeReady) return 0;
    const idSet = cueIds
      ? new Set(Array.from(cueIds).map((x) => String(x)))
      : null;
    const targets = cues.filter((c) => {
      if (!c || !String(c.source || "").trim()) return false;
      if (idSet && !idSet.has(c.id)) return false;
      return Vocab.tokensNeedEnrich(c);
    });
    if (!targets.length) return 0;

    const snapById = new Map(
      targets.map((c) => [
        c.id,
        {
          source: c.source,
          gen: c._txGen || 0,
          en: c.en,
          vi: c.vi,
          mt_locked: !!c.mt_locked,
          translation_source: c.translation_source,
        },
      ])
    );

    let results = null;
    try {
      const res = await bridgeFetch("/tokenize_batch", {
        method: "POST",
        body: {
          cues: targets.map((c) => ({ id: c.id, text: c.source })),
        },
      });
      if (res?.ok && Array.isArray(res.data?.results)) {
        results = res.data.results;
      }
    } catch (_) {
      results = null;
    }

    // Fallback: single /tokenize per cue (older bridge without batch).
    if (!results) {
      results = [];
      for (const c of targets) {
        try {
          const one = await bridgeFetch("/tokenize", {
            method: "POST",
            body: { text: c.source },
          });
          if (one?.ok && one.data) {
            results.push({
              id: c.id,
              source: c.source,
              tokens: one.data.tokens || [],
            });
          }
        } catch (_) {
          /* skip */
        }
      }
    }

    let wrote = 0;
    for (const d of results) {
      if (!d) continue;
      const target = cues.find((c) => c.id === d.id) || null;
      if (!target) continue;
      const snap = snapById.get(target.id);
      if (!snap) continue;
      if ((target._txGen || 0) !== snap.gen || target.source !== snap.source) {
        continue;
      }
      const toks = Array.isArray(d.tokens) ? d.tokens : [];
      if (!toks.length) continue;
      target.tokens = toks;
      // Hard-guarantee: never let enrich touch EN/VI or lock.
      target.en = snap.en;
      target.vi = snap.vi;
      target.mt_locked = snap.mt_locked;
      target.translation_source = snap.translation_source;
      wrote += 1;
    }

    if (wrote > 0) {
      scheduleSaveTranscript();
      listDirty = true;
      const active = cues.find((c) => c.id === activeCueId);
      updateBar(active || null);
      updateCaptionStatusLine();
      publishSidePanelState();
    }
    return wrote;
  }

  async function clearTranslations() {
    for (const c of cues) {
      c.en = "";
      c.vi = "";
      c.tokens = [];
      c.translated = false;
      unlockCueTranslation(c);
      c._txGen = (c._txGen || 0) + 1;
    }
    translatingIds.clear();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // force + awaitDisk: ownership score must not block wipe; disk must not keep old EN/VI.
    await saveTranscript({ force: true, awaitDisk: true });
    listDirty = true;
    const active = cues.find((c) => c.id === activeCueId);
    updateBar(active || null);
    updateCaptionStatusLine();
    publishSidePanelState();
    toast("Đã xóa bản dịch");
  }

  /**
   * Wipe chrome.storage + disk script for this video, then re-fetch YouTube
   * timedtext from scratch (no cache merge / no owned-script restore).
   */
  async function wipeSavedScriptAndReload() {
    if (!currentVideoId) {
      toast("Không có video");
      return;
    }
    translatingIds.clear();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const key = `transcript:${currentVideoId}`;
    const metaKey = metaStorageKey(currentVideoId);
    try {
      await chrome.storage.local.remove([key, metaKey]);
    } catch (_) {}
    transcriptMeta = emptyMeta();
    try {
      await bridgeFetch(`/scripts/${encodeURIComponent(currentVideoId)}`, {
        method: "DELETE",
      });
    } catch (_) {
      /* bridge offline — chrome.storage already cleared */
    }
    cues = [];
    // Invalidate sorted cache on wipe
    sortedCuesGen = -1;
    sortedCuesCache = null;
    lastCueIndex = 0;
    activeCueId = "";
    listDirty = true;
    updateBar(null);
    publishSidePanelState();
    updateCaptionStatusLine();
    toast("Đang tải lại caption từ đầu…");
    await loadAllCaptions(true, { skipCache: true });
    if (cues.length) toast(`Đã tải lại ${cues.length} câu từ YouTube`);
    else toast(`Không có caption (${captionsInfo || captionsStatus})`);
  }

  /** Match import row → live cue by id, else start±tol + source (cache-merge spirit). */
  function findLiveCueForImport(row, usedIds) {
    const id = String(row?.id || "").trim();
    if (id) {
      const byId = cues.find((c) => c.id === id && !usedIds.has(c.id));
      if (byId) return byId;
    }
    const start = Number(row?.start_media_time ?? row?.start);
    const source = String(row?.source || row?.text || "").trim();
    if (!Number.isFinite(start)) return null;
    const compact = compactSource(source);
    let best = null;
    let bestDt = Infinity;
    for (const c of cues) {
      if (usedIds.has(c.id)) continue;
      const dt = Math.abs((Number(c.start_media_time) || 0) - start);
      if (dt > CACHE_MATCH_TOL) continue;
      const prevSrc = String(c.source || "");
      const srcOk =
        !source ||
        prevSrc === source ||
        compactSource(prevSrc) === compact;
      if (!srcOk) continue;
      if (dt < bestDt) {
        best = c;
        bestDt = dt;
      }
    }
    return best;
  }

  function normalizeImportRow(raw) {
    if (!raw || typeof raw !== "object") return null;
    const start = Number(raw.start_media_time ?? raw.start ?? raw.media_time);
    // Missing end stays NaN — repairImportCueEnds fills only when needed.
    const endRaw = raw.end_media_time ?? raw.end;
    const end = endRaw == null || endRaw === "" ? NaN : Number(endRaw);
    return {
      id: String(raw.id || "").trim(),
      start_media_time: Number.isFinite(start) ? start : NaN,
      end_media_time: Number.isFinite(end) ? end : NaN,
      source: String(raw.source || raw.text || raw.ja || "").trim(),
      en: raw.en != null ? String(raw.en) : null,
      vi: raw.vi != null ? String(raw.vi) : null,
      tokens: Array.isArray(raw.tokens) ? raw.tokens : null,
      translated: raw.translated,
      mt_locked: raw.mt_locked,
      translation_source: raw.translation_source,
    };
  }

  /**
   * Only fix missing / non-positive ends. When file already has end > start,
   * keep exact times (no CPS retime, no clamp-to-next). Prefer next cue start
   * as end over inventing start+2.
   */
  function repairImportCueEnds(list) {
    const EPS = 0.05;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const start = Number(c.start_media_time) || 0;
      let end = Number(c.end_media_time);
      if (Number.isFinite(end) && end > start) {
        c.start_media_time = start;
        c.end_media_time = end;
        continue;
      }
      const next = list[i + 1];
      const nextStart = next ? Number(next.start_media_time) || 0 : NaN;
      if (Number.isFinite(nextStart) && nextStart > start + EPS) {
        end = nextStart;
      } else {
        end = start + 2;
      }
      c.start_media_time = start;
      c.end_media_time = end;
    }
  }

  /**
   * Full replace: swap in-memory cues with the imported file (JA + EN/VI + timeline),
   * clear tombstones, mark owned, overwrite chrome.storage + disk script.
   * Preserves file start/end exactly when both present and end > start.
   */
  async function importCuesReplace(rows) {
    const next = [];
    let skipped = 0;
    for (const row of rows) {
      const hasTiming =
        Number.isFinite(row.start_media_time) || Number.isFinite(row.end_media_time);
      const hasText = !!(row.source || (row.en != null && String(row.en).trim()) ||
        (row.vi != null && String(row.vi).trim()));
      if (!hasTiming && !hasText) {
        skipped += 1;
        continue;
      }
      const start = Number.isFinite(row.start_media_time) ? row.start_media_time : 0;
      // Keep NaN when end missing — repairImportCueEnds prefers next.start.
      const end = Number.isFinite(row.end_media_time) ? row.end_media_time : NaN;
      const source = row.source || "";
      const en = row.en != null ? String(row.en) : "";
      const vi = row.vi != null ? String(row.vi) : "";
      const hasMt = !!(en.trim() || vi.trim());
      const tokens = Array.isArray(row.tokens) ? row.tokens : [];
      const cue = {
        id: row.id || cueId(start, source || "empty"),
        start_media_time: start,
        end_media_time: end,
        source,
        en: hasMt ? en : "",
        vi: hasMt ? vi : "",
        tokens: hasMt ? tokens : [],
        translated: !!(hasMt && row.translated !== false),
        text_source: "script",
        _txGen: 1,
      };
      if (hasMt) lockCueTranslation(cue, "import");
      next.push(cue);
    }
    next.sort((a, b) => {
      const ds =
        (Number(a.start_media_time) || 0) - (Number(b.start_media_time) || 0);
      if (ds !== 0) return ds;
      return (Number(a.end_media_time) || 0) - (Number(b.end_media_time) || 0);
    });
    repairImportCueEnds(next);
    if (!next.length) {
      toast("Import: không có cue hợp lệ để thay thế");
      return {
        updated: 0,
        skipped,
        unmatched: 0,
        replaced: 0,
        mode: "replace",
        includeJa: true,
      };
    }

    translatingIds.clear();
    cues = next;
    // Invalidate sorted cache on import replace
    sortedCuesGen = -1;
    sortedCuesCache = null;
    lastCueIndex = 0;
    activeCueId = null;
    transcriptMeta.tombstones = [];
    await markScriptOwned();

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // Atomic overwrite — do not remove-then-write (Reload race empty cache → YT).
    await saveTranscript();

    listDirty = true;
    captionsStatus = "ok";
    captionsInfo = `import · ${next.length} cues`;
    await syncToPlayhead();
    updateCaptionStatusLine();
    publishSidePanelState();
    // Tokens (furigana + JLPT) without regenerating locked EN/VI.
    const enriched = await enrichTokensAfterImport();
    toast(
      enriched > 0
        ? `Import: đã thay thế ${next.length} cue · enrich ${enriched}`
        : `Import: đã thay thế ${next.length} cue`
    );
    return {
      updated: next.length,
      skipped,
      unmatched: 0,
      replaced: next.length,
      mode: "replace",
      includeJa: true,
      enriched,
    };
  }

  /**
   * Apply imported cue translations onto the current video list.
   * mode=merge: only write non-empty EN/VI from file; leave other cues alone.
   * mode=replace: fully replace cues (JA + EN/VI + timeline); clear old saved script.
   * includeJa (merge only): also apply source + timeline (marks script owned).
   * Full/replace always includes JA + timeline (includeJa forced true).
   */
  async function importCues(rawList, opts = {}) {
    const mode = opts.mode === "replace" ? "replace" : "merge";
    const includeJa = mode === "replace" ? true : !!opts.includeJa;
    const rows = (Array.isArray(rawList) ? rawList : [])
      .map(normalizeImportRow)
      .filter(Boolean);

    if (mode === "replace") {
      return importCuesReplace(rows);
    }

    let updated = 0;
    let skipped = 0;
    let unmatched = 0;
    const usedIds = new Set();

    for (const row of rows) {
      const hasEn = row.en != null;
      const hasVi = row.vi != null;
      const hasJa =
        includeJa &&
        (row.source ||
          Number.isFinite(row.start_media_time) ||
          Number.isFinite(row.end_media_time));
      if (!hasEn && !hasVi && !hasJa) {
        skipped += 1;
        continue;
      }
      const cue = findLiveCueForImport(row, usedIds);
      if (!cue) {
        unmatched += 1;
        continue;
      }
      usedIds.add(cue.id);

      let changed = false;
      let gotImportMt = false;
      if (hasEn && String(row.en).trim()) {
        if (cue.en !== row.en) {
          cue.en = row.en;
          changed = true;
        }
        gotImportMt = true;
      }
      if (hasVi && String(row.vi).trim()) {
        if (cue.vi !== row.vi) {
          cue.vi = row.vi;
          changed = true;
        }
        gotImportMt = true;
      }
      // Any cue that receives EN/VI from import is translation-locked.
      if (
        gotImportMt ||
        (row.mt_locked &&
          (String(cue.en || "").trim() || String(cue.vi || "").trim()))
      ) {
        if (!isMtLocked(cue) || cue.translation_source !== "import") {
          changed = true;
        }
        lockCueTranslation(cue, "import");
      }

      if (includeJa) {
        if (row.source && cue.source !== row.source) {
          cue.source = row.source;
          cue.tokens = [];
          cue.text_source = "edit";
          changed = true;
        }
        if (Number.isFinite(row.start_media_time) || Number.isFinite(row.end_media_time)) {
          const s = Number.isFinite(row.start_media_time)
            ? row.start_media_time
            : cue.start_media_time;
          let e = Number.isFinite(row.end_media_time)
            ? row.end_media_time
            : cue.end_media_time;
          // Preserve exact file end when valid; else leave for repairImportCueEnds.
          if (!Number.isFinite(e) || e <= s) e = NaN;
          if (cue.start_media_time !== s || cue.end_media_time !== e) {
            cue.start_media_time = s;
            cue.end_media_time = e;
            cue.text_source = cue.text_source === "yt" ? "edit" : cue.text_source || "edit";
            changed = true;
          }
        }
        if (row.tokens && Array.isArray(row.tokens)) {
          cue.tokens = row.tokens;
          changed = true;
        }
      }

      const hasMt = !!(String(cue.en || "").trim() || String(cue.vi || "").trim());
      const nextTranslated = hasMt;
      if (cue.translated !== nextTranslated) {
        cue.translated = nextTranslated;
        changed = true;
      }

      if (changed) {
        cue._txGen = (cue._txGen || 0) + 1;
        updated += 1;
      } else {
        skipped += 1;
      }
    }

    let enriched = 0;
    if (updated > 0) {
      if (includeJa) await markScriptOwned();
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (includeJa) {
        cues.sort((a, b) => {
          const ds =
            (Number(a.start_media_time) || 0) - (Number(b.start_media_time) || 0);
          if (ds !== 0) return ds;
          return (Number(a.end_media_time) || 0) - (Number(b.end_media_time) || 0);
        });
        // Only fills missing/invalid ends (keeps exact file times otherwise).
        repairImportCueEnds(cues);
      }
      await saveTranscript();
      listDirty = true;
      const active = cues.find((c) => c.id === activeCueId);
      updateBar(active || null);
      updateCaptionStatusLine();
      publishSidePanelState();
    }

    // Merge may lock EN/VI without tokens; even when file doesn't change EN/VI
    // (updated == 0), we still need to enrich tokens for furigana/JLPT coloring.
    if (usedIds.size > 0) {
      enriched = await enrichTokensAfterImport(usedIds);
    }

    toast(
      enriched > 0
        ? `Import: cập nhật ${updated} · enrich ${enriched} · bỏ qua ${skipped} · không khớp ${unmatched}`
        : `Import: cập nhật ${updated} · bỏ qua ${skipped} · không khớp ${unmatched}`
    );
    return { updated, skipped, unmatched, mode, includeJa, enriched };
  }

  function exportTxt() {
    const lines = [];
    // Prefer "# ---…" over bare ===== lines — IDEs treat ======= as conflict markers.
    // Keep 10+ dashes so import_parse.split(/-{10,}/) still works.
    lines.push("# ----------------------------------------");
    lines.push("# YouTube Caption Session");
    lines.push(`URL: ${location.href}`);
    lines.push(`Exported: ${new Date().toISOString().replace("T", " ").slice(0, 16)}`);
    lines.push("# ----------------------------------------");
    lines.push("");
    cues.forEach((cue, i) => {
      const n = i + 1;
      const furi = (cue.tokens || [])
        .map((t) => (t.reading ? `${t.surface}(${t.reading})` : t.surface))
        .join("");
      lines.push(
        `[${String(n).padStart(3, "0")}] ${formatTime(cue.start_media_time)} → ${formatTime(cue.end_media_time)}`
      );
      if (settings.exportFormat !== "vi") {
        lines.push(`JA: ${cue.source}`);
        if (furi) lines.push(`    (${furi})`);
      }
      if (settings.exportFormat === "ja_en_vi") {
        lines.push(`EN: ${stripStubPrefix(cue.en)}`);
      }
      lines.push(`VI: ${stripStubPrefix(cue.vi)}`);
      lines.push("");
      lines.push("# ----------------------------------------");
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `yt-caption-${currentVideoId || "session"}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Đã export TXT");
  }

  async function tick() {
    if (!settings.enabled) return;
    const mtRes = await pageCall("GET_MEDIA_TIME", {}, 400);
    const mediaTime = Number(mtRes?.mediaTime);
    if (!Number.isFinite(mediaTime)) return;

    // Detect playback state for dynamic tick interval
    const playerState = mtRes?.playerState || "";
    const wasPlaying = isPlaying;
    isPlaying = playerState === "playing" || playerState === "buffering";
    
    // Adjust tick interval based on playback state
    // Paused: 1000ms (save CPU), Playing: 250ms (responsive), Buffering: 500ms
    const targetInterval = !isPlaying ? 1000 : wasPlaying === isPlaying ? tickIntervalMs : 250;
    if (targetInterval !== tickIntervalMs && loopTimer) {
      tickIntervalMs = targetInterval;
      clearInterval(loopTimer);
      loopTimer = setInterval(tick, tickIntervalMs);
    }

    const active = findActiveCue(mediaTime);
    const nextId = active?.id || "";
    if (nextId !== activeCueId) {
      activeCueId = nextId;
      updateBar(active);
      // Lightweight playhead sync — omit cue list (full publish only when listDirty).
      publishSidePanelPartial({ activeCueId, currentTime: mediaTime });
    } else if (active) {
      updateBar(active);
    } else {
      updateBar(null);
    }

    if (listDirty) renderList(true);
  }

  function startLoop() {
    stopLoop();
    // Start with default interval; dynamic adjustment happens in tick based on playback
    loopTimer = setInterval(tick, tickIntervalMs);
    healthTimer = setInterval(syncHealth, 5000);
    syncHealth();
  }

  function stopLoop() {
    if (loopTimer) clearInterval(loopTimer);
    if (healthTimer) clearInterval(healthTimer);
    loopTimer = null;
    healthTimer = null;
  }

  async function onNavigate() {
    const gen = ++navigateGen;
    currentVideoId = videoIdFromUrl();
    cues = [];
    // Invalidate sorted cache on navigate
    sortedCuesGen = -1;
    sortedCuesCache = null;
    lastCueIndex = 0;
    activeCueId = "";
    translatingIds.clear();
    transcriptMeta = emptyMeta();
    if (currentVideoId) {
      transcriptMeta = await loadTranscriptMeta(currentVideoId);
    }
    if (gen !== navigateGen) return;

    // B7: kick SW caption pack immediately in parallel with page bridge wait.
    const swPromise = currentVideoId
      ? loadCaptionsViaBackground(currentVideoId, settings.sourceLang, {
          baseUrl: "",
          lang: settings.sourceLang,
        })
      : null;

    // iPad parity: restore saved script immediately; owned import skips YT replace.
    listDirty = true;
    const restored =
      !!currentVideoId &&
      (await tryApplySavedScript("navigate", { quiet: true }));
    if (gen !== navigateGen) return;
    if (!restored) renderList(true);

    ensurePlayerToggleObserver();
    ensurePlayerToggle();
    void maybeAutoOpenOnNavigate();
    // Disk is already on screen; Drive check runs behind it and re-applies via DRIVE_RESTORED.
    void checkDriveFresh(currentVideoId);

    if (restored && transcriptMeta.owned) {
      // Heal chrome.storage if a poor YT auto-save was shadowing disk.
      void saveTranscript({ force: true });
      if (cues.length) await syncToPlayhead();
      else updateBar(null);
      syncHealth();
      return;
    }

    const ready = await waitForPageBridge(2500);
    if (gen !== navigateGen) return;
    if (ready) await pageCall("BIND", {}, 400);
    if (gen !== navigateGen) return;
    // Pass bridgeReady + swPromise so loadAllCaptions reuses the early SW kick.
    await loadAllCaptions(true, { bridgeReady: ready, swPromise });
    if (gen !== navigateGen) return;
    if (!cues.length && currentVideoId) {
      await sleep(800);
      if (gen !== navigateGen) return;
      await loadAllCaptions(true, { bridgeReady: ready });
    }
    if (gen !== navigateGen) return;
    if (cues.length) await syncToPlayhead();
    else updateBar(null);
    syncHealth();
  }

  async function init() {
    await loadSettings();
    // Prove which unpacked build is live after chrome://extensions Reload.
    void bridgeFetch("/log", {
      method: "POST",
      body: {
        level: "INFO",
        message: `ext content boot v=${chrome.runtime.getManifest().version} api=${PAGE_API_VER}`,
      },
    }).catch(() => {});
    ensureUI();
    injectPageScript();
    applyDim();
    applyBarVisibility();
    applyBarPosition();
    ensurePlayerToggleObserver();
    ensurePlayerToggle();
    bindGestureOpenSidePanel();
    document.addEventListener("yt-navigate-finish", () => onNavigate());
    await onNavigate();
    bridgeFetch("/bootstrap", { method: "POST" }).catch(() => {});
    startLoop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let dirty = false;
    if (changes.hardsubSettings) {
      settings = { ...DEFAULTS, ...changes.hardsubSettings.newValue };
      if (settings.vocabColors) {
        settings.vocabColors = {
          ...(Vocab.DEFAULT_VOCAB_COLORS || {}),
          ...settings.vocabColors,
        };
      }
      settings.levelColors = Vocab.normalizeLevelColors(
        settings.levelColors || Vocab.DEFAULT_LEVEL_COLORS
      );
      if (settings.levelHighlightEnabled == null) {
        settings.levelHighlightEnabled = true;
      }
      if (settings.dictShowSentence == null) settings.dictShowSentence = true;
      if (settings.autoOpen == null) settings.autoOpen = DEFAULTS.autoOpen;
      if (settings.showOnVideo == null) settings.showOnVideo = DEFAULTS.showOnVideo;
      if (settings.barBgOpacity == null) settings.barBgOpacity = DEFAULTS.barBgOpacity;
      if (settings.barTextOpacity == null) settings.barTextOpacity = DEFAULTS.barTextOpacity;
      if (settings.barShowJa == null) settings.barShowJa = true;
      if (settings.barShowEn == null) settings.barShowEn = true;
      if (settings.barShowVi == null) settings.barShowVi = true;
      if (settings.barScale == null || !Number.isFinite(Number(settings.barScale))) {
        settings.barScale = DEFAULTS.barScale;
      }
      if (settings.barScaleW == null || !Number.isFinite(Number(settings.barScaleW))) {
        settings.barScaleW = Number(settings.barScale) || DEFAULTS.barScaleW;
      }
      if (settings.barScaleH == null || !Number.isFinite(Number(settings.barScaleH))) {
        settings.barScaleH = Number(settings.barScale) || DEFAULTS.barScaleH;
      }
      applyDim();
      applyBarVisibility();
      applyBarPosition();
      applyBarStyle();
      ensurePlayerToggle();
      dirty = true;
    }
    if (changes.userVocab) {
      userVocab =
        changes.userVocab.newValue && typeof changes.userVocab.newValue === "object"
          ? changes.userVocab.newValue
          : {};
      dirty = true;
    }
    if (!dirty) return;
    listDirty = true;
    const active = cues.find((c) => c.id === activeCueId);
    if (active) updateBar(active);
    renderList(true);
    publishSidePanelState();
  });
})();
