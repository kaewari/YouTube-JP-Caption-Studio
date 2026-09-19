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
    unknown: { on: true, color: "#94a3b8" },
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
    enableBilingualJlptColor: true,
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

  /**
   * High-frequency Japanese words mapped to JLPT bands.
   * Guarantees vibrant coloring even when backend dictionary omits JLPT annotation.
   */
  const COMMON_JLPT_WORDS = {
    // N5
    "私": "n5", "わたし": "n5", "わたくし": "n5", "僕": "n5", "ぼく": "n5", "俺": "n5", "あなた": "n5",
    "今": "n5", "いま": "n5", "今日": "n5", "きょう": "n5", "明日": "n5", "あした": "n5",
    "昨日": "n5", "きのう": "n5", "日本": "n5", "にほん": "n5", "にっぽん": "n5", "日本語": "n5",
    "人": "n5", "ひと": "n5", "何": "n5", "なに": "n5", "なん": "n5", "これ": "n5", "それ": "n5", "あれ": "n5",
    "ここ": "n5", "そこ": "n5", "あそこ": "n5", "どこ": "n5", "誰": "n5", "だれ": "n5",
    "行く": "n5", "いく": "n5", "来る": "n5", "くる": "n5", "見る": "n5", "みる": "n5",
    "聞く": "n5", "きく": "n5", "食べる": "n5", "たべる": "n5", "飲む": "n5", "のむ": "n5",
    "話す": "n5", "はなす": "n5", "言う": "n5", "いう": "n5", "思う": "n5", "おもう": "n5",
    "知る": "n5", "しる": "n5", "分かる": "n5", "わかる": "n5", "ある": "n5", "いる": "n5", "する": "n5",
    "いい": "n5", "よい": "n5", "大きい": "n5", "おおきい": "n5", "小さい": "n5", "ちいさい": "n5",
    "皆さん": "n5", "みなさん": "n5", "みんな": "n5", "先生": "n5", "せんせい": "n5", "学生": "n5", "がくせい": "n5",
    "友達": "n5", "ともだち": "n5", "時間": "n5", "じかん": "n5", "時": "n5", "とき": "n5",
    "日": "n5", "年": "n5", "月": "n5", "円": "n5", "本": "n5", "車": "n5", "家": "n5",
    "食べる": "n5", "たべる": "n5", "飲む": "n5", "のむ": "n5", "行く": "n5", "いく": "n5",
    "来る": "n5", "くる": "n5", "見る": "n5", "みる": "n5", "聞く": "n5", "きく": "n5",
    "言う": "n5", "いう": "n5", "話す": "n5", "はなす": "n5", "読む": "n5", "よむ": "n5",
    "書く": "n5", "かく": "n5", "買う": "n5", "かう": "n5", "する": "n5", "いる": "n5",
    "ある": "n5", "なる": "n5", "です": "n5", "ます": "n5", "だ": "n5", "た": "n5", "て": "n5",
    "美味しい": "n5", "おいしい": "n5", "ご飯": "n5", "ごはん": "n5", "大きい": "n5", "おおきい": "n5",
    "小さい": "n5", "ちいさい": "n5", "良い": "n5", "よい": "n5", "いい": "n5",

    // N4
    "彼": "n4", "かれ": "n4", "彼女": "n4", "かのじょ": "n4", "自分": "n4", "じぶん": "n4",
    "世界": "n4", "せかい": "n4", "場所": "n4", "ばしょ": "n4", "始める": "n4", "はじめる": "n4",
    "終わる": "n4", "おわる": "n4", "続ける": "n4", "つづける": "n4", "考える": "n4", "かんがえる": "n4",
    "教える": "n4", "おしえる": "n4", "習う": "n4", "ならう": "n4", "覚える": "n4", "おぼえる": "n4",
    "忘れる": "n4", "わすれる": "n4", "手伝う": "n4", "働く": "n4", "はたらく": "n4",
    "質問": "n4", "しつもん": "n4", "問題": "n4", "もんだい": "n4", "答え": "n4", "こたえ": "n4",
    "理由": "n4", "りゆう": "n4", "意味": "n4", "いみ": "n4", "心": "n4", "こころ": "n4",

    // N3
    "経験": "n3", "けいけん": "n3", "関係": "n3", "かんけい": "n3", "状況": "n3", "じょうきょう": "n3",
    "目的": "n3", "もくてき": "n3", "変化": "n3", "へんか": "n3", "自然": "n3", "しぜん": "n3",
    "社会": "n3", "しゃかい": "n3", "文化": "n3", "ぶんか": "n3", "歴史": "n3", "れきし": "n3",
    "技術": "n3", "ぎじゅつ": "n3", "情報": "n3", "じょうほう": "n3", "説明": "n3", "せつめい": "n3",
    "紹介": "n3", "しょうかい": "n3", "相談": "n3", "そうだん": "n3",

    // N2
    "可能": "n2", "かのう": "n2", "存在": "n2", "そんざい": "n2", "影響": "n2", "えいきょう": "n2",
    "効果": "n2", "こうか": "n2", "結果": "n2", "けっか": "n2", "原因": "n2", "げんいん": "n2",

    // N1
    "概念": "n1", "がいねん": "n1", "本質": "n1", "ほんしつ": "n1", "矛盾": "n1", "むじゅん": "n1",
    "妥協": "n1", "だきょう": "n1", "把握": "n1", "はあく": "n1",
  };

  const BILINGUAL_MAP = {
    "私": { vi: ["tôi", "mình", "tớ", "em", "anh"], en: ["i", "me", "my", "myself"] },
    "わたし": { vi: ["tôi", "mình", "tớ", "em", "anh"], en: ["i", "me", "my", "myself"] },
    "僕": { vi: ["tôi", "mình", "tớ"], en: ["i", "me", "my"] },
    "ぼく": { vi: ["tôi", "mình", "tớ"], en: ["i", "me", "my"] },
    "皆さん": { vi: ["mọi người", "các bạn", "quý vị"], en: ["everyone", "everybody", "all of you"] },
    "みなさん": { vi: ["mọi người", "các bạn", "quý vị"], en: ["everyone", "everybody", "all of you"] },
    "日本": { vi: ["nhật bản", "nước nhật", "nhật"], en: ["japan", "japanese"] },
    "にほん": { vi: ["nhật bản", "nước nhật", "nhật"], en: ["japan", "japanese"] },
    "日本語": { vi: ["tiếng nhật"], en: ["japanese"] },
    "にほんご": { vi: ["tiếng nhật"], en: ["japanese"] },
    "今日": { vi: ["hôm nay"], en: ["today"] },
    "きょう": { vi: ["hôm nay"], en: ["today"] },
    "明日": { vi: ["ngày mai", "mai"], en: ["tomorrow"] },
    "あした": { vi: ["ngày mai", "mai"], en: ["tomorrow"] },
    "昨日": { vi: ["hôm qua"], en: ["yesterday"] },
    "きのう": { vi: ["hôm qua"], en: ["yesterday"] },
    "時間": { vi: ["thời gian", "giờ"], en: ["time", "hours"] },
    "じかん": { vi: ["thời gian", "giờ"], en: ["time", "hours"] },
    "人": { vi: ["người", "con người"], en: ["person", "people"] },
    "ひと": { vi: ["người", "con người"], en: ["person", "people"] },
    "友達": { vi: ["bạn bè", "bạn"], en: ["friend", "friends"] },
    "ともだち": { vi: ["bạn bè", "bạn"], en: ["friend", "friends"] },
    "先生": { vi: ["thầy giáo", "cô giáo", "thầy", "cô", "giáo viên"], en: ["teacher", "professor"] },
    "せんせい": { vi: ["thầy giáo", "cô giáo", "thầy", "cô", "giáo viên"], en: ["teacher", "professor"] },
    "世界": { vi: ["thế giới"], en: ["world"] },
    "せかい": { vi: ["thế giới"], en: ["world"] },
    "場所": { vi: ["nơi", "chỗ", "địa điểm"], en: ["place", "location"] },
    "ばしょ": { vi: ["nơi", "chỗ", "địa điểm"], en: ["place", "location"] },
    "問題": { vi: ["vấn đề", "câu hỏi"], en: ["problem", "question", "issue"] },
    "もんだい": { vi: ["vấn đề", "câu hỏi"], en: ["problem", "question", "issue"] },
    "経験": { vi: ["kinh nghiệm", "trải nghiệm"], en: ["experience"] },
    "けいけん": { vi: ["kinh nghiệm", "trải nghiệm"], en: ["experience"] },
    "関係": { vi: ["mối quan hệ", "quan hệ"], en: ["relationship", "relation"] },
    "かんけい": { vi: ["mối quan hệ", "quan hệ"], en: ["relationship", "relation"] },
    "情報": { vi: ["thông tin"], en: ["information", "info"] },
    "じょうほう": { vi: ["thông tin"], en: ["information", "info"] },
    "結果": { vi: ["kết quả"], en: ["result", "results"] },
    "けっか": { vi: ["kết quả"], en: ["result", "results"] },
  };

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

  /** Normalize bridge jlpt field → n5…n1 or lookup fallback. */
  function jlptLevel(token) {
    const raw = String(token?.jlpt || token?.level || "")
      .toLowerCase()
      .replace(/^jlpt-?/, "");
    if (JLPT_LEVELS.has(raw)) return raw;
    const lemma = String(token?.lemma || "");
    if (Object.hasOwn(COMMON_JLPT_WORDS, lemma)) return COMMON_JLPT_WORDS[lemma];
    const surface = String(token?.surface || "");
    if (Object.hasOwn(COMMON_JLPT_WORDS, surface)) return COMMON_JLPT_WORDS[surface];
    const reading = String(token?.reading || "");
    if (reading && Object.hasOwn(COMMON_JLPT_WORDS, reading)) return COMMON_JLPT_WORDS[reading];
    return "";
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
    const Kana = globalThis.HardsubRomajiKana;
    return SAMPLE_PREVIEW_TOKENS.map((t) => {
      const s = escapeHtml(t.surface);
      const cls = jlptClassForToken(t);
      const classAttr = cls ? ` tok ${cls}` : " tok";
      if (showFurigana && t.reading && !isSkipPos(t.pos) && /[\u4e00-\u9faf\u3400-\u4dbf]/.test(t.surface)) {
        const reading =
          Kana && typeof Kana.katakanaToHiragana === "function"
            ? Kana.katakanaToHiragana(t.reading)
            : t.reading;
        return `<ruby class="${classAttr.trim()}">${s}<rt>${escapeHtml(reading)}</rt></ruby>`;
      }
      return `<span class="${classAttr.trim()}">${s}</span>`;
    }).join("");
  }

  /** Render Japanese tokens as HTML with ruby/rt furigana and vocab styling. */
  function renderRubyHtml(cue, options = {}) {
    if (!cue) return "";
    if (!cue.tokens?.length) {
      return escapeHtml(cue.source || "");
    }
    const showFurigana = options.showFurigana ?? true;
    const settings = options.settings || DEFAULT_VOCAB_SETTINGS;
    const userVocab = options.userVocab || {};
    const Kana = globalThis.HardsubRomajiKana;

    return cue.tokens
      .map((t) => {
        const s = escapeHtml(t.surface);
        const lemma = escapeHtml(t.lemma || t.surface);
        const surfaceAttr = escapeHtml(t.surface);
        const cls = classForToken(t, settings, userVocab);
        const classAttr = cls ? `tok ${cls}` : "tok";
        if (showFurigana && t.reading && !isSkipPos(t.pos) && /[\u4e00-\u9faf\u3400-\u4dbf]/.test(t.surface)) {
          const rawReading = t.reading || "";
          const hiragana =
            Kana && typeof Kana.katakanaToHiragana === "function"
              ? Kana.katakanaToHiragana(rawReading)
              : rawReading;
          if (hiragana) {
            return `<ruby class="${classAttr.trim()}" data-surface="${surfaceAttr}" data-lemma="${lemma}">${s}<rt>${escapeHtml(hiragana)}</rt></ruby>`;
          }
        }
        return `<span class="${classAttr.trim()}" data-surface="${surfaceAttr}" data-lemma="${lemma}">${s}</span>`;
      })
      .join("");
  }

  /**
   * Offline fallback tokenizer using Intl.Segmenter when Bridge is offline.
   * Splices text into words without furigana / dictionary tags.
   */
  function segmentFallback(text) {
    if (!text || typeof text !== "string") return [];
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
        const segments = segmenter.segment(text);
        const tokens = [];
        for (const seg of segments) {
          const s = seg.segment;
          if (!s) continue;
          tokens.push({
            surface: s,
            reading: "",
            lemma: s,
            pos: seg.isWordLike ? "名詞" : "補助記号",
            jlpt: "",
          });
        }
        return tokens;
      } catch (err) {
        // fallback to character/word split below
      }
    }
    return [{ surface: text, reading: "", lemma: text, pos: "名詞", jlpt: "" }];
  }

  function renderBilingualHtml(text, lang, tokens, settings) {
    if (!text) return "";
    const s = { ...DEFAULT_VOCAB_SETTINGS, ...(settings || {}) };
    if (!s.enableBilingualJlptColor || !Array.isArray(tokens) || !tokens.length) {
      return escapeHtml(text);
    }

    const targetMap = new Map();
    for (const t of tokens) {
      const level = jlptLevel(t);
      if (!level) continue;
      const surface = String(t.surface || "");
      const lemma = String(t.lemma || surface);
      const mapEntry =
        (lemma && Object.hasOwn(BILINGUAL_MAP, lemma) && BILINGUAL_MAP[lemma]) ||
        (surface && Object.hasOwn(BILINGUAL_MAP, surface) && BILINGUAL_MAP[surface]);
      const keywords = mapEntry
        ? lang === "en"
          ? mapEntry.en
          : lang === "vi"
          ? mapEntry.vi
          : []
        : [];
      if (Array.isArray(keywords)) {
        for (const kw of keywords) {
          if (kw && kw.length >= 1 && !targetMap.has(kw.toLowerCase())) {
            targetMap.set(kw.toLowerCase(), { word: kw, level });
          }
        }
      }
    }

    const targets = Array.from(targetMap.values());
    if (!targets.length) return escapeHtml(text);

    // Sort targets by length descending so longer phrases match first
    targets.sort((a, b) => b.word.length - a.word.length);
    const escaped = targets.map((t) => t.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(?<=^|[^\\p{L}\\p{N}])(${escaped.join("|")})(?=[^\\p{L}\\p{N}]|$)`, "giu");

    const parts = text.split(regex);
    return parts
      .map((part) => {
        if (!part) return "";
        const lower = part.toLowerCase();
        const found = targetMap.get(lower);
        if (found) {
          return `<span class="tok-trans jlpt-${found.level}">${escapeHtml(part)}</span>`;
        }
        return escapeHtml(part);
      })
      .join("");
  }

  globalThis.HardsubVocab = {
    DEFAULT_VOCAB_COLORS,
    DEFAULT_VOCAB_SETTINGS,
    DEFAULT_LEVEL_COLORS,
    LEVEL_KEYS,
    LEVEL_LABELS,
    COMMON_JLPT_WORDS,
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
    renderRubyHtml,
    renderBilingualHtml,
    segmentFallback,
  };
})();
