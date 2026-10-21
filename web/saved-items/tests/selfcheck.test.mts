/**
 * Self-check for the saved-items stores (no test framework, node:test only).
 *
 * Run: node --import ./tests/register.mjs --test tests/*.test.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_LEVEL_COLORS, LEVEL_KEYS } from "@/lib/level-colors";
import { STORAGE_SCHEMA_VERSION, writeEnvelope } from "@/lib/storage-version";
import { DEFAULT_HARDSUB_SETTINGS } from "@/types/settings";
import {
  LOCAL_SAVED_WORDS_KEY,
  mergeLocalRecords,
  mergeUserVocabMap,
  loadWordsAsync,
  persistWordsAsync,
} from "@/lib/vocab-store";
import type { SavedWord } from "@/types/vocab";

function fakeWindow(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  Object.defineProperty(globalThis, "window", {
    value: { localStorage },
    configurable: true,
    writable: true,
  });
  return { store, localStorage };
}

function stubFetchOffline() {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("offline in self-check");
  }) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const RICH_WORD: SavedWord = {
  lemma: "遭難",
  reading: "そうなん",
  glossVi: "gặp nạn; bị nạn",
  glossEn: "disaster; shipwreck",
  status: "learning",
  jlpt: "n1",
  contextJa: "いかだの上で遭難した船乗り",
  videoTitle: "Demo — caption clip",
  updatedAt: 1,
};

test("JLPT level colours have one source of truth", () => {
  assert.deepEqual(
    Object.keys(DEFAULT_HARDSUB_SETTINGS.levelColors),
    LEVEL_KEYS,
    "settings defaults must expose exactly the level keys",
  );
  for (const key of LEVEL_KEYS) {
    assert.deepEqual(
      DEFAULT_HARDSUB_SETTINGS.levelColors[key],
      DEFAULT_LEVEL_COLORS[key],
      `level colour ${key} must come from lib/level-colors`,
    );
  }
});

test("the upstream merge keeps the richer local record", () => {
  const merged = mergeUserVocabMap([RICH_WORD], { 遭難: "known" });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "known", "upstream status wins");
  assert.equal(merged[0].glossVi, RICH_WORD.glossVi, "local gloss survives");
  assert.equal(merged[0].contextJa, RICH_WORD.contextJa, "local context survives");
});

test("writing back keeps the local-only records and their details", () => {
  const localOnly: SavedWord = {
    lemma: "未来",
    reading: "みらい",
    glossVi: "tương lai",
    status: "known",
    updatedAt: 2,
  };
  const merged = mergeLocalRecords([RICH_WORD, localOnly], [
    { lemma: "遭難", status: "known", updatedAt: 9 },
  ]);
  const byLemma = new Map(merged.map((w) => [w.lemma, w]));
  assert.equal(byLemma.size, 2, "the local-only record is not dropped");
  assert.equal(byLemma.get("未来")?.glossVi, "tương lai");
  assert.equal(
    byLemma.get("遭難")?.glossVi,
    RICH_WORD.glossVi,
    "the detail fields of a rewritten row are not blanked",
  );
  assert.equal(byLemma.get("遭難")?.status, "known");
});

test("persisting keeps the records that only exist in the local mirror", async () => {
  const localOnly: SavedWord = {
    lemma: "未来",
    reading: "みらい",
    glossVi: "tương lai",
    status: "known",
    updatedAt: 2,
  };
  const { store } = fakeWindow({
    [LOCAL_SAVED_WORDS_KEY]: JSON.stringify(writeEnvelope([RICH_WORD, localOnly])),
  });
  const restore = stubFetchOffline();
  try {
    await persistWordsAsync([{ lemma: "遭難", status: "known", updatedAt: 9 }]);
    const parsed = JSON.parse(store.get(LOCAL_SAVED_WORDS_KEY) ?? "{}") as {
      data: SavedWord[];
    };
    const byLemma = new Map(parsed.data.map((w) => [w.lemma, w]));
    assert.equal(byLemma.size, 2, "the local-only record is not dropped");
    assert.equal(byLemma.get("未来")?.glossVi, "tương lai");
    assert.equal(byLemma.get("遭難")?.glossVi, RICH_WORD.glossVi);
  } finally {
    restore();
  }
});

test("the saved-words payload carries a schema version", async () => {
  const { store } = fakeWindow();
  const restore = stubFetchOffline();
  try {
    await persistWordsAsync([RICH_WORD]);
    const raw = store.get(LOCAL_SAVED_WORDS_KEY);
    assert.ok(raw, "the payload was written");
    const parsed = JSON.parse(raw) as { version?: number; data?: unknown };
    assert.equal(parsed.version, STORAGE_SCHEMA_VERSION);
    assert.ok(Array.isArray(parsed.data), "the words live under `data`");
  } finally {
    restore();
  }
});

test("a legacy payload without a version still loads", async () => {
  fakeWindow({ [LOCAL_SAVED_WORDS_KEY]: JSON.stringify([RICH_WORD]) });
  const restore = stubFetchOffline();
  try {
    const result = await loadWordsAsync();
    assert.equal(result.words.length, 1);
    assert.equal(result.words[0].lemma, "遭難");
    assert.equal(result.words[0].glossVi, RICH_WORD.glossVi);
  } finally {
    restore();
  }
});

test("an unknown schema version is never overwritten", async () => {
  const newer = JSON.stringify({ version: 99, data: [{ lemma: "未来", status: "known" }] });
  const { store } = fakeWindow({ [LOCAL_SAVED_WORDS_KEY]: newer });
  const restore = stubFetchOffline();
  try {
    await persistWordsAsync([RICH_WORD]);
    assert.equal(
      store.get(LOCAL_SAVED_WORDS_KEY),
      newer,
      "a payload written by a newer build must survive the write",
    );
  } finally {
    restore();
  }
});
