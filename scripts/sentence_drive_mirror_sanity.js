/** Production worker mirror/pull functions + real disposable bridge HTTP; cloud adapters are isolated fixtures. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const source = fs.readFileSync(require.resolve('../extension/background/service_worker.js'), 'utf8');
const mirror = source.slice(source.indexOf('async function mirrorFromDrive('), source.indexOf('/** Content scripts need tabs.sendMessage'));
const pull = source.slice(source.indexOf('async function pullDriveIfNewer('), source.indexOf('/** videoIds seen since the last flush'));
const storage = { lastMirroredRev: { unrelated: 94 } }, statuses = [], restored = [];
const disk = () => Object.fromEntries(fs.readdirSync(input.folder).map(name => [name, fs.readFileSync(input.folder + '/' + name)]));
const advances = input.localAdvances ?? 2;
assert.ok(advances === 1 || advances === 2);
const finalRevision = 6 + advances;
let before;
async function bridgeJson(path) {
  const response = await fetch(input.address + path);
  assert.equal(response.status, 200);
  return response.json();
}
const context = vm.createContext({
  fetch, Date, Map, encodeURIComponent, console,
  chrome: { storage: { local: {
    get: async () => structuredClone(storage),
    set: async patch => Object.assign(storage, structuredClone(patch)),
  } } },
  driveConnected: async () => true,
  driveList: async () => [{ id: 'fixture-folder', name: input.videoId }],
  driveChildren: async () => new Map(Object.keys(input.files).map(name => [name, name])),
  driveGetText: async name => {
    if (name === 'cues.json') {
      for (let rev = 6; rev < finalRevision; rev++) {
        const response = await fetch(input.address + '/scripts/save', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_id: input.videoId, owned: true, rev,
            cues: [{ ...input.cue, vi: 'new local edit revision ' + (rev + 1) }] }),
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).rev, rev + 1);
      }
      before = disk();
    }
    return input.files[name];
  },
  bridgeJson,
  notifyDriveRestored: async ids => restored.push(...ids),
  pullVocabSnapshot: async () => ({}), syncSettingsOnConnect: async () => null,
  driveQueued: async fn => fn(), setDriveStatus: async text => statuses.push(text),
});
vm.runInContext(`const BRIDGE=${JSON.stringify(input.address)},DRIVE_FOLDER_ID='fixture',DRIVE_FOLDER_MIME='application/vnd.google-apps.folder';
  const MIRROR_FILES=['cues.json','meta.json','script.txt'],_freshCheckedAt=new Map(); let _driveBusy=false;
  ${mirror}${pull}`, context);
(async () => {
  const result = await vm.runInContext('pullDriveIfNewer()', context);
  console.log(JSON.stringify({ result, statuses, restored, storedMirrors: storage.lastMirroredRev }));
  assert.ok(before, 'Download must happen after a real local metadata probe at rev6');
  assert.deepEqual(disk(), before, `Rejected mirror must keep all four revision${finalRevision} files exact`);
  assert.equal(result.ok, false, 'Rejected mirror must not report a successful pull');
  assert.match(result.error, /409/);
  assert.ok(statuses.length && statuses.every(text => text.startsWith('error:')));
  assert.deepEqual(restored, []);
  assert.deepEqual(storage.lastMirroredRev, { unrelated: 94 });
  assert.equal((await bridgeJson('/scripts/' + input.videoId + '/meta')).rev, finalRevision);
  console.log(`PASS: real local rev6 advances to${finalRevision} during production worker mirror download of remote7; HTTP409 preserves four files, mirror bookkeeping and notifications; pull reports error rather than Connected (no cloud/native UI proof)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
