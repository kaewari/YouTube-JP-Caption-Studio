#!/usr/bin/env node
const { execSync } = require("child_process");
const path = require("path");

// Consume stdin if any
process.stdin.resume();
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  try {
    const scriptPath = path.join(__dirname, "verify_no_fake_tests.js");
    execSync(`node "${scriptPath}"`, { stdio: "pipe" });
    // Success: allow stopping
    console.log(JSON.stringify({}));
  } catch (err) {
    const errMsg = (err.stderr || err.stdout || "").toString().trim();
    // Violation detected: block agent stop!
    console.log(JSON.stringify({
      decision: "continue",
      reason: `PHÁT HIỆN TEST GIẢ MẠO (Fake Test Violation):\n${errMsg}\nBắt buộc xóa bỏ các bài test chuỗi tĩnh và viết test kiểm thử runtime thực tế.`
    }));
  }
});
