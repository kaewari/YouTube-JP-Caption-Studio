#!/usr/bin/env node
/** Source coverage checks. Snapshots are NOT audio/translation gold or live API proof. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Parse = require("../extension/shared/timedtext_parse.js");
const Normalize = require("../extension/content/normalize_cues.js");
const Groups = require("../extension/shared/sentence_groups.js");

const input = path.resolve(process.argv[2] || path.join(__dirname, "../testdata/sentence-mvp/parako-continuation-source.json3.json"));
const files = fs.statSync(input).isDirectory()
  ? fs.readdirSync(input).filter(name => name.endsWith(".timedtext.json3.json")).map(name => path.join(input, name))
  : [input];
assert.ok(files.length, "No captured JSON3 snapshots supplied");
for (const file of files) {
  const raw = Parse.parseJson3Cues(JSON.parse(fs.readFileSync(file, "utf8")), { includeSource: true });
  const normalized = Normalize.normalizeCues(raw, { includeSource: true });
  const cues = normalized.map((c, i) => ({
    id: "snapshot-" + i, source: c.text, start_media_time: c.start, end_media_time: c.end,
    text_source: "yt", rawSource: c.rawSource, normalization: c.normalization,
  }));
  const before = JSON.stringify(cues);
  const started = performance.now();
  const projection = Groups.buildSentenceGroups(cues, { sourceKey: path.basename(file) });
  const elapsed = performance.now() - started;
  for (const cue of cues) {
    const refs = projection.groups.flatMap(g => g.sourceRefs).filter(r => r.cueId === cue.id).sort((a, b) => a.charStart - b.charStart);
    let offset = 0;
    for (const ref of refs) {
      assert.equal(ref.charStart, offset, "Missing or duplicated source range");
      offset = ref.charEnd;
    }
    assert.equal(offset, cue.source.length);
    assert.equal(refs.map(r => cue.source.slice(r.charStart, r.charEnd)).join(""), cue.source);
    assert.ok(projection.displayUnits.some(u => u.sourceCueId === cue.id));
  }
  assert.equal(JSON.stringify(cues), before);
  assert.ok(projection.displayUnits.every(u => u.end_media_time > u.start_media_time));
  if (file.includes("continuation") || file.includes("ylnxFdPhLCo")) {
    assert.ok(projection.groups.some(g => g.text.endsWith("乗せてないんですか?")));
    assert.ok(projection.groups.some(g => g.text === "どこ行くんですか?"));
  }
  console.log(JSON.stringify({ file: path.basename(file), cues: cues.length, groups: projection.groups.length,
    merges: projection.groups.filter(g => g.action === "merge").length, units: projection.displayUnits.length,
    groupBuildMs: +elapsed.toFixed(3), sourceCoverage: "exact", groundTruth: "NOT VERIFIED" }));
}
console.log("PASS: captured source coverage and continuation examples; not a gold/KPI or browser benchmark");
