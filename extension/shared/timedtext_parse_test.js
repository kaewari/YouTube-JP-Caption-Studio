const assert = require("assert");
const {
  parseJson3Cues,
  parseTimedtextXml,
  parseTimedtextBody,
  decodeEntities,
} = require("./timedtext_parse.js");

// Test 1: JSON3 basic parse
const json3Basic = {
  events: [
    { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "Hello" }] },
    { tStartMs: 3000, dDurationMs: 1500, segs: [{ utf8: "World" }] },
  ],
};
const cues1 = parseJson3Cues(json3Basic);
assert.strictEqual(cues1.length, 2);
assert.strictEqual(cues1[0].start, 1.0);
assert.strictEqual(cues1[0].end, 3.0);
assert.strictEqual(cues1[0].text, "Hello");
assert.strictEqual(cues1[1].start, 3.0);
assert.strictEqual(cues1[1].end, 4.5);
assert.strictEqual(cues1[1].text, "World");

// Test 2: Zero-duration / collision ASR cues (same start time or next start <= start)
const json3Collision = {
  events: [
    { tStartMs: 1000, dDurationMs: 0, segs: [{ utf8: "Cue1" }] },
    { tStartMs: 1000, dDurationMs: 0, segs: [{ utf8: "Cue2" }] },
    { tStartMs: 1100, dDurationMs: 50, segs: [{ utf8: "Cue3" }] }, // next start 1.1s is only 0.1s away
  ],
};
const cuesColl = parseJson3Cues(json3Collision);
assert.strictEqual(cuesColl.length, 3);
assert.strictEqual(cuesColl[0].start, 1.0);
assert.strictEqual(cuesColl[0].end >= 1.2, true, "Cue 0 end must be at least start + 0.2s even on collision");
assert.strictEqual(cuesColl[1].start, 1.0);
assert.strictEqual(cuesColl[1].end >= 1.2, true, "Cue 1 end must be at least start + 0.2s even on collision");
assert.strictEqual(cuesColl[2].start, 1.1);
assert.strictEqual(cuesColl[2].end >= 1.3, true, "Cue 2 end must be at least start + 0.2s");

// Test 3: XML YSD style with 0 duration and collisions
const xmlYsd = `
<transcript>
  <text start="0.000" dur="0.000">Line 1</text>
  <text start="0.000" dur="0.100">Line 2</text>
  <text start="1.500" dur="1.000">Line 3</text>
</transcript>
`;
const cuesXmlYsd = parseTimedtextXml(xmlYsd);
assert.strictEqual(cuesXmlYsd.length, 3);
assert.strictEqual(cuesXmlYsd[0].start, 0.0);
assert.strictEqual(cuesXmlYsd[0].end >= 0.2, true, "XML YSD 0-dur must clamp to >= 0.2s");
assert.strictEqual(cuesXmlYsd[1].start, 0.0);
assert.strictEqual(cuesXmlYsd[1].end >= 0.2, true, "XML YSD collision must clamp to >= 0.2s");

// Test 4: XML timed3 style (<p t="ms" d="ms">) with 0 duration
const xmlTimed3 = `
<timedtext format="3">
  <body>
    <p t="1000" d="0">P1</p>
    <p t="1000" d="100">P2</p>
    <p t="2000" d="1000">P3</p>
  </body>
</timedtext>
`;
const cuesXmlTimed3 = parseTimedtextXml(xmlTimed3);
assert.strictEqual(cuesXmlTimed3.length, 3);
assert.strictEqual(cuesXmlTimed3[0].start, 1.0);
assert.strictEqual(cuesXmlTimed3[0].end >= 1.2, true, "XML p-node 0-dur must clamp to >= 0.2s");
assert.strictEqual(cuesXmlTimed3[1].start, 1.0);
assert.strictEqual(cuesXmlTimed3[1].end >= 1.2, true, "XML p-node collision must clamp to >= 0.2s");

// Test 5: parseTimedtextBody routing
assert.strictEqual(parseTimedtextBody(JSON.stringify(json3Basic)).length, 2);
assert.strictEqual(parseTimedtextBody(xmlYsd).length, 3);
assert.strictEqual(parseTimedtextBody("   ").length, 0);

console.log("All timedtext parse tests passed!");
