/**
 * Quick node asserts for import TXT timeline parse (no console noise on pass).
 * Run: node extension/shared/import_parse_test.js
 */
const assert = require("assert");
const {
  parseExportTxt,
  parseTimeToken,
  normalizeParsedImportRows,
  compareCueTimeline,
} = require("./import_parse.js");

assert.strictEqual(parseTimeToken("0:00"), 0);
assert.strictEqual(parseTimeToken("0:02"), 2);
assert.strictEqual(parseTimeToken("1:02.5"), 62.5);

const hyphen = parseExportTxt(`[001] 0:00 - 0:02
JA: こんにちは
EN: Hello
VI: Xin chào
----------
[002] 0:02 - 0:05
JA: 世界
`);
assert.strictEqual(hyphen.length, 2);
assert.strictEqual(hyphen[0].start_media_time, 0);
assert.strictEqual(hyphen[0].end_media_time, 2);
assert.strictEqual(hyphen[0].source, "こんにちは");
assert.strictEqual(hyphen[1].start_media_time, 2);
assert.strictEqual(hyphen[1].end_media_time, 5);

const arrow = parseExportTxt(`[001] 0:00 → 0:02
JA: a
`);
assert.strictEqual(arrow[0].start_media_time, 0);
assert.strictEqual(arrow[0].end_media_time, 2);

const asciiArrow = parseExportTxt(`[012] 0:28 -> 0:36
JA: ascii-arrow
`);
assert.strictEqual(asciiArrow[0].start_media_time, 28);
assert.strictEqual(asciiArrow[0].end_media_time, 36);

const nospace = parseExportTxt(`[001] 0:08-0:10
JA: nospace
`);
assert.strictEqual(nospace[0].start_media_time, 8);
assert.strictEqual(nospace[0].end_media_time, 10);

// Cue-index range inside brackets is NOT a time range.
const indexRange = parseExportTxt(`[012-013] 0:28 - 0:36
JA: range-id
EN: Hello
VI: Xin chào
`);
assert.strictEqual(indexRange.length, 1);
assert.strictEqual(indexRange[0].start_media_time, 28);
assert.strictEqual(indexRange[0].end_media_time, 36);
assert.strictEqual(indexRange[0].source, "range-id");

const indexRangeArrow = parseExportTxt(`[012-013] 0:28 → 0:36
JA: range-arrow
`);
assert.strictEqual(indexRangeArrow[0].start_media_time, 28);
assert.strictEqual(indexRangeArrow[0].end_media_time, 36);

// Multi-head without ---------- → N rows (not overwrite to 1).
const multiHead = parseExportTxt(`[001] 0:00 - 0:02
JA: first
EN: One
[002] 0:02 - 0:05
JA: second
VI: Hai
`);
assert.strictEqual(multiHead.length, 2);
assert.strictEqual(multiHead[0].source, "first");
assert.strictEqual(multiHead[0].en, "One");
assert.strictEqual(multiHead[1].source, "second");
assert.strictEqual(multiHead[1].vi, "Hai");
assert.strictEqual(multiHead[0].start_media_time, 0);
assert.strictEqual(multiHead[1].start_media_time, 2);

// Multi-cue file out of order → sorted by start then end.
const unordered = parseExportTxt(`[020] 1:00 - 1:05
JA: later
----------
[012-013] 0:28 - 0:36
JA: earlier
----------
[015] 0:28 - 0:30
JA: same-start-shorter
`);
assert.strictEqual(unordered.length, 3);
assert.strictEqual(unordered[0].start_media_time, 28);
assert.strictEqual(unordered[0].end_media_time, 30);
assert.strictEqual(unordered[0].source, "same-start-shorter");
assert.strictEqual(unordered[1].start_media_time, 28);
assert.strictEqual(unordered[1].end_media_time, 36);
assert.strictEqual(unordered[1].source, "earlier");
assert.strictEqual(unordered[2].start_media_time, 60);
assert.strictEqual(unordered[2].source, "later");

assert.ok(compareCueTimeline(unordered[0], unordered[1]) < 0);
assert.ok(compareCueTimeline(unordered[1], unordered[2]) < 0);

const rows = normalizeParsedImportRows(hyphen);
assert.strictEqual(rows[0].start_media_time, 0);
assert.strictEqual(rows[0].end_media_time, 2);

// Empty JA:/EN:/VI: lines are kept (orphan EN, blank columns).
const emptyCols = parseExportTxt(`[001] 0:00 → 0:13
JA: 私は毒島すみれ、図書委員です。
EN: I am Sumire Busujima, a library committee member.
VI:
----------
[003] 0:20 → 0:24
JA:
EN: (extra English line with no Japanese match)
VI:
`);
assert.strictEqual(emptyCols.length, 2);
assert.strictEqual(emptyCols[0].source, "私は毒島すみれ、図書委員です。");
assert.strictEqual(emptyCols[0].en, "I am Sumire Busujima, a library committee member.");
assert.strictEqual(emptyCols[0].vi, "");
assert.strictEqual(emptyCols[1].source, "");
assert.strictEqual(emptyCols[1].en, "(extra English line with no Japanese match)");
assert.strictEqual(emptyCols[1].vi, "");
assert.strictEqual(emptyCols[1].start_media_time, 20);
assert.strictEqual(emptyCols[1].end_media_time, 24);

process.exit(0);
