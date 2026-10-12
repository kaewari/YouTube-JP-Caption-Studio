/** Execute production content functions in an isolated state; no DOM/API claim. */
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const source = fs.readFileSync(require.resolve("../extension/content/content.js"), "utf8");
// Text selects the functions; assertions exercise their actual returned state,
// not presence of code strings. Browser DOM checks run separately.
const projectionFunctions = source.slice(source.indexOf("  let sortedCuesCache ="),
  source.indexOf("  /**\n   * Token enrich via /tokenize_batch"));
const commandFunction = source.slice(source.indexOf("  async function handleSidePanelCmd"),
  source.indexOf("  function bridgeFetch"));
const originalTokens = source.slice(source.indexOf('  function originalTokensMatch'), source.indexOf('  /** cues.json'));
const starFunctions = source.slice(source.indexOf("  function isCueStarred"), source.indexOf("  function getSortedCues"));
const metadata = source.slice(source.indexOf("  function cachedSourceMetadata("), source.indexOf("  function cacheCueScore("));
const cacheWrapper = source.slice(source.indexOf("  async function loadCachedCues"), source.indexOf("  async function loadLegacyCachedCues"));
const writes = source.slice(source.indexOf("  let transcriptWritePending"), source.indexOf("  async function saveTranscript(opts"));
const workerSource=fs.readFileSync(require.resolve('../extension/background/service_worker.js'),'utf8');
const savedWorker=workerSource.slice(workerSource.indexOf('let savedStateWritePending'),workerSource.indexOf('async function ensureBridgePollAlarm'));
const context = vm.createContext({ console, Normalize:require("../extension/content/normalize_cues.js"), structuredClone, performance, HardsubSentenceGroups: require("../extension/shared/sentence_groups.js") });
vm.runInContext(`
let cues=[{id:'a',source:'どこ',start_media_time:0,end_media_time:1,vi:'Mảnh A'},
  {id:'b',source:'行くんですか?',start_media_time:1,end_media_time:3,vi:'Mảnh B'}];
let currentSource='youtube',currentVideoId='fixture',captionMode='original',sentenceSourceKey='',
  sentenceProjection=null,sentenceProjectionCues=null,enhancedCues=[],sentenceTranslations={},sentenceTokens={},
  sentenceUndoIds=new Set(),sentenceUndoRevisions={},sentenceStateLoadedKey='',sentenceStateLoadedGen=-1,sentenceStateLoad=null,
  listDirty=true,currentMediaTime=2,savedCues={},navigateGen=1,settings={sourceLang:'ja'},sentenceBenchmark=null,sentenceRawTrack=null;
const syncToPlayhead=async()=>{};
const triggerGeminiTranslationIfNeeded=async()=>{};
const enrichSentenceGroups=async()=>{};
const publishSidePanelState=()=>{};
const cache={};
const chrome={runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,
  sendMessage:msg=>handleSavedCueMutation(msg,{id:'fixture',url:'https://www.youtube.com/watch?v=fixture',tab:{id:1}})},
storage:{local:{get:async(key)=>({[key]:cache[key]}),set:async(value)=>{
  stored=JSON.parse(JSON.stringify(value));Object.assign(cache,stored);
}}}};
let stored=null,painted=null;
let downloaded=null,transcriptMeta={owned:false,rev:2,tombstones:[]},saveTimer=null,sentenceRestorePending=false;
const tabPrefix=()=>'';
const metaStorageKey=id=>'transcriptMeta:'+id;
const loadDiskMeta=async()=>({rev:2});
let diskSaves=[];
const saveTranscriptToDisk=async payload=>diskSaves.push(structuredClone(payload));
const downloadCaptionFile=(text,fileName,mimeType)=>{downloaded={text,fileName,mimeType}};
const toast=()=>{};
const isSupportedUrl=url=>url.startsWith('https://www.youtube.com/');
${savedWorker}
${writes}
const updateBar=cue=>{painted=cue};
${projectionFunctions}
${originalTokens}
${commandFunction}
${starFunctions}
const loadLegacyCachedCues=async()=>cues;
const isOwnedCue=c=>c.mt_locked || ['edit','import','manual'].includes(c.text_source);
${metadata}${cacheWrapper}
`, context);
const run = expression => vm.runInContext(expression, context);
(async () => {
  const before = run("JSON.stringify(cues)");
  await run("refreshSentenceProjection(true)");
  assert.equal(run("captionMode"), "enhanced", "a fresh eligible YouTube track should default to Enhanced");
  await run("handleSidePanelCmd({cmd:'set_caption_mode',mode:'original'})");
  assert.equal(run("captionMode"), "original", "Original must remain an explicit user choice");
  run("refreshSentenceProjection(true)");
  assert.equal(run("captionMode"), "original", "same-track refresh must keep the user's Original choice");
  await run("handleSidePanelCmd({cmd:'set_caption_mode',mode:'enhanced'})");
  assert.equal(run("captionMode"), "enhanced");
  assert.equal(run("findActiveCue(2).source"), "どこ行くんですか?");
  assert.equal(run("findActiveCue(2).vi"), "");
  assert.equal(run("findActiveCue(10)"), null);
  assert.equal(run("getActiveDisplayCue().source"), "どこ行くんですか?");
  await run("toggleStarCue(enhancedCues[1].id)");
  assert.equal(run("Object.values(stored.savedCues).find(c=>c.videoId==='fixture').source"), "どこ行くんですか?");
  assert.equal(run("Object.values(stored.savedCues)[0].provenance.sourceRefs.length"), 2);
  assert.equal(run("isCueStarred(enhancedCues[0].id)"), true);
  run("sentenceRawTrack={version:1,sourceKey:sentenceTrackKey(),cues:[{text:'どこ',start:0,end:1},{text:'行くんですか?',start:1,end:3}]}");
  await run("handleSidePanelCmd({cmd:'export_json'})");
  const backup=JSON.parse(run('downloaded.text'));
  assert.equal(backup.format,'caption-studio-sentence-backup');assert.equal(backup.version,1);
  assert.equal(backup.enhancement.algorithmVersion,context.HardsubSentenceGroups.VERSION,
    'Backup metadata must describe the loaded grouping algorithm, not a hardcoded old version');
  assert.equal(backup.enhancement.rawTrack.cues[0].text,'どこ');
  assert.equal(JSON.stringify(backup.cues),before);
  assert.equal(backup.savedSentences[0].source,'どこ行くんですか?');
  assert.equal(backup.savedSentences[0].provenance.sourceRefs.length,2);
  assert.equal(backup.transcriptMeta.rev,2);
  context.testTrace=require('../extension/shared/sentence_benchmark.js').createTrace({traceId:'export-fixture'});
  context.navigator={};
  run('sentenceBenchmark=testTrace');
  await run("handleSidePanelCmd({cmd:'export_benchmark'})");
  const metrics=JSON.parse(run('downloaded.text'));
  assert.equal(metrics.traceId,'export-fixture');assert.equal(metrics.status,'NOT VERIFIED');
  assert.equal(metrics.context.videoId,'fixture');assert.equal(metrics.context.fingerprint,null);
  assert.equal(metrics.ttfV,undefined);assert.equal(metrics.ttfvMs,null);
  assert.equal(run('downloaded.fileName'),'yt-caption-fixture-benchmark.json');
  assert.equal(Object.hasOwn(JSON.parse(run('JSON.stringify(sentenceBackupSnapshot())')),'benchmark'),false);
  run('sentenceBenchmark=null');
  const beforeRestore=run('JSON.stringify(cues)');
  run("cues[0].vi='edited';cues[0].mt_locked=true;transcriptMeta.tombstones=['deleted-original'];cache.savedCues.keep={id:'keep',videoId:'other',source:'keep'}");
  context.backupInput=structuredClone(backup);
  const restored=await run("handleSidePanelCmd({cmd:'restore_sentence_backup',backup:backupInput})");
  assert.equal(restored.ok,true,'explicit backup restore must be available');
  assert.equal(run('JSON.stringify(cues)'),beforeRestore);
  assert.equal(run('savedCues.keep.source'),'keep');
  assert.equal(run('captionMode'),'original');
  assert.equal(run("cache['sentenceRecovery:v1:'+sentenceTrackKey()].cues[0].vi"),'edited');
  await run("handleSidePanelCmd({cmd:'restore_previous_backup'})");
  assert.equal(run('cues[0].vi'),'edited');assert.equal(run('cues[0].mt_locked'),true);
  assert.equal(run('transcriptMeta.tombstones[0]'),'deleted-original');
  await run("handleSidePanelCmd({cmd:'restore_sentence_backup',backup:backupInput})");
  const validState=run('JSON.stringify(cues)');
  context.backupInput.videoId='wrong';
  await assert.rejects(()=>run("handleSidePanelCmd({cmd:'restore_sentence_backup',backup:backupInput})"));
  assert.equal(run('JSON.stringify(cues)'),validState);
  context.backupInput=structuredClone(backup);context.backupInput.cues[1].id=context.backupInput.cues[0].id;
  await assert.rejects(()=>run("handleSidePanelCmd({cmd:'restore_sentence_backup',backup:backupInput})"));
  assert.equal(run('JSON.stringify(cues)'),validState);
  run("sentenceTokens={[sentenceProjection.groups[0].id]:[{surface:'other source',start:0,end:3,offsetUnit:'utf16'}]};refreshSentenceProjection(true)");
  assert.equal(run('Object.keys(sentenceTokens).length'),0);
  assert.equal(run('enhancedCues[0].tokens.length'),0);
  run("cues[1].source='行くの?';listDirty=true;refreshSentenceProjection(true)");
  assert.equal(run("isCueStarred(enhancedCues[1].id)"), false);
  assert.equal(run("Object.values(stored.savedCues).find(c=>c.videoId==='fixture').source"), "どこ行くんですか?");
  run("cues[1].source='行くんですか?';refreshSentenceProjection(true)");
  await run("handleSidePanelCmd({cmd:'undo_sentence',id:enhancedCues[1].id})");
  assert.equal(run("findActiveCue(2).source"), "行くんですか?");
  assert.equal(run("JSON.stringify(cues)"), before);
  run("sentenceStateLoadedKey='';sentenceUndoRevisions={};sentenceUndoIds.clear()");
  await run("loadSentenceState()");
  assert.equal(run("findActiveCue(2).source"),'行くんですか?');
  run("let stateReads=0,stateWaits=[];const normalGet=chrome.storage.local.get;chrome.storage.local.get=key=>{stateReads++;return new Promise(resolve=>stateWaits.push(()=>resolve({[key]:cache[key]})))};navigateGen++");
  const olderLoad=run("loadSentenceState()");
  run("navigateGen++;sentenceUndoRevisions={}");
  const newerLoad=run("loadSentenceState()");
  assert.equal(run("stateReads"),2);
  run("stateWaits.forEach(resolve=>resolve());chrome.storage.local.get=normalGet");
  await Promise.all([olderLoad,newerLoad]);
  assert.equal(run("sentenceUndoIds.has('b')"),true);
  run("cues[1].source='行くの?';refreshSentenceProjection(true)");
  assert.equal(run("sentenceUndoIds.has('b')"),false);
  run("cues[1].source='行くんですか?';refreshSentenceProjection(true)");
  run("cache[sentenceStateStorageKey()]={version:1,sourceKey:sentenceTrackKey(),sourceCues:[null]}");
  assert.equal(JSON.stringify(await run("loadCachedCues(currentVideoId)")),run("JSON.stringify(cues)"));
  run("chrome.storage.local.get=async()=>{throw Error('fixture read failure')}");
  assert.equal(JSON.stringify(await run("loadCachedCues(currentVideoId)")),run("JSON.stringify(cues)"));
  run("const beforeRollbackCues=cues;cues=cues.concat({id:'flag-extra',source:'晴れ。',start_media_time:4,end_media_time:5});refreshSentenceProjection(true);const rollbackGroup=sentenceProjection.groups.find(g=>!g.protected);sentenceTranslations[rollbackGroup.id]={revision:rollbackGroup.revision,vi:'Giữ backup'};sentenceTokens[rollbackGroup.id]=[{surface:rollbackGroup.text,start:0,end:rollbackGroup.text.length,offsetUnit:'utf16'}]");
  const rollbackSource = run('JSON.stringify(cues)');
  const rollbackSaved = run('JSON.stringify(savedCues)');
  const rollbackState = run('JSON.stringify(sentenceStateSnapshot())');
  for (const flag of ['enhanced_subtitles_enabled','sentence_grouping_enabled']) {
    run(`settings.${flag}=false;captionMode='enhanced';refreshSentenceProjection(true)`);
    assert.equal(run('captionMode'),'original',`${flag} must roll back to Original`);
    assert.equal(run('enhancedCues.length'),0);
    assert.equal(run('JSON.stringify(cues)'),rollbackSource);
    assert.equal(run('JSON.stringify(savedCues)'),rollbackSaved);
    assert.equal(run('JSON.stringify(sentenceStateSnapshot())'),rollbackState,'rollback must retain sidecar backup metadata');
    run(`settings.${flag}=true;refreshSentenceProjection(true);captionMode='enhanced'`);
    assert.ok(run('enhancedCues.length')>0,'reenabling grouping rebuilds display');
  }
  run("settings.enhanced_subtitles_enabled=false;sentenceProjection=null;sentenceProjectionCues=null");
  assert.equal(run('JSON.stringify(sentenceStateSnapshot())'),rollbackState,'disabled initial load with no projection must retain saved sidecar maps');
  run("settings.enhanced_subtitles_enabled=true;refreshSentenceProjection(true)");
  console.log('PASS: independent Enhanced/grouping flags roll back display to Original, retaining originals, saved items and sidecar backup metadata; reenable rebuilds');
  run("cues=beforeRollbackCues");
  run("currentVideoId='another'; refreshSentenceProjection(true)");
  assert.equal(run("captionMode"), "enhanced", "a new eligible video should default to Enhanced");
  assert.equal(run("sentenceUndoIds.size"), 0);
  run("cues[1].id='a';refreshSentenceProjection(true)");
  assert.equal(run("captionMode"), "original");
  assert.equal(run("enhancedCues.length"), 0);
  console.log("PASS: production mode/playhead/undo/video-reset/invalid-ID fallback; original state unchanged, fragment MT withheld");
  console.log("PASS: active display resolver and saved snapshot/provenance; shared sentence star, revision change keeps old snapshot");
  console.log("PASS: versioned sidecar adapter reload restores undo; changed source invalidates override (isolated storage adapter)");
  console.log("PASS: malformed/unavailable disposable sidecar preserves successful legacy cache load");
  console.log("PASS: same-track new navigation reads its own sidecar instead of reusing aborted session load");
  console.log("PASS: production JSON export payload preserves original clocks/text, raw track, metadata and saved provenance; browser delivery not covered");
  console.log("PASS: explicit restore/recovery preserves source clocks, locks, tombstones and other saved videos; wrong video/duplicate IDs rejected (isolated storage adapter)");
})().catch(err => { console.error(err); process.exitCode = 1; });
