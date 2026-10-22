#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

/**
 * Anti-Fake-Test Validator.
 *
 * Asserting `.includes()` on the bytes of a production file — or on a string
 * literal the test declared itself — is static inspection, not verification: it
 * cannot fail when the production behaviour breaks. AGENTS.md bans it outright.
 *
 * What counts as real: asserting on the RESULT of a function call. So the rule
 * below fires only when the receiver is a bare identifier assigned from
 * `fs.readFileSync(...)` or from a string/template literal. `renderRow(cue)
 * .includes("sp-vi")` stays legal — that exercises the renderer.
 *
 * ponytail: a text scan, not dataflow analysis. A value laundered through two
 * assignments escapes it. Keep assertions on call results and the ceiling never
 * matters.
 */

const ROOT = path.join(__dirname, "..");

const TARGET_DIRS = [
  __dirname,
  path.join(ROOT, "extension/shared"),
  path.join(ROOT, "extension/background"),
  path.join(ROOT, "extension/content"),
  path.join(ROOT, "extension/offscreen"),
  path.join(ROOT, "extension/sidepanel"),
  path.join(ROOT, "local-bridge/tests"),
  path.join(ROOT, "tests"),
  path.join(ROOT, "web/saved-items/tests"),
];

const SKIP_DIRS = new Set(["node_modules", ".git", "__pycache__", "out", ".next", ".venv"]);

function collect(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, out);
    } else if (/\.(js|cjs|mjs|ts|mts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Identifier assigned from the bytes of a file...
const READ_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;\n]*readFileSync\s*\(/g;
// ...or from a string/template literal the test itself wrote.
const LITERAL_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:`|'|")/g;
const STRING_METHOD = /\.(?:includes|match|startsWith|endsWith)\s*\(/;

function taintedNames(source) {
  const names = new Set();
  for (const re of [READ_RE, LITERAL_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) names.add(m[1]);
  }
  return names;
}

const violations = [];
const files = [];
for (const dir of TARGET_DIRS) collect(dir, files);

for (const file of [...new Set(files)]) {
  if (file === __filename) continue;
  const source = fs.readFileSync(file, "utf8");
  if (!/\bassert\b/.test(source)) continue;
  const names = taintedNames(source);
  if (names.size === 0) continue;

  source.split("\n").forEach((line, i) => {
    if (!/\bassert\b/.test(line) || !STRING_METHOD.test(line)) return;
    for (const name of names) {
      // The tainted value must be the RECEIVER of the string method.
      const receiver = new RegExp("\\b" + name.replace(/\$/g, "\\$") + "\\s*" + STRING_METHOD.source);
      if (receiver.test(line)) {
        const method = line.match(STRING_METHOD)[0].slice(1, -1).trim();
        violations.push({
          file,
          line: i + 1,
          reason: `asserts "${name}.${method}(...)" where "${name}" is file bytes or a literal — `
            + "static inspection, not verification.",
        });
        break;
      }
    }
  });
}

if (violations.length > 0) {
  console.error("\n=======================================================");
  console.error("  GATE BLOCKED: FAKE TESTS DETECTED (VIOLATION OF ANTI-FAKING RULE)");
  console.error("=======================================================\n");
  for (const v of violations) {
    console.error(`- ${path.relative(ROOT, v.file)}:${v.line}`);
    console.error(`  ${v.reason}\n`);
  }
  console.error("Assert on the result of calling the production code, not on its source text.\n");
  console.error(`${violations.length} violation(s).`);
  process.exit(1);
}

console.log("Anti-Fake-Test Gate: PASSED (no assertion on file bytes or on a literal)");
process.exit(0);
