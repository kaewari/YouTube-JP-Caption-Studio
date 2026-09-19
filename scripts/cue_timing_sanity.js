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

// Authentic timing: start and end are preserved 100% as provided by YouTube timedtext.
const rolling = clampCueEndsToNextStart([
  { start: 0.0, end: 5.56, text: "Hello and welcome" },
  { start: 2.6, end: 8.56, text: "So, do you want" },
  { start: 5.56, end: 10.84, text: "to use Gemini" },
]);
assert(rolling.length === 3, `kept ${rolling.length} cues`);
assert(rolling[0].start === 0.0 && rolling[0].text === "Hello and welcome", "start/text unchanged");
assert(rolling[0].end === 5.56, `cue0 end preserved authentic 5.56, got ${rolling[0].end}`);
assert(rolling[1].end === 8.56, `cue1 end preserved authentic 8.56, got ${rolling[1].end}`);
assert(rolling[2].end === 10.84, `last cue keeps YT end ${rolling[2].end}`);

// Non-overlapping cues preserve their true end time (no artificial stretch into silence)
const naturalTiming = clampCueEndsToNextStart([
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
assert(naturalTiming[0].start_media_time === 0.12, "start preserved");
assert(
  naturalTiming[0].end_media_time === 3.12,
  `cue 0 end keeps authentic duration (3.12), got ${naturalTiming[0].end_media_time}`
);
assert(naturalTiming[1].end_media_time === 13.36, "last end kept");

// Clean non-overlapping cues stay at their own end times.
const clean = clampCueEndsToNextStart([
  { start: 1, end: 2, text: "a" },
  { start: 2.5, end: 3.5, text: "b" },
]);
assert(
  clean[0].end === 2,
  `clean end kept authentic end 2, got ${clean[0].end}`
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
