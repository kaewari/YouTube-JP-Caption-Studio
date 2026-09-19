/**
 * Chrome Side Panel UI — receives SP_STATE from content, sends SP_CMD back.
 */
(() => {
  const Vocab = globalThis.HardsubVocab || {
    classForToken: () => "",
    applyColorVars: () => {},
    applyHighlightVars: () => {},
    normalizeLevelColors: (c) => c || {},
    DEFAULT_LEVEL_COLORS: {},
    LEVEL_KEYS: ["n5", "n4", "n3", "n2", "n1", "unknown"],
    LEVEL_LABELS: {},
    renderLevelPreviewHtml: () => "",
  };

  const statusEl = document.getElementById("sp-status");
  const driveStatusEl = document.getElementById("sp-drive-status");
  const driveConnectBtn = document.getElementById("sp-drive-connect");
  const driveUploadBtn = document.getElementById("sp-drive-upload");
  const sourceEl = document.getElementById("sp-source");
  const sourceRefreshBtn = document.getElementById("sp-source-refresh");
  const listEl = document.getElementById("sp-list");
  const emptyEl = document.getElementById("sp-empty");
  const toastEl = document.getElementById("sp-toast");
  const overlayBtn = document.getElementById("sp-overlay");
  const followBtn = document.getElementById("sp-follow");

  let state = {
    videoId: "",
    status: "",
    cues: [],
    activeCueId: "",
    showOnVideo: false,
    showFurigana: true,
    bridgeReady: false,
    vocabHighlight: true,
    vocabColors: null,
    vocabCats: null,
    levelHighlightEnabled: true,
    levelColors: null,
    userVocab: {},
    savedCues: [],
  };

  function normalizeSavedCues(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === "object") return Object.values(val);
    return [];
  }

  function isCueStarred(id) {
    if (!id) return false;
    const list = normalizeSavedCues(state.savedCues);
    return list.some((c) => c && c.id === id);
  }

  /** Fallback mirror of JLPT colors (storage-level settings live in the
   *  popup settings tab now; content SP_STATE carries the live values). */
  let levelSettings = {
    levelHighlightEnabled: true,
    levelColors: Vocab.normalizeLevelColors(Vocab.DEFAULT_LEVEL_COLORS),
  };
  let tabId = null;
  let currentActiveTabId = null;
  let listDirty = true;
  /** Last accepted SP_STATE cue-list sequence (drop stale full payloads). */
  let lastCueSeq = 0;
  let lastCueSession = "";

  /** Cache /health response (5s) */
  let _healthCache = { data: null, expiresAt: 0 };
  async function fetchBridgeHealth(maxAgeMs = 5000) {
    const now = Date.now();
    if (_healthCache.data && now < _healthCache.expiresAt) {
      return _healthCache.data;
    }
    try {
      const res = await chrome.runtime.sendMessage({
        type: "BRIDGE_FETCH",
        path: "/health",
        method: "GET",
      });
      _healthCache = { data: res, expiresAt: now + maxAgeMs };
      return res;
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
  let lastGetStateAt = 0;
  let getStatePendingTimer = null;
  function throttledGetState(targetTabId) {
    if (targetTabId == null) return;
    const now = Date.now();
    const elapsed = now - lastGetStateAt;
    if (elapsed >= 200) {
      lastGetStateAt = now;
      if (getStatePendingTimer) {
        clearTimeout(getStatePendingTimer);
        getStatePendingTimer = null;
      }
      try {
        chrome.tabs.sendMessage(targetTabId, { type: "SP_CMD", cmd: "get_state" }).catch(() => {});
      } catch (_) {}
    } else if (!getStatePendingTimer) {
      getStatePendingTimer = setTimeout(() => {
        getStatePendingTimer = null;
        lastGetStateAt = Date.now();
        try {
          chrome.tabs.sendMessage(targetTabId, { type: "SP_CMD", cmd: "get_state" }).catch(() => {});
        } catch (_) {}
      }, 200 - elapsed);
    }
  }

  /**
   * Edit session for JA / EN / VI / timeline. While set, skip full renderList.
   * JA/EN/VI: Enter commits (JA → force MT; EN/VI → persist + lock only);
   * blur/Escape cancel draft.
   * Timeline: Enter commits; blur still commits (time inputs).
   */
  let editingIdx = null;
  let editingKind = ""; // "ja" | "en" | "vi" | "time"
  let editOriginalSource = "";
  let editOriginalLang = "";
  let commitOnEnter = false;
  let pendingListRender = false;
  /**
   * JA IME: web best-effort (lang/ime-mode/nudge) + bridge POST /ime/switch when
   * local bridge is running (macOS Input Source JA↔ABC). No install.sh needed.
   */
  let editPrevLang = null;
  let imeActivating = false;
  let imeNudgeEl = null;
  let osImeActive = false;

  const Timing = globalThis.HardsubCueTiming || {
    parseTimeInput: (s) => Number(String(s || "").replace(",", ".")),
    formatTimeInput: (sec) => {
      const t = Math.max(0, Number(sec) || 0);
      const m = Math.floor(t / 60);
      const s = Math.floor(t - m * 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    },
  };

  /** YouTube-like: auto-scroll until user scrolls; ▶ / button resumes. */
  let followTimeline = true;
  let ignoreScrollEvent = false;
  // Short cues flip faster than scroll settle — coalesce to latest id (iPad parity).
  let scrollAnimInFlight = false;
  let pendingScrollId = null;
  let scrollAnimRaf = null;
  const SCROLL_EASE_MS = 380;

  function setStatus(text) {
    statusEl.textContent = text || "…";
  }

  function setDriveStatus(text) {
    const t = String(text || "");
    if (driveStatusEl) {
      driveStatusEl.textContent = t;
      driveStatusEl.classList.toggle("is-error", /^error/i.test(t));
      driveStatusEl.classList.toggle(
        "is-ok",
        /^(Connected|Uploaded|Restored)/i.test(t)
      );
    }
    if (driveUploadBtn) {
      if (/^error/i.test(t) || /auth/i.test(t)) {
        driveUploadBtn.classList.add("sp-btn-warn");
        driveUploadBtn.title = `Drive: ${t} — Bấm để kết nối / cấp quyền lại`;
      } else if (/^(Connected|Uploaded)/i.test(t)) {
        driveUploadBtn.classList.remove("sp-btn-warn");
        driveUploadBtn.title = `Drive: ${t} (Bấm để upload ngay)`;
      }
    }
  }

  function agoText(iso) {
    const t = Date.parse(String(iso || ""));
    if (!Number.isFinite(t)) return "";
    const min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return "vừa xong";
    if (min < 60) return `${min} phút trước`;
    if (min < 1440) return `${Math.round(min / 60)} giờ trước`;
    return `${Math.round(min / 1440)} ngày trước`;
  }

  /** "disk · rev 12 · 2 phút trước" — so a stale copy never sits there silently. */
  function setScriptSource(src) {
    if (!sourceEl) return;
    const parts = [];
    if (src?.origin) parts.push(src.origin);
    if (src?.rev) parts.push(`rev ${src.rev}`);
    const ago = agoText(src?.updatedAt);
    if (ago) parts.push(ago);
    sourceEl.textContent = parts.join(" · ");
  }

  async function refreshDriveStatus() {
    try {
      const r = await chrome.runtime.sendMessage({ type: "DRIVE_STATUS" });
      if (r?.status) setDriveStatus(r.status);
      else if (r?.connected) setDriveStatus("Connected");
    } catch (_) {}
  }

  async function pullDriveOnOpen() {
    try {
      const r = await chrome.runtime.sendMessage({ type: "DRIVE_PULL" });
      if (r?.status) setDriveStatus(r.status);
      else if (r?.restored) setDriveStatus("Restored");
      else if (r?.ok && r?.skipped === "not_connected") setDriveStatus("");
      else await refreshDriveStatus();
      if (r?.restored) {
        toast(`Drive mới hơn — đã nạp ${r.pulled?.length || 0} video`, 2800);
      }
    } catch (_) {}
  }

  function syncFollowBtn() {
    if (followBtn) {
      followBtn.hidden = false;
      followBtn.classList.toggle("active", followTimeline);
      followBtn.textContent = followTimeline ? "▶ Cuộn" : "⏸ Cuộn";
      followBtn.title = followTimeline
        ? "Đang tự động cuộn (Bấm để tạm dừng)"
        : "Tự động cuộn đang tắt (Bấm để cuộn theo video)";
    }
  }

  function setFollowTimeline(on, opts = {}) {
    followTimeline = !!on;
    syncFollowBtn();
    if (followTimeline && opts.scroll !== false) {
      scrollActiveIntoView(true);
    }
  }

  function syncListVisibility() {
    const hasCues = (state.cues || []).length > 0;
    emptyEl.hidden = hasCues;
    listEl.hidden = !hasCues;
    if (!hasCues) {
      emptyEl.textContent = state.videoId
        ? `Chưa có caption (${state.status || "…"})\nBấm Reload để tải lại.`
        : "Mở tab YouTube / ABEMA / Netflix đang phát video, rồi bấm icon extension để mở panel.";
    }
  }

  let toastHideTimer = null;
  function toast(msg, ms = 1600) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    if (toastHideTimer) clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(() => {
      toastEl.hidden = true;
      toastHideTimer = null;
    }, ms);
  }

  async function syncActiveTab() {
    try {
      let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tabs?.length || !isSupportedVideoUrl(tabs[0]?.url)) {
        tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      let active = tabs?.find((t) => isSupportedVideoUrl(t?.url));
      if (!active) {
        const vidTabId = await resolveTabId();
        if (vidTabId != null) return vidTabId;
      }
      if (active?.id != null && active.id !== currentActiveTabId) {
        currentActiveTabId = active.id;
        tabId = active.id;
        // Request immediate state from the newly active tab (<50ms)
        try {
          chrome.tabs.sendMessage(currentActiveTabId, { type: "SP_CMD", cmd: "get_state" }).catch(() => {});
        } catch (_) {}
      }
    } catch (_) {}
  }

  async function resolveTabId() {
    try {
      let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tabs?.length || !isSupportedVideoUrl(tabs[0]?.url)) {
        tabs = await chrome.tabs.query({ active: true });
      }
      let active = tabs?.find((t) => isSupportedVideoUrl(t.url));
      if (!active) {
        const all = await chrome.tabs.query({});
        active = all.find((t) => isSupportedVideoUrl(t.url));
      }
      if (active?.id != null) {
        currentActiveTabId = active.id;
        tabId = active.id;
        return tabId;
      }
    } catch (_) {}
    if (currentActiveTabId != null) return currentActiveTabId;
    if (tabId != null) return tabId;
    return null;
  }

  async function sendCmd(cmd, payload = {}) {
    const id = await resolveTabId();
    if (id == null) {
      toast("Không thấy tab video (YouTube/ABEMA/Netflix)");
      return null;
    }
    try {
      return await chrome.tabs.sendMessage(id, { type: "SP_CMD", cmd, ...payload });
    } catch (err) {
      // Retry via background proxy
      try {
        return await chrome.runtime.sendMessage({
          type: "SP_CMD_PROXY",
          tabId: id,
          cmd,
          payload,
        });
      } catch (e2) {
        toast("Tab chưa sẵn — refresh trang");
        return null;
      }
    }
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

  function stripStub(text) {
    return String(text || "")
      .replace(/^\[(vi|en)\]\s*/i, "")
      .trim();
  }

  function formatCopy(cue, format) {
    const furi = (cue.tokens || [])
      .map((t) => (t.reading ? `${t.surface}(${t.reading})` : t.surface))
      .join("");
    const fmt = format || "full";
    const vi = stripStub(cue.vi);
    const en = stripStub(cue.en);
    if (fmt === "ja") return cue.source || "";
    if (fmt === "vi") return vi;
    if (fmt === "ja_vi") return `JA: ${cue.source || ""}\nVI: ${vi}`;
    return `JA: ${cue.source || ""}\n   (${furi || cue.source || ""})\nEN: ${en}\nVI: ${vi}`;
  }

  async function writeClipboard(text) {
    const s = String(text ?? "");
    try {
      await navigator.clipboard.writeText(s);
      return true;
    } catch (_) {
      /* fall through — clipboard API needs secure focus */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  async function copyCueById(id, format) {
    const cue = (state.cues || []).find((c) => c.id === id);
    if (!cue) {
      toast("Không tìm thấy cue");
      return;
    }
    const ok = await writeClipboard(formatCopy(cue, format));
    toast(ok ? "Đã sao chép" : "Copy thất bại");
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function highlightSettingsFromState() {
    return {
      vocabHighlight: state.vocabHighlight !== false,
      vocabLevel: state.vocabLevel,
      showKnownGreen: state.showKnownGreen,
      hideRareWords: state.hideRareWords,
      vocabCats: state.vocabCats,
      vocabColors: state.vocabColors,
      levelHighlightEnabled: state.levelHighlightEnabled !== false,
      levelColors: state.levelColors || levelSettings.levelColors,
    };
  }

  function applyListHighlightVars() {
    const hs = highlightSettingsFromState();
    if (Vocab.applyHighlightVars) {
      Vocab.applyHighlightVars(listEl, hs);
    } else {
      Vocab.applyColorVars?.(listEl, state.vocabColors);
    }
  }

  function rubyHtml(cue) {
    if (Vocab && typeof Vocab.renderRubyHtml === "function") {
      return Vocab.renderRubyHtml(cue, {
        showFurigana: state.showFurigana,
        settings: highlightSettingsFromState(),
        userVocab: state.userVocab || {},
      });
    }
    return escapeHtml(cue?.source || "");
  }

  async function loadLevelSettings() {
    let s = {};
    try {
      if (chrome?.storage?.local) {
        const data = await chrome.storage.local.get("hardsubSettings");
        s = data?.hardsubSettings || {};
      }
      if (chrome?.storage?.sync) {
        const syncData = await chrome.storage.sync.get("hardsubSettings");
        if (syncData?.hardsubSettings) {
          Object.assign(s, syncData.hardsubSettings);
        }
      }
    } catch (_) {}
    levelSettings = {
      levelHighlightEnabled: s.levelHighlightEnabled !== false,
      enableBilingualJlptColor: s.enableBilingualJlptColor !== false,
      levelColors: Vocab.normalizeLevelColors(
        s.levelColors || Vocab.DEFAULT_LEVEL_COLORS
      ),
    };
    state.levelHighlightEnabled = levelSettings.levelHighlightEnabled;
    state.levelColors = levelSettings.levelColors;
    applyListHighlightVars();
    const toggleEl = document.getElementById("toggle-bilingual-jlpt");
    if (toggleEl) {
      toggleEl.checked = levelSettings.enableBilingualJlptColor !== false;
    }
  }

  /** Pin row flush under list top via scrollTop (avoids scrollIntoView ancestor / no-op). */
  function pinRowScrollTop(row) {
    const r = row.getBoundingClientRect();
    const lr = listEl.getBoundingClientRect();
    return Math.max(0, listEl.scrollTop + (r.top - lr.top) - 10);
  }

  function cancelScrollAnim() {
    if (scrollAnimRaf != null) {
      cancelAnimationFrame(scrollAnimRaf);
      scrollAnimRaf = null;
    }
  }

  /** Ease scrollTop to exact target (~380ms easeInOutQuint), with instant fallback if tab is hidden/throttled. */
  function easeScrollTop(target, onDone) {
    if (document.hidden) {
      listEl.scrollTop = target;
      if (typeof onDone === "function") onDone();
      return;
    }
    const start = listEl.scrollTop;
    const delta = target - start;
    if (Math.abs(delta) < 0.5) {
      listEl.scrollTop = target;
      if (typeof onDone === "function") onDone();
      return;
    }
    const t0 = performance.now();
    let safetyTimer = null;
    const finish = () => {
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      scrollAnimRaf = null;
      listEl.scrollTop = target; // exact flush end — no undershoot
      if (typeof onDone === "function") onDone();
    };

    safetyTimer = setTimeout(() => {
      if (scrollAnimRaf != null) {
        cancelAnimationFrame(scrollAnimRaf);
        finish();
      }
    }, SCROLL_EASE_MS + 80);

    // easeInOutQuint — softer start/end than cubic in-out.
    const ease = (t) =>
      t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / SCROLL_EASE_MS);
      listEl.scrollTop = start + delta * ease(t);
      if (t < 1) {
        scrollAnimRaf = requestAnimationFrame(frame);
      } else {
        finish();
      }
    };
    scrollAnimRaf = requestAnimationFrame(frame);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && followTimeline) {
      scrollActiveIntoView(true);
    }
  });

  function scrollActiveIntoView(force = false) {
    if (!followTimeline && !force) return;
    // iPad: scrollActiveIntoView guards editingCue — coalesce must not yank mid-edit.
    if (!force && isEditingAny()) return;
    let id = state.activeCueId;
    if (!id) {
      const activeRow = listEl.querySelector(".sp-sentence.active");
      if (activeRow) id = activeRow.dataset.id;
    }
    if (!id && typeof state.currentTime === "number" && Array.isArray(state.cues)) {
      const cur = state.cues.find(
        (c) => state.currentTime >= c.start_media_time && state.currentTime <= c.end_media_time
      );
      if (cur) {
        id = cur.id;
        state.activeCueId = id;
      }
    }
    if (!id && Array.isArray(state.cues) && state.cues.length) {
      const t = typeof state.currentTime === "number" ? state.currentTime : 0;
      let closest = state.cues[0];
      for (const c of state.cues) {
        if (t >= c.start_media_time && t <= c.end_media_time) {
          closest = c;
          break;
        }
        if (c.start_media_time <= t) {
          closest = c;
        } else {
          break;
        }
      }
      if (closest) {
        id = closest.id;
        state.activeCueId = id;
      }
    }
    if (!id || listEl.hidden) return;
    const active = listEl.querySelector(
      `.sp-sentence[data-id="${CSS.escape(id)}"]`
    );
    if (!active) return;
    const r = active.getBoundingClientRect();
    const lr = listEl.getBoundingClientRect();
    // Skip if already flush under list top (~10px padding, within 5px tolerance)
    if (!force && lr.height > 0) {
      const delta = r.top - lr.top;
      if (Math.abs(delta - 10) <= 5) return;
    }
    // Soft: cancel in-flight RAF and retarget (don't queue behind old anim).
    cancelScrollAnim();
    if (force) {
      pendingScrollId = null;
      scrollAnimInFlight = false;
    }
    if (!force) scrollAnimInFlight = true;
    const scrolledId = id;
    const target = pinRowScrollTop(active);
    const finish = () => {
      if (force) return;
      scrollAnimInFlight = false;
      const next =
        pendingScrollId ||
        (state.activeCueId !== scrolledId ? state.activeCueId : null);
      pendingScrollId = null;
      if (next) scrollActiveIntoView(false);
    };
    // Force / resume: instant pin. Soft: RAF ease to exact target (no scrollTo
    // smooth undershoot; no prev-nudge fight).
    if (force) {
      listEl.scrollTop = target;
      requestAnimationFrame(() => requestAnimationFrame(finish));
    } else {
      easeScrollTop(target, finish);
    }
  }

  function pauseFollowFromUser() {
    if (!followTimeline) return;
    cancelScrollAnim();
    scrollAnimInFlight = false;
    setFollowTimeline(false, { scroll: false });
  }

  function isJaEditor(el) {
    return !!(el && el.classList?.contains("sp-ja") && el.tagName === "TEXTAREA");
  }

  function isEditingJa() {
    if (editingIdx != null && editingKind === "ja") return true;
    return isJaEditor(document.activeElement);
  }

  function isEditingAny() {
    if (editingIdx != null) return true;
    const ae = document.activeElement;
    if (!ae) return false;
    return !!(
      isJaEditor(ae) ||
      (ae.classList?.contains("sp-vi") && ae.isContentEditable) ||
      (ae.classList?.contains("sp-en") && ae.isContentEditable) ||
      ae.classList?.contains("sp-t-start") ||
      ae.classList?.contains("sp-t-end")
    );
  }

  function jaDraftText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA") return String(el.value || "");
    return String(el.innerText || "");
  }

  function endEditSession() {
    editingIdx = null;
    editingKind = "";
    editOriginalSource = "";
    commitOnEnter = false;
  }

  function flushPendingListRender() {
    if (!pendingListRender || isEditingAny()) return;
    pendingListRender = false;
    listDirty = true;
    renderList(true);
  }

  function ensureImeNudge() {
    if (imeNudgeEl) return imeNudgeEl;
    const input = document.createElement("input");
    input.type = "text";
    input.lang = "ja-JP";
    input.setAttribute("inputmode", "text");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    input.className = "sp-ime-nudge";
    document.body.appendChild(input);
    imeNudgeEl = input;
    return input;
  }

  /**
   * Switch macOS IME via SW → bridge POST /ime/switch (Native Messaging fallback).
   * Offline / no Accessibility → quiet no-op; romaji→kana fallback still applies.
   * @returns {Promise<unknown>}
   */
  function requestOsIme(cmd) {
    const c = cmd === "activate" ? "activate" : "deactivate";
    try {
      return chrome.runtime
        .sendMessage({ type: "IME_SWITCH", cmd: c })
        .then((res) => {
          if (
            c === "activate" &&
            res &&
            res.needs_accessibility &&
            !globalThis.__hardsubImeAxToast
          ) {
            globalThis.__hardsubImeAxToast = true;
            toast(
              "IME: bật Accessibility cho ime-select (hoặc gõ romaji — tự chuyển kana)"
            );
          }
          return res;
        })
        .catch(() => null);
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  /** Convert trailing ASCII romaji in a JA textarea when OS IME stays Latin. */
  function applyRomajiFallback(el) {
    if (!el || el.dataset.skipRomaji === "1") return;
    const api = globalThis.HardsubRomajiKana;
    if (!api?.convertTrailingRomaji) return;
    const cursor = el.selectionStart ?? el.value.length;
    const next = api.convertTrailingRomaji(el.value, cursor);
    if (!next) return;
    el.dataset.skipRomaji = "1";
    el.value = next.value;
    try {
      el.setSelectionRange(next.cursor, next.cursor);
    } catch (_) {}
    el.dataset.skipRomaji = "";
  }

  /**
   * Japanese IME while editing JA (<textarea lang="ja-JP">).
   * Bridge: macOS Input Source → Japanese (Kana HID + TIS); restore on deactivate.
   * Hold imeActivating until bridge returns so helper focus churn cannot cancel edit.
   */
  function activateJaIme(el) {
    if (!el) return;
    editPrevLang = el.hasAttribute("lang") ? el.getAttribute("lang") : null;
    el.setAttribute("lang", "ja-JP");
    el.setAttribute("inputmode", "text");
    el.setAttribute("autocapitalize", "off");
    el.setAttribute("autocomplete", "off");
    el.setAttribute("autocorrect", "off");
    el.style.webkitImeMode = "active";
    el.style.imeMode = "active";
    imeActivating = true;
    const holdUntil = Date.now() + 2000;
    const release = () => {
      // Keep guard a beat after bridge so late TIS flips do not blur-cancel.
      const left = Math.max(0, holdUntil - Date.now());
      setTimeout(() => {
        imeActivating = false;
      }, Math.min(120, left));
    };
    // Fire OS switch ASAP (before first key); hold edit session until it settles.
    let bridgeP = Promise.resolve(null);
    if (!osImeActive) {
      osImeActive = true;
      bridgeP = Promise.resolve(requestOsIme("activate"));
    }
    try {
      el.focus({ preventScroll: true });
    } catch (_) {}
    bridgeP.finally(release);
    setTimeout(() => {
      imeActivating = false;
    }, 2000);
  }

  function restoreIme(el) {
    if (osImeActive) {
      osImeActive = false;
      requestOsIme("deactivate");
    }
    if (!el) {
      editPrevLang = null;
      return;
    }
    if (editPrevLang == null || editPrevLang === "") {
      el.setAttribute("lang", "ja-JP");
    } else {
      el.setAttribute("lang", editPrevLang);
    }
    el.removeAttribute("inputmode");
    el.style.webkitImeMode = "";
    el.style.imeMode = "";
    editPrevLang = null;
  }

  function tokenFromEventTarget(target) {
    const el = target?.nodeType === 1 ? target : target?.parentElement;
    return el?.closest?.("ruby.tok, ruby, .tok") || null;
  }

  /** Delegated — survives patchRow innerHTML (per-token listeners do not). */
  function ensureDictDelegate() {
    if (listEl.dataset.dictDelegate === "1") return;
    listEl.dataset.dictDelegate = "1";
    // mouseover/out bubble; mouseenter/leave do not.
    listEl.addEventListener("mouseover", (e) => {
      const tok = tokenFromEventTarget(e.target);
      if (!tok || !listEl.contains(tok)) return;
      const from = tokenFromEventTarget(e.relatedTarget);
      if (from === tok) return;
      clearSpDictHideTimer();
      showDict(e, tok);
    });
    listEl.addEventListener("click", (e) => {
      const tok = tokenFromEventTarget(e.target);
      if (!tok || !listEl.contains(tok)) return;
      e.stopPropagation();
      showDict(e, tok);
    });
  }

  function bindJaDictHandlers(jaEl) {
    ensureDictDelegate();
    // no-op keep call sites; delegation on listEl covers all rows.
    void jaEl;
  }

  /** Restore last-committed JA display (plain or ruby) — no MT. */
  function restoreJaDisplay(el, cue) {
    if (!el) return;
    // Editing uses <textarea class="sp-ja">; display uses <div class="sp-ja-view">.
    const row = el.closest?.(".sp-sentence");
    const view = row?.querySelector(".sp-ja-view");
    const ta = row?.querySelector("textarea.sp-ja");
    if (ta) {
      ta.remove();
    }
    if (view) {
      view.hidden = false;
      if (cue?.tokens?.length) {
        view.innerHTML = rubyHtml(cue);
        bindJaDictHandlers(view);
      } else {
        view.textContent = cue?.source ?? editOriginalSource ?? "";
      }
      return;
    }
    // Legacy path (plain .sp-ja div)
    if (cue?.tokens?.length) {
      el.innerHTML = rubyHtml(cue);
      bindJaDictHandlers(el);
    } else {
      el.textContent = cue?.source ?? editOriginalSource ?? "";
    }
  }

  function commitJaEdit(el) {
    if (!el || el.dataset.committing === "1") return;
    el.dataset.committing = "1";
    const id = el.closest(".sp-sentence")?.dataset.id || "";
    const text = jaDraftText(el)
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    sendCmd("edit_ja", { id, text }).finally(() => {
      el.dataset.committing = "";
    });
  }

  function commitLangEdit(el, lang) {
    if (!el || el.dataset.committing === "1") return;
    el.dataset.committing = "1";
    const id = el.closest(".sp-sentence")?.dataset.id || "";
    const text = String(el.innerText || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const cmd = lang === "vi" ? "edit_vi" : "edit_en";
    sendCmd(cmd, { id, text }).finally(() => {
      el.dataset.committing = "";
    });
  }

  function commitTimelineEdit(row) {
    if (!row || row.dataset.committing === "1") return;
    const id = row.dataset.id || "";
    const startEl = row.querySelector(".sp-t-start");
    const endEl = row.querySelector(".sp-t-end");
    if (!startEl || !endEl) return;
    row.dataset.committing = "1";
    sendCmd("edit_timeline", {
      id,
      start: startEl.value,
      end: endEl.value,
    }).finally(() => {
      row.dataset.committing = "";
    });
  }

  function exitEditCancel(el) {
    const cue = state.cues[Number(el.dataset.idx)];
    restoreIme(el);
    restoreJaDisplay(el, cue || { source: editOriginalSource });
    endEditSession();
    flushPendingListRender();
  }

  function exitLangEditCancel(el, lang) {
    const cue = state.cues[Number(el.dataset.idx)];
    if (cue) {
      el.innerHTML = lang === "vi" ? renderBilingualVi(cue) : renderBilingualEn(cue);
    } else {
      el.textContent = editOriginalLang ?? "";
    }
    endEditSession();
    flushPendingListRender();
  }

  /**
   * Mount a real <textarea lang="ja-JP"> for JA edit (composition-friendly).
   * Display stays a non-editable .sp-ja-view with furigana until edit starts.
   */
  function beginJaEdit(wrap) {
    if (!wrap) return null;
    const idx = Number(wrap.dataset.idx);
    if (editingIdx === idx && editingKind === "ja") {
      return wrap.querySelector("textarea.sp-ja");
    }
    const cue = state.cues[idx];
    const view = wrap.querySelector(".sp-ja-view");
    let ta = wrap.querySelector("textarea.sp-ja");
    if (!ta) {
      ta = document.createElement("textarea");
      ta.className = "sp-ja";
      ta.lang = "ja-JP";
      ta.spellcheck = false;
      ta.rows = 2;
      ta.dataset.idx = String(idx);
      wrap.appendChild(ta);
      bindJaTextareaHandlers(ta);
    }
    editingIdx = idx;
    editingKind = "ja";
    editOriginalSource = cue?.source || "";
    commitOnEnter = false;
    ta.value = cue?.source || "";
    if (view) view.hidden = true;
    ta.hidden = false;
    activateJaIme(ta);
    return ta;
  }

  function bindJaTextareaHandlers(el) {
    if (el.dataset.jaBound === "1") return;
    el.dataset.jaBound = "1";
    let composing = false;
    el.addEventListener("compositionstart", () => {
      composing = true;
    });
    el.addEventListener("compositionend", () => {
      composing = false;
    });
    el.addEventListener("keydown", (e) => {
      if (e.isComposing || composing || e.keyCode === 229) return;
      if (e.key === "Escape") {
        e.preventDefault();
        commitOnEnter = false;
        exitEditCancel(el);
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      commitOnEnter = true;
      commitJaEdit(el);
      restoreIme(el);
      restoreJaDisplay(el, state.cues[Number(el.dataset.idx)]);
      endEditSession();
      flushPendingListRender();
    });
    el.addEventListener("blur", () => {
      if (imeActivating) return;
      composing = false;
      if (commitOnEnter) {
        commitOnEnter = false;
        return;
      }
      if (editingIdx == null && el.dataset.committing !== "1") return;
      if (editingKind !== "ja") return;
      exitEditCancel(el);
    });
  }

  function bindJaEditHandlers(wrap) {
    // pointerdown: start OS IME switch before focus so first keys are kana.
    wrap.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      // Start OS IME before focus so the first keystrokes hit Hiragana.
      if (!osImeActive) {
        osImeActive = true;
        requestOsIme("activate");
      }
    });
    wrap.addEventListener("click", (e) => {
      // Token dict click should not open editor.
      if (e.target.closest?.("ruby, .tok")) return;
      beginJaEdit(wrap);
    });
    // Keyboard focus via tab
    wrap.addEventListener("focusin", (e) => {
      if (e.target?.tagName === "TEXTAREA") return;
      beginJaEdit(wrap);
    });
  }

  function bindLangEditHandlers(el, lang) {
    el.addEventListener("focus", () => {
      const idx = Number(el.dataset.idx);
      editingIdx = idx;
      editingKind = lang;
      commitOnEnter = false;
      const cue = state.cues[idx];
      editOriginalLang = cue?.[lang] || "";
      if (cue) el.textContent = cue[lang] || "";
    });
    el.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") {
        e.preventDefault();
        commitOnEnter = false;
        exitLangEditCancel(el, lang);
        el.blur();
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      commitOnEnter = true;
      commitLangEdit(el, lang);
      endEditSession();
      el.blur();
      flushPendingListRender();
    });
    el.addEventListener("blur", () => {
      if (commitOnEnter) {
        commitOnEnter = false;
        return;
      }
      if (editingKind !== lang) return;
      // Blur without Enter: cancel draft (Enter-only commit).
      exitLangEditCancel(el, lang);
    });
  }

  function bindTimelineHandlers(row) {
    const startEl = row.querySelector(".sp-t-start");
    const endEl = row.querySelector(".sp-t-end");
    if (!startEl || !endEl) return;
    const onFocus = () => {
      editingIdx = Number(row.dataset.idx);
      editingKind = "time";
      commitOnEnter = false;
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        const cue = state.cues[Number(row.dataset.idx)];
        if (cue) {
          startEl.value = Timing.formatTimeInput(cue.start_media_time);
          endEl.value = Timing.formatTimeInput(cue.end_media_time);
        }
        endEditSession();
        e.target.blur();
        flushPendingListRender();
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      commitOnEnter = true;
      commitTimelineEdit(row);
      endEditSession();
      e.target.blur();
      flushPendingListRender();
    };
    const onBlur = () => {
      if (commitOnEnter) {
        commitOnEnter = false;
        return;
      }
      if (editingKind !== "time") return;
      // Defer: focus may move start→end within the same row.
      setTimeout(() => {
        const ae = document.activeElement;
        if (ae === startEl || ae === endEl) return;
        if (editingKind !== "time") return;
        commitTimelineEdit(row);
        endEditSession();
        flushPendingListRender();
      }, 0);
    };
    startEl.addEventListener("focus", onFocus);
    endEl.addEventListener("focus", onFocus);
    startEl.addEventListener("keydown", onKey);
    endEl.addEventListener("keydown", onKey);
    startEl.addEventListener("blur", onBlur);
    endEl.addEventListener("blur", onBlur);
  }

  function updateActiveHighlight({ scroll = true } = {}) {
    listEl.querySelectorAll(".sp-sentence").forEach((row) => {
      const on = row.dataset.id === state.activeCueId;
      row.classList.toggle("active", on);
      const label = row.querySelector(".sp-now-playing");
      if (label) label.setAttribute("aria-hidden", on ? "false" : "true");
    });
    if (scroll && !isEditingAny()) scrollActiveIntoView();
  }

  function cueSig(cue, idx) {
    const toks = cue.tokens || [];
    // Include jlpt/freq so enrich → colored ruby re-patches (length alone is stale).
    const tokFp = toks
      .map((t) => `${t.jlpt ?? ""}:${t.freq_rank ?? ""}`)
      .join(",");
    const starred = isCueStarred(cue.id) ? "1" : "0";
    const biJlpt = levelSettings.enableBilingualJlptColor ? "1" : "0";
    return [
      cue.id,
      String(cue.source || ""),
      toks.length,
      tokFp,
      stripStub(cue.en),
      stripStub(cue.vi),
      Number(cue.start_media_time) || 0,
      Number(cue.end_media_time) || 0,
      idx,
      starred,
      biJlpt,
    ].join("|");
  }

  function renderBilingualVi(cue) {
    const raw = stripStub(cue?.vi) || "";
    if (typeof Vocab?.renderBilingualHtml === "function") {
      return Vocab.renderBilingualHtml(raw, "vi", cue?.tokens, levelSettings);
    }
    return escapeHtml(raw);
  }

  function renderBilingualEn(cue) {
    const raw = stripStub(cue?.en) || "";
    if (typeof Vocab?.renderBilingualHtml === "function") {
      return Vocab.renderBilingualHtml(raw, "en", cue?.tokens, levelSettings);
    }
    return escapeHtml(raw);
  }

  function rowTemplate(cue, idx) {
    const isActive = cue.id === state.activeCueId;
    const starred = isCueStarred(cue.id);
    const t0 = Timing.formatTimeInput(cue.start_media_time);
    const t1 = Timing.formatTimeInput(cue.end_media_time);
    return `
      <div class="sp-meta">
        <button type="button" class="sp-play" data-t="${escapeAttr(cue.start_media_time)}" data-time="${escapeAttr(cue.start_media_time)}" title="Phát câu này">▶</button>
        <button type="button" class="sp-star ${starred ? "active" : ""}" data-id="${escapeAttr(cue.id)}" title="${starred ? "Bỏ lưu câu" : "Lưu câu"}">${starred ? "★" : "☆"}</button>
        <span class="sp-times sp-timing">
          <input class="sp-t-start" type="text" inputmode="decimal" spellcheck="false" value="${escapeHtml(t0)}" aria-label="Start" />
          <span class="sp-t-sep">–</span>
          <input class="sp-t-end" type="text" inputmode="decimal" spellcheck="false" value="${escapeHtml(t1)}" aria-label="End" />
        </span>
        <button type="button" class="sp-add-after" data-id="${escapeAttr(cue.id)}" title="Thêm cue sau">+</button>
        <button type="button" class="sp-del" data-id="${escapeAttr(cue.id)}" title="Xóa cue">×</button>
        <button type="button" class="sp-copy" data-id="${escapeAttr(cue.id)}">Copy</button>
        <details class="sp-copy-menu">
          <summary>⋮</summary>
          <div>
            <button type="button" data-copy="ja" data-id="${escapeAttr(cue.id)}">Chỉ JA</button>
            <button type="button" data-copy="vi" data-id="${escapeAttr(cue.id)}">Chỉ VI</button>
            <button type="button" data-copy="ja_vi" data-id="${escapeAttr(cue.id)}">JA+VI</button>
            <button type="button" data-copy="full" data-id="${escapeAttr(cue.id)}">Full</button>
          </div>
        </details>
      </div>
      <div class="sp-now-playing" aria-hidden="${isActive ? "false" : "true"}">ĐANG PHÁT</div>
      <div class="sp-ja-wrap" data-idx="${idx}" tabindex="0">
        <div class="sp-ja-view">${
          cue.tokens?.length ? rubyHtml(cue) : escapeHtml(cue.source)
        }</div>
      </div>
      <div class="sp-vi" contenteditable="true" spellcheck="false" lang="vi" data-idx="${idx}" data-placeholder="VI">${renderBilingualVi(cue)}</div>
      <div class="sp-en" contenteditable="true" spellcheck="false" lang="en" data-idx="${idx}" data-placeholder="EN">${renderBilingualEn(cue)}</div>
    `;
  }

  function patchRow(row, cue, idx, sig) {
    row.dataset.sig = sig;
    row.dataset.idx = String(idx);
    row.querySelectorAll("[data-idx]").forEach((el) => {
      el.dataset.idx = String(idx);
    });
    const starBtn = row.querySelector(".sp-star");
    if (starBtn) {
      const starred = isCueStarred(cue.id);
      starBtn.classList.toggle("active", starred);
      starBtn.textContent = starred ? "★" : "☆";
      starBtn.title = starred ? "Bỏ lưu câu" : "Lưu câu";
    }
    const view = row.querySelector(".sp-ja-view");
    if (view) {
      view.innerHTML = cue.tokens?.length ? rubyHtml(cue) : escapeHtml(cue.source);
      // innerHTML wiped per-token listeners from the previous bind.
      bindJaDictHandlers(view);
    }
    const vi = row.querySelector(".sp-vi");
    if (vi) vi.innerHTML = renderBilingualVi(cue);
    const en = row.querySelector(".sp-en");
    if (en) en.innerHTML = renderBilingualEn(cue);
    const t0 = row.querySelector(".sp-t-start");
    if (t0) t0.value = Timing.formatTimeInput(cue.start_media_time);
    const t1 = row.querySelector(".sp-t-end");
    if (t1) t1.value = Timing.formatTimeInput(cue.end_media_time);
  }

  function bindRowHandlers(row) {
    const wrap = row.querySelector(".sp-ja-wrap");
    if (wrap) bindJaEditHandlers(wrap);
    const view = row.querySelector(".sp-ja-view");
    if (view) bindJaDictHandlers(view);
    const vi = row.querySelector(".sp-vi");
    if (vi) bindLangEditHandlers(vi, "vi");
    const en = row.querySelector(".sp-en");
    if (en) bindLangEditHandlers(en, "en");
    bindTimelineHandlers(row);
  }

  let listDelegateBound = false;
  function ensureListDelegate() {
    if (listDelegateBound) return;
    listDelegateBound = true;
    ensureDictDelegate();
    listEl.addEventListener("click", (e) => {
      const row = e.target.closest(".sp-sentence");
      if (row && !e.target.closest(".sp-del")) {
        if (!followTimeline) setFollowTimeline(true, { scroll: false });
      }
      const btn = e.target.closest(
        ".sp-play, .sp-star, .sp-copy, .sp-copy-menu button, .sp-add-after, .sp-del"
      );
      if (!btn || !listEl.contains(btn)) return;
      if (btn.classList.contains("sp-play")) {
        setFollowTimeline(true);
        sendCmd("play", { mediaTime: Number(btn.dataset.t || btn.dataset.time) });
      } else if (btn.classList.contains("sp-star")) {
        const id = btn.dataset.id;
        if (!id) return;
        void (async () => {
          const r = await sendCmd("toggle_star_cue", { id });
          if (r?.savedCues) state.savedCues = normalizeSavedCues(r.savedCues);
          const starred = isCueStarred(id);
          btn.classList.toggle("active", starred);
          btn.textContent = starred ? "★" : "☆";
          btn.title = starred ? "Bỏ lưu câu" : "Lưu câu";
        })();
      } else if (btn.classList.contains("sp-copy")) {
        copyCueById(btn.dataset.id, "full");
      } else if (btn.matches(".sp-copy-menu button")) {
        copyCueById(btn.dataset.id, btn.dataset.copy || "full");
      } else if (btn.classList.contains("sp-add-after")) {
        void (async () => {
          const r = await sendCmd("add_cue", { afterId: btn.dataset.id });
          if (r?.ok && r.id) {
            toast("Đã thêm cue");
            // Focus new JA row after next state push.
            setTimeout(() => {
              const row = listEl.querySelector(`.sp-sentence[data-id="${CSS.escape(r.id)}"] .sp-ja-wrap`);
              row?.click();
            }, 120);
          }
        })();
      } else if (btn.classList.contains("sp-del")) {
        void (async () => {
          if (!confirm("Xóa cue này?")) return;
          await sendCmd("delete_cue", { id: btn.dataset.id });
        })();
      }
    });
  }

  function renderList(force = false) {
    if (isEditingAny()) {
      pendingListRender = true;
      return;
    }
    if (!force && !listDirty) return;
    listDirty = false;
    pendingListRender = false;
    const cues = state.cues || [];
    syncListVisibility();
    if (!cues.length) {
      listEl.innerHTML = "";
      return;
    }
    const scrollKeep = listEl.scrollTop;
    const hadRows = listEl.children.length > 0;
    const activeId = state.activeCueId;
    applyListHighlightVars();
    ensureListDelegate();
    const byId = new Map();
    for (const row of listEl.querySelectorAll(".sp-sentence")) {
      byId.set(row.dataset.id, row);
    }
    const newIds = new Set(cues.map((c) => c.id));
    for (const [id, row] of byId) {
      if (!newIds.has(id)) row.remove();
    }
    cues.forEach((cue, idx) => {
      const sig = cueSig(cue, idx);
      const row = byId.get(cue.id);
      if (row) {
        if (row.dataset.sig !== sig) patchRow(row, cue, idx, sig);
        row.classList.toggle("active", cue.id === activeId);
        return;
      }
      const el = document.createElement("div");
      el.className = "sp-sentence" + (cue.id === activeId ? " active" : "");
      el.dataset.id = cue.id;
      el.dataset.idx = String(idx);
      el.dataset.sig = sig;
      el.innerHTML = rowTemplate(cue, idx);
      bindRowHandlers(el);
      listEl.appendChild(el);
    });

    ignoreScrollEvent = true;
    listEl.scrollTop = scrollKeep;
    requestAnimationFrame(() => {
      ignoreScrollEvent = false;
    });
    if (force && followTimeline) scrollActiveIntoView(!!activeId && !hadRows);
  }

  function highlightActiveOnly() {
    updateActiveHighlight({ scroll: true });
  }

  function applyState(next, _opts = {}) {
    let incoming = next && typeof next === "object" ? { ...next } : {};

    // Sequence numbers restart when content reloads and are scoped per video.
    if (
      (incoming._session != null && incoming._session !== lastCueSession) ||
      (incoming.videoId != null && incoming.videoId !== state.videoId)
    ) {
      if (incoming._session != null) lastCueSession = incoming._session;
      lastCueSeq = 0;
    }

    // Drop stale full cue payloads (async publish race). Partial updates omit cues.
    if (Array.isArray(incoming.cues) && typeof incoming._seq === "number") {
      lastCueSeq = incoming._seq;
    }
    delete incoming._seq;
    delete incoming._session;

    // Video switch without cue list → clear stale rows from previous video.
    if (
      incoming.videoId != null &&
      incoming.videoId !== state.videoId &&
      !Array.isArray(incoming.cues)
    ) {
      incoming.cues = [];
    }

    const prevActive = state.activeCueId;
    state = { ...state, ...incoming };

    if (typeof incoming.status === "string") setStatus(incoming.status);
    if (incoming.scriptSource) setScriptSource(incoming.scriptSource);
    if (incoming.toast) {
      const long = /Import:|cập nhật/.test(String(incoming.toast));
      toast(incoming.toast, long ? 3200 : 1600);
    }
    overlayBtn.classList.toggle("active", !!state.showOnVideo);

    if (Array.isArray(incoming.cues)) {
      listDirty = true;
      if (isEditingAny()) {
        pendingListRender = true;
        syncListVisibility();
        updateActiveHighlight({ scroll: false });
      } else {
        renderList(true);
      }
    } else {
      syncListVisibility();
      if (incoming.activeCueId != null && incoming.activeCueId !== prevActive) {
        updateActiveHighlight({ scroll: !isEditingAny() });
      } else if (incoming.activeCueId != null) {
        updateActiveHighlight({ scroll: false });
      }
    }

    if (incoming.savedCues) {
      state.savedCues = normalizeSavedCues(incoming.savedCues);
      if (activeSideTab === "saved") renderSavedTab();
    }
    if (Array.isArray(incoming.cues) && activeSideTab === "words") {
      renderWordsTab();
    }
  }

  let activeSideTab = "subtitles"; // "subtitles" | "words" | "saved"

  function switchSideTab(tabName) {
    activeSideTab = tabName;
    document.querySelectorAll(".sp-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
    const subView = document.getElementById("sp-view-subtitles");
    const wordsView = document.getElementById("sp-view-words");
    const savedView = document.getElementById("sp-view-saved");

    if (subView) subView.hidden = tabName !== "subtitles";
    if (wordsView) wordsView.hidden = tabName !== "words";
    if (savedView) savedView.hidden = tabName !== "saved";

    if (tabName === "words") {
      renderWordsTab();
    } else if (tabName === "saved") {
      renderSavedTab();
    } else if (tabName === "subtitles") {
      renderList(true);
    }
  }

  function renderWordsTab() {
    const wordsListEl = document.getElementById("sp-words-list");
    const wordsCountEl = document.getElementById("sp-words-count");
    if (!wordsListEl) return;

    const cues = state.cues || [];
    const wordMap = new Map();

    for (const c of cues) {
      if (!c.tokens) continue;
      for (const t of c.tokens) {
        if (!t.surface || Vocab.isSkipPos(t.pos)) continue;
        const key = t.lemma || t.surface;
        if (!wordMap.has(key)) {
          wordMap.set(key, {
            lemma: key,
            surface: t.surface,
            reading: t.reading || "",
            jlpt: t.jlpt || "",
            freq_rank: t.freq_rank != null ? Number(t.freq_rank) : null,
            count: 0,
            cue: c,
          });
        }
        const item = wordMap.get(key);
        item.count++;
      }
    }

    const allWords = Array.from(wordMap.values());
    if (wordsCountEl) wordsCountEl.textContent = `${allWords.length} từ`;

    if (!allWords.length) {
      wordsListEl.innerHTML = '<div class="sp-saved-empty">Chưa có từ vựng cho video này.</div>';
      return;
    }

    // Language Reactor 5.1.8 Frequency Rank Brackets
    const brackets = [
      { label: "Rank 1 - 500", min: 1, max: 500 },
      { label: "Rank 501 - 1000", min: 501, max: 1000 },
      { label: "Rank 1001 - 1500", min: 1001, max: 1500 },
      { label: "Rank 1501 - 2000", min: 1501, max: 2000 },
      { label: "Rank 2001 - 2500", min: 2001, max: 2500 },
      { label: "Rank 2501 - 3000", min: 2501, max: 3000 },
      { label: "Rank 3001 - 3500", min: 3001, max: 3500 },
      { label: "Rank 3501 - 4000", min: 3501, max: 4000 },
      { label: "Rank 4001 - 4500", min: 4001, max: 4500 },
      { label: "Rank 4501 - 5000", min: 4501, max: 5000 },
      { label: "Rank 5000+", min: 5001, max: Infinity },
      { label: "Chưa phân hạng", min: -1, max: 0 },
    ];

    function getWordRank(w) {
      if (w.freq_rank != null && w.freq_rank > 0) return w.freq_rank;
      const jlpt = String(w.jlpt || "").toLowerCase();
      if (jlpt === "n5") return 400;
      if (jlpt === "n4") return 900;
      if (jlpt === "n3") return 1800;
      if (jlpt === "n2") return 3500;
      if (jlpt === "n1") return 6000;
      return -1;
    }

    const groups = brackets.map((b) => ({ ...b, words: [] }));
    for (const w of allWords) {
      const r = getWordRank(w);
      const grp = groups.find((g) => (r >= g.min && r <= g.max) || (r <= 0 && g.min < 0));
      if (grp) grp.words.push(w);
      else groups[groups.length - 1].words.push(w);
    }

    const Romaji = globalThis.HardsubRomajiKana;
    let html = "";
    for (const grp of groups) {
      if (!grp.words.length) continue;
      grp.words.sort((a, b) => b.count - a.count);
      html += `
        <div class="sp-word-group">
          <div class="sp-word-group-banner">
            <span>${grp.label}</span>
          </div>
          <div class="sp-words-flow">
            ${grp.words
              .map((w) => {
                const romaji = Romaji?.toRomaji ? Romaji.toRomaji(w.reading) : w.reading;
                const isSaved = !!(state.userVocab && state.userVocab[w.lemma]);
                const rank = getWordRank(w);
                const colorCls = rank > 0 && rank <= 1000 ? "rank-common" : rank <= 2500 ? "rank-mid" : rank <= 5000 ? "rank-upper" : "rank-rare";
                return `
                  <button type="button" class="sp-word-chip ${colorCls} ${isSaved ? "saved" : ""}" data-word-lemma="${escapeAttr(w.lemma)}" title="${escapeAttr(w.surface)} (${escapeAttr(romaji || "")}): ${w.count} lần">
                    <ruby class="sp-word-ruby">
                      ${escapeHtml(w.surface)}
                      <rt>${escapeHtml(romaji || "")}</rt>
                    </ruby>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    wordsListEl.innerHTML = html;

    wordsListEl.querySelectorAll("[data-word-lemma]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const lemma = btn.dataset.wordLemma;
        const current = state.userVocab?.[lemma];
        const nextStatus = current ? "" : "learning";
        await sendCmd("set_user_vocab", { lemma, status: nextStatus });
        if (!state.userVocab) state.userVocab = {};
        if (nextStatus) state.userVocab[lemma] = nextStatus;
        else delete state.userVocab[lemma];
        btn.classList.toggle("saved", !current);
      });
    });
  }

  function renderSavedTab() {
    const savedListEl = document.getElementById("sp-saved-list");
    const showContextEl = document.getElementById("sp-saved-show-context");
    if (!savedListEl) return;

    const showContext = showContextEl ? showContextEl.checked : true;
    const userVocabEntries = Object.entries(state.userVocab || {}).filter(
      ([, v]) => v && (v === "learning" || v === "special" || v?.status === "learning" || v?.status === "special")
    );
    const savedCues = normalizeSavedCues(state.savedCues);

    if (!userVocabEntries.length && !savedCues.length) {
      savedListEl.innerHTML = '<div class="sp-saved-empty">Chưa có từ hoặc câu nào được đánh dấu sao lưu trữ.</div>';
      return;
    }

    let html = "";

    // Saved Words
    for (const [lemma] of userVocabEntries) {
      const sampleCue =
        (state.cues || []).find((c) => c.source && c.source.includes(lemma)) ||
        (savedCues || []).find((c) => c.source && c.source.includes(lemma));
      const sampleCtx = sampleCue ? sampleCue.source : "";

      let displayHtml = "";
      if (showContext && sampleCtx) {
        const escLemma = escapeHtml(lemma);
        const escCtx = escapeHtml(sampleCtx);
        const boxed = `<span class="lr-saved-word-box">${escLemma}</span>`;
        displayHtml = escCtx.includes(escLemma)
          ? escCtx.replace(escLemma, boxed)
          : `${boxed} · ${escCtx}`;
      } else {
        displayHtml = `<span class="lr-saved-word-box">${escapeHtml(lemma)}</span>`;
      }

      html += `
        <div class="lr-saved-row" data-lemma="${escapeAttr(lemma)}">
          <div class="lr-saved-row-badge">
            <span class="lr-badge-w">W</span>
          </div>
          <div class="lr-saved-row-text">
            ${displayHtml}
          </div>
          <div class="lr-saved-row-actions">
            <button type="button" class="lr-saved-del-btn" data-del-word="${escapeAttr(lemma)}" title="Xóa khỏi từ đã lưu">🗑</button>
            <button type="button" class="lr-saved-menu-btn" title="Cài đặt">⋮</button>
          </div>
        </div>
      `;
    }

    // Saved Sentences
    for (const sc of savedCues) {
      const vi = stripStub(sc.vi);
      const en = stripStub(sc.en);
      html += `
        <div class="lr-saved-row" data-cue-id="${escapeAttr(sc.id)}">
          <div class="lr-saved-row-badge">
            <button type="button" class="lr-saved-play-icon" data-play-time="${sc.start_media_time}" title="Phát câu này">▶</button>
          </div>
          <div class="lr-saved-row-text">
            <div class="lr-saved-sentence-ja">${escapeHtml(sc.source)}</div>
            ${vi || en ? `<div class="lr-saved-sentence-vi" style="${savedPracticeMode ? "cursor:pointer;filter:blur(5px);user-select:none;" : ""}">${escapeHtml(vi || en)}</div>` : ""}
          </div>
          <div class="lr-saved-row-actions">
            <button type="button" class="lr-saved-del-btn" data-del-cue="${escapeAttr(sc.id)}" title="Bỏ lưu câu">🗑</button>
            <button type="button" class="lr-saved-menu-btn" title="Cài đặt">⋮</button>
          </div>
        </div>
      `;
    }

    savedListEl.innerHTML = html;

    savedListEl.querySelectorAll(".lr-saved-sentence-vi").forEach((el) => {
      el.addEventListener("click", () => {
        el.style.filter = "none";
      });
    });

    savedListEl.querySelectorAll("[data-del-word]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const lemma = btn.dataset.delWord;
        await sendCmd("set_user_vocab", { lemma, status: "" });
        if (state.userVocab) delete state.userVocab[lemma];
        renderSavedTab();
      });
    });

    savedListEl.querySelectorAll("[data-del-cue]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.delCue;
        await sendCmd("toggle_star_cue", { id });
        state.savedCues = (state.savedCues || []).filter((c) => c.id !== id);
        renderSavedTab();
        renderList(true);
      });
    });

    savedListEl.querySelectorAll("[data-play-time]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const t = Number(btn.dataset.playTime);
        if (Number.isFinite(t)) {
          await sendCmd("play", { mediaTime: t });
        }
      });
    });
  }

  /**
   * Dict popup cannot paint outside the side panel chrome — ask the YouTube
   * tab content script to show #hardsub-ocr-dict fixed on the page, left of panel.
   */
  let spDictHideTimer = null;
  let spActiveDictTok = null;

  function clearSpDictHideTimer() {
    if (spDictHideTimer) {
      clearTimeout(spDictHideTimer);
      spDictHideTimer = null;
    }
  }

  function clearSpDictTokActive() {
    if (spActiveDictTok) {
      spActiveDictTok.classList.remove("tok-dict-active");
      spActiveDictTok = null;
    }
    listEl
      .querySelectorAll(".tok-dict-active")
      .forEach((el) => el.classList.remove("tok-dict-active"));
  }

  function setSpDictTokActive(el) {
    if (!el) return;
    if (spActiveDictTok && spActiveDictTok !== el) {
      spActiveDictTok.classList.remove("tok-dict-active");
    }
    spActiveDictTok = el;
    el.classList.add("tok-dict-active");
  }

  function tokenScreenY(ev, el) {
    if (typeof ev?.screenY === "number") return ev.screenY;
    const rect = el.getBoundingClientRect();
    const screenTop = window.screenTop ?? window.screenY ?? 0;
    return rect.top + screenTop;
  }

  function isPunctuationSurface(surface) {
    return !surface || /^[\s\u3000。、.!?,！？「」『』（）()\[\]…・〜～]+$/.test(surface);
  }

  function showDict(ev, el) {
    clearSpDictHideTimer();
    setSpDictTokActive(el);
    const surface = (el.dataset.surface || el.textContent || "").trim();
    const lemma = (el.dataset.lemma || "").trim();
    if (isPunctuationSurface(surface)) return;
    const jaEl = el.closest(".sp-ja-wrap, .sp-ja");
    const idx = Number(jaEl?.dataset.idx);
    const cue =
      (Number.isFinite(idx) && state.cues?.[idx]) ||
      (state.cues || []).find((c) => c.id === el.closest(".sp-sentence")?.dataset.id);
    sendCmd("SHOW_PAGE_DICT", {
      surface,
      lemma,
      screenY: tokenScreenY(ev, el),
      sentenceVi: cue?.vi || "",
      sentenceEn: cue?.en || "",
      sentenceJa: cue?.source || "",
    });
  }

  function scheduleHideDict() {
    clearSpDictHideTimer();
    // NO-OP: Dictionary popup NEVER auto-hides on timer or mouseout while user is viewing it.
  }

  listEl.addEventListener("wheel", pauseFollowFromUser, { passive: true });
  listEl.addEventListener("touchstart", pauseFollowFromUser, { passive: true });
  listEl.addEventListener("touchmove", pauseFollowFromUser, { passive: true });
  listEl.addEventListener("mousedown", (e) => {
    const r = listEl.getBoundingClientRect();
    if (e.clientX >= r.left + listEl.clientWidth && e.clientX <= r.right) {
      pauseFollowFromUser();
    }
  });
  listEl.addEventListener("keydown", (e) => {
    if (["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      pauseFollowFromUser();
    }
  });

  if (followBtn) {
    followBtn.addEventListener("click", () => {
      setFollowTimeline(!followTimeline);
    });
  }

  driveConnectBtn?.addEventListener("click", async () => {
    setDriveStatus("Connecting…");
    try {
      const r = await chrome.runtime.sendMessage({ type: "DRIVE_CONNECT" });
      if (r?.ok) {
        setDriveStatus(r.status || "Connected");
        toast("Drive Connected", 1600);
      } else {
        setDriveStatus(`error: ${r?.error || "OAuth failed"}`);
        toast("Drive connect lỗi — check oauth2.client_id", 2800);
      }
    } catch (err) {
      setDriveStatus(`error: ${String(err?.message || err).slice(0, 80)}`);
    }
  });

  driveUploadBtn?.addEventListener("click", async () => {
    setDriveStatus("Uploading…");
    try {
      const r = await chrome.runtime.sendMessage({ type: "DRIVE_UPLOAD_NOW" });
      if (r?.ok && r?.uploaded) {
        setDriveStatus(r.status || "Uploaded");
        toast("Uploaded lên Drive thành công", 1600);
      } else if (r?.ok && r?.deferred) {
        setDriveStatus("Uploading…");
      } else if (r?.ok) {
        setDriveStatus(r.status || "Connected");
        toast("Đã đồng bộ Drive", 1600);
      } else {
        const rawErr = String(r?.error || "Upload failed");
        let errMsg = rawErr;
        if (rawErr.toLowerCase().includes("bridge") || r?.skipped === "bridge_offline") {
          errMsg = "Bridge chưa kết nối / snapshot offline";
          setDriveStatus(`error: ${errMsg.slice(0, 50)}`);
          toast(`Upload Drive lỗi: ${errMsg}`, 4000);
        } else if (
          rawErr.toLowerCase().includes("auth") ||
          rawErr.toLowerCase().includes("token") ||
          rawErr.includes("401") ||
          rawErr.includes("403")
        ) {
          errMsg = "Google OAuth cần cấp quyền — Đang mở popup Google...";
          setDriveStatus("Auth required…");
          toast(errMsg, 3000);
          const authRes = await chrome.runtime.sendMessage({ type: "DRIVE_CONNECT" });
          if (authRes?.ok) {
            toast("Đã kết nối Google Drive! Đang thử upload lại...", 2000);
            const retryRes = await chrome.runtime.sendMessage({ type: "DRIVE_UPLOAD_NOW" });
            if (retryRes?.ok) {
              setDriveStatus(retryRes.status || "Uploaded");
              toast("Uploaded lên Drive thành công!", 2000);
              return;
            }
          } else {
            errMsg = "Chưa cấp quyền Google OAuth";
            setDriveStatus("error: OAuth failed");
            toast(`Upload Drive lỗi: ${authRes?.error || errMsg}`, 4000);
          }
        } else {
          setDriveStatus(`error: ${errMsg.slice(0, 50)}`);
          toast(`Upload Drive lỗi: ${errMsg}`, 4000);
        }
      }
    } catch (err) {
      const msg = String(err?.message || err);
      setDriveStatus(`error: ${msg.slice(0, 50)}`);
      toast(`Lỗi Drive: ${msg.slice(0, 60)}`, 3500);
    }
  });

  sourceRefreshBtn?.addEventListener("click", async () => {
    sourceRefreshBtn.disabled = true;
    try {
      await sendCmd("refresh_script");
    } finally {
      sourceRefreshBtn.disabled = false;
    }
  });
  document.getElementById("sp-reload").addEventListener("click", async () => {
    toast("Đang tải caption…");
    await sendCmd("reload");
  });
  document.getElementById("sp-add-cue")?.addEventListener("click", async () => {
    const r = await sendCmd("add_cue", {});
    if (r?.ok && r.id) {
      toast("Đã thêm cue");
      setTimeout(() => {
        const row = listEl.querySelector(`.sp-sentence[data-id="${CSS.escape(r.id)}"] .sp-ja-wrap`);
        row?.click();
      }, 120);
    }
  });
  document.getElementById("sp-overlay").addEventListener("click", async () => {
    await sendCmd("toggle_overlay");
  });
  document.getElementById("sp-pip")?.addEventListener("click", async () => {
    await sendCmd("toggle_pip");
  });
  document.getElementById("sp-clear-mt").addEventListener("click", async () => {
    if (!confirm("Xóa tất cả bản dịch EN/VI của video này? (JA giữ nguyên)")) return;
    toast("Đang xóa bản dịch…");
    await sendCmd("clear_translations");
  });
  document.getElementById("sp-wipe-script")?.addEventListener("click", async () => {
    if (
      !confirm(
        "Xóa toàn bộ sub/script đã lưu của video này và tải lại từ nguồn?\n(Mất chỉnh sửa JA/timeline, bản dịch và cache)"
      )
    ) {
      return;
    }
    toast("Đang xóa sub đã lưu…");
    await sendCmd("wipe_saved_and_reload");
  });
  document.getElementById("sp-export").addEventListener("click", async () => {
    await sendCmd("export");
  });

  const importPanel = document.getElementById("sp-import-panel");
  const importFileInput = document.getElementById("sp-import-file");
  const importFileLabel = document.getElementById("sp-import-file-label");
  const importApplyBtn = document.getElementById("sp-import-apply");
  /** @type {Array<object>|null} */
  let pendingImportCues = null;

  const ImportParse = globalThis.HardsubImportParse || {};
  const parseTimeToken = ImportParse.parseTimeToken;
  const extractCuesFromJson = ImportParse.extractCuesFromJson;
  const parseExportTxt = ImportParse.parseExportTxt;
  const normalizeParsedImportRows = ImportParse.normalizeParsedImportRows;

  function syncImportIncludeJaUi() {
    const mode =
      document.querySelector('input[name="sp-import-mode"]:checked')?.value ===
      "replace"
        ? "replace"
        : "merge";
    const includeJaEl = document.getElementById("sp-import-include-ja");
    const wrap = document.getElementById("sp-import-include-ja-wrap");
    if (!includeJaEl) return;
    if (mode === "replace") {
      includeJaEl.checked = true;
      includeJaEl.disabled = true;
      if (wrap) wrap.title = "Full luôn gồm JA + timeline";
    } else {
      includeJaEl.disabled = false;
      if (wrap) wrap.title = "";
    }
  }

  function closeImportPanel() {
    pendingImportCues = null;
    if (importPanel) importPanel.hidden = true;
    if (importFileLabel) importFileLabel.textContent = "";
    if (importFileInput) importFileInput.value = "";
    if (importApplyBtn) importApplyBtn.disabled = false;
  }

  function openImportPanel(cues, fileName) {
    pendingImportCues = cues;
    if (importFileLabel) {
      importFileLabel.textContent = `${fileName || "file"} · ${cues.length} mục`;
    }
    syncImportIncludeJaUi();
    if (importPanel) importPanel.hidden = false;
  }

  document.getElementById("sp-import")?.addEventListener("click", () => {
    importFileInput?.click();
  });
  document.getElementById("sp-import-cancel")?.addEventListener("click", () => {
    closeImportPanel();
  });
  importFileInput?.addEventListener("change", async () => {
    const file = importFileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let rows = null;
      const name = file.name || "";
      if (/\.json$/i.test(name) || text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
        try {
          rows = extractCuesFromJson(JSON.parse(text));
        } catch (_) {
          rows = null;
        }
      }
      if (!rows) rows = parseExportTxt(text);
      const cues = normalizeParsedImportRows(rows);
      if (!cues.length) {
        toast("File không có cue hợp lệ");
        closeImportPanel();
        return;
      }
      openImportPanel(cues, name);
      toast(`Đã đọc ${cues.length} mục — chọn chế độ rồi Áp dụng`, 2200);
    } catch (err) {
      toast("Không đọc được file");
      closeImportPanel();
    }
  });
  document.querySelectorAll('input[name="sp-import-mode"]').forEach((el) => {
    el.addEventListener("change", syncImportIncludeJaUi);
  });

  importApplyBtn?.addEventListener("click", async () => {
    if (!pendingImportCues?.length) {
      toast("Chưa chọn file");
      return;
    }
    const mode =
      document.querySelector('input[name="sp-import-mode"]:checked')?.value ===
      "replace"
        ? "replace"
        : "merge";
    const includeJa =
      mode === "replace" ||
      !!document.getElementById("sp-import-include-ja")?.checked;
    importApplyBtn.disabled = true;
    toast("Đang nhập…", 4000);
    const cuesPayload =
      mode === "replace" || includeJa
        ? pendingImportCues
        : pendingImportCues.map((c) => ({
            id: c.id,
            start_media_time: c.start_media_time,
            end_media_time: c.end_media_time,
            source: c.source,
            en: c.en,
            vi: c.vi,
            translated: c.translated,
          }));
    const r = await sendCmd("import_cues", {
      cues: cuesPayload,
      mode,
      includeJa,
    });
    importApplyBtn.disabled = false;
    if (!r?.ok) {
      toast(r?.error ? `Import lỗi: ${r.error}` : "Import thất bại");
      return;
    }
    const msg =
      mode === "replace"
        ? `Import: đã thay thế ${r.replaced ?? r.updated ?? 0} cue`
        : `Import: cập nhật ${r.updated ?? 0} · bỏ qua ${r.skipped ?? 0} · không khớp ${r.unmatched ?? 0}`;
    toast(msg, 3200);
    closeImportPanel();
  });


  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SP_STATE") {
      // If we don't know the active video tab yet, adopt incoming
      if (currentActiveTabId == null && msg.tabId != null) {
        currentActiveTabId = msg.tabId;
        tabId = msg.tabId;
      }
      // If tabId differs from currentActiveTabId, verify if currentActiveTabId is still a valid video tab
      if (msg.tabId != null && currentActiveTabId != null && msg.tabId !== currentActiveTabId) {
        chrome.tabs?.get?.(currentActiveTabId).then((t) => {
          if (!t || !isSupportedVideoUrl(t.url)) {
            currentActiveTabId = msg.tabId;
            tabId = msg.tabId;
            applyState(msg.payload || {}, { forceList: !!msg.forceList });
          }
        }).catch(() => {
          currentActiveTabId = msg.tabId;
          tabId = msg.tabId;
          applyState(msg.payload || {}, { forceList: !!msg.forceList });
        });
        return;
      }
      if (msg.tabId != null) {
        tabId = msg.tabId;
        currentActiveTabId = msg.tabId;
      }
      applyState(msg.payload || {}, { forceList: !!msg.forceList });
    }
    if (msg?.type === "SP_CLOSE") {
      try {
        window.close();
      } catch (_) {}
    }
    if (msg?.type === "DRIVE_STATUS_CHANGED") {
      setDriveStatus(msg.status || "");
    }
  });

  chrome.tabs?.onActivated?.addListener?.(async (activeInfo) => {
    if (activeInfo?.tabId != null) {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab && isSupportedVideoUrl(tab.url)) {
          currentActiveTabId = tab.id;
          tabId = tab.id;
          chrome.tabs.sendMessage(currentActiveTabId, { type: "SP_CMD", cmd: "get_state" }).catch(() => {});
        }
      } catch (_) {}
    }
  });

  chrome.windows?.onFocusChanged?.addListener?.(async (windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      await syncActiveTab();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.driveSyncStatus) {
      setDriveStatus(changes.driveSyncStatus.newValue || "");
    }
    if (area !== "local" || !changes.hardsubSettings) return;
    const s = changes.hardsubSettings.newValue || {};
    const nextColors = Vocab.normalizeLevelColors(
      s.levelColors || Vocab.DEFAULT_LEVEL_COLORS
    );
    const nextEnabled = s.levelHighlightEnabled !== false;
    levelSettings = {
      levelHighlightEnabled: nextEnabled,
      levelColors: nextColors,
    };
    state.levelHighlightEnabled = nextEnabled;
    state.levelColors = nextColors;
    if (s.vocabColors) state.vocabColors = s.vocabColors;
    if (s.vocabCats) state.vocabCats = s.vocabCats;
    if (typeof s.vocabHighlight === "boolean") state.vocabHighlight = s.vocabHighlight;
    if (s.vocabLevel != null) state.vocabLevel = s.vocabLevel;
    if (typeof s.showKnownGreen === "boolean") state.showKnownGreen = s.showKnownGreen;
    if (typeof s.hideRareWords === "boolean") state.hideRareWords = s.hideRareWords;
    applyListHighlightVars();
    // Level colors are CSS-var only; re-render when status-class settings change.
    const prev = changes.hardsubSettings.oldValue || {};
    const statusDirty =
      s.vocabHighlight !== prev.vocabHighlight ||
      s.vocabLevel !== prev.vocabLevel ||
      s.showKnownGreen !== prev.showKnownGreen ||
      s.hideRareWords !== prev.hideRareWords ||
      JSON.stringify(s.vocabCats) !== JSON.stringify(prev.vocabCats);
    if (statusDirty && (state.cues || []).length) {
      listDirty = true;
      renderList(true);
    }
  });

  syncFollowBtn();

  function isSupportedVideoUrl(url) {
    try {
      const h = new URL(url || "").hostname.toLowerCase();
      return (
        h === "www.youtube.com" ||
        h === "youtube.com" ||
        h === "m.youtube.com" ||
        h === "abema.tv" ||
        h.endsWith(".abema.tv") ||
        h === "www.netflix.com" ||
        h === "netflix.com" ||
        h.endsWith(".netflix.com")
      );
    } catch (_) {
      return false;
    }
  }

  document.querySelectorAll(".sp-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchSideTab(btn.dataset.tab);
    });
  });

  function setupSettingsPanel() {
    const panel = document.getElementById("sp-settings-panel");
    const cancelBtn = document.getElementById("sp-settings-cancel");
    const toggleJlpt = document.getElementById("toggle-bilingual-jlpt");

    if (cancelBtn && panel) {
      cancelBtn.addEventListener("click", () => {
        panel.hidden = true;
      });
    }

    if (toggleJlpt) {
      toggleJlpt.checked = levelSettings.enableBilingualJlptColor !== false;
      toggleJlpt.addEventListener("change", async () => {
        const val = !!toggleJlpt.checked;
        levelSettings.enableBilingualJlptColor = val;
        try {
          const syncData =
            (await chrome.storage.sync.get("hardsubSettings"))?.hardsubSettings || {};
          syncData.enableBilingualJlptColor = val;
          await chrome.storage.sync.set({ hardsubSettings: syncData });
        } catch (_) {}
        try {
          const localData =
            (await chrome.storage.local.get("hardsubSettings"))?.hardsubSettings || {};
          localData.enableBilingualJlptColor = val;
          await chrome.storage.local.set({ hardsubSettings: localData });
        } catch (_) {}
        renderList(true);
      });
    }

    const toggleSettings = () => {
      if (panel) {
        panel.hidden = !panel.hidden;
      }
    };

    document.getElementById("sp-settings")?.addEventListener("click", toggleSettings);
    document.getElementById("sp-btn-settings")?.addEventListener("click", () => {
      void sendCmd("open_settings", {});
    });
  }
  setupSettingsPanel();

  const btnPopout = document.getElementById("sp-btn-popout");
  if (btnPopout) {
    btnPopout.addEventListener("click", () => {
      window.open(chrome.runtime.getURL("popup/index.html"), "_blank");
    });
  }

  const btnClose = document.getElementById("sp-btn-close");
  if (btnClose) {
    btnClose.addEventListener("click", () => {
      window.close();
    });
  }

  const showContextEl = document.getElementById("sp-saved-show-context");
  if (showContextEl) {
    showContextEl.addEventListener("change", () => {
      renderSavedTab();
    });
  }

  let savedPracticeMode = false;
  const btnViewAll = document.getElementById("sp-saved-view-all");
  if (btnViewAll) {
    btnViewAll.addEventListener("click", () => {
      savedPracticeMode = false;
      btnPractice?.classList.remove("active");
      toast("Hiển thị tất cả từ và câu đã lưu");
      renderSavedTab();
    });
  }
  const btnPractice = document.getElementById("sp-saved-practice");
  if (btnPractice) {
    btnPractice.addEventListener("click", () => {
      savedPracticeMode = !savedPracticeMode;
      btnPractice.classList.toggle("active", savedPracticeMode);
      toast(
        savedPracticeMode
          ? "Chế độ Flashcard ôn tập (bấm vào câu để lật bản dịch)"
          : "Đã tắt chế độ Flashcard"
      );
      renderSavedTab();
    });
  }

  function exportAnkiTsv() {
    const savedCues = normalizeSavedCues(state.savedCues);
    const userVocabEntries = Object.entries(state.userVocab || {}).filter(
      ([, v]) => v && (v === "learning" || v === "special" || v?.status === "learning" || v?.status === "special")
    );

    if (!savedCues.length && !userVocabEntries.length) {
      toast("Chưa có từ hoặc câu nào được lưu để xuất Anki");
      return;
    }

    const rows = [];
    rows.push("#separator:tab");
    rows.push("#html:true");
    rows.push("#tags column:3");

    // Words
    for (const [lemma] of userVocabEntries) {
      const sampleCue =
        (state.cues || []).find((c) => c.source && c.source.includes(lemma)) ||
        (savedCues || []).find((c) => c.source && c.source.includes(lemma));
      const sampleCtx = sampleCue ? sampleCue.source : "";
      const cleanLemma = lemma.replace(/[\t\r\n]/g, " ").trim();
      const cleanBack = (sampleCtx ? `Ngữ cảnh: ${sampleCtx}` : cleanLemma).replace(/[\t\r\n]/g, " ").trim();
      rows.push(`${cleanLemma}\t${cleanBack}\tcaption_studio vocab`);
    }

    // Sentences
    for (const sc of savedCues) {
      const ja = (sc.source || "").replace(/[\t\r\n]/g, " ").trim();
      const trans = (stripStub(sc.vi) || stripStub(sc.en) || "").replace(/[\t\r\n]/g, " ").trim();
      if (!ja) continue;
      rows.push(`${ja}\t${trans}\tcaption_studio sentence`);
    }

    const blob = new Blob([rows.join("\n")], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `caption_studio_anki_${dateStr}.tsv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`Đã xuất ${rows.length - 3} mục sang file Anki TSV`);
  }

  const btnExportAnki = document.getElementById("sp-saved-export-anki");
  if (btnExportAnki) {
    btnExportAnki.addEventListener("click", () => {
      exportAnkiTsv();
    });
  }

  // Ask content for current state on open; pull Drive → bridge if newer.
  (async () => {
    await loadLevelSettings();
    void refreshDriveStatus();
    void pullDriveOnOpen();
    setStatus("Đang kết nối…");

    let activeTab = null;
    try {
      let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tabs?.length || !isSupportedVideoUrl(tabs[0]?.url)) {
        tabs = await chrome.tabs.query({ active: true });
      }
      activeTab = tabs?.find((t) => isSupportedVideoUrl(t.url));
      if (!activeTab) {
        const all = await chrome.tabs.query({});
        activeTab = all.find((t) => isSupportedVideoUrl(t.url));
      }
      if (activeTab?.id != null) {
        currentActiveTabId = activeTab.id;
        tabId = activeTab.id;
      }
    } catch (_) {}

    if (!activeTab?.url || !isSupportedVideoUrl(activeTab.url)) {
      setStatus("Sẵn sàng · Mở video để tải phụ đề");
      if (emptyEl) emptyEl.hidden = false;
      if (listEl) listEl.hidden = true;
      return;
    }

    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: "SP_CMD", cmd: "get_state" });
    } catch {
      setStatus("Refresh tab rồi mở lại panel");
    }
  })();
})();
