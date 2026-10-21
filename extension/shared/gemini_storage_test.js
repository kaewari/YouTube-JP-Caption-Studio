/**
 * Runtime checks for the Gemini API key storage.
 *
 * The key must live in chrome.storage.local only: chrome.storage.sync replicates
 * it to every signed-in Google account and to Google's servers. A key left in
 * sync by an older build is migrated once (sync → local) and then deleted.
 *
 * The real module is executed with stubbed chrome.storage APIs — the assertions
 * below run production code paths, no source-text matching.
 */
const assert = require("node:assert/strict");

const Gemini = require("./gemini_translate.js");

/** Minimal chrome.storage double that records every call (local and sync are separate areas). */
function makeStorage(initial = {}) {
  const stores = { local: { ...(initial.local || {}) }, sync: { ...(initial.sync || {}) } };
  const calls = [];
  const area = (name) => ({
    async get(keys) {
      calls.push({ area: name, op: "get", keys });
      const store = stores[name];
      const list = keys === null || keys === undefined
        ? Object.keys(store)
        : Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const key of list) if (Object.hasOwn(store, key)) out[key] = store[key];
      return out;
    },
    async set(patch) {
      calls.push({ area: name, op: "set", patch });
      Object.assign(stores[name], patch);
    },
    async remove(keys) {
      calls.push({ area: name, op: "remove", keys });
      for (const key of Array.isArray(keys) ? keys : [keys]) delete stores[name][key];
    },
  });
  return {
    stores,
    calls,
    local: area("local"),
    sync: area("sync"),
    get data() { return stores.local; },
    get syncData() { return stores.sync; },
  };
}

function installChrome(storage) {
  global.chrome = {
    runtime: { id: "fixture-extension", getURL: (p) => "chrome-extension://fixture-extension/" + p },
    storage: { local: storage.local, sync: storage.sync },
  };
}

function uninstallChrome() {
  delete global.chrome;
}

const ops = (calls, area, op) => calls.filter((c) => c.area === area && c.op === op);

(async () => {
  const savedEnv = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  // 1. Saving a key must never reach chrome.storage.sync.
  {
    const storage = makeStorage();
    installChrome(storage);
    await Gemini.saveApiKey("  local-only-key  ");
    const syncWrites = [...ops(storage.calls, "sync", "set"), ...ops(storage.calls, "sync", "get")];
    assert.equal(syncWrites.length, 0, "the API key must never be written to or read from chrome.storage.sync");
    const localSets = ops(storage.calls, "local", "set");
    assert.ok(localSets.length >= 1, "the key must be written to chrome.storage.local");
    assert.equal(localSets[0].patch.geminiApiKey, "local-only-key");
    assert.equal(storage.data.geminiApiKey, "local-only-key");
    const syncRemoves = ops(storage.calls, "sync", "remove");
    assert.equal(syncRemoves.length, 1, "a legacy sync copy must be removed");
    assert.deepEqual(syncRemoves[0].keys, ["geminiApiKey"]);
    uninstallChrome();
    console.log("PASS: saveApiKey stores the key in chrome.storage.local only and purges chrome.storage.sync");
  }

  // 2. A key that still sits in sync is migrated to local once, then deleted.
  {
    const storage = makeStorage({ sync: { geminiApiKey: "legacy-sync-key" } });
    installChrome(storage);
    const key = await Gemini.getStoredApiKey();
    assert.equal(key, "legacy-sync-key", "the migrated key must still be returned");
    assert.equal(storage.data.geminiApiKey, "legacy-sync-key", "the key must be copied into chrome.storage.local");
    assert.equal(storage.data.geminiApiKeySyncPurged, true, "the purge must be recorded");
    const syncRemoves = ops(storage.calls, "sync", "remove");
    assert.equal(syncRemoves.length, 1, "the key must be deleted from chrome.storage.sync");
    assert.deepEqual(syncRemoves[0].keys, ["geminiApiKey"]);
    uninstallChrome();
    console.log("PASS: a legacy chrome.storage.sync key is migrated to local and deleted from sync");
  }

  // 3. After the migration the sync area is not read again.
  {
    const storage = makeStorage({ sync: { geminiApiKey: "legacy-sync-key" } });
    installChrome(storage);
    await Gemini.getStoredApiKey();
    const syncReads = ops(storage.calls, "sync", "get").length;
    await Gemini.getStoredApiKey();
    assert.equal(ops(storage.calls, "sync", "get").length, syncReads, "sync must not be read again once the purge is done");
    assert.equal(await Gemini.getStoredApiKey(), "legacy-sync-key");
    uninstallChrome();
    console.log("PASS: the sync area is read only once (migration), then the key is served from local");
  }

  // 4. A local key wins and the sync copy is still purged.
  {
    const storage = makeStorage({ local: { geminiApiKey: "local-key" }, sync: { geminiApiKey: "stale-sync-key" } });
    installChrome(storage);
    assert.equal(await Gemini.getStoredApiKey(), "local-key");
    assert.equal(ops(storage.calls, "sync", "remove").length, 1, "a stale sync copy must be purged even when local has the key");
    uninstallChrome();
    console.log("PASS: an existing local key is served and any leftover sync copy is purged");
  }

  // 5. No key anywhere → empty result, and sync is not written to.
  {
    const storage = makeStorage();
    installChrome(storage);
    assert.equal(await Gemini.getStoredApiKey(), "");
    assert.equal(ops(storage.calls, "sync", "set").length, 0);
    uninstallChrome();
    console.log("PASS: no key stored → empty result, nothing written to sync");
  }

  if (savedEnv === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedEnv;
  console.log("ALL GEMINI STORAGE TESTS PASSED!");
})().catch((err) => {
  console.error("GEMINI STORAGE TESTS FAILED:", err);
  process.exit(1);
});
