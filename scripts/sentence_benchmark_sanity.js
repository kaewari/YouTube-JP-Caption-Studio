/** Behavioral checks for conservative onset observations; no real playback claim. */
const assert=require('node:assert/strict');
const {createTrace}=require('../extension/shared/sentence_benchmark.js');
const fs=require('node:fs'),vm=require('node:vm');
const production=fs.readFileSync(require.resolve('../extension/content/content.js'),'utf8');
function seekingCheck() {
  const trace=createTrace({traceId:'seeking'}),video={currentTime:.9,playbackRate:1,paused:false,seeking:false};
  let now=1000;
  const context=vm.createContext({Number,performance:{now:()=>now},sentenceBenchmark:trace,document:{hidden:false},
    captionMode:'original',settings:{},currentMediaTime:0,activeCueId:'',findVideo:()=>video,
    findActiveCue:()=>null,getSortedCues:()=>[{id:'seek',source:'字幕',vi:'Phụ đề',start_media_time:1}]});
  vm.runInContext(production.slice(production.indexOf('  function syncCueAtMediaTime'),production.indexOf('  async function tick')),context);
  vm.runInContext('syncCueAtMediaTime(.9)',context);
  video.seeking=true;video.currentTime=1.1;now=1100;vm.runInContext('syncCueAtMediaTime(1.1)',context);
  assert.equal(trace.snapshot().events.filter(e=>e.type==='onset').length,0,'timeupdate while seeking must not count as continuous playback');
  console.log('PASS: actual content sync excludes seeking onset');
}
function mixedClockCheck() {
  const trace=createTrace({traceId:'mixed-clock'}),video={currentTime:.99,playbackRate:1,paused:false,seeking:false};
  let now=1000;
  const context=vm.createContext({Number,performance:{now:()=>now},sentenceBenchmark:trace,document:{hidden:false},
    captionMode:'original',settings:{},currentMediaTime:0,activeCueId:'',findVideo:()=>video,
    findActiveCue:()=>null,getSortedCues:()=>[{id:'one-onset',source:'字幕',start_media_time:1}]});
  vm.runInContext(production.slice(production.indexOf('  function syncCueAtMediaTime'),production.indexOf('  async function tick')),context);
  // Interleave decoded presentation timestamps with timeupdate/tick currentTime.
  for(const [at,player,renderer] of [[1000,.99,.98],[1020,1.01,1.01],[1030,1.02,.99],[1040,1.03,1.03]]) {
    now=at;video.currentTime=player;context.input=renderer;vm.runInContext('syncCueAtMediaTime(input)',context);
    assert.equal(context.currentMediaTime,renderer,'renderer keeps its original presentation timestamp');
  }
  const events=trace.snapshot().events;
  assert.equal(events.filter(e=>e.type==='discontinuity').length,0,'one player clock must not jump backward when frame timestamps lag');
  assert.equal(events.filter(e=>e.type==='onset').length,1,'one real onset cannot count twice across artificial clock passes');
  console.log('PASS: production sync measures one player clock across interleaved frame/timeupdate/tick calls; one onset, no artificial discontinuity, renderer timestamps preserved');
}
function paintCheck() {
  for(const mutation of ['hidden','ja','overlay']) {
    const trace=createTrace({traceId:mutation}),frames=[];
    const context=vm.createContext({sentenceBenchmark:trace,settings:{showOnVideo:true},document:{hidden:false},
      performance:{now:()=>123},window:{innerHeight:800,innerWidth:1000},
      requestAnimationFrame:callback=>frames.push(callback),getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),
      bar:{isConnected:true,getBoundingClientRect:()=>({width:300,height:60,top:0,left:0,bottom:60,right:300})}});
    vm.runInContext(production.slice(production.indexOf('  function recordSentencePaint'),production.indexOf('  function updateBar')),context);
    vm.runInContext("recordSentencePaint(bar,{source:'字幕'})",context);
    if(mutation==='hidden') context.document.hidden=true;
    else if(mutation==='ja') context.settings.barShowJa=false;
    else context.settings.showOnVideo=false;
    frames.forEach(callback=>callback());
    assert.equal(trace.snapshot().ttfvMs,null,`RAF must recheck ${mutation}`);
  }
  console.log('PASS: actual paint observer rechecks hidden tab, Japanese and overlay settings inside RAF');
}
if(process.argv.includes('--clock-only')) { mixedClockCheck();process.exit(0); }
if(process.argv.includes('--seeking-only')) { seekingCheck();process.exit(0); }
if(process.argv.includes('--paint-only')) { paintCheck();process.exit(0); }
seekingCheck();paintCheck();mixedClockCheck();
const lifecycle=createTrace({traceId:'private-lifecycle'});
const secretGroup={id:'id-dialogue-secret',revision:'revision-context-secret',text:'caption-secret',sourceRefs:[{},{}],start:0,end:2};
lifecycle.groupsPrepared([secretGroup],10);lifecycle.groupsPrepared([secretGroup],20);
lifecycle.translationsQueued([{...secretGroup,language:'vi'}],false,'enhanced',30);
lifecycle.translationResult({...secretGroup,language:'vi',status:'ready',cached:true,text:'translation-secret'},true,'enhanced',40);
lifecycle.translationResult({...secretGroup,revision:'new-context-secret',language:'en',status:'ready'},false,'enhanced',50);
lifecycle.translationResult({...secretGroup,language:'vi',status:'error',httpStatus:503,error:'error-secret'},true,'enhanced',60);
lifecycle.translationResult({...secretGroup,language:'vi',status:'cancelled'},false,'enhanced',70);
let lifecycleSnapshot=lifecycle.snapshot();
assert.equal(lifecycleSnapshot.events.filter(e=>e.type==='group_prepared').length,1);
assert.deepEqual(lifecycleSnapshot.events.map(e=>e.groupRef),[1,1,1,2,1,1]);
assert.equal(lifecycleSnapshot.events.find(e=>e.type==='translation_ready').cached,true);
assert.equal(lifecycleSnapshot.requestCount,0,'cache lifecycle must not invent an HTTP attempt');
assert.equal(lifecycleSnapshot.status,'NOT VERIFIED','lifecycle alone cannot prove observed onset readiness');
assert.ok(!JSON.stringify(lifecycleSnapshot).includes('secret'),'actual export omits identity/source/context/error text');
const bounded=createTrace({traceId:'bounded-lifecycle'});
bounded.groupsPrepared([{...secretGroup,id:'x'.repeat(2*1024*1024)}],1);
assert.equal(bounded.snapshot().events.length,0);assert.equal(bounded.snapshot().droppedEvents,1);
for(let i=0;i<10002;i++) bounded.groupsPrepared([{...secretGroup,id:String(i)}],i+2);
assert.equal(bounded.snapshot().events.length,10000);assert.ok(bounded.snapshot().droppedEvents>=3);
console.log('PASS: lifecycle uses private revision ordinals, dedups prepared groups, distinguishes accepted/cache/discard/error/cancel; identity/event caps stay unverified without caption/key export');
const trace=createTrace({traceId:'fixture'});
assert.equal(trace.snapshot().status,'NOT VERIFIED');assert.equal(trace.snapshot().requestLatencyMs.p50,null);
trace.trackLoaded(100);trace.paint(120,{width:300,height:50});
const unit={id:'a',source:'どこ?',start_media_time:1,vi:'Đi đâu?'};
const sample=(time,now,units=[unit],more={})=>trace.sample({time,rate:1,paused:false,hidden:false,mode:'enhanced',languages:['vi','en'],units,...more},now);
trace.prepared([unit],500);sample(.9,1000);sample(1.1,1200);
let row=trace.snapshot().readiness['enhanced:cold:vi'];assert.deepEqual(row,{total:1,ready:1,uncertain:0,missing:0,lowerBound:1,upperBound:1});
assert.equal(trace.snapshot().readiness['enhanced:cold:en'].missing,1);
trace.resetPlayback(2000,'seek');sample(.9,2200,[]);sample(1.1,2400,[{...unit,id:'late'}]);
assert.equal(trace.snapshot().readiness['enhanced:cold:ja'].uncertain,1,'new revision prepared inside onset window is uncertain');
trace.resetPlayback(3000,'seek');sample(.9,3200);sample(1.1,4200);
assert.equal(trace.snapshot().events.filter(e=>e.type==='onset').length,2,'long gap cannot be inferred successful');
trace.resetPlayback(5000,'seek');sample(.9,6000);sample(1.1,6200);
assert.equal(trace.snapshot().readiness['enhanced:warm:vi'].ready,1);
trace.request({id:'one',attempts:[{status:429,elapsedMs:20},{status:200,elapsedMs:40}]},6300);
trace.request({id:'one',attempts:[{status:200,elapsedMs:40}]},6400);
assert.equal(trace.snapshot().requestCount,2);assert.deepEqual(trace.snapshot().requestLatencyMs,{p50:20,p95:40});
assert.equal(trace.snapshot().ttfvMs,120);assert.equal(trace.snapshot().apiCost,null);
trace.resetPlayback(7000,'seek');sample(.9,7100,[{...unit,vi:''}]);sample(1.1,7300,[{...unit,vi:''}]);
assert.equal(trace.snapshot().readiness['enhanced:warm:vi'].missing,1,'cleared target must not inherit old readiness');
const count=trace.snapshot().events.filter(e=>e.type==='onset').length;
sample(.9,7400,[unit],{paused:true});sample(1.1,7600,[unit],{paused:true});
sample(.9,7700,[unit],{hidden:true});sample(1.1,7900,[unit],{hidden:true});
assert.equal(trace.snapshot().events.filter(e=>e.type==='onset').length,count);
console.log('PASS: empty metrics remain NOT VERIFIED; cold/warm onset bounds distinguish ready/missing/uncertain; seek/gaps excluded; real receipt IDs deduplicate HTTP attempts; no fabricated cost');
