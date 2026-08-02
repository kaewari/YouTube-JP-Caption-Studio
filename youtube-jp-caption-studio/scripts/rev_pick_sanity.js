#!/usr/bin/env node
/**
 * Sanity check for pickCacheSide() in extension/content/content.js — the single
 * gate that decides whether chrome.storage or the bridge disk copy wins a load.
 * content.js is an IIFE with no exports, so lift the function out of the source.
 */
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "../extension/content/content.js"),
  "utf8"
);
const match = src.match(/\n {2}function pickCacheSide\([\s\S]*?\n {2}\}\n/);
if (!match) {
  console.error("FAIL: pickCacheSide not found in content.js");
  process.exit(1);
}
const pickCacheSide = new Function(`${match[0]}; return pickCacheSide;`)();

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const rich = 100;
const poor = 1;

// rev wins outright — this is what lets a deletion beat the richer old copy.
assert(
  pickCacheSide({ rev: 5, score: poor }, { rev: 4, score: rich }) === "local",
  "higher rev wins even when the loser is richer"
);
assert(
  pickCacheSide({ rev: 4, score: rich }, { rev: 5, score: poor }) === "disk",
  "higher rev wins from the disk side too"
);

// Missing meta reads as rev 0, so any real rev beats it.
assert(pickCacheSide({}, { rev: 1 }) === "disk", "absent rev counts as 0");
assert(
  pickCacheSide({ rev: "3" }, { rev: 2 }) === "local",
  "string rev from storage still compares numerically"
);

// Equal rev falls back to richness, then deviceId for a stable answer.
assert(
  pickCacheSide({ rev: 7, score: poor }, { rev: 7, score: rich }) === "disk",
  "equal rev → richer list wins"
);
assert(
  pickCacheSide(
    { rev: 7, score: rich, deviceId: "mac" },
    { rev: 7, score: rich, deviceId: "ipad" }
  ) === "local",
  "equal rev + equal score → deviceId decides"
);
assert(
  pickCacheSide(
    { rev: 7, score: rich, deviceId: "ipad" },
    { rev: 7, score: rich, deviceId: "mac" }
  ) === "disk",
  "deviceId tiebreak is symmetric (same winner from either side)"
);
assert(
  pickCacheSide({ rev: 0 }, { rev: 0 }) === "local",
  "two empty sides resolve deterministically"
);
