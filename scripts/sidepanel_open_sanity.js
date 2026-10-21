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
let createdUrl = null;

const sandbox = {
  importScripts: () => {},
  chrome: {
    runtime: {
      onInstalled: { addListener: (fn) => { fn({ reason: "install" }); } },
      onStartup: { addListener: (fn) => { fn(); } },
      onMessage: { addListener: () => {} },
      getManifest: () => manifest,
      getURL: (p) => "chrome-extension://fixture/" + p,
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
      create: (opts) => { createdUrl = opts?.url || null; return Promise.resolve({ ok: true }); },
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
  // The toolbar icon opens the dedicated Saved Items page (README/walkthrough);
  // the side panel is enabled per tab, only on the supported video sites.
  assert(panelBehavior.openPanelOnActionClick === false, "openPanelOnActionClick is off (the icon opens the options page)");
  assert(sidePanelOptions["global"]?.enabled === false, "sidePanel is not enabled globally");
  assert(actionListeners.length > 0, "action.onClicked fallback listener is registered");

  // A non-video tab must not get the side panel.
  if (sandbox.syncSidePanelForTab) {
    await sandbox.syncSidePanelForTab(123, "https://www.google.com");
    assert(sidePanelOptions[123]?.enabled === false, "non-video tabs have the side panel disabled");
    await sandbox.syncSidePanelForTab(124, "https://www.youtube.com/watch?v=abc");
    assert(sidePanelOptions[124]?.enabled === true, "video tabs have the side panel enabled");
  }

  // The icon opens the Saved Items page, not the side panel.
  let openedTab = null;
  createdUrl = null;
  const clickHandler = actionListeners[0];
  if (clickHandler) {
    sandbox.chrome.sidePanel.open = (opts) => {
      openedTab = opts.tabId;
      return Promise.resolve({ ok: true });
    };
    await clickHandler({ id: 999, windowId: 1, url: "https://www.google.com" });
    assert(openedTab === null, "the icon does not open the side panel");
    assert(
      createdUrl === "chrome-extension://fixture/popup/index.html",
      `the icon opens the Saved Items page, got ${createdUrl}`,
    );
  }

  console.log("sidepanel_open sanity PASSED");
}, 20);
