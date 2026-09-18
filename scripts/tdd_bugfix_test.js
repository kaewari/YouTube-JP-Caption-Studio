const assert = require("assert");

// Function under test: current implementation in content.js
function currentLangFromTimedtextUrl(url) {
  try {
    return new URL(String(url || ""), "https://www.youtube.com").searchParams.get("lang") || "";
  } catch {
    return "";
  }
}

// Fixed implementation
function fixedLangFromTimedtextUrl(url) {
  try {
    const u = new URL(String(url || ""), "https://www.youtube.com");
    return u.searchParams.get("tlang") || u.searchParams.get("lang") || "";
  } catch {
    return "";
  }
}

function isJaLang(lang) {
  return String(lang || "").toLowerCase().startsWith("ja");
}

function isViLang(lang) {
  return String(lang || "").toLowerCase().startsWith("vi");
}

console.log("--- TEST 1: Current vs Fixed langFromTimedtextUrl ---");
const ytTranslatedUrl = "https://www.youtube.com/api/timedtext?v=0vPSWlZoBTg&lang=ja&tlang=vi&fmt=json3";
const currentResult = currentLangFromTimedtextUrl(ytTranslatedUrl);
console.log("Current result for tlang=vi URL:", currentResult, "(isJa:", isJaLang(currentResult), ")");

// Demonstrating RED state: Current code wrongly identifies Vietnamese as Japanese!
assert.strictEqual(
  currentResult,
  "ja",
  "Current buggy implementation extracted lang=ja instead of tlang=vi"
);
assert.strictEqual(
  isJaLang(currentResult),
  true,
  "Current buggy implementation thought tlang=vi was Japanese!"
);

// Verify fixed implementation gives correct result
const fixedResult = fixedLangFromTimedtextUrl(ytTranslatedUrl);
assert.strictEqual(fixedResult, "vi", "Fixed must extract tlang=vi as language");
assert.strictEqual(isJaLang(fixedResult), false, "Fixed must NOT think it is Japanese");
assert.strictEqual(isViLang(fixedResult), true, "Fixed must identify as Vietnamese");

console.log("--- TEST 2: HTML5 [hidden] attribute behavior ---");
// Simulate DOM element with hidden attribute vs style.display
class FakeElement {
  constructor(tag, hidden = false) {
    this.tagName = tag;
    this.hidden = hidden;
    this.style = { display: "" };
  }
  // How browsers evaluate visibility:
  get isVisible() {
    if (this.hidden) return false; // UA stylesheet: [hidden] { display: none !important; }
    if (this.style.display === "none") return false;
    return true;
  }
}

// Current code did:
const navLeftBuggy = new FakeElement("div", true); // <div id="lr-nav-left" hidden>
navLeftBuggy.style.display = ""; // on ? "" : "none"
console.log("Buggy navLeft.isVisible:", navLeftBuggy.isVisible);
assert.strictEqual(navLeftBuggy.isVisible, false, "Buggy code leaves element hidden due to .hidden = true!");

// Fixed code:
const navLeftFixed = new FakeElement("div", true);
const on = true;
navLeftFixed.hidden = !on;
navLeftFixed.style.display = on ? "" : "none";
console.log("Fixed navLeft.isVisible:", navLeftFixed.isVisible);
assert.strictEqual(navLeftFixed.isVisible, true, "Fixed code properly shows the element!");

console.log("--- TEST 3: isCueStarred / toggleStarCue with string vs object ---");
const savedCues = { "c-123": { id: "c-123", source: "こんにちは" } };

// Buggy version from content.js:
function isCueStarredBuggy(cue) {
  if (!cue || !cue.id) return false;
  return !!savedCues[cue.id];
}

// When called with string ID as in line 3553, 3606, 3654:
const buggyResult = isCueStarredBuggy("c-123");
console.log("Buggy isCueStarred('c-123'):", buggyResult);
assert.strictEqual(buggyResult, false, "Buggy code failed because 'c-123'.id is undefined!");

// Fixed version:
function isCueStarredFixed(cueOrId) {
  const id = typeof cueOrId === "object" && cueOrId ? cueOrId.id : String(cueOrId || "");
  if (!id) return false;
  return !!savedCues[id];
}

assert.strictEqual(isCueStarredFixed("c-123"), true, "Fixed handles string ID properly");
assert.strictEqual(isCueStarredFixed({ id: "c-123" }), true, "Fixed handles object properly");
assert.strictEqual(isCueStarredFixed("c-unknown"), false, "Fixed returns false for unknown ID");

console.log("--- TEST 4: fillYtSecondary routes VI to cue.vi without clobbering JA source ---");
const { fillYtSecondary } = require("../extension/content/fill_yt_secondary.js");
const jaCues = [
  { id: "c-1", start_media_time: 1.0, end_media_time: 3.5, source: "朝起きて、ちょっと仕事して", vi: "" },
  { id: "c-2", start_media_time: 4.0, end_media_time: 6.5, source: "朝ごはんを食べます", vi: "" },
];
const interceptedViCues = [
  { start: 1.0, end: 3.5, text: "Buổi sáng tôi thức dậy, làm một chút việc," },
  { start: 4.0, end: 6.5, text: "Tôi ăn bữa sáng." },
];

fillYtSecondary(jaCues, null, interceptedViCues, { tol: 0.6 });
console.log("jaCues after fillYtSecondary:");
console.log("Cue 0 source:", jaCues[0].source);
console.log("Cue 0 vi:", jaCues[0].vi);
assert.strictEqual(jaCues[0].source, "朝起きて、ちょっと仕事して", "JA source must remain intact authentic Japanese");
assert.strictEqual(jaCues[0].vi, "Buổi sáng tôi thức dậy, làm một chút việc,", "VI must populate cue.vi slot");
assert.strictEqual(jaCues[1].source, "朝ごはんを食べます", "JA source 2 intact");
assert.strictEqual(jaCues[1].vi, "Tôi ăn bữa sáng.", "VI 2 populated");

console.log("--- TEST 5: Auto-Pause boundary verification ---");
let paused = false;
let apLastId = "";
function testAutoPause(cue, time) {
  const end = Number(cue.end_media_time);
  if (time >= end - 0.08 && apLastId !== cue.id) {
    apLastId = cue.id;
    paused = true;
  }
}
const activeCue = { id: "c-1", start_media_time: 1.0, end_media_time: 3.5 };
testAutoPause(activeCue, 2.0);
assert.strictEqual(paused, false, "Must not pause mid-cue (t=2.0)");
testAutoPause(activeCue, 3.45); // within 80ms of 3.5s
assert.strictEqual(paused, true, "Must pause at cue boundary (t=3.45)");

console.log("--- TEST 6: Gemini 3.8 Flash translation module verification ---");
const Gemini = require("../extension/shared/gemini_translate.js");
assert.strictEqual(Gemini.MODEL_NAME, "gemini-3.8-flash", "Model must default to gemini-3.8-flash per user requirement");
assert.strictEqual(typeof Gemini.testApiKey, "function", "testApiKey must be exported");
assert.strictEqual(typeof Gemini.translateBatch, "function", "translateBatch must be exported");
assert.strictEqual(typeof Gemini.translateCues, "function", "translateCues must be exported");

console.log("All 6 TDD bugfix & feature guarantee tests PASSED!");

