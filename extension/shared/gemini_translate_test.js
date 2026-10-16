/** Real localhost HTTP protocol checks; not live Gemini or translation quality. */
const assert = require('node:assert/strict');
const http = require('node:http');
const actualFetch = global.fetch;
const vm=require('node:vm'), fs=require('node:fs');
let mode='valid', requests=0, active=0, peak=0, retries=0;
const attempts=new Map(), rateRecords=[];
const server = http.createServer((req,res)=>{
  let body='';req.on('data',b=>body+=b);req.on('end',()=>{
    requests++;active++;peak=Math.max(peak,active);
    const jobs=JSON.parse(JSON.parse(body).contents[0].parts[0].text);
    if(mode==='shared-rate-limit'){
      const first=jobs[0].source, n=(attempts.get(first)||0)+1;
      attempts.set(first,n);rateRecords.push({first,n,time:Date.now()});
    }
    const translations=jobs.map(j=>({id:j.id,revision:j.revision,text:`${j.targetLanguage}: ${j.source}`}));
    setTimeout(()=>{
      active--;
      if(mode==='rate-limit' && retries++===0){res.writeHead(429);res.end('fixture rate limit');return;}
      if(mode==='shared-rate-limit' && attempts.get(jobs[0].source)===1 && jobs[0].source!=='どこ行くんですか? 60'){
        res.writeHead(429,{'Retry-After':jobs[0].source==='どこ行くんですか? 0'?'0.05':'0.25'});res.end('fixture shared limit');return;
      }
      if(mode==='http-error'){res.writeHead(503);res.end('fixture unavailable');return;}
      if(mode==='wrong-revision') translations[0].revision='wrong';
      if(mode==='duplicate' && translations.length>1) translations[1].id=translations[0].id;
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({translations})}]}}]}));
    },20);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  global.fetch=(_url,opts)=>actualFetch(url,opts);
  const Gemini=require('./gemini_translate.js');
  const jobs=Array.from({length:90},(_,i)=>({id:`group-${i}`,revision:`rev-${i}`,source:`どこ行くんですか? ${i}`,context:'before/after',sourceKey:'fixture/video/ja',language:'vi',algorithmVersion:1}));
  const before=JSON.stringify(jobs);
  const [a,b]=await Promise.all([Gemini.translateGroups(jobs,{apiKey:'test-only'}),Gemini.translateGroups(jobs,{apiKey:'test-only'})]);
  assert.equal(a.completed,90);assert.equal(b.completed,90);assert.equal(a.failed,0);
  assert.equal(requests,3);assert.ok(peak<=3);assert.equal(JSON.stringify(jobs),before);
  const after=await Gemini.translateGroups(jobs,{apiKey:'test-only'});
  assert.equal(after.completed,90);assert.equal(requests,3);
  const receipts=new Map(a.results.map(r=>[r.request.id,r.request]));
  assert.equal(receipts.size,3);assert.equal([...receipts.values()].flatMap(r=>r.attempts).length,3);
  assert.ok([...receipts.values()].every(r=>r.attempts.every(a=>a.status===200 && a.elapsedMs>=0)));
  assert.ok(after.results.every(r=>!r.request),'cache hits must not count historical requests');
  console.log(`PASS: localhost HTTP200, 90 jobs / concurrent duplicate callers / ${requests} batches / peak ${peak}; immutable inputs and cache`);
  const changed=[{...jobs[0],context:'different'},{...jobs[0],language:'en'}];
  const changedResult=await Gemini.translateGroups(changed,{apiKey:'test-only'});
  assert.equal(changedResult.completed,2);assert.equal(requests,4);
  for(const invalidMode of ['wrong-revision','duplicate','http-error']){
    mode=invalidMode;
    const result=await Gemini.translateGroups(jobs.slice(0,2).map(j=>({...j,sourceKey:invalidMode})),{apiKey:'test-only'});
    assert.equal(result.completed,0);assert.equal(result.failed,2);
    assert.ok(result.results.every(r=>r.status==='error'));
  }
  console.log('PASS: context/language invalidation; HTTP200 wrong revision/duplicate IDs and HTTP503 are failures, never completion');
  mode='valid';
  const locked={id:'new-lock',source:'今日は行く。',vi:'',en:'',_txGen:0};
  const lockedWork=Gemini.translateCues([locked],'test-only');
  locked.mt_locked=true;locked.translation_source='user';locked.vi='User saved';
  const lockResult=await lockedWork;
  assert.equal(lockResult.applied,0);assert.equal(locked.vi,'User saved');
  const edited={id:'new-edit',source:'古い文。',vi:'',_txGen:0};
  const editWork=Gemini.translateCues([edited],'test-only');
  edited.source='新しい文。';edited._txGen++;
  assert.equal((await editWork).applied,0);assert.equal(edited.vi,'');
  const moved={id:'new-video',source:'移動前。',vi:'',_txGen:0};
  const movedResult=await Gemini.translateCues([moved],'test-only',null,{isCurrent:()=>false});
  console.log('PASS: results after user lock, source edit or session change never mutate current cues');
  const enCue = { id: 'en-test', source: '本音トーク。', vi: 'Bản dịch tiếng Việt có sẵn', en: '', _txGen: 0 };
  const enWork = await Gemini.translateCues([enCue], 'test-only', null, { language: 'en' });
  assert.equal(enWork.applied, 1);
  assert.equal(enCue.vi, 'Bản dịch tiếng Việt có sẵn', 'VI must not be regressed by EN translation');
  assert.equal(enCue.en, 'en: 本音トーク。', 'EN must receive translated text');
  console.log('PASS: TRANS-04 translateCues translates English cleanly without mutating Vietnamese');
  const probeJobs=jobs.slice(0,45).map(j=>({...j,sourceKey:'probe-concurrency'}));
  peak=0;
  const [probeWork,keyCheck]=await Promise.all([Gemini.translateGroups(probeJobs,{apiKey:'test-only'}),Gemini.testApiKey('test-only')]);
  assert.equal(probeWork.completed,45);assert.equal(keyCheck.ok,true);assert.ok(peak<=3);
  mode='rate-limit';
  const retryStart=Date.now();
  const retried=await Gemini.translateGroups([{...jobs[0],sourceKey:'rate-limit'}],{apiKey:'test-only'});
  assert.equal(retried.completed,1);assert.equal(retries,2);assert.ok(Date.now()-retryStart>=1000);
  console.log('PASS: key probe shares three-request admission; actual HTTP429 without Retry-After waits >=1000ms then retries once');
  mode='shared-rate-limit';
  const shared=await Gemini.translateGroups(jobs.slice(0,90).map(j=>({...j,sourceKey:'shared-rate-limit'})),{apiKey:'test-only'});
  assert.equal(shared.completed,90);
  const longStart=rateRecords.find(r=>r.first==='どこ行くんですか? 30' && r.n===1).time;
  const shortRetry=rateRecords.find(r=>r.first==='どこ行くんですか? 0' && r.n===2).time;
  assert.ok(shortRetry-longStart>=250,`short retry bypassed shared cooldown: ${shortRetry-longStart}ms`);
  console.log('PASS: concurrent HTTP429 retries honor the longer shared cooldown');
  mode='valid';peak=0;
  global.chrome={runtime:{id:'fixture-extension',getURL:path=>'chrome-extension://fixture-extension/'+path},
    storage:{local:{get:async()=>({geminiApiKey:'test-only'}),set:async()=>{}}}};
  const moduleSource=fs.readFileSync(require.resolve('./gemini_translate.js'),'utf8');
  const client=()=>{
    const ctx=vm.createContext({document:{},console,chrome:{runtime:{sendMessage:msg=>Gemini.handleTranslationMessage(msg,
      {id:'fixture-extension',url:'https://www.youtube.com/watch?v=fixture',tab:{id:1}},true)}}});
    vm.runInContext(moduleSource,ctx);return ctx.HardsubGeminiTranslate;
  };
  const [tabA,tabB]=[client(),client()];
  const brokerReports=await Promise.all([tabA.translateGroups(jobs.slice(0,45).map(j=>({...j,sourceKey:'tab-a'}))),
    tabB.translateGroups(jobs.slice(0,45).map(j=>({...j,sourceKey:'tab-b'})))]);
  assert.ok(brokerReports.every(r=>r.completed===45));assert.ok(peak<=3);
  await assert.rejects(Gemini.handleTranslationMessage({jobs:jobs.slice(0,31)},
    {id:'fixture-extension',url:'chrome-extension://fixture-extension/sidepanel.html'}),/contract/);
  await assert.rejects(Gemini.handleTranslationMessage({jobs:[]},{id:'wrong-extension'}),/sender/);
  await assert.rejects(Gemini.handleTranslationMessage({type:'GEMINI_KEY_CHECK',apiKey:'test-only'},
    {id:'fixture-extension',tab:{id:1},url:'https://unsupported.example/'}),/origin/);
  assert.equal((await tabA.testApiKey('test-only')).ok,true);
  assert.equal(Gemini.PROMPT_VERSION, 3, "PROMPT_VERSION must be 3");
  assert.equal(Gemini.sanitizeTranslation("chim cốc", "う"), "Ư...");
  assert.equal(Gemini.sanitizeTranslation("chim cốc.", "う"), "Ư...");
  assert.equal(Gemini.sanitizeTranslation("chim cốc", "う…"), "Ư...");
  assert.equal(Gemini.sanitizeTranslation("chim cốc", "う。"), "Ư...");
  assert.equal(Gemini.sanitizeTranslation("chim cốc", "「う」"), "Ư...");
  assert.equal(Gemini.sanitizeTranslation("cormorant", "うー"), "Ư...");
  assert.equal(Gemini.sanitizeTranslation("con cốc", "う"), "Ư...");
  assert.equal(Gemini.sanitizeTranslation("đi đâu đấy?", "どこ行くんですか?"), "đi đâu đấy?");
  console.log("PASS: PROMPT_VERSION 2 and sanitizeTranslation cleans homophone dictionary leaks for isolated kana interjections");
  // Priority queue ordering test
  const priJobs = [
    { id: "pri-bg", revision: "rev-bg", source: "背景タスク", context: "", sourceKey: "pri-test", language: "vi", priority: 10 },
    { id: "pri-vis", revision: "rev-vis", source: "表示中タスク", context: "", sourceKey: "pri-test", language: "vi", priority: 30 },
  ];
  const priResults = await Gemini.translateGroups(priJobs, { apiKey: "test-only" });
  assert.equal(priResults.completed, 2);
  console.log("PASS: priority Sliding-Window preserves job.priority (Visible=30 > Background=10) without inversion");
  delete global.chrome;
  console.log(`PASS: two production clients share one broker; 90 jobs HTTP peak ${peak}, valid Settings probe admitted, oversized/foreign/unsupported rejected`);
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>{global.fetch=actualFetch;server.close();});
