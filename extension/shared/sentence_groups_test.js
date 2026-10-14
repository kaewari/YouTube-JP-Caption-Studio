const assert = require("node:assert/strict");
const Normalize = require("../content/normalize_cues.js");

// Execute the production normalizer. This is not a source-text inspection.
const raw = "  [笑い]ああ  あ😀\n行く♪  ";
const mapped = Normalize.normalizeTextWithMapping(raw);
assert.equal(mapped.text, Normalize.stripSfxTokens(raw));
assert.equal(mapped.text, "ああ あ😀 行く");
assert.equal(mapped.offsetUnit, "utf16");
assert.deepEqual(mapped.spans.map(s => raw.slice(s.rawStart, s.rawEnd)).join(""),
  "ああ  あ😀\n行く");
assert.equal(mapped.spans.map(s => mapped.text.slice(s.charStart, s.charEnd)).join(""), mapped.text);
const emoji = mapped.spans.find(s => raw.slice(s.rawStart, s.rawEnd) === "😀");
assert.equal(emoji.charEnd - emoji.charStart, 2);
assert.equal(emoji.rawEnd - emoji.rawStart, 2);
for (const s of mapped.spans) {
  const original = raw.slice(s.rawStart, s.rawEnd);
  const clean = mapped.text.slice(s.charStart, s.charEnd);
  assert.equal(clean, /\s/u.test(original) ? " " : original);
}
assert.equal(Normalize.normalizeTextWithMapping("[笑い]♪  ").text, "");
assert.equal(Normalize.normalizeTextWithMapping("（僕は行く）").text, "（僕は行く）");
const input = [{ start: 3.5, end: 9, text: raw, segmentAnchors: [{ charStart: 10, time: 4 }] }];
const before = JSON.stringify(input);
const plain = Normalize.normalizeCues(input);
const withSource = Normalize.normalizeCues(input, { includeSource: true });
assert.deepEqual(plain, [{ start: 3.5, end: 9, text: mapped.text }]);
assert.equal(withSource[0].rawSource.text, raw);
assert.deepEqual(withSource[0].rawSource.segmentAnchors, input[0].segmentAnchors);
assert.deepEqual(withSource[0].normalization, mapped);
assert.equal(JSON.stringify(input), before);
console.log("PASS: normalization mapping preserves UTF-16 spans, repeats, whitespace, emoji, raw timing and input");

for (const rawText of ["自分[音楽]自分", "あ [笑い] あ", "\t　あ😀。\nあ😀?", "♪ [音楽] ♪", "🎵😀🎶"]) {
  const result = Normalize.normalizeTextWithMapping(rawText);
  assert.equal(result.text, Normalize.stripSfxTokens(rawText));
  assert.equal(result.spans.map(s => result.text.slice(s.charStart, s.charEnd)).join(""), result.text);
  for (const s of result.spans) {
    assert.ok(s.rawStart >= 0 && s.rawEnd <= rawText.length && s.rawEnd > s.rawStart);
    assert.ok(!/[\ud800-\udbff]/u.test(rawText[s.rawStart - 1] || "") || !/[\udc00-\udfff]/u.test(rawText[s.rawStart] || ""));
    assert.ok(!/[\ud800-\udbff]/u.test(rawText[s.rawEnd - 1] || "") || !/[\udc00-\udfff]/u.test(rawText[s.rawEnd] || ""));
  }
}
const Parse = require("./timedtext_parse.js");
const event = { tStartMs: 1000, dDurationMs: 5000, segs: [
  { utf8: " 😀\nどこ" }, { utf8: "行くんですか?", tOffsetMs: 1500, isSpeakerChange: true },
] };
const sourceInput = { events: [event] };
const sourceBefore = JSON.stringify(sourceInput);
const legacy = Parse.parseJson3Cues(sourceInput);
assert.deepEqual(legacy, [{ start: 1, end: 6, text: "😀 どこ行くんですか?" }]);
const anchored = Parse.parseJson3Cues(sourceInput, { includeSource: true });
assert.equal(anchored[0].rawText, " 😀\nどこ行くんですか?");
assert.deepEqual(anchored[0].segmentAnchors, [
  { charStart: 0, charEnd: 6, time: 1, speakerChange: false },
  { charStart: 6, charEnd: 13, time: 2.5, speakerChange: true },
]);
const normalizedAnchor = Normalize.normalizeCues(anchored, { includeSource: true })[0];
assert.equal(normalizedAnchor.rawSource.text, anchored[0].rawText);
assert.equal(normalizedAnchor.rawSource.sourceDomain, "json3-text");
assert.equal(JSON.stringify(sourceInput), sourceBefore);
console.log("PASS: optional parser preserves raw JSON3 text/segment timestamps, legacy output and input");

const Groups = require("./sentence_groups.js");
const cue = (id, source, start, end, more = {}) => ({
  id, source, start_media_time: start, end_media_time: end, text_source: "yt", ...more,
});
const fragments = [cue("a", "どこ", 0, 1), cue("b", "行くんですか?", 1, 3)];
const fragmentsBefore = JSON.stringify(fragments);
const joined = Groups.buildSentenceGroups(fragments, { sourceKey: "video/ja" });
const projected = Groups.projectDisplayCues(fragments, joined);
assert.equal(projected.length, 2);
assert.equal(projected[0].source, "どこ行くんですか?");
assert.equal(projected[0].sourceCueId, "a");
assert.equal(projected[1].sourceCueId, "b");
assert.deepEqual(projected[0].sourceRefs.map(r => r.cueId), ["a", "b"]);
assert.equal(projected[0].vi, "");
assert.deepEqual(projected[0].tokens, []);
assert.equal(joined.groups.length, 1);
assert.equal(joined.groups[0].text, "どこ行くんですか?");
assert.deepEqual(joined.groups[0].sourceRefs.map(r => r.cueId), ["a", "b"]);
assert.equal(joined.displayUnits.length, 2, "Original source windows remain display anchors");
assert.equal(JSON.stringify(fragments), fragmentsBefore);
assert.deepEqual(Groups.buildSentenceGroups(fragments, { sourceKey: "video/ja" }), joined);
assert.notEqual(Groups.buildSentenceGroups(fragments, { sourceKey: "other/ja" }).groups[0].id, joined.groups[0].id);

for (const protection of [{ mt_locked: true }, { translation_source: "import" }, { translation_source: "user" }, { text_source: "edit" }, { text_source: "import" }, { text_source: "script" }]) {
  for (const side of [0, 1]) {
    const list = fragments.map((c, i) => ({ ...c, ...(i === side ? protection : {}) }));
    assert.equal(Groups.buildSentenceGroups(list).groups.length, 2, JSON.stringify({ protection, side }));
  }
}
for (const next of [cue("b", "行くんですか?", 5, 6), cue("b", "行くんですか?", 0.5, 3),
  cue("b", "行くんですか?", 1, 3, { speakerId: "other" }), cue("b", "行くんですか?", 1, 3, { sourceKey: "other" })]) {
  assert.equal(Groups.buildSentenceGroups([cue("a", "どこ", 0, 1, { speakerId: "first", sourceKey: "main" }), next]).groups.length, 2);
}
const split = Groups.buildSentenceGroups([cue("c", "今日は晴れ。明日は雨。", 10, 15)]);
assert.equal(split.groups.length, 2);
assert.equal(split.displayUnits.length, 1, "No duplicate overlapping renderer cues without real anchors");
assert.equal(split.displayUnits[0].text, "今日は晴れ。明日は雨。");
assert.equal(split.displayUnits[0].timingQuality, "source-window");
assert.deepEqual(split.groups.map(g => g.text), ["今日は晴れ。", "明日は雨。"]);
const quoted = Groups.buildSentenceGroups([cue("c", "『本当?』あ😀。次!", 0, 3)]);
assert.deepEqual(quoted.groups.map(g => g.text), ["『本当?』", "あ😀。", "次!"]);
assert.equal(quoted.groups.map(g => g.text).join(""), "『本当?』あ😀。次!");
assert.equal(Groups.buildSentenceGroups([cue("c", "Version 1.5は同じです。", 0, 3)]).groups.length, 1);
assert.equal(Groups.buildSentenceGroups([cue("a", "ない", 0, 1), cue("b", "ないです", 1, 3)]).groups.length, 2, "Unknown rolling/repeated content is preserved");
const invalid = Groups.buildSentenceGroups([cue("a", "どこ", NaN, 1), fragments[1]]);
assert.equal(invalid.groups.length, 2);
assert.ok(invalid.diagnostics.some(d => d.reason === "invalid-timing"));
const removedBoundary = Groups.buildSentenceGroups(fragments, { blockedCueIds: ["a"] });
assert.equal(removedBoundary.groups.length, 2, "Undo blocks automatic grouping on either source cue");
for (const group of quoted.groups) {
  for (const ref of group.sourceRefs) {
    const original = "『本当?』あ😀。次!";
    assert.equal(original.slice(ref.charStart, ref.charEnd), group.text);
  }
}
console.log("PASS: sentence groups preserve source coverage, IDs, owned/lock/speaker/silence boundaries and source-window display");

function mappedCue(id, text, start, end, segmentAnchors) {
  const normalized = Normalize.normalizeCues([{ text, start, end, segmentAnchors }], { includeSource: true })[0];
  return cue(id, normalized.text, start, end, { rawSource: normalized.rawSource, normalization: normalized.normalization });
}
assert.equal(Groups.buildSentenceGroups([mappedCue("a", "どこ", 0, 1, [{charStart:0,charEnd:2,time:0}]), fragments[1]]).groups.length, 1,
  "Segment START timestamp is not speech END; contiguous source windows still join");
for (const prefix of [" ", "[笑い] "]) {
  const right = mappedCue("b", prefix + "行くんですか?", 1, 3, [{charStart:0,charEnd:(prefix+"行くんですか?").length,time:1,speakerChange:true}]);
  assert.equal(Groups.buildSentenceGroups([fragments[0], right]).groups.length, 2,
    "Speaker boundary survives removal of prefix whitespace/noise");
}
assert.equal(Groups.buildSentenceGroups([cue("a", "今日は晴れだね", 0, 1), cue("b", "明日は雨だよ", 1, 3)]).groups.length, 2,
  "No cross-cue merge without dangling grammar evidence");
const timeChanged = fragments.map(c => ({ ...c, start_media_time: c.start_media_time + 5, end_media_time: c.end_media_time + 5 }));
assert.notEqual(Groups.buildSentenceGroups(timeChanged, { sourceKey: "video/ja" }).groups[0].revision, joined.groups[0].revision);
console.log("PASS: independent-audit regressions for segment starts, stripped speaker prefixes, complete clauses and timing revisions");

const noiseTrack = Normalize.normalizeCues([
  { text: "どこ", start: 0, end: 1 }, { text: "[音楽]", start: 1, end: 1.1 }, { text: "行くんですか?", start: 1.1, end: 3 },
], { includeSource: true }).map((n, i) => cue(String(i), n.text, n.start, n.end, { rawSource: n.rawSource, normalization: n.normalization }));
assert.equal(Groups.buildSentenceGroups(noiseTrack).groups.length, 2, "Dropped noise/source row remains a grouping boundary");
assert.throws(() => Groups.buildSentenceGroups([fragments[0], { ...fragments[1], id: "a" }]), /unique cue IDs/);
assert.throws(() => Groups.buildSentenceGroups([{ ...fragments[0], id: "" }]), /unique cue IDs/);
const rawChanged = mappedCue("a", "[笑い]どこ", 0, 1, []);
assert.notEqual(Groups.buildSentenceGroups([rawChanged, fragments[1]]).groups[0].revision,
  Groups.buildSentenceGroups(fragments).groups[0].revision, "Same clean text with changed raw provenance invalidates revision");
console.log("PASS: dropped-row boundaries, duplicate-ID rejection and raw-source revision invalidation");

const speakerText = "どこ [笑い] 行くんですか?";
const internalSpeaker = mappedCue("a", speakerText, 0, 3, [
  {charStart:0,charEnd:3,time:0}, {charStart:3,charEnd:speakerText.length,time:1,speakerChange:true},
]);
const speakerProjection = Groups.buildSentenceGroups([internalSpeaker]);
assert.equal(speakerProjection.groups.length, 2, "Internal speaker segment survives removed noise prefix");
assert.equal(speakerProjection.groups.map(g => g.text).join(""), internalSpeaker.source);
assert.equal(speakerProjection.displayUnits.length, 1, "No invented text-onset timestamp after removed prefix");
assert.equal(speakerProjection.displayUnits[0].timingQuality, "source-window");
console.log("PASS: internal stripped speaker boundary retains logical groups without fabricated display timing");
const protectedInput = [cue('locked', 'こんにちは。', 0, 2, { mt_locked: true, translation_source: 'user', en: 'User English', vi: '' })];
const protectedProjection = Groups.buildSentenceGroups(protectedInput);
const protectedGroup = protectedProjection.groups[0];
const protectedDisplay = Groups.projectDisplayCues(protectedInput, protectedProjection, {
  [protectedGroup.id]: { revision: protectedGroup.revision, vi: 'AUTO Vietnamese', en: 'AUTO English' },
});
assert.equal(protectedDisplay[0].vi, '');
assert.equal(protectedDisplay[0].en, 'User English');
console.log('PASS: locked blank target remains blank despite matching automatic cache');
const contextInput=[cue('p','晴れ。',0,1),cue('t','どこ?',1,2),cue('n','川。',2,3)];
const contextProjection=Groups.buildSentenceGroups(contextInput);
const changedContext=Groups.buildSentenceGroups(contextInput.map((c,i)=>i===0?{...c,source:'雨。'}:c));
assert.notEqual(changedContext.groups[1].revision,contextProjection.groups[1].revision,'Neighbor context must invalidate translation revision');
const automaticStatus=Groups.buildSentenceGroups(contextInput.map(c=>({...c,translation_source:'gemini'})));
assert.equal(automaticStatus.groups[1].revision,contextProjection.groups[1].revision,'Automatic result metadata must not invalidate source identity');
console.log('PASS: neighboring context invalidates translation revision; automatic MT metadata keeps source identity');
const failedDisplay=Groups.projectDisplayCues(contextInput,contextProjection,{
  [contextProjection.groups[1].id]:{revision:contextProjection.groups[1].revision,vi:'Hỏi đường',states:{vi:'ready',en:'error'}},
});
assert.equal(failedDisplay[1].translationStates.vi,'ready');
assert.equal(failedDisplay[1].translationStates.en,'error');
assert.equal(failedDisplay[1].translationStatus,'error');
console.log('PASS: per-language translation failures stay visible beside a valid other language');
for (const invalidTokens of [
  [{surface:'どこ',start:0,end:2},{surface:'どこ',start:0,end:2},{surface:'?',start:2,end:3}],
  [{surface:'?',start:2,end:3},{surface:'どこ',start:0,end:2}],
  [{surface:'?',start:2,end:3}],
]) assert.throws(()=>Groups.tokensFromCodePoints('どこ?','どこ?',invalidTokens),/span|coverage/);
const spacedTokens=Groups.tokensFromCodePoints(' 晴れ。 ','晴れ。',[{surface:'晴れ',start:0,end:2},{surface:'。',start:2,end:3}]);
assert.equal(spacedTokens.map(t=>t.surface).join(''),' 晴れ。 ');
assert.equal(spacedTokens[0].jlpt,null);assert.equal(spacedTokens.at(-1).jlpt,null);
console.log('PASS: token spans reject overlap/order/missing content; source whitespace remains neutral and exact');
assert.equal(Groups.validGroupTokens(' 晴れ。 ',spacedTokens),true);
assert.equal(Groups.validGroupTokens('どこ?',[{surface:'other source',start:0,end:3,offsetUnit:'utf16'}]),false);
assert.equal(Groups.validGroupTokens('😀',[{surface:'😀',start:0,end:1,offsetUnit:'utf16'}]),false);
console.log('PASS: restored UTF16 token cache requires exact ordered source coverage, including emoji');

// Original JSON3 events; creator evidence certifies lexical 第一弾, not ASR names/audio timing.
const ordinalFixture = require('../../testdata/sentence-mvp/parako-ordinal-fragment-source.json3.json');
const ordinalBefore = JSON.stringify(ordinalFixture);
const ordinalParsed = Normalize.normalizeCues(Parse.parseJson3Cues(ordinalFixture, { includeSource: true }), { includeSource: true });
const ordinalCues = ordinalParsed.map((n, i) => cue('ordinal-' + i, n.text, n.start, n.end,
  { rawSource: n.rawSource, normalization: n.normalization }));
const ordinalProjection = Groups.buildSentenceGroups(ordinalCues);
assert.equal(ordinalProjection.groups[0].text, ordinalCues[0].source + ordinalCues[1].source.slice(0, 35));
assert.deepEqual(ordinalProjection.groups[0].sourceRefs.map(({ cueId, charStart, charEnd }) => ({ cueId, charStart, charEnd })), [
  { cueId: 'ordinal-0', charStart: 0, charEnd: 2 }, { cueId: 'ordinal-1', charStart: 0, charEnd: 35 },
]);
assert.equal(ordinalProjection.groups.map(g => g.text).join(''), ordinalCues.map(c => c.source).join(''));
assert.equal(JSON.stringify(ordinalFixture), ordinalBefore);
assert.deepEqual(ordinalProjection.displayUnits.map(d => [d.start_media_time, d.end_media_time]),
  ordinalCues.map(c => [c.start_media_time, c.end_media_time]));
for (const [prefix, continuation] of [['第2', '話です。'], ['第三', '回です。'], ['第１２', '巻です。'], ['第百二十', '章です。']]) {
  assert.equal(Groups.buildSentenceGroups([cue('a', prefix, 0, 1), cue('b', continuation, 1, 2)]).groups[0].text,
    prefix + continuation);
}
for (const [prefix, next] of [['1', '弾です。'], ['第1', 'です。'], ['第1', '弾丸が飛ぶ。'],
  ['第1', '話題は別。'], ['第1', '回転する。'], ['第一。', '弾です。'], ['第2', '部長です。'],
  ['第1', '話すのをやめた。'], ['第2', '回るのはやめよう。'], ['第3', '巻き戻してください。'], ['第4', '弾むボール。']]) {
  assert.equal(Groups.buildSentenceGroups([cue('a', prefix, 0, 1), cue('b', next, 1, 2)]).groups.length, 2);
}
for (const next of [cue('b', '弾です。', 3, 4), cue('b', '弾です。', .5, 2),
  cue('b', '弾です。', 1, 2, { mt_locked: true }), cue('b', '弾です。', 1, 2, { speakerId: 'other' }),
  cue('b', '弾です。', 1, 2, { sourceKey: 'other' })]) {
  assert.equal(Groups.buildSentenceGroups([cue('a', '第1', 0, 1), next]).groups.length, 2);
}
const ordinalSpeaker = mappedCue('b', '弾です。', 1, 2, [{ charStart: 0, charEnd: 4, time: 1, speakerChange: true }]);
assert.equal(Groups.buildSentenceGroups([cue('a', '第1', 0, 1), ordinalSpeaker]).groups.length, 2);
assert.equal(Groups.buildSentenceGroups([cue('a', '第1', 0, 1), cue('b', '弾です。', 1, 2)], { blockedCueIds: ['a'] }).groups.length, 2);
const asrTestCue = { id: 'asr_1', source: '乗せてないんですか？', text: '乗せてないんですか？', start_media_time: 1.0, end_media_time: 3.0, words: [{ word: '乗せて', start: 1.0, end: 1.5 }], tokens: [], text_source: 'asr' };
const asrProj = Groups.buildSentenceGroups([asrTestCue], { sourceKey: 'asr_test', blockedCueIds: [] });
const asrEnhanced = Groups.projectDisplayCues([asrTestCue], asrProj, {}, {});
assert.equal(asrEnhanced[0].words?.length, 1);
assert.equal(asrEnhanced[0].words[0].word, '乗せて');
const singleCue = { id: 's1', source: 'う', text: 'う', vi: 'chim cốc', start_media_time: 1.0, end_media_time: 2.0, tokens: [] };
const singleProj = Groups.buildSentenceGroups([singleCue], { sourceKey: 'single_test' });
const singleEnhancedWithTrans = Groups.projectDisplayCues([singleCue], singleProj, {
  [singleProj.groups[0].id]: { revision: singleProj.groups[0].revision, vi: 'Ư...' }
}, {});
assert.equal(singleEnhancedWithTrans[0].vi, 'Ư...', 'Enhanced mode must prioritize sentence translation over raw original.vi for single-cue groups');

const singleLockedCue = { id: 's2', source: 'う', text: 'う', vi: 'chim cốc', start_media_time: 1.0, end_media_time: 2.0, tokens: [], mt_locked: true };
const singleLockedProj = Groups.buildSentenceGroups([singleLockedCue], { sourceKey: 'single_locked_test' });
const singleLockedEnhanced = Groups.projectDisplayCues([singleLockedCue], singleLockedProj, {
  [singleLockedProj.groups[0].id]: { revision: singleLockedProj.groups[0].revision, vi: 'chim cốc' }
}, {});
assert.equal(singleLockedEnhanced[0].vi, 'chim cốc', 'User locked translation must be preserved even when sentence translation exists');
console.log('PASS: captured ordinal fragment joins with exact source spans/clocks; generalized numeral forms and independent safety boundaries retained');
