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
near(cues[0].end, 7.2, "JSON3 last missing duration fallback");

cues = parseJson3Cues({ events: [
  { tStartMs: 1000, dDurationMs: 0, segs: [{ utf8: "zero" }] },
  { tStartMs: 1800, dDurationMs: 200, segs: [{ utf8: "next" }] },
] });
near(cues[0].end, 1.8, "JSON3 zero duration");

cues = parseJson3Cues({ events: [
  { tStartMs: 1000, dDurationMs: 4000, segs: [{ utf8: "overlap" }] },
  { tStartMs: 3000, dDurationMs: 500, segs: [{ utf8: "next" }] },
] });
near(cues[0].end, 5, "JSON3 source overlap preserved");

cues = parseJson3Cues({ events: [
  { tStartMs: 1000, segs: [{ utf8: "same-a" }] },
  { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "same-b" }] },
] });
near(cues[0].end, 1.2, "JSON3 same-start fallback");
near(cues[1].end, 2, "JSON3 same-start explicit duration");

cues = parseJson3Cues({ events: [{ tStartMs: 1000, dDurationMs: 50, segs: [{ utf8: "short" }] }] });
near(cues[0].end, 1.05, "JSON3 short duration");

cues = parseJson3Cues({ events: [
  { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "gap-a" }] },
  { tStartMs: 10000, dDurationMs: 1000, segs: [{ utf8: "gap-b" }] },
] });
near(cues[0].end, 3, "JSON3 long gap");

let xml = '<transcript><text start="1.000" dur="1.500">A</text><text start="4.000" dur="1.000">B</text></transcript>';
cues = parseTimedtextXml(xml);
near(cues[0].end, 2.5, "XML start+dur");

xml = '<transcript><text start="1.000">A</text><text start="4.000">B</text></transcript>';
cues = parseTimedtextXml(xml);
near(cues[0].end, 4, "XML missing dur + next");
near(cues[1].end, 4.2, "XML missing dur last");

xml = '<timedtext format="3"><body><p t="1000" d="750">P1</p><p t="2500" d="500">P2</p></body></timedtext>';
cues = parseTimedtextXml(xml);
near(cues[0].start, 1, "XML p t start");
near(cues[0].end, 1.75, "XML p d duration");

xml = '<tt><body><div><p begin="00:00:01.000" end="00:00:02.250">E</p><p begin="3s" dur="1.5s">D</p></div></body></tt>';
cues = parseTimedtextXml(xml);
near(cues[0].end, 2.25, "TTML begin/end");
near(cues[1].end, 4.5, "TTML begin/dur");

assert.strictEqual(parseTimedtextBody(JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 100, segs: [{ utf8: "J" }] }] })).length, 1);
assert.strictEqual(parseTimedtextBody('<transcript><text start="0" dur="1">X</text></transcript>').length, 1);
assert.strictEqual(parseTimedtextBody('   ').length, 0);
assert.strictEqual(decodeEntities('&amp;&lt;&#39;'), "&<'");

let merged = mergeRollingAsrCues([
  { start: 0, end: 1, text: "hello" },
  { start: 0.5, end: 1.5, text: "hello world" },
]);
assert.strictEqual(merged.length, 1);
assert.strictEqual(merged[0].text, "hello world");
near(merged[0].end, 1.5, "ASR explicit end");

merged = mergeRollingAsrCues([
  { start: 0, end: 2, text: "hello" },
  { start: 1.5, text: "hello world" },
]);
near(merged[0].end, 2, "ASR missing end keeps existing end");

merged = mergeRollingAsrCues([
  { start: 0, end: 1, text: "roll" },
  { start: 0.8, text: "rolling update" },
  { start: 3, end: 4, text: "different cue" },
]);
assert.strictEqual(merged.length, 2);
near(merged[0].end, 3, "ASR missing end next boundary");

merged = mergeRollingAsrCues([
  { start: 0, end: 0.8, text: "one" },
  { start: 0.3, end: 1.2, text: "one two" },
  { start: 0.7, end: 1.8, text: "one two three" },
]);
assert.strictEqual(merged.length, 1);
assert.strictEqual(merged[0].text, "one two three");
near(merged[0].end, 1.8, "ASR consecutive merge");

console.log("All timedtext/timing regression tests passed.");
