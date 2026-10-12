/** Production broker in fresh worker contexts; isolated storage and real localhost HTTP. */
const fs=require('node:fs'),vm=require('node:vm'),http=require('node:http'),assert=require('node:assert/strict');
const moduleSource=fs.readFileSync(require.resolve('../extension/shared/gemini_translate.js'),'utf8');
let mode='valid',requests=0,dateUntil=0,attemptTimes=[],attempts=0,held=[],holdBudget=0,sentSources=[];
const server=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{
 requests++;attemptTimes.push(Date.now());const jobs=JSON.parse(JSON.parse(body).contents[0].parts[0].text);
 sentSources.push(...jobs.map(j=>j.source));
 const respond=()=>{
 if(mode==='date' && attempts++===0){dateUntil=Math.ceil((Date.now()+2500)/1000)*1000;res.writeHead(429,{'Retry-After':new Date(dateUntil).toUTCString()});res.end('date limit');return;}
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({translations:jobs.map(j=>({id:j.id,revision:j.revision,text:'vi: '+j.source}))})}]}}]}));
 };
 if(holdBudget>0){holdBudget--;held.push(respond);}else respond();
});});
function worker(storage){
 const chrome={runtime:{id:'fixture-extension',getURL:path=>'chrome-extension://fixture-extension/'+path},storage:{local:{get:async keys=>keys===null?structuredClone(storage):Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(storage[key])])),
 set:async patch=>Object.assign(storage,structuredClone(patch)),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete storage[key]}}}};
 const ctx=vm.createContext({console,chrome,crypto,TextEncoder,AbortSignal,setTimeout,clearTimeout,queueMicrotask,
 fetch:(_url,opts)=>fetch('http://127.0.0.1:'+server.address().port,opts)});
 vm.runInContext(moduleSource,ctx);return ctx.HardsubGeminiTranslate;
}
const jobs=count=>Array.from({length:count},(_,i)=>({id:'g-'+i,revision:'r-'+i,source:'晴れ。'+i,sourceKey:'bounded/ja',language:'vi'}));
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 if(process.argv.includes('--cache-contract')){
  const storage={geminiApiKey:'test-only'};const job=jobs(1);
  await worker(storage).translateGroups(job);
  for(const [field,value] of [['id','wrong-group'],['status','error']]){
   const entry=Object.values(storage['sentenceMtCache:v1'])[0];entry[field]=value;
   const before=requests;const result=await worker(storage).translateGroups(job);
   assert.equal(result.results[0].id,job[0].id,'corrupt cached ID must be rejected and recomputed');
   assert.equal(result.results[0].status,'ready','corrupt cached status must be rejected and recomputed');
   assert.equal(requests,before+1,'corrupt cached contract must trigger HTTP');
  }
  console.log('PASS: persisted wrong ID/status are rejected after worker restart and recomputed over real HTTP');return;
 }
 if(process.argv.includes('--epoch-race')){
  const broker=worker({geminiApiKey:'test-only'});holdBudget=3;
  const busy=broker.translateGroups(jobs(45));
  while(held.length<3)await new Promise(resolve=>setTimeout(resolve,5));
  const sender={id:'fixture-extension',url:'https://www.youtube.com/watch?v=fixture',tab:{id:1},documentId:'doc-1'};
  const common={scope:'automatic',epoch:1,clientId:'client'};
  const fresh=broker.handleTranslationMessage({...common,type:'GEMINI_TRANSLATE_GROUPS',jobs:[{...jobs(1)[0],id:'fresh'}]},sender,true);
  await new Promise(resolve=>setTimeout(resolve,20));
  const cancellation=await broker.handleTranslationMessage({...common,type:'GEMINI_TRANSLATE_CANCEL'},sender,true);
  const responses=held;held=[];responses.forEach(respond=>respond());
  await busy;const result=await fresh;
  assert.equal(result.results[0].status,'ready','new epoch work dispatched ahead of delayed cancellation must survive');
  assert.equal(cancellation.cancelled,0);assert.equal(requests,4);
  console.log('PASS: queued current-epoch interest survives delayed same-epoch cancel through production worker transport');return;
 }
 if(process.argv.includes('--cancel-only')){
  const broker=worker({});holdBudget=3;
  const a=broker.translateGroups(jobs(90),{apiKey:'test-only',owner:'tab-a'});
  const b=broker.translateGroups(jobs(60),{apiKey:'test-only',owner:'tab-b'});
  while(held.length<3)await new Promise(resolve=>setTimeout(resolve,5));
  try{await broker.cancelPending('tab-a');}catch(_){}
  const responses=held;held=[];responses.forEach(respond=>respond());
  const [ra,rb]=await Promise.all([a,b]);
  assert.equal(rb.completed,60);assert.equal(requests,4,'cancel must drop queued owner-only jobs while retaining sibling interest');
  assert.equal(ra.results.filter(r=>r.status==='cancelled').length,30);
  assert.ok(sentSources.every(s=>Number(s.slice(3))<60));
  console.log('PASS: cancelled queued owner-only jobs never reach HTTP; sibling dedup interest survives, in-flight45 retain cacheable results');
  return;
 }
 if(process.argv.includes('--transport-only')){
  const broker=worker({geminiApiKey:'test-only'});holdBudget=3;
  const client=tab=>{
   const sender={id:'fixture-extension',url:'https://www.youtube.com/watch?v=fixture',tab:{id:tab},documentId:'doc-'+tab};
   const ctx=vm.createContext({document:{},console,chrome:{runtime:{sendMessage:msg=>broker.handleTranslationMessage(msg,sender,true)}}});
   vm.runInContext(moduleSource,ctx);return ctx.HardsubGeminiTranslate;
  };
  const [a,b]=[client(1),client(2)];
  const wa=a.translateGroups(jobs(90));const wb=b.translateGroups(jobs(60));
  const manual=a.translateGroups(jobs(90).slice(75),{scope:'manual'});
  while(held.length<3)await new Promise(resolve=>setTimeout(resolve,5));
  await a.cancelPending();
  const responses=held;held=[];responses.forEach(respond=>respond());
  const [ra,rb,rm]=await Promise.all([wa,wb,manual]);
  assert.equal(rb.completed,60);assert.equal(rm.completed,15);assert.equal(requests,5);
  assert.ok(ra.results.filter(r=>r.status==='cancelled').length>=15);
  assert.ok(sentSources.every(s=>Number(s.slice(3))<60||Number(s.slice(3))>=75));
  await assert.rejects(broker.handleTranslationMessage({type:'GEMINI_TRANSLATE_CANCEL'},
   {id:'foreign',url:'https://www.youtube.com/'},true),/sender/);
  console.log('PASS: two production clients→worker cancel message preserves sibling and explicit manual scope; owner-only15 never dispatch, foreign cancel rejected');
  return;
 }
 const storage={geminiApiKey:'test-only',unrelated:{preserve:true}};let broker=worker(storage);
 const report=await broker.translateGroups(jobs(530),{apiKey:'test-only'});assert.equal(report.completed,530);
 const legacyCount=Object.keys(storage).filter(key=>key.startsWith('sentenceMt:v1:')).length;
 const cache=storage['sentenceMtCache:v1']||{};
 assert.ok(legacyCount+Object.keys(cache).length<=512,`persistent sentence cache count ${legacyCount+Object.keys(cache).length} exceeds512`);
 assert.ok(Buffer.byteLength(JSON.stringify(cache))<=4*1024*1024);assert.deepEqual(storage.unrelated,{preserve:true});assert.equal(storage.geminiApiKey,'test-only');
 broker=worker(storage);const before=requests;const warm=await broker.translateGroups(jobs(530).slice(-15),{apiKey:'test-only'});
 assert.equal(warm.completed,15);assert.equal(requests,before,'worker restart must read persistent cache without HTTP');
 await broker.translateGroups(jobs(1),{apiKey:'test-only'});assert.equal(requests,before+1,'FIFO eviction must allow recomputation');
 console.log('PASS: 530 translations bounded persistent cache to512 /4MiB; worker restart warm hit uses0HTTP, eviction recomputes and unrelated storage survives');
 const legacy={geminiApiKey:'test-only',savedCues:{keep:{source:'preserve'}}};
 Object.assign(legacy,storage['sentenceMtCache:v1']);
 broker=worker(legacy);const migrationBefore=requests;
 await broker.translateGroups(jobs(530).slice(-15),{apiKey:'test-only'});
 assert.equal(requests,migrationBefore);assert.equal(Object.keys(legacy).filter(k=>k.startsWith('sentenceMt:v1:')).length,0);
 assert.deepEqual(legacy.savedCues,{keep:{source:'preserve'}});
 const heavy=jobs(30).map((job,i)=>({...job,id:'large-'+i+'x'.repeat(90000),revision:'large-'+i+'y'.repeat(90000),sourceKey:'byte-limit'}));
 const heavyReport=await broker.translateGroups(heavy,{apiKey:'test-only',force:true});assert.equal(heavyReport.completed,30);
 assert.ok(Buffer.byteLength(JSON.stringify(legacy['sentenceMtCache:v1']))<=4*1024*1024);
 assert.ok(Object.keys(legacy['sentenceMtCache:v1']).length<512,'byte limit must evict before entry limit for large revisions');
 console.log('PASS: legacy SHA entries migrate without HTTP/loss of saved data;30 large revisions force byte-limit eviction below512');
 mode='date';attempts=0;attemptTimes=[];broker=worker({});
 await broker.translateGroups([{...jobs(1)[0],sourceKey:'date'}],{apiKey:'test-only'});
 assert.ok(attemptTimes[1]>=dateUntil,'HTTP-date Retry-After retry must wait until server timestamp');
 console.log('PASS: real HTTP429 date header delays retry until advertised UTC timestamp');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{server.closeAllConnections();server.close();});
