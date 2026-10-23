/**
 * Unit test for the list windowing arithmetic (no framework, node:test only).
 *
 * Run: node --import ./tests/register.mjs --test tests/*.test.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INITIAL_ROWS,
  ROW_CHUNK,
  initialVisibleCount,
  nextVisibleCount,
} from "@/lib/incremental-list";

test("initial window is capped by the list size", () => {
  assert.equal(initialVisibleCount(0), 0);
  assert.equal(initialVisibleCount(3), 3);
  assert.equal(initialVisibleCount(5000), INITIAL_ROWS);
});

test("growth adds one chunk and stops at the total", () => {
  assert.equal(nextVisibleCount(100, 5000), 100 + ROW_CHUNK);
  assert.equal(nextVisibleCount(4950, 5000), 5000, "must clamp to the total");
  assert.equal(nextVisibleCount(5000, 5000), 5000, "no growth past the end");
});

test("odd inputs do not produce NaN or negative windows", () => {
  assert.equal(nextVisibleCount(Number.NaN, 5000), ROW_CHUNK, "NaN current counts as 0");
  assert.equal(nextVisibleCount(-5, 5000), ROW_CHUNK, "negative current counts as 0");
  assert.equal(nextVisibleCount(Number.NaN, 10), 10, "still clamped to a short list");
  assert.equal(nextVisibleCount(0, Number.NaN), 0, "NaN total is an empty list");
  assert.equal(nextVisibleCount(0, 5000, 0), ROW_CHUNK, "a zero chunk falls back to ROW_CHUNK");
  assert.equal(initialVisibleCount(Number.NaN), 0);
});
