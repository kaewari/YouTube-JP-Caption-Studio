const assert = require("assert");
require("./vocab_style.js");

const Vocab = globalThis.HardsubVocab;

// Test 1: Module export presence
assert.ok(Vocab, "HardsubVocab should be defined on globalThis");
assert.strictEqual(typeof Vocab.segmentFallback, "function", "HardsubVocab.segmentFallback should be a function");

// Test 2: Fallback segmentation with Intl.Segmenter
const text = "日本語を勉強します。";
const tokens = Vocab.segmentFallback(text);

assert.ok(Array.isArray(tokens), "tokens should be an array");
assert.ok(tokens.length > 0, "should produce tokens for Japanese text");

// Check token structure: surface, reading, lemma, pos, jlpt
const surfaces = tokens.map((t) => t.surface).join("");
assert.strictEqual(surfaces, text, "concatenated surfaces should match original text");

const firstTok = tokens[0];
assert.ok(firstTok.surface, "token must have surface");
assert.strictEqual(typeof firstTok.reading, "string", "token reading should be string");
assert.strictEqual(typeof firstTok.pos, "string", "token pos should be string");

// Test 3: Empty or invalid input
assert.deepStrictEqual(Vocab.segmentFallback(""), [], "empty string returns empty array");
assert.deepStrictEqual(Vocab.segmentFallback(null), [], "null returns empty array");

// Test 4: Default level colors and unknown color
assert.strictEqual(Vocab.DEFAULT_LEVEL_COLORS.unknown.color, "#94a3b8", "Unknown JLPT color should be distinct #94a3b8");

// Test 5: COMMON_JLPT_WORDS fallback
assert.strictEqual(Vocab.jlptLevel({ surface: "私", lemma: "私" }), "n5", "私 should map to n5");
assert.strictEqual(Vocab.jlptLevel({ surface: "皆さん", lemma: "皆さん" }), "n5", "皆さん should map to n5");
assert.strictEqual(Vocab.jlptLevel({ surface: "世界", lemma: "世界" }), "n4", "世界 should map to n4");
assert.strictEqual(Vocab.jlptLevel({ surface: "経験", lemma: "経験" }), "n3", "経験 should map to n3");

// Test 6: Bilingual JLPT keyword rendering
const sampleTokens = [
  { surface: "皆さん", lemma: "皆さん", pos: "名詞" },
  { surface: "こんにちは", lemma: "こんにちは", pos: "感動詞" }
];
const viHtml = Vocab.renderBilingualHtml("Chào mọi người", "vi", sampleTokens, { enableBilingualJlptColor: true });
assert.ok(viHtml.includes('<span class="tok-trans jlpt-n5">mọi người</span>'), "Vietnamese translation should highlight mọi người with jlpt-n5");

const enHtml = Vocab.renderBilingualHtml("Hello everyone", "en", sampleTokens, { enableBilingualJlptColor: true });
assert.ok(enHtml.includes('<span class="tok-trans jlpt-n5">everyone</span>'), "English translation should highlight everyone with jlpt-n5");

// Test 7: Bilingual JLPT disabled setting
const plainVi = Vocab.renderBilingualHtml("Chào mọi người", "vi", sampleTokens, { enableBilingualJlptColor: false });
assert.strictEqual(plainVi, "Chào mọi người", "Should remain plain text when bilingual JLPT is disabled");

// Test 8: English single-letter "I" and kana token lookup
const watashiTokens = [{ surface: "わたし", lemma: "わたし", pos: "代名詞" }];
const enWatashi = Vocab.renderBilingualHtml("I understand", "en", watashiTokens, { enableBilingualJlptColor: true });
assert.ok(enWatashi.includes('<span class="tok-trans jlpt-n5">I</span>'), "English single letter I should be highlighted");

// Test 9: Vietnamese accented words matching Unicode boundaries
const viAccented = Vocab.renderBilingualHtml("Chào bạn bè và tôi", "vi", [
  { surface: "友達", lemma: "友達", pos: "名詞" },
  { surface: "私", lemma: "私", pos: "代名詞" }
], { enableBilingualJlptColor: true });
assert.ok(viAccented.includes('<span class="tok-trans jlpt-n5">bạn bè</span>'), "Vietnamese friend with accent should be highlighted");
assert.ok(viAccented.includes('<span class="tok-trans jlpt-n5">tôi</span>'), "Vietnamese tôi with accent should be highlighted");

// Test 10: renderRubyHtml output with furigana toggle
const testCue = {
  tokens: [
    { surface: "日本語", reading: "にほんご", lemma: "日本語", pos: "名詞" },
    { surface: "勉強", reading: "べんきょう", lemma: "勉強", pos: "名詞" },
  ],
};
const rubyWithFurigana = Vocab.renderRubyHtml(testCue, { showFurigana: true });
assert.ok(rubyWithFurigana.includes("<rt>にほんご</rt>"), "Should include furigana <rt>");

const rubyWithoutFurigana = Vocab.renderRubyHtml(testCue, { showFurigana: false });
assert.ok(!rubyWithoutFurigana.includes("<rt>"), "Should not include <rt> when furigana disabled");

const emptyCueRuby = Vocab.renderRubyHtml({ source: "テスト" }, { showFurigana: true });
assert.ok(emptyCueRuby.includes("テスト"), "Should fallback to plain source text");

console.log("All vocab_style fallback and bilingual JLPT tests passed!");
