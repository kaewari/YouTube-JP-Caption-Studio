#!/usr/bin/env node
/**
 * Sanity: union-merge EN/VI onto JA rows (±tol / overlap); keep orphan EN; skip locked.
 */
const path = require("path");
const {
  fillYtSecondary,
  DEFAULT_TOL,
} = require(path.join(__dirname, "../extension/content/fill_yt_secondary.js"));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

// --- paint + lock (existing behavior) ---
const cues = [
  { start_media_time: 1.0, end_media_time: 1.8, source: "あ", en: "", vi: "", translation_source: "" },
  { start_media_time: 2.0, end_media_time: 2.8, source: "い", en: "keep", vi: "", translation_source: "user", mt_locked: true },
  { start_media_time: 3.0, end_media_time: 3.8, source: "う", en: "", vi: "giữ", translation_source: "import", mt_locked: true },
  { start_media_time: 4.0, end_media_time: 4.8, source: "え", en: "", vi: "", translation_source: "" },
];
const enCues = [
  { start: 1.05, end: 1.7, text: "hello" },
  { start: 2.0, end: 2.5, text: "overwrite-me" },
  { start: 4.4, end: 4.9, text: "too-far" },
  { start: 9.0, end: 9.5, text: "orphan-en" },
];
const viCues = [
  { start: 0.9, end: 1.5, text: "xin chào" },
  { start: 3.0, end: 3.5, text: "đè" },
  { start: 4.2, end: 4.6, text: "gần" },
  { start: 9.05, end: 9.6, text: "orphan-vi" },
];

const n = fillYtSecondary(cues, enCues, viCues, { tol: DEFAULT_TOL });
// start±tol paints + overlap paints "too-far" onto cue3 (was orphan) + 2 orphans merged
assert(n === 6, `changed ${n} (expect 6: 4 paints + orphan-en + orphan-vi)`);
assert(cues[0].en === "hello" && cues[0].vi === "xin chào", "cue0 filled en+vi");
assert(cues[0].translation_source === "yt" && cues[0].translated, "cue0 source yt");
assert(cues[1].en === "keep" && !cues[1].vi, "locked user en kept, vi blank stays");
assert(cues[2].vi === "giữ" && !cues[2].en, "locked import vi kept");
assert(cues[3].en === "too-far" && cues[3].vi === "gần", "cue3 overlap en + tol vi");
assert(cues[3].translation_source === "yt", "cue3 marked yt");

const farOrphan = cues.find((c) => String(c.en || "") === "too-far" && !c.source);
assert(!farOrphan, "overlap en stays on JA (not orphan)");

const orphan = cues.find((c) => String(c.en || "") === "orphan-en");
assert(!!orphan, "orphan EN kept as new row");
assert(orphan.source === "", "orphan JA empty");
assert(orphan.vi === "orphan-vi", "orphan VI merged onto same row (±tol)");
assert(orphan.translation_source === "yt" && orphan.translated, "orphan marked yt");
assert(cues.length === 5, `cue count ${cues.length} (4 JA + 1 orphan row)`);

const again = fillYtSecondary(cues, enCues, viCues, { tol: DEFAULT_TOL });
assert(again === 0, "second pass fills nothing");

// --- all three on one row ---
const trio = [{ start_media_time: 0, end_media_time: 1, source: "私", en: "", vi: "" }];
const n3 = fillYtSecondary(
  trio,
  [{ start: 0.1, text: "I" }],
  [{ start: 0.2, text: "tôi" }],
  { tol: DEFAULT_TOL }
);
assert(n3 === 2, "all-3 fill changed 2 fields");
assert(trio.length === 1 && trio[0].en === "I" && trio[0].vi === "tôi", "all-3 on one row");
assert(trio[0].source === "私", "JA source kept");

// --- appendOrphans: false (owned scripts) ---
const owned = [{ start_media_time: 1, end_media_time: 2, source: "ね", en: "", vi: "" }];
const nOwn = fillYtSecondary(
  owned,
  [{ start: 5, text: "skip-orphan" }],
  null,
  { tol: DEFAULT_TOL, appendOrphans: false }
);
assert(nOwn === 0 && owned.length === 1, "owned: no orphan append");

// --- owned: start skew > tol but overlapping window (B9: blank at 1:21) ---
const skew = [
  {
    start_media_time: 81.1,
    end_media_time: 86.4,
    source: "ホーム",
    en: "",
    vi: "",
    translation_source: "",
  },
];
const nSkew = fillYtSecondary(
  skew,
  [{ start: 80.0, end: 85.0, text: "I've made it to the platform." }],
  [{ start: 80.2, end: 84.5, text: "Tàu tốc hành Azusa" }],
  { tol: DEFAULT_TOL, appendOrphans: false }
);
assert(nSkew === 2, `owned overlap fill changed ${nSkew}`);
assert(
  skew[0].en.includes("platform") && skew[0].vi.includes("Azusa"),
  "owned blank filled via overlap despite start dt>tol"
);
assert(skew.length === 1 && skew[0].translated, "owned: no orphan, translated set");

if (process.exitCode) {
  console.error("fill_yt_secondary sanity FAILED");
} else {
  console.log("fill_yt_secondary sanity PASSED");
}
