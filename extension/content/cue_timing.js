/**
 * Cue timeline helpers: parse/format + apply explicit start/end.
 * No CPS / text-length duration prediction — YouTube timedtext (or import/manual) owns times.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.HardsubCueTiming = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MIN_DUR = 0.45;
  const GAP = 0.05;

  /** Apply explicit start/end from user; light clamp to neighbors (no duration estimate). */
  function applyManualTimes(cue, startRaw, endRaw, opts = {}) {
    let start = Number(startRaw);
    let end = Number(endRaw);
    if (!Number.isFinite(start)) start = Number(cue.start_media_time) || 0;
    if (!Number.isFinite(end)) end = Number(cue.end_media_time) || start + MIN_DUR;

    const prev = opts.prevCue || null;
    const next = opts.nextCue || null;
    const minStart = prev
      ? (Number(prev.end_media_time) || Number(prev.start_media_time) || 0) + GAP
      : 0;
    const maxEnd = next
      ? (Number(next.start_media_time) || end) - GAP
      : Infinity;

    start = Math.max(0, Math.max(minStart, start));
    // Start typed past the next cue must not overlap it — clamp back to the gap.
    if (Number.isFinite(maxEnd) && start > maxEnd) start = maxEnd;
    if (Number.isFinite(maxEnd)) {
      end = Math.min(maxEnd, end);
    }
    if (end <= start) end = start + MIN_DUR;
    // Fallback must never overlap the next cue — clamp to maxEnd (0-dur when
    // start itself is past the neighbor; that cue stays invisible instead of
    // stepping on the next one).
    if (Number.isFinite(maxEnd) && end > maxEnd) end = Math.max(start, maxEnd);

    cue.start_media_time = start;
    cue.end_media_time = end;
    return { start, end };
  }

  /**
   * Snap each cue's end to the next cue's start (YSD / YouTube VTT style).
   * - Shortens overlapping rolling ASR windows
   * - Extends too-short dDurationMs windows (scrolling ASR often reports 3s
   *   while the line actually stays until the next event / \\n separator)
   * Supports {start,end} and {start_media_time,end_media_time}.
   */
  function clampCueEndsToNextStart(cues) {
    const out = (cues || []).map((c) => Object.assign({}, c));
    const startOf = (c) =>
      Number(
        c.start_media_time != null && c.start_media_time !== ""
          ? c.start_media_time
          : c.start
      ) || 0;
    const endOf = (c) =>
      Number(
        c.end_media_time != null && c.end_media_time !== ""
          ? c.end_media_time
          : c.end
      ) || 0;
    out.sort((a, b) => startOf(a) - startOf(b));
    for (let i = 0; i < out.length; i += 1) {
      const c = out[i];
      const start = startOf(c);
      let end = endOf(c);
      if (!(end > start)) end = start + MIN_DUR;
      const next = out[i + 1];
      if (next) {
        const nextStart = startOf(next);
        if (nextStart > start) {
          // Own [start, nextStart) — match VTT cue boundaries, not raw dDurationMs.
          end = nextStart - GAP;
          if (end <= start) end = start + Math.min(MIN_DUR, nextStart - start);
        }
      }
      c.start = start;
      c.end = end;
      c.start_media_time = start;
      c.end_media_time = end;
    }
    return out;
  }

  function parseTimeInput(raw) {
    const s = String(raw || "")
      .trim()
      .replace(",", ".");
    if (!s) return NaN;
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
    const m = s.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
    if (!m) return NaN;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const frac = m[3] ? Number(`0.${m[3]}`) : 0;
    return min * 60 + sec + frac;
  }

  function formatTimeInput(sec) {
    const t = Math.max(0, Number(sec) || 0);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    const whole = Math.floor(s);
    const tenths = Math.round((s - whole) * 10);
    if (tenths > 0) return `${m}:${String(whole).padStart(2, "0")}.${tenths}`;
    return `${m}:${String(whole).padStart(2, "0")}`;
  }

  return {
    applyManualTimes,
    clampCueEndsToNextStart,
    parseTimeInput,
    formatTimeInput,
    MIN_DUR,
    GAP,
  };
});
