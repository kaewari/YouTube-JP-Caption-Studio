#!/usr/bin/env node
const { execSync } = require("child_process");
const path = require("path");

function runVerify() {
  try {
    const scriptPath = path.join(__dirname, "verify_no_fake_tests.js");
    execSync(`"${process.execPath}" "${scriptPath}"`, { stdio: "pipe" });
    console.log(JSON.stringify({}));
  } catch (err) {
    const errMsg = (err.stderr || err.stdout || "").toString().trim();
    console.log(JSON.stringify({
      decision: "block",
      reason: `PHÁT HIỆN TEST GIẢ MẠO (Fake Test Violation):\n${errMsg}\nBắt buộc xóa bỏ các bài test chuỗi tĩnh và viết test kiểm thử runtime thực tế.`
    }));
    process.exit(1);
  }
}

if (process.stdin.isTTY) {
  runVerify();
} else {
  process.stdin.resume();
  process.stdin.on("end", runVerify);
}
