const assert = require("assert");
require("../extension/shared/romaji_kana.js");
require("../extension/shared/vocab_style.js");

const RomajiKana = globalThis.HardsubRomajiKana;
const Vocab = globalThis.HardsubVocab;

const fs = require("fs");
const path = require("path");

const contentJs = fs.readFileSync(path.join(__dirname, "../extension/content/content.js"), "utf8");
const sidepanelJs = fs.readFileSync(path.join(__dirname, "../extension/sidepanel/sidepanel.js"), "utf8");

const escapeHtml = (s) => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
const escapeAttr = escapeHtml;

const userVocab = {};
const settings = { showFurigana: true };

// Extract rubyHtml from content.js
const contentRubyMatch = contentJs.match(/function rubyHtml\(cue\) \{[\s\S]*?\n  \}/);
if (!contentRubyMatch) throw new Error("Could not find rubyHtml in content.js");
const contentRubyFn = new Function("cue", "settings", "userVocab", "Vocab", "escapeHtml", "escapeAttr", `
  ${contentRubyMatch[0]}
  return rubyHtml(cue);
`);

// Extract rubyHtml from sidepanel.js
const sidepanelRubyMatch = sidepanelJs.match(/function rubyHtml\(cue\) \{[\s\S]*?\n  \}/);
if (!sidepanelRubyMatch) throw new Error("Could not find rubyHtml in sidepanel.js");
const sidepanelRubyFn = new Function("cue", "state", "highlightSettingsFromState", "Vocab", "escapeHtml", "escapeAttr", `
  ${sidepanelRubyMatch[0]}
  return rubyHtml(cue);
`);

console.log("=== TDD RED: RUNNING FURIGANA TEST AGAINST CURRENT CODE ===");

const testCue = {
  source: "日本語の学校。",
  tokens: [
    { surface: "日本語", reading: "ニホンゴ", lemma: "日本語", pos: "名詞" },
    { surface: "の", reading: "ノ", lemma: "の", pos: "助詞" },
    { surface: "学校", reading: "ガッコウ", lemma: "学校", pos: "名詞" },
    { surface: "。", reading: "", lemma: "。", pos: "補助記号" },
    { surface: "テスト", reading: "", lemma: "テスト", pos: "名詞" } // empty reading
  ]
};

// 1. Test content.js
const htmlContent = contentRubyFn(testCue, settings, userVocab, Vocab, escapeHtml, escapeAttr);
console.log("Rendered content.js HTML:\n", htmlContent);

// 2. Test sidepanel.js
const spState = { showFurigana: true, userVocab: {} };
const htmlSidepanel = sidepanelRubyFn(testCue, spState, () => settings, Vocab, escapeHtml, escapeAttr);
console.log("Rendered sidepanel.js HTML:\n", htmlSidepanel);

const hasAsciiInContent = /<rt>[^<]*[a-zA-Z][^<]*<\/rt>/.test(htmlContent);
const hasAsciiInSidepanel = /<rt>[^<]*[a-zA-Z][^<]*<\/rt>/.test(htmlSidepanel);

console.log("content.js has ASCII in <rt>?", hasAsciiInContent);
console.log("sidepanel.js has ASCII in <rt>?", hasAsciiInSidepanel);

assert.strictEqual(htmlContent.includes("<rt>にほんご</rt>"), true, "content.js: Expected にほんご in <rt>");
assert.strictEqual(htmlContent.includes("<rt>がっこう</rt>"), true, "content.js: Expected がっこう in <rt>");
assert.strictEqual(hasAsciiInContent, false, "content.js: No ASCII Romaji allowed in <rt>!");
assert.strictEqual(htmlContent.includes("<rt>テスト</rt>"), false, "content.js: Empty reading should NOT fallback to surface in <rt>");
assert.strictEqual(htmlContent.includes("<rt>の</rt>"), false, "content.js: Skip POS (particle) should NOT have <rt>");

assert.strictEqual(htmlSidepanel.includes("<rt>にほんご</rt>"), true, "sidepanel.js: Expected にほんご in <rt>");
assert.strictEqual(htmlSidepanel.includes("<rt>がっこう</rt>"), true, "sidepanel.js: Expected がっこう in <rt>");
assert.strictEqual(hasAsciiInSidepanel, false, "sidepanel.js: No ASCII Romaji allowed in <rt>!");
assert.strictEqual(htmlSidepanel.includes("<rt>の</rt>"), false, "sidepanel.js: Skip POS (particle) should NOT have <rt>");

console.log("ALL FURIGANA TESTS PASSED!");
