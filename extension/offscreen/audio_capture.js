/**
 * Offscreen audio capture and ASR slice dispatcher.
 * Handles:
 * 1. navigator.mediaDevices.getUserMedia using streamId from chrome.tabCapture.
 * 2. Audio playback pass-through via AudioContext.destination so tab remains audible.
 * 3. MediaRecorder slicing (audio/webm;codecs=opus) dispatched to local-bridge POST /asr/transcribe.
 * 4. Slice boundaries ride on the MediaRecorder timeslice event (a page timer is
 *    throttled/suspended in an offscreen document, the media pipeline is not).
 */

const BRIDGE_ASR_URL = "http://127.0.0.1:8765/asr/transcribe";
const SLICE_DURATION_MS = 8000; // 8-second slices for faster throughput & richer context
const OVERLAP_MS = 1500; // 1.5-second overlap across slice boundaries
// A slice transcription is the only bridge call without a timeout otherwise: a
// hung bridge would keep the request (and the slice) alive forever.
const ASR_TIMEOUT_MS = 60_000;

let currentStream = null;
let currentAudioCtx = null;
let activeRecorder = null;
let isCapturing = false;
let activeTabId = null;
let activeVideoId = null;
let sliceStartTime = 0;
/** Backstop timer for the current slice — cleared when the recorder stops it. */
let sliceBackstop = null;

function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "";
}

async function startCapture(streamId, tabId, videoId, initialPlayhead = 0) {
  if (isCapturing) {
    await stopCapture();
  }

  activeTabId = tabId;
  activeVideoId = videoId;
  sliceStartTime = Number(initialPlayhead) || 0;
  isCapturing = true;

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    // Pipe audio to speakers so video remains audible
    currentAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (currentAudioCtx.state === "suspended") {
      await currentAudioCtx.resume();
    }
    const sourceNode = currentAudioCtx.createMediaStreamSource(currentStream);
    sourceNode.connect(currentAudioCtx.destination);

    // Begin recording loop
    recordNextSlice();
  } catch (err) {
    console.error("[AudioCapture] getUserMedia failed:", err);
    isCapturing = false;
    const message = String(err?.message || err);
    // Surface the failure to the service worker (it owns the UI hand-off).
    chrome.runtime.sendMessage({
      type: "ASR_CAPTURE_ERROR",
      tabId: activeTabId,
      error: message,
    }).catch(() => {});
    // The caller must see the failure: resolving here left the overlay
    // "listening" while no recorder was running.
    throw new Error(message);
  }
}

function recordNextSlice() {
  if (!isCapturing || !currentStream) return;

  const mimeType = getSupportedMimeType();
  const options = mimeType ? { mimeType } : {};
  let recorder;
  try {
    recorder = new MediaRecorder(currentStream, options);
  } catch (e) {
    recorder = new MediaRecorder(currentStream);
  }

  activeRecorder = recorder;
  const chunks = [];
  const startTimestamp = sliceStartTime;
  const sliceDurationSec = SLICE_DURATION_MS / 1000;
  const expectedEnd = startTimestamp + sliceDurationSec;

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
    // Slice boundary driven by the media pipeline (timeslice), not by a page
    // timer: it still fires when the offscreen document's timers are throttled
    // or suspended. The final dataavailable after stop() sees a non-recording
    // state and does nothing.
    if (isCapturing && recorder.state === "recording") {
      recorder.stop();
    }
  };

  recorder.onstop = async () => {
    if (sliceBackstop) {
      clearTimeout(sliceBackstop);
      sliceBackstop = null;
    }
    if (chunks.length > 0 && isCapturing) {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      dispatchSliceToBridge(blob, startTimestamp, expectedEnd, activeTabId, activeVideoId);
    }
    // Advance playhead estimate with overlap
    sliceStartTime = Math.max(0, expectedEnd - (OVERLAP_MS / 1000));
    if (isCapturing) {
      recordNextSlice();
    }
  };

  // Timeslice: Chrome emits a dataavailable event every SLICE_DURATION_MS even
  // while page timers are throttled — that event ends the slice (see above).
  recorder.start(SLICE_DURATION_MS);
  // Backstop for encoders that never emit a timeslice chunk.
  sliceBackstop = setTimeout(() => {
    sliceBackstop = null;
    if (recorder.state === "recording") {
      recorder.stop();
    }
  }, SLICE_DURATION_MS);
}

async function dispatchSliceToBridge(blob, startSec, endSec, tabId, videoId) {
  try {
    const res = await fetch(BRIDGE_ASR_URL, {
      method: "POST",
      body: blob,
      headers: {
        "Content-Type": blob.type || "audio/webm",
      },
      signal: AbortSignal.timeout(ASR_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn("[AudioCapture] ASR transcribe returned non-200:", res.status, errText);
      return;
    }

    const data = await res.json();
    if (!data || !data.text) return;

    chrome.runtime.sendMessage({
      type: "ASR_CANDIDATE_RECEIVED",
      tabId,
      videoId,
      startSec,
      endSec,
      result: data,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      console.warn(`[AudioCapture] Bridge ASR timed out after ${ASR_TIMEOUT_MS / 1000}s`);
      return;
    }
    console.warn("[AudioCapture] Bridge ASR dispatch error:", err);
  }
}

async function stopCapture() {
  isCapturing = false;
  if (sliceBackstop) {
    clearTimeout(sliceBackstop);
    sliceBackstop = null;
  }
  if (activeRecorder && activeRecorder.state === "recording") {
    try {
      activeRecorder.stop();
    } catch (_) {}
  }
  activeRecorder = null;

  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }

  if (currentAudioCtx) {
    try {
      await currentAudioCtx.close();
    } catch (_) {}
    currentAudioCtx = null;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;

  if (msg.type === "START_CAPTURE") {
    startCapture(msg.streamId, msg.tabId, msg.videoId, msg.playhead)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === "STOP_CAPTURE") {
    stopCapture()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
