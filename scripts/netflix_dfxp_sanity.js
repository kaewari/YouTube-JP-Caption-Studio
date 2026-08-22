#!/usr/bin/env node
/**
 * Sanity checks for extension/shared/dfxp_parser.js
 */
let fs, path, parseDfxp, parseTime, cleanText, decodeXmlEntities;

if (typeof require !== "undefined") {
  fs = require("fs");
  path = require("path");
  const mod = require(path.join(__dirname, "../extension/shared/dfxp_parser.js"));
  parseDfxp = mod.parseDfxp;
  parseTime = mod.parseTime;
  cleanText = mod.cleanText;
  decodeXmlEntities = mod.decodeXmlEntities;
} else {
  load("extension/shared/dfxp_parser.js");
  const mod = HardsubDfxpParser;
  parseDfxp = mod.parseDfxp;
  parseTime = mod.parseTime;
  cleanText = mod.cleanText;
  decodeXmlEntities = mod.decodeXmlEntities;
}

function assert(cond, msg) {
  if (!cond) {
    if (typeof console !== "undefined" && console.error) console.error("FAIL:", msg);
    else print("FAIL: " + msg);
    if (typeof process !== "undefined") process.exitCode = 1;
    else throw new Error("FAIL: " + msg);
  } else {
    if (typeof console !== "undefined" && console.log) console.log("ok:", msg);
    else print("ok: " + msg);
  }
}

// 1. Time parsing checks
assert(parseTime("10000000t", 10000000) === 1.0, "tick rate parse 10000000t = 1.0s");
assert(parseTime("35000000t", 10000000) === 3.5, "tick rate parse 35000000t = 3.5s");
assert(parseTime("1500ms") === 1.5, "ms parse 1500ms = 1.5s");
assert(parseTime("2.75s") === 2.75, "seconds parse 2.75s = 2.75s");
assert(Math.abs(parseTime("00:01:23.456") - 83.456) < 1e-6, "clock parse 00:01:23.456");
assert(Math.abs(parseTime("01:00:00.000") - 3600) < 1e-6, "clock parse 01:00:00.000 = 3600s");

// 2. XML entity and HTML cleanup
const raw = "  <span>Hello &amp; &#39;World&#39; &lt;tag&gt;</span><br/>Next Line  ";
const cleaned = cleanText(raw);
assert(cleaned === "Hello & 'World' <tag>\nNext Line", "cleanText decoded entities properly");

// 3. Parse sample DFXP
let sampleXml = "";
if (typeof fs !== "undefined" && fs.readFileSync) {
  sampleXml = fs.readFileSync(path.join(__dirname, "../testdata/netflix_sample.xml"), "utf-8");
} else if (typeof readFile === "function") {
  sampleXml = readFile("testdata/netflix_sample.xml");
} else {
  sampleXml = '<?xml version="1.0" encoding="utf-8"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="10000000" xml:lang="ja"><body><div><p begin="10000000t" end="35000000t"><span>こんにちは、&lt;世界&gt;！</span></p><p begin="00:00:04.120" end="00:00:06.840">これは<br/>テスト字幕です。</p><p begin="7.5s" dur="2.1s"><span>Netflix&#39;s Japanese &amp; English test</span></p></div></body></tt>';
}

const cues = parseDfxp(sampleXml);
assert(cues.length === 3, "parsed 3 cues from sample DFXP");
assert(cues[0].start === 1.0 && cues[0].end === 3.5, "cue 0 timing: start=1.0, end=3.5");
assert(cues[0].text === "こんにちは、<世界>！", "cue 0 text");

assert(cues[1].start === 4.12 && cues[1].end === 6.84, "cue 1 timing: start=4.12, end=6.84");
assert(cues[1].text === "これは\nテスト字幕です。", "cue 1 text");

assert(cues[2].start === 7.5 && Math.abs(cues[2].end - 9.6) < 1e-6, "cue 2 timing (dur): start=7.5, end=9.6");
assert(cues[2].text === "Netflix's Japanese & English test", "cue 2 text");

if (typeof console !== "undefined" && console.log) {
  console.log("All DFXP parser sanity checks passed!");
} else {
  print("All DFXP parser sanity checks passed!");
}
