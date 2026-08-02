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
  const listEl = document.getElementById("sp-list");
  const emptyEl = document.getElementById("sp-empty");
  const toastEl = document.getElementById("sp-toast");
  const overlayBtn = document.getElementById("sp-overlay");
  const followBtn = document.getElementById("sp-follow");
  const levelDrawer = document.getElementById("sp-level-drawer");
  const levelRowsEl = document.getElementById("sp-level-rows");
  const levelPreviewEl = document.getElementById("sp-level-preview");
  const levelEnabledEl = document.getElementById("sp-level-enabled");

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
  };

  /** Local mirror of level color settings (drawer edits → chrome.storage). */
  let levelSettings = {
    levelHighlightEnabled: true,
    levelColors: Vocab.normalizeLevelColors(Vocab.DEFAULT_LEVEL_COLORS),
  };
  let levelSaveTimer = null;
  let suppressLevelUi = false;
  let tabId = null;
  let listDirty = true;
  /** Last accepted SP_STATE cue-list sequence (drop stale full payloads). */
  let lastCueSeq = 0;
  let lastCueSession = "";

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

  function setStatus(text) {
    statusEl.textContent = text || "…";
  }

  function syncFollowBtn() {
    if (!followBtn) return;
    followBtn.hidden = followTimeline;
    followBtn.classList.toggle("active", followTimeline);
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
        : "Mở tab YouTube đang phát video, rồi bấm icon extension để mở panel.";
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

  async function resolveTabId() {
    if (tabId != null) return tabId;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const yt = (tabs || []).find((t) => /youtube\.com/.test(t.url || ""));
    if (yt?.id != null) {
      tabId = yt.id;
      return tabId;
    }
    const all = await chrome.tabs.query({
      url: ["https://www.youtube.com/*", "https://youtube.com/*"],
    });
    if (all?.[0]?.id != null) {
      tabId = all[0].id;
      return tabId;
    }
    return null;
  }

  async function sendCmd(cmd, payload = {}) {
    const id = await resolveTabId();
    if (id == null) {
      toast("Không thấy tab YouTube");
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
        toast("Tab YouTube chưa sẵn — refresh trang");
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
      if (levelPreviewEl) Vocab.applyHighlightVars(levelPreviewEl, levelSettings);
    } else {
      Vocab.applyColorVars?.(listEl, state.vocabColors);
    }
  }

  function rubyHtml(cue) {
    if (!cue.tokens?.length) {
      return escapeHtml(cue.source);
    }
    const settings = highlightSettingsFromState();
    return cue.tokens
      .map((t) => {
        const s = escapeHtml(t.surface);
        const lemma = escapeAttr(t.lemma || t.surface);
        const surfaceAttr = escapeAttr(t.surface);
        const cls = Vocab.classForToken(t, settings, state.userVocab || {});
        const classAttr = cls ? ` tok ${cls}` : " tok";
        if (state.showFurigana && t.reading) {
          return `<ruby class="${classAttr.trim()}" data-surface="${surfaceAttr}" data-lemma="${lemma}">${s}<rt>${escapeHtml(t.reading)}</rt></ruby>`;
        }
        return `<span class="${classAttr.trim()}" data-surface="${surfaceAttr}" data-lemma="${lemma}">${s}</span>`;
      })
      .join("");
  }

  function syncLevelUiFromSettings() {
    suppressLevelUi = true;
    if (levelEnabledEl) {
      levelEnabledEl.checked = levelSettings.levelHighlightEnabled !== false;
    }
    const colors = Vocab.normalizeLevelColors(levelSettings.levelColors);
    levelSettings.levelColors = colors;
    (Vocab.LEVEL_KEYS || []).forEach((key) => {
      const onEl = document.getElementById(`sp-lvl-on-${key}`);
      const colorEl = document.getElementById(`sp-lvl-color-${key}`);
      if (onEl) onEl.checked = colors[key].on !== false;
      if (colorEl) colorEl.value = colors[key].color;
    });
    refreshLevelPreview();
    suppressLevelUi = false;
  }

  function refreshLevelPreview() {
    if (!levelPreviewEl) return;
    levelPreviewEl.innerHTML = Vocab.renderLevelPreviewHtml?.(true) || "";
    Vocab.applyHighlightVars?.(levelPreviewEl, levelSettings);
  }

  function buildLevelRows() {
    if (!levelRowsEl) return;
    const labels = Vocab.LEVEL_LABELS || {};
    const colors = Vocab.normalizeLevelColors(levelSettings.levelColors);
    levelRowsEl.innerHTML = (Vocab.LEVEL_KEYS || [])
      .map((key) => {
        const entry = colors[key];
        const label = labels[key] || key.toUpperCase();
        return `
          <div class="sp-level-row" data-level="${key}">
            <label class="sp-toggle" title="Bật/tắt">
              <input type="checkbox" id="sp-lvl-on-${key}" ${entry.on ? "checked" : ""} />
              <span class="sp-toggle-track"></span>
            </label>
            <span class="sp-level-label">${escapeHtml(label)}</span>
            <input type="color" id="sp-lvl-color-${key}" value="${escapeAttr(entry.color)}" title="Màu" />
          </div>`;
      })
      .join("");

    levelRowsEl.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("change", onLevelUiChange);
      if (inp.type === "color") inp.addEventListener("input", onLevelUiChange);
    });
  }

  function readLevelUiIntoSettings() {
    const colors = {};
    (Vocab.LEVEL_KEYS || []).forEach((key) => {
      const onEl = document.getElementById(`sp-lvl-on-${key}`);
      const colorEl = document.getElementById(`sp-lvl-color-${key}`);
      colors[key] = {
        on: onEl ? !!onEl.checked : true,
        color: colorEl?.value || Vocab.DEFAULT_LEVEL_COLORS?.[key]?.color || "#c5c5d0",
      };
    });
    levelSettings = {
      levelHighlightEnabled: levelEnabledEl ? !!levelEnabledEl.checked : true,
      levelColors: Vocab.normalizeLevelColors(colors),
    };
  }

  function onLevelUiChange() {
    if (suppressLevelUi) return;
    readLevelUiIntoSettings();
    refreshLevelPreview();
    scheduleSaveLevelSettings();
  }

  function scheduleSaveLevelSettings() {
    clearTimeout(levelSaveTimer);
    levelSaveTimer = setTimeout(saveLevelSettings, 200);
  }

  async function saveLevelSettings() {
    const prev = (await chrome.storage.local.get("hardsubSettings")).hardsubSettings || {};
    const next = {
      ...prev,
      levelHighlightEnabled: levelSettings.levelHighlightEnabled !== false,
      levelColors: Vocab.normalizeLevelColors(levelSettings.levelColors),
    };
    await chrome.storage.local.set({ hardsubSettings: next });
    state.levelHighlightEnabled = next.levelHighlightEnabled;
    state.levelColors = next.levelColors;
    applyListHighlightVars();
  }

  async function loadLevelSettings() {
    const data = await chrome.storage.local.get("hardsubSettings");
    const s = data.hardsubSettings || {};
    levelSettings = {
      levelHighlightEnabled: s.levelHighlightEnabled !== false,
      levelColors: Vocab.normalizeLevelColors(
        s.levelColors || Vocab.DEFAULT_LEVEL_COLORS
      ),
    };
    state.levelHighlightEnabled = levelSettings.levelHighlightEnabled;
    state.levelColors = levelSettings.levelColors;
    syncLevelUiFromSettings();
    applyListHighlightVars();
  }

  function setLevelDrawerOpen(open) {
    if (!levelDrawer) return;
    levelDrawer.hidden = !open;
  }

  function scrollActiveIntoView(force = false) {
    if (!followTimeline && !force) return;
    const active = listEl.querySelector(".sp-sentence.active");
    if (!active || listEl.hidden) return;
    const r = active.getBoundingClientRect();
    const lr = listEl.getBoundingClientRect();
    if (force || r.top < lr.top || r.bottom > lr.bottom) {
      ignoreScrollEvent = true;
      active.scrollIntoView({ block: force ? "center" : "nearest" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          ignoreScrollEvent = false;
        });
      });
    }
  }

  function pauseFollowFromUser() {
    if (ignoreScrollEvent) return;
    if (!followTimeline) return;
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
      const nudge = ensureImeNudge();
      nudge.focus({ preventScroll: true });
      el.focus({ preventScroll: true });
    } catch (_) {
      try {
        el.focus({ preventScroll: true });
      } catch (__) {}
    }
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

  function bindJaDictHandlers(jaEl) {
    jaEl.querySelectorAll("ruby, .tok").forEach((tok) => {
      tok.addEventListener("mouseenter", (e) => {
        clearSpDictHideTimer();
        showDict(e, tok);
      });
      tok.addEventListener("mouseleave", (e) => {
        const related = e.relatedTarget;
        // Moving to another token in the same JA line — let mouseenter take over.
        if (
          related &&
          related.nodeType === 1 &&
          related.closest?.("ruby, .tok") &&
          related.closest?.(".sp-ja-view, .sp-ja")
        ) {
          return;
        }
        scheduleHideDict();
      });
      tok.addEventListener("click", (e) => {
        e.stopPropagation();
        showDict(e, tok);
      });
    });
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
      if (cue?.translated && cue.tokens?.length) {
        view.innerHTML = rubyHtml(cue);
        bindJaDictHandlers(view);
      } else {
        view.textContent = cue?.source ?? editOriginalSource ?? "";
      }
      return;
    }
    // Legacy path (plain .sp-ja div)
    if (cue?.translated && cue.tokens?.length) {
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
    el.textContent = cue?.[lang] ?? editOriginalLang ?? "";
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
      // OS IME committed — if Chrome still left Latin syllables, convert them.
      applyRomajiFallback(el);
    });
    el.addEventListener("input", (e) => {
      if (composing || e.isComposing || el.dataset.skipRomaji === "1") return;
      applyRomajiFallback(el);
    });
    // keyup catches inserts that skipped input composition flags (ABC under JA source).
    el.addEventListener("keyup", (e) => {
      if (composing || e.isComposing || e.keyCode === 229) return;
      applyRomajiFallback(el);
    });
    el.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") {
        e.preventDefault();
        commitOnEnter = false;
        exitEditCancel(el);
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      // Flush pending romaji (e.g. trailing "n") before commit.
      applyRomajiFallback(el);
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
      row.classList.toggle("active", row.dataset.id === state.activeCueId);
    });
    if (scroll && !isEditingAny()) scrollActiveIntoView();
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
    listEl.innerHTML = "";
    cues.forEach((cue, idx) => {
      const row = document.createElement("div");
      row.className = "sp-sentence" + (cue.id === activeId ? " active" : "");
      row.dataset.id = cue.id;
      row.dataset.idx = String(idx);
      const en = stripStub(cue.en);
      const vi = stripStub(cue.vi);
      const t0 = Timing.formatTimeInput(cue.start_media_time);
      const t1 = Timing.formatTimeInput(cue.end_media_time);
      row.innerHTML = `
        <div class="sp-meta">
          <button type="button" class="sp-play" data-t="${cue.start_media_time}" title="Play">▶</button>
          <span class="sp-times" title="Chỉnh timeline — Enter để lưu">
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
        <div class="sp-ja-wrap" data-idx="${idx}" tabindex="0">
          <div class="sp-ja-view">${
            cue.tokens?.length ? rubyHtml(cue) : escapeHtml(cue.source)
          }</div>
        </div>
        <div class="sp-vi" contenteditable="true" spellcheck="false" lang="vi" data-idx="${idx}" data-placeholder="VI">${escapeHtml(vi || "")}</div>
        <div class="sp-en" contenteditable="true" spellcheck="false" lang="en" data-idx="${idx}" data-placeholder="EN">${escapeHtml(en || "")}</div>
      `;
      listEl.appendChild(row);
    });

    listEl.querySelectorAll(".sp-play").forEach((btn) => {
      btn.addEventListener("click", () => {
        setFollowTimeline(true);
        sendCmd("play", { mediaTime: Number(btn.dataset.t) });
      });
    });
    listEl.querySelectorAll(".sp-copy").forEach((btn) => {
      btn.addEventListener("click", () => copyCueById(btn.dataset.id, "full"));
    });
    listEl.querySelectorAll(".sp-copy-menu button").forEach((btn) => {
      btn.addEventListener("click", () =>
        copyCueById(btn.dataset.id, btn.dataset.copy || "full")
      );
    });
    listEl.querySelectorAll(".sp-add-after").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const r = await sendCmd("add_cue", { afterId: btn.dataset.id });
        if (r?.ok && r.id) {
          toast("Đã thêm cue");
          // Focus new JA row after next state push.
          setTimeout(() => {
            const row = listEl.querySelector(`.sp-sentence[data-id="${CSS.escape(r.id)}"] .sp-ja-wrap`);
            row?.click();
          }, 120);
        }
      });
    });
    listEl.querySelectorAll(".sp-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Xóa cue này?")) return;
        await sendCmd("delete_cue", { id: btn.dataset.id });
      });
    });
    listEl.querySelectorAll(".sp-ja-wrap").forEach((el) => {
      bindJaEditHandlers(el);
      const view = el.querySelector(".sp-ja-view");
      if (view) bindJaDictHandlers(view);
    });
    listEl.querySelectorAll(".sp-vi").forEach((el) => bindLangEditHandlers(el, "vi"));
    listEl.querySelectorAll(".sp-en").forEach((el) => bindLangEditHandlers(el, "en"));
    listEl.querySelectorAll(".sp-sentence").forEach((row) => bindTimelineHandlers(row));

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
      if (incoming._seq < lastCueSeq) {
        delete incoming.cues;
      } else {
        lastCueSeq = incoming._seq;
      }
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
    // Grace so pointer can leave the side panel and land on the page popup.
    spDictHideTimer = setTimeout(() => {
      sendCmd("HIDE_PAGE_DICT");
      clearSpDictTokActive();
      spDictHideTimer = null;
    }, 380);
  }

  listEl.addEventListener("wheel", pauseFollowFromUser, { passive: true });
  listEl.addEventListener("touchstart", pauseFollowFromUser, { passive: true });
  listEl.addEventListener("scroll", pauseFollowFromUser, { passive: true });

  if (followBtn) {
    followBtn.addEventListener("click", () => {
      setFollowTimeline(true);
    });
  }

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
  document.getElementById("sp-clear-mt").addEventListener("click", async () => {
    if (!confirm("Xóa tất cả bản dịch EN/VI của video này? (JA giữ nguyên)")) return;
    toast("Đang xóa bản dịch…");
    await sendCmd("clear_translations");
  });
  document.getElementById("sp-wipe-script")?.addEventListener("click", async () => {
    if (
      !confirm(
        "Xóa toàn bộ sub/script đã lưu của video này và tải lại từ YouTube?\n(Mất chỉnh sửa JA/timeline, bản dịch và cache)"
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

  document.getElementById("sp-settings").addEventListener("click", () => {
    const open = levelDrawer?.hidden !== false;
    setLevelDrawerOpen(open);
    if (open) syncLevelUiFromSettings();
  });
  document.getElementById("sp-level-close")?.addEventListener("click", () => {
    setLevelDrawerOpen(false);
  });
  levelEnabledEl?.addEventListener("change", onLevelUiChange);
  document.getElementById("sp-level-reset")?.addEventListener("click", () => {
    levelSettings = {
      levelHighlightEnabled: true,
      levelColors: Vocab.normalizeLevelColors(Vocab.DEFAULT_LEVEL_COLORS),
    };
    syncLevelUiFromSettings();
    scheduleSaveLevelSettings();
  });
  document.getElementById("sp-open-popup")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html") });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SP_STATE") {
      if (msg.tabId != null) tabId = msg.tabId;
      applyState(msg.payload || {}, { forceList: !!msg.forceList });
    }
    if (msg?.type === "SP_CLOSE") {
      try {
        window.close();
      } catch (_) {}
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
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
    syncLevelUiFromSettings();
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
  buildLevelRows();

  // Ask content for current state on open
  (async () => {
    await loadLevelSettings();
    setStatus("Đang kết nối…");
    const id = await resolveTabId();
    if (id == null) {
      setStatus("Chưa có tab YouTube");
      return;
    }
    try {
      await chrome.tabs.sendMessage(id, { type: "SP_CMD", cmd: "ping" });
    } catch {
      setStatus("Refresh tab YouTube rồi mở lại panel");
    }
  })();
})();
