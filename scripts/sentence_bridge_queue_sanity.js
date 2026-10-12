/** Actual worker handlers + isolated localhost HTTP; no production script-store writes. */
const fs=require('node:fs'),vm=require('node:vm'),http=require('node:http'),assert=require('node:assert/strict');
const source=fs.readFileSync(require.resolve('../extension/background/service_worker.js'),'utf8');
const writes=source.slice(source.indexOf('let savedStateWritePending'),source.indexOf('async function ensureBridgePollAlarm'));
const proxy=source.slice(source.indexOf('const BRIDGE_ALLOWLIST'),source.indexOf('async function handleYtFetch'));
const listener=source.slice(source.indexOf('chrome.runtime.onMessage.addListener((msg'),source.indexOf('  if (msg?.type === "YT_FETCH")'))+'});';
let requests=0,arrived,release,hang=false,responseStatus=200;
const server=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',async()=>{
 requests++;const data=JSON.parse(body);arrived?.();if(hang)return;
 if(release)await new Promise(resolve=>{release.resolve=resolve});
 res.writeHead(responseStatus,{'Content-Type':'application/json'});
 res.end(JSON.stringify(responseStatus===409?{detail:{error:'stale_revision',current_rev:100}}:{video_id:data.video_id,rev:data.rev}));
});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const storage={'transcriptMeta:fixture':{rev:2,owned:true,tombstones:[]}};let onMessage;
 const chrome={runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,onMessage:{addListener:fn=>{onMessage=fn}}},
 storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(storage[key])])),
 set:async patch=>Object.assign(storage,structuredClone(patch))}}};
 const ctx=vm.createContext({chrome,console,fetch,AbortSignal,TextEncoder,structuredClone});
 vm.runInContext(`const BRIDGE=${JSON.stringify('http://127.0.0.1:'+server.address().port)};const isSupportedUrl=url=>url.startsWith('https://www.youtube.com/');${writes}${proxy}${listener}`,ctx);
 const send=msg=>new Promise(resolve=>onMessage(msg,{id:'fixture',url:'https://www.youtube.com/watch?v=fixture',tab:{id:1}},resolve));
 release={};const seen=new Promise(resolve=>{arrived=resolve});
 const save=send({type:'BRIDGE_FETCH',path:'/scripts/save',method:'POST',body:{video_id:'fixture',rev:2,cues:[]}});await seen;arrived=null;
 const update=send({type:'SAVED_CUES_MUTATE',op:'save_meta',videoId:'fixture',meta:{rev:3,owned:true,tombstones:[]}});
 await Promise.resolve();assert.equal(storage['transcriptMeta:fixture'].rev,2);
 release.resolve();release=null;const result=await save;await update;
 assert.equal(result.status,200);assert.equal(result.data.rev,2);assert.equal(storage['transcriptMeta:fixture'].rev,3);
 const before=requests;const stale=await send({type:'BRIDGE_FETCH',path:'/scripts/save',method:'POST',body:{video_id:'fixture',rev:2,cues:[]}});
 assert.equal(stale.skipped,'stale_revision');assert.equal(requests,before);
 console.log('PASS: actual HTTP200 parsed before shared revision commit; stale bridge save blocked before network dispatch');
 const contentSource=fs.readFileSync(require.resolve('../extension/content/content.js'),'utf8');
 const saveFunction=contentSource.slice(contentSource.indexOf('  async function saveTranscriptToDisk('),contentSource.indexOf('  let transcriptWritePending'));
 const uploads=[],notices=[];
 const content=vm.createContext({console,notices,location:{href:'https://www.youtube.com/watch?v=fixture'},
 chrome:{runtime:{sendMessage:async msg=>uploads.push(msg)}},
 bridgeFetch:(path,opts)=>send({type:'BRIDGE_FETCH',path,...opts})});
 vm.runInContext(`let currentVideoId='fixture',navigateGen=1,transcriptMeta={owned:true,rev:3};
 const pageTitle=()=>'',saveTranscriptMeta=async()=>{},toast=message=>notices.push(message);${saveFunction}`,content);
 responseStatus=409;
 await vm.runInContext("saveTranscriptToDisk([{id:'local-edit',source:'編集'}])",content);
 assert.equal(uploads.length,0,'HTTP409 must not schedule Drive upload');
 assert.equal(vm.runInContext('transcriptMeta.rev',content),3,'conflict must not adopt current_rev over local edits');
 assert.equal(notices.length,1,'current-tab conflict must be visible');
 responseStatus=500;
 await vm.runInContext("saveTranscriptToDisk([{id:'local-edit',source:'編集'}])",content);
 assert.equal(uploads.length,0,'failed HTTP save must not schedule Drive upload');
 responseStatus=200;
 await vm.runInContext("saveTranscriptToDisk([{id:'local-edit',source:'編集'}])",content);
 assert.equal(uploads.length,1);assert.equal(uploads[0].type,'DRIVE_UPLOAD_SCHEDULE');
 const skippedBefore=requests;storage['transcriptMeta:fixture'].rev=4;
 await vm.runInContext("saveTranscriptToDisk([{id:'local-edit',source:'編集'}])",content);
 assert.equal(requests,skippedBefore);assert.equal(uploads.length,1);assert.equal(notices.length,2);
 storage['transcriptMeta:fixture'].rev=3;
 console.log('PASS: production disk-save function handles actual HTTP409/500 and worker stale rejection without Drive scheduling/revision changes; current-tab conflicts notify; HTTP200 still schedules upload (no native UI proof)');
 hang=true;const blocked=send({type:'BRIDGE_FETCH',path:'/scripts/save',method:'POST',body:{video_id:'fixture',rev:3,cues:[]}});
 const next=send({type:'SAVED_CUES_MUTATE',op:'toggle',id:'later',cue:{id:'later',videoId:'other',source:'saved'}});
 let deadline;
 const failure=await Promise.race([blocked,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('bridge save never released shared queue')),22000)})]);
 clearTimeout(deadline);
 assert.equal(failure.ok,false);await next;assert.equal(storage.savedCues.later.source,'saved');
 console.log('PASS: hanging HTTP save deadline releases shared worker queue; following star commits');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{server.closeAllConnections();server.close();});
