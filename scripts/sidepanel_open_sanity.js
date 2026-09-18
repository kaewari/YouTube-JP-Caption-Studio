#!/usr/bin/env node
/**
 * Sanity: Verify sidepanel can be opened across tabs, has global enablement,
 * and includes action.onClicked fallback so user can open extension anytime.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const swPath = path.join(__dirname, "../extension/background/service_worker.js");
const manifestPath = path.join(__dirname, "../extension/manifest.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
assert(manifest.permissions.includes("sidePanel"), "manifest includes sidePanel permission");
assert(manifest.side_panel?.default_path === "sidepanel/sidepanel.html", "manifest specifies side_panel default_path");
assert(manifest.commands?._execute_action != null, "manifest includes _execute_action keyboard shortcut");

let sidePanelOptions = {};
let panelBehavior = {};
let actionListeners = [];

const sandbox = {
  importScripts: () => {},
  chrome: {
    runtime: {
      onInstalled: { addListener: (fn) => { fn({ reason: "install" }); } },
      onStartup: { addListener: (fn) => { fn(); } },
      onMessage: { addListener: () => {} },
      getManifest: () => manifest,
    },
    alarms: {
      create: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      onAlarm: { addListener: () => {} },
    },
    sidePanel: {
      setPanelBehavior: (opts) => { panelBehavior = opts; return Promise.resolve(); },
      setOptions: (opts) => {
        sidePanelOptions[opts.tabId != null ? opts.tabId : "global"] = opts;
        return Promise.resolve();
      },
      open: (opts) => Promise.resolve({ ok: true }),
      close: (opts) => Promise.resolve({ ok: true }),
    },
    action: {
      onClicked: { addListener: (fn) => { actionListeners.push(fn); } },
    },
    tabs: {
      onUpdated: { addListener: () => {} },
      onActivated: { addListener: () => {} },
      query: () => Promise.resolve([]),
      get: () => Promise.resolve({ id: 1, url: "https://www.google.com" }),
      sendMessage: () => Promise.resolve({}),
    },
    storage: {
      local: { get: () => Promise.resolve({}), set: () => Promise.resolve({}) },
      session: { get: () => Promise.resolve({}), set: () => Promise.resolve({}) },
      onChanged: { addListener: () => {} },
    },
  },
  console,
  setTimeout: (fn, ms) => { fn(); },
  clearTimeout: () => {},
  setInterval: () => {},
  clearInterval: () => {},
  TextEncoder,
  TextDecoder,
  URL,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.createContext(sandbox);
const parseCode = fs.readFileSync(path.join(__dirname, "../extension/shared/timedtext_parse.js"), "utf8");
vm.runInContext(parseCode, sandbox);
const swCode = fs.readFileSync(swPath, "utf8");
vm.runInContext(swCode, sandbox);

setTimeout(async () => {
  assert(panelBehavior.openPanelOnActionClick === true, "openPanelOnActionClick is enabled");
  assert(sidePanelOptions["global"]?.enabled === true, "sidePanel global enabled is true");
  assert(actionListeners.length > 0, "action.onClicked fallback listener is registered");

  // Test on non-supported tab (e.g. google.com or chrome://newtab)
  if (sandbox.syncSidePanelForTab) {
    await sandbox.syncSidePanelForTab(123, "https://www.google.com");
    assert(sidePanelOptions[123]?.enabled !== false, "non-video tabs are NOT disabled (enabled !== false)");
  }

  // Test action click trigger
  let openedTab = null;
  const clickHandler = actionListeners[0];
  if (clickHandler) {
    sandbox.chrome.sidePanel.open = (opts) => {
      openedTab = opts.tabId;
      return Promise.resolve({ ok: true });
    };
    await clickHandler({ id: 999, windowId: 1 });
    assert(openedTab === 999, "action.onClicked opens sidePanel for tab 999");
  }

  console.log("sidepanel_open sanity PASSED");
}, 20);
