/**
 * Timedtext (XML / JSON3) parsing helpers for YouTube captions.
 * Exposes globalThis.HardsubTimedtextParse (UMD: browser content scripts, SW, Node).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
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
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); });
  }

  const FALLBACK_LAST_CUE_DUR = 2.0;

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
      const hasDur = n.durationSec != null && Number.isFinite(n.durationSec) && n.durationSec > 0;
      let end = hasDur
        ? n.start + n.durationSec
        : (next ? (next.start > n.start ? next.start : n.start + 0.2) : n.start + FALLBACK_LAST_CUE_DUR);
      if (next && end > next.start) {
        end = Math.max(n.start + 0.2, next.start - 0.05);
      }
      end = Math.round(Math.max(n.start + 0.2, end) * 1000) / 1000;
      return { start: n.start, end, text: n.text };
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
      const start = Number((attrs.match(/\bstart="([\d.]+)"/) || [])[1] || 0);
      const durMatch = attrs.match(/\bdur="([\d.]+)"/);
      const dur = durMatch ? Number(durMatch[1]) : null;
      const text = cleanXmlText(m[2]);
      if (!Number.isFinite(start)) continue;
      if (!text) continue;
      textNodes.push({ start, dur, text });
    }
    if (textNodes.length) {
      return textNodes.map(function (n, i) {
        const next = textNodes[i + 1];
        const hasDur = n.dur != null && Number.isFinite(n.dur) && n.dur > 0;
        let end = hasDur
          ? n.start + n.dur
          : (next ? (next.start > n.start ? next.start : n.start + 0.2) : n.start + FALLBACK_LAST_CUE_DUR);
        if (next && end > next.start) {
          end = Math.max(n.start + 0.2, next.start - 0.05);
        }
        end = Math.round(Math.max(n.start + 0.2, end) * 1000) / 1000;
        return { start: n.start, end, text: n.text };
      });
    }

    const pNodes = [];
    const pRe = /<p\s+([^>]*)>([\s\S]*?)<\/p>/gi;
    while ((m = pRe.exec(xml))) {
      const attrs = m[1] || "";
      const inner = m[2] || "";
      const tMatch = attrs.match(/\bt="([\d.]+)"/);
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
      pNodes.push({ start: t, durMs, text });
    }
    return pNodes.map(function (n, i) {
      const next = pNodes[i + 1];
      const hasDur = n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0;
      let end = hasDur
        ? n.start + n.durMs / 1000
        : (next ? (next.start > n.start ? next.start : n.start + 0.2) : n.start + FALLBACK_LAST_CUE_DUR);
      if (next && end > next.start) {
        end = Math.max(n.start + 0.2, next.start - 0.05);
      }
      end = Math.round(Math.max(n.start + 0.2, end) * 1000) / 1000;
      return { start: n.start, end, text: n.text };
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
