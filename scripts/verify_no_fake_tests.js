#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

/**
 * Anti-Fake-Test Validator
 * Detects pseudo-tests that read source code strings and assert '.includes()' or regex 
 * instead of executing runtime functions, DOM models, or real network APIs.
 */

function scanDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f.startsWith(".") || f === "node_modules" || f === ".git") continue;
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scanDir(full, fileList);
    } else if (f.endsWith(".js") || f.endsWith(".ts")) {
      if (f.includes("test") || dir.includes("test") || dir.includes("scripts")) {
        fileList.push(full);
      }
    }
  }
  return fileList;
}

const targetDirs = [
  path.join(__dirname),
  path.join(__dirname, "../extension/shared"),
];

const allTests = [];
for (const d of targetDirs) {
  scanDir(d, allTests);
}

const FAKE_PATTERNS = [
  /fs\.readFileSync\([^)]*(?:\.js|\.css|\.html)[^)]*\).*(?:includes|\.test|\.match)/s,
  /assert\.(?:strictEqual|ok|equal)\([^)]*(?:panelCss|contentJs|sourceCode|fileContent|rawCode)\.(?:includes|match)/,
];

let violations = [];

for (const file of allTests) {
  if (file === __filename) continue;
  const content = fs.readFileSync(file, "utf8");
  
  // Check for reading production code files directly to assert string content
  const readsProdCode = /fs\.readFileSync\([^)]*(?:extension|src)\/(?:styles|content|background|injected)[^)]*\)/.test(content);
  const assertsStringInclusion = /assert\.(?:strictEqual|ok|equal)\([^)]*\.includes\(/.test(content);

  if (readsProdCode && assertsStringInclusion) {
    violations.push({
      file,
      reason: "Script reads raw production source code and asserts string '.includes()', faking test execution instead of testing runtime behavior."
    });
  }
}

if (violations.length > 0) {
  console.error("\n=======================================================");
  console.error("  GATE BLOCKED: FAKE TESTS DETECTED (VIOLATION OF ANTI-FAKING RULE)");
  console.error("=======================================================\n");
  for (const v of violations) {
    console.error(`- File: ${v.file}`);
    console.error(`  Reason: ${v.reason}\n`);
  }
  console.error("All tests must execute runtime logic, DOM components, or real network APIs.");
  console.error("Static text inspection is strictly forbidden as a test verification.\n");
  process.exit(1);
} else {
  console.log("Anti-Fake-Test Gate: PASSED (No string-matching mock tests detected)");
  process.exit(0);
}
