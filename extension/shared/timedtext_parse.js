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
      // YSD / VTT: end at next cue start (ignore short scrolling-ASR dDurationMs).
      let end = next
        ? next.start
        : n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0
          ? n.start + n.durMs / 1000
          : n.start + 2;
      cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
    }
    return cues;
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
      const dur = Number((attrs.match(/\bdur="([\d.]+)"/) || [])[1] || 0);
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
        const end = next ? next.start : n.start + Math.max(0.2, n.dur || 2);
        cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
      }
      if (cues.length) return cues;
    }

    const cues = [];
    const pNodes = [];
    const pRe = /<p\s+([^>]*)>([\s\S]*?)<\/p>/gi;
    while ((m = pRe.exec(xml))) {
      const attrs = m[1] || "";
      const inner = m[2] || "";
      const t = Number((attrs.match(/\bt="(\d+)"/) || [])[1] || 0) / 1000;
      const dRaw = (attrs.match(/\bd="(\d+)"/) || [])[1];
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
        durMs: dRaw != null ? Number(dRaw) : null,
        text: text,
      });
    }
    for (let i = 0; i < pNodes.length; i += 1) {
      const n = pNodes[i];
      const next = pNodes[i + 1];
      // YSD / VTT: end at next cue start (ignore short scrolling-ASR dDurationMs).
      let end = next
        ? next.start
        : n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0
          ? n.start + n.durMs / 1000
          : n.start + 2;
      cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
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
