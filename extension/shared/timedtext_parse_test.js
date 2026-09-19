const assert = require("assert");
const { parseJson3Cues, parseTimedtextXml, parseTimedtextBody, decodeEntities } = require("./timedtext_parse.js");
const { mergeRollingAsrCues } = require("../content/normalize_cues.js");

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);
}

let cues = parseJson3Cues({ events: [
  { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "normal" }] },
  { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: "next" }] },
] });
near(cues[0].start, 1, "JSON3 normal start");
near(cues[0].end, 3, "JSON3 normal duration");

cues = parseJson3Cues({ events: [
  { tStartMs: 1000, segs: [{ utf8: "missing" }] },
  { tStartMs: 4500, dDurationMs: 500, segs: [{ utf8: "boundary" }] },
] });
near(cues[0].end, 4.5, "JSON3 missing duration + next boundary");

cues = parseJson3Cues({ events: [{ tStartMs: 7000, segs: [{ utf8: "last" }] }] });
near(cues[0].end, 9, "JSON3 last missing duration fallback");

cues = parseJson3Cues({ events: [
  { tStartMs: 1000, dDurationMs: 0, segs: [{ utf8: "zero" }] },
  { tStartMs: 1800, dDurationMs: 200, segs: [{ utf8: "next" }] },
] });
near(cues[0].end, 1.8, "JSON3 zero duration");

cues = parseJson3Cues({ events: [
  { tStartMs: 1000, dDurationMs: 4000, segs: [{ utf8: "overlap" }] },
  { tStartMs: 3000, dDurationMs: 500, segs: [{ utf8: "next" }] },
] });
near(cues[0].end, 2.95, "JSON3 source overlap is clamped to the next cue");

// === PHASE 2 MANDATORY TESTS ===

// Test 6: JSON3 missing duration + has next cue (must use next.start, not arbitrary +2s or +0.5s)
const json3MissingDurWithNext = {
  events: [
    { tStartMs: 1000, segs: [{ utf8: "Missing dur 1" }] }, // no dDurationMs
    { tStartMs: 6000, dDurationMs: 2000, segs: [{ utf8: "Next cue" }] },
  ],
};
const cuesMissingDurNext = parseJson3Cues(json3MissingDurWithNext);
assert.strictEqual(cuesMissingDurNext.length, 2);
assert.strictEqual(cuesMissingDurNext[0].start, 1.0);
assert.strictEqual(cuesMissingDurNext[0].end, 6.0, "Missing duration cue with next must boundary at next.start (6.0), not cut at 3.0s or 1.5s!");

// Test 7: JSON3 missing duration + last cue (must use explicit fallback start + 2.0s)
const json3MissingDurLast = {
  events: [
    { tStartMs: 5000, segs: [{ utf8: "Last cue missing dur" }] },
  ],
};
const cuesMissingDurLast = parseJson3Cues(json3MissingDurLast);
assert.strictEqual(cuesMissingDurLast.length, 1);
assert.strictEqual(cuesMissingDurLast[0].start, 5.0);
assert.strictEqual(cuesMissingDurLast[0].end, 7.0, "Last cue missing duration must fallback to start + 2.0s");

// Test 8: JSON3 overlap (cue 0 end extends past next start)
const json3Overlap = {
  events: [
    { tStartMs: 1000, dDurationMs: 4000, segs: [{ utf8: "Overlapping cue" }] }, // wants to end at 5.0s
    { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: "Second cue" }] },
  ],
};
const cuesOverlap = parseJson3Cues(json3Overlap);
assert.strictEqual(cuesOverlap[0].start, 1.0);
assert.strictEqual(cuesOverlap[0].end <= 3.0, true, "Overlapping cue must not extend past next.start");
assert.strictEqual(cuesOverlap[0].end >= 1.2, true, "Overlapping cue must maintain minimum duration");

// Test 9: JSON3 very short duration + long gap
const json3ShortAndGap = {
  events: [
    { tStartMs: 1000, dDurationMs: 50, segs: [{ utf8: "Short" }] },
    { tStartMs: 25000, dDurationMs: 3000, segs: [{ utf8: "Far away" }] },
  ],
};
const cuesShortGap = parseJson3Cues(json3ShortAndGap);
assert.strictEqual(cuesShortGap[0].start, 1.0);
assert.strictEqual(cuesShortGap[0].end >= 1.2, true, "Very short duration must clamp to minimum 0.2s");
assert.strictEqual(cuesShortGap[0].end < 25.0, true, "Cue must not stretch across silence gap to next.start");

// Test 10: XML <text start dur> missing dur with next & last cue
const xmlMissingDur = `
<transcript>
  <text start="2.000">No dur first</text>
  <text start="8.000" dur="2.000">With dur second</text>
  <text start="12.000">No dur last</text>
</transcript>
`;
const cuesXmlMissingDur = parseTimedtextXml(xmlMissingDur);
assert.strictEqual(cuesXmlMissingDur.length, 3);
assert.strictEqual(cuesXmlMissingDur[0].start, 2.0);
assert.strictEqual(cuesXmlMissingDur[0].end, 8.0, "XML missing dur with next must boundary at next.start (8.0)");
assert.strictEqual(cuesXmlMissingDur[1].start, 8.0);
assert.strictEqual(cuesXmlMissingDur[1].end, 10.0, "XML with dur must preserve duration (8.0 + 2.0 = 10.0)");
assert.strictEqual(cuesXmlMissingDur[2].start, 12.0);
assert.strictEqual(cuesXmlMissingDur[2].end, 14.0, "XML missing dur on last cue must fallback to start + 2.0s");

// Test 11: TTML begin/end/dur parsing
const xmlTtml = `
<timedtext format="3">
  <body>
    <p begin="00:00:01.000" dur="2s">TTML dur format</p>
    <p begin="00:00:05.000" end="00:00:08.500">TTML end format</p>
    <p t="10000" d="2500">Standard p format</p>
  </body>
</timedtext>
`;
const cuesTtml = parseTimedtextXml(xmlTtml);
assert.strictEqual(cuesTtml.length, 3);
assert.strictEqual(cuesTtml[0].start, 1.0);
assert.strictEqual(cuesTtml[0].end, 3.0, "TTML dur='2s' should end at 3.0s");
assert.strictEqual(cuesTtml[1].start, 5.0);
assert.strictEqual(cuesTtml[1].end, 8.5, "TTML end='00:00:08.500' should end at 8.5s");
assert.strictEqual(cuesTtml[2].start, 10.0);
assert.strictEqual(cuesTtml[2].end, 12.5, "Standard p t=10000 d=2500 should end at 12.5s");

// Test 12: ASR mergeRollingAsrCues
// 12a: rolling cue expanding text
const asrExpanding = [
  { start: 1.0, end: 2.0, text: "こんにちは" },
  { start: 1.8, end: 3.5, text: "こんにちは、みなさん" },
];
const mergedExpanding = mergeRollingAsrCues(asrExpanding);
assert.strictEqual(mergedExpanding.length, 1, "Rolling ASR expansion should merge into 1 cue");
assert.strictEqual(mergedExpanding[0].text, "こんにちは、みなさん");
assert.strictEqual(mergedExpanding[0].start, 1.0);
assert.strictEqual(mergedExpanding[0].end, 3.5);

// 12b: cue without end keeps the existing boundary when no next cue exists
const asrNoEnd = [
  { start: 2.0, end: 3.0, text: "はじめまして" },
  { start: 2.5, text: "はじめまして、よろしく" }, // no end
];
const mergedNoEnd = mergeRollingAsrCues(asrNoEnd);
assert.strictEqual(mergedNoEnd.length, 1);
assert.strictEqual(mergedNoEnd[0].text, "はじめまして、よろしく");
assert.strictEqual(mergedNoEnd[0].end, 3.0, "Missing end in rolling cue should keep the previous known boundary");

// 12c: consecutive updates (3 steps of expansion)
const asrConsecutive = [
  { start: 1.0, end: 2.0, text: "今日" },
  { start: 1.5, end: 2.8, text: "今日は" },
  { start: 2.0, end: 4.0, text: "今日はいい天気" },
];
const mergedConsecutive = mergeRollingAsrCues(asrConsecutive);
assert.strictEqual(mergedConsecutive.length, 1, "Consecutive updates should merge into 1 cue");
assert.strictEqual(mergedConsecutive[0].text, "今日はいい天気");
assert.strictEqual(mergedConsecutive[0].start, 1.0);
assert.strictEqual(mergedConsecutive[0].end, 4.0);

console.log("All timedtext parse tests passed!");
