/**
 * Parse export TXT / JSON cue rows for side-panel Import.
 * Browser (side panel) + Node-friendly.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.HardsubImportParse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /** m:ss(.frac) or plain seconds — not a greedy \S+ (avoids eating 0:08-0:10). */
  const TIME_TOKEN_RE = String.raw`\d+(?::\d{1,2})?(?:\.\d+)?`;
  /**
   * `[N]` or `[N-M]` (cue id / id range — hyphen inside brackets is NOT time),
   * then start (→|->|–|—|-)? end.
   * Groups: [1]=index, [2]=start, [3]=end?
   */
  const HEAD_RE = new RegExp(
    `^\\[(\\d+(?:-\\d+)?)\\]\\s+(${TIME_TOKEN_RE})(?:\\s*(?:→|->|–|—|-)\\s*(${TIME_TOKEN_RE}))?`
  );

  function compareCueTimeline(a, b) {
    const ds =
      (Number(a?.start_media_time) || 0) - (Number(b?.start_media_time) || 0);
    if (ds !== 0) return ds;
    return (Number(a?.end_media_time) || 0) - (Number(b?.end_media_time) || 0);
  }

  function parseTimeToken(raw) {
    const s = String(raw || "").trim().replace(",", ".");
    if (!s) return NaN;
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
    const m = s.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
    if (!m) return NaN;
    const mins = Number(m[1]) || 0;
    const secs = Number(m[2]) || 0;
    const frac = m[3] ? Number(`0.${m[3]}`) : 0;
    return mins * 60 + secs + frac;
  }

  function extractCuesFromJson(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.cues)) return parsed.cues;
      // chrome.storage dump: { "transcript:xxx": [...] }
      for (const v of Object.values(parsed)) {
        if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
      }
    }
    return null;
  }

  function parseExportTxt(text) {
    const blocks = String(text || "").split(/-{10,}/);
    const out = [];
    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map((l) => l.trimEnd());
      let start = NaN;
      let end = NaN;
      let source = "";
      let en = null;
      let vi = null;
      const flush = () => {
        if (!Number.isFinite(start) && !source && en == null && vi == null) return;
        if (!Number.isFinite(start) && !source) return;
        out.push({
          start_media_time: Number.isFinite(start) ? start : 0,
          end_media_time: Number.isFinite(end) ? end : undefined,
          source,
          en,
          vi,
        });
      };
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        // Accept 0:00 → 0:02, 0:00 -> 0:02, 0:00 - 0:02, 0:00-0:02, en/em dash.
        const head = t.match(HEAD_RE);
        if (head) {
          flush();
          start = parseTimeToken(head[2]);
          end = head[3] ? parseTimeToken(head[3]) : NaN;
          source = "";
          en = null;
          vi = null;
          continue;
        }
        if (/^JA:\s*/i.test(t)) {
          source = t.replace(/^JA:\s*/i, "");
          continue;
        }
        if (/^EN:\s*/i.test(t)) {
          en = t.replace(/^EN:\s*/i, "");
          continue;
        }
        if (/^VI:\s*/i.test(t)) {
          vi = t.replace(/^VI:\s*/i, "");
          continue;
        }
      }
      flush();
    }
    out.sort(compareCueTimeline);
    return out;
  }

  function normalizeParsedImportRows(rows) {
    return (rows || [])
      .filter((r) => r && typeof r === "object")
      .map((r) => ({
        id: r.id || "",
        start_media_time: r.start_media_time ?? r.start ?? r.media_time,
        end_media_time: r.end_media_time ?? r.end,
        source: r.source || r.text || r.ja || "",
        en: r.en,
        vi: r.vi,
        tokens: r.tokens,
        translated: r.translated,
        mt_locked: r.mt_locked,
        translation_source: r.translation_source,
      }));
  }

  return {
    parseTimeToken,
    extractCuesFromJson,
    parseExportTxt,
    normalizeParsedImportRows,
    compareCueTimeline,
    HEAD_RE,
  };
});
