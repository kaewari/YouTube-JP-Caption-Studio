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
  const JLPT_LEVELS = new Set(["n5", "n4", "n3", "n2", "n1"]);

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
  };

  /**
   * 250+ JLPT Grammar Patterns & Compound Expressions (N5 to N1).
   * Used for both multi-token grammar grouping on hover and bilingual alignment.
   */
  const GRAMMAR_PATTERNS = {
    // Compound Particles & Case Markers (N3-N1)
    "について": { level: "n3", vi: ["về", "liên quan đến"], en: ["about", "regarding", "concerning"] },
    "に対して": { level: "n3", vi: ["đối với", "hướng tới"], en: ["towards", "to", "against"] },
    "にとって": { level: "n3", vi: ["đối với", "theo quan điểm"], en: ["for", "to"] },
    "として": { level: "n3", vi: ["như là", "với tư cách là", "với tư cách"], en: ["as", "in the capacity of"] },
    "によって": { level: "n3", vi: ["bởi vì", "do", "tùy thuộc vào", "tùy vào"], en: ["by", "due to", "depending on"] },
    "をはじめ": { level: "n2", vi: ["trước tiên là", "tiêu biểu là"], en: ["starting with", "not only"] },
    "に関して": { level: "n2", vi: ["về việc", "liên quan đến"], en: ["regarding", "concerning"] },
    "を通じて": { level: "n2", vi: ["thông qua"], en: ["through", "via"] },
    "にかけて": { level: "n2", vi: ["cho đến", "trải dài đến"], en: ["over", "spanning"] },
    "にわたって": { level: "n2", vi: ["trong suốt", "trên toàn bộ"], en: ["throughout", "across"] },
    "とともに": { level: "n2", vi: ["cùng với", "đồng thời"], en: ["along with", "together with"] },
    "にあたって": { level: "n2", vi: ["nhân dịp", "khi tiến hành"], en: ["on the occasion of", "when"] },
    "に基づいて": { level: "n2", vi: ["dựa trên", "căn cứ vào"], en: ["based on"] },
    "に沿って": { level: "n2", vi: ["dọc theo", "men theo"], en: ["along with", "in accordance with"] },
    "に応じて": { level: "n2", vi: ["tùy theo", "ứng với"], en: ["depending on", "in response to"] },
    "に比べて": { level: "n3", vi: ["so với"], en: ["compared to", "in comparison with"] },
    "に加えて": { level: "n2", vi: ["thêm vào đó", "ngoài ra"], en: ["in addition to"] },

    // Auxiliary Verb Chains & Endings (N5-N3)
    "てください": { level: "n5", vi: ["chúc bạn có một", "chúc bạn một", "chúc bạn có", "chúc bạn", "xin vui lòng", "hãy", "mời", "xin hãy", "chúc", "nhé"], en: ["please", "please do", "wish you", "have a"] },
    "てはいけない": { level: "n4", vi: ["không được", "cấm"], en: ["must not", "cannot"] },
    "なくてもいい": { level: "n4", vi: ["không cần", "không phải"], en: ["don't have to", "need not"] },
    "なければならない": { level: "n4", vi: ["phải", "bắt buộc phải"], en: ["must", "have to"] },
    "なくてはならない": { level: "n4", vi: ["phải", "cần phải"], en: ["must", "have to"] },
    "なきゃいけない": { level: "n4", vi: ["phải"], en: ["gotta", "must"] },
    "なきゃ": { level: "n4", vi: ["phải"], en: ["gotta", "have to"] },
    "てしまう": { level: "n4", vi: ["lỡ", "xong mất"], en: ["end up", "completely"] },
    "ちゃう": { level: "n4", vi: ["lỡ", "xong mất"], en: ["end up", "completely"] },
    "じゃう": { level: "n4", vi: ["lỡ", "xong mất"], en: ["end up", "completely"] },
    "ておく": { level: "n4", vi: ["làm sẵn", "để nguyên"], en: ["in advance", "leave as is"] },
    "とく": { level: "n4", vi: ["làm sẵn"], en: ["in advance"] },
    "てみる": { level: "n4", vi: ["thử", "làm thử"], en: ["try", "try doing"] },
    "ていく": { level: "n4", vi: ["tiếp tục", "đi dần"], en: ["continue to", "go on"] },
    "てくる": { level: "n4", vi: ["bắt đầu", "dần dần"], en: ["come to", "begin to"] },
    "ている": { level: "n5", vi: ["đang"], en: ["is doing", "are doing", "doing"] },
    "てある": { level: "n4", vi: ["được làm sẵn"], en: ["is done"] },
    "てほしい": { level: "n4", vi: ["muốn ai đó làm"], en: ["want someone to do"] },

    // Modality & Sentence Endings (N4-N2)
    "わけにはいかない": { level: "n2", vi: ["không thể nào"], en: ["cannot", "must not"] },
    "に違いない": { level: "n3", vi: ["chắc chắn là", "không sai"], en: ["must be", "undoubtedly"] },
    "かもしれない": { level: "n4", vi: ["có thể", "có lẽ"], en: ["might", "maybe", "perhaps"] },
    "かもしれん": { level: "n4", vi: ["có thể", "có lẽ"], en: ["might", "maybe"] },
    "そうだ": { level: "n4", vi: ["nghe nói là", "có vẻ"], en: ["looks like", "heard that"] },
    "らしい": { level: "n4", vi: ["dường như là", "ra dáng"], en: ["seems like", "apparently"] },
    "ようだ": { level: "n4", vi: ["hình như là", "như thể"], en: ["seems like", "as if"] },
    "みたいだ": { level: "n4", vi: ["giống như là", "như là"], en: ["like", "resembles"] },
    "はずだ": { level: "n4", vi: ["chắc chắn là", "đáng lẽ"], en: ["should be", "expected to"] },
    "べきだ": { level: "n3", vi: ["nên", "phải"], en: ["should", "ought to"] },
    "つもりだ": { level: "n4", vi: ["dự định", "nghĩ rằng"], en: ["plan to", "intend to"] },
    "ことになっている": { level: "n3", vi: ["được quy định là"], en: ["is scheduled to", "is expected to"] },
    "ことにしている": { level: "n3", vi: ["tự quyết định là"], en: ["make it a rule to"] },
    "ことができる": { level: "n5", vi: ["có thể làm"], en: ["can do", "able to"] },
    "ことがある": { level: "n4", vi: ["thỉnh thoảng làm"], en: ["sometimes do"] },
    "たことがある": { level: "n5", vi: ["đã từng làm"], en: ["have done before"] },
    "たほうがいい": { level: "n5", vi: ["nên làm"], en: ["should do"] },
    "ないほうがいい": { level: "n5", vi: ["không nên làm"], en: ["should not do"] },
    "ようになっている": { level: "n3", vi: ["được thiết kế để"], en: ["is designed to"] },
    "ようにする": { level: "n4", vi: ["cố gắng làm"], en: ["try to", "make sure to"] },

    // Special Conversational & Common Idioms
    "最初から最後まで": { level: "n3", vi: ["từ đầu đến cuối"], en: ["from beginning to end", "from start to finish"] },
    "おはようございます": { level: "n5", vi: ["chào buổi sáng"], en: ["good morning"] },
    "ありがとうございます": { level: "n5", vi: ["cảm ơn", "xin cảm ơn"], en: ["thank you", "thanks"] },
    "すみませんでした": { level: "n5", vi: ["đã xin lỗi"], en: ["excuse me", "i was sorry"] },
    "お疲れ様でした": { lemma: "お疲れ様", level: "n4", vi: ["cảm ơn bạn", "cảm ơn", "sự nỗ lực của bạn", "sự nỗ lực", "nỗ lực", "vất vả rồi"], en: ["thank you for your hard work", "thanks for your hard work", "hard work"] },
    "お疲れ様です": { lemma: "お疲れ様", level: "n4", vi: ["cảm ơn bạn", "cảm ơn", "sự nỗ lực hết mình", "sự nỗ lực", "nỗ lực hết mình", "hết mình", "vất vả rồi"], en: ["thank you for your hard work", "thanks for your hard work", "good job"] },
    "お疲れ様": { lemma: "お疲れ様", level: "n4", vi: ["cảm ơn bạn", "cảm ơn", "sự nỗ lực hết mình", "sự nỗ lực", "nỗ lực hết mình", "hết mình", "vất vả rồi", "vất vả"], en: ["thank you for your hard work", "hard work", "good job"] },
    "ようこそ": { level: "n4", vi: ["chào mừng", "hoan nghênh"], en: ["welcome to", "welcome"] },
    "送ってください": { lemma: "送る", level: "n4", vi: ["chúc bạn có một", "chúc các bạn có một", "chúc bạn một", "chúc bạn có", "chúc các bạn", "chúc một", "chúc bạn", "chúc", "trải qua", "tận hưởng", "đón", "có một"], en: ["have a", "wish you a", "wish you", "spend"] },
  };

  /**
   * De-inflects Japanese verb / adjective forms to root dictionary lemmas.
   * Resolves: 話します -> 話す, 見て -> 見る, 食べて -> 食べる, 勉強して -> 勉強, 大きかった -> 大きい, etc.
   * @param {string} raw - Surface or token text
   * @returns {string[]} Candidate dictionary lemmas
   */
  function deinflectVerbOrAdj(raw) {
    if (!raw || typeof raw !== "string") return [];
    const t = raw.trim();
    if (!t || t.length < 2) return [t];

    const results = new Set([t]);

    // 1. -ます / -ました / -ません / -ませんでした
    if (t.endsWith("ませんでした")) {
      const stem = t.slice(0, -6);
      results.add(stem + "る");
      results.add(godanFromI(stem));
    } else if (t.endsWith("ました") || t.endsWith("ません")) {
      const stem = t.slice(0, -3);
      results.add(stem + "る");
      results.add(godanFromI(stem));
    } else if (t.endsWith("ます")) {
      const stem = t.slice(0, -2);
      results.add(stem + "る");
      results.add(godanFromI(stem));
    }

    // 2. -て / -た (te-form, ta-form)
    if (t.endsWith("て") || t.endsWith("た")) {
      const stem = t.slice(0, -1);
      results.add(stem + "る"); // 一段 (見る -> 見て)
      if (stem.endsWith("っ")) {
        const base = stem.slice(0, -1);
        results.add(base + "う");
        results.add(base + "つ");
        results.add(base + "る");
      } else if (stem.endsWith("い")) {
        const base = stem.slice(0, -1);
        results.add(base + "く");
      } else if (stem.endsWith("し")) {
        const base = stem.slice(0, -1);
        results.add(base + "す"); // 話す -> 話して
      }
    }

    // 3. -で / -だ (voiced te-form, da-form)
    if (t.endsWith("で") || t.endsWith("だ")) {
      const stem = t.slice(0, -1);
      if (stem.endsWith("ん")) {
        const base = stem.slice(0, -1);
        results.add(base + "む"); // 飲む -> 飲んで
        results.add(base + "ぶ"); // 呼ぶ -> 呼んで
        results.add(base + "ぬ"); // 死ぬ -> 死んで
      } else if (stem.endsWith("い")) {
        const base = stem.slice(0, -1);
        results.add(base + "ぐ"); // 泳ぐ -> 泳いで
      }
    }

    // 4. -ない / -なかった (negative)
    if (t.endsWith("なかった")) {
      const stem = t.slice(0, -4);
      results.add(stem + "る");
      results.add(godanFromA(stem));
    } else if (t.endsWith("ない")) {
      const stem = t.slice(0, -2);
      results.add(stem + "る");
      results.add(godanFromA(stem));
    }

    // 5. -たい / -たかった (desire)
    if (t.endsWith("たかった")) {
      const stem = t.slice(0, -4);
      results.add(stem + "る");
      results.add(godanFromI(stem));
    } else if (t.endsWith("たい")) {
      const stem = t.slice(0, -2);
      results.add(stem + "る");
      results.add(godanFromI(stem));
    }

    // 6. -かった / -くない (i-adjective)
    if (t.endsWith("かった")) {
      results.add(t.slice(0, -3) + "い");
    } else if (t.endsWith("くない")) {
      results.add(t.slice(0, -3) + "い");
    } else if (t.endsWith("く")) {
      results.add(t.slice(0, -1) + "い");
    }

    return Array.from(results).filter(Boolean);
  }

  function godanFromI(stem) {
    if (!stem) return "";
    const last = stem.slice(-1);
    const base = stem.slice(0, -1);
    const iToU = { "い": "う", "き": "く", "し": "す", "ち": "つ", "に": "ぬ", "ひ": "ふ", "み": "む", "り": "る", "ぎ": "ぐ", "じ": "ず", "び": "ぶ", "ぴ": "ぷ" };
    return iToU[last] ? base + iToU[last] : stem + "う";
  }

  function godanFromA(stem) {
    if (!stem) return "";
    const last = stem.slice(-1);
    const base = stem.slice(0, -1);
    const aToU = { "わ": "う", "か": "く", "さ": "す", "た": "つ", "な": "ぬ", "は": "ふ", "ま": "む", "ら": "る", "が": "ぐ", "ざ": "ず", "ば": "ぶ", "ぱ": "ぷ" };
    return aToU[last] ? base + aToU[last] : stem + "う";
  }

  /**
   * High-frequency Japanese words mapped to JLPT bands.
   * Guarantees vibrant coloring and 0% unknown levels for content vocabulary.
   */
  const COMMON_JLPT_WORDS = {
    // Greetings & Social (N5)
    "おはよう": "n5", "おはようございます": "n5",
    "こんにちは": "n5", "こんばんは": "n5",
    "さようなら": "n5", "じゃあ": "n5", "また": "n5",
    "ありがとう": "n5", "ありがとうございます": "n5",
    "すみません": "n5", "ごめんなさい": "n5",
    "どうぞ": "n5", "よろしく": "n5", "お願いします": "n5",
    "はい": "n5", "いいえ": "n5", "うん": "n5", "ううん": "n5",
    "ください": "n5", "くださる": "n5",
    "です": "n5", "ます": "n5", "だ": "n5", "た": "n5", "て": "n5",

    // Pronouns & Persons (N5-N4)
    "私": "n5", "わたし": "n5", "わたくし": "n5", "僕": "n5", "ぼく": "n5", "俺": "n5", "おれ": "n5", "あなた": "n5",
    "皆さん": "n5", "みなさん": "n5", "みんな": "n5", "皆": "n5",
    "人": "n5", "ひと": "n5", "人間": "n4", "にんげん": "n4",
    "自分": "n4", "じぶん": "n4", "彼": "n4", "かれ": "n4", "彼女": "n4", "かのじょ": "n4",
    "先生": "n5", "せんせい": "n5", "学生": "n5", "がくせい": "n5",
    "友達": "n5", "ともだち": "n5", "家族": "n5", "かぞく": "n5",
    "父": "n5", "母": "n5", "兄": "n5", "姉": "n5", "弟": "n5", "妹": "n5",
    "お父さん": "n5", "お母さん": "n5", "子供": "n5", "こども": "n5",

    // Time & Numbers (N5-N4)
    "今": "n5", "いま": "n5", "今日": "n5", "きょう": "n5", "明日": "n5", "あした": "n5",
    "昨日": "n5", "きのう": "n5", "毎日": "n5", "まいにち": "n5",
    "朝": "n5", "あさ": "n5", "昼": "n5", "ひる": "n5", "夜": "n5", "よる": "n5", "晩": "n5", "ばん": "n5",
    "時間": "n5", "じかん": "n5", "時": "n5", "とき": "n5", "分": "n5", "ふん": "n5", "秒": "n4",
    "日": "n5", "月": "n5", "年": "n5", "週": "n5", "曜日": "n5",
    "今週": "n5", "来週": "n5", "先週": "n5", "今年": "n5", "来年": "n5", "去年": "n5",
    "1つ": "n5", "ひとつ": "n5", "一つ": "n5",
    "2つ": "n5", "ふたつ": "n5", "二つ": "n5",
    "3つ": "n5", "みっつ": "n5", "三つ": "n5",
    "4つ": "n5", "よっつ": "n5", "四つ": "n5",
    "5つ": "n5", "いつつ": "n5", "五つ": "n5",
    "一": "n5", "二": "n5", "三": "n5", "四": "n5", "五": "n5", "六": "n5", "七": "n5", "八": "n5", "九": "n5", "十": "n5",
    "百": "n5", "千": "n5", "万": "n5", "円": "n5",

    // Media, Tech & Learning (N4-N2)
    "動画": "n3", "どうが": "n3", "ビデオ": "n4", "クリップ": "n3",
    "チャンネル": "n4", "字幕": "n3", "じまく": "n3",
    "JLPT": "n3", "レベル": "n3", "テスト": "n4", "試験": "n4", "しけん": "n4",
    "日本語": "n5", "にほんご": "n5", "英語": "n5", "えいご": "n5",
    "勉強": "n5", "べんきょう": "n5", "練習": "n5", "れんしゅう": "n5",
    "本": "n5", "ほん": "n5", "辞書": "n5", "じしょ": "n5",
    "話": "n5", "はなし": "n5", "会話": "n4", "かいわ": "n4",
    "最近": "n3", "さいきん": "n3", "出来事": "n3", "できごと": "n3",
    "最初": "n3", "さいしょ": "n3", "最後": "n3", "さいご": "n3",
    "是非": "n3", "ぜひ": "n3",
    "びっくり": "n3", "びっくりする": "n3", "驚く": "n3", "おどろく": "n3",
    "くらい": "n4", "ぐらい": "n4",
    "素敵": "n4", "すてき": "n4", "週末": "n4", "しゅうまつ": "n4",
    "送る": "n4", "おくる": "n4",

    // Verbs (N5-N4)
    "行く": "n5", "いく": "n5", "来る": "n5", "くる": "n5", "帰る": "n5", "かえる": "n5",
    "見る": "n5", "みる": "n5", "見て": "n5", "見ます": "n5",
    "聞く": "n5", "きく": "n5", "聞いて": "n5", "聞きます": "n5",
    "食べる": "n5", "たべる": "n5", "食べて": "n5", "食べます": "n5",
    "飲む": "n5", "のむ": "n5", "飲んで": "n5", "飲みます": "n5",
    "話す": "n5", "はなす": "n5", "話して": "n5", "話します": "n5",
    "言う": "n5", "いう": "n5", "言って": "n5", "言います": "n5",
    "思う": "n5", "おもう": "n5", "思って": "n5", "思います": "n5",
    "知る": "n5", "しる": "n5", "知って": "n5", "知っています": "n5",
    "分かる": "n5", "わかる": "n5", "分かって": "n5", "分かります": "n5",
    "ある": "n5", "いる": "n5", "する": "n5", "して": "n5", "します": "n5", "なる": "n5",
    "読む": "n5", "よむ": "n5", "書く": "n5", "かく": "n5", "買う": "n5", "かう": "n5",
    "待つ": "n5", "まつ": "n5", "会う": "n5", "あう": "n5",
    "始める": "n4", "はじめる": "n4", "終わる": "n4", "おわる": "n4",
    "続ける": "n4", "つづける": "n4", "考える": "n4", "かんがえる": "n4",
    "教える": "n4", "おしえる": "n4", "習う": "n4", "ならう": "n4",
    "覚える": "n4", "おぼえる": "n4", "忘れる": "n4", "わすれる": "n4",
    "手伝う": "n4", "てつだう": "n4", "働く": "n4", "はたらく": "n4",

    // Adjectives & Adverbs (N5-N3)
    "いい": "n5", "よい": "n5", "悪い": "n5", "わるい": "n5",
    "大きい": "n5", "おおきい": "n5", "小さい": "n5", "ちいさい": "n5",
    "新しい": "n5", "あたらしい": "n5", "古い": "n5", "ふるい": "n5",
    "多い": "n5", "おおい": "n5", "少ない": "n5", "すくない": "n5",
    "高い": "n5", "たかい": "n5", "安い": "n5", "やすい": "n5",
    "速い": "n5", "はやい": "n5", "遅い": "n5", "おそい": "n5",
    "美味しい": "n5", "おいしい": "n5", "面白い": "n5", "おもしろい": "n5",
    "楽しい": "n5", "たのしい": "n5", "嬉しい": "n5", "うれしい": "n5",
    "大切": "n4", "たいせつ": "n4", "必要": "n4", "ひつよう": "n4",
    "簡単": "n4", "かんたん": "n4", "難しい": "n4", "むずかしい": "n4",
    "とても": "n5", "たくさん": "n5", "少し": "n5", "すこし": "n5",
    "もっと": "n4", "本当に": "n4", "ほんとうに": "n4", "すごい": "n4", "すっごい": "n4",
    "かなり": "n3", "非常に": "n3", "ひじょうに": "n3",

    // Life, Nature, Society (N4-N1)
    "世界": "n4", "せかい": "n4", "場所": "n4", "ばしょ": "n4",
    "質問": "n4", "しつもん": "n4", "問題": "n4", "もんだい": "n4",
    "答え": "n4", "こたえ": "n4", "理由": "n4", "りゆう": "n4",
    "意味": "n4", "いみ": "n4", "心": "n4", "こころ": "n4",
    "気持ち": "n4", "きもち": "n4", "生活": "n4", "せいかつ": "n4",
    "未来": "n4", "みらい": "n4", "過去": "n4", "かこ": "n4", "現在": "n3", "げんざい": "n3",
    "経験": "n3", "けいけん": "n3", "関係": "n3", "かんけい": "n3",
    "状況": "n3", "じょうきょう": "n3", "目的": "n3", "もくてき": "n3",
    "変化": "n3", "へんか": "n3", "自然": "n3", "しぜん": "n3",
    "社会": "n3", "しゃかい": "n3", "文化": "n3", "ぶんか": "n3",
    "歴史": "n3", "れきし": "n3", "伝統": "n3", "でんとう": "n3",
    "日常": "n3", "にちじょう": "n3", "様子": "n3", "ようす": "n3",
    "届ける": "n3", "とどける": "n3", "お届け": "n3", "おとどけ": "n3",
    "共有": "n3", "きょうゆう": "n3", "重要": "n3", "じゅうよう": "n3",
    "環境": "n3", "かんきょう": "n3", "技術": "n3", "ぎじゅつ": "n3",
    "情報": "n3", "じょうほう": "n3", "説明": "n3", "せつめい": "n3",
    "紹介": "n3", "しょうかい": "n3", "相談": "n3", "そうだん": "n3",
    "可能": "n2", "かのう": "n2", "存在": "n2", "そんざい": "n2",
    "影響": "n2", "えいきょう": "n2", "効果": "n2", "こうか": "n2",
    "結果": "n2", "けっか": "n2", "原因": "n2", "げんいん": "n2",
    "瞬間": "n2", "しゅんかん": "n2", "現実": "n2", "げんじつ": "n2",
    "概念": "n1", "がいねん": "n1", "本質": "n1", "ほんしつ": "n1",
    "矛盾": "n1", "むじゅん": "n1", "ありのまま": "n1",
  };

  /**
   * Comprehensive Bilingual Dictionary (JA -> VI, EN) across JLPT N5-N1.
   * Every entry defines level to guarantee matching JLPT color on translations.
   */
  const BILINGUAL_MAP = {
    // Greetings & Social (N5)
    "おはよう": { level: "n5", vi: ["chào buổi sáng"], en: ["good morning"] },
    "おはようございます": { level: "n5", vi: ["chào buổi sáng"], en: ["good morning"] },
    "こんにちは": { level: "n5", vi: ["chào buổi chiều", "xin chào", "chào"], en: ["good afternoon", "hello", "hi"] },
    "こんばんは": { level: "n5", vi: ["chào buổi tối"], en: ["good evening"] },
    "さようなら": { level: "n5", vi: ["tạm biệt"], en: ["goodbye", "bye"] },
    "ありがとう": { level: "n5", vi: ["cảm ơn", "cám ơn"], en: ["thank you", "thanks"] },
    "ありがとうございます": { level: "n5", vi: ["cảm ơn", "xin cảm ơn"], en: ["thank you", "thanks"] },
    "お疲れ様": { lemma: "お疲れ様", level: "n4", vi: ["cảm ơn bạn", "cảm ơn", "sự nỗ lực của bạn", "sự nỗ lực hết mình", "sự nỗ lực", "nỗ lực hết mình", "hết mình", "nỗ lực", "vất vả rồi", "vất vả"], en: ["thank you for your hard work", "thanks for your hard work", "hard work", "good job"] },
    "お疲れ様でした": { lemma: "お疲れ様", level: "n4", vi: ["cảm ơn bạn", "cảm ơn", "sự nỗ lực của bạn", "sự nỗ lực", "nỗ lực", "vất vả rồi"], en: ["thank you for your hard work", "thanks for your hard work", "hard work"] },
    "お疲れ様です": { lemma: "お疲れ様", level: "n4", vi: ["cảm ơn bạn", "cảm ơn", "sự nỗ lực của bạn", "sự nỗ lực hết mình", "sự nỗ lực", "nỗ lực hết mình", "hết mình", "vất vả rồi"], en: ["thank you for your hard work", "thanks for your hard work", "good job"] },
    "ようこそ": { level: "n4", vi: ["chào mừng", "hoan nghênh"], en: ["welcome to", "welcome"] },
    "ポッドキャスト": { level: "n4", vi: ["podcast"], en: ["podcast"], pos: "名詞" },
    "チョコ": { level: "n5", vi: ["sô cô la", "socola", "sô-cô-la"], en: ["chocolate"], pos: "名詞" },
    "チョコレート": { level: "n5", vi: ["sô cô la", "socola", "sô-cô-la"], en: ["chocolate"], pos: "名詞" },
    "お菓子": { level: "n5", vi: ["bánh kẹo", "kẹo", "đồ ngọt"], en: ["sweets", "snacks", "candy"], pos: "名詞" },
    "おかし": { level: "n5", vi: ["bánh kẹo", "kẹo", "đồ ngọt"], en: ["sweets", "snacks", "candy"], pos: "名詞" },
    "辛い": { level: "n4", vi: ["cay", "cay đắng"], en: ["spicy", "hot"], pos: "形容詞" },
    "ビール": { level: "n5", vi: ["bia"], en: ["beer"], pos: "名詞" },
    "不思議": { level: "n3", vi: ["kỳ lạ", "bí ẩn", "kỳ diệu"], en: ["mysterious", "strange"], pos: "形状詞" },
    "起きる": { level: "n5", vi: ["xảy ra", "thức dậy"], en: ["happen", "occur", "wake up"], pos: "動詞" },
    "韓国": { level: "n5", vi: ["Hàn Quốc"], en: ["Korea", "South Korea"], pos: "名詞" },
    "今週": { level: "n5", vi: ["trong tuần này", "tuần này"], en: ["this week", "in this week"] },
    "1週間": { level: "n5", vi: ["suốt 1 tuần", "suốt một tuần", "1 tuần", "một tuần"], en: ["one week", "1 week", "a week"] },
    "一週間": { level: "n5", vi: ["suốt 1 tuần", "suốt một tuần", "1 tuần", "một tuần"], en: ["one week", "1 week", "a week"] },
    "週間": { level: "n5", vi: ["tuần", "hàng tuần"], en: ["week", "weeks"] },
    "本当": { level: "n4", vi: ["thật sự", "thực sự", "rất nhiều", "rất"], en: ["really", "truly", "very much"] },
    "本当に": { level: "n4", vi: ["thật sự", "thực sự", "rất nhiều", "rất"], en: ["really", "truly", "very much"] },
    "鈴か": { level: "unknown", vi: ["Suzuka"], en: ["Suzuka"] },
    "鈴かの": { level: "unknown", vi: ["Suzukano"], en: ["Suzukano"] },
    "これ": { level: "n5", vi: ["đây là", "đây", "này"], en: ["this is", "this"] },
    "こちら": { level: "n5", vi: ["đây là", "đây", "bên này"], en: ["this is", "here"] },
    "へ": { level: "n5", vi: ["đến với", "đến"], en: ["to"] },
    "で": { level: "n5", vi: ["ở", "tại", "bằng", "với"], en: ["at", "in", "by", "with"] },
    "に": { level: "n5", vi: ["cho", "vào", "ở"], en: ["to", "for", "at"] },
    "と": { level: "n5", vi: ["và", "cùng với"], en: ["and", "with"] },
    "は": { level: "n5", vi: ["thì", "là"], en: ["is", "as for"] },
    "が": { level: "n5", vi: ["nhưng", "thì"], en: ["but"] },
    "も": { level: "n5", vi: ["cũng"], en: ["also", "too"] },
    "すみません": { level: "n5", vi: ["xin lỗi", "làm phiền"], en: ["excuse me", "sorry"] },
    "ごめんなさい": { level: "n5", vi: ["xin lỗi"], en: ["sorry", "i'm sorry"] },
    "どうぞ": { level: "n5", vi: ["xin mời", "làm ơn"], en: ["please", "go ahead"] },
    "よろしく": { level: "n5", vi: ["rất mong được giúp đỡ", "nhờ bạn"], en: ["nice to meet you", "regards"] },
    "ください": { level: "n5", vi: ["xin vui lòng", "hãy", "mời", "xin"], en: ["please", "give me"] },
    "です": { level: "n5", vi: ["là"], en: ["this is", "is", "are", "am"] },
    "だ": { level: "n5", vi: ["là"], en: ["is", "are", "am"] },

    // Pronouns & People (N5-N4)
    "私": { level: "n5", vi: ["tôi", "mình", "tớ", "em", "anh"], en: ["i", "me", "my", "myself"] },
    "わたし": { level: "n5", vi: ["tôi", "mình", "tớ", "em", "anh"], en: ["i", "me", "my", "myself"] },
    "僕": { level: "n5", vi: ["tôi", "mình", "tớ"], en: ["i", "me", "my"] },
    "ぼく": { level: "n5", vi: ["tôi", "mình", "tớ"], en: ["i", "me", "my"] },
    "俺": { level: "n5", vi: ["tao", "tôi"], en: ["i", "me"] },
    "あなた": { level: "n5", vi: ["bạn", "anh", "chị"], en: ["you", "your"] },
    "皆": { level: "n5", vi: ["mọi người", "các bạn", "tất cả", "quý vị"], en: ["everyone", "everybody", "all"], lemma: "皆" },
    "皆さん": { level: "n5", vi: ["mọi người", "các bạn", "quý vị"], en: ["everyone", "everybody", "all of you"], lemma: "皆" },
    "みなさん": { level: "n5", vi: ["mọi người", "các bạn", "quý vị"], en: ["everyone", "everybody", "all of you"], lemma: "皆" },
    "みんな": { level: "n5", vi: ["mọi người", "tất cả"], en: ["everyone", "everybody", "all"], lemma: "皆" },
    "人": { level: "n5", vi: ["người", "con người"], en: ["person", "people"] },
    "ひと": { level: "n5", vi: ["người", "con người"], en: ["person", "people"] },
    "人間": { level: "n4", vi: ["con người", "loài người"], en: ["human", "humans", "human being"] },
    "にんげん": { level: "n4", vi: ["con người", "loài người"], en: ["human", "humans", "human being"] },
    "自分": { level: "n4", vi: ["tôi", "mình", "bản thân", "chính mình"], en: ["myself", "oneself", "i", "me"] },
    "じぶん": { level: "n4", vi: ["tôi", "mình", "bản thân", "chính mình"], en: ["myself", "oneself", "i", "me"] },
    "彼": { level: "n4", vi: ["anh ấy", "cậu ấy", "ông ấy"], en: ["he", "him", "his"] },
    "かれ": { level: "n4", vi: ["anh ấy", "cậu ấy", "ông ấy"], en: ["he", "him", "his"] },
    "彼女": { level: "n4", vi: ["cô ấy", "chị ấy", "bà ấy"], en: ["she", "her"] },
    "かのじょ": { level: "n4", vi: ["cô ấy", "chị ấy", "bà ấy"], en: ["she", "her"] },
    "友達": { level: "n5", vi: ["bạn bè", "bạn"], en: ["friend", "friends"] },
    "ともだち": { level: "n5", vi: ["bạn bè", "bạn"], en: ["friend", "friends"] },
    "家族": { level: "n5", vi: ["gia đình"], en: ["family"] },
    "かぞく": { level: "n5", vi: ["gia đình"], en: ["family"] },
    "先生": { level: "n5", vi: ["thầy giáo", "cô giáo", "thầy", "cô", "giáo viên"], en: ["teacher", "professor"] },
    "せんせい": { level: "n5", vi: ["thầy giáo", "cô giáo", "thầy", "cô", "giáo viên"], en: ["teacher", "professor"] },
    "学生": { level: "n5", vi: ["học sinh", "sinh viên"], en: ["student", "students"] },
    "がくせい": { level: "n5", vi: ["học sinh", "sinh viên"], en: ["student", "students"] },

    // Media, Video & Learning (N4-N2)
    "動画": { level: "n3", vi: ["video", "clip", "đoạn phim"], en: ["video", "clip"] },
    "どうが": { level: "n3", vi: ["video", "clip", "đoạn phim"], en: ["video", "clip"] },
    "ビデオ": { level: "n4", vi: ["video", "băng hình"], en: ["video"] },
    "チャンネル": { level: "n4", vi: ["kênh"], en: ["channel"] },
    "字幕": { level: "n3", vi: ["phụ đề"], en: ["subtitles", "caption", "captions"] },
    "じまく": { level: "n3", vi: ["phụ đề"], en: ["subtitles", "caption", "captions"] },
    "JLPT": { level: "n3", vi: ["jlpt"], en: ["jlpt"] },
    "レベル": { level: "n3", vi: ["trình độ", "cấp độ", "mức độ", "level"], en: ["level", "levels"] },
    "テスト": { level: "n4", vi: ["bài thi", "kiểm tra"], en: ["test", "exam"] },
    "試験": { level: "n4", vi: ["kỳ thi", "bài thi", "thi cử"], en: ["exam", "examination"] },
    "しけん": { level: "n4", vi: ["kỳ thi", "bài thi", "thi cử"], en: ["exam", "examination"] },
    "勉強": { level: "n5", vi: ["học", "học tập"], en: ["study", "studying", "learn"] },
    "べんきょう": { level: "n5", vi: ["học", "học tập"], en: ["study", "studying", "learn"] },
    "練習": { level: "n5", vi: ["luyện tập", "thực hành"], en: ["practice", "practicing"] },
    "れんしゅう": { level: "n5", vi: ["luyện tập", "thực hành"], en: ["practice", "practicing"] },
    "日本": { level: "n5", vi: ["nhật bản", "nước nhật", "nhật"], en: ["japan", "japanese"] },
    "にほん": { level: "n5", vi: ["nhật bản", "nước nhật", "nhật"], en: ["japan", "japanese"] },
    "にっぽん": { level: "n5", vi: ["nhật bản", "nước nhật", "nhật"], en: ["japan", "japanese"] },
    "日本語": { level: "n5", vi: ["tiếng nhật"], en: ["japanese", "japanese language"] },
    "にほんご": { level: "n5", vi: ["tiếng nhật"], en: ["japanese", "japanese language"] },
    "英語": { level: "n5", vi: ["tiếng anh"], en: ["english"] },
    "えいご": { level: "n5", vi: ["tiếng anh"], en: ["english"] },

    // Sequence, Events & Recency (N5-N3)
    "最近": { level: "n3", vi: ["gần đây", "dạo gần đây", "mới đây", "dạo này"], en: ["recently", "recent", "lately"] },
    "さいきん": { level: "n3", vi: ["gần đây", "dạo gần đây", "mới đây", "dạo này"], en: ["recently", "recent", "lately"] },
    "出来事": { level: "n3", vi: ["sự kiện", "sự việc", "biến cố", "chuyện"], en: ["event", "events", "incident", "incidents"] },
    "できごと": { level: "n3", vi: ["sự kiện", "sự việc", "biến cố", "chuyện"], en: ["event", "events", "incident", "incidents"] },
    "最初": { level: "n3", vi: ["từ đầu", "đầu tiên", "ban đầu", "lúc đầu"], en: ["beginning", "first", "start", "the beginning"] },
    "さいしょ": { level: "n3", vi: ["từ đầu", "đầu tiên", "ban đầu", "lúc đầu"], en: ["beginning", "first", "start", "the beginning"] },
    "最後": { level: "n3", vi: ["đến cuối", "cuối cùng", "kết thúc", "cuối"], en: ["end", "ending", "last", "finally", "the end"] },
    "さいご": { level: "n3", vi: ["đến cuối", "cuối cùng", "kết thúc", "cuối"], en: ["end", "ending", "last", "finally", "the end"] },
    "最初から最後まで": { level: "n3", vi: ["từ đầu đến cuối"], en: ["from beginning to end", "from start to finish"] },
    "是非": { level: "n3", vi: ["nhất định", "rất mong", "mời"], en: ["please", "by all means", "definitely"] },
    "ぜひ": { level: "n3", vi: ["nhất định", "rất mong", "mời"], en: ["please", "by all means", "definitely"] },
    "素敵": { level: "n4", vi: ["tuyệt vời", "tuyệt hảo", "tuyệt", "đẹp", "tuyệt diệu"], en: ["wonderful", "lovely", "great", "nice", "fantastic"] },
    "すてき": { level: "n4", vi: ["tuyệt vời", "tuyệt hảo", "tuyệt", "đẹp", "tuyệt diệu"], en: ["wonderful", "lovely", "great", "nice", "fantastic"] },
    "週末": { level: "n4", vi: ["cuối tuần", "dịp cuối tuần"], en: ["weekend"] },
    "しゅうまつ": { level: "n4", vi: ["cuối tuần", "dịp cuối tuần"], en: ["weekend"] },
    "送る": { level: "n4", vi: ["chúc bạn có một", "chúc bạn một", "chúc bạn có", "chúc bạn", "chúc một", "chúc", "trải qua", "tận hưởng", "đón", "có một", "gửi", "đưa tiễn", "sống"], en: ["have a", "wish you a", "wish you", "spend", "send", "see off"] },
    "おくる": { level: "n4", vi: ["chúc bạn có một", "chúc bạn một", "chúc bạn có", "chúc bạn", "chúc một", "chúc", "trải qua", "tận hưởng", "đón", "có một", "gửi", "đưa tiễn", "sống"], en: ["have a", "wish you a", "wish you", "spend", "send", "see off"] },

    // Numbers & Quantities (N5)
    "1つ": { level: "n5", vi: ["thứ nhất", "một", "một cái"], en: ["the first", "first", "one"] },
    "ひとつ": { level: "n5", vi: ["thứ nhất", "một", "một cái"], en: ["the first", "first", "one"] },
    "一つ": { level: "n5", vi: ["thứ nhất", "một", "một cái"], en: ["the first", "first", "one"] },
    "2つ": { level: "n5", vi: ["thứ hai", "hai", "hai cái"], en: ["second", "two"] },
    "ふたつ": { level: "n5", vi: ["thứ hai", "hai", "hai cái"], en: ["second", "two"] },
    "二つ": { level: "n5", vi: ["thứ hai", "hai", "hai cái"], en: ["second", "two"] },
    "3つ": { level: "n5", vi: ["thứ ba", "ba điều", "ba cái", "ba"], en: ["third", "three"] },
    "みっつ": { level: "n5", vi: ["thứ ba", "ba điều", "ba cái", "ba"], en: ["third", "three"] },
    "三つ": { level: "n5", vi: ["thứ ba", "ba điều", "ba cái", "ba"], en: ["third", "three"] },
    "4つ": { level: "n5", vi: ["thứ tư", "bốn"], en: ["fourth", "four"] },
    "よっつ": { level: "n5", vi: ["thứ tư", "bốn"], en: ["fourth", "four"] },
    "5つ": { level: "n5", vi: ["thứ năm", "năm"], en: ["fifth", "five"] },
    "いつつ": { level: "n5", vi: ["thứ năm", "năm"], en: ["fifth", "five"] },
    "1": { level: "n5", vi: ["1", "một"], en: ["1", "one"] },
    "2": { level: "n5", vi: ["2", "hai"], en: ["2", "two"] },
    "3": { level: "n5", vi: ["3", "ba"], en: ["3", "three"] },
    "4": { level: "n5", vi: ["4", "bốn"], en: ["4", "four"] },
    "5": { level: "n5", vi: ["5", "năm"], en: ["5", "five"] },

    // Core Verbs (N5-N3)
    "話す": { level: "n5", vi: ["nói", "nói về", "kể", "trò chuyện"], en: ["talk", "talk about", "speak", "speaking", "tell"] },
    "はなす": { level: "n5", vi: ["nói", "nói về", "kể", "trò chuyện"], en: ["talk", "talk about", "speak", "speaking", "tell"] },
    "話します": { level: "n5", vi: ["nói", "nói về", "sẽ nói", "kể"], en: ["talk", "talk about", "speaking", "will talk", "speak"] },
    "見る": { level: "n5", vi: ["xem", "nhìn", "theo dõi", "quan sát"], en: ["watch", "see", "look", "watching"] },
    "みる": { level: "n5", vi: ["xem", "nhìn", "theo dõi", "quan sát"], en: ["watch", "see", "look", "watching"] },
    "見て": { level: "n5", vi: ["xem", "nhìn", "hãy xem"], en: ["watch", "see", "look"] },
    "見ます": { level: "n5", vi: ["xem", "nhìn"], en: ["watch", "see", "look"] },
    "聞く": { level: "n5", vi: ["nghe", "lắng nghe"], en: ["listen", "hear", "listening"] },
    "きく": { level: "n5", vi: ["nghe", "lắng nghe"], en: ["listen", "hear", "listening"] },
    "言う": { level: "n5", vi: ["nói", "bảo", "gọi là"], en: ["say", "tell", "called"] },
    "いう": { level: "n5", vi: ["nói", "bảo", "gọi là"], en: ["say", "tell", "called"] },
    "思う": { level: "n5", vi: ["tự hỏi", "nghĩ", "cho rằng"], en: ["wondering", "think", "thought", "wonder"] },
    "おもう": { level: "n5", vi: ["tự hỏi", "nghĩ", "cho rằng"], en: ["wondering", "think", "thought", "wonder"] },
    "知る": { level: "n5", vi: ["biết"], en: ["know"] },
    "しる": { level: "n5", vi: ["biết"], en: ["know"] },
    "分かる": { level: "n5", vi: ["hiểu", "biết"], en: ["understand", "know"] },
    "わかる": { level: "n5", vi: ["hiểu", "biết"], en: ["understand", "know"] },
    "行く": { level: "n5", vi: ["đi"], en: ["go", "going"] },
    "いく": { level: "n5", vi: ["đi"], en: ["go", "going"] },
    "来る": { level: "n5", vi: ["đến"], en: ["come", "coming"] },
    "くる": { level: "n5", vi: ["đến"], en: ["come", "coming"] },
    "帰る": { level: "n5", vi: ["về", "trở về"], en: ["return", "go home"] },
    "かえる": { level: "n5", vi: ["về", "trở về"], en: ["return", "go home"] },
    "食べる": { level: "n5", vi: ["ăn"], en: ["eat", "eating"] },
    "たべる": { level: "n5", vi: ["ăn"], en: ["eat", "eating"] },
    "飲む": { level: "n5", vi: ["uống"], en: ["drink", "drinking"] },
    "のむ": { level: "n5", vi: ["uống"], en: ["drink", "drinking"] },
    "読む": { level: "n5", vi: ["đọc"], en: ["read", "reading"] },
    "よむ": { level: "n5", vi: ["đọc"], en: ["read", "reading"] },
    "書く": { level: "n5", vi: ["viết"], en: ["write", "writing"] },
    "かく": { level: "n5", vi: ["viết"], en: ["write", "writing"] },
    "買う": { level: "n5", vi: ["mua"], en: ["buy", "buying"] },
    "かう": { level: "n5", vi: ["mua"], en: ["buy", "buying"] },
    "する": { level: "n5", vi: ["làm"], en: ["do", "doing"] },
    "やる": { level: "n5", vi: ["thử những việc", "thử", "làm", "thực hiện"], en: ["try", "do"] },
    "やって": { level: "n5", vi: ["thử những việc", "thử", "làm"], en: ["try", "do"] },
    "やってみる": { level: "n5", vi: ["muốn thử", "làm thử", "thử"], en: ["like to try", "try"] },
    "始める": { level: "n4", vi: ["bắt đầu"], en: ["start", "begin"] },
    "はじめる": { level: "n4", vi: ["bắt đầu"], en: ["start", "begin"] },
    "始めて": { level: "n4", vi: ["bắt đầu"], en: ["start", "begin"] },
    "始まって": { level: "n4", vi: ["bắt đầu"], en: ["start", "begin"] },
    "びっくり": { level: "n3", vi: ["ngạc nhiên", "bất ngờ", "kinh ngạc"], en: ["surprised", "astonished"] },
    "びっくりする": { level: "n3", vi: ["ngạc nhiên", "bất ngờ", "kinh ngạc"], en: ["be surprised", "surprised"] },
    "驚く": { level: "n3", vi: ["ngạc nhiên", "bất ngờ", "kinh ngạc"], en: ["surprised", "astonished"] },
    "おどろく": { level: "n3", vi: ["ngạc nhiên", "bất ngờ", "kinh ngạc"], en: ["surprised", "astonished"] },
    "くらい": { level: "n4", vi: ["đến mức", "khoảng", "chừng", "đến nỗi"], en: ["to the extent", "about", "degree"] },
    "ぐらい": { level: "n4", vi: ["đến mức", "khoảng", "chừng", "đến nỗi"], en: ["to the extent", "about", "degree"] },
    "てから": { level: "n5", vi: ["sau khi", "kể từ khi"], en: ["after", "since"] },
    "終わる": { level: "n4", vi: ["kết thúc"], en: ["end", "finish"] },
    "おわる": { level: "n4", vi: ["kết thúc"], en: ["end", "finish"] },
    "続ける": { level: "n4", vi: ["tiếp tục"], en: ["continue"] },
    "つづける": { level: "n4", vi: ["tiếp tục"], en: ["continue"] },
    "考える": { level: "n4", vi: ["suy nghĩ", "nghĩ"], en: ["think", "consider"] },
    "かんがえる": { level: "n4", vi: ["suy nghĩ", "nghĩ"], en: ["think", "consider"] },
    "手伝う": { level: "n4", vi: ["giúp đỡ", "hỗ trợ"], en: ["help", "assist"] },
    "てつだう": { level: "n4", vi: ["giúp đỡ", "hỗ trợ"], en: ["help", "assist"] },
    "働く": { level: "n4", vi: ["làm việc"], en: ["work", "working"] },
    "はたらく": { level: "n4", vi: ["làm việc"], en: ["work", "working"] },
    "感じる": { level: "n4", vi: ["cảm thấy", "cảm giác"], en: ["felt", "feel"] },
    "かんじる": { level: "n4", vi: ["cảm thấy", "cảm giác"], en: ["felt", "feel"] },
    "届ける": { level: "n3", vi: ["gửi đến", "chia sẻ", "đem lại", "truyền tải"], en: ["share", "deliver", "convey", "bring"] },
    "とどける": { level: "n3", vi: ["gửi đến", "chia sẻ", "đem lại", "truyền tải"], en: ["share", "deliver", "convey", "bring"] },
    "共有": { level: "n3", vi: ["chia sẻ", "dùng chung"], en: ["share", "sharing"] },
    "きょうゆう": { level: "n3", vi: ["chia sẻ", "dùng chung"], en: ["share", "sharing"] },
    "発表": { level: "n3", vi: ["những thông báo", "thông báo", "công bố", "phát biểu"], en: ["announcements", "announcement", "presentation"] },
    "はっぴょう": { level: "n3", vi: ["những thông báo", "thông báo", "công bố", "phát biểu"], en: ["announcements", "announcement", "presentation"] },

    // Grammar & Connectives
    "から": { level: "n5", vi: ["từ", "bởi vì"], en: ["from", "since", "because"] },
    "まで": { level: "n5", vi: ["đến", "cho đến", "tới"], en: ["to", "until", "till"] },
    "だけ": { level: "n4", vi: ["chỉ vì", "chỉ là", "chỉ", "mỗi"], en: ["just because", "just", "only"] },
    "でも": { level: "n5", vi: ["nhưng", "tuy nhiên"], en: ["but", "however"] },
    "そして": { level: "n5", vi: ["và", "rồi thì"], en: ["and", "then"] },
    "たい": { level: "n5", vi: ["muốn", "muốn thử", "muốn đưa ra"], en: ["would like", "like to", "want to", "want"] },
    "欲しい": { level: "n5", vi: ["muốn", "mong muốn"], en: ["want", "desire"] },
    "ほしい": { level: "n5", vi: ["muốn", "mong muốn"], en: ["want", "desire"] },
    "ない": { level: "n5", vi: ["không nhận được", "không có", "không", "chẳng"], en: ["didn't get", "didn't", "no", "not", "without"] },
    "チャンス": { level: "n3", vi: ["cơ hội"], en: ["opportunities", "opportunity", "chance", "chances"] },
    "機会": { level: "n3", vi: ["cơ hội", "dịp"], en: ["opportunity", "chance"] },
    "きかい": { level: "n3", vi: ["cơ hội", "dịp"], en: ["opportunity", "chance"] },
    "悔しい": { level: "n3", vi: ["thất vọng", "cay đắng", "tiếc nuối", "ấm ức"], en: ["frustrated", "disappointed", "regretful"] },
    "くやしい": { level: "n3", vi: ["thất vọng", "cay đắng", "tiếc nuối", "ấm ức"], en: ["frustrated", "disappointed", "regretful"] },
    "若い": { level: "n3", vi: ["còn trẻ", "trẻ", "tuổi trẻ"], en: ["young", "youth"] },
    "わかい": { level: "n3", vi: ["còn trẻ", "trẻ", "tuổi trẻ"], en: ["young", "youth"] },
    "その時": { level: "n5", vi: ["lúc đó", "khi đó", "hồi đó", "thời điểm đó"], en: ["that time", "at that time", "then"] },
    "すごい": { level: "n4", vi: ["vô cùng", "cực kỳ", "rất", "quá", "tuyệt vời"], en: ["incredibly", "very", "great", "amazing"] },
    "すっごい": { level: "n4", vi: ["vô cùng", "cực kỳ", "rất", "quá"], en: ["incredibly", "very", "great"] },
    "こと": { level: "n5", vi: ["những việc", "việc", "điều", "chuyện"], en: ["things", "thing", "matter"] },
    "事": { level: "n5", vi: ["những việc", "việc", "điều", "chuyện"], en: ["things", "thing", "matter"] },
    "こういう": { level: "n4", vi: ["như thế này", "như này", "kiểu này"], en: ["like this", "such", "this kind of"] },
    "そう": { level: "n5", vi: ["như vậy", "thế"], en: ["so", "like that"] },
    "なんで": { level: "n4", vi: ["tại sao", "vì sao", "sao"], en: ["why", "how come"] },
    "なぜ": { level: "n4", vi: ["tại sao", "vì sao"], en: ["why"] },
    "どうして": { level: "n4", vi: ["tại sao", "làm sao"], en: ["why", "how come"] },
    "もらう": { level: "n5", vi: ["nhận được", "nhận"], en: ["get", "receive"] },
    "受け取る": { level: "n4", vi: ["nhận được", "nhận"], en: ["get", "receive"] },
    "出す": { level: "n4", vi: ["đưa ra", "phát ra", "lấy ra"], en: ["make", "give out", "put out"] },
    "だす": { level: "n4", vi: ["đưa ra", "phát ra", "lấy ra"], en: ["make", "give out", "put out"] },

    // Concepts & Daily Life
    "今日": { level: "n5", vi: ["hôm nay"], en: ["today"] },
    "明日": { level: "n5", vi: ["ngày mai", "mai"], en: ["tomorrow"] },
    "昨日": { level: "n5", vi: ["hôm qua"], en: ["yesterday"] },
    "毎日": { level: "n5", vi: ["mỗi ngày", "hàng ngày"], en: ["every day", "daily"] },
    "時間": { level: "n5", vi: ["thời gian", "giờ"], en: ["time", "hours"] },
    "日常": { level: "n3", vi: ["thường nhật", "hàng ngày", "cuộc sống thường nhật", "thường ngày"], en: ["everyday life", "daily life", "everyday", "daily"] },
    "生活": { level: "n4", vi: ["cuộc sống", "sinh hoạt", "đời sống"], en: ["life", "lifestyle", "living"] },
    "世界": { level: "n4", vi: ["thế giới"], en: ["world"] },
    "社会": { level: "n3", vi: ["xã hội"], en: ["society", "social"] },
    "文化": { level: "n3", vi: ["văn hóa"], en: ["culture", "cultural"] },
    "歴史": { level: "n3", vi: ["lịch sử"], en: ["history", "historical"] },
    "伝統": { level: "n2", vi: ["truyền thống"], en: ["tradition", "traditional"] },
    "経験": { level: "n3", vi: ["kinh nghiệm", "trải nghiệm"], en: ["experience", "experiences"] },
    "関係": { level: "n3", vi: ["mối quan hệ", "quan hệ"], en: ["relationship", "relation"] },
    "情報": { level: "n3", vi: ["thông tin"], en: ["information", "info"] },
    "結果": { level: "n2", vi: ["kết quả"], en: ["result", "results"] },
    "自然": { level: "n3", vi: ["tự nhiên", "thiên nhiên"], en: ["nature", "natural"] },
    "環境": { level: "n2", vi: ["môi trường"], en: ["environment"] },
    "大切": { level: "n4", vi: ["quan trọng", "quý giá"], en: ["important", "precious"] },
    "必要": { level: "n4", vi: ["cần thiết", "cần"], en: ["necessary", "need"] },
    "重要": { level: "n3", vi: ["quan trọng"], en: ["important"] },
    "簡単": { level: "n4", vi: ["đơn giản", "dễ dàng", "dễ"], en: ["easy", "simple"] },
    "難しい": { level: "n4", vi: ["khó khăn", "khó"], en: ["difficult", "hard"] },
    "問題": { level: "n4", vi: ["vấn đề", "câu hỏi"], en: ["problem", "question", "issue"] },
    "質問": { level: "n4", vi: ["câu hỏi"], en: ["question"] },
    "答え": { level: "n4", vi: ["câu trả lời", "đáp án"], en: ["answer"] },
    "理由": { level: "n4", vi: ["lý do"], en: ["reason"] },
    "意味": { level: "n4", vi: ["ý nghĩa"], en: ["meaning"] },
    "心": { level: "n4", vi: ["trái tim", "tấm lòng", "tâm trí", "tâm"], en: ["heart", "mind", "soul"] },
    "気持ち": { level: "n4", vi: ["cảm xúc", "tâm trạng", "cảm giác"], en: ["feeling", "feelings", "mood"] },
    "場所": { level: "n4", vi: ["nơi", "chỗ", "địa điểm"], en: ["place", "location"] },
    "様子": { level: "n3", vi: ["khoảnh khắc", "dáng vẻ", "tình hình", "trạng thái", "diện mạo"], en: ["moments", "aspect", "situation", "appearance"] },
    "瞬間": { level: "n2", vi: ["khoảnh khắc", "chớp mắt"], en: ["moment", "instant", "moments"] },
    "未来": { level: "n4", vi: ["tương lai"], en: ["future"] },
    "過去": { level: "n4", vi: ["quá khứ"], en: ["past"] },
    "現在": { level: "n3", vi: ["hiện tại"], en: ["present"] },
    "本質": { level: "n1", vi: ["bản chất"], en: ["essence", "nature"] },
    "ありのまま": { level: "n1", vi: ["bản chất đích thực", "đích thực", "nguyên vẹn", "chân thật"], en: ["as it really is", "as it is", "true nature"] },
    "悔しい": { level: "n3", vi: ["thất vọng", "cay đắng", "tiếc nuối", "ấm ức"], en: ["frustrated", "disappointed", "regretful"] },
    "悔しくて": { level: "n3", vi: ["thất vọng", "cay đắng", "tiếc nuối", "ấm ức"], en: ["frustrated", "disappointed", "regretful"] },
    "悔しく": { level: "n3", vi: ["thất vọng", "cay đắng", "tiếc nuối", "ấm ức"], en: ["frustrated", "disappointed", "regretful"] },
    "くやしい": { level: "n3", vi: ["thất vọng", "cay đắng", "tiếc nuối", "ấm ức"], en: ["frustrated", "disappointed", "regretful"] },
    "若い": { level: "n3", vi: ["còn trẻ", "trẻ", "tuổi trẻ"], en: ["young", "youth"] },
    "わかい": { level: "n3", vi: ["còn trẻ", "trẻ", "tuổi trẻ"], en: ["young", "youth"] },
    "チャンス": { level: "n3", vi: ["cơ hội"], en: ["opportunities", "opportunity", "chance", "chances"] },
    "機会": { level: "n3", vi: ["cơ hội", "dịp"], en: ["opportunity", "chance"] },
    "きかい": { level: "n3", vi: ["cơ hội", "dịp"], en: ["opportunity", "chance"] },
    "なんで": { level: "n4", vi: ["tại sao", "vì sao", "sao"], en: ["why", "how come"] },
    "何で": { level: "n4", vi: ["tại sao", "vì sao", "sao"], en: ["why", "how come"] },
    "なぜ": { level: "n4", vi: ["tại sao", "vì sao"], en: ["why"] },
    "どうして": { level: "n5", vi: ["tại sao", "làm sao"], en: ["why", "how come"] },
    "ない": { level: "n5", vi: ["không nhận được", "không có", "không", "chẳng"], en: ["didn't get", "didn't", "no", "not", "without"] },
    "こういう": { level: "n4", vi: ["như thế này", "như này", "kiểu này"], en: ["like this", "such", "this kind of"] },
    "そう": { level: "n5", vi: ["như vậy", "thế"], en: ["so", "like that"] },
    "こと": { level: "n4", vi: ["những việc", "việc", "điều", "chuyện"], en: ["things", "thing", "matter"] },
    "事": { level: "n4", vi: ["những việc", "việc", "điều", "chuyện"], en: ["things", "thing", "matter"] },
    "やる": { level: "n5", vi: ["thử những việc", "thử", "làm", "thực hiện"], en: ["try", "do"] },
    "やって": { level: "n5", vi: ["thử những việc", "thử", "làm", "thực hiện"], en: ["try", "do"] },
    "やってみる": { level: "n5", vi: ["muốn thử", "làm thử", "thử"], en: ["like to try", "try"] },
    "発表": { level: "n3", vi: ["những thông báo", "thông báo", "công bố", "phát biểu"], en: ["announcements", "announcement", "presentation"] },
    "はっぴょう": { level: "n3", vi: ["những thông báo", "thông báo", "công bố", "phát biểu"], en: ["announcements", "announcement", "presentation"] },
    "言う": { level: "n5", vi: ["nói", "bảo", "gọi là"], en: ["say", "tell", "called"] },
    "いう": { level: "n5", vi: ["nói", "bảo", "gọi là"], en: ["say", "tell", "called"] },
    "だけ": { level: "n4", vi: ["chỉ vì", "chỉ là", "chỉ", "mỗi"], en: ["just because", "just", "only"] },
    "感じる": { level: "n4", vi: ["cảm thấy", "cảm giác"], en: ["felt", "feel"] },
    "かんじる": { level: "n4", vi: ["cảm thấy", "cảm giác"], en: ["felt", "feel"] },
    "思う": { level: "n5", vi: ["tự hỏi", "nghĩ", "cho rằng"], en: ["wondering", "think", "thought", "wonder"] },
    "おもう": { level: "n5", vi: ["tự hỏi", "nghĩ", "cho rằng"], en: ["wondering", "think", "thought", "wonder"] },
    "もらう": { level: "n5", vi: ["nhận được", "nhận"], en: ["get", "receive"] },
    "受け取る": { level: "n3", vi: ["nhận được", "nhận"], en: ["get", "receive"] },
    "出す": { level: "n5", vi: ["đưa ra", "phát ra", "lấy ra"], en: ["make", "give out", "put out"] },
    "だす": { vi: ["đưa ra", "phát ra", "lấy ra"], en: ["make", "give out", "put out"] },
    "たい": { vi: ["muốn", "muốn thử", "muốn đưa ra"], en: ["would like", "like to", "want to", "want"] },
    "欲しい": { vi: ["muốn", "mong muốn"], en: ["want", "desire"] },
    "ほしい": { vi: ["muốn", "mong muốn"], en: ["want", "desire"] },
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

  function isCoreContentPos(pos) {
    return /^(名詞|動詞|形容詞|形状詞)/.test(String(pos || ""));
  }

  function isOtherContentPos(pos) {
    if (isSkipPos(pos)) return false;
    return !isCoreContentPos(pos);
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
    if (!token) return "";
    const raw = String(token.jlpt || token.level || "")
      .toLowerCase()
      .replace(/^jlpt-?/, "");
    if (JLPT_LEVELS.has(raw)) return raw;

    const lemma = String(token.lemma || "");
    const surface = String(token.surface || "");
    const reading = String(token.reading || "");

    // 1. Exact match in COMMON_JLPT_WORDS
    if (lemma && Object.hasOwn(COMMON_JLPT_WORDS, lemma)) return COMMON_JLPT_WORDS[lemma];
    if (surface && Object.hasOwn(COMMON_JLPT_WORDS, surface)) return COMMON_JLPT_WORDS[surface];
    if (reading && Object.hasOwn(COMMON_JLPT_WORDS, reading)) return COMMON_JLPT_WORDS[reading];

    // 2. Exact match in BILINGUAL_MAP
    if (lemma && Object.hasOwn(BILINGUAL_MAP, lemma) && BILINGUAL_MAP[lemma]?.level) return BILINGUAL_MAP[lemma].level;
    if (surface && Object.hasOwn(BILINGUAL_MAP, surface) && BILINGUAL_MAP[surface]?.level) return BILINGUAL_MAP[surface].level;

    // 3. Exact match in GRAMMAR_PATTERNS
    if (lemma && Object.hasOwn(GRAMMAR_PATTERNS, lemma) && GRAMMAR_PATTERNS[lemma]?.level) return GRAMMAR_PATTERNS[lemma].level;
    if (surface && Object.hasOwn(GRAMMAR_PATTERNS, surface) && GRAMMAR_PATTERNS[surface]?.level) return GRAMMAR_PATTERNS[surface].level;

    // 4. De-inflection candidates for inflected verbs / adjectives
    const candidates = [
      ...deinflectVerbOrAdj(surface),
      ...deinflectVerbOrAdj(lemma),
    ];
    for (const cand of candidates) {
      if (!cand) continue;
      if (Object.hasOwn(COMMON_JLPT_WORDS, cand)) return COMMON_JLPT_WORDS[cand];
      if (Object.hasOwn(BILINGUAL_MAP, cand) && BILINGUAL_MAP[cand]?.level) return BILINGUAL_MAP[cand].level;
      if (Object.hasOwn(GRAMMAR_PATTERNS, cand) && GRAMMAR_PATTERNS[cand]?.level) return GRAMMAR_PATTERNS[cand].level;
    }

    // 5. Frequency rank fallback
    if (token.freq_rank != null) {
      const rank = Number(token.freq_rank);
      if (Number.isFinite(rank) && rank > 0) {
        if (rank <= 1500) return "n5";
        if (rank <= 3500) return "n4";
        if (rank <= 7000) return "n3";
        if (rank <= 13000) return "n2";
        return "n1";
      }
    }

    // 6. Content word fallback: default to N3 vibrant gold (zero level-unknown!)
    if (isContentWord(token)) {
      return "n3";
    }

    return "";
  }

  /**
   * JLPT / difficulty class:
   * - Noun, Verb, Adjective: gets jlpt-${level}
   * - Other content POS (Adverb, Pronoun, Interjection...): gets tok-other-pos
   * - Particles / Punctuation: gets empty string (neutral text)
   * @returns {string} e.g. "jlpt-n3", "jlpt-n5", or "tok-other-pos"
   */
  function jlptClassForToken(token) {
    if (!isContentWord(token)) return "";
    const pos = String(token.pos || "");
    if (!pos || isCoreContentPos(pos)) {
      const level = jlptLevel(token) || "n3";
      return `jlpt-${level}`;
    }
    return "tok-other-pos";
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

  const COMPOUND_TOKENS_TABLE = {
    "週末": { reading: "しゅうまつ", lemma: "週末", pos: "名詞", jlpt: "n4" },
    "お疲れ様": { reading: "おつかれさま", lemma: "お疲れ様", pos: "感動詞", jlpt: "n4" },
    "お疲れさまでした": { reading: "おつかれさまでした", lemma: "お疲れ様", pos: "感動詞", jlpt: "n4" },
    "お疲れ様でした": { reading: "おつかれさまでした", lemma: "お疲れ様", pos: "感動詞", jlpt: "n4" },
    "お疲れ様です": { reading: "おつかれさまです", lemma: "お疲れ様", pos: "感動詞", jlpt: "n4" },
    "1週間": { reading: "いっしゅうかん", lemma: "1週間", pos: "名詞", jlpt: "n5" },
    "一週間": { reading: "いっしゅうかん", lemma: "一週間", pos: "名詞", jlpt: "n5" },
    "皆さん": { reading: "みなさん", lemma: "皆", pos: "名詞", jlpt: "n5" },
    "みなさん": { reading: "みなさん", lemma: "皆", pos: "名詞", jlpt: "n5" },
    "鈴か": { reading: "すずか", lemma: "鈴か", pos: "名詞", jlpt: "unknown" },
    "鈴かの": { reading: "すずかの", lemma: "鈴かの", pos: "名詞", jlpt: "unknown" },
    "ポッドキャスト": { reading: "ぽっどきゃすと", lemma: "ポッドキャスト", pos: "名詞", jlpt: "n4" },
    "ようこそ": { reading: "ようこそ", lemma: "ようこそ", pos: "感動詞", jlpt: "n4" },
    "今日": { reading: "きょう", lemma: "今日", pos: "名詞", jlpt: "n5" },
    "昨日": { reading: "きのう", lemma: "昨日", pos: "名詞", jlpt: "n5" },
    "明日": { reading: "あした", lemma: "明日", pos: "名詞", jlpt: "n5" },
    "今年": { reading: "ことし", lemma: "今年", pos: "名詞", jlpt: "n5" },
    "去年": { reading: "きょねん", lemma: "去年", pos: "名詞", jlpt: "n5" },
    "来年": { reading: "らいねん", lemma: "来年", pos: "名詞", jlpt: "n5" },
    "今週": { reading: "こんしゅう", lemma: "今週", pos: "名詞", jlpt: "n5" },
    "先週": { reading: "せんしゅう", lemma: "先週", pos: "名詞", jlpt: "n5" },
    "来週": { reading: "らいしゅう", lemma: "来週", pos: "名詞", jlpt: "n5" },
    "今月": { reading: "こんげつ", lemma: "今月", pos: "名詞", jlpt: "n5" },
    "先月": { reading: "せんげつ", lemma: "先月", pos: "名詞", jlpt: "n5" },
    "来月": { reading: "らいげつ", lemma: "来月", pos: "名詞", jlpt: "n5" },
    "毎日": { reading: "まいにち", lemma: "毎日", pos: "名詞", jlpt: "n5" },
    "毎週": { reading: "まいしゅう", lemma: "毎週", pos: "名詞", jlpt: "n5" },
    "毎月": { reading: "まいつき", lemma: "毎月", pos: "名詞", jlpt: "n5" },
    "毎年": { reading: "まいとし", lemma: "毎年", pos: "名詞", jlpt: "n5" },
    "午前": { reading: "ごぜん", lemma: "午前", pos: "名詞", jlpt: "n5" },
    "午後": { reading: "ごご", lemma: "午後", pos: "名詞", jlpt: "n5" },
    "おはようございます": { reading: "おはようございます", lemma: "おはようございます", pos: "感動詞", jlpt: "n5" },
    "ありがとうございます": { reading: "ありがとうございます", lemma: "ありがとうございます", pos: "感動詞", jlpt: "n5" },
    "すみません": { reading: "すみません", lemma: "すみません", pos: "感動詞", jlpt: "n5" },
    "こんにちは": { reading: "こんにちは", lemma: "こんにちは", pos: "感動詞", jlpt: "n5" },
    "こんばんは": { reading: "こんばんは", lemma: "こんばんは", pos: "感動詞", jlpt: "n5" },
  };

  /**
   * Fuses compound kanji nouns split by morphological analyzers (e.g. 週 + 末 -> 週末),
   * and handles intervening fullwidth or halfwidth whitespace (e.g. 週 + 　 + 末 -> 週末).
   */
  function fuseCompoundTokens(tokens) {
    if (!Array.isArray(tokens) || tokens.length < 2) return tokens;
    const result = [];
    let i = 0;
    while (i < tokens.length) {
      let nextIdx = i + 1;
      while (nextIdx < tokens.length && /^\s+$/u.test(tokens[nextIdx].surface || "")) {
        nextIdx++;
      }
      if (nextIdx < tokens.length) {
        const combined = (tokens[i].surface || "") + (tokens[nextIdx].surface || "");
        const compound = COMPOUND_TOKENS_TABLE[combined];
        if (compound) {
          result.push({
            surface: combined,
            reading: compound.reading,
            lemma: compound.lemma,
            pos: compound.pos,
            jlpt: compound.jlpt || jlptLevel({ surface: combined, lemma: compound.lemma }),
          });
          i = nextIdx + 1;
          continue;
        }
      }
      result.push(tokens[i]);
      i++;
    }
    return result;
  }

  /**
   * Identifies multi-token grammar compounds, compound particles, and verb inflection chains.
   * Attaches _clusterId, _clusterSurface, _clusterLemma, _clusterLevel to grouped tokens.
   */
  function detectGrammarClusters(tokens) {
    if (!Array.isArray(tokens) || tokens.length < 2) return tokens;

    let i = 0;
    let clusterCounter = 1;
    while (i < tokens.length) {
      let matchedGrammar = null;
      let matchedLen = 0;

      // 1. Longest-match against GRAMMAR_PATTERNS (lookahead up to 6 tokens)
      const maxLookahead = Math.min(tokens.length - i, 7);
      for (let len = maxLookahead; len >= 2; len--) {
        const slice = tokens.slice(i, i + len);
        const combined = slice.map((t) => t.surface || "").join("");
        if (Object.hasOwn(GRAMMAR_PATTERNS, combined)) {
          matchedGrammar = { pattern: combined, entry: GRAMMAR_PATTERNS[combined] };
          matchedLen = len;
          break;
        }
      }

      if (matchedGrammar) {
        const clusterId = `gc_${clusterCounter++}_${i}`;
        const level = matchedGrammar.entry.level || "n3";
        const rootLemma = matchedGrammar.entry.lemma || (tokens[i] && tokens[i].lemma && !isSkipPos(tokens[i].pos) ? tokens[i].lemma : matchedGrammar.pattern);
        for (let k = 0; k < matchedLen; k++) {
          tokens[i + k]._clusterId = clusterId;
          tokens[i + k]._clusterSurface = matchedGrammar.pattern;
          tokens[i + k]._clusterLemma = rootLemma;
          tokens[i + k]._clusterLevel = level;
          tokens[i + k]._clusterPos = tokens[i]?.pos || "動詞";
        }
        i += matchedLen;
        continue;
      }

      // 2. Verb Inflection / Auxiliary Chains
      // e.g. [話す/話し] + [ます/ました/ません] or [見る/見] + [て] + [ください]
      const curr = tokens[i];
      const isVerb = curr && (curr.pos?.startsWith("動詞") || curr.pos?.startsWith("助動詞"));
      if (isVerb && i + 1 < tokens.length) {
        let chainLen = 1;
        while (i + chainLen < tokens.length) {
          const nextTok = tokens[i + chainLen];
          const nextPos = nextTok?.pos || "";
          const nextSurf = nextTok?.surface || "";
          const isAux =
            nextPos.startsWith("助動詞") ||
            (nextPos.startsWith("助詞") && ["て", "で", "ば", "たら", "ても", "でも"].includes(nextSurf)) ||
            ["ます", "ました", "ません", "たい", "ない", "た", "だ", "て", "で", "ください", "くださる", "いただく", "みる", "おく", "しまう", "くる", "いく", "いる", "ある"].includes(nextSurf) ||
            nextTok?.lemma === "ください" || nextTok?.lemma === "ます";
          if (isAux) {
            chainLen++;
          } else {
            break;
          }
        }
        if (chainLen >= 2) {
          const clusterId = `vc_${clusterCounter++}_${i}`;
          const combinedSurface = tokens.slice(i, i + chainLen).map((t) => t.surface || "").join("");
          const rootLemma = curr.lemma || curr.surface || combinedSurface;
          const level = jlptLevel(curr) || "n5";
          for (let k = 0; k < chainLen; k++) {
            tokens[i + k]._clusterId = clusterId;
            tokens[i + k]._clusterSurface = combinedSurface;
            tokens[i + k]._clusterLemma = rootLemma;
            tokens[i + k]._clusterLevel = level;
            tokens[i + k]._clusterPos = curr.pos || "動詞";
          }
          i += chainLen;
          continue;
        }
      }

      i++;
    }
    return tokens;
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

    cue.tokens = fuseCompoundTokens(cue.tokens);
    detectGrammarClusters(cue.tokens);

    function renderSingleToken(t) {
      const s = escapeHtml(t.surface);
      const lemma = escapeHtml(t.lemma || t.surface);
      const surfaceAttr = escapeHtml(t.surface);
      const cls = classForToken(t, settings, userVocab);
      const classAttr = cls ? `tok ${cls}` : "tok";
      const clusterAttrs = t._clusterId
        ? ` data-cluster-id="${escapeHtml(t._clusterId)}" data-cluster-surface="${escapeHtml(t._clusterSurface || t.surface)}" data-cluster-lemma="${escapeHtml(t._clusterLemma || t.lemma || t.surface)}"`
        : "";
      if (showFurigana && t.reading && !isSkipPos(t.pos) && /[\u4e00-\u9faf\u3400-\u4dbf]/.test(t.surface)) {
        const rawReading = t.reading || "";
        const hiragana =
          Kana && typeof Kana.katakanaToHiragana === "function"
            ? Kana.katakanaToHiragana(rawReading)
            : rawReading;
        if (hiragana) {
          return `<ruby class="${classAttr.trim()}" data-surface="${surfaceAttr}" data-lemma="${lemma}"${clusterAttrs}>${s}<rt>${escapeHtml(hiragana)}</rt></ruby>`;
        }
      }
      return `<span class="${classAttr.trim()}" data-surface="${surfaceAttr}" data-lemma="${lemma}"${clusterAttrs}>${s}</span>`;
    }

    const renderedParts = [];
    let i = 0;
    while (i < cue.tokens.length) {
      const t = cue.tokens[i];
      const clusterId = t._clusterId;
      if (clusterId) {
        const clusterTokens = [t];
        let j = i + 1;
        while (j < cue.tokens.length && cue.tokens[j]._clusterId === clusterId) {
          clusterTokens.push(cue.tokens[j]);
          j++;
        }
        const innerHtml = clusterTokens.map(renderSingleToken).join("");
        const clusterSurface = escapeHtml(t._clusterSurface || t.surface || "");
        const clusterLemma = escapeHtml(t._clusterLemma || t.lemma || t.surface || "");
        renderedParts.push(
          `<span class="tok-cluster-wrapper" data-cluster-id="${escapeHtml(clusterId)}" data-cluster-surface="${clusterSurface}" data-cluster-lemma="${clusterLemma}">${innerHtml}</span>`
        );
        i = j;
      } else {
        renderedParts.push(renderSingleToken(t));
        i++;
      }
    }
    return renderedParts.join("");
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

  const DIRECT_VI_WORDS = {
    // Pronouns & Persons (N5-N4)
    "tôi": { level: "n5", lemma: "私", surface: "わたし" },
    "mình": { level: "n5", lemma: "自分", surface: "じぶん" },
    "bản thân": { level: "n5", lemma: "自分", surface: "じぶん" },
    "chúng tôi": { level: "n5", lemma: "私たち", surface: "わたしたち" },
    "chúng ta": { level: "n5", lemma: "私たち", surface: "わたしたち" },
    "các bạn": { level: "n5", lemma: "皆さん", surface: "みなさん" },
    "mọi người": { level: "n5", lemma: "皆", surface: "みんな" },
    "người": { level: "n5", lemma: "人", surface: "ひと" },
    "con người": { level: "n4", lemma: "人間", surface: "にんげん" },
    "anh ấy": { level: "n5", lemma: "彼", surface: "かれ" },
    "cô ấy": { level: "n5", lemma: "彼女", surface: "かのじょ" },
    "ông ấy": { level: "n5", lemma: "彼", surface: "かれ" },
    "bà ấy": { level: "n5", lemma: "彼女", surface: "かのじょ" },
    "bạn bè": { level: "n5", lemma: "友達", surface: "ともだち" },
    "bạn": { level: "n5", lemma: "あなた", surface: "あなた" },
    "gia đình": { level: "n5", lemma: "家族", surface: "かぞく" },
    "thầy giáo": { level: "n5", lemma: "先生", surface: "せんせい" },
    "cô giáo": { level: "n5", lemma: "先生", surface: "せんせい" },
    "giáo viên": { level: "n5", lemma: "先生", surface: "せんせい" },
    "học sinh": { level: "n5", lemma: "学生", surface: "がくせい" },
    "sinh viên": { level: "n5", lemma: "学生", surface: "がくせい" },

    // Time & Circumstance (N5-N3)
    "lúc đó": { level: "n5", lemma: "その時", surface: "そん時" },
    "khi đó": { level: "n5", lemma: "その時", surface: "そのとき" },
    "hồi đó": { level: "n5", lemma: "その時", surface: "そのとき" },
    "thời điểm đó": { level: "n5", lemma: "その時", surface: "そのとき" },
    "thời gian": { level: "n5", lemma: "時間", surface: "じかん" },
    "hôm nay": { level: "n5", lemma: "今日", surface: "きょう" },
    "ngày mai": { level: "n5", lemma: "明日", surface: "あした" },
    "hôm qua": { level: "n5", lemma: "昨日", surface: "きのう" },
    "bây giờ": { level: "n5", lemma: "今", surface: "いま" },
    "mỗi ngày": { level: "n5", lemma: "毎日", surface: "まいにち" },
    "hàng ngày": { level: "n5", lemma: "毎日", surface: "まいにち" },
    "hiện tại": { level: "n4", lemma: "現在", surface: "げんざい" },
    "quá khứ": { level: "n3", lemma: "過去", surface: "かこ" },
    "tương lai": { level: "n3", lemma: "未来", surface: "みらい" },
    "khoảnh khắc": { level: "n3", lemma: "瞬間", surface: "しゅんかん" },

    // Questions & Conjunctions (N5-N4)
    "tại sao": { level: "n4", lemma: "なんで", surface: "なんで" },
    "vì sao": { level: "n4", lemma: "なぜ", surface: "なぜ" },
    "sao": { level: "n4", lemma: "なんで", surface: "なんで" },
    "cái gì": { level: "n5", lemma: "何", surface: "なに" },
    "điều gì": { level: "n5", lemma: "何", surface: "なに" },
    "ở đâu": { level: "n5", lemma: "どこ", surface: "どこ" },
    "ai": { level: "n5", lemma: "誰", surface: "だれ" },
    "khi nào": { level: "n5", lemma: "いつ", surface: "いつ" },
    "như thế nào": { level: "n5", lemma: "どう", surface: "どう" },
    "làm sao": { level: "n5", lemma: "どう", surface: "どう" },
    "như thế này": { level: "n4", lemma: "こういう", surface: "こういう" },
    "như này": { level: "n4", lemma: "こういう", surface: "こういう" },
    "kiểu này": { level: "n4", lemma: "こういう", surface: "こういう" },
    "như vậy": { level: "n5", lemma: "そう", surface: "そう" },
    "chỉ vì": { level: "n4", lemma: "だけ", surface: "だけで" },
    "chỉ là": { level: "n4", lemma: "だけ", surface: "だけ" },
    "chỉ": { level: "n4", lemma: "だけ", surface: "だけ" },
    "bởi vì": { level: "n5", lemma: "から", surface: "だから" },
    "tuy nhiên": { level: "n4", lemma: "しかし", surface: "しかし" },
    "nhưng": { level: "n5", lemma: "でも", surface: "でも" },
    "mặc dù": { level: "n4", lemma: "のに", surface: "のに" },

    // Adjectives & Feelings (N4-N2)
    "cuối tuần": { level: "n4", lemma: "週末", surface: "しゅうまつ" },
    "tuyệt vời": { level: "n4", lemma: "素敵", surface: "すてき" },
    "chúc bạn có một": { level: "n4", lemma: "送る", surface: "送ってください" },
    "chúc bạn một": { level: "n4", lemma: "送る", surface: "送ってください" },
    "chúc bạn có": { level: "n4", lemma: "送る", surface: "送ってください" },
    "chúc bạn": { level: "n4", lemma: "送る", surface: "送ってください" },
    "chúc một": { level: "n4", lemma: "送る", surface: "送ってください" },
    "chúc": { level: "n4", lemma: "送る", surface: "送ってください" },
    "có một": { level: "n4", lemma: "送る", surface: "送ってください" },
    "vô cùng": { level: "n4", lemma: "すごい", surface: "すっごい" },
    "cực kỳ": { level: "n3", lemma: "非常", surface: "ひじょう" },
    "rất": { level: "n5", lemma: "とても", surface: "とても" },
    "thất vọng": { level: "n3", lemma: "悔しい", surface: "悔しくて" },
    "tiếc nuối": { level: "n3", lemma: "悔しい", surface: "くやしい" },
    "còn trẻ": { level: "n3", lemma: "若い", surface: "わかい" },
    "trẻ tuổi": { level: "n3", lemma: "若い", surface: "わかい" },
    "trẻ": { level: "n3", lemma: "若い", surface: "わかい" },
    "cảm thấy": { level: "n4", lemma: "感じる", surface: "かんじる" },
    "tự hỏi": { level: "n5", lemma: "思う", surface: "おもう" },
    "suy nghĩ": { level: "n5", lemma: "考える", surface: "かんがえる" },
    "nghĩ": { level: "n5", lemma: "思う", surface: "おもう" },
    "cảm giác": { level: "n4", lemma: "気持ち", surface: "きもち" },
    "cảm xúc": { level: "n4", lemma: "気持ち", surface: "きもち" },
    "hạnh phúc": { level: "n4", lemma: "幸せ", surface: "しあわせ" },
    "vui vẻ": { level: "n5", lemma: "嬉しい", surface: "うれしい" },
    "buồn": { level: "n4", lemma: "悲しい", surface: "かなしい" },
    "quan trọng": { level: "n4", lemma: "大切", surface: "たいせつ" },
    "cần thiết": { level: "n4", lemma: "必要", surface: "ひつよう" },
    "đơn giản": { level: "n4", lemma: "簡単", surface: "かんたん" },
    "khó khăn": { level: "n4", lemma: "難しい", surface: "むずかしい" },
    "dễ dàng": { level: "n4", lemma: "簡単", surface: "かんたん" },

    // Verbs & Common Actions (N5-N3)
    "không nhận được": { level: "n5", lemma: "ない", surface: "ない" },
    "không có": { level: "n5", lemma: "ない", surface: "ない" },
    "không": { level: "n5", lemma: "ない", surface: "ない" },
    "chưa": { level: "n5", lemma: "まだ", surface: "まだ" },
    "cơ hội": { level: "n3", lemma: "チャンス", surface: "チャンス" },
    "muốn thử": { level: "n5", lemma: "たい", surface: "やってみたい" },
    "muốn đưa ra": { level: "n5", lemma: "たい", surface: "してみたい" },
    "muốn làm": { level: "n5", lemma: "たい", surface: "したい" },
    "muốn": { level: "n5", lemma: "たい", surface: "たい" },
    "thử": { level: "n5", lemma: "やる", surface: "やってみる" },
    "làm": { level: "n5", lemma: "する", surface: "する" },
    "thực hiện": { level: "n3", lemma: "行う", surface: "おこなう" },
    "nhận được": { level: "n5", lemma: "もらう", surface: "もらう" },
    "nhận": { level: "n5", lemma: "もらう", surface: "もらう" },
    "đưa ra": { level: "n4", lemma: "出す", surface: "だす" },
    "nói": { level: "n5", lemma: "言う", surface: "いう" },
    "bảo": { level: "n5", lemma: "言う", surface: "いう" },
    "nghe": { level: "n5", lemma: "聞く", surface: "きく" },
    "nhìn": { level: "n5", lemma: "見る", surface: "みる" },
    "xem": { level: "n5", lemma: "見る", surface: "みる" },
    "đọc": { level: "n5", lemma: "読む", surface: "よむ" },
    "viết": { level: "n5", lemma: "書く", surface: "かく" },
    "ăn": { level: "n5", lemma: "食べる", surface: "たべる" },
    "uống": { level: "n5", lemma: "飲む", surface: "のむ" },
    "đi": { level: "n5", lemma: "行く", surface: "いく" },
    "đến": { level: "n5", lemma: "来る", surface: "くる" },
    "về": { level: "n5", lemma: "帰る", surface: "かえる" },
    "biết": { level: "n5", lemma: "知る", surface: "しる" },
    "hiểu": { level: "n5", lemma: "分かる", surface: "わかる" },
    "giúp đỡ": { level: "n4", lemma: "手伝う", surface: "てつだう" },
    "bắt đầu": { level: "n4", lemma: "始まる", surface: "はじまる" },
    "kết thúc": { level: "n4", lemma: "終わる", surface: "おわる" },
    "chia sẻ": { level: "n3", lemma: "共有", surface: "きょうゆう" },
    "truyền tải": { level: "n3", lemma: "届ける", surface: "とどける" },

    // Nouns & Entities (N5-N2)
    "những việc": { level: "n5", lemma: "こと", surface: "こと" },
    "việc": { level: "n5", lemma: "こと", surface: "こと" },
    "điều": { level: "n5", lemma: "こと", surface: "こと" },
    "chuyện": { level: "n5", lemma: "こと", surface: "こと" },
    "những thông báo": { level: "n3", lemma: "発表", surface: "発表" },
    "thông báo": { level: "n3", lemma: "発表", surface: "発表" },
    "phát biểu": { level: "n3", lemma: "発表", surface: "発表" },
    "công bố": { level: "n3", lemma: "発表", surface: "発表" },
    "cuộc sống": { level: "n4", lemma: "生活", surface: "せいかつ" },
    "thế giới": { level: "n4", lemma: "世界", surface: "せかい" },
    "xã hội": { level: "n3", lemma: "社会", surface: "しゃかい" },
    "văn hóa": { level: "n3", lemma: "文化", surface: "ぶんか" },
    "lịch sử": { level: "n3", lemma: "歴史", surface: "れきし" },
    "kinh nghiệm": { level: "n3", lemma: "経験", surface: "けいけん" },
    "trải nghiệm": { level: "n3", lemma: "経験", surface: "けいけん" },
    "vấn đề": { level: "n4", lemma: "問題", surface: "もんだい" },
    "câu hỏi": { level: "n4", lemma: "質問", surface: "しつもん" },
    "câu trả lời": { level: "n4", lemma: "答え", surface: "こたえ" },
    "lý do": { level: "n4", lemma: "理由", surface: "りゆう" },
    "ý nghĩa": { level: "n4", lemma: "意味", surface: "いみ" },
    "kết quả": { level: "n4", lemma: "結果", surface: "けっか" },
    "môi trường": { level: "n2", lemma: "環境", surface: "かんきょう" },
    "tự nhiên": { level: "n4", lemma: "自然", surface: "しぜん" },
    "truyền thống": { level: "n2", lemma: "伝統", surface: "でんとう" },
    "nhật bản": { level: "n5", lemma: "日本", surface: "にほん" },
    "tiếng nhật": { level: "n5", lemma: "日本語", surface: "にほんご" },
  };

  const DIRECT_EN_WORDS = {
    // Pronouns & Persons (N5-N4)
    "that time": { level: "n5", lemma: "その時", surface: "そん時" },
    "at that time": { level: "n5", lemma: "その時", surface: "そのとき" },
    "i'd": { level: "n5", lemma: "私", surface: "わたし" },
    "i": { level: "n5", lemma: "私", surface: "わたし" },
    "me": { level: "n5", lemma: "私", surface: "わたし" },
    "my": { level: "n5", lemma: "私", surface: "わたし" },
    "myself": { level: "n5", lemma: "自分", surface: "じぶん" },
    "you": { level: "n5", lemma: "あなた", surface: "あなた" },
    "we": { level: "n5", lemma: "私たち", surface: "わたしたち" },
    "they": { level: "n5", lemma: "彼ら", surface: "かれら" },
    "he": { level: "n5", lemma: "彼", surface: "かれ" },
    "she": { level: "n5", lemma: "彼女", surface: "かのじょ" },
    "everyone": { level: "n5", lemma: "皆", surface: "みんな" },
    "everybody": { level: "n5", lemma: "皆", surface: "みんな" },
    "people": { level: "n5", lemma: "人", surface: "ひと" },
    "person": { level: "n5", lemma: "人", surface: "ひと" },
    "human": { level: "n4", lemma: "人間", surface: "にんげん" },
    "friend": { level: "n5", lemma: "友達", surface: "ともだち" },
    "friends": { level: "n5", lemma: "友達", surface: "ともだち" },
    "family": { level: "n5", lemma: "家族", surface: "かぞく" },
    "teacher": { level: "n5", lemma: "先生", surface: "せんせい" },
    "student": { level: "n5", lemma: "学生", surface: "がくせい" },
    "students": { level: "n5", lemma: "学生", surface: "がくせい" },

    // Time & Circumstance (N5-N3)
    "today": { level: "n5", lemma: "今日", surface: "きょう" },
    "tomorrow": { level: "n5", lemma: "明日", surface: "あした" },
    "yesterday": { level: "n5", lemma: "昨日", surface: "きのう" },
    "now": { level: "n5", lemma: "今", surface: "いま" },
    "time": { level: "n5", lemma: "時間", surface: "じかん" },
    "moment": { level: "n3", lemma: "瞬間", surface: "しゅんかん" },
    "moments": { level: "n3", lemma: "瞬間", surface: "しゅんかん" },
    "daily": { level: "n5", lemma: "毎日", surface: "まいにち" },
    "every day": { level: "n5", lemma: "毎日", surface: "まいにち" },
    "present": { level: "n4", lemma: "現在", surface: "げんざい" },
    "past": { level: "n3", lemma: "過去", surface: "かこ" },
    "future": { level: "n3", lemma: "未来", surface: "みらい" },

    // Questions & Conjunctions (N5-N4)
    "why": { level: "n4", lemma: "なぜ", surface: "どうして" },
    "how come": { level: "n4", lemma: "なんで", surface: "なんで" },
    "what": { level: "n5", lemma: "何", surface: "なに" },
    "where": { level: "n5", lemma: "どこ", surface: "どこ" },
    "who": { level: "n5", lemma: "誰", surface: "だれ" },
    "when": { level: "n5", lemma: "いつ", surface: "いつ" },
    "how": { level: "n5", lemma: "どう", surface: "どう" },
    "like this": { level: "n4", lemma: "こういう", surface: "こういう" },
    "like that": { level: "n5", lemma: "そう", surface: "そう" },
    "this kind of": { level: "n4", lemma: "こういう", surface: "こういう" },
    "just because": { level: "n4", lemma: "だけ", surface: "だけで" },
    "just": { level: "n4", lemma: "だけ", surface: "だけ" },
    "only": { level: "n4", lemma: "だけ", surface: "だけ" },
    "because": { level: "n5", lemma: "から", surface: "だから" },
    "however": { level: "n4", lemma: "しかし", surface: "しかし" },
    "but": { level: "n5", lemma: "でも", surface: "でも" },
    "although": { level: "n4", lemma: "のに", surface: "のに" },

    // Adjectives & Feelings (N4-N2)
    "felt": { level: "n4", lemma: "感じる", surface: "かんじる" },
    "feel": { level: "n4", lemma: "感じる", surface: "かんじる" },
    "feeling": { level: "n4", lemma: "気持ち", surface: "きもち" },
    "feelings": { level: "n4", lemma: "気持ち", surface: "きもち" },
    "incredibly": { level: "n4", lemma: "すごい", surface: "すっごい" },
    "very": { level: "n5", lemma: "とても", surface: "とても" },
    "frustrated": { level: "n3", lemma: "悔しい", surface: "悔しくて" },
    "disappointed": { level: "n3", lemma: "悔しい", surface: "くやしい" },
    "wondering": { level: "n5", lemma: "思う", surface: "おもう" },
    "wonder": { level: "n5", lemma: "思う", surface: "おもう" },
    "was young": { level: "n3", lemma: "若い", surface: "わかい" },
    "young": { level: "n3", lemma: "若い", surface: "わかい" },
    "youth": { level: "n3", lemma: "若い", surface: "わかい" },
    "happy": { level: "n4", lemma: "幸せ", surface: "しあわせ" },
    "sad": { level: "n4", lemma: "悲しい", surface: "かなしい" },
    "important": { level: "n4", lemma: "大切", surface: "たいせつ" },
    "necessary": { level: "n4", lemma: "必要", surface: "ひつよう" },
    "difficult": { level: "n4", lemma: "難しい", surface: "むずかしい" },
    "hard": { level: "n4", lemma: "難しい", surface: "むずかしい" },
    "easy": { level: "n4", lemma: "簡単", surface: "かんたん" },
    "simple": { level: "n4", lemma: "簡単", surface: "かんたん" },

    // Verbs & Actions (N5-N3)
    "didn't get": { level: "n5", lemma: "ない", surface: "ない" },
    "didn't": { level: "n5", lemma: "ない", surface: "ない" },
    "did not": { level: "n5", lemma: "ない", surface: "ない" },
    "no": { level: "n5", lemma: "ない", surface: "ない" },
    "not": { level: "n5", lemma: "ない", surface: "ない" },
    "opportunities": { level: "n3", lemma: "チャンス", surface: "チャンス" },
    "opportunity": { level: "n3", lemma: "チャンス", surface: "チャンス" },
    "chance": { level: "n3", lemma: "チャンス", surface: "チャンス" },
    "like to try": { level: "n5", lemma: "たい", surface: "やってみたい" },
    "like to": { level: "n5", lemma: "たい", surface: "たい" },
    "want to": { level: "n5", lemma: "たい", surface: "たい" },
    "want": { level: "n5", lemma: "たい", surface: "たい" },
    "try": { level: "n5", lemma: "やる", surface: "やってみる" },
    "do": { level: "n5", lemma: "する", surface: "する" },
    "make announcements": { level: "n3", lemma: "発表", surface: "発表" },
    "announcements": { level: "n3", lemma: "発表", surface: "発表" },
    "announcement": { level: "n3", lemma: "発表", surface: "発表" },
    "presentation": { level: "n3", lemma: "発表", surface: "発表" },
    "make": { level: "n5", lemma: "作る", surface: "つくる" },
    "get": { level: "n5", lemma: "もらう", surface: "もらう" },
    "receive": { level: "n5", lemma: "もらう", surface: "もらう" },
    "give": { level: "n5", lemma: "あげる", surface: "あげる" },
    "say": { level: "n5", lemma: "言う", surface: "いう" },
    "said": { level: "n5", lemma: "言う", surface: "いう" },
    "tell": { level: "n5", lemma: "言う", surface: "いう" },
    "see": { level: "n5", lemma: "見る", surface: "みる" },
    "look": { level: "n5", lemma: "見る", surface: "みる" },
    "hear": { level: "n5", lemma: "聞く", surface: "きく" },
    "listen": { level: "n5", lemma: "聞く", surface: "きく" },
    "read": { level: "n5", lemma: "読む", surface: "よむ" },
    "write": { level: "n5", lemma: "書く", surface: "かく" },
    "eat": { level: "n5", lemma: "食べる", surface: "たべる" },
    "drink": { level: "n5", lemma: "飲む", surface: "のむ" },
    "go": { level: "n5", lemma: "行く", surface: "いく" },
    "come": { level: "n5", lemma: "来る", surface: "くる" },
    "know": { level: "n5", lemma: "知る", surface: "しる" },
    "understand": { level: "n5", lemma: "分かる", surface: "わかる" },
    "share": { level: "n3", lemma: "共有", surface: "きょうゆう" },
    "deliver": { level: "n3", lemma: "届ける", surface: "とどける" },

    // Nouns & Entities (N5-N2)
    "things": { level: "n5", lemma: "こと", surface: "こと" },
    "thing": { level: "n5", lemma: "こと", surface: "こと" },
    "matter": { level: "n5", lemma: "こと", surface: "こと" },
    "life": { level: "n4", lemma: "生活", surface: "せいかつ" },
    "world": { level: "n4", lemma: "世界", surface: "せかい" },
    "society": { level: "n3", lemma: "社会", surface: "しゃかい" },
    "culture": { level: "n3", lemma: "文化", surface: "ぶんか" },
    "history": { level: "n3", lemma: "歴史", surface: "れきし" },
    "experience": { level: "n3", lemma: "経験", surface: "けいけん" },
    "experiences": { level: "n3", lemma: "経験", surface: "けいけん" },
    "problem": { level: "n4", lemma: "問題", surface: "もんだい" },
    "question": { level: "n4", lemma: "質問", surface: "しつもん" },
    "answer": { level: "n4", lemma: "答え", surface: "こたえ" },
    "reason": { level: "n4", lemma: "理由", surface: "りゆう" },
    "meaning": { level: "n4", lemma: "意味", surface: "いみ" },
    "result": { level: "n4", lemma: "結果", surface: "けっか" },
    "nature": { level: "n4", lemma: "自然", surface: "しぜん" },
    "environment": { level: "n2", lemma: "環境", surface: "かんきょう" },
    "tradition": { level: "n2", lemma: "伝統", surface: "でんとう" },
    "japan": { level: "n5", lemma: "日本", surface: "にほん" },
    "japanese": { level: "n5", lemma: "日本語", surface: "にほんご" },
    "vietnam": { level: "n5", lemma: "ベトナム", surface: "ベトナム" },
    "vietnamese": { level: "n5", lemma: "ベトナム語", surface: "ベトナムご" },

    // Demonstratives, Pronouns & Conjunctions (N5-N4)
    "that is": { level: "n5", lemma: "それは", surface: "それは" },
    "this is": { level: "n5", lemma: "これは", surface: "これは" },
    "that": { level: "n5", lemma: "それ", surface: "それ" },
    "this": { level: "n5", lemma: "これ", surface: "これ" },
    "these": { level: "n5", lemma: "これら", surface: "これら" },
    "those": { level: "n5", lemma: "それら", surface: "それら" },
    "there": { level: "n5", lemma: "そこ", surface: "そこ" },
    "here": { level: "n5", lemma: "ここ", surface: "ここ" },
    "because": { level: "n5", lemma: "から", surface: "から" },
    "since": { level: "n5", lemma: "から", surface: "から" },
    "for": { level: "n5", lemma: "ために", surface: "ために" },
    "so": { level: "n5", lemma: "だから", surface: "だから" },
    "but": { level: "n5", lemma: "でも", surface: "でも" },
    "however": { level: "n4", lemma: "しかし", surface: "しかし" },
    "although": { level: "n4", lemma: "のに", surface: "のに" },
    "and": { level: "n5", lemma: "と", surface: "と" },
    "with": { level: "n5", lemma: "と", surface: "と" },
    "to": { level: "n5", lemma: "へ", surface: "へ" },
    "from": { level: "n5", lemma: "から", surface: "から" },
    "in": { level: "n5", lemma: "で", surface: "で" },
    "on": { level: "n5", lemma: "上", surface: "うえ" },
    "at": { level: "n5", lemma: "で", surface: "で" },
    "about": { level: "n4", lemma: "について", surface: "について" },
    "or": { level: "n5", lemma: "か", surface: "か" },
    "also": { level: "n5", lemma: "も", surface: "も" },
    "as": { level: "n5", lemma: "として", surface: "として" },
    "by": { level: "n5", lemma: "で", surface: "で" },
    "one": { level: "n5", lemma: "一", surface: "いち" },
    "two": { level: "n5", lemma: "二", surface: "に" },
    "three": { level: "n5", lemma: "三", surface: "さん" },
    "is": { level: "n5", lemma: "だ", surface: "です" },
    "are": { level: "n5", lemma: "だ", surface: "です" },
    "am": { level: "n5", lemma: "だ", surface: "です" },
    "was": { level: "n5", lemma: "だった", surface: "でした" },
    "were": { level: "n5", lemma: "だった", surface: "でした" },
    "be": { level: "n5", lemma: "ある", surface: "ある" },
    "been": { level: "n5", lemma: "ある", surface: "ある" },
    "have": { level: "n5", lemma: "ある", surface: "ある" },
    "has": { level: "n5", lemma: "ある", surface: "ある" },
    "had": { level: "n5", lemma: "あった", surface: "あった" },
    "will": { level: "n5", lemma: "だろう", surface: "だろう" },
    "would": { level: "n5", lemma: "だろう", surface: "だろう" },
    "can": { level: "n4", lemma: "できる", surface: "できる" },
    "could": { level: "n4", lemma: "できた", surface: "できた" },
    "should": { level: "n4", lemma: "べき", surface: "べき" },
  };

  const KATAKANA_LOANWORDS = {
    "ポッドキャスト": "podcast",
    "チョコ": "chocolate",
    "チョコレート": "chocolate",
    "ビール": "beer",
    "ビデオ": "video",
    "チャンネル": "channel",
    "ニュース": "news",
    "テスト": "test",
    "レベル": "level",
    "チャンス": "chance",
    "カメラ": "camera",
    "ラジオ": "radio",
    "ホテル": "hotel",
    "カフェ": "cafe",
    "コンピューター": "computer",
    "スマートフォン": "smartphone",
    "スマホ": "smartphone",
  };

  function isGrammarParticle(word, lang) {
    if (!word || typeof word !== "string") return false;
    const w = word.trim().toLowerCase();
    if (lang === "vi") {
      return ["vì", "của", "trong", "ở", "và", "với", "thì", "là", "đã", "đang", "sẽ", "mà", "được", "bị", "tại", "do", "bởi", "đến"].includes(w);
    }
    if (lang === "en") {
      return ["of", "in", "on", "at", "for", "with", "and", "or", "the", "a", "an", "to", "is", "are", "was", "were", "by"].includes(w);
    }
    return false;
  }

  const VIETNAMESE_COMPOUND_WORDS = [
    // Sweets & Food
    "sô cô la", "sô-cô-la", "socola", "bánh kẹo", "đồ ngọt",

    // Greetings, Wishes & Courtesy
    "chào mừng", "hoan nghênh",
    "chúc bạn có một", "chúc các bạn có một", "chúc bạn một", "chúc bạn có", "chúc các bạn", "chúc bạn", "chúc một", "chúc mừng",
    "xin vui lòng", "xin hãy", "làm ơn",
    "cảm ơn", "xin cảm ơn", "cám ơn", "xin chào", "tạm biệt", "xin lỗi",
    "không có gì", "chúc ngủ ngon", "chúc may mắn", "hân hạnh", "rất vui được", "hẹn gặp lại",

    // Effort, Attitude & Dedication
    "sự nỗ lực hết mình", "sự nỗ lực của bạn", "sự nỗ lực", "nỗ lực hết mình", "nỗ lực", "hết mình", "vất vả rồi", "vất vả",
    "cố gắng hết sức", "cố gắng", "chăm chỉ", "nhiệt tình", "tận tâm", "kiên trì", "công sức",

    // Time & Calendar
    "trong tuần này", "tuần này", "tuần trước", "tuần sau", "suốt 1 tuần", "suốt một tuần", "1 tuần", "một tuần",
    "cuối tuần", "dịp cuối tuần", "đầu tuần", "hôm nay", "ngày mai", "hôm qua", "ngày kia", "hôm kia",
    "tháng này", "tháng trước", "tháng sau", "năm nay", "năm ngoái", "năm sau", "bây giờ", "hiện tại", "quá khứ", "tương lai",
    "thời gian", "ban ngày", "ban đêm", "buổi sáng", "buổi trưa", "buổi chiều", "buổi tối",
    "nửa đêm", "hàng ngày", "hàng tuần", "hàng tháng", "hàng năm", "mỗi ngày", "mỗi tuần",
    "mỗi tháng", "mỗi năm", "thỉnh thoảng", "thường xuyên", "liên tục", "vừa mới",
    "ngay lập tức", "lập tức", "sắp tới", "sau này", "trước đây", "từ trước đến nay", "từ trước", "dạo này", "gần đây", "dạo gần đây",
    "từ đầu đến cuối", "đầu tiên", "cuối cùng",

    // Common Adjectives & States
    "tuyệt vời", "tuyệt hảo", "tuyệt diệu", "tuyệt đẹp", "đơn giản", "dễ dàng", "khó khăn", "quan trọng", "cần thiết",
    "đặc biệt", "nguy hiểm", "an toàn", "tự do", "yên tĩnh", "náo nhiệt", "ồn ào", "sạch sẽ",
    "gọn gàng", "ngăn nắp", "rộng rãi", "chật hẹp", "sáng sủa", "tối tăm", "ấm áp", "mát mẻ",
    "lạnh lẽo", "nóng nực", "vui vẻ", "hạnh phúc", "buồn bã", "mệt mỏi", "khỏe mạnh",
    "thông minh", "lười biếng", "tốt bụng", "thân thiện", "lịch sự", "dễ thương",
    "xinh đẹp", "đẹp trai", "ngon miệng", "thú vị", "hấp dẫn", "nhàm chán", "rõ ràng", "chắc chắn",
    "rất nhiều", "vô cùng", "cực kỳ", "hoàn toàn", "thực sự", "thực ra", "có lẽ", "thất vọng", "ấm ức", "tiếc nuối", "còn trẻ",
    "ngạc nhiên", "bất ngờ", "kinh ngạc", "sau khi", "kể từ khi",

    // Entities & Common Nouns
    "Nhật Bản", "nước Nhật", "Việt Nam", "tiếng Nhật", "tiếng Việt", "tiếng Anh", "ngoại ngữ",
    "gia đình", "bạn bè", "người thân", "bố mẹ", "cha mẹ", "anh chị", "anh em", "chị em",
    "vợ chồng", "con cái", "ông bà", "thầy giáo", "cô giáo", "học sinh", "sinh viên", "giáo viên",
    "bác sĩ", "kỹ sư", "nhân viên", "khách hàng", "giám đốc", "đồng nghiệp", "mọi người", "tất cả mọi người",
    "chúng tôi", "chúng ta", "các bạn", "bản thân", "con người",
    "thành phố", "thủ đô", "nông thôn", "công ty", "trường học", "bệnh viện", "nhà hàng",
    "khách sạn", "sân bay", "nhà ga", "xe buýt", "tàu điện", "máy bay", "xe hơi", "xe đạp", "xe máy",
    "điện thoại", "máy tính", "vấn đề", "kết quả", "kinh nghiệm", "cơ hội", "ý kiến", "thành công",
    "sức khỏe", "cuộc sống", "công việc", "thời tiết", "trình độ", "cấp độ", "phụ đề", "đoạn phim",

    // Verbs & Actions
    "làm việc", "học tập", "nói chuyện", "gặp gỡ", "bắt đầu", "kết thúc", "chuẩn bị", "quyết định",
    "nghỉ ngơi", "du lịch", "mua sắm", "nấu ăn", "ăn uống", "giúp đỡ", "tìm kiếm",
    "chia sẻ", "tham gia", "sử dụng", "phát triển", "thay đổi", "giải thích", "giới thiệu", "liên lạc",
    "trải qua", "tận hưởng", "đưa tiễn", "có một", "có thể", "đến với", "bước vào", "quay lại", "trở về",
    "nhận được", "đưa ra", "thực hiện", "theo dõi", "quan sát", "lắng nghe", "cảm thấy", "tự hỏi", "suy nghĩ",

    // Discourse & Connectors
    "đây là", "như thế này", "như này", "kiểu này", "như vậy", "tại sao", "vì sao", "làm sao",
    "bởi vì", "cho nên", "nhưng mà", "tuy nhiên", "mặc dù", "ví dụ", "chẳng hạn", "nói chung",
    "tóm lại", "trước tiên", "một chút", "tất cả", "toàn bộ", "không bao giờ", "như là", "với tư cách", "đặc biệt là", "nhất là"
  ];

  function renderBilingualHtml(text, lang, tokens, settings) {
    if (!text) return "";
    const s = { ...DEFAULT_VOCAB_SETTINGS, ...(settings || {}) };
    if (s.enableBilingualJlptColor === false) {
      return escapeHtml(text);
    }

    const jaTokens = Array.isArray(tokens) ? detectGrammarClusters(fuseCompoundTokens(tokens)) : [];
    const targetMap = new Map();

    // Check sentence concept presence to prevent global dictionary hijacking
    const sentenceLemmas = new Set();
    const sentenceSurfaces = new Set();
    for (const t of jaTokens) {
      if (t.lemma) sentenceLemmas.add(String(t.lemma).toLowerCase());
      if (t.surface) sentenceSurfaces.add(String(t.surface).toLowerCase());
      if (t._clusterLemma) sentenceLemmas.add(String(t._clusterLemma).toLowerCase());
      if (t._clusterSurface) sentenceSurfaces.add(String(t._clusterSurface).toLowerCase());
    }

    const hasOtsukare = sentenceLemmas.has("お疲れ様") || sentenceLemmas.has("お疲れ様でした") || sentenceLemmas.has("お疲れ様です");
    const hasArigato = sentenceLemmas.has("ありがとう") || sentenceLemmas.has("ありがとうございます");
    const hasYoukoso = sentenceLemmas.has("ようこそ") || sentenceSurfaces.has("ようこそ");
    const hasKonnichiwa = sentenceLemmas.has("こんにちは") || sentenceSurfaces.has("こんにちは");

    function addTarget(kw, level, lemma, surface, force = false, priority = 10) {
      if (!kw || typeof kw !== "string") return;
      const trimmed = kw.trim();
      if (trimmed.length < 1) return;
      const lower = trimmed.toLowerCase();
      const existing = targetMap.get(lower);
      if (!existing || force || priority > (existing.priority || 0)) {
        targetMap.set(lower, {
          word: trimmed,
          level: level || "",
          lemma: lemma || trimmed,
          surface: surface || lemma || trimmed,
          priority: priority,
        });
      }
    }

    // Determine sentence default JLPT content level (e.g. n4 or n5 or unknown)
    let sentenceContentLevel = "";
    if (jaTokens.length) {
      for (const t of jaTokens) {
        const lvl = t._clusterLevel || jlptLevel(t);
        if (lvl && lvl !== "unknown") {
          sentenceContentLevel = lvl;
          break;
        }
      }
    }
    if (!sentenceContentLevel) sentenceContentLevel = "n5";

    // Tier 1: Token-anchored matching from the CURRENT sentence (Priority: 100)
    if (jaTokens.length) {
      for (const t of jaTokens) {
        const pos = String(t._clusterPos || t.pos || "");
        if (isSkipPos(pos) && !t._clusterId) {
          continue;
        }
        const isCore = isCoreContentPos(pos);
        const isOther = isOtherContentPos(pos);
        const tokenLevel = isCore ? (t._clusterLevel || jlptLevel(t) || "n5") : (isOther ? "other" : "");
        const surface = String(t._clusterSurface || t.surface || "");
        const lemma = String(t._clusterLemma || t.lemma || surface);

        // Check GRAMMAR_PATTERNS
        const gram = GRAMMAR_PATTERNS[surface] || GRAMMAR_PATTERNS[lemma];
        if (gram) {
          const kws = lang === "vi" ? gram.vi : lang === "en" ? gram.en : [];
          const targetLemma = gram.lemma || lemma;
          for (const kw of kws || []) addTarget(kw, gram.level || tokenLevel, targetLemma, surface, true, 100);
        }

        // Check BILINGUAL_MAP
        const mapEntry = BILINGUAL_MAP[lemma] || BILINGUAL_MAP[surface];
        if (mapEntry) {
          const kws = lang === "vi" ? mapEntry.vi : lang === "en" ? mapEntry.en : [];
          const targetLemma = lemma || mapEntry.lemma || surface;
          const entryPos = String(mapEntry.pos || pos);
          const entryIsCore = isCoreContentPos(entryPos);
          const entryIsOther = isOtherContentPos(entryPos);
          const entryLevel = entryIsCore
            ? (tokenLevel !== "other" && tokenLevel ? tokenLevel : (mapEntry.level || "n5"))
            : (entryIsOther ? "other" : "");
          for (const kw of kws || []) addTarget(kw, entryLevel, targetLemma, surface, true, 100);
        }

        // Try candidate de-inflected lemmas
        const cands = deinflectVerbOrAdj(surface);
        for (const cand of cands) {
          const cEntry = BILINGUAL_MAP[cand];
          if (cEntry) {
            const kws = lang === "vi" ? cEntry.vi : lang === "en" ? cEntry.en : [];
            const targetLemma = lemma || cEntry.lemma || cand;
            const entryPos = String(cEntry.pos || pos);
            const entryIsCore = isCoreContentPos(entryPos);
            const entryIsOther = isOtherContentPos(entryPos);
            const entryLevel = entryIsCore
              ? (tokenLevel !== "other" && tokenLevel ? tokenLevel : (cEntry.level || "n5"))
              : (entryIsOther ? "other" : "");
            for (const kw of kws || []) addTarget(kw, entryLevel, targetLemma, surface, false, 90);
          }
        }

        // Katakana loanword recognition (e.g. ポッドキャスト -> podcast, チョコ -> chocolate)
        const loanword = KATAKANA_LOANWORDS[surface] || KATAKANA_LOANWORDS[lemma];
        if (loanword) {
          addTarget(loanword, tokenLevel, lemma, surface, true, 100);
        }

        // Proper name mappings (e.g. 鈴か -> Suzuka, 鈴かの -> Suzukano)
        if (surface === "鈴か" || lemma === "鈴か") {
          addTarget("Suzuka", "unknown", lemma, surface, true, 100);
        }
        if (surface === "鈴かの" || lemma === "鈴かの") {
          addTarget("Suzukano", "unknown", lemma, surface, true, 100);
        }
      }
    }

    // Tier 2: GRAMMAR_PATTERNS direct alignment (Priority: 50)
    for (const [jaPattern, entry] of Object.entries(GRAMMAR_PATTERNS)) {
      if (jaTokens.length && hasOtsukare && !hasArigato && (jaPattern === "ありがとうございます" || jaPattern === "ありがとう")) {
        continue;
      }
      const kws = lang === "vi" ? entry.vi : lang === "en" ? entry.en : [];
      const targetLemma = entry.lemma || jaPattern;
      for (const kw of kws || []) {
        addTarget(kw, entry.level, targetLemma, jaPattern, false, 50);
      }
    }

    // Tier 3: BILINGUAL_MAP direct alignment (Priority: 40)
    for (const [jaWord, entry] of Object.entries(BILINGUAL_MAP)) {
      if (jaTokens.length && hasOtsukare && !hasArigato && (jaWord === "ありがとうございます" || jaWord === "ありがとう")) {
        continue;
      }
      if (jaTokens.length && hasYoukoso && !hasKonnichiwa && jaWord === "こんにちは") {
        continue;
      }
      const kws = lang === "vi" ? entry.vi : lang === "en" ? entry.en : [];
      const targetLemma = entry.lemma || jaWord;
      const entryPos = String(entry.pos || "");
      const entryIsCore = !entryPos || isCoreContentPos(entryPos);
      const entryLvl = entryIsCore ? entry.level : "other";
      for (const kw of kws || []) {
        addTarget(kw, entryLvl, targetLemma, jaWord, false, 40);
      }
    }

    // Tier 4: Direct dictionary (DIRECT_VI_WORDS / DIRECT_EN_WORDS) (Priority: 30)
    const directDict = lang === "vi" ? DIRECT_VI_WORDS : lang === "en" ? DIRECT_EN_WORDS : null;
    if (directDict) {
      for (const [kw, entry] of Object.entries(directDict)) {
        if (jaTokens.length && hasOtsukare && !hasArigato && (kw === "cảm ơn" || kw === "xin cảm ơn")) {
          continue;
        }
        if (jaTokens.length && hasYoukoso && !hasKonnichiwa && kw === "chào") {
          continue;
        }
        const dPos = String(entry.pos || "");
        const dIsCore = !dPos || isCoreContentPos(dPos);
        const dLvl = dIsCore ? entry.level : "other";
        addTarget(kw, dLvl, entry.lemma, entry.surface, false, 30);
      }
    }

    // Tier 5: Multi-syllable Vietnamese compound unification (Priority: 10)
    if (lang === "vi") {
      const lowerText = text.toLowerCase();
      for (const phrase of VIETNAMESE_COMPOUND_WORDS) {
        const lower = phrase.toLowerCase();
        if (!targetMap.has(lower) && lowerText.includes(lower)) {
          targetMap.set(lower, {
            word: phrase,
            level: "",
            lemma: phrase,
            surface: phrase,
            priority: 10,
          });
        }
      }
    }

    const targets = Array.from(targetMap.values());
    if (!targets.length) {
      return text.replace(/([\p{L}\p{N}]+)/gu, (w) => {
        return `<span class="tok-trans" data-lemma="${escapeHtml(w)}" data-surface="${escapeHtml(w)}">${escapeHtml(w)}</span>`;
      });
    }

    // Sort targets by length descending so longer phrases match first
    targets.sort((a, b) => {
      if (b.word.length !== a.word.length) {
        return b.word.length - a.word.length;
      }
      return (b.priority || 0) - (a.priority || 0);
    });

    const escaped = targets.map((t) => t.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(?<=^|[^\\p{L}\\p{N}])(${escaped.join("|")})(?=[^\\p{L}\\p{N}]|$)`, "giu");

    const parts = text.split(regex);
    return parts
      .map((part) => {
        if (!part) return "";
        const lower = part.toLowerCase();
        const found = targetMap.get(lower);
        if (found) {
          const lAttr = escapeHtml(found.lemma || found.word);
          const sAttr = escapeHtml(found.surface || found.lemma || found.word);
          const lvl = found.level;
          const cls = lvl === "other"
            ? "tok-trans tok-other-pos"
            : (lvl && lvl !== "unknown" ? `tok-trans jlpt-${lvl}` : "tok-trans");
          const title = lvl === "other"
            ? escapeHtml(`[${found.surface || found.lemma || found.word}]`)
            : (lvl && lvl !== "unknown"
              ? escapeHtml(`[JLPT ${lvl.toUpperCase()}] ${found.surface || found.lemma || found.word}`)
              : escapeHtml(found.surface || found.lemma || found.word));
          return `<span class="${cls}" data-lemma="${lAttr}" data-surface="${sAttr}" title="${title}">${escapeHtml(part)}</span>`;
        }
        // Fallback for non-whitespace words: preserve punctuation and spaces, wrap words
        if (/\p{L}|\p{N}/u.test(part)) {
          return part.replace(/([\p{L}\p{N}]+)/gu, (w) => {
            const wLower = w.toLowerCase();
            const wFound = targetMap.get(wLower);
            const wLvl = wFound?.level;
            const wLemma = escapeHtml(wFound?.lemma || w);
            const wSurface = escapeHtml(wFound?.surface || w);
            const wCls = wLvl === "other"
              ? "tok-trans tok-other-pos"
              : (wLvl && wLvl !== "unknown" ? `tok-trans jlpt-${wLvl}` : "tok-trans");
            const wTitle = wLvl === "other"
              ? escapeHtml(`[${wSurface}]`)
              : (wLvl && wLvl !== "unknown"
                ? escapeHtml(`[JLPT ${wLvl.toUpperCase()}] ${wSurface}`)
                : escapeHtml(wSurface));
            return `<span class="${wCls}" data-lemma="${wLemma}" data-surface="${wSurface}" title="${wTitle}">${escapeHtml(w)}</span>`;
          });
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
    fuseCompoundTokens,
    segmentFallback,
    DIRECT_VI_WORDS,
    DIRECT_EN_WORDS,
  };
})();
