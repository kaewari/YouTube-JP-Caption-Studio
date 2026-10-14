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
  const SFX_KEYWORDS = [
    "笑", "笑い", "笑い声", "泣", "泣き声", "拍手", "ため息", "溜息", "咳", "くしゃみ", "歓声", "音楽", "効果音", "悲鳴", "沈黙",
    "足音", "鐘", "ざわめき", "歓呼", "息", "叫び", "チャイム", "サイレン", "爆発音", "銃声",
    "ノック音", "着信音", "電子音", "bgm", "sfx", "music", "applause", "laughter", "cheering",
    "cough", "sigh", "gasp", "screaming", "silence", "snicker", "crying", "groan", "chuckle",
    "ambient", "sound", "noise", "âm nhạc", "vỗ tay", "tiếng cười", "tiếng khóc", "thở dài",
    "im lặng", "tiếng chuông", "tiếng súng", "tiếng nổ", "tiếng bước chân"
  ];
  const SFX_KEYWORDS_SET = new Set(SFX_KEYWORDS.map((k) => k.toLowerCase()));
  const SFX_INLINE_RE = new RegExp(
    `[\\[［【(（]\\s*(?:${SFX_KEYWORDS.join("|")}|[^\\s\\]］】)）]*(?:音|BGM|SFX|music|applause|laughter|âm nhạc|vỗ tay))\\s*[\\]］】)）]`,
    "giu"
  );
  const MUSIC_SYM_RE = /[♪🎵♫🎶〜~～]+/gu;

  function charLen(s) {
    return Array.from(String(s || "")).length;
  }

  function isMusicOnly(text) {
    const t = String(text || "").trim();
    return !!t && /^[♪🎵♫🎶〜~～\s]+$/u.test(t);
  }

  /**
   * Only drops pure SFX/music tags, NEVER drops dialogue/monologue in parentheses.
   */
  function isSfxLabelOnly(text) {
    const t = String(text || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) return true;
    if (isMusicOnly(t)) return true;

    // Check if wrapped in brackets: [...], (...), （...）, 【...】
    const m = t.match(/^[\[［【(（](.+)[\]］】)）]$/u);
    if (m) {
      const inner = m[1].trim();
      if (!inner || isMusicOnly(inner)) return true;
      const lower = inner.toLowerCase();
      if (SFX_KEYWORDS_SET.has(lower)) return true;
      // Short label with known SFX indicator words
      if (
        inner.length <= 12 &&
        /(?:音|BGM|SFX|music|applause|laughter|âm nhạc|vỗ tay|tiếng|cheer|gasp|sigh)/i.test(inner)
      ) {
        return true;
      }
      // If it contains dialogue indicators (particles, punctuation, Japanese sentence length), keep it!
      return false;
    }
    return false;
  }

  function stripSfxTokens(text) {
    return String(text || "")
      .replace(SFX_INLINE_RE, "")
      .replace(MUSIC_SYM_RE, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Decoded loader text → cleaned text; spans are half-open UTF-16 offsets. */
  function normalizeTextWithMapping(text) {
    const raw = String(text || "");
    const removed = new Uint8Array(raw.length);
    for (const re of [SFX_INLINE_RE, MUSIC_SYM_RE]) {
      for (const match of raw.matchAll(re)) {
        removed.fill(1, match.index, match.index + match[0].length);
      }
    }
    const spans = [];
    let clean = "";
    let offset = 0;
    for (const char of raw) {
      const rawStart = offset;
      offset += char.length;
      if (removed[rawStart]) continue;
      const space = /\s/u.test(char);
      if (space && (!clean || clean.endsWith(" "))) {
        const last = spans[spans.length - 1];
        // A deleted label is not part of the whitespace's source span.
        if (last && last.rawEnd === rawStart) last.rawEnd = offset;
        continue;
      }
      const value = space ? " " : char;
      spans.push({ charStart: clean.length, charEnd: clean.length + value.length, rawStart, rawEnd: offset });
      clean += value;
    }
    if (clean.endsWith(" ")) {
      clean = clean.slice(0, -1);
      spans.pop();
    }
    return { text: clean, offsetUnit: "utf16", sourceDomain: "loader-text", spans };
  }

  /**
   * Drop pure SFX cues; strip SFX tokens from mixed cues (drop if empty).
   * Keeps each cue's YouTube start/end unchanged.
   * Input/output: { start, end, text }[]
   */
  function dropAndStripSfx(cues, opts = {}) {
    const out = [];
    let trackIndex = -1;
    for (const c of cues || []) {
      trackIndex++;
      const raw = String(c.text || "").trim();
      if (!raw) continue;
      if (isSfxLabelOnly(raw)) continue;
      const cleaned = stripSfxTokens(raw);
      if (!cleaned || isSfxLabelOnly(cleaned)) continue;
      const normalized = {
        start: Number(c.start) || 0,
        end: Number(c.end) || 0,
        text: cleaned,
      };
      if (opts.includeSource) {
        const rawText = String(c.rawText ?? c.text ?? "");
        normalized.rawSource = {
          text: rawText, start: normalized.start, end: normalized.end,
          sourceDomain: c.rawText != null ? "json3-text" : "loader-text",
          trackIndex,
          segmentAnchors: (c.segmentAnchors || []).map(a => ({ ...a })),
        };
        normalized.normalization = normalizeTextWithMapping(rawText);
        normalized.normalization.sourceDomain = normalized.rawSource.sourceDomain;
      }
      out.push(normalized);
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

  function isBogusInterjectionTranslation(source, text) {
    const s = String(source || "").trim().replace(/[、。・…〜～!?！？\s「」『』"“”'・]/gu, "");
    const t = String(text || "").trim().replace(/^["'“”「」『』\s]+|["'“”「」『』\s.!?…~～]+$/gu, "");
    return /^[ぁ-んー]{1,2}$/.test(s) && /^(?:chim cốc|con cốc|cormorant)$/i.test(t);
  }

  /** Normalize text only; timeline stays YouTube timedtext boundaries. */
  function normalizeCues(cues, opts) {
    return dropAndStripSfx(cues, opts);
  }

  return {
    normalizeCues,
    mergeRollingAsrCues,
    isRollingAsrUpdate,
    isBogusInterjectionTranslation,
    dropAndStripSfx,
    stripSfxTokens,
    normalizeTextWithMapping,
    isSfxLabelOnly,
    isMusicOnly,
    charLen,
  };
});

