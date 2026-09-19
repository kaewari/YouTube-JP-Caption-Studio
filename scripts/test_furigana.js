const assert = require("assert");
require("../extension/shared/romaji_kana.js");
require("../extension/shared/vocab_style.js");

const Vocab = globalThis.HardsubVocab;
const fs = require("fs");
const path = require("path");

const contentJs = fs.readFileSync(path.join(__dirname, "../extension/content/content.js"), "utf8");
const sidepanelJs = fs.readFileSync(path.join(__dirname, "../extension/sidepanel/sidepanel.js"), "utf8");

const escapeHtml = (s) => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
const escapeAttr = escapeHtml;

const userVocab = {};
const settings = { showFurigana: true };

const contentRubyMatch = contentJs.match(/function rubyHtml\(cue\) \{[\s\S]*?\n  \}/);
const contentRubyFn = new Function("cue", "settings", "userVocab", "Vocab", "escapeHtml", "escapeAttr", `
  ${contentRubyMatch[0]}
  return rubyHtml(cue);
`);

const sidepanelRubyMatch = sidepanelJs.match(/function rubyHtml\(cue\) \{[\s\S]*?\n  \}/);
const sidepanelRubyFn = new Function("cue", "state", "highlightSettingsFromState", "Vocab", "escapeHtml", "escapeAttr", `
  ${sidepanelRubyMatch[0]}
  return rubyHtml(cue);
`);

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

const htmlContent = contentRubyFn(testCue, settings, userVocab, Vocab, escapeHtml, escapeAttr);
const spState = { showFurigana: true, userVocab: {} };
const htmlSidepanel = sidepanelRubyFn(testCue, spState, () => settings, Vocab, escapeHtml, escapeAttr);

assert(htmlContent.includes("<rt>にほんご</rt>"), "content.js: Expected にほんご in <rt>");
assert(htmlContent.includes("<rt>がっこう</rt>"), "content.js: Expected がっこう in <rt>");
assert(!htmlContent.includes("<rt>テスト</rt>"), "content.js: Pure Katakana word should NOT have <rt>");
assert(!htmlContent.includes("<rt>てすと</rt>"), "content.js: Pure Katakana word should NOT have hiragana <rt>");
assert(!/<rt>[^<]*[a-zA-Z][^<]*<\/rt>/.test(htmlContent), "content.js: No ASCII Romaji allowed in <rt>!");

assert(htmlSidepanel.includes("<rt>にほんご</rt>"), "sidepanel.js: Expected にほんご in <rt>");
assert(htmlSidepanel.includes("<rt>がっこう</rt>"), "sidepanel.js: Expected がっこう in <rt>");
assert(!htmlSidepanel.includes("<rt>テスト</rt>"), "sidepanel.js: Pure Katakana word should NOT have <rt>");
assert(!htmlSidepanel.includes("<rt>てすと</rt>"), "sidepanel.js: Pure Katakana word should NOT have hiragana <rt>");
assert(!/<rt>[^<]*[a-zA-Z][^<]*<\/rt>/.test(htmlSidepanel), "sidepanel.js: No ASCII Romaji allowed in <rt>!");

console.log("ALL FURIGANA TESTS PASSED!");
