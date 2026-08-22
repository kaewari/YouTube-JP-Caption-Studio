#!/usr/bin/env node
/**
 * Sanity: matchLangFamily() in service_worker.js + page_capture.js matches
 * lang variants (vi, vi-VN, vie, VI, vi_vn, en, eng, ja, jpn…) and rejects
 * unrelated codes (fr, auto, ""). Extracts the helper from disk so the test
 * covers the real shipped code, not a copy.
 */
const fs = require("fs");
const path = require("path");

const files = [
  path.join(__dirname, "../extension/background/service_worker.js"),
  path.join(__dirname, "../extension/injected/page_capture.js"),
];

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

function extractHelper(src) {
  const aliases = src.match(/const LANG_FAMILY_ALIASES = \{[\s\S]*?\};/);
  const fn = src.match(/function matchLangFamily\(lang, family\) \{[\s\S]*?\n(?:  )?\}/);
  if (!aliases || !fn) return null;
  return `${aliases[0]}\n${fn[0]}`;
}

for (const file of files) {
  const src = fs.readFileSync(file, "utf-8");
  const helper = extractHelper(src);
  assert(!!helper, `${path.basename(file)} contains matchLangFamily helper`);
  if (!helper) continue;
  const matchLangFamily = new Function(`${helper}; return matchLangFamily;`)();

  // vi family: exact, region, 3-letter, upper, underscore, display-ish
  assert(matchLangFamily("vi", "vi") === true, "vi matches vi");
  assert(matchLangFamily("vi-VN", "vi") === true, "vi-VN matches vi");
  assert(matchLangFamily("vie", "vi") === true, "vie matches vi");
  assert(matchLangFamily("VI", "vi") === true, "VI (upper) matches vi");
  assert(matchLangFamily("vi_vn", "vi") === true, "vi_vn matches vi");
  assert(matchLangFamily("viet", "vi") === true, "viet matches vi");
  assert(matchLangFamily("vn", "vi") === true, "vn matches vi");

  // en + ja families
  assert(matchLangFamily("en", "en") === true, "en matches en");
  assert(matchLangFamily("en-US", "en") === true, "en-US matches en");
  assert(matchLangFamily("eng", "en") === true, "eng matches en");
  assert(matchLangFamily("ja", "ja") === true, "ja matches ja");
  assert(matchLangFamily("ja-JP", "ja") === true, "ja-JP matches ja");
  assert(matchLangFamily("jpn", "ja") === true, "jpn matches ja");
  assert(matchLangFamily("jp", "ja") === true, "jp matches ja");

  // negatives + cross-family rejects
  assert(matchLangFamily("fr", "vi") === false, "fr does not match vi");
  assert(matchLangFamily("en", "vi") === false, "en does not match vi");
  assert(matchLangFamily("vi", "ja") === false, "vi does not match ja");
  assert(matchLangFamily("", "vi") === false, "empty does not match vi");
  assert(matchLangFamily("auto", "vi") === false, "auto does not match vi");
  console.log("  ✔", path.basename(file));
}

console.log(process.exitCode ? "lang_family sanity: FAIL" : "lang_family sanity: PASS");