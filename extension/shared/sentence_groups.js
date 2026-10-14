/** Immutable sentence projection over effective cues AFTER owned/deleted reconciliation. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HardsubSentenceGroups = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VERSION = 2;
  const SENTENCE_END = /[。！？!?]+[」』”"'）)\]】]*\s*/gu;
  const COMPLETE = /[。！？!?][」』”"'）)\]】]*\s*$/u;
  const QUESTION_LEMMAS = new Set(["どこ", "どちら", "どれ", "誰", "だれ", "いつ", "何", "なに", "なぜ", "どう"]);

  function hasContinuation(part, next) {
    const tokens = part.cue.tokens || [];
    const last = tokens[tokens.length - 1];
    const pos = Array.isArray(last?.pos) ? last.pos.join(",") : String(last?.pos || "");
    const lemma = String(last?.lemma || last?.surface || part.text.trim());
    if (QUESTION_LEMMAS.has(lemma)) return true;
    if (pos.startsWith("助詞") && !pos.includes("終助詞")) return true;
    // ponytail: bounded ordinal suffix grammar; widen with verified POS/gold data.
    if (/^第[0-9０-９〇零一二三四五六七八九十百千万億兆]+$/u.test(part.text.trim()) &&
        /^(?:弾|回|話|章|巻|期|部|位|番|条|項|号|次)(?:[はがをにとのでだ\p{Punctuation}\s]|$)/u.test(next.text)) return true;
    // ponytail: conservative lexical grammar without NLP may miss valid joins;
    // widen using verified POS/de-inflection, never merge every unpunctuated cue.
    return /(?:て|で|を|に|が|は|と|も|ので|のに|けど|けれど|から|なら|たり|ながら|なく)\s*$/u.test(part.text);
  }

  function isProtected(cue) {
    return !!cue.mt_locked || ["user", "import"].includes(cue.translation_source) ||
      ["edit", "import", "manual", "script"].includes(cue.text_source);
  }

  function validTimes(cue) {
    return Number.isFinite(cue.start_media_time) && Number.isFinite(cue.end_media_time) &&
      cue.start_media_time >= 0 && cue.end_media_time > cue.start_media_time;
  }

  function anchorsFor(cue) {
    if (cue.normalization?.text !== cue.source || !validTimes(cue)) return [];
    const spans = cue.normalization.spans || [];
    const anchors = [];
    for (const a of cue.rawSource?.segmentAnchors || []) {
      const span = spans.find(s => s.rawStart === a.charStart);
      if (!span || !Number.isFinite(a.time) || a.time < cue.start_media_time || a.time > cue.end_media_time) continue;
      const last = anchors[anchors.length - 1];
      if (last && (span.charStart <= last.charStart || a.time < last.time)) return [];
      anchors.push({ charStart: span.charStart, time: a.time, speakerChange: !!a.speakerChange });
    }
    return anchors;
  }

  function partsFor(cue, blocked) {
    const source = String(cue.source || "");
    const anchors = anchorsFor(cue);
    const speakerOffsets = new Set();
    if (cue.normalization?.text === source) {
      const rawAnchors = cue.rawSource?.segmentAnchors || [];
      for (const [i, a] of rawAnchors.entries()) {
        if (!a.speakerChange) continue;
        const end = a.charEnd ?? rawAnchors[i + 1]?.charStart ?? cue.rawSource.text.length;
        const first = (cue.normalization.spans || []).find(s => s.rawStart >= a.charStart && s.rawStart < end);
        // Preserve logical speaker boundary within this segment only. A removed
        // prefix does not give an exact timestamp for the first visible word.
        if (first) speakerOffsets.add(first.charStart);
      }
    }
    const boundaries = new Set([source.length]);
    if (!blocked && !isProtected(cue)) {
      for (const m of source.matchAll(SENTENCE_END)) boundaries.add(m.index + m[0].length);
      for (const a of anchors) if (a.speakerChange && a.charStart > 0) boundaries.add(a.charStart);
      for (const offset of speakerOffsets) if (offset > 0) boundaries.add(offset);
    }
    const parts = [];
    let start = 0;
    for (const end of [...boundaries].sort((a, b) => a - b)) {
      if (end <= start) continue;
      parts.push({ cue, charStart: start, charEnd: end, text: source.slice(start, end), anchors, blocked, speakerChange: speakerOffsets.has(start) });
      start = end;
    }
    return parts;
  }

  function boundaryReason(left, right, group, opts) {
    const a = left.cue, b = right.cue;
    if (left.blocked || right.blocked) return "undo";
    if (isProtected(a) || isProtected(b)) return "protected";
    if (!validTimes(a) || !validTimes(b)) return "invalid-timing";
    if (COMPLETE.test(left.text)) return "sentence-end";
    if ((a.sourceKey || "") !== (b.sourceKey || "")) return "source-change";
    if (a !== b && Number.isInteger(a.rawSource?.trackIndex) && Number.isInteger(b.rawSource?.trackIndex) &&
      b.rawSource.trackIndex !== a.rawSource.trackIndex + 1) return "removed-source-boundary";
    if ((a.speakerId || "") !== (b.speakerId || "")) return "speaker-change";
    if (right.speakerChange) return "speaker-change";
    if (!/[\u3040-\u30ff\u4e00-\u9fff]/u.test(left.text + right.text)) return "non-ja";
    if (a !== b && (right.text.startsWith(left.text) || left.text === right.text)) return "rolling-unknown";
    if (group.text.length + right.text.length > opts.maxChars || b.end_media_time - group.start > opts.maxDuration) return "size-limit";
    if (a === b) return "logical-boundary";
    if (!hasContinuation(left, right)) return "continuation-unknown";
    const gap = b.start_media_time - a.end_media_time;
    if (gap < 0) {
      // JSON3 display windows overlap. A close final segment START can support
      // a dangling continuation, but is not a speech-end/silence measurement.
      const lastAnchor = left.anchors[left.anchors.length - 1];
      const anchorGap = lastAnchor ? b.start_media_time - lastAnchor.time : NaN;
      if (!Number.isFinite(anchorGap) || anchorGap < 0 || anchorGap > opts.maxGap) return "overlap-unknown";
    }
    if (gap > opts.maxGap) return "silence";
    return "";
  }

  function sourceRef(part) {
    const ref = { cueId: String(part.cue.id), charStart: part.charStart, charEnd: part.charEnd, offsetUnit: "utf16" };
    if (part.cue.normalization?.text === part.cue.source && part.cue.rawSource) {
      ref.sourceDomain = part.cue.rawSource.sourceDomain;
      ref.rawSpans = (part.cue.normalization.spans || []).filter(s => s.charStart < part.charEnd && s.charEnd > part.charStart)
        .map(s => ({ charStart: s.rawStart, charEnd: s.rawEnd }));
    } else {
      ref.sourceDomain = "effective-cue";
    }
    return ref;
  }

  function buildSentenceGroups(cues, options = {}) {
    const opts = { maxGap: 0.8, maxChars: 120, maxDuration: 12, sourceKey: "", ...options };
    const blocked = new Set(options.blockedCueIds || []);
    const ids = new Set();
    const groups = [], partsByCue = [], diagnostics = [];
    let previous = null;
    for (const cue of cues || []) {
      if (!cue || !String(cue.source || "")) continue;
      if (typeof cue.id !== "string" || !cue.id || ids.has(cue.id)) throw new TypeError("Sentence projection requires unique cue IDs");
      ids.add(cue.id);
      const parts = partsFor(cue, blocked.has(cue.id));
      partsByCue.push(parts);
      if (!validTimes(cue)) diagnostics.push({ cueId: cue.id, reason: "invalid-timing" });
      for (const part of parts) {
        let group = groups[groups.length - 1];
        const reason = previous ? boundaryReason(previous, part, group, opts) : "first";
        if (reason) {
          group = { text: "", sourceRefs: [], sourceIdentity: [], start: cue.start_media_time, end: cue.end_media_time, protected: isProtected(cue) || part.blocked };
          groups.push(group);
          if (!["first", "sentence-end", "logical-boundary"].includes(reason)) diagnostics.push({ cueId: cue.id, reason });
        }
        group.text += part.text;
        if (!reason && previous.cue !== cue && cue.start_media_time < previous.cue.end_media_time) {
          diagnostics.push({ cueId: cue.id, reason: "overlap-anchor-continuation" });
        }
        group.sourceRefs.push(sourceRef(part));
        group.sourceIdentity.push([cue.id, cue.start_media_time, cue.end_media_time,
          cue.rawSource?.text ?? cue.source, cue.rawSource?.segmentAnchors || [], cue.text_source || "", !!cue.mt_locked,
          ["user", "import"].includes(cue.translation_source) ? cue.translation_source : "", cue.sourceKey || "", cue.speakerId || ""]);
        group.end = Math.max(group.end, cue.end_media_time);
        part.group = group;
        previous = part;
      }
    }
    for (const [i, group] of groups.entries()) {
      // Exact identity avoids hash collisions. Bounded group text keeps IDs finite.
      group.id = "sg:" + JSON.stringify([VERSION, opts.sourceKey, opts.sourceRevision || "", group.sourceIdentity,
        group.sourceRefs.map(r => [r.cueId, r.charStart, r.charEnd]), group.text]);
      delete group.sourceIdentity;
      group.context = [groups[i - 1], groups[i + 1]].map(g => g && !g.protected ? g.text.slice(0, 120) : "").join("\n");
      group.revision = JSON.stringify([group.id, group.context]);
      group.action = group.sourceRefs.length > 1 ? "merge" : "keep";
    }
    const displayUnits = [];
    for (const parts of partsByCue) {
      const cue = parts[0].cue;
      const anchors = parts[0].anchors;
      // Logical split needs an exact timestamp at EVERY internal boundary.
      const canTimeSplit = parts.length > 1 && parts.slice(1).every(p => anchors.some(a => a.charStart === p.charStart));
      const windows = canTimeSplit ? parts.map((p, i) => ({
        parts: [p], start: i === 0 ? cue.start_media_time : anchors.find(a => a.charStart === p.charStart).time,
        end: i === parts.length - 1 ? cue.end_media_time : anchors.find(a => a.charStart === parts[i + 1].charStart).time,
      })) : [{ parts, start: cue.start_media_time, end: cue.end_media_time }];
      // Duplicate/zero child anchors fall back to the whole source window.
      const usable = windows.every(w => Number.isFinite(w.start) && w.end > w.start) ? windows :
        [{ parts, start: cue.start_media_time, end: cue.end_media_time }];
      for (const [i, window] of usable.entries()) {
        const displayed = [...new Set(window.parts.map(p => p.group))];
        displayUnits.push({
          id: "du:" + JSON.stringify([cue.id, i]), sourceCueId: String(cue.id),
          groupIds: displayed.map(g => g.id), text: displayed.map(g => g.text).join(""),
          start_media_time: window.start, end_media_time: window.end,
          timingQuality: usable.length > 1 ? "segment-anchor" : "source-window",
        });
      }
    }
    return { version: VERSION, offsetUnit: "utf16", sourceKey: opts.sourceKey, groups, displayUnits, diagnostics };
  }

  /** One display projection for overlay and panel; legacy cues remain authoritative. */
  function tokensFromCodePoints(text, responseSource, tokens) {
    if (responseSource !== text.trim() || !Array.isArray(tokens)) throw new TypeError("Token source mismatch");
    const offsets = [text.indexOf(responseSource)];
    for (const char of responseSource) offsets.push(offsets[offsets.length - 1] + char.length);
    const converted = [];
    let previousEnd = 0;
    function preserveWhitespace(end) {
      if (end === previousEnd) return;
      const gap = text.slice(previousEnd, end);
      if (!/^\s+$/u.test(gap)) throw new TypeError("Token coverage mismatch");
      converted.push({ surface: gap, reading: "", lemma: "", pos: "補助記号", jlpt: null,
        freq_rank: null, start: previousEnd, end, offsetUnit: "utf16" });
    }
    for (const token of tokens) {
      if (!Number.isInteger(token.start) || !Number.isInteger(token.end) || token.start < 0 ||
          token.end <= token.start || token.end >= offsets.length ||
          offsets[token.start] < previousEnd ||
          text.slice(offsets[token.start], offsets[token.end]) !== token.surface) throw new TypeError("Token span mismatch");
      preserveWhitespace(offsets[token.start]);
      converted.push({ ...token, start: offsets[token.start], end: offsets[token.end], offsetUnit: "utf16" });
      previousEnd = offsets[token.end];
    }
    preserveWhitespace(text.length);
    return converted;
  }

  function validGroupTokens(text, tokens) {
    if (!Array.isArray(tokens) || !tokens.length) return false;
    let end = 0;
    for (const token of tokens) {
      if (!token || token.offsetUnit !== "utf16" || !Number.isInteger(token.start) || !Number.isInteger(token.end) ||
          token.start !== end || token.end <= end || token.end > text.length ||
          text.slice(token.start, token.end) !== token.surface) return false;
      end = token.end;
    }
    return end === text.length;
  }

  function projectDisplayCues(cues, projection, translations = {}, groupTokens = {}) {
    const originals = new Map(cues.map(c => [c.id, c]));
    const groups = new Map(projection.groups.map(g => [g.id, g]));
    return projection.displayUnits.map(unit => {
      const original = originals.get(unit.sourceCueId);
      const selected = unit.groupIds.map(id => groups.get(id));
      const sourceRefs = selected.flatMap(g => g.sourceRefs);
      const unchanged = selected.length === 1 && sourceRefs.length === 1 &&
        sourceRefs[0].cueId === original.id && sourceRefs[0].charStart === 0 &&
        sourceRefs[0].charEnd === original.source.length && unit.text === original.source;
      const translated = selected.map(g => translations[g.id]?.revision === g.revision ? translations[g.id] : null);
      const languageText = lang => (unchanged && isProtected(original)) ? original[lang] || "" :
        translated.every(t => String(t?.[lang] || "").trim()) ? translated.map(t => t[lang].trim()).join(" ") :
        unchanged && String(original[lang] || "").trim() ? original[lang] : "";
      let tokenOffset = 0;
      const tokens = selected.every(g => validGroupTokens(g.text, groupTokens[g.id])) ? selected.flatMap(g => {
          const result = groupTokens[g.id].map(t => {
            let sourceOffset = 0;
            const refs = g.sourceRefs.flatMap(ref => {
              const start = Math.max(t.start, sourceOffset), length = ref.charEnd - ref.charStart;
              const end = Math.min(t.end, sourceOffset + length);
              const result = end > start ? [sourceRef({ cue: originals.get(ref.cueId),
                charStart: ref.charStart + start - sourceOffset, charEnd: ref.charStart + end - sourceOffset })] : [];
              sourceOffset += length;
              return result;
            });
            return { ...t, start: t.start + tokenOffset, end: t.end + tokenOffset, sourceRefs: refs };
          });
          tokenOffset += g.text.length;
          return result;
        }) : unchanged ? original.tokens || [] : [];
      const vi = languageText("vi"), en = languageText("en");
      const translationStates = Object.fromEntries(["vi", "en"].map(lang => [lang,
        languageText(lang) ? "ready" : isProtected(original) ? "protected" :
        translated.some(t => t?.states?.[lang] === "error") ? "error" : "pending"]));
      const words = (unit.words && unit.words.length ? unit.words : (original?.words || []));
      return { ...unit, words, savedCueId: "ss:" + JSON.stringify(unit.groupIds), source: unit.text, vi, en, tokens, sourceRefs, enhanced: true,
        mt_locked: isProtected(original), translated: !!(vi || en),
        translationStates, translationStatus: Object.values(translationStates).includes("error") ? "error" : vi || en ? "ready" : "pending",
        provenance: { version: VERSION, sourceKey: projection.sourceKey, groupIds: unit.groupIds, sourceRefs,
          timingQuality: unit.timingQuality },
      };
    });
  }

  return { VERSION, buildSentenceGroups, projectDisplayCues, tokensFromCodePoints, validGroupTokens, isProtected };
});
