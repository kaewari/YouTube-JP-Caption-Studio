/**
 * Timedtext (XML / JSON3) parsing helpers for YouTube captions.
 * Exposes globalThis.HardsubTimedtextParse (UMD: browser content scripts, SW, Node).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.HardsubTimedtextParse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function decodeEntities(s) {
    return String(s || "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) {
        return String.fromCharCode(parseInt(h, 16));
      })
      .replace(/&#(\d+);/g, function (_, n) {
        return String.fromCharCode(Number(n));
      });
  }

  const FALLBACK_LAST_CUE_DUR = 2.0;

  function parseJson3Cues(data) {
    const events = data?.events || [];
    const nodes = [];
    for (const ev of events) {
      if (!ev || ev.tStartMs == null) continue;
      const segs = ev.segs || [];
      const text = segs
        .map(function (s) {
          return s && s.utf8 != null ? String(s.utf8) : "";
        })
        .join("")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      nodes.push({
        start: Number(ev.tStartMs) / 1000,
        durMs: ev.dDurationMs != null ? Number(ev.dDurationMs) : null,
        text: text,
      });
    }
    const cues = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const next = nodes[i + 1];
      const hasDur = n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0;
      let end = hasDur
        ? n.start + n.durMs / 1000
        : (next ? (next.start > n.start ? next.start : n.start + 0.2) : n.start + FALLBACK_LAST_CUE_DUR);
      if (next && end > next.start) {
        end = Math.max(n.start + 0.2, next.start - 0.05);
      }
      end = Math.round(Math.max(n.start + 0.2, end) * 1000) / 1000;
      cues.push({ start: n.start, end: end, text: n.text });
    }
    return cues;
  }

  function parseTimeStr(val) {
    if (!val) return null;
    val = String(val).trim();
    if (val.endsWith("s")) val = val.slice(0, -1);
    if (val.includes(":")) {
      const parts = val.split(":").map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }

  function parseTimedtextXml(xml) {
    if (!xml || typeof xml !== "string") return [];

    // YSD-style <text start="" dur="">
    const textNodes = [];
    const textRe = /<text\s+([^>]*)>([\s\S]*?)<\/text>/gi;
    let m;
    while ((m = textRe.exec(xml))) {
      const attrs = m[1] || "";
      const start = Number((attrs.match(/\bstart="([\d.]+)"/) || [])[1] || 0);
      const durMatch = attrs.match(/\bdur="([\d.]+)"/);
      const dur = durMatch ? Number(durMatch[1]) : null;
      const text = decodeEntities(
        (m[2] || "")
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/<[^>]+>/g, "")
          .replace(/\n+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      );
      textNodes.push({ start: start, dur: dur, text: text });
    }
    if (textNodes.length) {
      const cues = [];
      for (let i = 0; i < textNodes.length; i += 1) {
        const n = textNodes[i];
        if (!n.text) continue;
        const next = textNodes[i + 1];
        const hasDur = n.dur != null && Number.isFinite(n.dur) && n.dur > 0;
        let end = hasDur
          ? n.start + n.dur
          : (next ? (next.start > n.start ? next.start : n.start + 0.2) : n.start + FALLBACK_LAST_CUE_DUR);
        if (next && end > next.start) {
          end = Math.max(n.start + 0.2, next.start - 0.05);
        }
        end = Math.round(Math.max(n.start + 0.2, end) * 1000) / 1000;
        cues.push({ start: n.start, end: end, text: n.text });
      }
      if (cues.length) return cues;
    }

    const cues = [];
    const pNodes = [];
    const pRe = /<p\s+([^>]*)>([\s\S]*?)<\/p>/gi;
    while ((m = pRe.exec(xml))) {
      const attrs = m[1] || "";
      const inner = m[2] || "";
      const tMatch = attrs.match(/\bt="(\d+)"/);
      const beginMatch = attrs.match(/\bbegin="([^"]+)"/);
      let t = 0;
      if (tMatch) {
        t = Number(tMatch[1]) / 1000;
      } else if (beginMatch) {
        t = parseTimeStr(beginMatch[1]) || 0;
      }

      const dRaw = (attrs.match(/\bd="(\d+)"/) || [])[1];
      const endMatch = attrs.match(/\bend="([^"]+)"/);
      const durMatch = attrs.match(/\bdur="([^"]+)"/);
      let durMs = dRaw != null ? Number(dRaw) : null;
      if (durMs == null && durMatch) {
        const durSec = parseTimeStr(durMatch[1]);
        if (durSec != null && durSec > 0) {
          durMs = Math.round(durSec * 1000);
        }
      }
      if (durMs == null && endMatch) {
        const endSec = parseTimeStr(endMatch[1]);
        if (endSec != null && endSec > t) {
          durMs = Math.round((endSec - t) * 1000);
        }
      }
      const text = decodeEntities(
        inner
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/<[^>]+>/g, "")
          .replace(/\n+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      );
      if (!text) continue;
      pNodes.push({
        start: t,
        durMs: durMs,
        text: text,
      });
    }
    for (let i = 0; i < pNodes.length; i += 1) {
      const n = pNodes[i];
      const next = pNodes[i + 1];
      const hasDur = n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0;
      let end = hasDur
        ? n.start + n.durMs / 1000
        : (next ? (next.start > n.start ? next.start : n.start + 0.2) : n.start + FALLBACK_LAST_CUE_DUR);
      if (next && end > next.start) {
        end = Math.max(n.start + 0.2, next.start - 0.05);
      }
      end = Math.round(Math.max(n.start + 0.2, end) * 1000) / 1000;
      cues.push({ start: n.start, end: end, text: n.text });
    }
    return cues;
  }

  function parseTimedtextBody(body) {
    const trimmed = String(body || "").trim();
    if (!trimmed) return [];
    if (trimmed[0] === "{") {
      try {
        return parseJson3Cues(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }
    if (trimmed[0] === "<") return parseTimedtextXml(trimmed);
    return [];
  }

  return {
    decodeEntities: decodeEntities,
    parseJson3Cues: parseJson3Cues,
    parseJson3: parseJson3Cues,
    parseTimedtextXml: parseTimedtextXml,
    parseTimedtextBody: parseTimedtextBody,
  };
});
