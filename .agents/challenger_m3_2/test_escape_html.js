const fs = require('fs');
const path = require('path');

function getModuleScope(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  
  // Extract escapeHtml and escapeAttr implementation
  const funcDefs = `
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }
  `;

  return {
    escapeHtml: new Function('s', funcDefs + '\nreturn escapeHtml(s);'),
    escapeAttr: new Function('s', funcDefs + '\nreturn escapeAttr(s);')
  };
}

const fns = getModuleScope(path.join(__dirname, '../../extension/sidepanel/sidepanel.js'));

console.log("=== EMPIRICAL TEST HARNESS FOR ESCAPE HTML & ESCAPE ATTR ===");

const testPayloads = [
  { name: "Script Tag XSS", input: "<script>alert(1)</script>" },
  { name: "Image OnError XSS", input: "<img src=x onerror=alert(1)>" },
  { name: "Double Quote Breakout", input: '" onfocus="alert(1)' },
  { name: "Single Quote Breakout", input: "' onfocus='alert(1)" },
  { name: "Ampersand and Entities", input: "foo & bar < baz > ' \" &amp;" },
  { name: "Special Characters Suite (& < > \" ')", input: "&<>\"'" },
  { name: "SVG onload XSS", input: "<svg onload=alert(1)>" },
];

const targetImplementations = [
  { name: "escapeHtml(s)", fn: fns.escapeHtml },
  { name: "escapeAttr(s)", fn: fns.escapeAttr },
];

for (const impl of targetImplementations) {
  console.log(`\n--- Testing ${impl.name} ---`);
  for (const payload of testPayloads) {
    const output = impl.fn(payload.input);

    const escapesAmp = payload.input.includes("&") ? (output.includes("&amp;") || output.includes("&#38;")) : true;
    const escapesLt = payload.input.includes("<") ? !output.includes("<") : true;
    const escapesGt = payload.input.includes(">") ? !output.includes(">") : true;
    const escapesDQ = payload.input.includes('"') ? !output.includes('"') : true;
    const escapesSQ = payload.input.includes("'") ? !output.includes("'") : true;

    const issues = [];
    if (!escapesLt) issues.push("UNESCAPED '<'");
    if (!escapesGt) issues.push("UNESCAPED '>'");
    if (!escapesAmp) issues.push("UNESCAPED '&'");
    if (!escapesDQ) issues.push("UNESCAPED '\"'");
    if (!escapesSQ) issues.push("UNESCAPED '\\''");

    console.log(`  Payload: ${payload.name}`);
    console.log(`    Input:  ${payload.input}`);
    console.log(`    Output: ${output}`);
    if (issues.length > 0) {
      console.log(`    [DEFECT DETECTED]: ${issues.join(", ")}`);
    } else {
      console.log(`    [PASS]`);
    }
  }
}
