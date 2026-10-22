#!/usr/bin/env node
/**
 * Verify the built Saved Items popup is complete.
 *
 * `extension/popup/` ships the generated Next.js export, but `.gitignore`
 * excludes `extension/popup/_next/` (build output is never committed). The
 * tracked HTML still references those chunks, so a tree that was never built
 * renders a blank Saved Items page with no error anywhere. This checks the
 * artifact, not the source: every asset the HTML points at must exist on disk.
 *
 * Run after `npm run build:extension` (from web/saved-items).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const POPUP = path.join(ROOT, "extension", "popup");

function fail(msg) {
  console.error(`extension popup: ${msg}`);
  process.exit(1);
}

for (const name of ["index.html", "popup.html"]) {
  if (!fs.existsSync(path.join(POPUP, name))) fail(`${name} is missing`);
}

const html = fs.readFileSync(path.join(POPUP, "index.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
if (refs.length === 0) fail("index.html references no local assets");

const missing = [];
for (const ref of new Set(refs)) {
  const clean = ref.split("?")[0];
  if (!fs.existsSync(path.join(POPUP, clean))) missing.push(ref);
}
if (missing.length) {
  fail(
    `${missing.length} referenced asset(s) do not exist, so the popup renders blank:\n` +
      missing.map((m) => `  - ${m}`).join("\n") +
      "\nBuild it with: cd web/saved-items && npm run build:extension",
  );
}

const chunks = refs.filter((r) => r.includes("/_next/static/chunks/") && r.endsWith(".js"));
if (chunks.length === 0) fail("index.html references no _next/static/chunks/*.js — the export is not a Next build");

console.log(`extension popup: OK (${refs.length} referenced assets all present, ${chunks.length} JS chunks)`);
