/**
 * Caption cue normalization (SFX strip/drop only).
 * Preserves YouTube timedtext start/end — do not move text across cue windows.
 * Works in browser (content script) and Node (sanity tests).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.HardsubNormalize = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BRACKET_ONLY_RE = /^[\[［【(（][^\]］】)）]+[\]］】)）]$/u;
  const SFX_TOKEN_RE = /[\[［【][^\]］】]*[\]］】]/gu;
  const SFX_SOUND_PAREN_RE = /[（(][^）)]*音[）)]/gu;
  const MUSIC_SYM_RE = /[♪🎵♫]+/gu;

  function charLen(s) {
    return Array.from(String(s || "")).length;
  }

  function isMusicOnly(text) {
    const t = String(text || "").trim();
    return !!t && /^[♪🎵♫\s]+$/u.test(t);
  }

  /** Bracket/paren-only label (SFX), no long CJK dialogue outside. */
  function isSfxLabelOnly(text) {
    const t = String(text || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) return true;
    if (isMusicOnly(t)) return true;
    if (BRACKET_ONLY_RE.test(t)) return true;
    return false;
  }

  function stripSfxTokens(text) {
    return String(text || "")
      .replace(SFX_TOKEN_RE, "")
      .replace(SFX_SOUND_PAREN_RE, "")
      .replace(MUSIC_SYM_RE, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Drop pure SFX cues; strip SFX tokens from mixed cues (drop if empty).
   * Keeps each cue's YouTube start/end unchanged.
   * Input/output: { start, end, text }[]
   */
  function dropAndStripSfx(cues) {
    const out = [];
    for (const c of cues || []) {
      const raw = String(c.text || "").trim();
      if (!raw) continue;
      if (isSfxLabelOnly(raw)) continue;
      const cleaned = stripSfxTokens(raw);
      if (!cleaned || isSfxLabelOnly(cleaned)) continue;
      out.push({
        start: Number(c.start) || 0,
        end: Number(c.end) || 0,
        text: cleaned,
      });
    }
    return out;
  }

  function isRollingAsrUpdate(prevText, currText) {
    const p = String(prevText || "").normalize("NFKC").replace(/\s+/g, " ").trim();
    const c = String(currText || "").normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!p || !c) return false;
    if (p === c) return true;
    if (c.startsWith(p)) return true;
    if (c.includes(p)) return true;
    const pLen = p.length;
    const cLen = c.length;
    if (pLen >= 5 && cLen >= 5) {
      const minLen = Math.min(pLen, cLen);
      const prefixLen = Math.floor(minLen * 0.7);
      if (p.slice(0, prefixLen) === c.slice(0, prefixLen)) {
        return true;
      }
    }
    return false;
  }

  function mergeRollingAsrCues(cues) {
    if (!cues || !cues.length) return [];
    const out = [];
    for (const c of cues) {
      if (!out.length) {
        out.push(Object.assign({}, c));
        continue;
      }
      const prev = out[out.length - 1];
      const prevText = String(prev.text || prev.source || "").trim();
      const currText = String(c.text || c.source || "").trim();
      if (isRollingAsrUpdate(prevText, currText)) {
        prev.text = currText;
        if (prev.source != null) prev.source = currText;
        const cStart = Number(c.start != null ? c.start : c.start_media_time) || 0;
        const cEnd = Number(c.end != null ? c.end : c.end_media_time) || (cStart + 3);
        const pEnd = Number(prev.end != null ? prev.end : prev.end_media_time) || 0;
        const newEnd = Math.max(pEnd, cEnd);
        prev.end = newEnd;
        prev.end_media_time = newEnd;
      } else {
        out.push(Object.assign({}, c));
      }
    }
    return out;
  }

  /** Normalize text only; timeline stays YouTube timedtext boundaries. */
  function normalizeCues(cues) {
    return dropAndStripSfx(cues);
  }

  return {
    normalizeCues,
    mergeRollingAsrCues,
    isRollingAsrUpdate,
    dropAndStripSfx,
    stripSfxTokens,
    isSfxLabelOnly,
    isMusicOnly,
    charLen,
  };
});

