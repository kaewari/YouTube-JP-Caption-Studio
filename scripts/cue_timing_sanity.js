#!/usr/bin/env node
/**
 * Sanity checks for extension/content/cue_timing.js clampCueEndsToNextStart.
 */
const path = require("path");
const {
  applyManualTimes,
  clampCueEndsToNextStart,
  GAP,
  MIN_DUR,
} = require(path.join(__dirname, "../extension/content/cue_timing.js"));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

// Rolling ASR overlaps → snap end to next.start - GAP (shorten).
const rolling = clampCueEndsToNextStart([
  { start: 0.0, end: 5.56, text: "Hello and welcome" },
  { start: 2.6, end: 8.56, text: "So, do you want" },
  { start: 5.56, end: 10.84, text: "to use Gemini" },
]);
assert(rolling.length === 3, `kept ${rolling.length} cues`);
assert(rolling[0].start === 0.0 && rolling[0].text === "Hello and welcome", "start/text unchanged");
assert(
  Math.abs(rolling[0].end - (2.6 - GAP)) < 1e-9,
  `cue0 end snapped to next.start-GAP got ${rolling[0].end}`
);
assert(
  Math.abs(rolling[1].end - (5.56 - GAP)) < 1e-9,
  `cue1 end snapped got ${rolling[1].end}`
);
assert(rolling[2].end === 10.84, `last cue keeps YT end ${rolling[2].end}`);

// Scrolling ASR: YouTube dDurationMs=3s but next cue at ~10.36 (VTT window).
const scrolling = clampCueEndsToNextStart([
  {
    id: "a",
    start_media_time: 0.12,
    end_media_time: 3.12,
    source: "ね、未来どうした?クリスマスどうする?",
  },
  {
    id: "b",
    start_media_time: 10.36,
    end_media_time: 13.36,
    source: "ええやん。",
  },
]);
assert(scrolling[0].start_media_time === 0.12, "scrolling start preserved");
assert(
  Math.abs(scrolling[0].end_media_time - (10.36 - GAP)) < 1e-9,
  `scrolling end extended to next.start-GAP got ${scrolling[0].end_media_time}`
);
assert(scrolling[1].end_media_time === 13.36, "last scrolling end kept");

// Already abutting stays near next.start - GAP.
const clean = clampCueEndsToNextStart([
  { start: 1, end: 2, text: "a" },
  { start: 2.5, end: 3.5, text: "b" },
]);
assert(
  Math.abs(clean[0].end - (2.5 - GAP)) < 1e-9,
  `abut snap got ${clean[0].end}`
);
assert(clean[1].end === 3.5, "last end kept");

assert(typeof GAP === "number" && typeof MIN_DUR === "number", "exports GAP/MIN_DUR");

// applyManualTimes: valid inputs untouched; impossible start must not overlap next.
const manual = { start_media_time: 1, end_media_time: 2, source: "x" };
applyManualTimes(manual, 1, 2, { nextCue: { start_media_time: 5 } });
assert(
  manual.start_media_time === 1 && manual.end_media_time === 2,
  "manual times kept when they fit"
);
const clash = { start_media_time: 6, end_media_time: 7, source: "y" };
applyManualTimes(clash, 6.5, 7, { nextCue: { start_media_time: 6.5 } });
assert(
  clash.end_media_time <= 6.5 && clash.end_media_time >= clash.start_media_time,
  `fallback never overlaps next cue (got ${clash.start_media_time}→${clash.end_media_time})`
);

if (process.exitCode) {
  console.error("cue_timing sanity FAILED");
} else {
  console.log("cue_timing sanity PASSED");
}
