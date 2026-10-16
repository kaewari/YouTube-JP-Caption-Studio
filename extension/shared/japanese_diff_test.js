/**
 * Unit tests for Japanese Intl.Segmenter LCS Diffing engine.
 */

const assert = require("node:assert/strict");
const Diff = require("./japanese_diff.js");

console.log("Running Japanese Diff Tests...");

// Test 1: Kanji Homophone replacement
const orig1 = "勘無料でした";
const cand1 = "感無量でした";
const html1 = Diff.renderJapaneseDiffHtml(orig1, cand1);
assert.ok(html1.includes('<del class="sp-diff-del">勘無料</del>'), `Expected del 勘無料 in: ${html1}`);
assert.ok(html1.includes('<ins class="sp-diff-ins">感無量</ins>'), `Expected ins 感無量 in: ${html1}`);
assert.ok(html1.includes("でした"), `Expected common text でした in: ${html1}`);
console.log("PASS: Test 1 Kanji homophone replacement diff");

// Test 2: Word insertion
const orig2 = "昨日は学校へ行きました。";
const cand2 = "昨日は友達と学校へ行きました。";
const html2 = Diff.renderJapaneseDiffHtml(orig2, cand2);
assert.ok(html2.includes('<ins class="sp-diff-ins">友達と</ins>') || (html2.includes('<ins class="sp-diff-ins">友達</ins>') && html2.includes('<ins class="sp-diff-ins">と</ins>')), `Expected ins 友達と in: ${html2}`);
assert.ok(!html2.includes("<del"), `No deletion expected in: ${html2}`);
console.log("PASS: Test 2 Word insertion");

// Test 3: Word deletion
const orig3 = "とても嬉しいです。";
const cand3 = "嬉しいです。";
const html3 = Diff.renderJapaneseDiffHtml(orig3, cand3);
assert.ok(html3.includes('<del class="sp-diff-del">とても</del>'), `Expected del とても in: ${html3}`);
assert.ok(!html3.includes("<ins"), `No insertion expected in: ${html3}`);
console.log("PASS: Test 3 Word deletion");

// Test 4: Identical strings
const orig4 = "ありがとうございます。";
const cand4 = "ありがとうございます。";
const html4 = Diff.renderJapaneseDiffHtml(orig4, cand4);
assert.equal(html4, "ありがとうございます。");
assert.ok(!html4.includes("<del") && !html4.includes("<ins"), `No tags expected in identical match`);
console.log("PASS: Test 4 Identical strings");

// Test 5: Empty handling
assert.equal(Diff.renderJapaneseDiffHtml("", ""), "");
assert.equal(Diff.renderJapaneseDiffHtml("", "はい"), '<ins class="sp-diff-ins">はい</ins>');
assert.equal(Diff.renderJapaneseDiffHtml("いいえ", ""), '<del class="sp-diff-del">いいえ</del>');
console.log("PASS: Test 5 Empty edge cases");

// Test 6: XSS Injection prevention
const xssOrig = '<script>alert("xss")</script>';
const xssCand = '<img src=x onerror=alert(1)>';
const html6 = Diff.renderJapaneseDiffHtml(xssOrig, xssCand);
assert.ok(!html6.includes("<script"), "Must not execute script tag");
assert.ok(!html6.includes("<img"), "Must not execute img tag");
assert.ok(html6.includes("script"), "Must retain script content");
assert.ok(html6.includes("&lt;"), "Must escape < bracket");
console.log("PASS: Test 6 XSS prevention");

console.log("ALL JAPANESE DIFF TESTS PASSED!");
