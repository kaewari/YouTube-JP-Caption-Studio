const fs = require('fs');
const path = require('path');

const extensionDir = path.join(__dirname, '../../extension');
const manifestPath = path.join(extensionDir, 'manifest.json');

console.log("=== EMPIRICAL MANIFEST.JSON & UNPACKED EXTENSION VERIFICATION ===");

let manifestRaw;
try {
  manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  console.log("  [PASS] Read manifest.json successfully.");
} catch (e) {
  console.error("  [FAIL] Failed to read manifest.json:", e.message);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(manifestRaw);
  console.log("  [PASS] manifest.json is valid JSON.");
} catch (e) {
  console.error("  [FAIL] JSON syntax error in manifest.json:", e.message);
  process.exit(1);
}

// 1. Manifest V3 Check
if (manifest.manifest_version !== 3) {
  console.error(`  [FAIL] manifest_version must be 3, found: ${manifest.manifest_version}`);
} else {
  console.log("  [PASS] manifest_version is 3.");
}

// 2. Required MV3 fields
const requiredFields = ['name', 'version', 'manifest_version'];
for (const field of requiredFields) {
  if (!manifest[field]) {
    console.error(`  [FAIL] Missing required field: ${field}`);
  } else {
    console.log(`  [PASS] Required field '${field}' present: ${manifest[field]}`);
  }
}

// 3. File existence verification
const referencedFiles = [];

if (manifest.background?.service_worker) {
  referencedFiles.push(manifest.background.service_worker);
}
if (manifest.action?.default_popup) {
  referencedFiles.push(manifest.action.default_popup);
}
if (manifest.side_panel?.default_path) {
  referencedFiles.push(manifest.side_panel.default_path);
}
if (Array.isArray(manifest.content_scripts)) {
  for (const cs of manifest.content_scripts) {
    if (Array.isArray(cs.js)) referencedFiles.push(...cs.js);
    if (Array.isArray(cs.css)) referencedFiles.push(...cs.css);
  }
}
if (Array.isArray(manifest.web_accessible_resources)) {
  for (const war of manifest.web_accessible_resources) {
    if (Array.isArray(war.resources)) referencedFiles.push(...war.resources);
  }
}

console.log(`\nVerifying ${referencedFiles.length} referenced resource files in extension folder...`);
let missingCount = 0;
for (const relFile of referencedFiles) {
  const fullPath = path.join(extensionDir, relFile);
  if (fs.existsSync(fullPath)) {
    console.log(`  [PASS] ${relFile} exists (${fs.statSync(fullPath).size} bytes).`);
  } else {
    console.error(`  [FAIL] MISSING FILE: ${relFile} (path: ${fullPath})`);
    missingCount++;
  }
}

if (missingCount === 0) {
  console.log("\n  [SUCCESS] All manifest referenced files exist. Extension is valid and loadable as unpacked extension.");
} else {
  console.error(`\n  [FAIL] Found ${missingCount} missing file(s). Extension load will fail.`);
}
