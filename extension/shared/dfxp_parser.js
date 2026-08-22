/**
 * DFXP / TTML (Timed Text Markup Language) parser for Netflix, etc.
 * Supports clock time (HH:MM:SS.mmm), offset time (s, ms), and tick rates (e.g. 10000000t).
 * Browser + Node-friendly.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.HardsubDfxpParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_TICK_RATE = 10000000;

  function parseTime(timeStr, tickRate, frameRate) {
    if (tickRate == null) tickRate = DEFAULT_TICK_RATE;
    if (frameRate == null) frameRate = 24;
    if (!timeStr) return NaN;
    const s = String(timeStr).trim();
    if (!s) return NaN;

    if (s.endsWith("t")) {
      const ticks = Number(s.slice(0, -1));
      return Number.isFinite(ticks) ? ticks / tickRate : NaN;
    }

    if (s.endsWith("ms")) {
      const ms = Number(s.slice(0, -2));
      return Number.isFinite(ms) ? ms / 1000 : NaN;
    }

    if (s.endsWith("s")) {
      const sec = Number(s.slice(0, -1));
      return Number.isFinite(sec) ? sec : NaN;
    }

    if (s.endsWith("f")) {
      const frames = Number(s.slice(0, -1));
      return Number.isFinite(frames) ? frames / frameRate : NaN;
    }

    if (/^\d+(?:\.\d+)?$/.test(s)) {
      return Number(s);
    }

    const parts = s.split(":");
    if (parts.length === 3) {
      const h = Number(parts[0]) || 0;
      const m = Number(parts[1]) || 0;
      let secPart = parts[2];
      let sec = 0;
      let frames = 0;
      if (secPart.includes(".")) {
        sec = Number(secPart) || 0;
      } else if (secPart.includes(":")) {
        const sub = secPart.split(":");
        sec = Number(sub[0]) || 0;
        frames = Number(sub[1]) || 0;
      } else {
        sec = Number(secPart) || 0;
      }
      return h * 3600 + m * 60 + sec + (frames > 0 ? frames / frameRate : 0);
    } else if (parts.length === 2) {
      const m = Number(parts[0]) || 0;
      const sec = Number(parts[1]) || 0;
      return m * 60 + sec;
    }

    return NaN;
  }

  function decodeXmlEntities(text) {
    if (!text) return "";
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
      .replace(/&#(\d+);/g, function (_, dec) { return String.fromCharCode(parseInt(dec, 10)); });
  }

  function cleanText(rawHtml) {
    if (!rawHtml) return "";
    let s = rawHtml.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<[^>]+>/g, "");
    s = decodeXmlEntities(s);
    return s
      .split("\n")
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length > 0; })
      .join("\n")
      .trim();
  }

  function parseDfxp(xmlString) {
    if (!xmlString || typeof xmlString !== "string") return [];

    let tickRate = DEFAULT_TICK_RATE;
    let frameRate = 24;
    const tickRateMatch = xmlString.match(/ttp:tickRate=["']?(\d+)["']?/i) || xmlString.match(/tickRate=["']?(\d+)["']?/i);
    if (tickRateMatch && Number(tickRateMatch[1]) > 0) {
      tickRate = Number(tickRateMatch[1]);
    }
    const frameRateMatch = xmlString.match(/ttp:frameRate=["']?(\d+)["']?/i) || xmlString.match(/frameRate=["']?(\d+)["']?/i);
    if (frameRateMatch && Number(frameRateMatch[1]) > 0) {
      frameRate = Number(frameRateMatch[1]);
    }

    const cues = [];
    const pTagRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pTagRegex.exec(xmlString)) !== null) {
      const attrs = match[1];
      const innerContent = match[2];

      const beginMatch = attrs.match(/\bbegin=["']([^"']+)["']/i);
      const endMatch = attrs.match(/\bend=["']([^"']+)["']/i);
      const durMatch = attrs.match(/\bdur=["']([^"']+)["']/i);

      let start = beginMatch ? parseTime(beginMatch[1], tickRate, frameRate) : NaN;
      let end = endMatch ? parseTime(endMatch[1], tickRate, frameRate) : NaN;
      if (!Number.isFinite(end) && durMatch && Number.isFinite(start)) {
        const dur = parseTime(durMatch[1], tickRate, frameRate);
        if (Number.isFinite(dur)) {
          end = start + dur;
        }
      }

      const text = cleanText(innerContent);
      if (Number.isFinite(start) && text) {
        if (!Number.isFinite(end) || end <= start) {
          end = start + 2.0;
        }
        cues.push({
          start: Math.round(start * 1000) / 1000,
          end: Math.round(end * 1000) / 1000,
          text: text,
        });
      }
    }

    cues.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    return cues;
  }

  return {
    parseDfxp: parseDfxp,
    parseTime: parseTime,
    cleanText: cleanText,
    decodeXmlEntities: decodeXmlEntities,
    DEFAULT_TICK_RATE: DEFAULT_TICK_RATE,
  };
});
