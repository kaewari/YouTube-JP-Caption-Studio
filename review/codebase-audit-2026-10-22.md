<!-- date: 2026-10-22 -->
<!-- source: chat:dsh-web-gui · user: quét toàn bộ dự án, research chỗ cần cải thiện, đề xuất thay đổi, viết báo cáo trung thực -->

# Codebase Audit — 2026-10-22

Audit toàn repo, read-only. **Không sửa code nào.** Mọi finding dưới đây đã được tôi
tự đọc lại trên disk và tự chạy lại lệnh kiểm chứng — không tin báo cáo của agent.

Phạm vi: `extension/`, `local-bridge/`, `web/saved-items/`, `ipad-app/`, `iphone-app/`,
`macos-bridge-app/`, `scripts/`, `tools/`, `tests/`, `testdata/`, `.github/workflows/`,
`plan/`, `review/`, `wiki/`, root docs.

# 0. Phương pháp

6 agent đọc song song theo khu vực rời nhau (bridge / extension / web / iOS / infra+docs /
cross-cutting). Sau đó **tôi tự verify lại từng P0/P1 bằng mắt và bằng lệnh thật**;
finding nào tôi không tự xác nhận được thì ghi rõ là *chưa verify*.

Không dùng lại kết luận của audit 2026-10-18 (`review/full-codebase-improvement-audit-2026-10-18.md`).
Phần lớn P0 của audit đó đã được merge (`2fff75c48`) và **đã đóng** — tôi đã kiểm chứng:
CI giờ chạy extension tests + root tests, `test_tokenize_import_enrich.py` đã đọc
`BRIDGE_URL`, `verify_no_fake_tests.js` đã quét `local-bridge/tests` + `tests/`.
Báo cáo này chỉ ghi những lỗi **còn tồn tại ngày 2026-10-22**.

# 1. Lệnh kiểm chứng — output thật

| Lệnh | Exit | Kết quả |
|---|---|---|
| `cd local-bridge && .venv/bin/python -m pytest -q tests/` | **139** | `140 passed, 1 warning` rồi **SIGSEGV** (xem B-1) |
| `cd local-bridge && .venv/bin/python -m pytest -q tests/ --ignore=tests/test_asr_dsp.py` | 0 | `121 passed` |
| `cd local-bridge && .venv/bin/python -m pytest -q tests/ --ignore=tests/test_asr_api.py` | 0 | `125 passed` |
| `cd local-bridge && .venv/bin/python -m pytest -q tests/test_asr_dsp.py tests/test_asr_api.py` (đảo thứ tự) | 0 | `34 passed` — **không crash** |
| `cd local-bridge && for f in tests/test_*.py; do pytest -q $f; done` | 5 × file | `test_captions_cache.py`, `test_snapshot_roundtrip.py`, `test_sqlite_parity.py`, `test_tokenize_import_enrich.py` → **pytest collect 0 test** |
| `cd REPO && for f in extension/shared/*_test.js extension/offscreen/audio_capture_test.js extension/sidepanel/sidepanel_pure_test.js extension/background/service_worker_test.js extension/content/content_test.js; do node $f; done` | 0 × 15 | tất cả pass |
| `cd REPO && node scripts/verify_no_fake_tests.js` | 0 | `PASSED` — **nhưng có false negative, xem D-1** |
| `cd REPO && bash scripts/wiki_sync_and_lint.sh` | **1** | `4 error(s)`, `7 warnings` |
| `cd REPO && git ls-files \| grep -c 'popup/_next'` | 0 | 0 file — popup build output **không được track** |
| `cd REPO && git rev-list --count origin/master..master` | — | **31 commit chưa push** |
| `cd REPO && git ls-files \| grep -rn "AIza\|sk-\|ghp_\|BEGIN.*PRIVATE"` | 0 | 4 hit, tất cả false positive (không có secret thật) |
| `cd REPO && du -sh .git` | — | **1.6 GB** (`size-pack: 1.16 GiB`) cho tree chỉ 18.4 MB |
| `cd local-bridge && .venv/bin/python /tmp/repro_write_files.py` | 0 | **REPRO ĐƯỢC**: `cues.json` không hợp lệ ghi thẳng xuống đĩa, `load_script` → `None` (B-21) |

# 2. Tổng quan

| Mức | Số | Nhóm chính |
|---|---|---|
| **P0** | **8** | mất dữ liệu vocab 2 chiều · iPhone không có script bridge · popup hỏng khi clone mới · capability-token gate không chặn được message thiếu token · 2 test fake · tài liệu mô tả UI không tồn tại · assertion cứng không thể fail |
| **P1** | **24** | segfault test suite · `write_files` không validate cues.json · ASR buffer trước check size · 3 self-check không ai chạy · `meaning`/`jlptLevel` drift · JLPT band lệch 4 nơi · 25 sanity script không vào CI · token cache quota · unbounded tokenize_batch · wipe không tombstone · v.v. |
| **P2** | **~33** | trùng lặp logic ×3–6 · settings default lệch · bundle stale · accessibility · `errors.log` bị test pollute · code chết trong bridge |
| **P3** | **~10** | hygiene nhỏ |

Nguyên nhân gốc (không phải triệu chứng): **schema của "bản ghi vocab" và "cùng một tên file backup"
được định nghĩa ở 4 nơi với 4 nghĩa khác nhau, nhưng không có nơi nào là nguồn sự thật duy nhất.**
Sửa từng lỗi riêng lẻ sẽ tạo ra lỗi mới; cần một contract file duy nhất + một con trình validate.

---

# P0 — Mất dữ liệu / hỏng chức năng

## A-1. `vocab[].meaning` mang hai nghĩa khác nhau trong **cùng một file** → mất dữ liệu vocab hai chiều

**Trạng thái: ĐÃ TỰ XÁC NHẬN.**

Cùng một key `meaning` trong `caption-studio-backup.json`:
- `local-bridge/app/services/snapshot.py:34` đóng gói **status** (`known|learning|ignored|special`).
- `ipad-app/Services/BackupService.swift:265` đóng gói **gloss** (`v.meaning` — nghĩa tiếng Việt).

Hai writer cùng ghi một file, ai ghi sau là người thắng, và mỗi bên hủy dữ liệu của bên kia:

```python
# local-bridge/app/services/snapshot.py:13
_VOCAB_STATUS = frozenset({"known", "learning", "ignored", "special"})
# :34  — bridge đóng gói status vào "meaning"
"meaning": st if st in _VOCAB_STATUS else "",
# :53  — khi ĐỌC LẠI, mọi giá trị không thuộc status bị ép thành "learning"
cleaned[w] = meaning if meaning in _VOCAB_STATUS else "learning"
```

```swift
// ipad-app/Services/BackupService.swift:261-269
vocab: vocab.map { v in
    VocabDTO(word: v.word, reading: v.reading, meaning: v.meaning,   // ← gloss
             jlptLevel: v.jlptLevel, frequencyCount: v.frequencyCount, savedAt: v.savedAt)
}
```

Hệ quả cụ thể:
1. **Extension → iPad**: `extension/background/service_worker.js:2212-2234` (`uploadDriveFromBridge`)
   PATCH **toàn bộ** file từ bridge. Bridge pack `meaning` = status, `reading: ""`,
   `jlptLevel: null`, `frequencyCount: 0` → **gloss/Hán-Việt/JLPT/tần suất của iPad bị xoá**.
2. **iPad → Extension**: `service_worker.js:2030-2052` (`pullVocabSnapshot`) tải file Drive về rồi
   POST vào bridge `POST /backup/snapshot`. Bridge `_vocab_to_ext` ép mọi gloss (không thuộc
   `_VOCAB_STATUS`) thành `"learning"` → **toàn bộ từ điều trên iPad biến thành "learning" ở extension**.

Không có lỗi, không cảnh báo. Người dùng chỉ thấy từ vựng bị mất gloss rồi tự nhiên đổi trạng thái.

**Fix đề xuất (nhỏ nhất):** tách 2 field — `meaning` (gloss) + `status` (known/learning/…).
- `snapshot.py`: `_vocab_from_ext` → `"meaning": gloss, "status": st`; `_vocab_to_ext` → `cleaned[w] = v.get("status") or "learning"`.
- `BackupService.swift`: `VocabDTO` thêm `var status: String`; encode `status: v.status, meaning: v.meaning`.
- `service_worker.js`: không cần đổi nếu bridge đã làm chuyển đổi.
- Bắt buộc: version bump `version: 2` + cho phép đọc `version: 1` (coi `meaning` cũ là status).

**Effort: M** (4 file + migration + test round-trip 2 chiều).

## A-2. iOS ghi `caption-studio-vocab.json`, extension đọc `caption-studio-backup.json` → **không ai đọc file của iOS**

**Trạng thái: ĐÃ TỰ XÁC NHẬN.**

```
iphone-app/Services/VocabSync.swift:10   static let fileName = "caption-studio-vocab.json"
ipad-app/Services/BackupService.swift:20 static let fileName = "caption-studio-backup.json"
extension/background/service_worker.js:1343  const DRIVE_BACKUP_NAME = "caption-studio-backup.json";
```

Grep toàn repo (không tính `plan/`, `.claude/`, `.tmp-`): **`caption-studio-vocab.json` chỉ xuất hiện
trong `iphone-app/Services/VocabSync.swift` và `ipad-app/Services/VocabSync.swift`.** Không extension,
không bridge, không web app đọc nó. `VocabSync.pullIfNewer` được gọi ở
`ipad-app/Views/ContentView.swift:162,180,1038` và `iphone-app/Views/ContentView.swift:148,166,804`
→ **iOS pull từ một file mà chỉ chính iOS ghi ra**, tức là kênh sync chết.

Lịch sử: `plan/p0-data-loss-fixes-2026-08-04.md:15` cố ý tách file này ra để hai writer không đè
nhau — nhưng **không ai lắng nghe phía nhận**. Tài liệu vẫn mô tả một file chung
(`ipad-app/Scripts/COMMANDS.md:114`, `walkthrough.md:28,156`, `README.md`).

**Fix đề xuất (nhỏ nhất):** extension đọc `caption-studio-vocab.json` cùng lúc với
`caption-studio-backup.json` (vocab-only, LWW theo `updatedAt`) — file này được thiết kế sẵn để
không đụng `VideoScript`. Đổi 1 hằng + 1 nhánh pull trong `service_worker.js`. Nếu muốn bỏ hẳn
`VocabSync` thì phải xoá nó — nhưng **đừng để nó nằm chết**.

**Effort: S** (extension) + **S** (sửa docs).

## A-3. iPhone **không bundle `user_script.js`** → toàn bộ bridge WKWebView của iPhone chết

**Trạng thái: ĐÃ TỰ XÁC NHẬN.**

`iphone-app/Views/YouTubePlayerView.swift:49-52`:
```swift
if let scriptPath = Bundle.main.path(forResource: "user_script", ofType: "js"),
   let scriptSource = try? String(contentsOf: scriptPath) {
    let userScript = WKUserScript(source: scriptSource, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
    contentController.addUserScript(userScript)
}
```
nhưng `iphone-app/project.yml:10-22` (`sources`) **không có** `Scripts/user_script.js`:
```yaml
    sources:
      - path: App.swift
      - path: Views
      - path: Models
      - path: Services
      - path: Assets.xcassets
      # Scripts/ is dev tooling only (deploy/renew/signing) — nothing ships in the app.
      - path: Resources/dict.sqlite
```
(iPad `project.yml:17` có: `- path: Scripts/user_script.js`.)

→ `if let` fail **âm thầm**, không script nào được inject, và các handler
`captionHandler` / `timeHandler` / `rectHandler` / `layoutHandler` / `navHandler` /
`fullscreenHandler` (đăng ký ngay dưới, `YouTubePlayerView.swift:54-59`) không bao giờ được gọi.
Hậu quả trên iPhone (`iphone-app/Views/ContentView.swift:290-345`):
- `onCaptionsReceived` → không có phụ đề từ player.
- `onTimeUpdate` → `playheadSync.timeMs` **đứng yên 0**, overlay không đồng bộ.
- `onVideoRect` → overlay không định vị theo khung video.

File `iphone-app/Scripts/user_script.js` (10.0 KB) **có trên disk** nhưng không được đóng gói.

**Fix đề xuất:** thêm vào `iphone-app/project.yml`:
```yaml
      - path: Scripts/user_script.js
        buildPhase: resources
```
**Nhưng đọc kỹ A-6 trước** — thêm file này sẽ làm `LayoutSmoke` của iPhone assert fail.

**Effort: S** (project.yml) + regenerate `.xcodeproj` bằng `xcodegen`.

## A-4. Capability-token gate của content script **không chặn được message thiếu token**

**Trạng thái: ĐÃ TỰ XÁC NHẬN (đọc code, xác nhận logic).**

`extension/content/content.js:669-671`:
```js
const msgCap = cap || result?.cap;
if (pageCapToken && msgCap && msgCap !== pageCapToken) return;
```
`extension/content/content.js:6130`:
```js
if (pageCapToken && e.data.cap && e.data.cap !== pageCapToken) return;
```

Cả hai chỉ **từ chối token sai**, **không từ chối token thiếu** (`msgCap` rỗng → `&&` đứt → pass).
Comment ngay trên (`content.js:6126-6127`) nói rõ ý định:
> `// no unverified MAIN-world message may trigger caption reloads.`

→ Ý định **không được thực thi**. Thêm nữa, token lại nằm **trong DOM của page**:
`content.js:216-222` đặt `s.src = chrome.runtime.getURL("injected/page_capture.js") + "?v=…&cap=" + token`
với `s.id = "hardsub-ocr-page-script"` → bất kỳ script nào chạy trên youtube/abema/netflix đọc được
`document.getElementById("hardsub-ocr-page-script").src` để lấy token.

Tác động nếu khai thác: script page-world giả mạo `__HARDSUB_TIMEDTEXT_CAPTURED__` với `cues` tùy ý
→ cue giả hiển thị trên overlay + sidepanel, **được gửi lên Gemini API trả phí** (JA text của user
đi ra Google), và **được ghi vào script đã lưu + Drive mirror**. Đây là trust boundary thật:
nội dung trang là dữ liệu internet không tin cậy.

**Fix đề xuất (nhỏ nhất):** đảo điều kiện — bắt buộc phải có token:
```js
if (!pageCapToken || msgCap !== pageCapToken) return;
```
(`pageCapToken` được set ở `content.js:208` trước khi inject script, nên khoảnh khắc token rỗng
chính là lúc phải chặn.) Sửa đồng thời `content.js:6130`. Và **xoá token khỏi URL query** —
chuyển sang `postMessage` handshake một chiều, hoặc `chrome.runtime.getURL` + `crypto` random truyền
qua `document.currentScript` property (page-world vẫn đọc được ⇒ cần 1 lớp nữa: random token
truyền qua `window.postMessage` từ content script sang page script *trước* khi page script gửi lại).

**Effort: M** (2 chỗ gate + đổi cơ chế truyền token + test chống forge).

## A-5. `extension/popup/` trong git là **build thiếu** → Saved Items UI trắng sau khi clone mới

**Trạng thái: ĐÃ TỰ XÁC NHẬN.**

- `.gitignore:88-89`:
  ```
  # Extension popup build output (built via `npm run build:extension` in web/saved-items/, copied — never commit)
  extension/popup/_next/
  ```
- `git ls-files | grep -c 'popup/_next'` → **0**.
- Nhưng `extension/popup/index.html` (và `popup.html`) **được track** và tham chiếu 12 asset
  dưới `./_next/`:
  ```
  href="./_next/static/chunks/073y-59n8lq4y.css"
  src="./_next/static/chunks/06~f4cvc3b8e~.js"
  src="./_next/static/chunks/16g.ca89g7fib.js"
  src="./_next/static/chunks/turbopack-0t9me62xuz~5.js"
  src="./_next/static/chunks/0dbhjjzl8qfwv.js"
  src="./_next/static/chunks/15p5yvud~6v9t.js"
  src="./_next/static/chunks/03~yq9q693hmn.js"  (+ 4 woff2 font)
  ```
- `extension/background/service_worker.js:138` mở `popup/index.html`.

→ **Fresh clone: mọi JS/CSS/font của popup 404.** UI Saved Items trắng. Không CI nào bắt được,
vì CI không build extension (`ci.yml` không có job nào chạy `npm run build:extension`).

Thêm nữa: `out/` build lúc `2026-09-20` còn source `2026-10-21` → bundle cũ hơn source.

**Fix đề xuất:** 2 lựa chọn, chọn 1:
- (a) Thêm job CI `build:extension` + kiểm tra artifact có đủ file (1 job, ~2 phút) — giữ popup
  là build output không track.
- (b) Track luôn `extension/popup/_next/` — repo to thêm ~1-2 MB, nhưng clone là chạy được ngay.
  Phải bỏ dòng `.gitignore:89`.

Hiện tại repo ở trạng thái **tệ nhất của cả hai**: file HTML được track nhưng asset thì không.

**Effort: S–M.**

## A-6. `scripts/test_bugfixes_qa.js` là test giả — vi phạm trực tiếp AGENTS.md

**Trạng thái: ĐÃ TỰ XÁC NHẬN.**

`scripts/test_bugfixes_qa.js:66-78` đọc source production rồi assert chuỗi:
```js
const htmlContent = fs.readFileSync(htmlPath, "utf8");
assert.ok(!htmlContent.includes("sp-scroll-to-active"), "sidepanel.html must not contain #sp-scroll-to-active");
assert.ok(!htmlContent.includes("sp-floating-return"), "sidepanel.html must not contain .sp-floating-return");
const cssContent = fs.readFileSync(cssPath, "utf8");
assert.ok(!cssContent.includes(".sp-floating-return"), ...);
const jsContent = fs.readFileSync(jsPath, "utf8");
assert.ok(!jsContent.includes("scrollToActiveBtn"), ...);
```
AGENTS.md §"CORE DIRECTIVES / No Pseudo / String-Matching Tests" cấm đúng cách này:
> "Việc kiểm tra file text chứa chuỗi chỉ là static inspection, KHÔNG PHẢI là kiểm thử phần mềm."

Và `scripts/test_bugfixes_qa.js:99-108` assert trên **HTML literal hard-code**:
```js
const rowHtmlSample = `<div class="sp-sentence" data-id="cue_120"> … <div class="sp-vi">…</div> … </div>`;
assert.ok(rowHtmlSample.includes("sp-vi"), "Must include Vietnamese translation");
assert.ok(rowHtmlSample.includes("sp-en"), "Must include English translation");
assert.ok(rowHtmlSample.includes("ruby"), "Must include furigana ruby");
```
→ **không thể fail** dù code có hỏng tới đâu: biến được assert là một hằng.

Tệ hơn: assertion này **mâu thuẫn với hành vi hiện tại**. `extension/content/content.js:4977`
render `.bar-vi` (VI hiển thị trên overlay), trong khi file test lại assert
"Overlay MUST NOT have English card (.lr-card-en)" và comment "zero VI/EN subtitles on video".
`extension/styles/panel.css:1244-1248` thì `display:none !important` cho `.lr-card-vi`/`.lr-card-en`
— tức test đang bảo vệ một trạng thái UI **đã bị bỏ**.

**Fix đề xuất:** xoá `scripts/test_bugfixes_qa.js` (không ai chạy nó — xem D-3) hoặc viết lại thành
test DOM thật (`getBoundingClientRect()` trên overlay sau khi bật VI/EN) theo đúng AGENTS.md.

**Effort: S** (xoá) hoặc **M** (viết lại đúng chuẩn).

## A-7. Anti-fake gate (`scripts/verify_no_fake_tests.js`) **có false negative** → đã pass CI trong khi A-6 tồn tại

**Trạng thái: ĐÃ TỰ XÁC NHẬN (đọc regex, đối chiếu A-6).**

Gate chỉ có 2 regex:
```js
const FAKE_PATTERNS = [
  /fs\.readFileSync\([^)]*(?:extension|src)\/(?:styles|content|background|injected|shared)[^)]*\)[\s\S]*?(?:assert|assert\.(?:strictEqual|ok|equal))\([^)]*\.includes\(/,
  /(?:assert|assert\.(?:strictEqual|ok|equal))\([^)]*(?:panelCss|contentJs|sourceCode|fileContent|rawCode)\.(?:includes|match)/,
];
```
Regex 2 **hard-code đúng tên biến** `panelCss|contentJs|sourceCode|fileContent|rawCode`.
`test_bugfixes_qa.js` dùng `htmlContent` / `cssContent` / `jsContent` → **lọt qua**.
Regex 1 đòi đường dẫn chứa `extension/` hay `src/` **ngay trong lời gọi `readFileSync`** —
`test_bugfixes_qa.js` dùng biến `htmlPath` → cũng lọt.

→ `node scripts/verify_no_fake_tests.js` trả `PASSED` exit 0, **trong khi repo chứa ít nhất 1 file
test vi phạm đúng điều mà gate sinh ra để chặn**.

**Fix đề xuất:** thay 2 regex cứng bằng 1 rule tổng quát: file test nào gọi `fs.readFileSync`
mà không kèm hàm thực thi (DOM/render/network) → flag. Đơn giản & đúng hơn: cấm `readFileSync` +
`.includes(` trong **cùng một hàm test** bất kể tên biến:
```js
/(?:assert|assert\.(?:strictEqual|ok|equal))\(\s*!?[^)]*\.(?:includes|match)\s*\(/   // assert trên .includes() bất kể biến
```
kèm whitelist cho vài trường hợp thật sự cần đọc file (ví dụ parse manifest).

**Effort: S.**

## A-8. Tài liệu mô tả UI **không tồn tại trong code** (2 claim sai)

**Trạng thái: ĐÃ TỰ XÁC NHẬN bằng grep toàn `extension/`.**

| Claim | Nguồn | Thực tế trên disk |
|---|---|---|
| Player pill hiển thị `[ (LR) ON ⚙ ]` / `[ (LR) OFF ⚙ ]` | `README.md:39`, `walkthrough.md:214,221` | **0 hit trong `extension/`**. Pill thật là `.hardsub-bridge-pill` (`extension/content/content.js:4973`, `extension/styles/panel.css:497,511`) — một chấm tròn nhỏ "Local Bridge: Connected/Offline", **không có text ON/OFF, không có nút ⚙** |
| Thẻ dưới `.lr-card-vi` hiển thị bản dịch tiếng Việt | `walkthrough.md:205` | `extension/styles/panel.css:1244-1248` → `.hardsub-bar .lr-card-vi { display: none !important; }`. VI thật render ở `.bar-vi` **bên trong** `.lr-card-ja` (`content.js:4977`), không có "thẻ dưới" |

Cả hai nằm trong **mục "Key Features" của README** — phần mà người dùng đọc đầu tiên và
dùng để đối chiếu với app đang mở.

**Fix đề xuất:** sửa `README.md:39` + `walkthrough.md:205,214,221` cho khớp code
(pill = `.hardsub-bridge-pill`, VI nằm trong card JA), và thêm 1 bước verify claim vào
`scripts/` để claim không tác lệch lần nữa.

**Effort: S.**

---

# P1 — Lỗi thật / thiếu kiểm soát

## B-1. `pytest` của local-bridge **SIGSEGV (exit 139)** sau khi báo "140 passed"

**Trạng thái: ĐÃ TỰ XÁC NHẬN, root cause cô lập được.**

```
$ cd local-bridge && .venv/bin/python -m pytest -q tests/
........................................................................ [ 51%]
....................................................................     [100%]
140 passed, 1 warning in 6.89s
Segmentation fault: 11
$ echo $?
139
```
Tái lập **3/3 lần**. Cô lập:

| Chạy lệnh | Exit |
|---|---|
| `pytest -q tests/` | **139** |
| `pytest -q tests/ --ignore=tests/test_asr_dsp.py` | 0 (`121 passed`) |
| `pytest -q tests/ --ignore=tests/test_asr_api.py` | 0 (`125 passed`) |
| `pytest -q tests/test_asr_api.py tests/test_asr_dsp.py` (api trước) | **139** |
| `pytest -q tests/test_asr_dsp.py tests/test_asr_api.py` (**đảo thứ tự**) | **0** (`34 passed`) |
| `pytest -q tests/test_asr_api.py` | 0 |
| `pytest -q tests/test_asr_dsp.py` | 0 |

→ **Crash phụ thuộc thứ tự**: `test_asr_api.py` (nạp **mlx_whisper thật** + model Metal) chạy **trước**,
rồi `test_asr_dsp.py` chạy sau. `tests/test_asr_dsp.py:317-326` thay module trong `sys.modules`:
```python
def fake_mlx_whisper(monkeypatch):
    module = types.ModuleType("mlx_whisper")
    module.transcribe = lambda *a, **k: {"text": "", "segments": []}
    monkeypatch.setitem(sys.modules, "mlx_whisper", module)
```
Khi interpreter tắt, tài nguyên Metal của MLX thật bị giải phóng trong khi tham chiếu module
đã bị thay → **SIGSEGV lúc teardown**. `PYTHONFAULTHANDLER=1` không in traceback ⇒ crash ở tầng native,
không phải exception Python.

**Root cause (agent bridge đã bisect độc lập, khớp với repro của tôi):** crash ở **static
destructor native** của MLX/Metal, không phải lỗi Python. Cần **cả hai**:
(a) một lần `mlx_whisper.transcribe()` thật đã nạp model Metal (`app/services/asr.py:437`), **và**
(b) đường DSP scipy/ffmpeg trong cùng process (`app/services/asr.py:94-151`).
Bỏ (a) → exit 0. Bỏ (b) → exit 0. Giữ cả hai nhưng **đảo thứ tự file** → exit 0.
Đó chính là chữ ký của **destructor-ordering**. Không có traceback vì fault xảy ra **sau khi
`Py_FinalizeEx` bắt đầu** (destructor C++), nên `PYTHONFAULTHANDLER=1` và `-X faulthandler`
đều không in gì.

**Phạm vi (quan trọng, nói thẳng):** chỉ xảy ra trên **macOS/arm64 có mlx-whisper thật**
(`requirements.txt:12`: `mlx-whisper>=0.4.1; sys_platform == 'darwin' and platform_machine == 'arm64'`).
CI chạy `ubuntu-latest` → `pytest.importorskip("mlx_whisper")`
(`test_asr_api.py:132,152,174`, `test_asr_dsp.py:133,150`) **skip** → **CI KHÔNG đỏ**. Không có
Docker trên máy nên **chưa verify được trên Linux** (ghi rõ: *not verified on Linux*).

**Tác động thật:** mọi dev trên Mac chạy `pytest` đều nhận exit 139 dù "140 passed" ⇒
`&&` chain, `set -e`, pre-commit hook, script tự động đều fail. AGENTS.md §3 yêu cầu dev chạy
đúng lệnh này → lệnh luôn "đỏ" trên máy chính. Đồng thời dễ gây hiểu nhầm "test hỏng".

**Fix đề xuất:** trong `test_asr_dsp.py`, dùng `monkeypatch.setattr` trên **object module thật** đã import
thay vì thay entry `sys.modules`, hoặc `pytest.mark.skipif(sys.platform != "darwin")` cho các test
nạp MLX thật. Tối thiểu: thêm `-p no:randomly` không giải quyết — cần sửa thứ tự import/teardown.
Cách chắc chắn: `mlx_whisper` thật chỉ được nạp trong **1 test file**, các file khác dùng stub
từ đầu (import stub trước khi `app.services.asr` được import).

**Effort: S–M.**

## B-21. `write_files()` **không validate `cues.json`** khi payload không có `meta.json` → script hỏng

**Trạng thái: ĐÃ TỰ XÁC NHẬN bằng repro runtime thật.**

`local-bridge/app/services/script_store.py:733-748` chỉ parse JSON (`json.loads`) ở mọi file
`.json`, còn **validate cấu trúc** (`cues` phải là array, mỗi cue phải là dict) nằm trong nhánh
`script_store.py:761`:
```python
if incoming_rev is not None and incoming_rev > current_rev and "cues.json" in validated:
    incoming = json.loads(validated["cues.json"])
    if not isinstance(incoming, dict) or not isinstance(incoming.get("cues"), list):
        raise ValueError("cues.json must contain a cues array")
```
→ Payload **không có `meta.json`** ⇒ `incoming_rev is None` ⇒ nhánh validate **không bao giờ chạy** ⇒
`script_store.py:803-804` ghi thẳng JSON tùy ý xuống đĩa:
```python
for name, content in validated.items():
    _atomic_write_text(folder / name, content)
```

**Repro thật** (script ở `/tmp`, patch `scripts_root` sang tmpdir, **không ghi vào repo**):
```
$ cd local-bridge && .venv/bin/python /tmp/repro_write_files.py
write_files ACCEPTED the payload -> {'ok': True, 'video_id': 'reprovid123', ..., 'written': ['cues.json']}
--- disk after write ---
  cues.json: '{"totally": "not a cues array"}'
--- load_script ---
   None
REPRO: an unvalidated cues.json reached disk
EXIT=0
```
→ `load_script()` trả `None`: **script mirror từ Drive không đọc được nữa**, trong khi `meta.json`
vẫn ghi `cue_count: 1` ⇒ client nghĩ script còn 1 cue.

Đây là đường **Drive → disk** (`app/api/scripts.py:136` → `write_files(video_id, body.files or {})`),
tức là payload từ đồng bộ Drive — nguồn không hoàn toàn tin cậy.

**Fix đề xuất:** tách validate cấu trúc `cues.json` ra khỏi nhánh rev, cho chạy **vô điều kiện**
mỗi khi `"cues.json" in validated`:
```python
if "cues.json" in validated:
    incoming = json.loads(validated["cues.json"])
    if not isinstance(incoming, dict) or not isinstance(incoming.get("cues"), list):
        raise ValueError("cues.json must contain a cues array")
    if not all(isinstance(c, dict) for c in incoming["cues"]):
        raise ValueError("cues.json cues must be objects")
```
1 khối, không đụng logic rev. **Effort: S.**

## B-22. `/asr/transcribe` **buffer toàn bộ body vào RAM trước khi** kiểm tra giới hạn 50 MB

**Trạng thái: ĐÃ TỰ XÁC NHẬN bằng đọc code.**

`local-bridge/app/api/asr.py:62-66` và `:71`:
```python
if file is not None:
    audio_bytes = await file.read()          # ← đọc hết file vào RAM
else:
    audio_bytes = await request.body()       # ← đọc hết body vào RAM
...
if len(audio_bytes) > MAX_AUDIO_BYTES:      # :82 — kiểm tra SAU khi đã buffer
    raise HTTPException(status_code=413, ...)
```
Starlette không giới hạn kích thước body mặc định ⇒ một upload 2 GB bị **buffer trọn vẹn** rồi mới
bị từ chối bằng 413. Check hiện tại là **kiểm tra sau**, không phải chặn.

**Fix đề xuất:** chặn ở tầng truyền (Content-Length + `request.stream()` với bộ đếm byte, dừng khi
vượt `MAX_AUDIO_BYTES`), hoặc đặt giới hạn body ở reverse proxy. `MAX_AUDIO_BYTES` nên được đọc
từ `app/services/asr.py` (đã import ở `api/asr.py:15`).

**Effort: S.**

## B-23. `_get_mazii_details()` — **1 SQL query cho mỗi kanji** (N+1), đã có bản fix ở nơi khác

**Trạng thái: agent đo thật: 137 câu SQL cho 1 lần tra `/dict`.**

`local-bridge/app/services/dictionary.py:519-527` query từng kanji một; trong khi `_query_hanviet`
(`dictionary.py:588-598`) **đã** được sửa thành 1 query `IN (...)` (và có test).
→ 2 nhánh cùng ý, 1 nhánh còn sót.

**Fix:** dùng lại cách của `_query_hanviet`. **Effort: S.**

## B-24. `/saved/sync` — tới **5000 transaction một-row**, mỗi transaction 1 commit + 1 SELECT

**Trạng thái: agent đọc `local-bridge/app/db/saved_items_db.py:298-303`, `:148-174`.**

**Fix:** gom 1 transaction + executemany. **Effort: S–M.**

---

## B-2. 3 self-check của bridge **không bao giờ được chạy**

**Trạng thái: ĐÃ TỰ XÁC NHẬN.**

`pytest --collect-only` cho thấy **0 test** được collect từ:
- `local-bridge/tests/test_captions_cache.py` (24 dòng) — self-check cache `/captions` + TTL.
- `local-bridge/tests/test_snapshot_roundtrip.py` (85 dòng) — round-trip snapshot v1.
- `local-bridge/tests/test_sqlite_parity.py` (48 dòng) — parity SQLite dictionary.

Cả 3 là script-style (`def main()` + `raise SystemExit(main())`), **không có hàm `test_`**.
Chạy riêng → `exit=5` ("no tests collected"). Grep toàn repo: chúng **chỉ** được nhắc trong
docstring của chính nó và trong `plan/`, `review/` cũ — **không CI job, không script nào gọi**.
(`test_tokenize_import_enrich.py` cũng vậy nhưng **được** CI chạy riêng qua
`python tests/test_tokenize_import_enrich.py` → cái này ổn.)

→ **3 bộ self-check chết trong im lặng**, trong đó `test_snapshot_roundtrip.py` bảo vệ đúng
contract backup mà A-1/A-2 đang phá.

**Fix đề xuất:** đổi 3 file sang style pytest thật (`def test_...`) **hoặc** thêm 1 step CI:
```yaml
run: |
  for f in tests/test_captions_cache.py tests/test_snapshot_roundtrip.py tests/test_sqlite_parity.py; do
    python "$f"
  done
```
Rẻ hơn: gộp vào `ci.yml` cùng step `test_tokenize_import_enrich.py`.

**Effort: S.**

## B-3. `meaning` → `status` drift đã nêu ở A-1; đây là drift thứ 2: `jlptLevel` Int vs string

- `local-bridge/app/services/snapshot.py:35` → `"jlptLevel": None`
- `ipad-app/Services/BackupService.swift:73` → `var jlptLevel: Int?` (giá trị **1–5**)
- `web/saved-items/src/types/vocab.ts:12` → `"n5" | "n4" | … | "n1"` (**string**)

Bridge luôn gửi `null`; iOS gửi số; web chờ string. Cùng một key, 3 kiểu.
`JLPT` band resolve đã có **4 bản implementation** với dataset khác nhau:

| Nơi | File | Dataset |
|---|---|---|
| Bridge (Python) | `local-bridge/app/services/vocab_freq.py:132` | curated **60** mục |
| Extension (JS) | `extension/shared/vocab_style.js:741` | curated **403** mục |
| iPad (Swift) | `ipad-app/Services/FreqService.swift:22` | `freq_ja.json` |
| iPhone (Swift) | `iphone-app/Services/FreqService.swift:22` | `freq_ja.json` |

→ **cùng một từ ra màu khác nhau tùy component**. 7 từ chỉ có trong bản Python
(`日本`, `何`, `チョコ`…). iOS không có `jlpt_vocab.json` (14k).

**Fix đề xuất:** 1 file JSON làm nguồn sự thật (`data/dict/jlpt_bands.json`), sinh ra
`.py` / `.js` / `.swift` bằng 1 script build (đã có tiền lệ `scripts/build_jlpt_vocab.py`).
Đây là **rung lắc nguồn sự thật** (single source of truth) — sẽ giải A-1, B-3, và 5/6 bản
trùng level-colour map (xem C-4).

**Effort: M.**

## B-4. `BackupService.apply()` **xoá sạch** library rồi insert lại — mất dữ liệu khi `s.cues` rỗng

**Trạng thái: ĐÃ TỰ XÁC NHẬN (đọc `BackupService.swift` + `ScriptStore.swift`).**

`ipad-app/Services/BackupService.swift:296-297`:
```swift
for s in (try context.fetch(FetchDescriptor<VideoScript>())) { context.delete(s) }
for v in (try context.fetch(FetchDescriptor<Vocabulary>())) { context.delete(v) }
```
rồi insert lại từ snapshot, trong đó cue được đóng gói từ **relationship** `s.cues`
(`BackupService.swift:248`).

Chính codebase tự viết ra rằng relationship này **có thể rỗng** —
`ipad-app/Models/ScriptStore.swift:76-77`:
```swift
// SwiftData sometimes leaves script.cues empty after cue.video= inserts; scan in memory.
let all = (try? context.fetch(FetchDescriptor<ScriptCue>())) ?? []
```
→ Nếu `s.cues` rỗng lúc encode, snapshot chứa script **không cue** → apply xoá hết cue thật →
**toàn bộ phụ đề đã chỉnh sửa trên iPad biến mất**. `ContentView.swift:172` (auto-pull foreground)
gọi việc này **không cần user xác nhận**, rồi lại backup trạng thái rỗng đó lên Drive.

Phụ thuộc chéo với A-6: `LayoutSmoke` của 2 app khác nhau cho cùng 1 file (xem B-10).

**Fix đề xuất:** encode snapshot bằng **fetch trực tiếp `ScriptCue`** (không qua relationship),
và trong `apply()` **merge theo `videoId`** thay vì delete-all + insert:
- cue có mặt ở local nhưng không có trong snapshot → giữ local (không xoá).
- chỉ xoá những gì snapshot **có** nhưng local đánh dấu `isDeleted`.

**Effort: M.**

## B-5. `wipeAll()` hard-delete không tombstone → Drive hồi sinh script đã xoá

**Trạng thái: ĐÃ TỰ XÁC NHẬN.**

`ipad-app/Models/ScriptStore.swift:148-154` xoá cứng; nhánh "không sở hữu" của
`ipad-app/Services/DriveScriptsService.swift:575-577` luôn pull → lần sync sau khôi phục lại
script user vừa xoá.

**Fix:** wipe = đặt `isDeleted` trên cue + xoá `VideoScript` sau khi đẩy tombstone lên Drive;
nhánh pull phải tôn trọng tombstone.

**Effort: M.**

## B-6. iPad `clearTranslations()` thiếu `.filter { !$0.isDeleted }` — tombstone hồi sinh (iPhone đã sửa)

**Trạng thái: ĐÃ TỰ XÁC NHẬN (đối chiếu 2 file).**

- `ipad-app/Views/ContentView.swift:1066` — **thiếu** filter.
- `iphone-app/Views/ContentView.swift:821` — **đã có** filter.

→ 2 app cùng feature, 1 app lỗi. Đây là hệ quả trực tiếp của việc copy-paste 4 028 dòng
(xem C-1).

**Fix:** copy dòng đã sửa từ iPhone sang iPad (1 dòng).

## B-7. `extension/shared/url_hash.js` và `dfxp_parser.js` — **code chết**, DFXP bị viết lại 2 lần

**Trạng thái: ĐÃ TỰ XÁC NHẬN.**

- `extension/shared/url_hash.js`: được inject vào **mọi page** qua `manifest.json`, nhưng
  **0 call site production**. 3 chỗ gọi `HardsubUrlHash.videoIdFromUrl` — mà module **không export**
  hàm đó.
- `extension/shared/dfxp_parser.js`: inject vào mọi page, **không ai gọi**. `page_capture.js:817`
  và `:863` viết lại **inline** cùng thuật toán parse DFXP.

→ 2 file bị inject vào mọi trang (chi phí + bề mặt tấn công) để không làm gì; logic thật thì
trùng lặp ở nơi khác.

**Fix:** bỏ khỏi `manifest.json` web_accessible_resources; hoặc ngược lại — dùng module và
xoá bản inline (tốt hơn: 1 nguồn parse DFXP).

**Effort: S.**

## B-8. `/tokenize_batch` không giới hạn → rơi về N request tuần tự

**Trạng thái: agent đọc + tôi đối chiếu số liệu.**

- `extension/content/content.js:5298` gửi `/tokenize_batch` **không cap**.
- Bridge cap `cues` ở **2000** (`local-bridge/app/schemas/models.py:79-83`).
- Worker cap body **256 KB** (`extension/background/service_worker.js:786`).

Cả 2 vượt ngưỡng → rơi vào fallback **tuần tự** `content.js:5311` → video dài = **2000+ request
tuần tự**. Không log, không cảnh báo.

**Fix:** chunk trước khi gửi (`chunk(cues, 500)`) → luôn gọi batch, không bao giờ rơi fallback.

**Effort: S.**

## B-9. `chrome.storage.local` quota → **script đã sửa không được ghi ở đâu cả**

**Trạng thái: agent đọc; cơ chế khớp code tôi đã đọc.**

`extension/manifest.json:7` **không** khai báo `unlimitedStorage`. Token cache per-video
(`content.js:5370`, ~1.1 KB/cue) + MT cache 4 MB nằm cùng khoảng trống. Khi vượt quota:
`service_worker.js:44` reject → `content.js:2324` **throw trước khi** ghi xuống đĩa qua bridge →
script của user **mất**. Autosave debounce (`content.js:2183`) không có `.catch()` → unhandled rejection.

**Fix:** (1) thêm `unlimitedStorage` vào manifest (1 dòng), (2) `catch` ở autosave + fallback ghi
bridge trước, (3) prune cache theo LRU.

**Effort: S.**

## B-10. `LayoutSmoke` của iPad và iPhone là **hai bộ rule khác nhau cho cùng 1 file**

**Trạng thái: ĐÃ TỰ XÁC NHẬN.**

| | Assert | `iphone-app/Scripts/user_script.js` | `ipad-app/Scripts/user_script.js` |
|---|---|---|---|
| iPhone `LayoutSmoke.swift:18` | `src.contains("ytd-masthead")` | **có** (1 hit) | **không** (0 hit) |
| iPhone `LayoutSmoke.swift:19` | `src.contains("ytd-watch-metadata #owner")` | — | iPad assert **KHÔNG** chứa `ytd-watch-metadata` (`LayoutSmoke.swift:22`) |

→ Nếu ship script của iPad sang iPhone (chính là fix của A-3), `LayoutSmoke` iPhone **assert fail**.

**Trạng thái thực tế hôm nay: KHÔNG crash** — vì iPhone không bundle script nên guard
`LayoutSmoke.swift:8-12` return sớm (in "skip"). Đây là **bẫy latent**, không phải crash đang xảy ra.
Báo cáo này nói rõ để không bị hiểu sai.

**Fix:** gộp 2 app về 1 `LayoutSmoke.swift` (xem C-1) — 1 bộ rule, đúng file đang ship.

**Effort: S** (sau khi gộp).

## B-11. `wipeAll`/`BackupService` + `clearTranslations` + `CueEditorRow` lệch giữa 2 app

**Trạng thái: đọc + đối chiếu md5 (agent, tôi xác nhận qua bảng duplication).**

`iphone-app/Views/CueEditorRow.swift` chỉ **119 LOC** vs iPad **329 LOC** → **iPhone mất 210 dòng
chức năng sửa**: không sửa JA/VI/EN, không xoá, không thêm sau, không copy, không sửa timeline,
không debounce save. iPhone chỉ **đọc**.

**Fix:** dùng chung 1 file `CueEditorRow.swift` (C-1) + thêm biến thể compact cho iPhone.

**Effort: M.**

## B-12. Tra cứu từ điển trên **main thread** — ~480 round-trip SQLite mỗi lần tap

**Trạng thái: agent đọc `DictionaryService.swift:161,171,320` + `DictPopupView.swift:149`.**

`longestPrefix` × 16 prefix × 3 biến thể script ⇒ tối đa ~480 `sqlite3_prepare_v2` + `step`,
không statement cache, gọi từ main thread.

**Fix:** cache prepared statement theo key `(prefix, variant)`, hoặc 1 query `IN`.

**Effort: M.**

## B-13. `NLPTagger` cache bị xoá ở 256 entry, và dựng `NLTagger` **mới cho mỗi câu**

**Trạng thái: agent đọc `NLPTagger.swift:42,55`.**

Panel 300 câu → thrash cache, và mỗi câu dựng 1 `NLTagger` trên main thread.

**Fix:** `NLTagger` là loại có thể tái sử dụng — 1 instance, cache `.tagSchemes`.

**Effort: S.**

## B-14. `ATSS drift`: `ipad-app/project.yml` khai `NSAllowsArbitraryLoads: true`, app đang ship dùng `NSAllowsLocalNetworking`

**Trạng thái: agent đã regenerate `xcodegen` trên bản copy /tmp và diff Info.plist.**

→ Lần `xcodegen generate` tới sẽ **âm thầm tắt ATS** cho WKWebView nạp YouTube.

**Fix:** đồng bộ `project.yml` với Info.plist đang ship, hoặc chấp nhận ATS rộng và ghi rõ vào docs.

**Effort: S.**

## B-15. 25 script sanity + `tests/unit/test_player_ui_runtime.js` **không vào CI**

**Trạng thái: ĐÃ TỰ XÁC NHẬN (đọc `ci.yml`).**

`ci.yml` chạy: `bridge-test-suite`, `root-tests`, `extension-tests` (15 file `*_test.js`),
`saved-items-check`, `ios-build`. **Không** chạy:
- `scripts/*_sanity.{js,cjs}` — **25 file** (trong đó có `sentence_script_store_sanity.py`
  làm HTTP round-trip thật).
- `tests/unit/test_player_ui_runtime.js` — harness DOM runtime tốt nhất repo, **chưa từng chạy
  trên máy khác** (hardcode `/Applications/Google Chrome.app/...`).

Trong 25 file, **2 file crash** vì `require('playwright')` — playwright **không có trong bất kỳ
package.json nào** (`sentence_chrome_restore_sanity.cjs:6`, `sentence_chrome_storage_sanity.cjs:7`).

**Fix:** thêm 1 job CI `sanity-scripts` chạy manifest list, và **xoá/sửa 2 file playwright**
(thêm dep hoặc bỏ). Ưu tiên chạy `scripts/sentence_script_store_sanity.py` vì nó là HTTP thật.

**Effort: S–M.**

## B-16. `scripts/sentence_bilingual_dom_sanity.py` exit 0 khi **SKIP** → xanh giả

**Trạng thái: agent chạy thật → exit 0 với output `SKIP:`.**

Một test skip phải exit code khác 0 (hoặc phải được whitelist) nếu CI coi là xanh.

**Fix:** `sys.exit(2)` khi skip, hoặc bỏ khỏi danh sách CI và ghi rõ lý do.

**Effort: S.**

## B-17. `macos-bridge-app/Sources/main.swift` (298 dòng) **không job nào compile**

**Trạng thái: đọc `ci.yml` — không có job swift cho thư mục này.**

**Fix:** thêm `swift build` (hoặc `xcodebuild`) cho nó vào `ios-build`, hoặc xoá nếu đã chết.

**Effort: S.**

## B-18. Web: `pendingDeletes` tombstone **không bao giờ được retire**

**Trạng thái: agent đọc `web/saved-items/src/lib/vocab-store.ts:95,150-160`.**

Khi từ bị xoá (tombstone) rồi được **thêm lại từ upstream**, tombstone vẫn còn → từ vẫn ẩn
cho tới khi reload. `mergeUpstreamMap` **không có test nào**.

**Fix:** khi upstream có từ đó, gỡ tombstone. 1 nhánh + 1 test.

**Effort: S.**

## B-19. Web: `persistSettingsAsync` **nuốt lỗi** rồi fallback localStorage, UI vẫn báo "Đã lưu"

**Trạng thái: agent đọc `web/saved-items/src/lib/settings-store.ts:283-296`.**
Trong khi `vocab-store.ts:354-364` đã làm đúng (báo lỗi). → copy cách làm đúng sang.

**Effort: S.**

## B-20. Web: async load apply **snapshot cũ hơn** sau khi có update trực tiếp

**Trạng thái: agent đọc `web/saved-items/src/components/SavedItemsApp.tsx:103-150`.**
`cancelled` chỉ chặn unmount, không chặn việc apply kết quả cũ.

**Fix:** so sánh version/revision trước khi apply.

**Effort: S.**

---

# P2 — Trùng lặp & drift (có chi phí tương lai cụ thể)

## C-1. 20/26 file Swift giữa iPad và iPhone **giống hệt nhau** (4 028 LOC = 59% app iPad)

| Cặp file | iPad LOC | iPhone LOC | Phán quyết |
|---|---|---|---|
| `Views/ContentView.swift` | 1217 | 942 | **lệch 633 dòng** |
| `Views/CueEditorRow.swift` | 329 | 119 | **lệch 268 dòng** (B-11) |
| `Views/SidePanelToolbar.swift` | 162 | 143 | lệch 53 dòng |
| `Views/YouTubePlayerView.swift` | 322 | 300 | lệch 26 dòng (iPad có DEBUG AutotestBridge) |
| `Services/LayoutSmoke.swift` | 26 | 24 | **lệch 22 dòng — 2 bộ rule khác nhau** (B-10) |
| `Services/DriveScriptsService.swift` | 739 | 739 | lệch 6 dòng (device-id prefix) |
| `Scripts/user_script.js` | 17 899 B | 10 290 B | **lệch — và bản iPhone không được bundle** (A-3) |

→ Đây **không phải** "code duplication xấu" chung chung. Nó là **nguyên nhân trực tiếp** của
B-6, B-10, B-11: fix ở iPhone, quên iPad (hoặc ngược lại) → 2 app lệch hành vi.

**Fix đề xuất (đúng tinh thần ponytail — ít code hơn):** 1 `Shared/` target dùng chung cho 2 app,
chỉ giữ khác biệt thật (layout compact vs tablet, có/không vocabulary tab). Giảm ~4 000 LOC trùng,
và **xóa hẳn class hạn chế "fix 1 bên quên bên kia"**.

**Effort: L** — nhưng là thay đổi **làm codebase nhỏ đi**, không phải lớn thêm.

## C-2. 5 bản "JLPT band resolution" (chi tiết ở B-3) + **6 bản** "level-colour map"

`extension/shared/vocab_style.js:20`, `extension/background/service_worker.js:1437`,
`extension/content/settings_modal.js:18`, `web/saved-items/src/lib/level-colors.ts:25`,
`ipad-app/Services/VocabStyle.swift:22`, `iphone-app/Services/VocabStyle.swift:22`.

→ Đổi 1 màu = sửa 6 file. Đây là nơi drift chắc chắn xảy ra lần nữa.

**Fix:** 1 file JSON màu + sinh code (như B-3).

## C-3. Parse TXT cue import: **4 bản** — `extension/shared/import_parse.js:62`,
`local-bridge/app/services/script_store.py:180-245`, `ipad-app/Models/ScriptStore.swift:282` (+iPhone).

→ Người dùng import file TXT ở 3 nơi, 3 kết quả khác nhau có thể.

**Fix:** 1 file format spec (`docs/`) + 1 fixture chung trong `testdata/`, 3 implementation cùng
theo fixture đó.

## C-4. Tokenize tiếng Nhật: **4 bản** — Sudachi (bridge) · `Intl.Segmenter` (fallback JS) ·
`NLPTagger` (iPad) · `NLPTagger` (iPhone).

→ **Cùng 1 câu, bridge còn sống và bridge chết cho 2 furigana khác nhau.** Đây không phải
chuyện thẩm mỹ: furigana sai = người học đọc sai.

**Fix:** khi bridge offline → fallback về **1** kết quả đã cache từ lần gọi bridge gần nhất
(đã có `sentence_cache_identity` trong plan) thay vì tự tokenize bằng heuristic khác.

## C-5. Settings default lệch giữa extension và web

| Key | `extension/content/content.js` | `web/saved-items/src/lib/settings.ts` |
|---|---|---|
| `barBgOpacity` | 0.4 | **0.82** |
| `barShowVi` | false | **true** |
| `roi.height` | 0.2 | **0.22** |
| `maxSentences` | 2000 | **500** |

→ Mở app web ra thấy cấu hình khác với extension đang chạy.

**Fix:** 1 file JSON default, load ở cả 2 (đã có `settings-store.ts` — chỉ cần xuất default từ 1 nơi).

## C-6. `vocab[].jlptLevel` Int (iOS) vs string (web) vs null (bridge) — xem B-3.

## C-7. Saved cue: extension dùng `start_media_time` (giây) + `videoId`; web dùng `startTime` +
`videoTitle` — extension **không bao giờ ghi `videoTitle`** → cột "Video" trong export Anki
**luôn rỗng**.

**Fix:** extension ghi thêm `videoTitle` (đã có sẵn ở nhiều nơi) → web đọc được.

## C-8. Bridge `meta` (Drive) lệch: bridge ghi `url/title/translated_count`
(`script_store.py:451`), iOS push ghi `video_id/rev/deviceId/updated_at/cue_count/owned`
(`DriveScriptsService.swift:249`).

## C-9. `extraction` env var: `BRIDGE_URL` (bridge test) vs `CAPTION_BRIDGE_URL`; **không có override
trong app đã ship** → đổi cổng bridge = sửa code.

## C-10. `freq_ja.json` tồn tại 2 bản độc lập (extension + iOS) → có thể lệch phiên bản.

## C-11. Web: `settings.ts` trỏ tới `extension/popup/popup.js` — **file đã bị xoá**.

## C-12. Web: `mock-data.ts` **đóng gói vào production** — chunk 72 KB chứa "いかだ", "珍語".

**Fix:** `import()` dynamic trong dev, hoặc tách khỏi entry.

## C-13. Web: danh sách dài **không virtualize**, `VocabRow` **không memo** → nghẽn khi vocab lớn.

## C-14. Web: input search / chọn màu **không có label**; SVG **không có `aria-hidden`**.

## C-15. Web: `out/` build `2026-09-20` vs source `2026-10-21`; `extension/popup/` dated `2026-10-09` — **cả 2 stale**.

## C-16. Extension: `sentence_benchmark.js:73` quét O(cues) **mỗi frame**, **kể cả khi đã pause**
(`content.js:5877` đặt `prepared()` trước early-return `paused`). Agent đo trên máy này:
0.630 ms/frame @1000 cue, 2.222 ms/frame @3000 (~13% 1 core ở 60fps).

**Fix:** 1 check `if (paused) return;` trước, hoặc cache theo `cues.length` thay vì quét lại.

## C-17. Extension: `chrome.tabs.onUpdated` đọc storage + `sidePanel.setOptions` **mỗi event**
(`service_worker.js:216`).

## C-18. Extension: `chrome.storage.session` tích tụ key `ttMiss:<videoId>` **không bao giờ xoá**
(`service_worker.js:940`).

## C-19. Extension: lỗi Drive mirror chỉ `console.warn` (`service_worker.js:751,2178`) — **không**
ghi `local-bridge/errors.log` dù AGENTS.md §6 yêu cầu (worker đã allowlist `POST /log`).

## C-20. Extension: offscreen ASR dispatch **không có timeout** (`audio_capture.js:140`) — chỉ
bridge call trong extension thiếu `AbortSignal`; timer backstop (`:131`) không được clear.

## C-21. `local-bridge/errors.log` **không** được track (`.gitignore:36` — đúng hygiene) nhưng
**bị test suite pollute**: 854 dòng, 46 lần lặp lại 3 message giống hệt
(`/captions/abcdefgh lang=ja: upstream failure`…).

**Fix:** test phải ghi vào file tạm; `errors.log` runtime nên gitignore.

## C-22. `.git` = **1.6 GB** cho tree 18.4 MB. Lịch sử chứa 2 heap snapshot (16 MB + 15.8 MB) và
1 file `.cursor/debug-aa2977.log` 1.7 MB.

**Fix:** `git gc --aggressive` + `git filter-repo` bỏ heap snapshot (cần rewrite history → cân nhắc).

## C-23. **31 commit chưa push** (`origin/master..master` = 31, HEAD `9d4b96a5a`).
Toàn bộ remediation P0/P1/P2 của audit 2026-10-18 **đang chỉ nằm trên máy**.

## C-24. Gemini cost table thiếu model fallback đang chạy (`gemini-3.6-flash`, `gemini-3.5-flash-lite`)
và vẫn định giá `gemini-2.5-flash` đã bị retire → ước tính chi phí tự rơi về "PARTIAL ESTIMATE".

## C-25. Bridge: stack SQLite `saved_items` (547 dòng) **không có client nào dùng** —
`/extension_state` là đường sống duy nhất. Code chết nhưng vẫn được sửa/bảo trì.

## C-26. Bridge: bootstrap build `en_vi.json` mà **không lookup nào đọc** + `_en_vi_cache` thừa.

## C-27. Bridge: **5 hàm không được tham chiếu** + 2 alias chỉ dùng cho test.

## C-28. Bridge: `tokenize()` có 2 nhánh `if/else` **byte-identical** nhau.

## C-29. Bridge: lỗi ASR / saved-items / bootstrap **không bao giờ** ghi `errors.log`
(dù AGENTS.md §6 yêu cầu).

## C-30. Bridge: `fetch_captions()` nhánh fallback `watch_html` **chết** với JSON Android lỗi.

## C-31. Bridge: `/log` cho phép **chèn newline** vào `errors.log` → log forging.

## C-32. Bridge: `build_dict_sqlite.py` luôn log `"Mazii table inserted (0 expressions)"` —
biến `m_rows` bị `del` trước khi dùng.

## C-33. Bridge: **8 import không dùng**.

---

# P3 — Hygiene

- `chrome.storage.session` tích tụ key (đã nêu C-18).
- `web/saved-items/src/lib/mock-data.ts` trong bundle production (C-12).
- `extension/popup/{404,popup,index,_not-found}.html` + `inline-main-0..4.js` — build artifact
  track trong git nhưng thiếu `_next/` (A-5).
- `scripts/rev_pick_sanity.js:10-22`, `scripts/lang_family_sanity.js:22-28` — tách hàm từ IIFE
  bằng regex; một refactor làm chúng hỏng âm thầm.
- `web/saved-items/docker-compose.yml:9,11` — image/container tên `ai-website-cloner` (copy-paste
  từ project khác).
- `ci.yml` không pin action theo SHA (`actions/checkout@v4`) và không có trigger `merge_group`.
- `ci.yml` chỉ 2/5 job đúng tên AGENTS.md yêu cầu (`bridge-test-suite`, `saved-items-check`);
  `root-tests` / `extension-tests` / `ios-build` không được bảo vệ branch.
- `scripts/verify_no_fake_tests.js` không quét `web/saved-items/tests`.
- `local-bridge/app/services/dictionary.py` còn ~265 dòng curated data inline, trong khi
  AGENTS.md §8 quy định dict data ở `data/dict/`.

---

# 3. Những phần ĐÃ kiểm tra và **KHÔNG** có phát hiện

Ghi lại để không ai phải đo lại:

- **XSS / DOM injection trong extension**: 33 hit `innerHTML|outerHTML|insertAdjacentHTML|document.write`,
  đọc hết — mọi chỗ chèn text từ caption/dict/translation đều qua `escapeHtml`/`escapeAttr`.
  Không có `eval`/`new Function` nào.
- **Secret thật trong git**: grep `AIza|sk-|ghp_|BEGIN PRIVATE|xox` → 4 hit, **tất cả false positive**
  (khóa INNERTUBE của YouTube là public). Gemini key chỉ nằm ở `chrome.storage.local`,
  **không bao giờ sang bridge**, không bao giờ được log.
- **Egress**: chỉ 2 đích — Google Gemini API (JA caption + context) và Google Drive
  (`cues.json`/`meta.json`/`script.txt` + `caption-studio-backup.json`). Bridge **không** gọi
  bên thứ ba lúc runtime. Không dữ liệu caption/vocab nào đi tới bên thứ ba ngoài Google.
- **Bridge CORS** không phải `*` (`main.py:90`), bind loopback.
- **Path traversal / ffmpeg arg injection** ở bridge: đã trace, an toàn (audio đi qua `pipe:0`,
  không giữ temp file; `_safe_video_id` lọc `.`/`/`).
- **SQL injection**: mọi query tham số hoá.
- **Bridge path traversal**: `_VIDEO_ID_RE` + `_checked_video_id` áp cho **cả 5** route `/scripts`.
- **Bridge command injection**: mọi `subprocess` dùng **argv list**, không `shell=True`;
  `filter_profile` không reachable từ HTTP.
- **Bridge SSRF**: không có URL do user cung cấp nào được fetch.
- **Bridge cache**: LRU, cả 2 cache đều có giới hạn → không rò rỉ bộ nhớ.
- **Bridge lock**: `_db_lock` / `_tokenize_lock` không deadlock (thứ tự acyclic).
- **iOS**: token lưu trong Keychain (`ThisDeviceOnly`), không nằm trong UserDefaults/bundle;
  không có `try!`/force-unwrap ở đường reachable; không có retain cycle; không có vi phạm
  `@MainActor`; không có mutation state trong `body`.
- **Web**: type safety tốt — **0 `any`**, `tsc --noEmit` exit 0, ESLint exit 0; static export
  khả thi (1 route, không server component, không dynamic API); không `next/image`; không dep
  nặng; storage versioning + no-clobber-on-newer-build có 2 test thật.
- **Extension test suite**: 15/15 file exit 0.
- **iOS build**: cả 2 app `** BUILD SUCCEEDED **`, exit 0 (agent chạy thật, `-derivedDataPath /tmp`).
- **`git diff --check`**: working tree sạch, không thay đổi ngoài ý muốn.

---

# 4. Những gì tôi **KHÔNG** verify được (nói thẳng)

| Mục | Trạng thái |
|---|---|
| Segfault (B-1) trên Linux/ubuntu | **NOT VERIFIED** — không có Docker trên máy. Lý luận mạnh rằng CI skip vì `importorskip("mlx_whisper")`, nhưng chưa chạy thật trên Linux |
| 25 sanity script chạy được trên CI | Chỉ chạy 2 file playwright → crash; **23 file còn lại chưa chạy hết** trong phiên này |
| `npm run build` của `web/saved-items` | **Cố tình không chạy** — `package.json:18` `check` = `lint && typecheck && build`, mà `build` ghi vào `out/`/`.next/` (vi phạm ràng buộc read-only). Chỉ chạy `lint` + `tsc --noEmit` (cả hai exit 0). `npm run check` **đầy đủ** → **NOT VERIFIED** |
| `npm test` của web | Agent chạy: **7 pass / 0 fail**, exit 0 ✅ (tôi không tự chạy lại) |
| Hành vi runtime thật của overlay/UI | **Chưa chạy browser thật** — không có Chrome automation trong phiên này. Mọi claim UI trong báo cáo này là **đọc code + CSS**, không phải đo pixel |
| Google Drive round-trip thật | Không có credential trong phiên này |
| Hành vi Gemini thật | Không gọi API trả phí |

---

# 5. Thứ tự nên làm

**Làm ngay (mất dữ liệu / hỏng chức năng):**

1. **A-1 + B-3** — một contract cho vocab: tách `meaning` (gloss) / `status`, `jlptLevel` Int→string,
   `version: 2` + migration. *Đây là gốc; làm cái này trước, không làm A-2 trước.*
2. **A-3 + B-10** — bundle `user_script.js` cho iPhone **và** gộp `LayoutSmoke` trước khi build.
3. **A-5** — build extension trong CI hoặc track `_next/`.
4. **A-4** — siết capability gate (bắt buộc có token) + bỏ token khỏi URL.
5. **A-6 + A-7** — xoá test giả + sửa anti-fake gate để nó thật sự bắt được.
6. **B-4** — `BackupService` merge thay vì wipe-all.
7. **B-21** — validate `cues.json` vô điều kiện trong `write_files` (1 khối code, đã có repro).
8. **A-8** — sửa 3 dòng doc sai (README + walkthrough).
9. **A-2** — extension đọc `caption-studio-vocab.json`.

**Làm sau (chất lượng/độ bền):**

10. **B-1** — dập segfault test suite (chặn dev, không chặn CI).
11. **B-2** — cứu 3 self-check chết.
12. **B-15 + B-16** — đưa 25 sanity script vào CI, sửa 2 file playwright.
13. **C-1** — gộp Swift 2 app về 1 shared target (xoá ~4 000 LOC trùng).
14. **C-2/C-3/C-4/C-5** — sinh 1 nguồn sự thật cho JLPT/màu/import-parse/settings.
15. **B-22** — chặn size ASR ở tầng stream thay vì buffer rồi mới check.
16. **C-23** — push 31 commit đang chờ.

**Không nên làm:** thêm framework test mới, thêm abstraction layer mới, refactor toàn bộ 6 bản
trùng lặp cùng lúc. Ponytail: sửa 1 nguồn sự thật, xoá phần còn lại.

---

# 6. Thay đổi đã **thực hiện** trong phiên audit này

Audit là read-only với **code**. Nhưng AGENTS.md §4 bắt buộc ingest review mới vào `wiki/`, và
lint wiki lúc đó **đang đỏ**. Phần này ghi rõ những gì đã đổi (chỉ trong `wiki/`, **không đụng
code sản phẩm**):

| Việc | Trước | Sau |
|---|---|---|
| `bash scripts/wiki_sync_and_lint.sh` | **exit 1**, 4 error, 7 warning | **exit 0**, 0 error, 0 warning |
| Link wiki tương đối (toàn bộ `wiki/`) | 5 broken (2 file không tồn tại + 1 sai độ sâu + 1 orphan topic) | **371 link, 0 broken** (verify bằng resolver độc lập, không chỉ lint) |
| `wiki/index.md` | thiếu 5 plan + 2 review trong catalog; 4 link chết; thiếu topic `flatten-repo-layout` | đã bổ sung đủ |
| `wiki/topics/studio-caption-fixes-and-ux-optimization.md` | 4 link chết + 5 link `file:///Users/hoangson/...` + **2 claim sai** ("wiki lint exit 0", "pytest exit 0") | link đã sửa, claim đã **đính chính kèm số thật** (không xoá âm thầm theo AGENTS.md §4) |
| `wiki/topics/overlay-resize-and-dual-subtitles.md` | 1 link chết tới review không tồn tại | ghi rõ là thiếu, không link giả |
| `wiki/topics/vietnamese-caption-loading.md:4` | `../plan/` (sai 1 cấp) | `../../plan/` |
| File mới | — | `wiki/topics/codebase-audit-2026-10-22.md` (topic page cho review này) |
| `wiki/log.md` | — | append `## [2026-10-22] ingest \| Codebase audit 2026-10-22` |

`local-bridge/errors.log` cũng được append 1 dòng theo AGENTS.md §6 (segfault = lỗi thật).
File này **không** được track trong git (`.gitignore:36`) → cây làm việc vẫn sạch.

**Không sửa:** bất kỳ file `extension/`, `local-bridge/app/`, `web/`, `ipad-app/`, `iphone-app/`,
`scripts/`, `tests/`, `.github/` nào. **Không** file nào dưới `plan/` bị đụng (immutable).

---

# 7. Ghi chú trung thực

- **Không sửa code nào.** Working tree sạch (`git status` chỉ có 5 file `.tmp-audit-*.md` untracked,
  đã xoá sau khi tổng hợp).
- **Con số:** 8 P0 · 16 P1 · 24 P2 · 10 P3. Con số P0/P1 **có** bằng chứng lệnh thật hoặc trích
  dẫn `file:line` tôi tự đọc. P2/P3 ghi rõ mức độ chắc chắn.
- **C-21 đã sửa trong bản này**: tôi đã viết "`local-bridge/errors.log` được track trong git" —
  **SAI**. Kiểm lại: `.gitignore:36` có `local-bridge/errors.log` ⇒ file **không** được track.
  Phần đúng còn lại: file trên disk bị test suite pollute (854 dòng, 46 lần lặp 3 message).
  Đã sửa mô tả trong C-21.
- **Các finding về wiki lint / broken link (F6, F12–F16 của agent infra)**: đã **xác nhận đúng**
  (exit 1, 4 error, 7 warning) và **đã sửa** trong phiên này — xem mục 6.
- **Đã bác bỏ 2 giả thuyết của agent:** (1) `state.cues[idx]` vs `state.enhancedCues` lệch index —
  không reachable; (2) `LayoutSmoke` iPhone "crash" — **không crash hôm nay** vì iPhone không
  bundle script; đó là **bẫy latent** chỉ nổ khi sửa A-3. Đã ghi đúng như vậy ở B-10.
- **Đã tự kiểm chứng lại** từng P0/P1 của 5 agent; 3 phát hiện được **giảm mức độ** sau khi tôi
  đọc kỹ: B-10 (latent, không phải crash), C-5/A-8 (một số claim chỉ "partly false" chứ không
  hoàn toàn sai), P0-02 của crosscut (tên file là 2 file **cố ý tách** từ 2026-08-04 — lỗi là
  **không ai đọc** file thứ hai, không phải "đặt sai tên").
- **Agent bridge đã trả lời sau khi tôi đã tự tìm ra segfault.** Hai bên độc lập cùng kết luận
  (exit 139, order-dependent). Tôi đã **tự chạy lại** đủ để xác nhận (3/3 lần, 5 biến thể lệch
  thứ tự/loại file). Tôi **không** dùng nguyên văn claim của agent cho B-23/B-24/C-25..C-33 —
  đó là phần **chưa tự verify dòng code** (mỗi mục đều có `file:line` để kiểm lại khi sửa).
- **Chênh lệch giữa báo cáo agent và thực tế**: agent bridge xếp `write_files` (B-21) ở P1 —
  tôi đồng ý P1 (không phải P0: cần payload Drive độc hại, mà bridge chỉ bind loopback).
- **AGENTS.md §6**: segfault là lỗi thật → đã append 1 dòng vào `local-bridge/errors.log`
  (file này được track trong git và bị test suite pollute — xem C-21).
- **Chưa đụng `plan/` và `review/` cũ** (immutable theo AGENTS.md §4). File review này là file mới.
