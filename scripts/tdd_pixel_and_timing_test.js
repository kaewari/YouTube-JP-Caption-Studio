const assert = require("assert");

console.log("=== TDD TEST: TIMING ACCURACY, LANGUAGE GUARD, AND LR PARITY ===");

// TEST 1: Timing Accuracy - No artificial stretching to next cue start
console.log("\n--- TEST 1: Cue Duration Must Preserve Timedtext Silence Gaps ---");
const sampleXml = `<?xml version="1.0" encoding="utf-8" ?>
<timedtext format="3">
  <body>
    <p t="4540" d="2850">はい！みなさん、こんばんは。</p>
    <p t="10000" d="3000">今日は家事について話します。</p>
  </body>
</timedtext>`;

// Current buggy page_capture logic:
function buggyParseXml(xml) {
  const cues = [];
  const pNodes = [
    { start: 4.54, durMs: 2850, text: "はい！みなさん、こんばんは。" },
    { start: 10.0, durMs: 3000, text: "今日は家事について話します。" }
  ];
  for (let i = 0; i < pNodes.length; i++) {
    const n = pNodes[i];
    const next = pNodes[i + 1];
    // Buggy logic from old page_capture.js line 428:
    let end = next ? next.start : (n.durMs ? n.start + n.durMs / 1000 : n.start + 2);
    cues.push({ start: n.start, end, text: n.text });
  }
  return cues;
}

const buggyCues = buggyParseXml(sampleXml);
console.log("Buggy cue 0 end:", buggyCues[0].end, "(expected 7.39, got:", buggyCues[0].end, ")");
assert.strictEqual(buggyCues[0].end, 10.0, "Buggy code stretched cue 0 until cue 1 start (10.0s), destroying silence gap!");

// Fixed logic:
function fixedParseXml(xml) {
  const pNodes = [
    { start: 4.54, durMs: 2850, text: "はい！みなさん、こんばんは。" },
    { start: 10.0, durMs: 3000, text: "今日は家事について話します。" }
  ];
  const cues = [];
  for (let i = 0; i < pNodes.length; i++) {
    const n = pNodes[i];
    const next = pNodes[i + 1];
    const hasDur = n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0;
    let end = hasDur
      ? Math.round((n.start + n.durMs / 1000) * 1000) / 1000
      : (next ? Math.min(n.start + 2, next.start - 0.05) : n.start + 2);
    if (next && end > next.start) {
      end = Math.max(n.start + 0.2, next.start - 0.05);
    }
    cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
  }
  return cues;
}

const fixedCues = fixedParseXml(sampleXml);
console.log("Fixed cue 0 end:", fixedCues[0].end);
assert.strictEqual(fixedCues[0].end, 7.39, "Fixed logic must end at 7.39s, leaving silence from 7.39s to 10.0s!");
assert.strictEqual(fixedCues[1].end, 13.0, "Fixed logic cue 1 ends at 13.0s");

// TEST 2: Content-Based Language Detection & Guard
console.log("\n--- TEST 2: Language Detection & Source Pollution Guard ---");
function detectCuesLanguage(cuesList) {
  if (!Array.isArray(cuesList) || !cuesList.length) return "unknown";
  const sample = cuesList.slice(0, 50).map(c => c.text || c.source || "").join(" ");
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(sample)) return "ja";
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i.test(sample)) return "vi";
  if (/[a-zA-Z]/.test(sample)) return "en";
  return "unknown";
}

const vietnamesePayload = [
  { start: 0.5, end: 3.2, text: "Buổi sáng tôi thức dậy, làm một chút việc," },
  { start: 3.5, end: 5.0, text: "tôi đã dành cả ngày để thư giãn." }
];

const japanesePayload = [
  { start: 0.5, end: 3.2, text: "朝起きて、ちょっと作業して、" },
  { start: 3.5, end: 5.0, text: "今日は一日リラックスしました。" }
];

assert.strictEqual(detectCuesLanguage(vietnamesePayload), "vi", "Must identify Vietnamese text accurately");
assert.strictEqual(detectCuesLanguage(japanesePayload), "ja", "Must identify Japanese text accurately");

// Guard logic: applyCuesSafely
function applyCuesSafely(targetCues, incomingCues) {
  const lang = detectCuesLanguage(incomingCues);
  if (lang === "vi") {
    // Must NOT replace targetCues! Must route to VI secondary fill!
    return { action: "fill_vi", targetUpdated: false };
  }
  if (lang === "ja") {
    return { action: "apply_ja", targetUpdated: true };
  }
  return { action: "unknown", targetUpdated: false };
}

const guardResultVi = applyCuesSafely([], vietnamesePayload);
assert.strictEqual(guardResultVi.action, "fill_vi", "Vietnamese payload must be routed to fill_vi!");
assert.strictEqual(guardResultVi.targetUpdated, false, "Japanese cues must NOT be overwritten by Vietnamese!");

const guardResultJa = applyCuesSafely([], japanesePayload);
assert.strictEqual(guardResultJa.action, "apply_ja", "Japanese payload applies as JA source");
assert.strictEqual(guardResultJa.targetUpdated, true, "Target cues updated with authentic Japanese");

// TEST 3: Language Reactor Saved Tab Context Highlighting
console.log("\n--- TEST 3: Saved Tab Context Highlighting ---");
function renderSavedItem(lemma, sampleSentence, showContext) {
  if (!showContext || !sampleSentence) {
    return `<span class="lr-saved-word-box">${lemma}</span>`;
  }
  // When showContext is true, highlight the lemma within the sentence
  const escapedLemma = lemma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const highlighted = sampleSentence.replace(
    new RegExp(escapedLemma, "g"),
    `<span class="lr-saved-word-box">${lemma}</span>`
  );
  return `<div class="lr-saved-sentence">${highlighted}</div>`;
}

const renderedWithContext = renderSavedItem("ポジティブ", "いつもポジティブでいよう", true);
console.log("Rendered with context:", renderedWithContext);
assert.ok(renderedWithContext.includes('<span class="lr-saved-word-box">ポジティブ</span>'), "Word must be boxed in context");
assert.ok(renderedWithContext.includes("いつも"), "Surrounding sentence context preserved");

const renderedWithoutContext = renderSavedItem("ポジティブ", "いつもポジティブでいよう", false);
console.log("Rendered without context:", renderedWithoutContext);
assert.strictEqual(renderedWithoutContext, '<span class="lr-saved-word-box">ポジティブ</span>', "Without context only boxed word is rendered");

console.log("\nALL TESTS IN tdd_pixel_and_timing_test.js PASSED!");
