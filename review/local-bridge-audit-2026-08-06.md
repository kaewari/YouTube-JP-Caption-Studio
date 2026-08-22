<!-- date: 2026-08-06 -->
<!-- source: chat:7e6bf4e0 · user: ultracode audit local-bridge theo codebase-review-2026-08-04, tìm bug nào còn sống, verify từng cái từ disk -->

# Local-bridge audit — bug nào còn sống (re-verify từ disk)

Status: **done** (2026-08-06). Audit toàn bộ `local-bridge/` + `macos-bridge-app/` theo §5 của `review/codebase-review-2026-08-04.md`. **10/10 findings vẫn ALIVE** — chưa có cái nào được sửa. 4 "đã kiểm tra an toàn" vẫn đúng. Không commit/push.

## Method

- 11 agents độc lập (10 per-finding + 1 scope check), mỗi agent đọc lại file hiện tại từ disk, locate theo symbol/string (AGENTS.md §2 — đường dẫn đã đổi sau flatten), quote verbatim + file:line hiện tại.
- LB-5 bị safety classifier chặn nhầm (agent không hề chạm file) → verify tay từ disk (bên dưới).
- Flatten 2026-08-05 chỉ đổi đường dẫn (comment, ROOT path) — không rework logic bridge nào.

## Verdict — 10/10 ALIVE

| ID | Severity | Verdict | Vị trí hiện tại |
|----|----------|---------|-----------------|
| LB-1 | critical | **ALIVE** | [Dockerfile:27](local-bridge/Dockerfile#L27) + [docker-compose.yml:14-15](local-bridge/docker-compose.yml#L14-L15) |
| LB-2 | high | **ALIVE** | [app/main.py:75-81](local-bridge/app/main.py#L75-L81) |
| LB-3 | high | **ALIVE** | [app/main.py:358-362](local-bridge/app/main.py#L358-L362) (+ POST save/files/backup) |
| LB-4 | medium | **ALIVE** | [app/scripts/import_en_vi.py:29](local-bridge/app/scripts/import_en_vi.py#L29) |
| LB-5 | medium | **ALIVE** | [app/scripts/bootstrap.py:47-55](local-bridge/app/scripts/bootstrap.py#L47-L55), [111-112](local-bridge/app/scripts/bootstrap.py#L111-L112) |
| LB-6 | medium | **ALIVE** | [app/services/script_store.py:374-388](local-bridge/app/services/script_store.py#L374-L388), [449-451, 488-492](local-bridge/app/services/script_store.py#L449-L451) |
| LB-7 | medium | **ALIVE** | [app/main.py:188-196](local-bridge/app/main.py#L188-L196), [64-69](local-bridge/app/main.py#L64-L69) |
| MB-8 | medium | **ALIVE** | [Sources/main.swift:234-240](macos-bridge-app/Sources/main.swift#L234-L240) |
| MB-9 | medium | **ALIVE** | [Sources/main.swift:198-206](macos-bridge-app/Sources/main.swift#L198-L206) |
| MB-10 | low | **ALIVE** | [build.sh:72-74, 43](macos-bridge-app/build.sh#L72-L74) |

FIXED: 0 · CHANGED: 0 · UNVERIFIABLE: 0.

## Chi tiết từng finding

### LB-1 — critical — Docker phơi bridge không auth ra LAN

```dockerfile
# local-bridge/Dockerfile:27
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "1"]
```

```yaml
# local-bridge/docker-compose.yml:14-15
    ports:
      - "8765:8765"
```

Không có root `docker-compose.yml` trên disk — cặp Dockerfile/compose duy nhất là `local-bridge/`. `docker compose up` publish mọi interface → LAN-reachable; `DELETE /scripts/{video_id}` (main.py:358) không auth → attacker cùng LAN xóa được scripts folder. `start.sh:109` vẫn bind 127.0.0.1 đúng — chỉ config Docker sai. **Không đổi gì so với review.**

### LB-2 — high — CORS localhost:ANY-port + credentials, không Host validation

```python
# local-bridge/app/main.py:75-81
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://[a-z0-9]{32}|http://(localhost|127\.0\.0\.1)(:\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Regex vẫn cho mọi origin `http://localhost:ANY port` / `127.0.0.1:ANY port` với credentials; toàn file 484 dòng không có Host-header validation (middleware duy nhất là CORS này). Server bind 127.0.0.1:8765 (loại remote), nhưng kịch bản review vẫn đúng: page từ bất kỳ localhost:PORT nào (dev server khác / nội dung local độc hại) được cho credentialed qua.

### LB-3 — high — DELETE/import không auth

```python
# local-bridge/app/main.py:358-362
@app.delete("/scripts/{video_id}")
def scripts_delete(video_id: str) -> dict[str, Any]:
    """Wipe saved script folder for a video (cues.json / script.txt / meta)."""
```

Toàn bridge 0 auth: không Depends, không token, không auth middleware; chỉ CORS (không phải auth). Cùng không auth: `POST /scripts/{video_id}/files` (313-317), `POST /scripts/save` (235), `POST /backup/snapshot` (457-458). Exposure thực tế vì Docker vẫn bind 0.0.0.0 (LB-1).

### LB-4 — medium — Dict download HTTP plaintext (MITM)

```python
# local-bridge/app/scripts/import_en_vi.py:29
VNEDICT_TXT_URL = "http://www.denisowski.org/Vietnamese/vnedict.txt"
```

Thay đổi duy nhất cả đợt audit: **có thêm fallback HTTPS** `VNEDICT_ZIP_URL` (raw.githubusercontent.com, dòng 30) — nhưng chỉ chạy khi download HTTP **throw** (271-275). MITM đổi nội dung response → download "thành công" → nhận nguyên si, không checksum/hash nào trong file. Chỉ hard failure được giảm nhẹ; poisoning bytes vẫn thắng.

### LB-5 — medium — Bootstrap download không atomic, partial coi là hoàn tất

```python
# local-bridge/app/scripts/bootstrap.py:47-55
def _download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    ctx = _ssl_context()
    with urllib.request.urlopen(url, context=ctx, timeout=300) as resp, open(dest, "wb") as out:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
```

```python
# local-bridge/app/scripts/bootstrap.py:111-112
                if not xml_path.exists():
                    if not gz.exists():
                        _download(JMDICT_GZ_URL, gz)
```

(verify tay — agent LB-5 bị safety classifier chặn nhầm, không đụng file). Ghi thẳng vào `dest` (không tmp+replace); `gz.exists()` → file .gz bị cắt giữa chừng được coi là hoàn tất → gunzip fail → rơi vào error state "JMdict incomplete" (146-153) mãi cho đến khi xóa tay. **ALIVE.**

### LB-6 — medium — script_store: 4 write tuần tự không transaction, không lock; load_script ghi trong lúc đọc

```python
# local-bridge/app/services/script_store.py:374-388
    _atomic_write_text(
        cues_path, _dump({"video_id": vid, "cues": cleaned, "meta": meta})
    )
    _atomic_write_text(tokens_path, _dump(new_tokens))
    _atomic_write_text(meta_path, _dump(meta))
    _atomic_write_text(
        folder / "script.txt",
        render_script_txt(
```

`save_script` vẫn 4 write tuần tự không lock; `load_script` vẫn ghi trong lúc đọc (tokens.json 449-451 + 521, cues.json 488-490 + 522, meta.json 491-492). Có giảm nhẹ từ trước review: `_atomic_write_text` (256-264) dùng tmp riêng + replace → 1 file không bao giờ nửa-nửa, nhưng không chống torn cross-file set (mỗi file last-writer-wins trộn revision) hay write-during-read race. Endpoint sync chạy trên threadpool không lock (`_ext_state_lock` main.py:86 chỉ cho extension state).

### LB-7 — medium — /log không giới hạn, không auth

```python
# local-bridge/app/main.py:188-196
@app.post("/log")
def client_log(body: dict[str, Any]) -> dict[str, bool]:
    """Extension/runtime one-liner into errors.log (silent YT secondary miss, etc.)."""
    level = str(body.get("level") or "WARNING").upper()
    ...
    _append_errors_log(level, msg)
```

`_append_errors_log` (64-69) append không cap size/rotation; message không chặn độ dài; không auth (CORS là browser-enforced, không phải auth). Local process / localhost page bất kỳ spam errors.log tới đầy disk. Localhost-only nên giữ medium.

### MB-8 — medium — lsof kill mọi process giữ port

```swift
// macos-bridge-app/Sources/main.swift:234-240
    private static func killPort(_ port: Int) {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = ["-c", "lsof -ti TCP:\(port) -sTCP:LISTEN | xargs kill -TERM 2>/dev/null || true"]
        try? task.run()
        task.waitUntilExit()
    }
```

Không đổi. `stop()` (154-155) gọi killPort(8765) + killPort(3000) không điều kiện; không check ownership với process tree của bridge (đã SIGTERM riêng dòng 148). `-sTCP:LISTEN` chỉ lọc listener — dev server khác trên :8765/:3000 vẫn bị giết.

### MB-9 — medium — Không auto-restart khi bridge crash

```swift
// macos-bridge-app/Sources/main.swift:198-206
    private func pollHealth() {
        if let proc = process, !proc.isRunning {
            isRunning = false
            isReady = false
            statusDetail = "Bridge đã thoát (xem log)"
            healthTimer?.invalidate()
            healthTimer = nil
            return
        }
```

Process exit → chỉ clear state + invalidate timer, không start()/restart(), không retry loop. Recovery duy nhất là nút menu tay. Không hoàn toàn im lặng (menu icon dim 0.45 + status "Bridge off") nên giữ medium.

### MB-10 — low — build.sh nuốt lỗi codesign + junk iconset

```bash
# macos-bridge-app/build.sh:72-74
  codesign --force --deep --sign - --identifier com.example.YouTubeJPCaptionStudio.Bridge "$APP" 2>/dev/null \
    || codesign --force --sign - "$BIN" 2>/dev/null \
    || true
```

```bash
# macos-bridge-app/build.sh:43
  "32 diana.k@example.org" \
```

`2>/dev/null` + `|| true` → build unsignable vẫn in "Built: ..." exit 0. Icon loop vẫn ghi junk email-address entries (diana.k@example.org, wendy.h@example.net ×3, walt.e@example.net) vào iconset cùng icon_* thật. Rewrite flatten (ROOT/REPO/BRIDGE path, icon fallback) không đụng 2 defect này.

## Re-verify "Đã kiểm tra và an toàn" (scope agent) — 4/4 vẫn đúng

| Claim | Verdict | Bằng chứng |
|-------|---------|------------|
| (a) `_VIDEO_ID_RE` chặn path traversal | STILL-TRUE | script_store.py:31 regex y nguyên; validation `_safe_video_id` 43-50; mọi đường filesystem đi qua nó (video_dir 49-54, delete 631, load 422, write_files 609, load_meta 545) |
| (b) mọi SQLite query parameterized | STILL-TRUE | 10 site execute/executemany trong dictionary.py (377, 395, 411, 427, 614) + build_dict_sqlite.py (88, 106, 131, 147) đều `?` + tuple; không f-string/% nào |
| (c) không shell=True trong local-bridge | STILL-TRUE | grep 0 hit trong app/, scripts/, bin/; subprocess duy nhất ime_switch.py:47 argv-list |
| (d) file write tmp + atomic replace | STILL-TRUE | script_store.py:256-264 `_atomic_write_text` y nguyên; mọi write script đi qua nó |

Coverage: **không finding nào trong §5 bị bỏ sót** (missingFindings rỗng).

## Kết luận

- **Chưa bug nào được sửa** sau review 2026-08-04 (git log từ 2026-08-04 không có commit nào chạm local-bridge/macos-bridge-app; flatten chỉ đổi path).
- Thay đổi duy nhất: LB-4 có fallback HTTPS (chỉ khi HTTP throw — không phải fix thực chất).
- 2 critical/high đầu vào của Docker auth-exposure (LB-1, LB-3) nằm trên cùng một quyết định: Docker bind 0.0.0.0 + 0 auth. Fix gọn nhất theo ponytail: bind `127.0.0.1` trong Dockerfile/compose (chữa LB-1 hẳn, giảm LB-3 xuống local-only) — nhưng chưa làm gì trong audit này (audit ≠ fix).
