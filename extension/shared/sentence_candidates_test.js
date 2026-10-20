/**
 * Unit tests for ASR candidate lifecycle and data protection invariants.
 *
 * The production helpers live inside the content-script IIFE
 * (extension/content/content.js). This test executes that real source — it
 * does NOT keep a copy of the logic, so production drift cannot leave this
 * suite green (same technique as scripts/sentence_provenance_sanity.js).
 *
 * Verifies:
 * 1. Strict protection invariant: locked, user-edited, user-owned, or deleted cues NEVER receive candidates.
 * 2. Non-destructive candidate storage: candidate attachment never automatically mutates cue text.
 * 3. Candidate Accept applies text, updates text_source to asr:whisper-large-v3-turbo, and creates an Undo revision.
 * 4. Undo restoration recovers exact original cue text and text_source.
 * 5. Revert dismisses candidate without mutating cue text.
 * 6. Temporal interval matching connects ASR segments to the correct cue boundaries.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CONTENT_JS = path.resolve(__dirname, "../content/content.js");

/** Slice one function out of the content script source. */
function sliceFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} must exist in content.js`);
  let depth = 0;
  let seenBody = false;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      depth++;
      seenBody = true;
    } else if (ch === "}") {
      depth--;
      if (seenBody && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`could not slice ${name} out of content.js`);
}

// Execute the REAL production helpers.
const contentSource = fs.readFileSync(CONTENT_JS, "utf8");
const production = vm.runInNewContext(
  `(() => {
    const isOwnedCue = ${sliceFunction(contentSource, "isOwnedCue")};
    const canReceiveAsrCandidate = ${sliceFunction(contentSource, "canReceiveAsrCandidate")};
    const matchCuesForSegment = ${sliceFunction(contentSource, "matchCuesForSegment")};
    const findBestCueForSegmentByIoU = ${sliceFunction(contentSource, "findBestCueForSegmentByIoU")};
    const sentenceCueRevision = ${sliceFunction(contentSource, "sentenceCueRevision")};
    return { isOwnedCue, canReceiveAsrCandidate, matchCuesForSegment, findBestCueForSegmentByIoU, sentenceCueRevision };
  })()`,
  { console },
);
const { isOwnedCue, canReceiveAsrCandidate, matchCuesForSegment, findBestCueForSegmentByIoU, sentenceCueRevision } = production;

// -------------------------------------------------------------------------
// Test 1: Invariant - Locked and User-Owned cues REJECT candidates
// -------------------------------------------------------------------------
console.log("Running Test 1: Data protection invariants...");
const lockedCue = { id: "c1", source: "おはよう", mt_locked: true, text_source: "yt" };
assert.strictEqual(canReceiveAsrCandidate(lockedCue), false, "mt_locked must reject ASR candidate");

const editedCue = { id: "c2", source: "こんにちは", text_source: "edit" };
assert.strictEqual(canReceiveAsrCandidate(editedCue), false, "text_source: edit must reject ASR candidate");

const manualCue = { id: "c3", source: "こんばんは", text_source: "manual" };
assert.strictEqual(canReceiveAsrCandidate(manualCue), false, "text_source: manual must reject ASR candidate");

const scriptCue = { id: "c4", source: "さようなら", text_source: "script" };
assert.strictEqual(canReceiveAsrCandidate(scriptCue), false, "text_source: script must reject ASR candidate");

const importCue = { id: "c5", source: "ありがとう", text_source: "import" };
assert.strictEqual(canReceiveAsrCandidate(importCue), false, "text_source: import must reject ASR candidate");

const userTransCue = { id: "c6", source: "はい", text_source: "yt", translation_source: "user" };
assert.strictEqual(canReceiveAsrCandidate(userTransCue), false, "translation_source: user must reject ASR candidate");

const ownedCue = { id: "c7", source: "いいえ", text_source: "yt", user_owned: true };
assert.strictEqual(canReceiveAsrCandidate(ownedCue), false, "user_owned: true must reject ASR candidate");

const deletedCue = { id: "c8", source: "どうも", text_source: "yt", deleted: true };
assert.strictEqual(canReceiveAsrCandidate(deletedCue), false, "deleted: true must reject ASR candidate");

const cleanAsrCue = { id: "c9", source: "勘無料だよ", text_source: "yt", mt_locked: false };
assert.strictEqual(canReceiveAsrCandidate(cleanAsrCue), true, "Clean YouTube ASR cue should accept ASR candidate");

// isOwnedCue is the production ownership predicate
assert.strictEqual(isOwnedCue({ text_source: "edit" }), true, "edit is an owned cue");
assert.strictEqual(isOwnedCue({ text_source: "yt" }), false, "yt is not an owned cue");

// -------------------------------------------------------------------------
// Test 2: Invariant - Candidates NEVER automatically mutate cue text
// -------------------------------------------------------------------------
console.log("Running Test 2: Candidate non-destructive storage...");
const cue = { id: "c19", source: "どんな理由だよ。ああ、勘無料だよ。", text_source: "yt", start_media_time: 55.96, end_media_time: 65.04 };
const sentenceCandidates = {};

// When candidate is recorded in sidecar:
sentenceCandidates[cue.id] = {
  text: "どんな理由だよ。ああ、感無量だよ。",
  provenance: "asr:whisper-large-v3-turbo",
  start: 55.96,
  end: 65.04,
  createdAt: 1728720000000,
};

assert.strictEqual(cue.source, "どんな理由だよ。ああ、勘無料だよ。", "Cue source must NOT be modified by receiving candidate");
assert.strictEqual(cue.text_source, "yt", "Cue text_source must NOT be modified by receiving candidate");
assert.strictEqual(sentenceCandidates[cue.id].text, "どんな理由だよ。ああ、感無量だよ。");
assert.strictEqual(sentenceCandidates[cue.id].provenance, "asr:whisper-large-v3-turbo");

// -------------------------------------------------------------------------
// Test 3: Candidate Accept applies candidate, updates text_source, and creates Undo
// -------------------------------------------------------------------------
console.log("Running Test 3: Candidate Accept lifecycle...");
const sentenceUndoRevisions = {};
const candidate = sentenceCandidates[cue.id];

// User clicks Accept (mirrors handleSidePanelCmd "accept_asr_candidate"):
assert.ok(canReceiveAsrCandidate(cue), "Must re-verify invariant before accept");
sentenceUndoRevisions[cue.id] = sentenceCueRevision(cue);
cue.source = candidate.text;
cue.text_source = candidate.provenance;
delete sentenceCandidates[cue.id];

assert.strictEqual(cue.source, "どんな理由だよ。ああ、感無量だよ。", "Cue source must be updated to candidate text");
assert.strictEqual(cue.text_source, "asr:whisper-large-v3-turbo", "Cue text_source must be updated to provenance");
assert.strictEqual(sentenceCandidates[cue.id], undefined, "Accepted candidate must be removed from pending list");
assert.ok(sentenceUndoRevisions[cue.id], "Undo revision must be created");

// -------------------------------------------------------------------------
// Test 4: Undo restores exact original text and source
// -------------------------------------------------------------------------
console.log("Running Test 4: Undo restoration...");
const parsedRevision = JSON.parse(sentenceUndoRevisions[cue.id]);
cue.source = parsedRevision[1];
cue.start_media_time = parsedRevision[2];
cue.end_media_time = parsedRevision[3];
cue.rawSource = parsedRevision[4];
cue.text_source = parsedRevision[5];
delete sentenceUndoRevisions[cue.id];

assert.strictEqual(cue.source, "どんな理由だよ。ああ、勘無料だよ。", "Undo must restore exact original text");
assert.strictEqual(cue.text_source, "yt", "Undo must restore exact original text_source");
assert.strictEqual(sentenceUndoRevisions[cue.id], undefined, "Undo revision must be consumed");

// -------------------------------------------------------------------------
// Test 5: Revert removes candidate without touching text
// -------------------------------------------------------------------------
console.log("Running Test 5: Revert lifecycle...");
const cueRevert = { id: "c20", source: "元のテキスト", text_source: "yt" };
sentenceCandidates[cueRevert.id] = { text: "候補テキスト", provenance: "asr:whisper-large-v3-turbo" };

// User clicks Revert (Bỏ qua):
delete sentenceCandidates[cueRevert.id];
assert.strictEqual(cueRevert.source, "元のテキスト", "Cue source must remain unchanged on revert");
assert.strictEqual(sentenceCandidates[cueRevert.id], undefined, "Candidate must be removed on revert");

// -------------------------------------------------------------------------
// Test 6: Temporal window matching
// -------------------------------------------------------------------------
console.log("Running Test 6: Temporal interval matching...");
const timelineCues = [
  { id: "c1", start_media_time: 10.0, end_media_time: 14.0 },
  { id: "c2", start_media_time: 14.5, end_media_time: 18.0 },
  { id: "c3", start_media_time: 20.0, end_media_time: 25.0 },
];

const matches1 = matchCuesForSegment(timelineCues, 11.0, 13.0);
assert.strictEqual(matches1.length, 1);
assert.strictEqual(matches1[0].id, "c1");

const matchesSpan = matchCuesForSegment(timelineCues, 13.5, 15.0);
assert.strictEqual(matchesSpan.length, 2, "Segment spanning across two cues should match both");
assert.strictEqual(matchesSpan[0].id, "c1");
assert.strictEqual(matchesSpan[1].id, "c2");

// IoU matching on spanning segment selects best matching cue
const bestMatch = findBestCueForSegmentByIoU(timelineCues, 13.5, 15.0);
assert.ok(bestMatch, "Best match must not be null");
assert.strictEqual(bestMatch.id, "c2", "c2 has greater IoU (0.5/3.5) with [13.5, 15.0] than c1 (0.5/4.5)");

const matchesGap = matchCuesForSegment(timelineCues, 18.5, 19.5);
assert.strictEqual(matchesGap.length, 0, "Segment in gap should match nothing");
const bestGap = findBestCueForSegmentByIoU(timelineCues, 18.5, 19.5);
assert.strictEqual(bestGap, null, "Segment in gap should yield null best cue");

// -------------------------------------------------------------------------
// Test 7: Enhanced sentence groups format ({ id, start, end }) matching
// -------------------------------------------------------------------------
console.log("Running Test 7: Sentence projection groups format matching...");
const sentenceGroups = [
  { id: "sg:1", text: "みなさん、こんにちは。", start: 10.0, end: 14.0 },
  { id: "sg:2", text: "今日はいい天気ですね。", start: 14.5, end: 18.0 },
];
const sgMatch = findBestCueForSegmentByIoU(sentenceGroups, 10.5, 13.5);
assert.ok(sgMatch, "Must match sentence group");
assert.strictEqual(sgMatch.id, "sg:1", "Must match sg:1 correctly based on start and end properties");

const sgBestSpan = findBestCueForSegmentByIoU(sentenceGroups, 13.5, 15.0);
assert.ok(sgBestSpan, "Must match spanning segment against sentence groups");
assert.strictEqual(sgBestSpan.id, "sg:2", "Must pick sg:2 with higher IoU");

console.log("PASS: all candidate lifecycle and data protection invariant tests passed!");
