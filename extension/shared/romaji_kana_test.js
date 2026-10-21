/**
 * Unit tests for romaji→kana conversion of a trailing romaji run.
 *
 * Regression: `convertTrailingRomaji` referenced an undefined `nextCursor`,
 * so every latin keystroke in the cue editor threw `ReferenceError` and no
 * kana was ever produced.
 */

const assert = require("assert");
const { convertTrailingRomaji, toHiragana } = require("./romaji_kana.js");

// Test 1: a trailing romaji run converts (no ReferenceError) and the cursor
// lands right after the produced kana.
const romaji = "konnichiwa";
const converted = convertTrailingRomaji(romaji, romaji.length);
assert.ok(converted, "trailing romaji should convert");
assert.strictEqual(converted.value, toHiragana(romaji), "converted value matches toHiragana output");
assert.strictEqual(converted.cursor, toHiragana(romaji).length, "cursor should sit right after the converted kana");

// Test 2: conversion keeps text before the romaji run
const withPrefix = convertTrailingRomaji("ka", 2);
assert.ok(withPrefix, "trailing romaji should convert");
assert.strictEqual(withPrefix.value, "か", "ka should become か");
assert.strictEqual(withPrefix.cursor, 1, "cursor should follow the converted kana");

// Test 3: no romaji run → no conversion (null), no exception
assert.strictEqual(convertTrailingRomaji("漢字", 2), null, "non-romaji tail must not convert");
assert.strictEqual(convertTrailingRomaji("", 0), null, "empty input must not convert");
assert.strictEqual(convertTrailingRomaji("ka", 0), null, "cursor before the romaji run must not convert");

// Test 4: an incomplete trailing consonant is not converted yet
assert.strictEqual(convertTrailingRomaji("k", 1), null, "incomplete consonant must not convert yet");

console.log("romaji_kana_test: all assertions passed");
