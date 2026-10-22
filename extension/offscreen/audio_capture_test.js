/**
 * Runtime tests for the offscreen audio capture document.
 *
 * The real module is executed inside a vm sandbox with stubbed chrome /
 * MediaRecorder globals, so the assertions below run production code paths
 * (no source-text matching):
 *  1. A getUserMedia failure must reject START_CAPTURE and report ASR_CAPTURE_ERROR.
 *  2. A slice must end on the MediaRecorder timeslice event even when no page
 *     timer ever fires (suspended/throttled offscreen document).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = path.join(__dirname, "audio_capture.js");

function loadOffscreen({ getUserMedia, frozenTimers = false } = {}) {
  const sent = [];
  const recorders = [];
  const state = { trackStopped: false };
  let listener = null;

  class FakeRecorder {
    static isTypeSupported() {
      return true;
    }
    constructor(stream, options) {
      this.state = "inactive";
      this.mimeType = (options && options.mimeType) || "audio/webm";
      this.timeslice = null;
      recorders.push(this);
    }
    start(timeslice) {
      this.timeslice = timeslice === undefined ? null : timeslice;
      this.state = "recording";
    }
    /** The browser emits this from the media pipeline — not from a page timer. */
    emitTimeslice(size = 1024) {
      if (this.ondataavailable) this.ondataavailable({ data: { size } });
    }
    stop() {
      if (this.state === "inactive") return;
      this.state = "inactive";
      if (this.ondataavailable) this.ondataavailable({ data: { size: 0 } });
      if (this.onstop) this.onstop();
    }
  }

  class FakeAudioContext {
    constructor() {
      this.state = "running";
      this.destination = {};
    }
    async resume() {}
    createMediaStreamSource() {
      return { connect() {} };
    }
    async close() {}
  }

  const fetches = [];
  const cleared = [];
  const sandbox = {
    console,
    Blob,
    Math,
    Number,
    String,
    JSON,
    Promise,
    Object,
    Array,
    Set,
    MediaRecorder: FakeRecorder,
    // The real offscreen document has these; the ASR dispatch uses AbortSignal.timeout.
    AbortSignal,
    AbortController,
    fetch: async (url, options) => {
      fetches.push({ url, options });
      return { ok: true, json: async () => ({ text: "hello", segments: [] }) };
    },
    navigator: { mediaDevices: { getUserMedia } },
    window: { AudioContext: FakeAudioContext },
    chrome: {
      runtime: {
        onMessage: {
          addListener: (fn) => {
            listener = fn;
          },
        },
        sendMessage: async (msg) => {
          sent.push(msg);
          return undefined;
        },
      },
    },
  };
  // A frozen timer never fires — that is what a suspended offscreen document
  // looks like to the slice timer.
  sandbox.setTimeout = frozenTimers ? () => 0 : setTimeout;
  sandbox.clearTimeout = (id) => {
    cleared.push(id);
    if (!frozenTimers) clearTimeout(id);
  };
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SOURCE, "utf8"), context, { filename: SOURCE });

  return {
    cleared,
    fetches,
    sent,
    recorders,
    state,
    send: (msg) =>
      new Promise((resolve) => {
        assert.ok(listener, "offscreen document registered no message listener");
        listener(msg, {}, resolve);
      }),
  };
}

function fakeStream(env) {
  return {
    getTracks: () => [
      {
        stop() {
          env.state.trackStopped = true;
        },
      },
    ],
  };
}

(async () => {
  console.log("Running Offscreen Audio Capture Tests...");

  // Test 1: getUserMedia failure must reach the caller (no silent {ok:true}).
  {
    const env = loadOffscreen({
      getUserMedia: async () => {
        throw new Error("Permission denied");
      },
    });
    const res = await env.send({
      target: "offscreen",
      type: "START_CAPTURE",
      streamId: "stream-1",
      tabId: 7,
      videoId: "vid1",
    });
    assert.equal(res.ok, false, "capture failure must not resolve as ok");
    assert.match(res.error, /Permission denied/);
    const err = env.sent.find((m) => m.type === "ASR_CAPTURE_ERROR");
    assert.ok(err, "ASR_CAPTURE_ERROR must be sent to the service worker");
    assert.equal(err.tabId, 7);
    console.log("PASS: Test 1 capture failure rejects START_CAPTURE and reports ASR_CAPTURE_ERROR");
  }

  // Test 2: the slice rides on the media timeslice — no page timer involved.
  {
    const env = loadOffscreen({
      getUserMedia: async () => fakeStream(env),
      frozenTimers: true,
    });
    const res = await env.send({
      target: "offscreen",
      type: "START_CAPTURE",
      streamId: "stream-1",
      tabId: 7,
      videoId: "vid1",
    });
    assert.equal(res.ok, true);
    assert.equal(env.recorders.length, 1);
    assert.equal(env.recorders[0].state, "recording");
    assert.equal(env.recorders[0].timeslice, 8000, "slice length must stay 8s");

    // The media pipeline ends the slice even though no timer ever fires.
    env.recorders[0].emitTimeslice();
    assert.equal(env.recorders[0].state, "inactive", "slice must stop on the timeslice event");
    assert.equal(env.recorders.length, 2, "the next slice must start");
    assert.equal(env.recorders[1].state, "recording");

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(
      env.sent.some((m) => m.type === "ASR_CANDIDATE_RECEIVED"),
      "the finished slice must be dispatched to the bridge"
    );
    console.log("PASS: Test 2 slice boundary survives a suspended (timer-less) document");
  }

  // Test 3: STOP_CAPTURE stops the recorder and releases the tab stream.
  {
    const env = loadOffscreen({
      getUserMedia: async () => fakeStream(env),
    });
    await env.send({
      target: "offscreen",
      type: "START_CAPTURE",
      streamId: "stream-1",
      tabId: 7,
      videoId: "vid1",
    });
    const res = await env.send({ target: "offscreen", type: "STOP_CAPTURE" });
    assert.equal(res.ok, true);
    assert.equal(env.recorders[0].state, "inactive");
    assert.ok(env.state.trackStopped, "tab capture tracks must be released");
    console.log("PASS: Test 3 STOP_CAPTURE releases recorder and tab stream");
  }

  // Test 4: the ASR dispatch has a timeout, and the backstop timer is cleared
  // once the media pipeline ends the slice (no dangling timer per slice).
  {
    const env = loadOffscreen({
      getUserMedia: async () => fakeStream(env),
    });
    await env.send({
      target: "offscreen",
      type: "START_CAPTURE",
      streamId: "stream-1",
      tabId: 7,
      videoId: "vid1",
    });
    env.recorders[0].emitTimeslice();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const asr = env.fetches.find((f) => f.url.endsWith("/asr/transcribe"));
    assert.ok(asr, "the slice must reach POST /asr/transcribe");
    assert.ok(asr.options.signal, "the ASR call must carry an AbortSignal");
    assert.equal(asr.options.signal.aborted, false, "the timeout must not fire immediately");
    assert.ok(env.cleared.length > 0, "the slice backstop timer must be cleared");
    // Stop capture so the next slice's backstop timer cannot keep the runner alive.
    await env.send({ target: "offscreen", type: "STOP_CAPTURE" });
    console.log("PASS: Test 4 ASR dispatch is bounded by a timeout and clears its backstop");
  }

  console.log("ALL OFFSCREEN AUDIO CAPTURE TESTS PASSED!");
})().catch((err) => {
  console.error("OFFSCREEN AUDIO CAPTURE TESTS FAILED:", err);
  process.exit(1);
});
