"""Serve the real sidepanel with isolated Chrome transport for browser regression.

Run: python3 scripts/sidepanel_original_runtime_fixture.py
Open: http://127.0.0.1:18865/extension/sidepanel/sidepanel.html
This verifies DOM behavior, not installed-extension/Drive/API integration.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP = r"""
<script src="/extension/shared/sentence_groups.js"></script>
<script>
// Test-only transport. No real Chrome storage, Drive, bridge or Gemini access.
const listeners = [];
const fixtureCues = [
  {id:'a',source:'乗せて',start_media_time:60,end_media_time:65,mt_locked:true,vi:'Đã khóa',tokens:[]},
  {id:'b',source:'ないんですか?',start_media_time:69,end_media_time:75,tokens:[]},
  {id:'c',source:'どこ',start_media_time:80,end_media_time:81,tokens:[]},
  {id:'d',source:'行くんですか?',start_media_time:81,end_media_time:82,tokens:[]}
];
const fixtureTab = {id:7,url:'https://www.youtube.com/watch?v=fixture'};
const noopEvent = {addListener() {}};
const commands = [];
let mode='original';
const undone=new Set();
const fixtureSaved={};
let fixtureFailure=false;
let fixtureBackupCommand;
const fixtureStorage={};
function fixtureState() {
  const projection=HardsubSentenceGroups.buildSentenceGroups(fixtureCues,{sourceKey:'fixture:ja',blockedCueIds:[...undone]});
  const translations=Object.fromEntries(projection.groups.filter(g=>!g.protected).map(g=>[g.id,
    {revision:g.revision,states:fixtureFailure?{vi:'error',en:'error'}:{}}]));
  return {videoId:'fixture',cues:structuredClone(fixtureCues),
    enhancedCues:HardsubSentenceGroups.projectDisplayCues(fixtureCues,projection,translations),
    captionMode:mode,enhancementAvailable:true,activeCueId:mode==='original'?'b':projection.displayUnits[1].id,
    savedCues:Object.values(fixtureSaved),
    status:'ISOLATED RUNTIME FIXTURE; no live integration',bridgeReady:false};
}
function publishFixture() {listeners.forEach(fn=>fn({type:'SP_STATE',tabId:7,forceList:true,payload:fixtureState()}));}
function checkOriginalRows() {
  const rows=Array.from(document.querySelectorAll('#sp-list .sp-sentence'));
  const errors=[];
  if(rows.length!==fixtureCues.length) errors.push(`rows ${rows.length} != ${fixtureCues.length}`);
  fixtureCues.forEach((cue,i)=>{
    const row=rows[i];
    if(row?.dataset.id!==cue.id) errors.push(`cue ${i} ID`);
    if(row?.querySelector('.sp-ja-view')?.textContent!==cue.source) errors.push(`cue ${i} source`);
    const time=Number(row?.querySelector('.sp-play')?.dataset.time);
    if(time!==cue.start_media_time) errors.push(`cue ${i} play anchor`);
    const rect=row?.getBoundingClientRect();
    if(!rect || rect.width<=0 || rect.height<=0) errors.push(`cue ${i} dimensions`);
  });
  if(rows[0]?.querySelector('.sp-vi')?.textContent!=='Đã khóa') errors.push('locked translation text');
  document.documentElement.dataset.fixtureResult=errors.length?`FAIL: ${errors.join('; ')}`:'PASS: 4 Original rows, IDs, source, play anchors, locked text and actual dimensions';
  console.log(document.documentElement.dataset.fixtureResult);
}
Object.defineProperty(window,'chrome',{configurable:true,value:{
  runtime:{onMessage:{addListener(fn){listeners.push(fn)}},
    id:'fixture',sendMessage:async msg=>msg.type==='SAVED_CUES_MUTATE'
      ? handleSavedCueMutation(msg,{id:'fixture',url:'https://www.youtube.com/watch?v=fixture',tab:{id:7}})
      : {connected:false,status:'NOT VERIFIED: test transport'},
    getURL:path=>'chrome-extension://fixture/'+path},
  storage:{local:{get:async(keys)=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,fixtureStorage[k]])),
    set:async(values)=>Object.assign(fixtureStorage,structuredClone(values))},onChanged:noopEvent},
  windows:{onFocusChanged:noopEvent,WINDOW_ID_NONE:-1},
  tabs:{query:async()=>[fixtureTab],get:async()=>fixtureTab,onActivated:noopEvent,
    sendMessage:async(id,msg)=>{
      commands.push(msg);
      if(['export_json','restore_sentence_backup','restore_previous_backup'].includes(msg.cmd)) {
        fixtureBackupCommand ||= createFixtureBackupRuntime();
        try {return await fixtureBackupCommand(msg)} catch(err) {return {ok:false,error:String(err.message || err)}}
      }
      if(msg.cmd==='get_state') publishFixture();
      if(msg.cmd==='get_state') queueMicrotask(checkOriginalRows);
      if(msg.cmd==='set_caption_mode') {mode=msg.mode;publishFixture();}
      if(msg.cmd==='undo_sentence') {
        const unit=fixtureState().enhancedCues.find(c=>c.id===msg.id);
        for(const ref of unit.sourceRefs) undone.add(ref.cueId);
        publishFixture();
      }
      if(msg.cmd==='toggle_star_cue') {
        const sentence=fixtureState().enhancedCues.find(c=>c.id===msg.id);
        const key=sentence?.savedCueId || msg.id;
        if(fixtureSaved[key]) delete fixtureSaved[key];
        else fixtureSaved[key]={id:key,source:sentence?.source || fixtureCues.find(c=>c.id===msg.id)?.source || ''};
        listeners.forEach(fn=>fn({type:'SP_STATE',tabId:7,payload:{savedCues:Object.values(fixtureSaved)}}));
        return {ok:true,savedCues:Object.values(fixtureSaved)};
      }
      if(msg.cmd==='play') listeners.forEach(fn=>fn({type:'SP_STATE',tabId:7,payload:{activeCueId:'d'}}));
      document.documentElement.dataset.lastCommand=JSON.stringify(msg);
      return {ok:true};
    }}
}});
document.addEventListener('DOMContentLoaded',()=>{
  const btn=document.createElement('button');btn.id='fixture-error';btn.textContent='Fixture: translation error';
  btn.addEventListener('click',()=>{fixtureFailure=!fixtureFailure;publishFixture()});document.body.prepend(btn);
  const mutate=document.createElement('button');mutate.id='fixture-mutate';mutate.textContent='Fixture: edit locked translation';
  mutate.addEventListener('click',()=>{fixtureCues[0].vi='Changed fixture';publishFixture()});document.body.prepend(mutate);
});
</script>
"""


def backup_runtime():
    """Execute production functions; only Chrome/disk transport is isolated."""
    source = (ROOT / "extension/content/content.js").read_text()
    projection = source[source.index("  let sortedCuesCache ="):source.index("  /**\n   * Token enrich via /tokenize_batch")]
    commands = source[source.index("  async function handleSidePanelCmd"):source.index("  function bridgeFetch")]
    token_guard = source[source.index("  function originalTokensMatch"):source.index("  /** cues.json")]
    download = source[source.index("  function downloadCaptionFile"):source.index("  function triggerPredictivePrefetch")]
    writes = source[source.index("  let transcriptWritePending"):source.index("  async function saveTranscript(opts")]
    worker_source = (ROOT / "extension/background/service_worker.js").read_text()
    saved_worker = worker_source[worker_source.index("let savedStateWritePending"):worker_source.index("async function ensureBridgePollAlarm")]
    setup = """
function createFixtureBackupRuntime() {
let cues=fixtureCues,currentSource='youtube',currentVideoId='fixture',captionMode='original',sentenceSourceKey='',
  sentenceProjection=null,sentenceProjectionCues=null,enhancedCues=[],sentenceTranslations={},sentenceTokens={},
  sentenceUndoIds=new Set(),sentenceUndoRevisions={},sentenceStateLoadedKey='',sentenceStateLoadedGen=-1,sentenceStateLoad=null,
  listDirty=true,currentMediaTime=70,savedCues=fixtureSaved,navigateGen=1,settings={sourceLang:'ja'},
  sentenceBenchmark=null,sentenceRawTrack={version:1,sourceKey:'youtube:fixture:ja',cues:structuredClone(fixtureCues)},
  transcriptMeta={owned:false,rev:2,tombstones:[]},sentenceRestorePending=false,saveTimer=null;
const chrome=window.chrome,toast=()=>{},tabPrefix=()=>'',metaStorageKey=id=>'transcriptMeta:'+id;
const loadDiskMeta=async()=>null,saveTranscriptToDisk=async()=>{};
const syncToPlayhead=async()=>{},enrichSentenceGroups=async()=>{},triggerGeminiTranslationIfNeeded=async()=>{};
const publishSidePanelState=()=>{
  const restored=structuredClone(cues);fixtureCues.splice(0,fixtureCues.length,...restored);
  Object.keys(fixtureSaved).forEach(k=>delete fixtureSaved[k]);Object.assign(fixtureSaved,savedCues);
  mode=captionMode;publishFixture();
};
"""
    return "<script>const isSupportedUrl=url=>url.startsWith('https://www.youtube.com/');\n" + saved_worker + setup + writes + projection + token_guard + commands + download + "return handleSidePanelCmd;}\n</script>"


def benchmark_runtime():
    source = (ROOT / "extension/content/content.js").read_text()
    paint = source[source.index("  function recordSentencePaint("):source.index("  function updateBar(")]
    return ("""<!doctype html><meta charset="utf-8"><title>Isolated benchmark DOM check</title>
<script src="/extension/shared/sentence_benchmark.js"></script>
<h1>Actual paint observer, isolated DOM</h1><button id="show">Show Japanese</button>
<button id="reset">Reset hidden trace</button><pre id="result"></pre>
<div id="bar" style="display:none;width:300px;height:60px;background:#ddd">どこ行くんですか?</div>
<script>
let sentenceBenchmark=HardsubSentenceBenchmark.createTrace({traceId:'dom-fixture'});
let settings={showOnVideo:true,barShowJa:true,barTextOpacity:1};
""" + paint + """
const bar=document.getElementById('bar'),result=document.getElementById('result');
const report=()=>result.textContent=JSON.stringify(sentenceBenchmark.snapshot(),null,2);
document.getElementById('show').onclick=()=>{bar.style.display='block';recordSentencePaint(bar,{source:'どこ行くんですか?'});requestAnimationFrame(()=>requestAnimationFrame(report));};
document.getElementById('reset').onclick=()=>{sentenceBenchmark=HardsubSentenceBenchmark.createTrace({traceId:'hidden-fixture'});bar.style.display='none';recordSentencePaint(bar,{source:'どこ行くんですか?'});requestAnimationFrame(()=>requestAnimationFrame(report));};
report();</script>""").encode()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/bilingual":
            body = (ROOT / "testdata/sentence-mvp/bilingual-active-cue.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/benchmark":
            body = benchmark_runtime()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        path = ROOT / self.path.split("?")[0].lstrip("/")
        resolved = path.resolve()
        allowed = any(resolved.is_relative_to(ROOT / directory) for directory in (
            "extension/sidepanel", "extension/shared", "extension/content"))
        if not allowed or path.suffix not in (".html", ".js", ".css") or not path.is_file():
            self.send_error(404)
            return
        body = path.read_bytes()
        if path.name == "sidepanel.html":
            body = body.replace(b"</head>", BOOTSTRAP.encode() + backup_runtime().encode() + b"</head>")
        self.send_response(200)
        self.send_header("Content-Type", {".html":"text/html", ".js":"text/javascript", ".css":"text/css"}[path.suffix] + "; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print("ISOLATED RUNTIME FIXTURE: http://127.0.0.1:18865/extension/sidepanel/sidepanel.html", flush=True)
    try:
        HTTPServer(("127.0.0.1", 18865), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
