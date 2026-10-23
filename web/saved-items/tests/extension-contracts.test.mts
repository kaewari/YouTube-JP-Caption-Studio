/**
 * Cross-layer contracts between the extension (source of truth for rendering)
 * and this web app. These are the "keep in sync" promises the source comments
 * make; nothing enforced them before, and the level-colour default had already
 * drifted (`unknown`: "#c5c5d0" here vs "#94a3b8" in the extension).
 *
 * The extension modules are UMD/global scripts, so they are required directly and
 * read off `globalThis`; nothing here inspects file text.
 *
 * Run: node --import ./tests/register.mjs --test tests/*.test.mts
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import {
  DEFAULT_LEVEL_COLORS,
  LEVEL_KEYS,
  LEVEL_LABELS,
  normalizeLevelColors,
} from "@/lib/level-colors";
import { normalizeSavedCuesList } from "@/lib/vocab-store";

const require = createRequire(import.meta.url);
const REPO_ROOT = "../../..";

type LevelEntry = { on: boolean; color: string };

interface ExtensionVocab {
  LEVEL_KEYS: string[];
  LEVEL_LABELS: Record<string, string>;
  DEFAULT_LEVEL_COLORS: Record<string, LevelEntry>;
  normalizeLevelColors: (raw?: unknown) => Record<string, LevelEntry>;
}

interface ImportParse {
  parseExportTxt: (text: string) => Array<Record<string, unknown>>;
  normalizeParsedImportRows: (rows: unknown[]) => Array<Record<string, unknown>>;
}

function loadExtension(): { vocab: ExtensionVocab; importParse: ImportParse } {
  require(`${REPO_ROOT}/extension/shared/vocab_style.js`);
  const vocab = (globalThis as unknown as { HardsubVocab?: ExtensionVocab }).HardsubVocab;
  assert.ok(vocab, "extension/shared/vocab_style.js must expose HardsubVocab");
  const importParse = require(`${REPO_ROOT}/extension/shared/import_parse.js`) as ImportParse;
  return { vocab, importParse };
}

// C-2 — one JLPT level table for extension and web.
test("the JLPT level keys match the extension", () => {
  const { vocab } = loadExtension();
  assert.deepEqual(vocab.LEVEL_KEYS, LEVEL_KEYS);
});

test("the JLPT level labels match the extension", () => {
  const { vocab } = loadExtension();
  assert.deepEqual(vocab.LEVEL_LABELS, LEVEL_LABELS);
});

test("the default JLPT colours match the extension", () => {
  const { vocab } = loadExtension();
  assert.deepEqual(vocab.DEFAULT_LEVEL_COLORS, DEFAULT_LEVEL_COLORS);
});

test("normalizeLevelColors agrees with the extension on odd input", () => {
  const { vocab } = loadExtension();
  const fixtures: unknown[] = [
    undefined,
    { n3: { on: false, color: "#123456" }, unknown: { color: "" } },
    { madeUpLevel: { on: true, color: "#000000" } },
  ];
  for (const fixture of fixtures) {
    assert.deepEqual(
      normalizeLevelColors(fixture),
      vocab.normalizeLevelColors(fixture),
      `normalizeLevelColors disagreed for ${JSON.stringify(fixture)}`,
    );
  }
});

// C-7 — saved-cue field contract between the extension writer and the web reader.
test("a cue the extension exports is readable by the web app, in the same seconds", () => {
  const { importParse } = loadExtension();
  // The extension's own export header: `[index] start → end`.
  const txt = [
    "[1] 0:01 → 0:03",
    "JA: 日本語",
    "EN: Japanese",
    "VI: tiếng Nhật",
    "----------",
    "[2] 0:05 → 0:06",
    "JA: 勉強",
    "",
  ].join("\n");

  const parsed = importParse.normalizeParsedImportRows(importParse.parseExportTxt(txt));
  assert.equal(parsed.length, 2, JSON.stringify(parsed));
  const [first] = parsed;
  assert.equal(first.start_media_time, 1, "the extension writes seconds");
  assert.equal(first.source, "日本語");

  // The web app must accept the extension's wire shape unchanged.
  const cues = normalizeSavedCuesList(
    parsed.map((row, index) => ({ ...row, id: `cue-${index}` })),
  );
  assert.equal(cues.length, 2, JSON.stringify(cues));
  const original = cues.find((cue) => cue.id === "cue-0");
  assert.ok(original, JSON.stringify(cues));
  assert.equal(original.startTime, 1, "web must read start_media_time (seconds) as startTime");
  assert.equal(original.source, "日本語");
  assert.equal(original.vi, "tiếng Nhật");
});

test("the web reader still accepts a legacy millisecond-style startTime field", () => {
  // The web app tolerates both key names; keep that when the writer changes.
  const cues = normalizeSavedCuesList([{ id: "legacy", source: "あ", startTime: 2.5, endTime: 3 }]);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].startTime, 2.5);
  assert.equal(cues[0].endTime, 3);
});
