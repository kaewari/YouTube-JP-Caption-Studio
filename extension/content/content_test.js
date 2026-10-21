/**
 * Unit tests for the content-script helpers that the side panel drives.
 *
 * The helpers live inside the content-script IIFE, so the test loads the real
 * file in a vm sandbox and opts in through the __JP_CAP_CONTENT_TEST__ seam
 * (nothing is exported in a real page session).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CONTENT_JS = path.join(__dirname, "content.js");

/** Minimal browser surface so the IIFE can be evaluated in Node. */
function createContext() {
  const seam = {};
  const storage = {};
  const noop = () => {};
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: noop,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    performance: { now: () => 0 },
    structuredClone,
    crypto: { randomUUID: () => "fixture-uuid" },
    TextEncoder,
    TextDecoder,
    URL,
    AbortController,
    AbortSignal,
    // The content script wires browser observers on init; the sandbox only
    // needs them to exist.
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
    IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} },
    HardsubTimedtextParse: { parseTimedtextBody: () => [], decodeEntities: (s) => s, sourceTrackInfo: () => ({}) },
    HardsubSentenceGroups: { VERSION: 1, buildSentenceGroups: () => ({ groups: [], version: 1, sourceKey: "" }),
      projectDisplayCues: () => [], validGroupTokens: () => false, isProtected: () => false },
    __JP_CAP_CONTENT_TEST__: seam,
    chrome: {
      runtime: {
        id: "fixture",
        getURL: (p) => `chrome-extension://fixture/${p}`,
        getManifest: () => ({ version: "fixture" }),
        sendMessage: async () => ({ ok: true }),
        onMessage: { addListener: noop },
        onInstalled: { addListener: noop },
        onStartup: { addListener: noop },
      },
      storage: {
        local: {
          get: async (keys) => {
            const list = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(list.map((k) => [k, storage[k]]));
          },
          set: async (patch) => Object.assign(storage, structuredClone(patch)),
          remove: async (keys) => {
            for (const k of Array.isArray(keys) ? keys : [keys]) delete storage[k];
          },
        },
        session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
        onChanged: { addListener: noop },
      },
      tabs: { onUpdated: { addListener: noop }, onActivated: { addListener: noop }, sendMessage: async () => ({}) },
    },
    document: {
      readyState: "complete",
      hidden: false,
      documentElement: { style: { setProperty: noop } },
      body: { appendChild: noop, removeChild: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, classList: { add: noop, remove: noop } }),
      addEventListener: noop,
      removeEventListener: noop,
    },
    window: { addEventListener: noop, removeEventListener: noop, location: { href: "https://www.youtube.com/watch?v=fixture" } },
    location: { href: "https://www.youtube.com/watch?v=fixture", origin: "https://www.youtube.com" },
    navigator: { userAgent: "fixture", language: "ja" },
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}) }),
  };
  context.globalThis = context;
  context.self = context;
  return { context, seam };
}

const { context, seam } = createContext();
const source = fs.readFileSync(CONTENT_JS, "utf8");
vm.createContext(context);
vm.runInContext(source, context, { filename: "content.js" });

assert.ok(seam.content, "the content script must expose its helpers to the test seam");
const content = seam.content;

// -------------------------------------------------------------------------
// resolveCueIndex: an out-of-range index must never reach an edit handler
// -------------------------------------------------------------------------
const cues = content.getCues();
assert.ok(Array.isArray(cues), "the content script must expose its cue list");

// A real id resolves; a negative / out-of-range / NaN index does not.
const resolveCueIndex = (msg) => content.resolveCueIndex(msg);
assert.strictEqual(resolveCueIndex({ idx: 0 }), cues.length ? 0 : -1,
  "index 0 must resolve when a cue exists");
assert.strictEqual(resolveCueIndex({ idx: -1 }), -1, "a negative index must be rejected");
assert.strictEqual(resolveCueIndex({ idx: 9999 }), -1, "an out-of-range index must be rejected");
assert.strictEqual(resolveCueIndex({ idx: NaN }), -1, "NaN must be rejected");
assert.strictEqual(resolveCueIndex({ idx: "x" }), -1, "a non-numeric index must be rejected");
assert.strictEqual(resolveCueIndex({ id: "no-such-id", idx: 0 }), -1,
  "an unknown id must not fall back to a numeric index");

// -------------------------------------------------------------------------
// normalizeCueText: one normalization for the edit AND the import path
// -------------------------------------------------------------------------
assert.strictEqual(content.normalizeCueText("a  b c "), "a b c",
  "cue text must be trimmed and whitespace-collapsed");
assert.strictEqual(content.normalizeCueText("  "), "", "blank cue text normalizes to empty");

// -------------------------------------------------------------------------
// normalizeSettings: the defaults are filled in and the stored shape survives
// -------------------------------------------------------------------------
const settings = content.getSettings();
assert.ok(settings && typeof settings === "object", "settings must be an object");
assert.strictEqual(typeof settings.sourceLang, "string", "the default source language must be set");
assert.strictEqual(content.normalizeSettings({ sourceLang: "en" }).sourceLang, "en",
  "a stored value must win over the default");
assert.strictEqual(content.normalizeSettings({}).sourceLang, settings.sourceLang,
  "a missing value must fall back to the default");
assert.strictEqual(content.normalizeSettings({}).levelHighlightEnabled, true,
  "the level highlight default must be filled in");

console.log("content_test: all assertions passed");
