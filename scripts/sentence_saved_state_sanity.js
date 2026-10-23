/** Actual worker/content/web functions with isolated storage; no installed Chrome claim. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const path = require('node:path');
const workerSource = fs.readFileSync(require.resolve('../extension/background/service_worker.js'), 'utf8');
const workerFunctions = workerSource.slice(workerSource.indexOf('let savedStateWritePending'), workerSource.indexOf('async function ensureBridgePollAlarm'));
const contentSource = fs.readFileSync(require.resolve('../extension/content/content.js'), 'utf8');
const projection = contentSource.slice(contentSource.indexOf('  let sortedCuesCache ='), contentSource.indexOf('  /**\n   * Token enrich via /tokenize_batch'));
const command = contentSource.slice(contentSource.indexOf('  async function handleSidePanelCmd'), contentSource.indexOf('  function bridgeFetch'));
const save = contentSource.slice(contentSource.indexOf('  let transcriptWritePending'), contentSource.indexOf('  function cueId'));
const saveMeta = contentSource.slice(contentSource.indexOf('  async function saveTranscriptMeta'), contentSource.indexOf('  async function markScriptOwned'));
const hydrate = contentSource.slice(contentSource.indexOf('  function originalTokensMatch'), contentSource.indexOf('  function scheduleSaveTranscript'));
const shared = {}, disk = [];
let holdCommit, commitArrived, holdMeta, metaArrived;
const local = {
  get: async keys => {
    const list = Array.isArray(keys) ? keys : [keys];
    const result = Object.fromEntries(list.map(k => [k, structuredClone(shared[k])]));
    if (holdMeta && list.includes('transcriptMeta:fixture')) { metaArrived(); await holdMeta; }
    return result;
  },
  set: async patch => {
    if (holdCommit && Object.keys(patch).some(k => k.startsWith('sentenceRecovery:'))) { commitArrived(); await holdCommit; }
    Object.assign(shared, structuredClone(patch));
  },
};
const chrome = { runtime: { id:'fixture',getURL:path=>'chrome-extension://fixture/'+path }, storage:{local} };
const worker = vm.createContext({chrome,console});
vm.runInContext(`const isSupportedUrl=url=>url?.startsWith('https://www.youtube.com/');${workerFunctions}`, worker);
const mutate = msg => { worker.msg = msg; return vm.runInContext("handleSavedCueMutation(msg,{id:'fixture',url:'https://www.youtube.com/watch?v=fixture',tab:{id:1}})", worker); };
chrome.runtime.sendMessage = mutate;
function content() {
  const ctx = vm.createContext({chrome,console,structuredClone,clearTimeout,HardsubSentenceGroups:require('../extension/shared/sentence_groups.js'),disk});
  vm.runInContext(`
let cues=[{id:'a',source:'どこ',start_media_time:0,end_media_time:1,tokens:[]}],currentSource='youtube',currentVideoId='fixture',
 captionMode='original',sentenceSourceKey='',sentenceProjection=null,sentenceProjectionCues=null,enhancedCues=[],sentenceTranslations={},sentenceTokens={},
 sentenceUndoIds=new Set(),sentenceUndoRevisions={},sentenceStateLoadedKey='',sentenceStateLoadedGen=-1,sentenceStateLoad=null,
 sentenceBenchmark=null,sentenceRawTrack=null,sentenceRestorePending=false,listDirty=true,currentMediaTime=0,savedCues={},navigateGen=1,settings={sourceLang:'ja'},
 audioListeningActive=false,
 transcriptMeta={owned:true,rev:2,tombstones:['deleted']},saveTimer=null;
const tabPrefix=()=>'',metaStorageKey=id=>'transcriptMeta:'+id,loadDiskMeta=async()=>null;
const saveTranscriptToDisk=async payload=>disk.push(structuredClone(payload));
const syncToPlayhead=async()=>{},publishSidePanelState=()=>{},toast=()=>{};
const bridgeFetch=async()=>({ok:false});
${hydrate}${projection}${saveMeta}${save}${command}
`,ctx);
  return {ctx,run:code=>vm.runInContext(code,ctx)};
}
(async()=>{
  const c=content();await c.run('loadSentenceState()');
  const backup=c.run('sentenceBackupSnapshot()');backup.cues[0].source='復元';
  c.ctx.backup=backup;
  let releaseMeta;
  holdMeta=new Promise(resolve=>{releaseMeta=resolve});
  const metaSeen=new Promise(resolve=>{metaArrived=resolve});
  const oldSave=c.run('saveTranscript()');await metaSeen;
  const restore=c.run("handleSidePanelCmd({cmd:'restore_sentence_backup',backup})");
  await Promise.resolve();assert.equal(c.run('cues[0].source'),'どこ');
  holdMeta=null;releaseMeta();await Promise.all([oldSave,restore]);
  assert.equal(shared['transcript:fixture'][0].source,'復元');assert.equal(disk.at(-1)[0].source,'復元');
  console.log('PASS: actual legacy save waits/commits before restore; restored memory, storage and disk adapter retain new source');

  const sibling=content();await sibling.run('loadSentenceState()');
  sibling.run("cues[0].source='Old other tab'");
  shared['transcriptMeta:fixture'].rev=2;
  holdMeta=new Promise(resolve=>{releaseMeta=resolve});
  const siblingRead=new Promise(resolve=>{metaArrived=resolve});
  const siblingSave=sibling.run('saveTranscript()');await siblingRead;
  const restoring=c.run("handleSidePanelCmd({cmd:'restore_sentence_backup',backup})");
  await restoring;
  holdMeta=null;releaseMeta();await siblingSave;
  assert.equal(shared['transcript:fixture'][0].source,'復元');
  assert.notEqual(disk.at(-1)[0].source,'Old other tab');
  console.log('PASS: sibling tab holding an old metadata response cannot overwrite restored script; worker compares revision inside its queue');

  sibling.ctx.currentRev=shared['transcriptMeta:fixture'].rev;
  sibling.run('transcriptMeta.rev=currentRev');
  let releaseSidecar, sidecarArrived;
  const sidecarHold=new Promise(resolve=>{releaseSidecar=resolve});
  const sidecarSeen=new Promise(resolve=>{sidecarArrived=resolve});
  chrome.runtime.sendMessage=async msg=>{
    if(msg.op==='save_sentence_state'){sidecarArrived();await sidecarHold;}
    return mutate(msg);
  };
  const oldSidecar=sibling.run('saveSentenceState()');await sidecarSeen;
  const undoBackup=structuredClone(backup);
  c.ctx.undoCue=undoBackup.cues[0];
  undoBackup.enhancement.undoRevisions={a:c.run('sentenceCueRevision(undoCue)')};
  c.ctx.backup=undoBackup;
  await c.run("handleSidePanelCmd({cmd:'restore_sentence_backup',backup})");
  releaseSidecar();await oldSidecar;chrome.runtime.sendMessage=mutate;
  assert.deepEqual(shared['sentenceState:v1:youtube:fixture:ja'].undoRevisions,undoBackup.enhancement.undoRevisions);
  c.ctx.backup=backup;
  console.log('PASS: sibling late sidecar write cannot erase restored Undo; shared worker rejects older metadata revision');

  let releaseCommit;
  holdCommit=new Promise(resolve=>{releaseCommit=resolve});
  const commitSeen=new Promise(resolve=>{commitArrived=resolve});
  const second=c.run("handleSidePanelCmd({cmd:'restore_sentence_backup',backup})");await commitSeen;
  const star=mutate({op:'toggle',id:'other',cue:{id:'other',videoId:'other',source:'other source'}});
  holdCommit=null;releaseCommit();await Promise.all([second,star]);
  assert.equal(shared.savedCues.other.videoId,'other');
  worker.msg={op:'toggle',id:'own-page-tab',cue:{id:'own-page-tab',source:'自分',videoId:'fixture'}};
  await vm.runInContext("handleSavedCueMutation(msg,{id:'fixture',url:'chrome-extension://fixture/popup/index.html',tab:{id:9}})",worker);
  assert.equal(shared.savedCues['own-page-tab'].source,'自分');
  console.log('PASS: held restore commit and another tab star share production worker queue; other-video snapshot survives');

  c.ctx.backup=structuredClone(backup);c.ctx.backup.cues[0].tokens=[null];
  await c.run("handleSidePanelCmd({cmd:'restore_sentence_backup',backup})");
  assert.deepEqual(shared['transcript:fixture'][0].tokens,[]);
  c.ctx.backup.cues[0].tokens=[{surface:'other source',start:0,end:3}];
  await c.run("handleSidePanelCmd({cmd:'restore_sentence_backup',backup})");
  assert.deepEqual(shared['transcript:fixture'][0].tokens,[]);
  console.log('PASS: malformed/null Original token cache cannot replace restored source');

  shared['tokens:fixture']={a:[{surface:'どこ'}]};
  c.run("cues[0].tokens=[{surface:'古い'}]");
  await c.run("hydrateTokens('fixture',cues)");
  assert.equal(c.run("cues[0].tokens.map(t=>t.surface).join('')"),'');
  assert.equal(c.run('cues[0].source'),'復元');
  shared['tokens:fixture']={a:[{surface:'復元',reading:'ふくげん'}]};
  await c.run("hydrateTokens('fixture',cues)");
  assert.equal(c.run("cues[0].tokens.map(t=>t.surface).join('')"),'復元');
  console.log('PASS: hydration discards wrong-source memory/cache tokens and retains exact matching original tokens');

  worker.msg={op:'delete',id:'other'};
  await assert.rejects(()=>vm.runInContext("handleSavedCueMutation(msg,{id:'foreign',url:'https://www.youtube.com/'})",worker));
  assert.equal(shared.savedCues.other.videoId,'other');
  // The real production module: Node type-strips .ts natively, so this needs no
  // typescript package - the previous revision crashed with MODULE_NOT_FOUND in
  // any checkout without web node_modules installed.
  const { register } = require('node:module');
  const { pathToFileURL } = require('node:url');
  register(pathToFileURL(path.join(__dirname, '..', 'web', 'saved-items', 'tests', 'alias-hooks.mjs')).href);
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} } };
  globalThis.chrome = chrome;
  const { deleteSavedCueAsync } = await import(pathToFileURL(path.join(__dirname, '..', 'web', 'saved-items', 'src', 'lib', 'vocab-store.ts')).href);
  await deleteSavedCueAsync('other');
  assert.equal(shared.savedCues.other,undefined);
  delete globalThis.window;
  delete globalThis.chrome;
  console.log('PASS: foreign sender rejected; actual TypeScript Saved Items deletion uses worker mutation and removes only its selected ID');
})().catch(error=>{console.error(error);process.exitCode=1});
