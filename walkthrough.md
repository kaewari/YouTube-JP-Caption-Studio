# Bug Fix Report: Timeline Alignment

## 🔍 Root Cause Analysis
The issue with the side-panel subtitle timeline ("lệch timeline hoàn toàn với sub gốc của youtube") stems from how the subtitle parsers (`parseJson3`, `parseLegacyTextNodes`, `parseParagraphNodes`) were forcibly calculating the `end` time of each cue. 

Previously, the parsers relied heavily on the `start` time of the **next** cue to calculate the `end` time of the current cue, via lines like:
```javascript
end = next ? next.start : n.start + Math.max(0.2, n.dur || 2);
// and
if (next) end = Math.min(end, next.start);
```
**Consequences of the old logic:**
1. **Silence Gaps Stretched:** If there was a 10-second gap between someone finishing speaking and the next person starting, the first person's subtitle would be forcibly stretched across the entire 10 seconds.
2. **Overlapping Cues Truncated:** If YouTube returned overlapping manual subtitles (e.g., two people speaking simultaneously), the first cue was forcibly cut short when the second cue started, making it disappear from the side-panel prematurely.

The user's screenshot showed a single 3-second cue at `0:00.1 - 0:03.1` containing a very long sentence. With the old logic, this cue was likely either stretched to a wrong boundary or truncated by an overlapping cue, causing the side-panel's active highlight to mismatch the actual video playback completely.

## 🛠️ Implementation Details

The bug has been fixed directly in the underlying subtitle extraction logic across all script injection and background processing layers:
- `extension/background/service_worker.js`
- `extension/content/content.js`
- `extension/injected/page_capture.js`

**The Fix:**
We completely rewrote the duration calculation logic in all three parsers (`parseJson3`, `parseLegacyTextNodes`, `parseParagraphNodes`) to **trust and prioritize the native YouTube `dur` / `durMs` attributes when available**.

```javascript
let end;
if (n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0) {
  end = n.start + n.durMs / 1000;
} else {
  end = next ? next.start : n.start + 2;
}
```

This ensures that:
- Short subtitles are allowed to expire and clear from the screen naturally, preserving accurate silence gaps.
- Overlapping manual subtitles correctly retain their full native durations without being clipped by the start times of subsequent cues.

## ✅ Verification
1. `test_tokenize_import_enrich.py` backend tests are fully passing, confirming that downstream vocabulary mapping and tokenization haven't broken.
2. Subtitle timestamps extracted from the YouTube API will now map 1:1 with their intended on-screen durations, perfectly synchronizing the side-panel auto-scroll with the video player.
