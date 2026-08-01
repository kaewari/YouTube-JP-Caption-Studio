#!/usr/bin/env node
/**
 * Sanity checks for extension/content/normalize_cues.js
 */
const path = require("path");
const {
  normalizeCues,
  dropAndStripSfx,
  isSfxLabelOnly,
} = require(path.join(__dirname, "../extension/content/normalize_cues.js"));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

assert(isSfxLabelOnly("[笑い]"), "drop [笑い]");
assert(isSfxLabelOnly("[音楽]"), "drop [音楽]");
assert(isSfxLabelOnly("[息をのむ音]"), "drop [息をのむ音]");
assert(isSfxLabelOnly("[music]"), "drop [music]");
assert(isSfxLabelOnly("♪"), "drop ♪");
assert(!isSfxLabelOnly("こんにちは"), "keep dialogue");

const stripped = dropAndStripSfx([
  { start: 0, end: 1, text: "[笑い]" },
  { start: 1, end: 2, text: "彼は言った [音楽]" },
  { start: 2, end: 3, text: "♪" },
  { start: 3, end: 4, text: "普通の台詞" },
]);
assert(stripped.length === 2, `sfx strip kept ${stripped.length} cues`);
assert(stripped[0].text === "彼は言った", `mixed strip → "${stripped[0].text}"`);
assert(stripped[0].start === 1 && stripped[0].end === 2, "mixed cue keeps YT timing");
assert(stripped[1].text === "普通の台詞", "plain kept");

// Short fragments stay on their YouTube windows (no cross-cue merge).
const fragments = normalizeCues([
  { start: 37, end: 38, text: "そんな" },
  { start: 44, end: 46, text: "ことないよ" },
  { start: 50, end: 52, text: "終わり。" },
]);
assert(fragments.length === 3, `no fragment merge → ${fragments.length} cues`);
assert(fragments[0].text === "そんな" && fragments[0].start === 37, "short cue keeps start");
assert(fragments[1].text === "ことないよ" && fragments[1].start === 44, "next cue unchanged");

const withTail = normalizeCues([
  { start: 0, end: 1, text: "何か言った。そんな" },
  { start: 2, end: 3, text: "ことない" },
]);
assert(withTail[0].text === "何か言った。そんな", `no tail shift "${withTail[0].text}"`);
assert(withTail[1].text === "ことない", `next unchanged "${withTail[1].text}"`);

const full = normalizeCues([
  { start: 0, end: 1, text: "[拍手]" },
  { start: 1, end: 2, text: "そんな" },
  { start: 3, end: 4, text: "感じだね" },
]);
assert(full.length === 2, `sfx drop only → ${full.length}`);
assert(full[0].text === "そんな" && full[0].start === 1, "dialogue cue timing preserved");
assert(full[1].text === "感じだね" && full[1].start === 3, "second cue timing preserved");

if (process.exitCode) {
  console.error("normalize_cues sanity FAILED");
} else {
  console.log("normalize_cues sanity PASSED");
}
