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

console.log("All vocab_style fallback tests passed!");
