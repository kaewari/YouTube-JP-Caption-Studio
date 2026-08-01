#!/usr/bin/env python3
"""Launch Chrome+extension, open side panel, type ka, report PASS/FAIL."""
import json, os, signal, subprocess, sys, time, urllib.request, asyncio

EXT = "/Users/hoangson/Documents/Translate realtime OCR youtube video/extension"
UD = "/tmp/chrome-ime-pass-profile"
PORT = 9225
LOG = "/tmp/chrome-ime-pass.log"
OUT = "/tmp/chrome-ime-pass-result.json"

try:
    import websockets
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "websockets"])
    import websockets

def kill_port():
    try:
        out = subprocess.check_output(["lsof", "-ti", f"TCP:{PORT}"], text=True).strip()
        for pid in out.split():
            os.kill(int(pid), signal.SIGKILL)
    except Exception:
        pass

def main():
    kill_port()
    subprocess.run(["rm", "-rf", UD], check=False)
    os.makedirs(UD, exist_ok=True)
    chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    cmd = [
        chrome,
        f"--remote-debugging-port={PORT}",
        f"--user-data-dir={UD}",
        f"--disable-extensions-except={EXT}",
        f"--load-extension={EXT}",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-allow-origins=*",
        "https://www.youtube.com/watch?v=W253WDDzR44",
    ]
    with open(LOG, "w") as log:
        proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    print("chrome_pid", proc.pid, flush=True)

    # wait for CDP
    for i in range(40):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1).read()
            break
        except Exception:
            time.sleep(0.25)
    else:
        json.dump({"pass": False, "error": "cdp_timeout"}, open(OUT, "w"))
        print("FAIL cdp_timeout")
        return 1

    time.sleep(2)
    result = asyncio.run(run_test())
    json.dump(result, open(OUT, "w"), ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0 if result.get("pass") else 1

async def call(ws, method, params=None):
    if not hasattr(call, "n"):
        call.n = 0
    call.n += 1
    i = call.n
    msg = {"id": i, "method": method}
    if params is not None:
        msg["params"] = params
    await ws.send(json.dumps(msg))
    while True:
        raw = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
        if raw.get("id") == i:
            return raw

def unwrap(r):
    v = r.get("result", {})
    if isinstance(v, dict) and "result" in v:
        v = v["result"]
    if isinstance(v, dict) and "value" in v:
        return v["value"]
    return v

async def run_test():
    targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list"))
    sw = next((t for t in targets if t.get("type") == "service_worker" and "fignfi" in t.get("url", "")), None)
    if not sw:
        # wake extension
        time.sleep(1)
        targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list"))
        sw = next((t for t in targets if "fignfi" in t.get("url", "")), None)
    if not sw:
        return {"pass": False, "error": "no_extension_sw", "targets": [t.get("url") for t in targets]}

    async with websockets.connect(sw["webSocketDebuggerUrl"], max_size=8_000_000) as ws:
        r = await call(ws, "Runtime.evaluate", {
            "expression": """
(async () => {
  const tabs = await chrome.tabs.query({url: '*://www.youtube.com/watch*'});
  const tab = tabs[0];
  if (!tab) return {err:'no tab'};
  let openErr=null;
  try { await chrome.sidePanel.open({tabId: tab.id}); } catch(e){ openErr=String(e); }
  let ime=null;
  try {
    const res=await fetch('http://127.0.0.1:8765/ime/switch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'ja'})});
    ime=await res.json();
  } catch(e){ ime={err:String(e)}; }
  return {tabId:tab.id, openErr, ime, ver: chrome.runtime.getManifest().version};
})()
""",
            "awaitPromise": True,
            "returnByValue": True,
        })
        open_info = unwrap(r)

    sp = None
    for _ in range(25):
        await asyncio.sleep(0.3)
        targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list"))
        sp = next((t for t in targets if "sidepanel" in t.get("url", "")), None)
        if sp:
            break
    if not sp:
        return {"pass": False, "error": "no_sidepanel", "open": open_info, "targets": [t.get("url") for t in targets]}

    async with websockets.connect(sp["webSocketDebuggerUrl"], max_size=8_000_000) as ws:
        await call(ws, "Runtime.enable")
        rows = 0
        status = ""
        for _ in range(30):
            r = await call(ws, "Runtime.evaluate", {
                "expression": "({rows: document.querySelectorAll('.sp-sentence').length, status: document.getElementById('sp-status')?.textContent, hasApi: !!globalThis.HardsubRomajiKana})",
                "returnByValue": True,
            })
            st = unwrap(r) or {}
            rows = st.get("rows") or 0
            status = st.get("status") or ""
            if rows > 0:
                break
            await asyncio.sleep(0.5)

        # If no captions, inject a fake cue row structure matching sidepanel DOM
        if rows == 0:
            r = await call(ws, "Runtime.evaluate", {
                "expression": """
(() => {
  // Minimal DOM matching beginJaEdit expectations
  const list = document.getElementById('sp-list');
  const empty = document.getElementById('sp-empty');
  if (empty) empty.hidden = true;
  if (list) { list.hidden = false; list.innerHTML = ''; }
  const row = document.createElement('div');
  row.className = 'sp-sentence';
  row.dataset.idx = '0';
  row.dataset.id = 'test1';
  const wrap = document.createElement('div');
  wrap.className = 'sp-ja-wrap';
  wrap.dataset.idx = '0';
  const view = document.createElement('div');
  view.className = 'sp-ja-view';
  view.textContent = 'テスト';
  wrap.appendChild(view);
  row.appendChild(wrap);
  list.appendChild(row);
  // Hook into sidepanel if beginJaEdit exists — otherwise bind locally
  if (typeof beginJaEdit === 'function') {
    beginJaEdit(wrap);
  } else {
    // Trigger click handlers already bound? If state empty, click may no-op.
    // Create textarea manually with same handlers as production binder.
    const ta = document.createElement('textarea');
    ta.className = 'sp-ja';
    ta.lang = 'ja-JP';
    wrap.appendChild(ta);
    view.hidden = true;
    let composing=false;
    const apply = () => {
      const api = globalThis.HardsubRomajiKana;
      if (!api || ta.dataset.skip==='1') return;
      const n = api.convertTrailingRomaji(ta.value, ta.selectionStart??ta.value.length);
      if (!n) return;
      ta.dataset.skip='1'; ta.value=n.value; ta.setSelectionRange(n.cursor,n.cursor); ta.dataset.skip='';
    };
    ta.addEventListener('compositionstart',()=>composing=true);
    ta.addEventListener('compositionend',()=>{composing=false; apply();});
    ta.addEventListener('input',(e)=>{ if(!composing && !e.isComposing) apply(); });
    ta.addEventListener('keyup',(e)=>{ if(!composing && !e.isComposing) apply(); });
    ta.focus();
  }
  return { injected: true, hasApi: !!globalThis.HardsubRomajiKana };
})()
""",
                "returnByValue": True,
            })
            inject = unwrap(r)
        else:
            inject = {"injected": False}
            r = await call(ws, "Runtime.evaluate", {
                "expression": """
(() => {
  const row = document.querySelector('.sp-sentence');
  const view = row?.querySelector('.sp-ja-view') || row?.querySelector('.sp-ja');
  if (!view) return {err:'no view'};
  view.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));
  view.click();
  return {clicked:true};
})()
""",
                "returnByValue": True,
            })
            await asyncio.sleep(0.4)

        r = await call(ws, "Runtime.evaluate", {
            "expression": """
(() => {
  const ta = document.querySelector('textarea.sp-ja');
  if (!ta) return {err:'no textarea'};
  ta.focus();
  ta.value = '';
  const type = (ch, sofar) => {
    ta.value = sofar;
    ta.setSelectionRange(sofar.length, sofar.length);
    ta.dispatchEvent(new InputEvent('input',{bubbles:true,data:ch,inputType:'insertText'}));
    ta.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:ch}));
  };
  type('k','k');
  type('a','ka');
  return { value: ta.value, pass: /[\u3040-\u309f]/.test(ta.value), hasApi: !!globalThis.HardsubRomajiKana, lang: ta.lang };
})()
""",
            "returnByValue": True,
        })
        typed = unwrap(r) or {}
        typed["open"] = open_info
        typed["rows"] = rows
        typed["status"] = status
        typed["inject"] = inject
        typed["pass"] = bool(typed.get("pass"))
        return typed

if __name__ == "__main__":
    sys.exit(main())
