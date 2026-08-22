/**
 * Shared vocab highlight helpers (content script + side panel).
 * Exposes globalThis.HardsubVocab
 */
(() => {
  const SKIP_POS = /^(助詞|助動詞|補助記号|記号|空白)/;

  const DEFAULT_VOCAB_COLORS = {
    known: "#7fd6a8",
    suggested: "#d4a574",
    learning: "#e08a4a",
    ignored: "#b8a0d8",
    special: "#e74c5c",
  };

  /** JLPT band keys used in settings + CSS vars (unknown = no freq/jlpt). */
  const LEVEL_KEYS = ["n5", "n4", "n3", "n2", "n1", "unknown"];

  const DEFAULT_LEVEL_COLORS = {
    n5: { on: true, color: "#7fd6a8" },
    n4: { on: true, color: "#8fd3ff" },
    n3: { on: true, color: "#f5d76e" },
    n2: { on: true, color: "#e08a4a" },
    n1: { on: true, color: "#e74c5c" },
    unknown: { on: true, color: "#c5c5d0" },
  };

  const LEVEL_LABELS = {
    n5: "N5",
    n4: "N4",
    n3: "N3",
    n2: "N2",
    n1: "N1",
    unknown: "Không rõ",
  };

  /** Fixed JA sample for live color preview (with furigana + jlpt). */
  const SAMPLE_PREVIEW_TOKENS = [
    { surface: "初めて", reading: "はじめて", jlpt: "n5", pos: "副詞" },
    { surface: "夜", reading: "よる", jlpt: "n5", pos: "名詞" },
    { surface: "、", reading: "", jlpt: "", pos: "補助記号" },
    { surface: "砂", reading: "すな", jlpt: "n3", pos: "名詞" },
    { surface: "の", reading: "", jlpt: "", pos: "助詞" },
    { surface: "上", reading: "うえ", jlpt: "n5", pos: "名詞" },
    { surface: "で", reading: "", jlpt: "", pos: "助詞" },
    { surface: "眠り", reading: "ねむり", jlpt: "n3", pos: "名詞" },
    { surface: "に", reading: "", jlpt: "", pos: "助詞" },
    { surface: "ついた", reading: "ついた", jlpt: "n4", pos: "動詞" },
    { surface: "。", reading: "", jlpt: "", pos: "補助記号" },
    { surface: "人間", reading: "にんげん", jlpt: "n3", pos: "名詞" },
    { surface: "の", reading: "", jlpt: "", pos: "助詞" },
    { surface: "住まい", reading: "すまい", jlpt: "n2", pos: "名詞" },
    { surface: "から", reading: "", jlpt: "", pos: "助詞" },
    { surface: "何千", reading: "なんぜん", jlpt: "n2", pos: "名詞" },
    { surface: "マイル", reading: "まいる", jlpt: "n1", pos: "名詞" },
    { surface: "も", reading: "", jlpt: "", pos: "助詞" },
    { surface: "離れて", reading: "はなれて", jlpt: "n3", pos: "動詞" },
    { surface: "いた", reading: "いた", jlpt: "n5", pos: "動詞" },
    { surface: "。", reading: "", jlpt: "", pos: "補助記号" },
    { surface: "海", reading: "うみ", jlpt: "n5", pos: "名詞" },
    { surface: "の", reading: "", jlpt: "", pos: "助詞" },
    { surface: "真ん中", reading: "まんなか", jlpt: "n3", pos: "名詞" },
    { surface: "の", reading: "", jlpt: "", pos: "助詞" },
    { surface: "いかだ", reading: "いかだ", jlpt: "n1", pos: "名詞" },
    { surface: "の", reading: "", jlpt: "", pos: "助詞" },
    { surface: "上", reading: "うえ", jlpt: "n5", pos: "名詞" },
    { surface: "で", reading: "", jlpt: "", pos: "助詞" },
    { surface: "遭難", reading: "そうなん", jlpt: "n1", pos: "名詞" },
    { surface: "した", reading: "した", jlpt: "n5", pos: "動詞" },
    { surface: "船乗り", reading: "ふなのり", jlpt: "n2", pos: "名詞" },
    { surface: "よりも", reading: "", jlpt: "", pos: "助詞" },
    { surface: "、", reading: "", jlpt: "", pos: "補助記号" },
    { surface: "もっと", reading: "もっと", jlpt: "n4", pos: "副詞" },
    { surface: "孤独", reading: "こどく", jlpt: "n1", pos: "名詞" },
    { surface: "だった", reading: "だった", jlpt: "n4", pos: "助動詞" },
    { surface: "。", reading: "", jlpt: "", pos: "補助記号" },
    { surface: "（", reading: "", jlpt: "", pos: "補助記号" },
    { surface: "珍語", reading: "ちんご", jlpt: "", pos: "名詞" },
    { surface: "）", reading: "", jlpt: "", pos: "補助記号" },
  ];

  const DEFAULT_VOCAB_SETTINGS = {
    vocabLevel: 5000,
    vocabHighlight: true,
    showKnownGreen: true,
    hideRareWords: false,
    vocabColors: { ...DEFAULT_VOCAB_COLORS },
    vocabCats: {
      known: true,
      suggested: true,
      learning: true,
      ignored: true,
      special: true,
      learningBorder: true,
    },
    levelHighlightEnabled: true,
    levelColors: cloneLevelColors(DEFAULT_LEVEL_COLORS),
  };

  const JLPT_LEVELS = new Set(["n5", "n4", "n3", "n2", "n1"]);

  function cloneLevelColors(src) {
    const out = {};
    for (const key of LEVEL_KEYS) {
      const d = src?.[key] || DEFAULT_LEVEL_COLORS[key];
      out[key] = { on: d.on !== false, color: String(d.color || DEFAULT_LEVEL_COLORS[key].color) };
    }
    return out;
  }

  function normalizeLevelColors(raw) {
    return cloneLevelColors(raw || DEFAULT_LEVEL_COLORS);
  }

  function isSkipPos(pos) {
    return SKIP_POS.test(String(pos || ""));
  }

  function isContentWord(token) {
    if (!token) return false;
    const surface = String(token.surface || "");
    if (!surface.trim()) return false;
    if (isSkipPos(token.pos)) return false;
    // Punctuation / whitespace surfaces
    if (/^[\s\u3000\u3001\u3002。、.!?,！？「」『』（）()[\]【】…・〜～]+$/.test(surface)) {
      return false;
    }
    return true;
  }

  /** Normalize bridge jlpt field → n5…n1 or "". */
  function jlptLevel(token) {
    const raw = String(token?.jlpt || token?.level || "")
      .toLowerCase()
      .replace(/^jlpt-?/, "");
    return JLPT_LEVELS.has(raw) ? raw : "";
  }

  /**
   * JLPT / difficulty class (always applied for content words when level known).
   * @returns {string} e.g. "jlpt-n3" or "level-unknown"
   */
  function jlptClassForToken(token) {
    if (!isContentWord(token)) return "";
    const level = jlptLevel(token);
    return level ? `jlpt-${level}` : "level-unknown";
  }

  /**
   * @returns {string} CSS class name(s), may include tok-hidden + jlpt-*
   */
  function classForToken(token, settings, userVocab) {
    const s = { ...DEFAULT_VOCAB_SETTINGS, ...(settings || {}) };
    const jlptCls = jlptClassForToken(token);
    if (!s.vocabHighlight) return jlptCls;
    if (!isContentWord(token)) return "";

    const lemma = String(token.lemma || token.surface || "");
    const status = (userVocab && userVocab[lemma]) || "";
    const cats = { ...DEFAULT_VOCAB_SETTINGS.vocabCats, ...(s.vocabCats || {}) };

    let statusCls = "";
    if (status === "special" && cats.special) statusCls = "tok-special";
    else if (status === "learning" && cats.learning) {
      statusCls = cats.learningBorder ? "tok-learning tok-learning-border" : "tok-learning";
    } else if (status === "ignored" && cats.ignored) statusCls = "tok-ignored";
    else if (status === "known") {
      statusCls = cats.known && s.showKnownGreen ? "tok-known" : "";
    } else {
      const level = Number(s.vocabLevel) || 5000;
      const rank = token.freq_rank;
      const above = rank == null || Number(rank) > level;
      if (above) {
        if (s.hideRareWords) statusCls = "tok-rare tok-hidden";
        else statusCls = cats.suggested ? "tok-rare" : "";
      } else {
        statusCls = cats.known && s.showKnownGreen ? "tok-known" : "";
      }
    }

    return [jlptCls, statusCls].filter(Boolean).join(" ");
  }

  function cssVarsFromColors(colors) {
    const c = { ...DEFAULT_VOCAB_COLORS, ...(colors || {}) };
    return {
      "--tok-known": c.known,
      "--tok-rare": c.suggested,
      "--tok-learning": c.learning,
      "--tok-ignored": c.ignored,
      "--tok-special": c.special,
    };
  }

  /**
   * CSS custom properties for JLPT level highlight.
   * Disabled levels / master off → inherit (default text color).
   */
  function cssVarsFromLevelColors(levelColors, levelHighlightEnabled = true) {
    const c = normalizeLevelColors(levelColors);
    const enabled = levelHighlightEnabled !== false;
    const vars = {};
    for (const key of LEVEL_KEYS) {
      const cssKey = key === "unknown" ? "--jlpt-unknown" : `--jlpt-${key}`;
      const entry = c[key];
      vars[cssKey] = enabled && entry.on ? entry.color : "inherit";
    }
    return vars;
  }

  function applyColorVars(el, colors) {
    if (!el) return;
    const vars = cssVarsFromColors(colors);
    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
  }

  function applyLevelColorVars(el, levelColors, levelHighlightEnabled = true) {
    if (!el) return;
    const vars = cssVarsFromLevelColors(levelColors, levelHighlightEnabled);
    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
  }

  /** Apply status + JLPT level CSS vars from hardsubSettings slice. */
  function applyHighlightVars(el, settings) {
    if (!el) return;
    const s = { ...DEFAULT_VOCAB_SETTINGS, ...(settings || {}) };
    applyColorVars(el, s.vocabColors);
    applyLevelColorVars(el, s.levelColors, s.levelHighlightEnabled !== false);
  }

  function tokensNeedEnrich(cue) {
    const toks = cue?.tokens || [];
    if (!toks.length) return true;
    const content = toks.filter(isContentWord);
    if (!content.length) return false;
    // Bootstrap cache: freq_rank key present-but-null + no jlpt → still enrich.
    // Don't key off toks[0] alone (often a particle with null forever).
    return content.every((t) => t.freq_rank == null && !t.jlpt);
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

  /** Render sample JA with ruby for the level-color preview box. */
  function renderLevelPreviewHtml(showFurigana = true) {
    return SAMPLE_PREVIEW_TOKENS.map((t) => {
      const s = escapeHtml(t.surface);
      const cls = jlptClassForToken(t);
      const classAttr = cls ? ` tok ${cls}` : " tok";
      if (showFurigana && t.reading && !isSkipPos(t.pos)) {
        return `<ruby class="${classAttr.trim()}">${s}<rt>${escapeHtml(t.reading)}</rt></ruby>`;
      }
      return `<span class="${classAttr.trim()}">${s}</span>`;
    }).join("");
  }

  globalThis.HardsubVocab = {
    DEFAULT_VOCAB_COLORS,
    DEFAULT_VOCAB_SETTINGS,
    DEFAULT_LEVEL_COLORS,
    LEVEL_KEYS,
    LEVEL_LABELS,
    SAMPLE_PREVIEW_TOKENS,
    isSkipPos,
    isContentWord,
    jlptLevel,
    jlptClassForToken,
    classForToken,
    cssVarsFromColors,
    cssVarsFromLevelColors,
    normalizeLevelColors,
    applyColorVars,
    applyLevelColorVars,
    applyHighlightVars,
    tokensNeedEnrich,
    renderLevelPreviewHtml,
  };
})();
