/** Exercise production source digest and projection cache identity; no browser claim. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const source=fs.readFileSync(require.resolve('../extension/content/content.js'),'utf8');
const functions=source.slice(source.indexOf('  async function sentenceSourceFingerprint('),source.indexOf('  function sentenceStateStorageKey('));
const ctx=vm.createContext({crypto,TextEncoder});
vm.runInContext(functions,ctx);
ctx.key='youtube:fixture:ja';
ctx.raw=[{start:1,end:3,text:'どこ 行く?',rawText:'どこ\n行く?',segmentAnchors:[{charStart:0,charEnd:3,time:1}]}];
const digest=()=>vm.runInContext('sentenceSourceFingerprint(key,raw)',ctx);
(async()=>{
 const first=await digest();assert.match(first,/^[a-f0-9]{64}$/);
 ctx.raw[0].vi='mutable target';assert.equal(await digest(),first);
 ctx.raw[0].rawText='どこ 行く?';assert.notEqual(await digest(),first);
 ctx.raw[0].rawText='どこ\n行く?';ctx.raw[0].segmentAnchors[0].time=1.1;assert.notEqual(await digest(),first);
 ctx.raw[0].segmentAnchors[0].time=1;ctx.key='youtube:fixture:en';assert.notEqual(await digest(),first);
 ctx.key='youtube:fixture:ja';ctx.track={trackId:'a.ja',language:'ja',kind:'asr',format:'json3'};
 const selected=await vm.runInContext('sentenceSourceFingerprint(key,raw,track)',ctx);
 assert.notEqual(selected,first,'selected track identity must enter digest');
 ctx.track.trackId='b.ja';assert.notEqual(await vm.runInContext('sentenceSourceFingerprint(key,raw,track)',ctx),selected);
 ctx.track.trackId='a.ja';ctx.track.format='xml';assert.notEqual(await vm.runInContext('sentenceSourceFingerprint(key,raw,track)',ctx),selected);
 const G=require('../extension/shared/sentence_groups.js');
 const cues=[{id:'a',source:'どこ',start_media_time:1,end_media_time:2},{id:'b',source:'行く?',start_media_time:2,end_media_time:3}];
 const a=G.buildSentenceGroups(cues,{sourceKey:'fixture',sourceRevision:first});
 const b=G.buildSentenceGroups(cues,{sourceKey:'fixture',sourceRevision:selected});
 assert.notEqual(a.groups[0].id,b.groups[0].id);
 const {createTrace}=require('../extension/shared/sentence_benchmark.js');
 const exportBranch=source.slice(source.indexOf('    if (cmd === "export_benchmark")'),source.indexOf('    if (cmd === "restore_sentence_backup"'));
 let exported;
 const exportContext=vm.createContext({cmd:'export_benchmark',currentVideoId:'new-video',
  sentenceTrackKey:()=> 'youtube:new-video:ja',sentenceBenchmark:createTrace({traceId:'navigation-export'}),
  navigator:{connection:{effectiveType:'4g'}},sentenceRawTrack:{sourceKey:'youtube:old-video:ja',fingerprint:first},
  downloadCaptionFile:body=>{exported=JSON.parse(body);}});
 await vm.runInContext(`(async()=>{${exportBranch}})()`,exportContext);
 assert.equal(exported.context.fingerprint,null,'benchmark after navigation cannot export the previous video fingerprint');
 exportContext.sentenceRawTrack={sourceKey:'youtube:new-video:ja',fingerprint:selected};
 await vm.runInContext(`(async()=>{${exportBranch}})()`,exportContext);
 assert.equal(exported.context.fingerprint,selected,'current source fingerprint remains available');
 exportContext.sentenceRawTrack=null;
 await vm.runInContext(`(async()=>{${exportBranch}})()`,exportContext);
 assert.equal(exported.context.fingerprint,null,'missing raw source stays unknown');
 console.log('PASS: actual benchmark command excludes another video fingerprint, retains current source and exports null for missing raw source');
 console.log('PASS: SHA256 source fingerprint is stable across target edits, changes with raw text/anchors/source selection, and invalidates production group cache identity');
})().catch(e=>{console.error(e);process.exitCode=1});
