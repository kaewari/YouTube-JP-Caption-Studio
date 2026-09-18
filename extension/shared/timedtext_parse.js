/**
 * Timedtext (XML / JSON3) parsing helpers for YouTube captions.
 * Exposes globalThis.HardsubTimedtextParse (UMD: browser content scripts, SW, Node).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HardsubTimedtextParse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MISSING_END_MIN_SEC = 0.2;

  function decodeEntities(s) {
    return String(s || "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); });
  }

  function positiveNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function resolveCueEnd(start, durationSec, nextStart, explicitEnd) {
    const sourceEnd = Number(explicitEnd);
    if (Number.isFinite(sourceEnd) && sourceEnd > start) return sourceEnd;
    const duration = positiveNumber(durationSec);
    if (duration != null) return start + duration;
    const boundary = Number(nextStart);
    if (Number.isFinite(boundary) && boundary > start) return boundary;
    // No source boundary exists for a terminal/same-start cue; avoid inventing 2-3 seconds.
    return start + MISSING_END_MIN_SEC;
  }

  function parseJson3Cues(data) {
    const nodes = [];
    for (const ev of data?.events || []) {
      if (!ev || ev.tStartMs == null) continue;
      const start = Number(ev.tStartMs) / 1000;
      if (!Number.isFinite(start)) continue;
      const text = (ev.segs || [])
        .map(function (s) { return s && s.utf8 != null ? String(s.utf8) : ""; })
        .join("")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      nodes.push({
        start,
        durationSec: ev.dDurationMs != null && Number.isFinite(Number(ev.dDurationMs))
          ? Number(ev.dDurationMs) / 1000
          : null,
        text,
      });
    }
    return nodes.map(function (n, i) {
      const next = nodes[i + 1];
      return { start: n.start, end: resolveCueEnd(n.start, n.durationSec, next?.start, null), text: n.text };
    });
  }

  function parseTimeStr(val) {
    if (val == null || val === "") return null;
    const raw = String(val).trim();
    const unit = raw.match(/^([+-]?\d+(?:\.\d+)?)(ms|s|m|h)$/i);
    if (unit) {
      const n = Number(unit[1]);
      const u = unit[2].toLowerCase();
      if (u === "ms") return n / 1000;
      if (u === "s") return n;
      if (u === "m") return n * 60;
      if (u === "h") return n * 3600;
    }
    if (raw.includes(":")) {
      const parts = raw.split(":").map(Number);
      if (!parts.every(Number.isFinite)) return null;
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function cleanXmlText(inner) {
    return decodeEntities(String(inner || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim());
  }

  function parseTimedtextXml(xml) {
    if (!xml || typeof xml !== "string") return [];

    const textNodes = [];
    const textRe = /<text\s+([^>]*)>([\s\S]*?)<\/text>/gi;
    let m;
    while ((m = textRe.exec(xml))) {
      const attrs = m[1] || "";
      const startRaw = (attrs.match(/\bstart="([\d.]+)"/) || [])[1];
      const durRaw = (attrs.match(/\bdur="([\d.]+)"/) || [])[1];
      const start = Number(startRaw == null ? 0 : startRaw);
      if (!Number.isFinite(start)) continue;
      const text = cleanXmlText(m[2]);
      if (!text) continue;
      textNodes.push({ start, durationSec: durRaw == null ? null : Number(durRaw), text });
    }
    if (textNodes.length) {
      return textNodes.map(function (n, i) {
        const next = textNodes[i + 1];
        return { start: n.start, end: resolveCueEnd(n.start, n.durationSec, next?.start, null), text: n.text };
      });
    }

    const pNodes = [];
    const pRe = /<p\s+([^>]*)>([\s\S]*?)<\/p>/gi;
    while ((m = pRe.exec(xml))) {
      const attrs = m[1] || "";
      const tRaw = (attrs.match(/\bt="([\d.]+)"/) || [])[1];
      const beginRaw = (attrs.match(/\bbegin="([^"]+)"/) || [])[1];
      const dRaw = (attrs.match(/\bd="([\d.]+)"/) || [])[1];
      const endRaw = (attrs.match(/\bend="([^"]+)"/) || [])[1];
      const durRaw = (attrs.match(/\bdur="([^"]+)"/) || [])[1];
      const start = tRaw != null ? Number(tRaw) / 1000 : (parseTimeStr(beginRaw) ?? 0);
      if (!Number.isFinite(start)) continue;
      const durationSec = dRaw != null ? Number(dRaw) / 1000 : parseTimeStr(durRaw);
      const explicitEnd = parseTimeStr(endRaw);
      const text = cleanXmlText(m[2]);
      if (!text) continue;
      pNodes.push({ start, durationSec, explicitEnd, text });
    }
    return pNodes.map(function (n, i) {
      const next = pNodes[i + 1];
      return { start: n.start, end: resolveCueEnd(n.start, n.durationSec, next?.start, n.explicitEnd), text: n.text };
    });
  }

  function parseTimedtextBody(body) {
    const trimmed = String(body || "").trim();
    if (!trimmed) return [];
    if (trimmed[0] === "{") {
      try { return parseJson3Cues(JSON.parse(trimmed)); } catch { return []; }
    }
    if (trimmed[0] === "<") return parseTimedtextXml(trimmed);
    return [];
  }

  return { decodeEntities, parseJson3Cues, parseJson3: parseJson3Cues, parseTimedtextXml, parseTimedtextBody };
});
