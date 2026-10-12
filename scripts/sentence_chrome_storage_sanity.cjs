/** Real MV3 worker and Chrome storage in a fresh profile; no live bridge or provider. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const Groups = require('../extension/shared/sentence_groups.js');

(async () => {
  const root = path.resolve(__dirname, '..');
  const stage = path.resolve(process.argv[2] || '');
  assert(process.argv[2] && stage.startsWith(root + '/.tmp-'), 'Supply a fresh ignored evidence directory');
  await fs.mkdir(stage); // Refuse an existing profile or evidence directory.
  const blocked = [];
  const deny = http.createServer((req, res) => {
    blocked.push({ method: req.method, path: req.url });
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Isolated storage test: bridge unavailable');
  });
  await new Promise(resolve => deny.listen(0, '127.0.0.1', resolve));
  const endpoint = 'http://127.0.0.1:' + deny.address().port;
  let context;
  try {
    const extension = path.join(stage, 'extension');
    await fs.cp(path.join(root, 'extension'), extension, { recursive: true });
    const adapted = [];
    for (const relative of ['background/service_worker.js', 'manifest.json']) {
      const file = path.join(extension, relative);
      const original = await fs.readFile(file, 'utf8');
      const changed = original.replaceAll('http://127.0.0.1:8765', endpoint)
        .replaceAll('http://localhost:8765', endpoint);
      assert.notEqual(original, changed, relative + ' isolated endpoint adapter');
      await fs.writeFile(file, changed);
      adapted.push({ path: relative, originalSha256: crypto.createHash('sha256').update(original).digest('hex') });
    }
    const launch = () => chromium.launchPersistentContext(path.join(stage, 'profile'), {
      channel: 'chromium', headless: true,
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
    });
    const ownPage = async () => {
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
      assert(worker.url().endsWith('/background/service_worker.js'));
      const page = await context.newPage();
      await page.goto(worker.url().replace('background/service_worker.js', 'sidepanel/sidepanel.html'));
      return page;
    };
    context = await launch();
    let page = await ownPage();
    const send = async msg => {
      const result = await page.evaluate(msg => chrome.runtime.sendMessage({ type: 'SAVED_CUES_MUTATE', ...msg }), msg);
      assert.equal(result?.ok, true, JSON.stringify(result));
      return result;
    };
    const videoId = 'isolated-storage-test';
    const sourceKey = 'youtube:' + videoId + ':ja';
    const meta = { owned: true, rev: 8, deviceId: 'isolated-test', tombstones: ['deleted-cue'] };
    const cues = [{ id: 'locked-cue', source: '乗せてないんですか？', vi: '', en: 'Did you not give them a ride?',
      mt_locked: true, text_source: 'edit', translation_source: 'user', start_media_time: 1.234567, end_media_time: 3.456789 },
      { id: 'automatic-cue', source: '今日は晴れです。', text_source: 'yt', start_media_time: 5, end_media_time: 7 }];
    const projection = Groups.buildSentenceGroups(cues, { sourceKey });
    const group = projection.groups.find(g => g.sourceRefs.some(ref => ref.cueId === 'automatic-cue'));
    assert(group);
    const state = { version: 1, sourceKey, sourceCues: cues, offsetUnit: 'utf16', algorithmVersion: Groups.VERSION,
      undoRevisions: { 'locked-cue': 'test-revision' },
      translations: { [group.id]: { revision: group.revision, vi: 'Bản dịch kiểm thử', en: 'Test translation' } },
      tokens: { [group.id]: [{ surface: group.text, start: 0, end: group.text.length }] } };
    await send({ op: 'save_script', videoId, meta, cues });
    const scriptKeys = ['transcript:' + videoId, 'transcriptMeta:' + videoId];
    assert.deepEqual(await page.evaluate(keys => chrome.storage.local.get(keys), scriptKeys),
      { [scriptKeys[0]]: cues, [scriptKeys[1]]: meta });
    await send({ op: 'save_sentence_state', videoId, sourceKey, meta, state });
    const stateKey = 'sentenceState:v1:' + sourceKey;
    assert.deepEqual(await page.evaluate(key => chrome.storage.local.get(key), stateKey), { [stateKey]: state });
    const saved = { id: 'saved-test', videoId, source: cues[0].source };
    const other = { id: 'saved-other', videoId: 'other-video', source: '別の文。' };
    await send({ op: 'toggle', id: other.id, cue: other });
    const patch = { ['transcript:' + videoId]: cues, ['transcriptMeta:' + videoId]: meta,
      ['tokens:' + videoId]: { 'locked-cue': [{ surface: cues[0].source }] },
      ['sentenceState:v1:' + sourceKey]: state,
      ['sentenceRecovery:v1:' + sourceKey]: { format: 'caption-studio-sentence-backup', version: 1, cues } };
    await send({ op: 'restore_video', videoId, sourceKey, entries: [saved], patch });
    const keys = [...Object.keys(patch), 'savedCues'];
    const before = await page.evaluate(keys => chrome.storage.local.get(keys), keys);
    for (const [key, value] of Object.entries(patch)) {
      if (key.startsWith('sentenceRecovery:')) assert.deepEqual(before[key], { ...value, savedSentences: [] });
      else assert.deepEqual(before[key], value);
    }
    assert.deepEqual(before.savedCues, { [other.id]: other, [saved.id]: saved });
    await context.close();
    context = await launch();
    page = await ownPage();
    const after = await page.evaluate(keys => chrome.storage.local.get(keys), keys);
    assert.deepEqual(after, before, 'Whole browser restart must retain the nonempty worker-owned storage payload');
    const stale = await send({ op: 'save_script', videoId, meta: { ...meta, rev: 7 }, cues: [] });
    assert.equal(stale.skipped, 'stale_revision');
    const staleState = await send({ op: 'save_sentence_state', videoId, sourceKey,
      meta: { ...meta, rev: 7 }, state: { ...state, translations: {}, undoRevisions: {} } });
    assert.equal(staleState.skipped, 'stale_revision');
    assert.deepEqual(await page.evaluate(keys => chrome.storage.local.get(keys), keys), before);
    const report = { browser: context.browser().version(), adapter: 'Only bridge URLs changed in copied worker/manifest',
      adapted, blocked, before, after, stale, staleState,
      scope: 'Actual MV3 messages/chrome.storage/browser restart; synthetic data. No content restore UI, projection validation, bridge/disk, Drive, Gemini or gold/KPI proof.' };
    await fs.writeFile(path.join(stage, 'result.json'), JSON.stringify(report, null, 2));
    console.log('PASS: actual MV3 save/sidecar/restore worker, locked blank target, owned/deleted metadata, nonempty Undo/translations/tokens and saved-other preservation');
    console.log('PASS: whole Chromium close/relaunch preserves exact payload; stale rev7 cannot replace rev8');
    console.log(JSON.stringify({ browser: report.browser, blockedBridgeRequests: blocked.length, result: path.join(stage, 'result.json'), scope: report.scope }));
  } finally {
    if (context) await context.close();
    await new Promise(resolve => deny.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
