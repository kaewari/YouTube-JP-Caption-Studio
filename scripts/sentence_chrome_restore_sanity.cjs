/** Actual content/sidepanel restore UI; real isolated script API/disk, synthetic caption data. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const Groups = require('../extension/shared/sentence_groups.js');

(async () => {
  const root = path.resolve(__dirname, '..');
  const stage = path.resolve(process.argv[2] || '');
  assert(process.argv[2] && stage.startsWith(root + '/.tmp-'), 'Supply a fresh ignored evidence directory');
  await fs.mkdir(stage);
  const server = spawn(path.join(root, 'local-bridge/.venv/bin/python3'),
    [path.join(root, 'scripts/sentence_script_store_sanity.py'), '--serve', stage], { stdio: ['ignore', 'pipe', 'pipe'] });
  const serverExit = new Promise(resolve => server.once('exit', resolve));
  let serverOutput = '', context;
  server.stderr.on('data', bytes => { serverOutput += bytes; });
  try {
    const address = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Isolated bridge address timeout')), 10000);
      server.stdout.once('data', bytes => { clearTimeout(timeout); resolve(String(bytes).trim()); });
      server.once('exit', code => { clearTimeout(timeout); reject(Error('Isolated bridge exited ' + code)); });
    });
    assert.match(address, /^http:\/\/127\.0\.0\.1:\d+$/);
    const extension = path.join(stage, 'extension');
    await fs.cp(path.join(root, 'extension'), extension, { recursive: true });
    for (const relative of ['background/service_worker.js', 'manifest.json']) {
      const file = path.join(extension, relative);
      const source = await fs.readFile(file, 'utf8');
      await fs.writeFile(file, source.replaceAll('http://127.0.0.1:8765', address).replaceAll('http://localhost:8765', address));
    }
    context = await chromium.launchPersistentContext(path.join(stage, 'profile'), { channel: 'chromium',
      headless: true, acceptDownloads: true, viewport: { width: 1280, height: 900 },
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension] });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    const panel = await context.newPage();
    await panel.goto(worker.url().replace('background/service_worker.js', 'sidepanel/sidepanel.html'));
    await panel.evaluate(() => chrome.runtime.onMessage.addListener(msg => {
      if (msg?.type === 'SP_STATE' && Array.isArray(msg.payload?.cues)) window.restoreTestLatestState = msg.payload;
    }));
    const videoId = 'ylnxFdPhLCo', sourceKey = 'youtube:' + videoId + ':ja';
    const baseline = [{ id: 'baseline', source: '試験前の文。', text_source: 'edit', vi: 'Trước khôi phục',
      mt_locked: true, translation_source: 'user', start_media_time: 60, end_media_time: 63 }];
    const meta = { owned: true, rev: 8, tombstones: ['deleted-test'], deviceId: 'isolated-ui-test' };
    await panel.evaluate(async ({ videoId, meta, baseline }) => {
      const result = await chrome.runtime.sendMessage({ type: 'SAVED_CUES_MUTATE', op: 'save_script', videoId, meta, cues: baseline });
      if (!result?.ok) throw Error(JSON.stringify(result));
    }, { videoId, meta, baseline });
    const video = await context.newPage();
    const response = await video.goto('https://www.youtube.com/watch?v=' + videoId, { waitUntil: 'domcontentloaded', timeout: 45000 });
    assert.equal(response.status(), 200, 'Actual YouTube page response');
    await video.locator('video').waitFor({ timeout: 30000 });
    await video.locator('video').evaluate(el => el.pause());
    const tabId = await panel.evaluate(async videoId => (await chrome.tabs.query({})).find(t => t.url?.includes('watch?v=' + videoId))?.id, videoId);
    assert(Number.isInteger(tabId));
    const activate = () => panel.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    await activate();
    await panel.waitForFunction(async id => {
      try { return (await chrome.tabs.sendMessage(id, { type: 'SP_CMD', cmd: 'get_state' }))?.ok; }
      catch { return false; }
    }, tabId, { timeout: 20000 });
    await panel.locator('#sp-list .sp-ja-view').filter({ hasText: baseline[0].source }).waitFor({ timeout: 15000 });
    const rows = () => panel.locator('#sp-list .sp-sentence');
    const rects = () => rows().evaluateAll(nodes => nodes.map(node => {
      const { width, height, top, left } = node.getBoundingClientRect();
      return { id: node.dataset.id, text: node.querySelector('.sp-ja-view')?.textContent, width, height, top, left };
    }));
    const before = await rects();
    assert.equal(before.length, 1);
    const cues = [
      { id: 'a', source: '乗せて', vi: '', en: '', translation_source: '', text_source: 'yt', start_media_time: 60, end_media_time: 61 },
      { id: 'b', source: 'ないんですか？', vi: '', en: '', translation_source: '', text_source: 'yt', start_media_time: 61, end_media_time: 63 },
      { id: 'locked', source: '手動の文。', text_source: 'edit', mt_locked: true, vi: '', en: 'Manual text.',
        translation_source: 'user', start_media_time: 65.1234567, end_media_time: 67.7654321 },
    ];
    const projection = Groups.buildSentenceGroups(cues, { sourceKey });
    const group = projection.groups.find(g => g.text === '乗せてないんですか？');
    assert(group, 'Production grouping fixture continuity');
    const backup = { format: 'caption-studio-sentence-backup', version: 1, videoId, sourceKey,
      cues, transcriptMeta: meta, savedSentences: [{ id: 'saved-ui-test', videoId, source: '手動の文。' }],
      enhancement: { version: 1, sourceKey, offsetUnit: 'utf16', algorithmVersion: Groups.VERSION,
        rawTrack: null, sourceCues: [], undoRevisions: {},
        translations: { [group.id]: { revision: group.revision, vi: 'Bạn không chở họ sao?', en: 'Did you not give them a ride?' } },
        tokens: { [group.id]: [{ surface: group.text, start: 0, end: group.text.length, offsetUnit: 'utf16' }] } } };
    const backupFile = path.join(stage, 'input-backup.json');
    await fs.writeFile(backupFile, JSON.stringify(backup));
    await panel.locator('#sp-backup-file').setInputFiles(backupFile);
    await panel.locator('#sp-backup-panel').waitFor({ state: 'visible' });
    await activate();
    await panel.locator('#sp-backup-apply').click();
    await panel.locator('#sp-backup-panel').waitFor({ state: 'hidden', timeout: 20000 });
    const restored = await rects();
    assert.equal(restored.length, 3, 'Restore shows Original source rows');
    assert(restored.every(r => r.width > 0 && r.height > 0));
    await activate();
    await panel.locator('#sp-caption-mode').click();
    await panel.waitForFunction(() => {
      const state = window.restoreTestLatestState;
      return state?.captionMode === 'enhanced' &&
        [...document.querySelectorAll('#sp-list .sp-ja-view')].map(el => el.textContent).join('|') ===
        '乗せてないんですか？|乗せてないんですか？|手動の文。';
    });
    const enhanced = await rects();
    assert(enhanced.some(r => r.text === group.text));
    const cachedDisplay = await panel.evaluate(() => window.restoreTestLatestState.enhancedCues);
    assert.equal(cachedDisplay[0].vi, backup.enhancement.translations[group.id].vi);
    assert.equal(cachedDisplay[0].en, backup.enhancement.translations[group.id].en);
    assert.equal(cachedDisplay[0].tokens.map(t => t.surface).join(''), group.text);
    await panel.screenshot({ path: path.join(stage, 'enhanced.png') });
    await activate();
    await panel.locator('.sp-undo-sentence').first().click();
    await panel.waitForFunction(() => [...document.querySelectorAll('#sp-list .sp-ja-view')].map(el => el.textContent).join('|') ===
      '乗せて|ないんですか？|手動の文。');
    const undone = await rects();
    const state = await panel.evaluate(key => chrome.storage.local.get(key), 'sentenceState:v1:' + sourceKey);
    assert.equal(Object.keys(state['sentenceState:v1:' + sourceKey].undoRevisions).length, 2);
    const previousSession = await panel.evaluate(() => window.restoreTestLatestState?._session);
    assert(previousSession);
    await video.reload({ waitUntil: 'domcontentloaded' });
    await activate();
    await panel.waitForFunction(async id => {
      try { return (await chrome.tabs.sendMessage(id, { type: 'SP_CMD', cmd: 'get_state' }))?.ok; }
      catch { return false; }
    }, tabId, { timeout: 20000 });
    await panel.waitForFunction(previous => {
      const state = window.restoreTestLatestState;
      return state?._session && state._session !== previous && state.cues?.map(c => c.id).join() === 'a,b,locked';
    }, previousSession);
    await panel.waitForFunction(() => [...document.querySelectorAll('#sp-list .sp-ja-view')].map(el => el.textContent).join('|') ===
      '乗せて|ないんですか？|手動の文。');
    const reloaded = await rects();
    assert.deepEqual(reloaded.map(r => [r.id, r.text]), undone.map(r => [r.id, r.text]));
    await panel.screenshot({ path: path.join(stage, 'undo-reloaded.png') });
    await activate();
    await panel.locator('#sp-footer-more summary').click();
    const downloaded = video.waitForEvent('download', { timeout: 15000 });
    await panel.locator('#sp-export-json').click();
    const download = await downloaded;
    const exportedFile = path.join(stage, 'exported-backup.json');
    await download.saveAs(exportedFile);
    const exported = JSON.parse(await fs.readFile(exportedFile, 'utf8'));
    for (const field of ['id', 'source', 'vi', 'en', 'text_source', 'translation_source', 'start_media_time', 'end_media_time']) {
      assert.deepEqual(exported.cues.map(c => c[field]), cues.map(c => c[field]), field);
    }
    assert.equal(exported.cues[2].mt_locked, true);
    assert.deepEqual(exported.transcriptMeta.tombstones, meta.tombstones);
    assert.equal(Object.keys(exported.enhancement.undoRevisions).length, 2);
    const diskResponse = await fetch(address + '/scripts/' + videoId);
    assert.equal(diskResponse.status, 200);
    const disk = await diskResponse.json();
    assert.equal(disk.found, true);
    assert.equal(disk.cues.length, 3);
    const diskBytes = JSON.parse(await fs.readFile(path.join(stage, 'subtitles', videoId, 'cues.json'), 'utf8'));
    for (const field of ['id', 'source', 'vi', 'en', 'text_source', 'translation_source', 'start_media_time', 'end_media_time']) {
      assert.deepEqual(disk.cues.map(c => c[field]), cues.map(c => c[field]), 'API ' + field);
      assert.deepEqual(diskBytes.cues.map(c => c[field]), cues.map(c => c[field]), 'disk ' + field);
    }
    assert.equal(diskBytes.cues[2].vi, '');
    assert.equal(diskBytes.cues[2].mt_locked, true);
    await activate();
    await panel.locator('#sp-recover-json').click();
    await panel.locator('#sp-list .sp-ja-view').filter({ hasText: baseline[0].source }).waitFor({ timeout: 15000 });
    const recovered = await rects();
    assert.equal(recovered.length, 1);
    const recoveryState = await panel.evaluate(videoId => chrome.storage.local.get(['transcript:' + videoId, 'transcriptMeta:' + videoId]), videoId);
    for (const field of ['id', 'source', 'vi', 'mt_locked', 'translation_source', 'start_media_time', 'end_media_time']) {
      assert.equal(recoveryState['transcript:' + videoId][0][field], baseline[0][field], 'recovery ' + field);
    }
    assert.equal(recoveryState['transcriptMeta:' + videoId].owned, true);
    assert.deepEqual(recoveryState['transcriptMeta:' + videoId].tombstones, meta.tombstones);
    const recoveryResponse = await fetch(address + '/scripts/' + videoId);
    assert.equal(recoveryResponse.status, 200);
    const recoveryDisk = await recoveryResponse.json();
    for (const field of ['id', 'source', 'vi', 'mt_locked', 'translation_source', 'start_media_time', 'end_media_time']) {
      assert.equal(recoveryDisk.cues[0][field], baseline[0][field], 'recovery disk ' + field);
    }
    await panel.screenshot({ path: path.join(stage, 'recovered.png') });
    // Same cue IDs with changed source must reject the prior Undo/MT/NLP revisions.
    const changedBackup = structuredClone(backup);
    changedBackup.cues[0].source = 'どこ';
    changedBackup.cues[1].source = '行くんですか？';
    changedBackup.enhancement.undoRevisions = exported.enhancement.undoRevisions;
    const changedFile = path.join(stage, 'changed-source-backup.json');
    await fs.writeFile(changedFile, JSON.stringify(changedBackup));
    await panel.locator('#sp-backup-file').setInputFiles(changedFile);
    await panel.locator('#sp-backup-panel').waitFor({ state: 'visible' });
    await activate();
    await panel.locator('#sp-backup-apply').click();
    await panel.locator('#sp-backup-panel').waitFor({ state: 'hidden', timeout: 20000 });
    await activate();
    await panel.locator('#sp-caption-mode').click();
    await panel.waitForFunction(() => [...document.querySelectorAll('#sp-list .sp-ja-view')].map(el => el.textContent).join('|') ===
      'どこ行くんですか？|どこ行くんですか？|手動の文。');
    const changed = await rects();
    const changedDisplay = await panel.evaluate(() => window.restoreTestLatestState.enhancedCues);
    for (const cue of changedDisplay.slice(0, 2)) {
      assert.equal(cue.vi, '', 'Old VI must not apply to changed source');
      assert.equal(cue.en, '', 'Old EN must not apply to changed source');
      assert.deepEqual(cue.tokens, [], 'Old NLP must not apply to changed source');
      assert(!cue.groupIds.includes(group.id), 'Changed group has a new content identity');
    }
    await panel.screenshot({ path: path.join(stage, 'changed-source.png') });
    await activate();
    await panel.locator('.sp-original-edit').first().click();
    const editor = panel.locator('textarea.sp-ja');
    await editor.waitFor({ state: 'visible' });
    await editor.fill('編集した文。');
    await editor.press('Enter');
    await panel.locator('#sp-list .sp-ja-view').filter({ hasText: '編集した文。' }).waitFor();
    const edited = await rects();
    const editedSession = await panel.evaluate(() => window.restoreTestLatestState._session);
    await video.reload({ waitUntil: 'domcontentloaded' });
    await activate();
    await panel.waitForFunction(async ({ id, previous }) => {
      try { await chrome.tabs.sendMessage(id, { type: 'SP_CMD', cmd: 'get_state' }); } catch { return false; }
      const state = window.restoreTestLatestState;
      return state?._session !== previous && state?.cues?.[0]?.source === '編集した文。';
    }, { id: tabId, previous: editedSession }, { timeout: 20000 });
    await panel.locator('#sp-list .sp-ja-view').filter({ hasText: '編集した文。' }).waitFor();
    const editedReloaded = await rects();
    const changedState = await panel.evaluate(videoId => chrome.storage.local.get(['transcript:' + videoId,
      'sentenceState:v1:youtube:' + videoId + ':ja']), videoId);
    const editedCues = changedState['transcript:' + videoId];
    assert.equal(editedCues[0].source, '編集した文。');
    assert.equal(editedCues[0].text_source, 'edit');
    assert.equal(editedCues[0].vi, '');
    assert.equal(editedCues[0].en, '');
    assert.equal(editedCues[0].start_media_time, cues[0].start_media_time);
    assert.equal(editedCues[0].end_media_time, cues[0].end_media_time);
    assert.deepEqual(editedCues[2], cues[2], 'Protected manual row unaffected by neighboring source changes');
    assert(!changedState['sentenceState:v1:youtube:' + videoId + ':ja'].translations[group.id], 'Stale MT excluded from saved sidecar');
    const editedResponse = await fetch(address + '/scripts/' + videoId);
    assert.equal(editedResponse.status, 200);
    const editedDisk = await editedResponse.json();
    assert.equal(editedDisk.cues[0].source, editedCues[0].source);
    assert.equal(editedDisk.cues[0].text_source, 'edit');
    await panel.screenshot({ path: path.join(stage, 'edited-reloaded.png') });
    await fs.writeFile(path.join(stage, 'result.json'), JSON.stringify({ before, restored, enhanced, undone,
      reloaded, recovered, recoveryState, recoveryDisk, disk, exported, cachedDisplay, changed, changedDisplay,
      edited, editedReloaded, changedState, editedDisk, actualPageStatus: response.status(), bridge: address }, null, 2));
    console.log('PASS: real YouTube content + actual sidepanel restore/toggle/Undo/reload/export/recovery UI; geometry measured at each transition');
    console.log('PASS: actual isolated script HTTP200 parsed response and disk preserve locked blank target and clocks');
    console.log('PASS: changed same-ID source rejects stale Undo/MT/NLP; real original-source editor Enter and reload retain edit/clocks/protected neighbor');
    console.log('NOT VERIFIED: natural caption/audio quality, installed user Chrome, Drive, Gemini, full MVP');
  } catch (error) {
    if (context) for (const [i, page] of context.pages().entries()) {
      await page.screenshot({ path: path.join(stage, 'failure-' + i + '.png') }).catch(() => {});
      await fs.writeFile(path.join(stage, 'failure-' + i + '.txt'), await page.locator('body').innerText().catch(() => 'unavailable'));
      if (page.url().startsWith('chrome-extension://')) {
        const data = await page.evaluate(async () => ({ latest: window.restoreTestLatestState,
          stored: await chrome.storage.local.get(['sentenceState:v1:youtube:ylnxFdPhLCo:ja',
            'transcript:ylnxFdPhLCo', 'transcriptMeta:ylnxFdPhLCo']) })).catch(() => ({}));
        await fs.writeFile(path.join(stage, 'failure-state-' + i + '.json'), JSON.stringify(data, null, 2));
      }
    }
    throw error;
  } finally {
    if (context) await context.close();
    if (server.exitCode === null) server.kill('SIGTERM');
    assert.equal(await serverExit, 0, 'Isolated server exits cleanly');
    await fs.writeFile(path.join(stage, 'server-stderr.txt'), serverOutput);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
