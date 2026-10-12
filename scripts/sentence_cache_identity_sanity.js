/** Execute production source/cache reconciliation; no installed browser claim. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require.resolve('../extension/content/content.js'), 'utf8');
const functions = source.slice(source.indexOf('  function cueId('), source.indexOf('  /** Ask the SW whether Drive'));
const tokenCheck = source.slice(source.indexOf('  function originalTokensMatch'), source.indexOf('  /** cues.json'));
const tombstoneKey = source.slice(source.indexOf('  function cacheCueKey('), source.indexOf('  /** Shared namespace'));
const metadata = source.slice(source.indexOf('  function cueEndTime('), source.indexOf('  function cacheCueScore('));
const context = vm.createContext({ console, Normalize:require('../extension/content/normalize_cues.js') });
vm.runInContext(`const CACHE_MATCH_TOL=0.6;let transcriptMeta={};
const compactSource=s=>String(s||'').replace(/\\s/g,'');
const detectCuesLanguage=()=> 'ja';
const isOwnedCue=c=>['edit','manual','script'].includes(c.text_source);
${metadata}${tokenCheck}${tombstoneKey}${functions}`, context);
const run = expression => vm.runInContext(expression, context);
context.raw = [{text:'返してください。',start:333.36,end:335.8},{text:'返してください。',start:333.84,end:338.8}];
context.cached = [{id:'legacy-first',source:'返してください。',start_media_time:333.36,end_media_time:335.8,vi:'Xin trả lại.',translation_source:'gemini'}];
let out = run('mergeCache(raw,cached)');
assert.equal(new Set(out.map(c=>c.id)).size,2,'one cached cue must not assign its ID to two current source cues');
assert.equal(out[0].id,'legacy-first');assert.equal(out[0].vi,'Xin trả lại.');
assert.equal(out[1].vi,'');assert.deepEqual(out.map(c=>c.start_media_time),[333.36,333.84]);
context.cached.push({id:'legacy-second',source:'返してください。',start_media_time:333.84,end_media_time:338.8,vi:'Trả lại nhé.'});
out = run('mergeCache(raw,cached.slice().reverse())');
assert.equal(out[0].id,'legacy-first','nearest source anchor must win independent of saved array order');
assert.equal(out[1].id,'legacy-second');assert.equal(out[1].vi,'Trả lại nhé.');
context.raw = [{text:'同じ始まりのとても長い文章が続きます。A',start:5,end:6},{text:'同じ始まりのとても長い文章が続きます。B',start:5,end:6}];
out = run('mergeCache(raw,[])');assert.equal(new Set(out.map(c=>c.id)).size,2,'same start and truncated prefix need distinct stable IDs');
assert.deepEqual(out.map(c=>c.id),run('mergeCache(raw,[]).map(c=>c.id)'));
context.cached=[{id:'owned',source:'編集した文章。',start_media_time:4,end_media_time:9,text_source:'edit',vi:'Giữ nguyên',mt_locked:true}];
out=run('mergeCache(raw,cached,{owned:true,tombstones:[]})');
assert.equal(out.length,1);assert.equal(out[0].id,'owned');assert.equal(out[0].source,'編集した文章。');assert.equal(out[0].vi,'Giữ nguyên');assert.equal(out[0].mt_locked,true);
context.raw=[{text:'編集した文章。',start:10.2,end:11}];
context.cached=[{id:'locked-blank',source:'編集した文章。',start_media_time:10,end_media_time:11,text_source:'edit',vi:'',mt_locked:true,translation_source:'user'},
 {id:'nearby-auto',source:'編集した文章。',start_media_time:10.2,end_media_time:11,text_source:'yt',vi:'Tự động',translation_source:'gemini'}];
out=run('mergeCache(raw,cached,{owned:true,tombstones:[]})');
assert.equal(out.find(c=>c.id==='locked-blank').vi,'','owned locked blank must not be filled from neighboring automatic translation');
context.raw=[{text:'晴れ。',start:10.2,end:11}];
context.cached=[{id:'edited-source',source:'雨。',start_media_time:10,end_media_time:11,text_source:'edit',vi:'',mt_locked:false},
  {id:'nearby-auto',source:'晴れ。',start_media_time:10.2,end_media_time:11,text_source:'yt',vi:'Nắng',translation_source:'gemini'}];
out=run('mergeCache(raw,cached,{owned:true,tombstones:[]})');
assert.equal(out.find(c=>c.id==='edited-source').vi,'','edited source must not inherit automatic translation for neighboring different source');
if (!process.argv.includes('--tokens-only')) {
  context.raw=[{text:'削除した文章。',start:10,end:11},{text:'残す文章。',start:20,end:21}];
  context.cached=[{id:'deleted',source:'削除した文章。',start_media_time:10,end_media_time:11,text_source:'edit'},
    {id:'keep',source:'残す文章。',start_media_time:20,end_media_time:21,text_source:'edit'}];
  context.meta={owned:true,tombstones:['10.00|削除した文章。']};
  out=run('mergeCache(raw,cached,meta)');
  assert.deepEqual(out.map(c=>c.id),['keep'],'owned stale cached tombstone must not reappear');
  context.meta.tombstones.push('20.00|残す文章。');
  assert.equal(run('mergeCache(raw,cached,meta).length'),0,'all-deleted owned script must stay empty');
  assert.equal(run('mergeCache(raw,[],meta).length'),0,'empty owned script must not append fresh YT rows');
  assert.equal(run('cuesFromSavedScript(cached,meta).length'),0,'startup saved script must also honor tombstones');
  console.log('PASS: owned tombstones survive stale cache, saved-script startup and all-deleted/empty reload');
}
context.raw=[{text:'晴 れ。',start:10,end:11}];
context.cached=[{id:'cached',source:'晴れ。',start_media_time:10,end_media_time:11,tokens:[{surface:'晴れ。'}]}];
out=run('mergeCache(raw,cached)');
assert.equal(out[0].source,'晴 れ。');
assert.equal(out[0].tokens.length,0,'cached original tokens must match exact newly loaded source');
context.cached[0].source='晴 れ。';context.cached[0].tokens=[{surface:'晴'},{surface:' '},{surface:'れ。'}];
out=run('mergeCache(raw,cached)');assert.equal(out[0].tokens.map(t=>t.surface).join(''),out[0].source);
console.log('PASS: compact-equivalent fresh sources discard mismatched original tokens and keep exact tokens');
console.log('PASS: repeated adjacent source uses each cached ID once with nearest anchor; fresh prefix collisions stay distinct/deterministic; owned clocks/text/lock remain authoritative');
context.Normalize=require('../extension/content/normalize_cues.js');
context.structuredClone=structuredClone;context.performance=performance;
context.crypto=require('node:crypto').webcrypto;context.TextEncoder=TextEncoder;
vm.runInContext(source.slice(source.indexOf('  async function sentenceSourceFingerprint('),source.indexOf('  function sentenceStateStorageKey(')),context);
const apply = source.slice(source.indexOf('  async function applyLoadedCues('), source.indexOf('  /**\n   * Union-merge YT'));
const startup = source.slice(source.indexOf('  async function tryApplySavedScript('), source.indexOf('  let videoLayoutObserver'));
vm.runInContext(`
let cues=[],navigateGen=1,currentVideoId='fixture',currentSource='youtube',captionsStatus='',captionsInfo='',paintPendingT0=0,sentenceBenchmark=null,sentenceRawTrack=null,listDirty=false;
const sentenceTrackKey=()=> 'youtube:fixture:ja',loadCachedCues=async()=>cached,loadTranscriptMeta=async()=>meta;
// Sidecar/UI persistence is exercised by sentence_chrome_restore_sanity.cjs; this fixture isolates cue identity.
const loadSentenceState=async()=>{};
const applyYtSecondaryFill=()=>{},enrichTokensAfterImport=async()=>{},sleep=async()=>{},syncToPlayhead=async()=>{};
const updateCaptionStatusLine=()=>{},renderList=()=>{},publishSidePanelState=()=>{},markFuriganaPainted=()=>{};
const triggerGeminiTranslationIfNeeded=async()=>{},scheduleSaveTranscript=()=>{},scriptListScore=()=>0,toast=()=>{};
${apply}${startup}`,context);
(async()=>{
  context.raw=[{text:'削除した文章。',start:10,end:11}];
  context.cached=[{id:'deleted',source:'削除した文章。',start_media_time:10,end_media_time:11,text_source:'edit'}];
  context.meta={owned:true,rev:3,tombstones:['10.00|削除した文章。']};
  await run("applyLoadedCues(raw,'native reload')");assert.equal(run('cues.length'),0,'production reload must not fallback to deleted cached rows');
  run("cues=[{id:'stale',source:'古い文章。'}]");
  assert.equal(await run("tryApplySavedScript('startup',{quiet:true})"),true);
  assert.equal(run('cues.length'),0,'production startup must publish authoritative empty saved timeline');
  context.cached=[];
  await run("applyLoadedCues(raw,'empty owned reload')");assert.equal(run('cues.length'),0);
  console.log('PASS: actual async reload/startup callers preserve all-deleted and empty owned timeline');
})().catch(error=>{console.error(error);process.exitCode=1});
