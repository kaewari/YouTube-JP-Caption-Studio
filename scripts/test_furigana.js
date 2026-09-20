const assert = require("assert");
require("../extension/shared/romaji_kana.js");
require("../extension/shared/vocab_style.js");

const Vocab = globalThis.HardsubVocab;
assert(Vocab && typeof Vocab.renderRubyHtml === "function", "Vocab.renderRubyHtml must be defined");

const testCue = {
  source: "日本語の学校。テスト",
  tokens: [
    { surface: "日本語", reading: "ニホンゴ", lemma: "日本語", pos: "名詞" },
    { surface: "の", reading: "ノ", lemma: "の", pos: "助詞" },
    { surface: "学校", reading: "ガッコウ", lemma: "学校", pos: "名詞" },
    { surface: "。", reading: "", lemma: "。", pos: "補助記号" },
    { surface: "テスト", reading: "テスト", lemma: "テスト", pos: "名詞" }
  ]
};

const htmlContent = Vocab.renderRubyHtml(testCue, {
  showFurigana: true,
  settings: { showFurigana: true },
  userVocab: {}
});

assert(htmlContent.includes("<rt>にほんご</rt>"), "renderRubyHtml: Expected にほんご in <rt>");
assert(htmlContent.includes("<rt>がっこう</rt>"), "renderRubyHtml: Expected がっこう in <rt>");
assert(!htmlContent.includes("<rt>テスト</rt>"), "renderRubyHtml: Pure Katakana word should NOT have <rt>");
assert(!htmlContent.includes("<rt>てすと</rt>"), "renderRubyHtml: Pure Katakana word should NOT have hiragana <rt>");
assert(!/<rt>[^<]*[a-zA-Z][^<]*<\/rt>/.test(htmlContent), "renderRubyHtml: No ASCII Romaji allowed in <rt>!");

// Also test when showFurigana is false
const htmlNoFuri = Vocab.renderRubyHtml(testCue, { showFurigana: false });
assert(!htmlNoFuri.includes("<rt>"), "renderRubyHtml: No <rt> when showFurigana is false");
assert(htmlNoFuri.includes("data-surface=\"日本語\""), "renderRubyHtml: Preserves tokens for dictionary hover even when furigana is off");

console.log("ALL FURIGANA RUNTIME TESTS PASSED!");
