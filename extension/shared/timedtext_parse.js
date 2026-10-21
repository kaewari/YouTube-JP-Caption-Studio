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
  // Single-pass entity decoder: each entity is decoded exactly once, so an
  // escaped entity stays literal ("&amp;#39;" → "&#39;", never "'"). The old
  // chain decoded "&amp;" first and then re-decoded the "&#39;" it produced.
  const NAMED_ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  const ENTITY_RE = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g;
  function decodeEntities(s) {
    return String(s || "").replace(ENTITY_RE, function (match, body) {
      if (body[0] === "#") {
        const code = body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
        try {
          return String.fromCodePoint(code);
        } catch (_) {
          return match;
        }
      }
      const named = NAMED_ENTITIES[body];
      return named === undefined ? match : named;
    });
  }

  function parseJson3Cues(data, opts = {}) {
    const events = data?.events || [];
    const nodes = [];
    for (const ev of events) {
      if (!ev || ev.tStartMs == null) continue;
      const segs = ev.segs || [];
      const rawText = segs
        .map(function (s) {
          return s && s.utf8 != null ? String(s.utf8) : "";
        })
        .join("");
      const text = rawText
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      nodes.push({
        start: Number(ev.tStartMs) / 1000,
        durMs: ev.dDurationMs != null ? Number(ev.dDurationMs) : null,
        text: text,
        ...(opts.includeSource ? { rawText, segs } : {}),
      });
    }
    const cues = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const next = nodes[i + 1];
      const hasDur = n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0;
      let end = hasDur
        ? n.start + n.durMs / 1000
        : (next ? next.start : n.start + 2);
      if (end < n.start + 0.2) {
        end = n.start + 0.2;
      }
      end = Math.round(end * 1000) / 1000;
      const cue = { start: n.start, end: end, text: n.text };
      if (opts.includeSource) {
        cue.rawText = n.rawText;
        cue.segmentAnchors = [];
        let offset = 0;
        for (let j = 0; j < n.segs.length; j++) {
          const seg = n.segs[j];
          const text = String(seg?.utf8 ?? "");
          const delta = seg?.tOffsetMs == null ? (j === 0 ? 0 : NaN) : Number(seg.tOffsetMs);
          if (text && Number.isFinite(delta) && delta >= 0) {
            cue.segmentAnchors.push({
              charStart: offset, charEnd: offset + text.length,
              time: Math.round((n.start + delta / 1000) * 1000) / 1000,
              speakerChange: !!seg?.isSpeakerChange,
            });
          }
          offset += text.length;
        }
      }
      cues.push(cue);
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
        const hasDur = n.dur != null && Number.isFinite(n.dur) && n.dur > 0;
        let end = hasDur
          ? n.start + n.dur
          : (next ? next.start : n.start + 2);
        if (end < n.start + 0.2) {
          end = n.start + 0.2;
        }
        end = Math.round(end * 1000) / 1000;
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
        : (next ? next.start : n.start + 2);
      if (end < n.start + 0.2) {
        end = n.start + 0.2;
      }
      end = Math.round(end * 1000) / 1000;
      cues.push({ start: n.start, end: end, text: n.text });
    }
    return cues;
  }

  function parseTimedtextBody(body, opts = {}) {
    const trimmed = String(body || "").trim();
    if (!trimmed) return [];
    if (trimmed[0] === "{") {
      try {
        return parseJson3Cues(JSON.parse(trimmed), opts);
      } catch {
        return [];
      }
    }
    if (trimmed[0] === "<") return parseTimedtextXml(trimmed);
    return [];
  }

  function sourceTrackInfo(track, body) {
    const first = String(body || "").trim()[0];
    return { trackId: typeof track?.vssId === "string" ? track.vssId : typeof track?.id === "string" ? track.id : null,
      language: typeof track?.languageCode === "string" ? track.languageCode : null,
      kind: typeof track?.kind === "string" ? track.kind : null,
      format: first === "{" ? "json3" : first === "<" ? "xml" : null };
  }
  return {
    sourceTrackInfo,
    decodeEntities: decodeEntities,
    parseJson3Cues: parseJson3Cues,
    parseJson3: parseJson3Cues,
    parseTimedtextXml: parseTimedtextXml,
    parseTimedtextBody: parseTimedtextBody,
  };
});
