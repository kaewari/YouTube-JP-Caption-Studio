#!/usr/bin/env node
/**
 * Copy Next static export (`out/`) into `extension/popup/` as the MV3 default_popup.
 * Renames index.html → popup.html and externalizes inline <script> bodies
 * (Chrome MV3 extension CSP forbids unsafe-inline script).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const outDir = join(appRoot, "out");
const destDir = join(appRoot, "..", "..", "extension", "popup");

if (!existsSync(outDir)) {
  console.error("Missing out/ — run EXTENSION_BUILD=1 next build first");
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
for (const name of [
  "_next",
  "popup.html",
  "index.html",
  "popup.js",
  "popup.css",
  "404.html",
  "_not-found",
  "images",
  "seo",
  "videos",
  "favicon.ico",
]) {
  const p = join(destDir, name);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}
// Remove prior extracted inline scripts
for (const ent of ["inline-0.js", "inline-1.js", "inline-2.js", "inline-3.js", "inline-4.js", "inline-5.js", "inline-6.js", "inline-7.js", "inline-8.js", "inline-9.js"]) {
  const p = join(destDir, ent);
  if (existsSync(p)) rmSync(p);
}

cpSync(outDir, destDir, { recursive: true });

function externalizeInlineScripts(html, outDirPath, fileTag) {
  let n = 0;
  return html.replace(
    /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi,
    (full, attrs = "", code) => {
      const a = attrs || "";
      if (/\bsrc\s*=/.test(a)) {
        // Keep external scripts; force relative ./ if needed
        return full
          .replace(/\ssrc="\//g, ' src="./')
          .replace(/\ssrc='\//g, " src='./");
      }
      if (!code || !code.trim()) return full;
      if (/type\s*=\s*["']application\/ld\+json["']/i.test(a)) return full;
      const name = `inline-${fileTag}-${n++}.js`;
      writeFileSync(join(outDirPath, name), code, "utf8");
      const keepAsync = /\basync\b/.test(a) ? " async" : "";
      const keepNomodule = /\bnomodule\b/i.test(a) ? " nomodule" : "";
      const idMatch = a.match(/\bid\s*=\s*["']([^"']+)["']/i);
      const idAttr = idMatch ? ` id="${idMatch[1]}"` : "";
      return `<script src="./${name}"${keepAsync}${keepNomodule}${idAttr}></script>`;
    },
  );
}

function fixHtml(html, tag) {
  let out = html
    .replaceAll('href="/', 'href="./')
    .replaceAll("href='/", "href='./")
    .replaceAll('src="/', 'src="./')
    .replaceAll("src='/", "src='./");
  out = externalizeInlineScripts(out, destDir, tag);
  return out;
}

const indexPath = join(destDir, "index.html");
const popupPath = join(destDir, "popup.html");
if (existsSync(indexPath)) {
  const html = fixHtml(readFileSync(indexPath, "utf8"), "main");
  writeFileSync(popupPath, html);
  writeFileSync(indexPath, html);
}

writeFileSync(
  join(destDir, "BUILD_INFO.txt"),
  `Built from web/saved-items at ${new Date().toISOString()}\nSource of truth: chrome.storage.local (userVocab, hardsubSettings)\nInline scripts externalized for MV3 CSP.\n`,
);

console.log(`Copied static Saved Items → ${destDir} (popup.html + index.html)`);
