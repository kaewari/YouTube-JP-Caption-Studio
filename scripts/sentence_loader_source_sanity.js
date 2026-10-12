/** Execute production worker parse adapters; fixtures are not live YouTube proof. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const Parse = require('../extension/shared/timedtext_parse.js');
const Normalize = require('../extension/content/normalize_cues.js');
const worker = fs.readFileSync(require.resolve('../extension/background/service_worker.js'), 'utf8');
const adapters = worker.slice(worker.indexOf('const decodeEntities ='), worker.indexOf('function dataUrlToBlob'));
const ctx = vm.createContext({HardsubTimedtextParse:Parse});
vm.runInContext(adapters,ctx);
ctx.body=JSON.stringify({events:[{tStartMs:1000,dDurationMs:5000,segs:[
  {utf8:' 😀\nどこ'}, {utf8:'行くんですか?',tOffsetMs:1500,isSpeakerChange:true}]}]});
const cues = vm.runInContext('parseTimedtextBody(body)',ctx);
const page=fs.readFileSync(require.resolve('../extension/injected/page_capture.js'),'utf8');
const pageCtx=vm.createContext({state:{captions:{}}});
vm.runInContext(page.slice(page.indexOf('  function okCaptionResult('),page.indexOf('  async function loadCaptions(')),pageCtx);
pageCtx.cues=cues;
assert.equal(vm.runInContext("okCaptionResult(cues,{languageCode:'ja'}).cues[0].segmentAnchors.length",pageCtx),2,'page LOAD_CAPTIONS result must retain parser anchors');
assert.deepEqual(Parse.sourceTrackInfo({vssId:'a.ja',languageCode:'ja',kind:'asr',baseUrl:'secret-signed-url'},ctx.body),
 {trackId:'a.ja',language:'ja',kind:'asr',format:'json3'});
assert.deepEqual(Parse.sourceTrackInfo(null,'<transcript/>'),{trackId:null,language:null,kind:null,format:'xml'});
assert.equal(cues[0].rawText,' 😀\nどこ行くんですか?','worker loading must retain original source before normalization');
assert.deepEqual(JSON.parse(JSON.stringify(cues[0].segmentAnchors)),[
  {charStart:0,charEnd:6,time:1,speakerChange:false},
  {charStart:6,charEnd:13,time:2.5,speakerChange:true},
]);
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('parseJson3(JSON.parse(body))',ctx))),JSON.parse(JSON.stringify(cues)));
const mapped=Normalize.normalizeCues(cues,{includeSource:true})[0];
assert.equal(mapped.rawSource.sourceDomain,'json3-text');assert.equal(mapped.rawSource.segmentAnchors.length,2);
ctx.body='<transcript><text start="1" dur="2">どこ</text></transcript>';
assert.equal(vm.runInContext('parseTimedtextBody(body)[0].text',ctx),'どこ');
assert.equal(vm.runInContext('parseTimedtextBody(body)[0].segmentAnchors',ctx),undefined,'XML without word anchors must not invent them');
console.log('PASS: actual worker JSON3/body adapters retain raw text and segment/speaker anchors through normalize; XML fallback invents no anchors');
const http=require('node:http');
(async()=>{
 vm.runInContext(page.slice(page.indexOf('  async function loadCaptions('),page.indexOf('  /** Read-only: never call tryEnablePlayerCaptions')),pageCtx);
 vm.runInContext("state.captions.videoId='fixture';okCaptionResult(cues,{languageCode:'ja'},{sourceTrack:{trackId:'a.ja',language:'ja',kind:'asr',format:'json3'}})",pageCtx);
 const cached=await vm.runInContext("loadCaptions({videoId:'fixture',lang:'ja'})",pageCtx);
 assert.equal(cached.sourceTrack?.trackId,'a.ja','cached page result must keep selected track identity');
 assert.equal(cached.cues[0].segmentAnchors?.length,2,'cached page result must retain raw anchors');
 let response=ctx.body,status=200,dispatch=0;
 const server=http.createServer((req,res)=>{dispatch++;res.writeHead(status);res.end(response)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const base=`http://127.0.0.1:${server.address().port}`;
  const network=vm.createContext({HardsubTimedtextParse:Parse,URL,
   fetch:(url,opts)=>fetch(base+new URL(url).pathname+new URL(url).search,opts)});
  vm.runInContext(worker.slice(worker.indexOf('function normalizeTimedtextUrl('),worker.indexOf('/** Cookie header')),network);
  vm.runInContext(worker.slice(worker.indexOf('const LANG_FAMILY_ALIASES'),worker.indexOf('function sortTracks(')),network);
  vm.runInContext(worker.slice(worker.indexOf('async function fetchBestLangPack('),worker.indexOf('function dataUrlToBlob(')),network);
  network.candidates=[{url:'https://www.youtube.com/api/timedtext?v=fixture&lang=ja',lang:'ja',asr:true,via:'android',
   track:{vssId:'a.ja',languageCode:'ja',kind:'asr',baseUrl:'signed-secret'}}];
  let pack=await vm.runInContext("fetchBestLangPack(candidates,'ja',{})",network);
  assert.deepEqual(JSON.parse(JSON.stringify(pack.sourceTrack)),{trackId:'a.ja',language:'ja',kind:'asr',format:'xml'});
  response=JSON.stringify({events:[{tStartMs:1000,dDurationMs:2000,segs:[{utf8:'字幕',tOffsetMs:0}]}]});
  pack=await vm.runInContext("fetchBestLangPack(candidates,'ja',{})",network);
  assert.equal(pack.sourceTrack.format,'json3');assert.equal(pack.cues[0].segmentAnchors[0].time,1);
  assert.equal(JSON.stringify(pack.sourceTrack).includes('signed-secret'),false);
  const pageNetwork=vm.createContext({HardsubTimedtextParse:Parse,URL,
   fetch:network.fetch,parseTimedtextBody:body=>Parse.parseTimedtextBody(body,{includeSource:true}),
   state:{captions:{},timedtext:{url:'https://www.youtube.com/api/timedtext?v=fixture&lang=ja',videoId:'fixture',body:'',cues:[]}},
   netflixState:{},ccTriggerVideoId:'',tryEnablePlayerCaptions:()=>{},
   waitForInterceptedCues:async()=>[],waitForCaptionTracks:async()=>({track:null,tracks:[]})});
  vm.runInContext(page.slice(page.indexOf('  function normalizeTimedtextUrl('),page.indexOf('  /** Lang family aliases:')),pageNetwork);
  vm.runInContext(page.slice(page.indexOf('  const LANG_FAMILY_ALIASES'),page.indexOf('  async function fetchMultiLangCaptions(')),pageNetwork);
  vm.runInContext(page.slice(page.indexOf('  function detectSubtitleLang('),page.indexOf('  function noteNetflixTimedtext(')),pageNetwork);
  vm.runInContext(page.slice(page.indexOf('  function okCaptionResult('),page.indexOf('  /** Read-only: never call tryEnablePlayerCaptions')),pageNetwork);
  response=ctx.body;
  const unknown=await vm.runInContext("loadCaptions({videoId:'fixture',lang:'ja',force:true})",pageNetwork);
  assert.equal(unknown.ok,true);
  assert.deepEqual(JSON.parse(JSON.stringify(unknown.sourceTrack)),{trackId:null,language:null,kind:null,format:'xml'},'intercept URL cannot establish actual track kind');
  console.log('PASS: actual localhost HTTP200 page intercept-url load retains unknown track metadata instead of certifying guessed ASR');
  status=429;const before=dispatch;
  assert.equal(await vm.runInContext("fetchBestLangPack(candidates,'ja',{})",network),null);
  assert.equal(dispatch-before,1,'HTTP429 must stop variant/credential fanout');
  console.log('PASS: actual localhost HTTP200 XML/JSON3 worker selection carries track ID/format without signed URLs; HTTP429 stops after one request');
 } finally { await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1});
