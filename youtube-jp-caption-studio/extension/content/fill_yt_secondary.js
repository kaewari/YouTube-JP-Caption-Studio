/**
 * Union-merge YouTube secondary timedtext into cue rows.
 * JA timeline stays; EN/VI attach by start ±tol or temporal overlap;
 * unmatched become orphan rows (unless appendOrphans=false).
 * Works in browser and Node (sanity).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.HardsubFillYtSecondary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_TOL = 0.35;
  /** Min overlap / min(span) to accept a start-mismatched pair. */
  const OVERLAP_FRAC = 0.35;

  function defaultIsLocked(c) {
    if (!c) return false;
    if (c.mt_locked) return true;
    const src = String(c.translation_source || "");
    return src === "user" || src === "import";
  }

  function cueSpan(c) {
    const start = Number(c.start_media_time) || 0;
    const endRaw = Number(c.end_media_time);
    const end = Number.isFinite(endRaw) && endRaw > start ? endRaw : start + 2;
    return { start, end };
  }

  function secSpan(sec) {
    const start = Number(sec.start) || 0;
    const endRaw = Number(sec.end);
    const end = Number.isFinite(endRaw) && endRaw > start ? endRaw : start + 2;
    return { start, end };
  }

  function overlap(a0, a1, b0, b1) {
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  }

  /** Rank: tier0 start±tol (closer dt better), tier1 overlap frac. null = no match. */
  function matchRank(cue, sec, tol) {
    const cs = cueSpan(cue);
    const ss = secSpan(sec);
    const dt = Math.abs(cs.start - ss.start);
    const ov = overlap(cs.start, cs.end, ss.start, ss.end);
    if (dt <= tol) {
      return { tier: 0, dt, ov };
    }
    const minSpan = Math.min(cs.end - cs.start, ss.end - ss.start) || 1;
    const frac = ov / minSpan;
    if (ov > 0 && frac >= OVERLAP_FRAC) {
      return { tier: 1, frac, ov };
    }
    return null;
  }

  function betterRank(a, b) {
    if (!a) return false;
    if (!b) return true;
    if (a.tier !== b.tier) return a.tier < b.tier;
    if (a.tier === 0) {
      if (a.dt !== b.dt) return a.dt < b.dt;
      return (a.ov || 0) > (b.ov || 0);
    }
    if (a.frac !== b.frac) return a.frac > b.frac;
    return (a.ov || 0) > (b.ov || 0);
  }

  function findBestRow(cues, sec, tol, pred) {
    let best = null;
    let bestR = null;
    for (const c of cues || []) {
      if (pred && !pred(c)) continue;
      const r = matchRank(c, sec, tol);
      if (betterRank(r, bestR)) {
        best = c;
        bestR = r;
      }
    }
    return best;
  }

  function orphanId(start, field, text) {
    const slice = String(text || "")
      .replace(/\s+/g, "")
      .slice(0, 16);
    return `c-${Number(start).toFixed(3)}-yt-${field}-${slice || "x"}`;
  }

  function makeOrphan(sec, field, text) {
    const ss = secSpan(sec);
    const row = {
      id: orphanId(ss.start, field, text),
      start_media_time: ss.start,
      end_media_time: ss.end,
      source: "",
      en: "",
      vi: "",
      tokens: [],
      translated: true,
      text_source: "yt",
      translation_source: "yt",
    };
    row[field] = text;
    return row;
  }

  function paintField(hit, field, text) {
    hit[field] = text;
    hit.translated = !!(String(hit.en || "").trim() || String(hit.vi || "").trim());
    hit.translation_source = "yt";
    if (!hit.text_source) hit.text_source = "yt";
  }

  /**
   * Attach one secondary lang onto cues (fill empty unlocked, or append orphan).
   * Prefers empty unlockable rows; overlap covers start-skewed EN/VI tracks.
   * Second pass fills leftover blank JA from unused secondary.
   * @returns {number} rows changed (filled or appended)
   */
  function attachLang(cues, secondary, field, tol, isLocked, appendOrphans) {
    const list = secondary || [];
    const used = new Set();
    let n = 0;
    const canPaint = (c) => !isLocked(c) && !String(c[field] || "").trim();

    for (let i = 0; i < list.length; i++) {
      const sec = list[i];
      const text = String(sec.text || "").trim();
      if (!text) continue;
      // Prefer blank unlockable; else any match consumes the secondary (no wrong orphan).
      const hit =
        findBestRow(cues, sec, tol, canPaint) || findBestRow(cues, sec, tol);
      if (hit) {
        used.add(i);
        if (canPaint(hit)) {
          paintField(hit, field, text);
          n += 1;
        }
        continue;
      }
      if (!appendOrphans) continue;
      cues.push(makeOrphan(sec, field, text));
      used.add(i);
      n += 1;
    }

    // Blank JA leftover: nearest unused secondary by same rank rules.
    for (const cue of cues || []) {
      if (!canPaint(cue)) continue;
      let bestI = -1;
      let bestR = null;
      for (let i = 0; i < list.length; i++) {
        if (used.has(i)) continue;
        const sec = list[i];
        const text = String(sec.text || "").trim();
        if (!text) continue;
        const r = matchRank(cue, sec, tol);
        if (betterRank(r, bestR)) {
          bestI = i;
          bestR = r;
        }
      }
      if (bestI < 0) continue;
      paintField(cue, field, String(list[bestI].text || "").trim());
      used.add(bestI);
      n += 1;
    }
    return n;
  }

  /**
   * Union-merge EN/VI timedtext into cue list (mutates cues; may append orphans).
   * @param {object[]} cues - JA (or existing) rows
   * @param {object[]|null} enCues - { start, end?, text }[]
   * @param {object[]|null} viCues - { start, end?, text }[]
   * @param {{ tol?: number, isLocked?: (c: object) => boolean, appendOrphans?: boolean }} [opts]
   * @returns {number} fills + orphans appended
   */
  function fillYtSecondary(cues, enCues, viCues, opts) {
    const list = cues || [];
    const tol = Number(opts?.tol);
    const matchTol = Number.isFinite(tol) ? tol : DEFAULT_TOL;
    const isLocked = typeof opts?.isLocked === "function" ? opts.isLocked : defaultIsLocked;
    const appendOrphans = opts?.appendOrphans !== false;
    let n = 0;
    n += attachLang(list, enCues, "en", matchTol, isLocked, appendOrphans);
    n += attachLang(list, viCues, "vi", matchTol, isLocked, appendOrphans);
    if (n) {
      list.sort(
        (a, b) => (Number(a.start_media_time) || 0) - (Number(b.start_media_time) || 0)
      );
    }
    return n;
  }

  return { fillYtSecondary, DEFAULT_TOL, OVERLAP_FRAC };
});
