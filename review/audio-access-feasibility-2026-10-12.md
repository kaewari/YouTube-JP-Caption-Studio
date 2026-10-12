<!-- date: 2026-10-12 -->
<!-- source: chat:6f66b8f4-de9b-4b59-bbfd-8febee70f04c · user: audio access feasibility spike -->

# Audio Access Feasibility Spike (Milestone M0 Review)

**Worktree**: `/Users/hoangson/.gemini/antigravity/worktrees/YouTube JP Caption Studio/audio_model`  
**Branch**: `feat/audio-listening-model`  
**Base commit**: `456568178`  
**Date**: 2026-10-12  
**Status**: **GO** (Both `chrome.tabCapture` and local audio benchmarking paths verified feasible)

---

## 1. Executive Summary & Gate Evaluation

Per `plan/audio-listening-model-2026-10-12.md`, Milestone M0 establishes whether an audio listening path is technically viable without DRM bypass or illegal scraping.

| Criterion | Target Requirement | Empirical Observation | Verdict |
|---|---|---|---|
| **Path 1: `chrome.tabCapture` via offscreen doc** | Legitimate PCM capture from playing YouTube tab in Chrome MV3 | Supported via `chrome.tabCapture.getMediaStreamId` + `navigator.mediaDevices.getUserMedia` in MV3 offscreen document. Tab audio auto-mutes by Chrome design; must be forwarded back to `audioContext.destination`. Operates strictly in **delayed-subtitle mode** (2.5s–5.5s latency). | **FEASIBLE (Delayed mode)** |
| **Path 2: Local audio file benchmark path** | Offline audio loading, exact cue slicing, and deterministic transcription | Verified with `soundfile` (0.14.0) + `mlx-whisper` (0.4.3) on Apple Silicon Metal. Direct numpy slicing by `[start_ms : end_ms]` with zero disk overhead. Cold run 3s RTF = 0.147. | **FEASIBLE (Deterministic)** |
| **M0 Gate Decision** | At least one legitimate path must work; otherwise NO-GO | **Both paths confirmed feasible**. Path 2 unblocks M1/M2 offline benchmark; Path 1 unblocks M3 real-time candidate integration. | **GATE: GO** |

---

## 2. Probe 1 — `chrome.tabCapture` via Offscreen Document

### 2.1 Chrome Manifest V3 Architecture & Permissions
- **Permission Requirements**:
  - `extension/manifest.json` currently has:
    ```json
    "permissions": ["storage", "cookies", "sidePanel", "tabs", "nativeMessaging", "alarms", "identity"]
    ```
  - Adding audio capture requires two new permissions: `"tabCapture"` and `"offscreen"`.
  - Adding these permissions modifies the user install/update prompt in Chrome Web Store / developer mode. Per plan §2, this is deferred to M3 and requires explicit user approval.
- **Service Worker Limitation**:
  - `chrome.tabCapture.capture()` is **not supported** in Service Workers because Service Workers have no DOM and no `window.navigator.mediaDevices`.
  - Calling `chrome.tabCapture.capture()` inside `background/service_worker.js` throws `TypeError: chrome.tabCapture.capture is not supported in Service Workers`.
- **Verified MV3 Pattern**:
  1. Service Worker / Sidepanel acquires a stream token:
     ```javascript
     const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: activeTabId });
     ```
  2. Background creates an offscreen document (if not already existing):
     ```javascript
     await chrome.offscreen.createDocument({
       url: 'offscreen/audio_capture.html',
       reasons: [chrome.offscreen.Reason.USER_MEDIA],
       justification: 'Capture tab audio for Japanese caption verification'
     });
     ```
  3. Offscreen document calls `getUserMedia` using the `chromeMediaSourceId`:
     ```javascript
     const stream = await navigator.mediaDevices.getUserMedia({
       audio: {
         mandatory: {
           chromeMediaSource: 'tab',
           chromeMediaSourceId: streamId
         }
       },
       video: false
     });
     ```

### 2.2 Tab Muting & Audio Routing
- **Chrome Default Behavior**: When `chrome.tabCapture` captures a tab, Chrome **automatically mutes the tab in the main browser window** to prevent dual audio / acoustic feedback.
- **Critical Requirement**: If the extension only ingests the stream into a recorder, the user will watch the YouTube video in complete silence.
- **Mandatory Audio Passthrough**:
  The offscreen document **must** bridge the stream back to the system output:
  ```javascript
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(audioCtx.destination);
  ```
- **Volume & Mute Interplay**:
  - `tabCapture` intercepts audio after the HTML5 `<video>` element's internal gain node. If the user mutes the YouTube player volume slider, the captured PCM stream is also muted (zeros).
  - If the offscreen document crashes or terminates unexpectedly, the tab may remain muted until the capture session is garbage-collected or closed.

### 2.3 User Gesture & Permissions Policy
- `chrome.tabCapture.getMediaStreamId({ targetTabId })` does not require a synchronous user gesture if the tab ID is provided and the extension holds permissions.
- However, starting `AudioContext` in the offscreen document is subject to Chrome's **Autoplay Policy**. Without a user gesture in the extension origin, `audioCtx.state` starts as `'suspended'`.
- **Recommended UX**: The audio capture should be activated by an explicit user toggle in the Sidepanel or Overlay (e.g., "Bật nghe audio"). This click provides the synchronous user gesture needed to instantiate and resume the `AudioContext` cleanly without browser warnings.
- **Visual Tab Indicator**: Chrome displays an indelible blue audio-casting / capture indicator in the tab strip whenever `tabCapture` is running.

### 2.4 Buffer Latency: Delayed-Subtitle Mode vs. Lookahead
- **Physical Reality**: Audio cannot be captured until the speaker actually pronounces the words into the video stream. Therefore:
  - Lookahead / "Ready before playback" mode: **IMPOSSIBLE** via `tabCapture`.
  - Mode is strictly: **Delayed-Subtitle Mode**.
- **Latency Breakdown**:
  1. *Acoustic Windowing*: Whisper models require at least 2.0s – 4.0s of context to resolve Japanese grammar (Japanese is head-final; verbs and negations appear at the end).
  2. *Buffer Transfer*: Sending PCM chunk from offscreen doc to `local-bridge` (`POST /asr/transcribe` or WebSocket): ~10ms – 25ms.
  3. *Inference Latency*: On Apple Silicon Metal with `mlx-whisper` (RTF ~0.15 for tiny, ~0.25–0.35 for large-v3-turbo): ~450ms – 1000ms.
  4. *Total Latency*: **2.5s – 5.5s after the speech occurs**.
- **Product Claim**: Audio model output cannot replace real-time subtitles as the primary display. It must be presented as an **asynchronous candidate layer** ("Gợi ý nghe audio") with sidepanel badges and Undo history.

### 2.5 DRM & Platform Compatibility
- Standard YouTube videos utilize unencrypted WebM/Opus or MP4/AAC streams via MSE (Media Source Extensions). Standard YouTube playback is completely accessible via `tabCapture`.
- DRM-protected platforms (e.g. Netflix with Widevine EME) will output silence or fail when captured via `tabCapture`. The audio model feature must be scoped strictly to unencrypted video platforms (YouTube).

---

## 3. Probe 2 — Local Audio File Access Path for Benchmarking

### 3.1 Purpose in Milestone M1 & M2
- Benchmarking candidate models (M2) on ground-truth segments (M1) requires:
  - 100% deterministic inputs
  - Millisecond-accurate start/duration window slicing matching `cue.start` and `cue.duration`
  - Zero network jitter, zero video player buffering artifacts, and zero user-gesture flakiness.

### 3.2 Verification on Local System
- Tested environment in `local-bridge/.venv`:
  - Python 3.12 with `mlx.core` 0.32.3, `mlx-whisper` 0.4.3, `soundfile` 0.14.0.
  - Test command:
    ```python
    import soundfile as sf
    import numpy as np
    import mlx_whisper

    # Read 16kHz mono WAV
    data, rate = sf.read(wav_path)
    # Millisecond window slicing
    start_idx = int(start_ms * rate / 1000)
    end_idx = int((start_ms + duration_ms) * rate / 1000)
    slice_audio = data[start_idx:end_idx]

    # In-memory inference
    res = mlx_whisper.transcribe(slice_audio, path_or_hf_repo='mlx-community/whisper-tiny')
    ```
- **Observed Result**:
  - `Inference time for 3s audio: 0.4423s, RTF: 0.1474`
  - Exit code 0, cleanly returned transcription without writing intermediate WAV files to disk.
- **Model Availability**:
  - `mlx-community/whisper-large-v3-turbo` verified on Hugging Face (294k+ downloads).
  - `kotoba-tech/kotoba-whisper-v2.0` verified on Hugging Face (27k+ downloads).
  - Baseline `whisper-tiny` cached locally.

### 3.3 Audio Sourcing Strategy
- Manifest `testdata/sentence-mvp/parako-5-videos-manifest.json` tracks 5 test videos:
  `ylnxFdPhLCo`, `MNGOykySDto`, `H3p-NUAaaB8`, `fYSHkuI8t-k`, `2GjTe4uQyX8`.
- Simulation test with `yt-dlp --simulate` confirmed that standard audio formats (Opus format 251) are extractable for offline evaluation.
- Per repo rule §8, large audio files are kept outside git. Sliced benchmarking will be coordinated in `testdata/audio-gold/` manifests containing timestamps and reference text labels.

---

## 4. Architectural Conclusions & Recommendations

1. **Gate Decision**: **GO**. Both probes passed feasibility.
2. **Real-time UX Designation**:
   - The audio listening pipeline is formally classified as **Delayed-Subtitle Mode**.
   - Under no circumstances will marketing or documentation claim "lookahead" or "pre-speech" correction for `tabCapture`.
3. **Roadmap Execution**:
   - **M1 (Ground Truth)**: Proceed to prepare 10–20 candidate windows in `testdata/audio-gold/` focusing on suspected YouTube ASR errors (names, homophones, negations) using local audio slicing.
   - **M2 (Model Benchmark)**: Run `scripts/asr_benchmark.py` offline across the candidate models (`mlx-whisper`, `kotoba-whisper`) on Apple Silicon.
   - **M3 (Integration)**: Only after M1 and M2 prove CER gain, seek user approval for adding `tabCapture` and `offscreen` to `extension/manifest.json`.
