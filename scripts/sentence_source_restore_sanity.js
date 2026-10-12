/** Production save/worker/load/conversion with isolated storage, not native Chrome or HTTP proof. */
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const source=fs.readFileSync(require.resolve('../extension/content/content.js'),'utf8');
const workerSource=fs.readFileSync(require.resolve('../extension/background/service_worker.js'),'utf8');
const Normalize=require('../extension/content/normalize_cues.js');
const Parser=require('../extension/shared/timedtext_parse.js');
const Groups=require('../extension/shared/sentence_groups.js');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const stored={},disk=[];
const chrome={runtime:{id:'fixture',getURL:p=>'chrome-extension://fixture/'+p},storage:{local:{
  get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(stored[k])])),
  set:async patch=>Object.assign(stored,structuredClone(patch)),
}}};
const worker=vm.createContext({chrome,console});
vm.runInContext(`const isSupportedUrl=url=>url?.startsWith('https://www.youtube.com/');
${workerSource.slice(workerSource.indexOf('let savedStateWritePending'),workerSource.indexOf('async function ensureBridgePollAlarm'))}`,worker);
chrome.runtime.sendMessage=msg=>{worker.msg=msg;return vm.runInContext("handleSavedCueMutation(msg,{id:'fixture',url:'https://www.youtube.com/watch?v=fixture',tab:{id:1}})",worker)};
function content() {
  const ctx=vm.createContext({chrome,console,structuredClone,performance,Normalize,HardsubSentenceGroups:Groups,disk});
  vm.runInContext(`
let cues=[],currentSource='youtube',currentVideoId='fixture',navigateGen=1,transcriptMeta={owned:true,rev:2,deviceId:'fixture',tombstones:[]},
captionMode='enhanced',sentenceSourceKey='',sentenceProjection=null,sentenceProjectionCues=null,enhancedCues=[],sentenceTranslations={},sentenceTokens={},
sentenceUndoIds=new Set(),sentenceUndoRevisions={},sentenceStateLoadedKey='',sentenceStateLoadedGen=-1,sentenceStateLoad=null,
sentenceBenchmark=null,sentenceRawTrack=null,sentenceRestorePending=false,listDirty=true,currentMediaTime=0,savedCues={},settings={sourceLang:'ja'},scriptSource={};
const CACHE_MATCH_TOL=.6,tabPrefix=()=>'',metaStorageKey=id=>'transcriptMeta:'+id,loadDiskMeta=async()=>null,
bridgeFetch=async()=>({ok:false}),saveTranscriptToDisk=async payload=>disk.push(structuredClone(payload)),toast=()=>{};
${slice('  function detectCuesLanguage(', '  function stampSecondaryStatus(')}
${slice('  function compactSource(', '  /** Shared namespace')}
${slice('  function mergeCacheLists(', '  function scheduleSaveTranscript(')}
${slice('  function cueId(', '  /** Ask the SW whether Drive')}
${slice('  let sortedCuesCache =', '  /**\n   * Token enrich via /tokenize_batch')}
${slice('  let transcriptWritePending', '  function cueId')}
`,ctx);
  return {ctx,run:s=>vm.runInContext(s,ctx)};
}
const normalized=Normalize.dropAndStripSfx(Parser.parseJson3Cues({events:[{tStartMs:1000,dDurationMs:2000,segs:[
  {utf8:'晴れ[笑]',tOffsetMs:0},{utf8:'雨',tOffsetMs:1000,isSpeakerChange:true},
]}]},{includeSource:true}),{includeSource:true})[0];
const mapped={id:'mapped',source:normalized.text,start_media_time:normalized.start,end_media_time:normalized.end,
  text_source:'yt',tokens:[],rawSource:normalized.rawSource,normalization:normalized.normalization};
let failures=0;
function check(label,fn) {try{fn();console.log('PASS:',label)}catch(e){failures++;console.error('FAIL:',label,'\n'+e.message)}}
const plain=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const writer=content();writer.ctx.input=[mapped];writer.run('cues=structuredClone(input)');
  await writer.run('loadSentenceState()');
  const before=writer.run('sentenceProjection');
  assert.equal(before.displayUnits.length,2,'fixture has real speaker split');
  writer.ctx.fixtureGroup=before.groups[0];
  writer.run("sentenceTranslations[fixtureGroup.id]={revision:fixtureGroup.revision,vi:'Bản dịch kiểm thử',en:'Fixture translation'}");
  await writer.run('saveTranscript({force:true})');
  assert(!('rawSource' in stored['transcript:fixture'][0]),'legacy primary schema must stay unchanged');
  assert.equal(stored['sentenceState:v1:youtube:fixture:ja'].sourceCues[0].rawSource.text,'晴れ[笑]雨');
  const reader=content();const loaded=await reader.run("loadCachedCues('fixture')");
  assert(loaded[0].rawSource,'actual loader attaches sidecar');
  reader.ctx.loaded=loaded;
  reader.run('cues=cuesFromSavedScript(loaded)');await reader.run('loadSentenceState()');
  const after=reader.run('sentenceProjection');
  check('fresh VM saved conversion preserves raw source and normalization',()=>{
    const restored=plain(reader.run('cues[0]'));assert.deepEqual(restored.rawSource,mapped.rawSource);assert.deepEqual(restored.normalization,mapped.normalization);
  });
  check('fresh VM retains speaker split, sourceRefs and group identities',()=>assert.deepEqual(plain(after),plain(before)));
  check('fresh VM retains exact cue revision',()=>assert.equal(reader.run('sentenceCueRevision(cues[0])'),writer.run('sentenceCueRevision(cues[0])')));
  check('fresh VM accepts same-revision sidecar translation',()=>assert.equal(reader.run('sentenceTranslations[fixtureGroup.id]?.vi'.replace('fixtureGroup.id',JSON.stringify(before.groups[0].id))),'Bản dịch kiểm thử'));
  check('in-memory cache merge preserves full metadata',()=>{
    const merged=plain(reader.run('mergeCacheLists(loaded)'))[0];assert.deepEqual(merged.rawSource,mapped.rawSource);assert.deepEqual(merged.normalization,mapped.normalization);
  });
  reader.ctx.zero={id:'zero',source:'点。',start_media_time:1.234,end_media_time:1.234,text_source:'manual',mt_locked:true};
  check('saved zero-duration clock stays exact',()=>assert.equal(reader.run('cuesFromSavedScript([zero])[0].end_media_time'),1.234));
  check('fresh zero-duration at origin stays exact',()=>assert.equal(reader.run("mergeCache([{text:'点。',start:0,end:0}],[],{owned:false})[0].end_media_time"),0));
  for(const value of [undefined,null,'',false]) {
    reader.ctx.missing=value;
    check('missing/invalid end retains fallback: '+String(value),()=>{
      assert.equal(reader.run("cuesFromSavedScript([{source:'点。',start_media_time:0,end_media_time:missing}])[0].end_media_time"),2);
      assert.equal(reader.run("mergeCache([{text:'点。',start:0,end:missing}],[],{owned:false})[0].end_media_time"),2);
    });
  }
  for(const start of [0,1.234]) for(const value of [undefined,null,'',false]) {
    reader.ctx.row={source:'点。',start_media_time:start,end_media_time:value};
    check('full flatten-to-saved missing end fallback '+start+'/'+String(value),()=>
      assert.equal(reader.run('cuesFromSavedScript(flattenCached([row]))[0].end_media_time'),start+2));
  }
  reader.ctx.many=Array.from({length:140000},(_,i)=>({id:'segment-'+i,source:'点。',start_media_time:i,end_media_time:i+1}));
  check('legacy segments do not impose a spread-argument ceiling',()=>assert.equal(reader.run('flattenCached([{segments:many}]).length'),140000));
  reader.ctx.segment={id:'locked-segment',source:'雨。',start_media_time:1,end_media_time:2,text_source:'edit',mt_locked:true,translation_source:'user',vi:''};
  check('legacy segments preserve ID, ownership, locked blank and target provenance',()=>{
    const got=plain(reader.run('flattenCached([{segments:[segment]}])[0]'));
    for(const field of ['id','text_source','mt_locked','translation_source','vi']) assert.equal(got[field],reader.ctx.segment[field],field);
    assert.equal(reader.run('mergeCache([],flattenCached([{segments:[segment]}]),{})[0].mt_locked'),true);
  });
  const edits=[c=>c.source+='変',c=>c.start_media_time+=.001,c=>c.rawSource.end+=.001,
    c=>c.normalization.spans[0].rawStart++,c=>c.normalization.offsetUnit='codepoint',
    c=>c.rawSource.segmentAnchors=[null],c=>c.rawSource.segmentAnchors[0].charEnd=999,
    ...['edit','manual','script','import'].map(kind=>c=>c.text_source=kind)];
  for(const edit of edits){const bad=structuredClone(mapped);edit(bad);reader.ctx.bad=bad;
    check('invalid/owned mapping is discarded: '+edit.toString(),()=>{
      assert.equal(reader.run('flattenCached([bad])[0].rawSource'),undefined);
      assert.equal(reader.run('cuesFromSavedScript([bad])[0].rawSource'),undefined);
    });
  }
  reader.ctx.locked={...mapped,mt_locked:true,translation_source:'user',vi:''};
  check('translation-only lock keeps source mapping and protects blank target',()=>{
    const got=reader.run('cuesFromSavedScript([locked])[0]');assert.deepEqual(plain(got.rawSource),mapped.rawSource);assert.equal(got.mt_locked,true);assert.equal(got.vi,'');
  });
  reader.ctx.meta={owned:true,tombstones:[reader.run('tombstoneKey(loaded[0])')]};
  check('tombstone still removes mapped cue',()=>assert.equal(reader.run('cuesFromSavedScript(loaded,meta).length'),0));
  writer.run('sentenceUndoRevisions.mapped=sentenceCueRevision(cues[0])');
  await writer.run('saveTranscript({force:true})');
  const undoReader=content();undoReader.ctx.loaded=await undoReader.run("loadCachedCues('fixture')");
  undoReader.run('cues=cuesFromSavedScript(loaded)');await undoReader.run('loadSentenceState()');
  check('fresh VM accepts exact revision-bound Undo',()=>assert.equal(undoReader.run("sentenceUndoIds.has('mapped')"),true));
  reader.run('Normalize={normalizeCues:cs=>cs}');
  check('unavailable mapping normalizer safely falls back to original cue',()=>assert.equal(reader.run('flattenCached(loaded)[0].rawSource'),undefined));
  assert.equal(failures,0,failures+' source restore failures');
})().catch(e=>{console.error(e);process.exitCode=1});
