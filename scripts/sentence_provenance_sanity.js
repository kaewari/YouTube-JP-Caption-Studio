/** Production projection and cue revision over real isolated bridge responses. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../extension/shared/sentence_groups.js');
let rawInput = '';
if (!process.stdin.isTTY) {
  try {
    rawInput = fs.readFileSync(0, 'utf8').trim();
  } catch (_) {}
}
const fixture = rawInput ? JSON.parse(rawInput) : {
  before: [
    { id: 'source-a', source: 'どこ行くんですか?', start_media_time: 1.234, end_media_time: 4.789, vi: 'Bạn đi đâu?', en: '', mt_locked: true, text_source: 'edit', translation_source: 'user' },
    { id: 'yt-a', source: 'どこ', start_media_time: 6.001, end_media_time: 7.002, vi: '', en: '', text_source: 'yt', mt_locked: false, translation_source: '' },
    { id: 'yt-b', source: '行くんですか?', start_media_time: 7.002, end_media_time: 8.003, vi: '', en: '', text_source: 'yt', mt_locked: false, translation_source: '' },
  ],
  after: [
    { id: 'source-a', source: 'どこ行くんですか?', start_media_time: 1.234, end_media_time: 4.789, vi: 'Bạn đi đâu?', en: '', mt_locked: true, text_source: 'edit', translation_source: 'user' },
    { id: 'yt-a', source: 'どこ', start_media_time: 6.001, end_media_time: 7.002, vi: '', en: '', text_source: 'yt', mt_locked: false, translation_source: '' },
    { id: 'yt-b', source: '行くんですか?', start_media_time: 7.002, end_media_time: 8.003, vi: '', en: '', text_source: 'yt', mt_locked: false, translation_source: '' },
  ],
};
const { before, after } = fixture;
const source = fs.readFileSync(require.resolve('../extension/content/content.js'), 'utf8');
const revision = vm.runInNewContext('(' + source.slice(source.indexOf('  function sentenceCueRevision'),
  source.indexOf('  async function loadSentenceState')) + ')');
assert.equal(after.length, before.length);
assert.deepEqual(after.map(revision), before.map(revision));
const options = { sourceKey: 'youtube:fixture02:ja' };
const initial = engine.buildSentenceGroups(before, options);
const restored = engine.buildSentenceGroups(after, options);
assert.deepEqual(restored, initial);
assert(initial.groups.some(g => !g.protected && g.sourceRefs.length === 2), 'Fixture must exercise merged YouTube cues');
assert(initial.groups.some(g => g.protected), 'Fixture must exercise protected user edits');
const translations = Object.fromEntries(initial.groups.filter(g => !g.protected)
  .map(g => [g.id, { revision: g.revision, vi: 'bản dịch fixture', en: 'fixture translation' }]));
const display = engine.projectDisplayCues(after, restored, translations);
assert.deepEqual(display, engine.projectDisplayCues(before, initial, translations));
assert(display.some(c => c.vi === 'bản dịch fixture'));
assert(display.some(c => c.mt_locked && c.vi === 'Bạn đi đâu?'));
const undoneBefore = engine.buildSentenceGroups(before, { ...options, blockedCueIds: ['yt-a'] });
assert.deepEqual(engine.buildSentenceGroups(after, { ...options, blockedCueIds: ['yt-a'] }), undoneBefore);
assert(undoneBefore.groups.some(g => g.protected && g.sourceRefs.some(r => r.cueId === 'yt-a')));
console.log('PASS: actual bridge response preserves production cue revisions, Enhanced groups/sourceRefs, sidecar translations, locked user targets and Undo projection');
