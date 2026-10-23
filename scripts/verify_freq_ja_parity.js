#!/usr/bin/env node
/**
 * The frequency/JLPT table ships three times: the bridge reads
 * `data/dict/freq_ja.json`, and each iOS app bundles its own copy as a
 * `Resources/` entry. Nothing checked that the three stayed in step, so a
 * rebuilt table could reach one surface and leave the others on an older one.
 *
 * Fails when any copy is missing, not valid JSON, or not byte-identical.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const COPIES = [
  "data/dict/freq_ja.json",
  "ipad-app/Resources/freq_ja.json",
  "iphone-app/Resources/freq_ja.json",
];

const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

let failed = false;
const seen = new Map();
let entries = 0;

for (const rel of COPIES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.error(`FAIL ${rel}: missing`);
    failed = true;
    continue;
  }
  const raw = fs.readFileSync(file, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`FAIL ${rel}: not valid JSON (${err.message})`);
    failed = true;
    continue;
  }
  const count = parsed && typeof parsed === "object" ? Object.keys(parsed).length : 0;
  if (!count) {
    console.error(`FAIL ${rel}: parsed to an empty table`);
    failed = true;
    continue;
  }
  entries = count;
  const hash = digest(file);
  if (!seen.has(hash)) seen.set(hash, []);
  seen.get(hash).push(rel);
}

if (seen.size > 1) {
  failed = true;
  console.error("FAIL the freq_ja.json copies disagree:");
  for (const [hash, files] of seen) console.error(`  ${hash.slice(0, 16)}  ${files.join(", ")}`);
}

if (failed) {
  console.error("freq_ja parity: FAILED (rebuild every copy from scripts/build_freq_ja.py)");
  process.exit(1);
}

console.log(`freq_ja parity: OK (${COPIES.length} copies, ${entries} entries, sha256 ${[...seen.keys()][0].slice(0, 16)})`);
