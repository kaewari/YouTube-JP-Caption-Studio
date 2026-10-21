<!-- date: 2026-10-18 -->
<!-- revised: 2026-10-18 (post-review corrections after independent Gemini accuracy audit) -->
<!-- source: chat:claude-worktree-laughing-babbage-998f63 · user: đọc toàn bộ sourcecode, ghi điểm cần cải thiện, không sửa code -->

# Full Codebase Improvement Audit — 2026-10-18

## Bản sửa lỗi sau khi được audit độc lập (Gemini)

Nguồn thẩm định: `/Users/hoangson/Downloads/review_accuracy_audit_plan.md` — Gemini kiểm chứng trên disk và runtime thật. Kết quả: ~92% các phát hiện chính xác; **2 sai sót và 1 "đúng một phần"** cần sửa:

| # | Phát hiện ban đầu | Kết quả thuật thẩm định | Trạng thái trong file này |
|---|---|---|---|
| 1 | `timedtext_parse.js` BOM làm tê liệt json3 parser | **SAI.** Node `String.trim()` xóa BOM U+FEFF (thuộc WhiteSpace chuẩn ECMAScript). Test isolate biến (cùng key `tStartMs`): `json3` có + không có BOM đều parse ra 1 cue. Điểm ban đầu so sánh hai test dùng key khác nhau (`dDurationMs` vs `tStartMs`), chống sai lệch chưa đủ. | ❌ Rút khỏi mục 8 P0. Thông tin sai dẫn.ui về "silent fallback cluster" không còn đứng vững. |
| 2 | `tools/open-code-review/` là thư mục rỗng | **SAI.** Đây là **git submodule** (`url = https://github.com/alibaba/open-code-review.git`, `.gitmodules`), populated 42 files trên main checkout (`/Users/hoangson/Projects/YouTube JP Caption Studio/tools/open-code-review/`), chỉ rỗng trong worktree chưa init submodule. | ✅ Sửa lại mục 1 DEAD FILE CANDIDATE là submodule, không phải dead code. |
| 3 | Title injection `script_store.py:111-116` | **ĐÚNG MỘT PHẦN.** `render_script_txt` ghi `"title: {title}"` với prefix `title: ` — title 1 dòng không match `^JA:`. Chỉ khi title chứa `\n` (đa dòng, `"\nJA:..."`) mới inject phantom cue. | ⚠️ Giữ nhưng rõ ràng là P0 chỉ áp dụng cho title đa dòng / title bắt đầu bằng newline. |
| 4 | Path của `settings_modal.js` | **Chính xác các số dòng, vì file thật tại `extension/content/settings_modal.js`** (không phải `extension/sidepanel/`). | ✅ Rõ ràng đường dẫn ở mục 4.

Phạm vi: toàn bộ repo (extension, local-bridge, web/saved-items, ipad-app, iphone-app, macos-bridge-app, scripts/tools/docs/tests/CI).
Phương pháp: 10 agent review độc lập, mỗi agent đọc toàn bộ khu vực của mình trên disk (cache ≠ disk), chỉ báo cáo điểm đã xác minh được line số. Không sửa code.

| # | Khu vực | Trạng thái |
|---|---------|-----------|
| 1 | extension/content/content.js (6191 dòng) | ✅ xong (mục 2) |
| 2 | sidepanel UI (js/html/css + settings_modal) | ✅ xong (mục 4) |
| 3 | service_worker + page_capture + audio_capture + manifest | ✅ xong (mục 3) |
| 4 | extension/shared + parse modules | ✅ xong (mục 8) |
| 5 | local-bridge services (dictionary/script_store/asr/…) | ✅ xong (mục 5) |
| 6 | local-bridge API/DB/schemas/data pipeline | ✅ xong (mục 6) |
| 7 | web/saved-items (Next.js) | ✅ xong (mục 7) |
| 8 | ipad-app + iphone-app (SwiftUI) | ✅ xong (mục 8) |
| 9 | tests + CI + testdata | ✅ xong (mục 9) |
| 10 | scripts/tools/macos-bridge-app/docs/skills | ✅ xong (mục 1) |

> **Điểm nổi bật xuyên suốt:**
> - Agent #9 xác định **2 required check (`bridge-test-suite`, `saved-items-check`) đang structurally red trên Linux** (ASR import mlx_whisper chết trên Ubuntu; script integration test hardcode port 8765 thay vì đọc `BRIDGE_URL`).
> - Agent #6 phát hiện **bug P0 concurrency SQLite connection dùng chung thread** gây HTTP 500 ngẫu nhiên.
> - Agent #3 phát hiện **bug P0 mất dữ liệu queue Drive mirror** khi service worker bị idle-kill.
> - Agent #4 phát hiện **bug P0 `ReferenceError: nextCursor is not defined`** làm hỏng hoàn toàn tính năng gõ romaji→kana trong cue editor (`romaji_kana.js:211`).
> - Agent #5 phát hiện **bug P0 title injection** đầu độc parsing script.txt thành cue ma.

---

## 9) Tests + CI + testdata

Tổng quan: bridge suite thực sự runtime-oriented (script_store races, DSP signal asserts, gemini HTTP broker test là exemplary — tự đánh giá 7/10 trong phạm vi riêng). Nhưng **kết quả thực thi và CI tách rời**: 2 check bắt buộc flagship structurally red (mlx marker vs ubuntu; BRIDGE_URL không bao giờ đọc), và toàn bộ extension layer phó thác cho script node chạy tay. Leverage cao nhất: làm bridge CI đỏ→xanh thật, thêm job node-CI chạy manifest list.

### P0 — fake-confidence / bị chặn

- `.github/workflows/ci.yml:34` — **ASR integration tests KHÔNG THỂ pass trên ubuntu nên check required phải đỏ hoặc "nói dối"** — `requirements.txt:12` gate `mlx-whisper` theo `darwin+arm64`; `asr.py:357` bare `import mlx_whisper` (ImportError → HTTP 500). `test_asr_api.py:130,149,170` + `test_asr_dsp.py:129,145,313,365,388` đều cần nó. Không stub (`sys.modules` grep: có đủ), asr service không mock fallback. Tác động: `bridge-test-suite` structurally fail trên Linux, hoặc CI bị ignore/exclude trong thực tế — 2 cách đều làm "green CI" vô nghĩa. → `pytest.importorskip("mlx_whisper")` cho service/endpoint transcribe tests + mock-mlx unit test cho pure logic (prompt suppression, sanitize, token-0 filter).
- `.github/workflows/ci.yml:69-70` vs `local-bridge/tests/test_tokenize_import_enrich.py:15` — **Handshake integration CI hỏng BY DESIGN** — CI bật uvicorn随机 port và set `BRIDGE_URL`, nhưng script hardwire `BRIDGE = "http://127.0.0.1:8765"` và KHÔNG đọc env var; trên CI health probe :135-139 luôn fail → `return 1`. Step "real bridge HTTP/tokenize integration" đỏ xuyên suốt. → 1 dòng `BRIDGE = os.environ.get("BRIDGE_URL", "http://127.0.0.1:8765")`.
- `.github/workflows/ci.yml:16-105` — **Zero CI cho extension (phía risky và thay đổi nhiều nhất)** — không job node nào chạy `extension/shared/*_test.js` (8 suite, 1.453 dòng), `tests/unit/test_player_ui_runtime.js`, hay 40+ `scripts/*_sanity.js`; chỉ tồn tại như run-node manual được quote trong các review. Quirks timedtext XML, sentence grouping, karaoke timing, diff rendering, Gemini retry — không được PR-gate. → 1 job node chạy manifest list của pure-logic suite (exclude mac-Chrome 1 cái).
- `tests/test_asr_benchmark.py`, `tests/test_slice_gold_audio.py` — **Root `tests/` bị CI mồ côi** — CI chỉ chạy `local-bridge/tests/` (ci.yml:33-35); không gì execute repo-root tests. CER math, normalization invariants guard pipeline audio-gold không gate merge. Ngoài ra `testdata/audio-gold/manifest.json` + `challenge-audio/manifest.json` committed (2026-10-12, `audioVerified: "CANDIDATE_HYPOTHESIS_PENDING_LISTENING_REVIEW"`) nhưng `.wav` sliced không committed (`git ls-files testdata`: 18 files, manifests only) — clone-bound regression trên gold audio bất khả khả và refs là hypotheses chưa verify.
- `extension/shared/sentence_candidates_test.js:20-62` — **test tái cài hàm production mà chúng claim verify** — `canReceiveAsrCandidate`, `serializeCueRevision`, `findBestCueForSegmentByIoU` là copies dán (bản thật: `extension/content/content.js:1109,1128`, IIFE không export). Drift trong prod logic vẫn giữ test xanh. → IIFE attach `window.__Internal = {...}` cho test require, xóa copies.

### P1 — coverage gaps

- `local-bridge/tests/test_saved_items_db.py:186-227` — **API tests ghi vào persistent DB của app** — `app/api/saved_items.py:33-35` `db_conn()` → `init_db()` mặc định real `data/saved_items.db`; unit tests dùng `tmp_path` (:22) nhưng route tests không. Cả `test_saved_items.py:36` `/extension_state` ghi real `data/config/extension_state.json` (`app/api/state.py:22`). Tác động: dev-machine pollution, cross-run contamination qua fixed ids (`api_test_cue`). → tmp-path override fixture trong conftest — 1 fixture fix cả 2 file.
- `local-bridge/tests/test_captions_api.py:56-62` vs `extension/shared/timedtext_parse_test.js:9-119` — **Cùng parser, 2 ngôn ngữ, coverage tách rời** — Python cover SRV1/SRV3/JSON3 incl. `aAppend`; JS cover gap/collision/TTML-dur nhưng không `aAppend`/`<s>` speaker spans/entities ngoài `&amp;`; `&lt;br/&gt;` join, BOM, double-encoding (`&amp;amp;`) không được cover ở cả 2. Parser JS cũng chưa chạy CI (xem P0).
- `extension/shared/gemini_translate_test.js:122-129` — **Priority-queue test assert không gì về priority** — dựng job priority 30 vs 10 và chỉ assert `completed === 2`; ordering/admission (MOD-04) chưa test. Cả wall-clock asserts (:84, :89-91) + 20ms fake-server latency (:21) có thể flake. → Assert visible job admitted trước background; thay Date.now delta bằng injected clock.
- `local-bridge/tests/test_saved_items_db.py:29-37` — **WAL được test như pragma flags, không như behavior** — không exercise gì 2 connection / concurrent write + busy_timeout retry (negative case MOD-08). → 2-connection write race trên tmp DB.
- `extension/offscreen/audio_capture.js` (191 dòng) — **Slice 8s / overlap 1.5s không test** (matrix MOD-05); pure compute extractable không cần DOM/chrome API.
- `test_harness_sentence.html:379-392` — **Harness tái cài stitching inline** (bản copy `stitchMultiCueSentences`) thay vì dùng `sentence_groups.js`; validates renderers/hover visually (hover automation qua `?hover=` query, :469-479) nhưng KHÔNG có assert — grouping coverage chỉ còn trong static `sentence_groups_test.js`.`](extension/shared/sentence_groups.js) Pattern Chrome-report trong `tests/unit/test_player_ui_runtime.js` chứng minh file này automation được cùng cách.
- `tests/unit/test_player_ui_runtime.js:~272` — mac-only hardcoded `"/Applications/Google Chrome.app/..."`; là runtime-DOM harness tốt nhất repo nhưng không chạy máy khác.
- `local-bridge/tests/test_script_store.py:511-535` — `main()` home-roll cùng monkeypatch như `conftest.py:13-17`; `make_sine_wav` trùng `test_asr_api.py:26` và `test_asr_dsp.py:33`; module-level `TestClient(app)` ở 5 file. → Consolidate vào conftest.

### P2 — hygiene

- `scripts/verify_no_fake_tests.js:31-39` — Gate anti-fake quét chỉ `scripts/`, `extension/shared`, root `tests/`; bỏ qua `local-bridge/tests`, `tests/unit`, extension phần còn lại, và extractor regex ngoài 2 pattern của nó. → Fix target dirs, port regex gate vào CI.
- `scripts/rev_pick_sanity.js:10-22`, `scripts/lang_family_sanity.js:22-28` — Extract hàm từ IIFE qua regex; một refactor (named exports / `__Internal`) sẽ chuyển chúng thành commonjs requires; regex extraction cũng âm thầm phá khi reformat.
- `extension/popup/{404,popup,index,_not-found}.html, inline-main-0..4.js` — verified 0 dòng và git-tracked; `_not-found/` + `__next.*.txt` là dead weight build-artifact Next.js static-export trong extension package. → Xóa hoặc rebuild ở package time.
- `TEST_PLAN_MATRIX.md` (v0.11.3, 13 rows) **phóng đại coverage**: MOD-04 (rate-limiter) → chỉ trivial gemini assert; MOD-05 (audio slicing), MOD-06 (server error paths), MOD-10 (Drive mirror), MOD-02 (scrub/pause persistence), MOD-11/12 (sidepanel responsive/hover) map các `scripts/*_sanity.js` mà CI không chạy; MOD-13 (Next.js) không test nào — `web/saved-items/package.json` `check` = lint+typecheck+build only. Nửa matrix hàng P0/P1 không có enforcement tự động.

### Bảng rủi ro (risk zone → covered by → gap)

| Vùng rủi ro | Được cover bởi | Gap |
|---|---|---|
| timedtext YouTube XML/JSON3 quirks | py `test_captions_api.py` (aAppend), JS `timedtext_parse_test.js` (collisions/TTML) — đều manual hoặc CI-excluded | speaker spans, `<br/>`, BOM, double-entities; không CI |
| cue timing / grouping | `sentence_groups_test.js`, `cue_timing_sanity.js` — manual | zero CI enforcement |
| karaoke/JLPT rendering | `vocab_style_test.js` (502 dòng) — manual | không CI |
| LV bridge translation | `gemini_translate_test.js` (real HTTP server) — manual | priority assert no-op; wall-clock flake |
| ASR DSP + decode + API | `test_asr_dsp.py`, `test_asr_api.py` | mac-only import; ubuntu CI đỏ |
| script_store persistence | `test_script_store.py` (race + mock write) | recovery crash/torn-file thật chưa test |
| saved_items_db | unit trên tmp + API trên DB thật | contention/WAL concurrency chưa test |
| offscreen audio slicing | không | math 8s/1.5s chưa test |
| Next.js saved-items | lint+typecheck+build | không runtime test |
| iOS (ipad-app/iphone-app) | không tìm thấy trong scope | matrix bỏ qua hoàn toàn Swift side |

Tổng quan: layer cấu trúc ổn — SQL parameterized mọi nơi, dict handle query-only, per-video save lock, write atomict rename, rev arbitration bằng content-sig — tốt hơn mức chuẩn của một bridge local-only. Các cạnh sắc nhất: ffmpeg subprocess không timeout (một decode treo ghim cả bridge), title injection round-trip TXT, stale conn sau offline rebuild, và model ASR user-controlled. Chủ đề phụ: nhiều boolean "loaded" và cache degrade im lặng ở lần fail đầu.

### P0 — bug thật

| # | Vị trí | Phát hiện | Hướng xử lý |
|---|---|---|---|
| 1 | script_store.py:111-116 + :208-216 | **Title/url injection đầu độc lần parse sau** — `render_script_txt` ghi `title`/`url` caller-supplied; regex `^JA:\s*` chỉ match khi chứa `\n` (title đa dòng hoặc suffix `\nJA: ...`) mới inject phantom cue. Title 1 dòng an toàn do được prefix `"title: "`; chỉ title có newline mới phá. **P0 → P1** | Sanitize newline trong title/url khi render (hoặc prefix-guard metadata lines trong parser return tới khi gặp `[` đầu) |
| 2 | asr.py:110-116 + :221 + :259 | **ffmpeg `subprocess.run` không có `timeout` ở bất kỳ đâu** — WebM truncated/truncated làm ffmpeg block thì worker `asyncio.to_thread` kẹt vĩnh viễn; request lặp lại cạn anyio threadpool (default ~40) → toàn bridge wedge | `timeout=30` (decode) / `timeout=120` (DSP) + kill khi hết giờ |
| 3 | dictionary.py:337-346 | **`close_dictionary()` chỉ đóng connection của thread gọi** — conns sống trong `threading.local()` (:309,:322); sau offline rebuild (dict.sqlite mới ghi đè trên disk) chỉ handle của caller reopen; mọi thread FastAPI khác tiếp tục đọc inode CŨ → dictionary stale im lặng cho tới restart | Bỏ thread-local cache, thay bằng pool process-wide nhỏ có `close()` tracked explicit |
| 4 | dictionary.py:467 | **`Any` được dùng nhưng không import** — `dict[str, Any] | None` chỉ sống nhờ `from __future__ import annotations` defefer evaluation (:3); mọi `get_type_hints()` / pydantic runtime introspection ném `NameError` | `from typing import Any` |

### P1 — maintainability / robustness

- api/asr.py:27 + asr.py:373 — **`model` query param user-controlled tới thẳng `path_or_hf_repo`** — mọi page localhost (CORS cho `http://localhost:*`) chỉ định HF repo bừa → trigger unauthenticated network download + disk growth mỗi request, hoặc load path local bừa. → Allowlist bảng model hằng (`kotoba-v2`, `whisper-tiny`).
- script_store.py:330-336 — **Map lock per-video không evict** — `_video_locks` grows 1 Lock mỗi video id touched, vĩnh viễn (hàng nghìn lock sống sau dùng heavy). → 1 global lock, hoặc evict qua `WeakValueDictionary` identity-checked.
- script_store.py:275-283 + :446-456 — **Không fsync trước `replace`** — chuỗi multi-file (cues/meta/script.txt, :440-453) có thể rơi mixed revisions sau power loss; cues.json rỗng khả dĩ. → fsync mỗi tmp fd (và dir) trước replace.
- script_store.py:561-565 — **`load_script` ghi đè `cues.json` trên MỌI GET** — kể cả khi TXT→cues không đổi (`changed` chỉ check cho meta :564). GET-side SSD wear + mirror mtime churn. → Chỉ write khi `_cue_content_sig` khác (:538 đã tính sẵn).
- ime_switch.py:65-104 — **Lazy `swiftc` build có timeout 120s chạy trong request handler** (`ensure_helper` từ `/ime/switch`) — lần gọi đầu treo app up to 2 phút; crash giữa build để repo working tree mutated ở request time. → Build trong startup lifespan (start.sh đã pre-build; giữ lazy path chỉ như tool).
- asr.py:143-144,:278-279,:287-288 + dictionary.py:525-527,:840-841 + logging_utils.py:14-15 — **`except Exception: pass` câm** — tokenize import failure trong `_expand_candidates` làm degrade candidates zero-signal. → Ít nhất `logger.debug` mỗi swallow.
- core/governor.py:105-110 — **Governor đồng thời chỉ armed nhưng không enforces đường nặng** — `try_acquire/release` chỉ token hóa dùng tokenize; ASR + script I-O bỏ qua → 3 transcribe MLX 5-phút có thể overlap trên Metal (không model-level lock trong asr.py — concurrent first-load cùng model double-allocate). → Acquire quanh `transcribe_audio`.
- asr.py:135-145 — **Metal peak memory đọc từ counter max-military không bao giờ reset** (`mx.reset_peak_memory` chưa gọi) → `metalPeakBytes` báo max-lifetime process, không phải per-request như docstring :431 gợi ý; `rssBytes`(:127-132) cũng vậy — `ru_maxrss` là peak RSS, mislabeled. → Reset peak trước mỗi transcribe; đổi tên fields.
- dictionary.py:399-429,:452-464,:534-543 — **Mọi lookup trên DB build dở (thiếu `jmdict`/`javi`/`mazii`/`jmdict_vi` — trạng thái common ngay post-bootstrap) fire 6-10 query mỗi cái raise `sqlite3.OperationalError` → `logger.warning` mỗi query mỗi request** — log spam + exception churn vô nghĩa. → Probe bảng presence một lần khi open; skip query family hoặc downgrade 1 dòng debug.
- dictionary.py:558-568 — **N+1 per-character SELECT loop trong `_query_hanviet`** (1 execute mỗi kanji char; inline lại trong `_get_mazii_details` :491-496). → 1 `IN (...)` fetch hoặc preloaded dict.
- vocab_freq.py:43-46 — **`_loaded = True` set trước CÁC file read** và fail degrade im lặng (:52,:64) — `freq_ja.json` hỏng để process vĩnh viễn "loaded" với map rỗng — rank/JLPT trả None mọi lúc. → Set `_loaded` sau read thành công; log level error.
- tokenize_ja.py:73-89 — **Sudachi-missing fallback phát ra 1 Token phủ CẢ câu** (`start=0, end=len(text)`) — vi phạm anti-clumping invariant của chính repo (AGENTS §Bilingual) và duck-phán một full-string lemma giả. → Phát list rỗng để caller degrade, hoặc whitespace-split.
- start.sh:111 — **`uvicorn --workers 1` là load-bearing nhưng không guard** — mọi per-process state trên (`_video_locks`, `dict_cache`, governor, thread-local dict conns) âm thầm hỏng khi `-w2`. → Assert/worker-count check khi startup hoặc document trong code.

### P2 — polish

- dictionary.py:29-295,:297-307 — ~265 dòng curated data inline trong service (`_SEED_JA_VI`, particle/tail tables) — knowledge map §8 nói dict data ở `data/dict/`. Move seeds sang JSON.
- dictionary.py:632-648,:659-667 — local `_nfkc`/`_strip_punct`/`_hira_to_kata` nhân bản helpers normalization; `_kata_to_hira` lại được import như tên *private* từ `app.utils.text_utils` (:17). → Consolidate vào `text_utils` với public names.
- asr.py:299-434 — `transcribe_audio` 136 dòng trộn validation + DSP + model call + response shaping; `lookup` 101 (:846-946). Tách theo house style (>120).
- asr.py:37 — DSP chain hardcode-shadow docstring constants (khớp giá trị từ plan whisper_turbo: highpass=100, lowpass=8000, afftdn nf=-25, dynaudnorm f=150/g=15/p=0.95/b=1）— đúng nhưng 2 profiles trong `build_audio_filter_chain` (:50-65) nên từ named constants; nhánh `filter_profile` user-supplied (`ValueError` :65) unreachable từ HTTP (param không wire; path bytes :334-341 luôn dùng "enhanced").
- asr.py:226-296 — triple-decoding fallbacks dễ примен chain DSP 2 lần/request khi path 1 emit error sau partial success (soundfile branch re-apply :237-238). Hiếm + tốn, không corrupt. → 1 decode-with-optional-DSP function.
- metrics.py:11-13 — `record_tokenize_latency` append mỗi sample vào CẢ 2 deque; p50/p95 chỉ khác tail-window boundary. 1 source of truth.
- core/governor.py:19-23,:99-100 — `hard_max_*` và `w_ocr/w_mt` không bao giờ đọc; `w_ocr = max(1, base.w_ocr - 1)` với `base.w_ocr == 0` đ traveling *tăng* worker count khi memory pressure. → Xóa dead fields hoặc làm pressure math coherent.
- main.py:49-62 — `@app.on_event` deprecated (trùng phát hiện agent #6) — migrate `lifespan` (là chỗ tự nhiên preload ASR model + warm build ime-select, fix luôn #9 ở ime_switch).
- api/asr.py:70,:121-124 — size-check trước thread tốt, nhưng `detail=str(e)` echo nguyên ffmpeg/MLX internals cho caller localhost; localhost-scoped acceptable — wrap.
- tokenize_ja.py:25-42,:91 — `load_tokenizer` không lock (double `Dictionary()` dưới race) và `assert _tokenizer is not None` biến mất dưới `python -O` → `AttributeError`. → Dùng `_tokenize_lock` cho cả hai.
- script_store.py:41-44,:697-711 — `ScriptRevisionConflict` → 409 với `current_rev` ở API layer (:33-36,:129-132) đúng; `write_files` cue validation (:718-758) và `_safe_video_id` regex (:33, 6-64 chars, không `.`/`/`) đã trace và hold — **path traversal và ffmpeg arg injection được verified an toàn** (audio đi `pipe:0`, không `-i <url>`; không giữ temp file sau run).

Tổng quan: nền tảng MV3 cơ bản đang tốt — alarms dùng đúng (listener đồng bộ top-level), storage write serial, bridge proxy có method/path allowlist thật. Hai khoảng trống hệ thống lớn nhất: **trạng tháiзем vòng đời SW** (pending set, debounce timer, Maps đều giả định SW không chết — đã có ít nhất 1 đường mất dữ liệu xác nhận) và **táibản logic fetch caption** (SW vs page world vs 3 bản parser cục bộ) đã bắt đầu lệch nhau và nhân đôi rủi ro throttle YouTube.

### P0 — bug thật

| # | Vị trí | Phát hiện | Hướng xử lý |
|---|---|---|---|
| 1 | service_worker.js:1973 | **Xóa pending set giết luôn crash recovery của Drive mirror** — `scheduleDriveUpload` ghi `Array.from(_pendingMirror)` vào session storage mỗi lần; sau SW idle-kill, in-memory Set rỗng (chỉ alarm handler :682 đọc lại storage) → lần save đầu sau restart **ghi đè** các ID pending đã persist trước khi alarm kịp recover → queued mirror uploads mất im lặng | Merge các ID persist vào `_pendingMirror` trong `loadSwState()` |
| 2 | offscreen/audio_capture.js:66-74 | **Capture lỗi im lặng + thông báo lỗi mồ côi** — `startCapture` tự catch lỗi `getUserMedia`, gửi `ASR_CAPTURE_ERROR` (không có listener NƠI NÀO — đã verify content.js/sidepanel.js/SW), rồi resolve bình thường → SW trả `{ok:true}` (SW:257-265) và content.js:1072 giữ `audioListeningActive = true` trong khi capture không chạy | Rethrow bên trong `startCapture` + thêm handler `ASR_CAPTURE_ERROR` ở content |
| 3 | offscreen/audio_capture.js:114-118 | **Slice timer mất khi offscreen doc suspension → recorder kẹt** — `setTimeout(SLICE_DURATION_MS)` gọi `recorder.stop()` là terminators duy nhất; doc bị suspend/crash thì MediaRecorder không stop, slicing ngắt im lặng trong khi `isCapturing` vẫn true | Dùng `recorder.start(SLICE_DURATION_MS)` timeslice thay timer tay |
| 4 | service_worker.js:226-265 | **Leak tab-capture session: offscreen doc không bao giờ đóng** — `handleAudioStopCapture` forwards STOP nhưng không path nào gọi `chrome.offscreen.closeDocument`; stop capture để lại doc + `AudioContext` chết suốt browser session; start/stop tuần tự cũng giữ lại `streamId` grant cũ | Sau STOP ack, check `getContexts` và đóng offscreen doc khi không còn recorder active |

### P1 — maintainability

- service_worker.js:543-547 — **Debounced push mất khi SW idle-kill** — `_pushTimer` là `setTimeout` thường; MV3 kill SW giữa chừng; alarm 1-phút chỉ re-**pull** (:676-677) → edit trong lúc bridge offline chỉ push được nếu có storage change khác re-fire. → Schedule pending-push bằng `chrome.alarms` (delayInMinutes:1) như Drive mirror đã làm.
- service_worker.js:1202-1238 — **Timedtext fetch không timeout** — `fetchTimedtextBody` (và `bridgeJson` :1543, `imeViaBridge` :482-495) chờ fetch vô hạn; 1 request treo làm cả 3-pack `Promise.all` (:961-965) kẹt tới khi SW chết. → `AbortSignal.timeout(10000)` mỗi fetch — chuẩn đã áp cho `/scripts/save` (:760).
- offscreen/audio_capture.js:121-151 — **ASR dispatch fire-and-forget fan-out** — `dispatchSliceToBridge` không được await trong `onstop` (SW:104-path); bridge chậm hơn 8s/slice thì POST song song + Blob tích lũy vô biên; lỗi chỉ `console.warn`, không reach UI. → Serialize dispatch qua chain + `AbortSignal.timeout`.
- service_worker.js:1083-1111 vs page_capture.js:299-357 — **2 pipeline caption song song cho cùng video** — SW `handleYtLoadCaptions`/`fetchAndroidCaptionTracks` và page-world `fetchMultiLangCaptions`/`fetchPlayerViaInnertube` fan-out ja/en/vi độc lập (content.js gọi cả hai — YT_LOAD_CAPTIONS :279 và FETCH_MULTI_LANG :4363) → nhân đôi timedtext requests + throttle risk. → Route mọi YouTube caption load qua SW pipeline, bỏ page-world innertube retry.
- service_worker.js:729,744 + :1529 — **Maps không giới hạn thời gian sống trong SW** — `_bridgeRateBuckets` (per-tabId) và `_freshCheckedAt` (per-videoId) không evict; session dài leak entry. → Prune expired buckets trong `_bridgeRateCheck`, cap `_freshCheckedAt`.
- service_worker.js:30-43 vs page_capture.js:202 — **Nhân bản exact + đã bắt đầu lệch** — `parseJsonObjectAt` copy `ytInitialPlayerResponse` regex-scrape byte-for-byte ở cả 2; `normalizeTimedtextUrl`/`buildTimedtextUrlVariants`/`matchLangFamily`/`scoreTrack` cũng 1:1 (SW:800/806/1124/1144 vs page_capture:490/496/572/1504), nhưng 2 variant builder đã **diverged** (page_capture thêm srv3 + fmt-stripped variants, SW chỉ raw+json3 — page_capture:515-525 vs SW:806-827) → cùng URL parse khác nhau tùy chỗ nó rơi. → Hoist 5 helper vào `extension/shared/timedtext_parse.js` (file này đã dual-load) + giữ 1 variant builder.
- page_capture.js:1586-1840 + :1307-1458 — hàm khổng lồ: `fetchNetflixCaptions` (254 dòng), `loadCaptions` (151 dòng), mỗi hàm inline 3-4 họ helper lồng nhau. → Tách probe/infer/native helpers ở file scope.
- main.py:30 + offscreen/audio_capture.js:9 — **bridge không có auth token** — CORS cho mọi chrome-extension origin (`chrome-extension://[a-z0-9]{32}` match mọi extension cài máy), ASR POST + `/scripts/delete` đều reachable từ extension khác khi user cấp host_permissions localhost; `BRIDGE_ALLOWLIST` SW (:712-724) chỉ bảo vệ traffic `BRIDGE_FETCH` của content-script, popup/sidepanel/offscreen fetch trực tiếp không được che. → Shared token bridge-side (extension gửi header) hoặc lock CORS regex theo `chrome.runtime.id`.
- manifest.json:6 — **không pin `minimum_chrome_version`** — review quyền khá tốt (mọi permission đều verify có dùng: cookies SW:832, identity/Drive, tabCapture+offscreen, nativeMessaging SW:507) nhưng `offscreen` (Chrome 109+), `sidePanel` (116+), `sidePanel.close` (141, SW:436) degrade im lặng trên Chrome cũ. → `minimum_chrome_version: "116"` (hoặc route fallback cho `closeSidePanel`).

### P2 — polish

- page_capture.js:718-732,1993-1998 — postMessage(`"*"`) từ page world — gate `ev.source !== window` + cap-token (:1987-1990) decent, nhưng cap token đọc từ script URL (:13-20) nên bất kỳ page script query được `<script>` inject có thể mint reply hợp lệ. → `postMessage(msg, location.origin)` + verify `ev.origin` ở content receiver.
- page_capture.js:2032-2055 — **dead page-world command surface** — `CAPTURE`, `SET_ROI`, `GET_PAGE_INFO`, `CAPTION_AT`, `SEEK`/`PLAY_AT` không caller nào trong content.js/sidepanel.js (verified; chỉ ROI debug ở header line 3); kèm `captureRoi` canvas code :62-116. → Gate ROI plumbing phía debug flag, xóa hoặc dùng cờ debug.
- page_capture.js:2016-2017,2052-2053 — **`FETCH_MULTI_LANG` vs `FETCH_MULTI_LANG_CAPTIONS` duplicate alias của cùng handler** — cả 2 đều được gọi (content.js:4363 & 4220), register môn đôi vĩnh viễn. → Giữ 1 tên, xóa call site kia.
- page_capture.js:256-271 — truy cập player API minified không document — `movie_player.getPlayerResponse()`, `getOption/setOption/loadModule`, `window.ytplayer.config.args.player_response` là internal YouTube, guarded typeof nhưng không có telemetry versioned fallback. Chấp nhận; thêm comment "last-verified YouTube build".
- page_capture.js:1486-1492 — **getter mutate state** — `getTimedtextLink` (bình luận ghi read-only :1460) set `ccTriggerVideoId` như side effect. → Di chuyển ccTrigger marking vào `loadCaptions`.
- service_worker.js:791-798 — **`handleYtFetch` tự bịa `status: 200/0`** thay vì pass status thật → caller không phân biệt được throttle (429) với body rỗng. → Trả `res.status` từ `fetchTimedtextBody`.
- service_worker.js:830-838 — `getYtCookieHeader` serialize cả cookie jar .youtube.com vào MỌI fetch watch-HTML — gồm ad/tracking cookie lớn; chỉ consent+login cookie có liên quan. → Filter `SAPISID|CONSENT|VISITOR_INFO`.
- service_worker.js:320-327 — **`SP_CMD_PROXY` forwards mọi `cmd`/`payload` tới `msg.tabId` bất kỳ** — không cmd allowlist, `tabId` caller-controlled từ sidepanel; receiver-side trong content.js là rào duy nhất. → Kiểm tra cmd enum nhỏ ở SW.
- service_worker.js:594 — magic `+0.05` skew trên so sánh `updatedAt` không document (s vs ms từ bridge) → normalize `updatedAtMs` (SW:1734-1736 đã có sẵn).
- offscreen/audio_capture.js:14-19 — module-level mutable capture state — reset chỉ qua STOP; doc crash (không close) để `isCapturing=false` nhưng `currentAudioCtx` stale. Harmless nhưng null trong `onstop` rẻ.
- manifest.json:99-110 — `web_accessible_resources` expose cả `shared/timedtext_parse.js` ngoài `injected/page_capture.js`; parser chỉ dùng bởi MAIN-world page_capture; nếu content inject chỉ `page_capture.js` theo URL thì exposure dư. → 1 grep-verify rồi trim.

### Message-surface inventory (verify pair với handler)

- **Paired & live**: `SAVED_CUES_MUTATE`, `BRIDGE_FETCH`, `YT_FETCH`, `YT_LOAD_CAPTIONS`, `IME_SWITCH`, `SP_CMD`/`SP_CMD_PROXY`, `SP_STATE`, `SP_CLOSE`, `OPEN_SIDE_PANEL`, `CLOSE_SIDE_PANEL`, `AUDIO_START/STOP_CAPTURE`, `ASR_CANDIDATE_RECEIVED`, `CONTENT_GET_TAB_ID`, `TOGGLE_OVERLAY`, `TOGGLE_PIP`, `DRIVE_*` (7 types), `GEMINI_TRANSLATE_GROUPS/CANCEL/KEY_CHECK`, `DRIVE_STATUS_CHANGED`, `DRIVE_RESTORED`.
- **Orphaned**: `ASR_CAPTURE_ERROR` (offscreen:70 sender, không receiver — đã nêu P0 #2).
- **Duplicate aliases**: `FETCH_MULTI_LANG` vs `FETCH_MULTI_LANG_CAPTIONS` (đã nêu P2).

Tổng quan: file đã battle-tested thật (SW/window/bridge fallback nhiều tầng là có thật, `pageCapToken` postMessage gate là nguyên tắc bảo mật tốt). Nhưng đã vượt mốc maintainability: một IIFE ~6.200 dòng, 4 hàm "tháp" 200–340 dòng (`loadAllCaptions`, `renderDictHtml`, `triggerGeminiTranslationIfNeeded`, `handleSidePanelCmd`), 40+ catch câm, và các đường sync/publish lặp nhau. Ba refactor leverage cao nhất đều nhỏ và cục bộ (dict-render template chung, bảng khai báo tier cho `loadAllCaptions`, tách sentence-projection rebuild khỏi panel publish).

### P0 — bug thật

| # | Vị trí | Phát hiện | Hướng xử lý |
|---|---|---|---|
| 1 | content.js:2658-2756 | **Interval leak bỏ qua enabled-state** — `ensureVideoLayoutSync` mở interval 250ms gọi `ensureUI/ensurePlayerToggle` (7 querySelector/lượt) kể cả khi tab ẩn hoặc extension disabled; `videoLayoutTimer` không được `clearInterval` ở bất kỳ đâu trong file | Gate tick theo `!document.hidden`/platform-enabled; clear trong `teardownUI` |
| 2 | content.js:5828-5844 | **Leak chuỗi `requestVideoFrameCallback` + listener `play`** — listener `play` thêm tại :5838 không bao giờ remove; `bindVideoEvents()` lần 2 trên video element mới để lại listener cũ trên `boundVideoEl` | `{ once: true }` cho `play`; remove listener khi `boundVideoEl` đổi |
| 3 | content.js:5914-5926 + 5974 | **SW cascade chạy đè 2 lần mỗi navigate với `force` mâu thuẫn** — `onNavigate` mở `loadCaptionsViaBackground(force:true)` truyền vào `opts.swPromise`, nhưng auto-retry ở :5974 gọi lại `loadAllCaptions(true,{skipCache:false})` KHÔNG truyền `swPromise` → 2 cascade full chạy song song cho cùng videoId | Thread `swPromise` vào retry, hoặc memoize per videoId |
| 4 | content.js:4556-4598 + 4841-4862 | **Stale-closure render sau `markScriptOwned()`/`scheduleSaveTranscript()`** khi edit JA — `cue.source` mutate nhưng không enqueue sentence/tokGen publish; `updateBar` thứ hai ở :4597 đọc `cue.translated/tokens` bắt trước khi mutate; ở `captionMode==="enhanced"` object `cue` bị thay toàn phần bởi `findActiveCue()` → paint trễ 1 frame | Publish trong cùng tick mutate (`refreshSentenceProjection(true)` trước `updateBar`) |
| 5 | content.js:5308-5311 | **`clearTranslations` hứa `awaitDisk` nhưng `saveTranscript` (:2214-2267) bỏ qua option** — caller truyền `{force:true, awaitDisk:true}` (cả :433) nhưng chỉ `force` được đọc → `clear_translations` trả success trong khi `saveTranscriptToDisk` có thể skip vì `rev` cũ | Implement hoặc bỏ option |
| 6 | content.js:1080-1096 | **Race tabId khi mute audio** — nếu SW trả `null` (vài ms sau reinstall), `AUDIO_START_CAPTURE` vẫn gửi `tabId: null`; toast lỗi bị skip vì `res?.ok` vẫn truthy với một vài đường SW | Fail-closed khi `!tabId` |
| 7 | content.js:663+665 | **Destructure optional trên `ev.data` primitive ném TypeError** — `const {requestId, result, cap} = ev.data` chạy sau check truthiness, nhưng `""`/`0` vẫn qua `!ev.data`; pattern tương tự bất nhất tại :6026 | Gate `typeof ev.data === "object"` |
| 8 | content.js:5970-5981 | **Auto-retry re-entry clobber state đã hoàn thành** — sau mỗi sleep retry, `loadAllCaptions(true,…)` chạy vô điều kiện kể cả khi user đã navigate sang video khác trong lúc sleep; guard `stale()` trong hàm chỉ chặn giữa `await`, không chặn giữa các nòng loop | So sánh `gen/cues-source` ở đầu loop, không chỉ `cues.length` |

### P1 — maintainability / rủi ro cấu trúc

- content.js:4148-4488 — **`loadAllCaptions`: 340 dòng tháp fallback tuần tự** — 9 tầng tier lồng nhau (Promise.race → swEarly-poll → GET_TIMEDTEXT_LINK → FETCH_MULTI_LANG → LOAD_CAPTIONS → in-page fetch → bridge rescue), mỗi tầng tự viết sleep-poll. Điểm rủi ro cao nhất của file. → Danh sách khai báo `{ try, guard }` có thứ tự.
- content.js:3155-3337 + 3339-3407 — **DOM dict dựng tay 3 lần** — `renderDictHtml` 180 dòng + `fetchAndFillDict` 70 dòng nhân bản markup header/toggle/close y hệt (offline path :3383-3392); binding nút close copy-paste 4×. → 1 hàm render + 1 binder.
- content.js:2999-3030 — **Layout-thrash `placeDictNear`/`placePageDictAtPanelEdge`** — đọc `offsetWidth/offsetHeight` ngay sau `innerHTML` rồi ghi `left/top` → forced reflow mỗi hover; cạnh đó đọc 4 window metric đồng bộ mỗi `SHOW_PAGE_DICT`. → Cache metric 1 lần mỗi render, clamp trong 1 rAF batch.
- content.js:5152-5179 — **`getSortedCues` định nghĩa 2 lần** (:1478 là bản chết bị shadow) + `findActiveCue` quét linear mỗi frame (up to 60/s); tail-grace `t <= end + grace` cho cue TRÙNG cuối thắng theo thứ tự sort chứ không phải theo window hẹp nhất. → Xóa bản chết; binary-search trên mảng sorted.
- content.js:3637-3722 — **`publishSidePanelState` serialize toàn bộ cue list mỗi call** — O(n) clone + `Object.values(savedCues)` mỗi `renderList(true)`/`stopSeek`; với 2000 cue đây là chi phí frame chủ đạo. → Diff-based rows hoặc batch `SP_STATE` như `sentencePublishTimer` 100ms đã làm.
- content.js:2545-2578 + 4840-4974 — **`updateBar` full innerHTML rebuild + 5 querySelector rebind + 3 listener/token** — 30 rebuild/phút = 30 × (tokens × 3). → Bind-once bằng delegation trên `bar`.
- content.js:5087-5092 + 3644 — **`refreshSentenceProjection` rebuild engine mỗi panel publish** — `publishSidePanelState` truyền `force=true` mỗi push (:3644) nên mỗi update status re-run `buildSentenceGroups` toàn cue array. → Tách "list changed" khỏi "panel publish".
- content.js:5911-5937 — **`onNavigate` gửi `RESET_CAPTIONS` fire-and-forget trước khi `videoId` settled** — SPA navigating: RPC tới page world của video MỚI trước khi `videoIdFromUrl()` chạy; stale main-world handler có thể reset sai video. → Reset SAU khi `currentVideoId` settled, gate theo `videoIdFromUrl() !== prev`.
- content.js:747-756 — **`set_caption_mode` nuốt mode không hợp lệ** — nếu panel gửi `"enhanced"` trong khi `sentenceEnhancementEnabled()` off, ép về `"original"` không trả diff. → Trả `{ok, mode, enhancedAvailable}`.
- content.js:130 + 5898 — `lastOverlayResetVideo` là dead state (ghi, không đọc).
- content.js:2580-2586 — `applyPanelWidth`/`setupPanelResize` dead stubs (YAGNI còn sót từ pre-side-panel UI). Xóa.
- content.js:3666 + 4074-4076 — **`escapeHtml`/`escapeAttr` tự viết cạnh shared module** — `extension/shared/vocab_style.js:883` có `escapeHtml` y hệt. → Import shared hoặc bỏ alias.
- content.js:5633-5646 vs 4613-4646 — **`onEnEdit`/`onViEdit` vs import path lệch text normalization** — edit replace `\s+`→" " + trim, import merge không normalize → 1 file EN có trailing space tạo 2 biến thể `text_source` của cùng dòng. → 1 helper `normalizeEnViText`.
- content.js:453 + 4296-4336 — **swEarly-poll re-issue `GET_TIMEDTEXT_LINK` 6 RPC trong 700ms (mỗi 120ms)** — không gì giữa các vòng thay đổi đáp án trừ timedtext capture của chính page; chạy `pageCall` trong `while` không có re-entry guard Promise. → 1 `pageCall` awaited + `Promise.race` với `swPromise.softened`.
- content.js:4546-4549 — **`resolveCueIndex` fallback tin mọi số** — `Number(msg?.idx)` không range-check; `idx: -1`, NaN vẫn chảy vào `onEnEdit` và trả `ok: true` từ `handleSidePanelCmd` (:966-973) trong khi edit thật sự thất bại. → Clamp/validate trước dispatch.

### P2 — polish / hardcode

- content.js:100 + 4499-4500 — `caps` global chỉ ghi, không đọc. Dead.
- content.js:1563-1568 — `barPosIndex` là stale-modal: `BAR_POS_LEVELS` cycle `[0.72, 0.55, 0.82]` nhưng `applyBarPosition` đọc `nx/ny`; preset thiếu `nx` rơi vào default-centered (:2706) → 3 "positions" gộp về 1. → Ghi `{nx: 0.5, ny}`.
- content.js:1746-1747 + 1771 + 2506 + 5861 + 4320 + 70/78/82 — **magic numbers không comment "why"**: `ahead = min(60, max(20, 30*rate))`, retry bump `30000`, deadline `700`, loops `250`/`120`, position constants. Ghi 1 dòng why (chúng encode ý định product).
- content.js:3707 + 1693-1706 — **~40 block `catch (_) {}` câm** — nhiều cái giấu SW/bridge failure thật; ít nhất log qua `bridgeFetch("/log")` như `logYtSecondaryMiss` đã làm.
- content.js:5950-5951 — `syncHealth()` gọi 2 lần liên tiếp mỗi navigate (:5949 + :5988) — `healthTimer` 5s đã phủ việc này.
- content.js:1809 + 4695-4697 — `cueEndTime` fallback `start + 2`, `addCue` widening `+ 1.2` — hằng tuning không comment; dùng `Timing.MIN_DUR * 2` hoặc ghi `ponytail:` rationale.
- content.js:6100-6165 — **storage.onChanged lặp lại nguyên khối default-fill của `loadSettings` (:1346-1373) verbatim**. → Extract 1 hàm `normalizeSettings(next)` dùng chung.
- content.js:6004-6009 — boot log POST tới bridge mỗi page load — gate phía debug flag hoặc opt-out storage (riêng tư + load bridge).
- content.js:6183-6190 — `window.__contentDictDebug` luôn exported — gate theo dev flag.

---

## 6) local-bridge: API / DB / schemas / pipeline dữ liệu

Tổng quan: API surface layer hoá sạch, status-code và path-traversal validation phía scripts phần lớn đã đúng (409/400/404). Yếu nhất là saved-items: 1 bug P0 connection-affinity thật sự intermittent, sync response không chặn bytes, và 4xx chưa có test. Hygiene commit dữ liệu là vấn đề cấu trúc thứ 2 — hanviet_data.py dữ liệu khổng lồ, sinh-foreach-thiếu-generator (khớp bảng knowledge map của AGENTS.md §8).

### P0 — bug thật

1. `local-bridge/app/db/saved_items_db.py:25` + `app/api/saved_items.py:25-32` — **SQLite connection dùng chung qua nhiều thread → 500 intermittent** — `db_conn()` memoize 1 connection tạo từ threadpool worker nào phục vụ request đầu; sqlite3 mặc định `check_same_thread=True` ném `ProgrammingError` khi request sau chạy trên worker FastAPI/anyio khác. [verified] lỗi tái lập được bằng `conn.execute('select 1')` từ thread thứ 2. Tác động: 500 ngẫu nhiên trên mọi `/saved/*` khi có đồng thời extension poll + iOS sync. → Mở với `check_same_thread=False` + guard write bằng `threading.Lock` (hoặc per-request connection).

### P1 — maintainability

2. `app/schemas/models.py:117,122` — **trường `hanviet` khai báo trùng trong `DictResponse`** — dòng thứ hai âm thầm thắng; pydantic v2 vẫn chấp nhận nên hành vi đúng nhưng model nói dối người đọc. → Xóa 1 khai báo.
3. `app/schemas/models.py:229` + `app/api/state.py:98` + `app/services/snapshot.py:13` — **enum vocab-status triple-written** — `("known","learning","ignored","special")` tái cài ở 3 layer; bản copy drift: `state.py:98` bỏ qua cap `len(key) <= 128` mà model validator áp → validate 2 lần lệch nhau. → Import `snapshot._VOCAB_STATUS` ở cả 2, giữ một `Literal` duy nhất.
4. `app/db/saved_items_db.py:275-302` — **sync response không có biên** — `sync_items` trả cả bảng với `updated_at > ?` không LIMIT; iOS sync sau một năm cue pull lại toàn bộ. → Đã cap `server_items` (default `LIMIT 5000`, tối đa 10000) + `has_more`/`next_since` cursor.
5. `app/api/state.py:89-111` — **"Partial update" thực chất là whole-map replace** — docstring nói partial; truyền `userVocab` là thay toàn map; SW là full chrome.storage và UI localhost cũng POST full map → writer cũ có thể âm thầm xoá vocab mới hơn; `updatedAt` :105 là device-local time không có tie-break (snapshot service đã có device Lamport counter, store này không). → Hoặc honor partial thật, hoặc dùng máy conflict rev/deviceId của script_store.
6. `local-bridge/app/data/hanviet_data.py` — **8.324 dòng dữ liệu sinh-tự-động commit trong code mà không có generator** — 1 dict `KANJI_HANVIET_TABLE` tại :9 (~8.292 key unique [verified], không dupes), regex tại :8304, 1 hàm tại :8307. Nhưng knowledge map (AGENTS.md §8) nói dict data nằm ở `data/dict/` (gitignored trừ seed nhỏ) và không có build script nào sinh file này → đúng loại "generated output không có source". Mà `build_dict_sqlite.py:161` đã copy nó vào sqlite `kanji_hanviet` rồi → module nhân bản một store service có thể đọc. → File 1 generator nhỏ + note derivation từ upstream, hoặc move bảng nguyên sang `data/dict/hanviet.json` (gitignored) chỉ seed 1 phần nhỏ; sqlite giữ runtime copy.
7. `app/api/scripts.py:97-99,144-150` — **xử lý video-id sai lệ giữa các endpoint** — `/tokens`, `/` trả 200 + `{}`/`found:false` cho id malformed; `/meta` `/files` raise 400. Cùng input, 3 outcome khác nhau trong cùng resource family. → Cho `load_script`/`load_tokens` raise ValueError như siblings rồi 400 ở boundary.
8. `app/api/captions.py:225` — **"no captions" báo 502, kèm full exception text** — `ValueError("no captions for …")` là miss xác định, không phải upstream gateway failure; body chứa `Type: message` của mọi exception (cũng ở state.py:153,177, saved_items.py:70,104). → Map ValueError → 404, giữ 502 cho transport failure, trả message đã sanitize.
9. `local-bridge/requirements.txt:1-15` — **không pin version** — mọi dep chỉ `>=`, không lock; fastapi/pydantic major mới có thể âm thầm phá (FastAPI `on_event` deprecated tại main.py:49-49 sẽ bị remove). → Pin range hoặc commit lockfile cho CI tái lập.

### P2 — polish

10. `app/api/captions.py:206-234` — `video_id`/`lang` không validate trước khi thành cache key `f"{video_id}|{lang}"` — id quá dài làm ô nhiễm LRU 256 entry → regex slug theo `script_store._VIDEO_ID_RE`.
11. `app/api/state.py:126-140` — `POST /api/saved-items` chấp nhận mọi raw dict (không schema, không size cap) và lưu nguyên xi; `ExtensionStateRequest.savedCues` (models.py:217) là `dict[str, Any]` không biên. → Thêm cue schema + size guard.
12. `app/db/saved_items_db.py:221-244,246-263` — search fallback nhân bản SQL LIKE 2 nhánh; `%{q}%` không escape (`%`/`_` trong query hành xử như wildcard). → 1 helper + `ESCAPE '\'`.
13. `app/db/saved_items_db.py:152-157,266-291` — `upsert_batch` chết/redundant với `sync_items`; `applied` đếm số *thử*, không phải số row mà guard `WHERE excluded.updated_at >=` thực áp — telemetry sync phóng đại. → Dùng rowcount trả về.
14. `app/api/asr.py:30-43` — không slot governor (khác tokenize.py:38-45); query không validate: `temperature`/thresholds nhận float bừa, `model` nhận filesystem path bừa. Local binding hạn chế blast radius nhưng vẫn nên range-check.
15. `app/api/health.py:27` — `ready=True` hardcoded; health không thể hiện partial loading (dict/sudachi từ `models_loaded`, LLM/OCR fields vestigial zeros :28-37). → Trim dead fields.
16. `app/api/health.py:54-62` — `POST /log` append không cap độ dài msg → dễ flood. Cap độ dài.
17. `app/schemas/models.py:79-80` — `TokenizeBatchRequest.cues` không cap list-length; batch 10k cue × 2048 chars đều xếp hàng Sudachi vô hạn. → `max_length`.
18. `app/scripts/build_dict_sqlite.py:175,252` — Mazii fallback đọc hardcoded `/tmp/javn2.db` (trust/portability smell) và log `len(m_rows) if 'm_rows' in locals()` — probe locals() fragile; khởi tạo `m_rows = []`.
19. `app/scripts/bootstrap.py:118-138` — JMdict re-download/index full mỗi lần bootstrap mới (không incremental, không checksum trên `_download`); license EDRDG/JMdict (CC BY-SA) là nguồn duy nhất không có attribution comment — VNEDICT và Yomitan VI zip đều comment rồi (import_en_vi.py:3-4, import_jmdict_vi.py:3-5). → Thêm footnote + integrity hash.
20. `app/scripts/import_en_vi.py:29` — URL primary VNEDICT là plain `http://` (JMdict và Yomitan VI zip https cả hai). → Ưu tiên https zip trước.
21. `app/main.py:49,60` — `@app.on_event` deprecated → migrate `lifespan=` context manager (chạy trên fastapi>=0.110 pinned ở requirements).
22. Tests — không 4xx cho `/saved/*` (grep thấy 400/404/413 chỉ ở asr/captions/scripts/snapshot tests); đường 404 (saved_items.py:93) và 500-on-thread-affinity (P0 #1) chưa được phủ. Tên dual `/saved/*` vs `/api/saved-items` (state.py:114) cũng gây nhầm.
23. `app/db/saved_items_db.py:23-31` — PRAGMA set tốt (WAL, busy_timeout 5000, FK) nhưng thiếu `user_version` làm migration marker và thiếu endpoint `.backup()`/export cho saved_items.db; copy taken khi `-wal` live có thể mất write gần đây nhất → dùng `sqlite3.Connection.backup()` cho snapshot.

Ngữ cảnh đã verify: `start.sh` + docker-compose cả hai bind `127.0.0.1:8765` — không exposure LAN. CORS (main.py:30-36) cho mọi `chrome-extension://<32-ký-tự>` + mọi port localhost/127.x với `allow_credentials=False` — nghĩa là bất kỳ page localhost nào cũng gọi được các DELETE `/saved/items` / `DELETE /scripts/{video_id}`; chấp nhận được với local tool nhưng một comment ghi rỏ trust-boundary này là đủ.

### P0 — Lừa dối hoặc hỏng

| Phát hiện | Tác động | Hướng xử lý |
|---|---|---|
| `walkthrough.md:236-237` lấy `scripts/verify_overlay_saved.png` và `scripts/verify_words_tab.png` làm bằng chứng "passed evidence" — **cả hai không tồn tại trên disk** (chỉ còn 3 file `chrome_live_*.png` trong scripts/) | Bằng chứng UI-visual đứt chuỗi truy vết | Chụp lại hoặc xóa 2 mục; thêm link-check đường dẫn bằng chứng vào `scripts/wiki_sync_and_lint.sh` |
| 9 script hardcode `/Users/hoangson/.gemini/antigravity-ide/...`: `scripts/verify_dict_popup_ux.js:254`, `verify_dict_popup_ux.py:307`, `verify_mazii_card_ui.js:179`, `verify_mazii_card_ui.py:191`, `verify_real_mouse_2way_hover.js:161`, `capture_sidepanel_responsive.js:31,44,57`, `test_live_youtube_and_sidepanel.js:352` | Không tái lập được trên máy khác; máy-cục bộ của cá nhân bị commit | Đổi thành `$TMPDIR`/đường dẫn repo-relative (mặc định `testdata/`) |
| `ipad-app/Scripts/com.youtubejpcaptionstudio.renew.plist:10` và `iphone-app/Scripts/com.youtubejpcaptionstudio.iphone.renew.plist:10` hardcode `/Users/hoangson/Documents/...` | launchd plist commit như nếu portable nhưng cài máy khác làломь hỏng | Sinh plist từ template nội suy `$HOME` trong install.sh có sẵn |
| `tools/open-code-review/` là **thư mục rỗng** (0 file) — không được tham chiếu từ đâu | Điểm chết, gây nhầm grep tìm công cụ review | Xóa thư mục hoặc dựng đúng công cụ như đã quảng bá |
| `scripts/bh6e3bt_raw.xml` là file **0 byte** (capture hỏng) nằm cạnh fixture thật `bh6e3bt_sub.ja.ttml` (165KB) | Bằng chứng giả/hỏng được commit | Xóa; đưa fixture TTML về `testdata/` |

### P1 — Lệch/cũ so với code hiện tại

| Phát hiện | Tác động | Hướng xử lý |
|---|---|---|
| `docs/test-cases/TC_BRIDGE_AUDIO_ASR.md` (TC-ASR-003 "model Whisper base/small"; TC-ASR-004 mục tiêu "<600ms") cũ — **`local-bridge/app/services/asr.py:33` hiện `DEFAULT_MODEL_NAME = "kaiinui/kotoba-whisper-v2.0-mlx"`** sau merge whisper_turbo (e94729eae) | QA doc test model không còn load mặc định | Tính lại TC-ASR-003/004 theo kotoba-whisper v2 (tên model, load, ngân sách latency/RAM) |
| `TEST_PLAN_MATRIX.md` §1 chỉ liệt kê 3 subsystem (extension, local-bridge, web/saved-items) — **thiếu ipad-app/, iphone-app/, macos-bridge-app/** mà README bán nhanh | Ma trận test không phủ nửa bề mặt đã ship | Thêm hàng subsystem 4–6 (dù chỉ "manual coverage") |
| `.agents/agents/*.md` (6 agent reviewer/QA) + `.agents/rules/verification.md` chỉ được tham chiếu trong AGENTS.md §8 — **không nạp được thực tế** (không ở `.claude/agents/`) | Agent độc lập chỉ là tài liệu; gate "independent review" trong AGENTS.md không điều dispatch được | Mirror vào `.claude/agents/` hoặc ghi rõ bước copy trong §8 |
| `macos-bridge-app/Sources/main.swift` comment "Fresh process group để SIGTERM cả tree (uvicorn + saved-items)" là **không đúng thực tế**: `Process()` không tạo process group; `pkill -P` chỉ giết con trực tiếp | `npm run dev` cháu (next dev) có thể orphan khi restart; chỉ còn port sweep (8765/3000) cứu và điều đó gate theo `bridgeProcessOwned` | Dùng `posix_spawn` + `setsid`, hoặc bỏ comment sai và dựa vào pid-file sweep đã ghi documented |
| `tools/ime-switch` (fallback Native Messaging) chỉ wired qua `extension/background/service_worker.js:6` (`com.ytcaption.ime_switch`) — đúng "Optional", nhưng mang 2 đường cho 1 việc và được ghi legacy không bị đóng băng rõ ràng | Nhầm lẫn khi bảo trì | Đánh dấu "frozen — bridge là đường duy nhất được hỗ trợ" trong README.md |
| `README.md:29-65` đoạn "experimental preview" ~35 dòng tuyên bố runtime không kiểm chứng được ("bounded runtime review passed", "copied with hash receipts") | Người đọc không verify được mình đọc gì | Nén còn 5 dòng + link tới `wiki/topics/…` |

### P2 — Chải chuốt

- `scripts/` chứa ~7MB binary bằng chứng (`chrome_live_test_fvnhw0mvh_q.png` 4.3MB, `chrome_live_mouse_qa.png` 2.1MB, `chrome_live_test_qa.png`, `bh6e3bt_sub.ja.ttml` 165KB) — AGENTS.md §8 quy định bằng chứng là ad-hoc; đưa permanent về `testdata/`, cập nhật `walkthrough.md:309`.
- ~20 script `sentence_*_sanity.*` + `test_mouse_*.js`/`verify_*.js` trộn lẫn "living harness" vs "one-shot cổ": cần nhóm `scripts/sanity/` hoặc `scripts/README.md` chỉ rõ cái nào current.
- `macos-bridge-app/build.sh` chỉ target arm64 + hardcode `DEVELOPER_DIR` — chấp nhận được, thêm 1 dòng note.
- 4 file code-taste hook (`code_taste_hook.py`, `install_code_taste_hooks.py`, `test_code_taste_hook.py`, `hook_anti_fake_test.js`) đã verify LIVE (PreToolUse hook chạy thật phiên này) nhưng tự cài vào user config — `hook_anti_fake_test.js` (796B) không có doc trỏ tới; thêm 1 dòng trong CODE_STYLE.md.

### Đã kiểm tra sạch (positive)

- Không có `.cursorrules`/`.cursor/`/`.cursorignore` ở bất kỳ đâu trong repo — lệnh cấm Cursor nguyên vẹn (chỉ còn chữ trong AGENTS.md).
- Không trùng lặp giữa root `scripts/` và `local-bridge/app/scripts/` (scope khác nhau).
- 5 skills đều khớp thực tế trên disk (start.sh flags, `tests/test_tokenize_import_enrich.py`, tên file extension…).
- `tools/ime-switch` đã wired thật: `start.sh:57` → `app/services/ime_switch.py:22-24` + fallback extension.

### DEAD FILE CANDIDATE (an toàn để xóa: xác minh rỗng / không tham chiếu)

- ~~`tools/open-code-review/` — thư mục rỗng~~ — **sai**, đây là git submodule (`alibaba/open-code-review`) chứ không phải dead code; chỉ rỗng trong worktree chưa init submodule. Loại khỏi danh sách xóa.
- `scripts/bh6e3bt_raw.xml` — 0 byte, capture hỏng.
- `scripts/click.swift` — one-shot CGPoint(800,635) hardcoded, trùng `scripts/mouse.py`.
- `scripts/research_mouse_ux.js` — scratch, không tham chiếu.
- `scripts/capture_sidepanel_responsive.js` — không tham chiếu, artifact path cứng vào workspace tool khác.
- `scripts/chrome_live_*.png` (3 file, ~6.7MB) + `scripts/bh6e3bt_sub.ja.ttml` — bằng chứng one-shot; xóa sau khi sửa `walkthrough.md:309` (giữ/move fvnhw0mvh về `testdata/` nếu claim còn tiếp thị).
- `scripts/browser_pixel_test.html`, `browser_pixel_bh6e3bt.html`, `browser_pixel_words.html`, `test_bh6e3bt_player.html`, `test_bh6e3bt_sidepanel.html`, `test_runtime_resize_and_sub.html` — fixture HTML one-shot không runner/docs; xóa hoặc move `testdata/`.

Không gọi ráo đủ c_Call: gia đình ~20 `sentence_*_sanity.*` và `test_mouse_*.js` — một số là QA artifact của README/walkthrough nhưng chưa xác minh không còn được re-run; cần một pass "current vs archived" trắngtrắng$hơn là xóa hàng loạt.

---

## 4) Sidepanel UI (sidepanel.js, sidepanel.html, sidepanel.css, settings_modal.js)

Tổng quan: Ở cấp độ vi mô, code rất kỷ luật (seq/session guards, patching theo signature, escaping cẩn thận ở mọi nơi). Vấn đề nằm ở cấp độ vĩ mô: **hơn 250 dòng code và CSS chết**, 3 nguồn định nghĩa bảng màu độc lập dễ lệch, và re-render toàn bộ DOM bằng `innerHTML` ở 2 tab Words và Saved trong khi tab Subtitles đã có pattern patch mượt mà.

### P0 — bug thật

| # | Vị trí | Phát hiện | Hướng xử lý |
|---|---|---|---|
| 1 | sidepanel.js:1722–1779 | **`renderList` không bao giờ sắp xếp lại thứ tự hàng DOM** — `cues.forEach` chỉ patch (`byId.get`), remove hoặc append; không bao giờ re-insert hàng có sẵn khi thứ tự timeline đổi (do edit timeline hoặc import) → panel giữ nguyên thứ tự cũ cho tới khi reload trang | Khi phát hiện drift vị trí, `appendChild(row)` theo thứ tự cue mới |
| 2 | sidepanel.js:91–103 | **Race condition read-modify-write cả blob cài đặt** — `persistSubVisibility` get→mutate→set toàn bộ key `hardsubSettings`; `content.js:1653` (`saveSettings`) và service worker (18 chỗ) cũng ghi cùng blob → ghi đè lẫn nhau, rồi `storage.onChanged` của panel (:2674) kéo lùi toggle | Read-modify-merge ngay trước `set`, hoặc tách 4 key của panel ra storage key riêng |
| 3 | settings_modal.js:273–282 | **Lưu settings trên từng pixel kéo thanh trượt (slider tick)** — event `input` bắn liên tục; mỗi lần đều `Object.assign` + persist cả object settings + mutate thanh bar trực tiếp → bão write vào storage + churn re-render ở sidepanel | Live preview trên `input`, chỉ persist trên `change` (hoặc debounce) |
| 4 | settings_modal.js:183–208 | **Lồng thẻ `<div>` bị lệch cú pháp** — Section 5 `.lr-settings-section` không đóng trước khi mở Section 6 (divider lạc ở :205) → Section 6 bị lồng bên trong Section 5, và footer (:224) rơi vào `.lr-settings-body` | Thêm thẻ `</div>` đóng bị thiếu tại dòng 205 |
| 5 | sidepanel.js:1906–2025, 2027–2139 | **Tab Words và Saved bị wipe sạch + rebind trên MỌI `SP_STATE`** — `applyState` (:1874–1876) re-render full `innerHTML` khi có cue mới: giật mất scroll, mất focus bàn phím, rebind listener hàng loạt chip từ | Gate theo dữ liệu thay đổi và dùng key-patching giống như tab Subtitle |
| 6 | sidepanel.js:2583 | **`tabStates` phình to không giới hạn** — mỗi tab/video được mở lưu 1 bản snapshot state đầy đủ; không có lệnh `delete`/`clear` và không có listener `chrome.tabs.onRemoved`; side panel sống suốt session trình duyệt → rò rỉ RAM | Thêm LRU cap + dọn dẹp khi tab bị đóng |
| 7 | sidepanel.js:2054–2059 | **Highlight ngữ cảnh làm hỏng chuỗi HTML đã escape** — `escCtx.replace(escLemma, boxed)` chạy trên chuỗi HTML đã escape; nếu lemma trùng vào bên trong `&amp;` hay `&quot;` sẽ bọc span vào giữa entity HTML | Tách vị trí đặt box trước, sau đó mới escape từng phần rồi ghép chuỗi |

### P1 — code chết, nhân bản và accessibility

- sidepanel.js:180–196, 199–221 — `fetchBridgeHealth` và `throttledGetState` được định nghĩa nhưng không nơi nào gọi. Xóa.
- sidepanel.js:810–823, 240–242 + sidepanel.css:1052–1064 — `ensureImeNudge`/`imeNudgeEl` và selector CSS `.sp-ime-nudge` chết hoàn toàn. Xóa cả hai.
- sidepanel.js:2074, 2095 — nút ba chấm `lr-saved-menu-btn` "⋮" render ra màn hình nhưng không hề bind event listener nào. Control rác hiển thị với người dùng.
- sidepanel.css:1318–1382 — `.sp-dict` và `.dict-*` style cho element mà chính HTML chú thích là "Unused" (:161–162) vì popup từ điển đã chuyển sang page qua `SHOW_PAGE_DICT`. ~65 dòng CSS thừa.
- sidepanel.css:525–536, 579–619, 651–680, 696–709 — 4 block `@media` giống hệt 4 block `@container` liền kề; container-type đã được bật sẵn → Xóa các bản `@media` thừa.
- Bảng màu JLPT và token được viết lặp ở 3 nơi: `panel.css`, `sidepanel.css`, và `settings_modal.js:13–20`. Cần quy về 1 nguồn CSS variables `--jlpt-*`.
- Accessibility: Toast (sidepanel.html:35) thiếu `role="status"`/`aria-live`; checkbox `.sp-toggle-input` dùng `display:none` làm mất focus bàn phím hoàn toàn; các nút header chỉ có `title` thiếu `aria-label`; tab list thiếu `role="tablist"`/`aria-selected`; modal cài đặt thiếu focus trap và phím Escape.

---

## 7) Web Companion: web/saved-items (Next.js App Router)

Tổng quan: Ứng dụng gọn gàng, có các hàm chuẩn hoá dữ liệu chu đáo và lệnh `npm run check` (lint + typecheck + build) chặt chẽ. Tuy nhiên, **hoàn toàn không có bài test nào** và đang chịu rủi ro lệch định dạng kiểu dữ liệu với extension và local-bridge.

### P0 — bug thật

| # | Vị trí | Phát hiện | Hướng xử lý |
|---|---|---|---|
| 1 | SavedItemsApp.tsx:37-47 | **Lỗi Hydration mismatch trong `useState` initializers** — khởi tạo `collapsed` đọc `window.location` / `chrome.storage` (`chrome-env.ts:54-59`) và `view` đọc `window.location.search`. Popup là static export nên HTML render ra `collapsed=false` trong khi hydration ra `true` → lỗi hydration React và nhấp nháy thanh sidebar | Khởi tạo với giá trị mặc định an toàn SSR, cập nhật giá trị thật trong `useEffect` sau khi mount |
| 2 | vocab-store.ts:315-356 | **Polling định kỳ từ bridge làm "hồi sinh" từ vừa xóa (chế độ localhost)** — khi click "Xóa", `delete` gọi `persistWordsAsync` (bị catch lỗi :103); 1.5 giây sau `subscribeVocab` lấy lại map cũ từ `/extension_state` và `mergeUserVocabMap` (:76-88) ép từ vừa xóa quay trở lại | Tạm dừng merge poll cho tới khi chuỗi ghi hoàn tất (hoặc lưu tombstone set cho các từ đã xóa) |
| 3 | SavedItemsApp.tsx:146-163 | **Lỗi ghi dữ liệu bị nuốt chửng** — `persistChain ...catch(() => {})` nuốt sạch lỗi ghi localStorage / chrome.storage / bridge; UI vẫn hiện note "Đã lưu" gây hiểu nhầm dữ liệu đã an toàn trong khi thực tế ghi thất bại | Thêm `.catch` set `source="error"` và hiển thị cảnh báo lỗi lên note |

### P1 & P2 — duy trì và dọn dẹp

- SettingsPanel.tsx:234-247, 249-262 — **Gây side-effect bên trong hàm updater của `setSettings`**: gọi `persistSettingsAsync` (fetch + chrome.set) bên trong updater. React StrictMode trong dev double-invoke updater → nhân đôi request write mỗi tick slider. Cần chuyển việc lưu ra ngoài handler hoặc effect.
- vocab-store.ts:76-88, 162-173 — Merge dữ liệu làm mất các trường chi tiết (ngữ cảnh, giải nghĩa) chỉ có ở localStorage: branch chrome chỉ giữ lemma có trong `userVocab`, dẫn tới mất vĩnh viễn dữ liệu giải nghĩa khi ghi ngược lại.
- Trùng lặp bảng màu JLPT: lại xuất hiện thêm bản sao thứ tư tại `level-colors.ts:13-31` và `types/settings.ts:84-91`.
- Thiếu schema versioning: các key mang tên "v1" nhưng payload không chứa số version để hỗ trợ migration tương lai.
- package.json có 4 dependencies thừa không dùng tới: `lucide-react` (tự vẽ SVG trong icons.tsx), `shadcn` (CLI tool bị để ở runtime deps), `@base-ui/react` và `class-variance-authority` (chỉ dùng cho button.tsx mà button.tsx không ai import). Xóa cả 4 package và file button.tsx.

---

## 8) Extension shared modules & parsers (vocab_style, timedtext_parse, romaji_kana, gemini_translate...)

Tổng quan: Bộ parser xử lý regex hiệu quả cho các định dạng YouTube/DFXP thực tế. Rủi ro tập trung vào các nhánh fallback im lặng và các bộ từ điển trùng lặp nhiều tầng. Đã kiểm chứng thực thi trên Node runtime thực tế (không dùng string-matching).

### P0 — bug thật (đã kiểm chứng bằng thực thi code)

| # | Vị trí | Phát hiện | Hướng xử lý |
|---|---|---|---|
| 1 | romaji_kana.js:211 | **`ReferenceError: nextCursor is not defined` — gõ romaji→kana bị sập hoàn toàn** — Kiểm tra thực tế: `convertTrailingRomaji("konnichiwa", 10)` ném `ReferenceError: nextCursor is not defined`. Khi gõ phím latin trong ô sửa phụ đề tiếng Nhật (`applyRomajiFallback`), mọi phím gõ đều quăng lỗi thay vì biến thành chữ kana | Khai báo `const nextCursor = start + kana.length;` trước điều kiện kiểm tra |
| ~~2~~ | ~~timedtext_parse.js:205-213~~ | ~~BOM làm tê liệt json3 parser~~ — **verify lại: SAI**. Node `trim()` xóa sạch U+FEFF (chuẩn ECMAScript WhiteSpace); test isolate key `tStartMs` chạy qua module thật với BOM và không BOM trả cùng 1 cue. Không còn là bug. | (retired) |
| 3 | vocab_style.js:708-712 | **Khai báo trùng key trong `BILINGUAL_MAP` xóa sạch JLPT level của だす/たい/欲しい/ほしい** — Phần đuôi khai báo đè các từ đã có level mà không truyền thuộc tính `level`. JS lấy giá trị sau cùng, làm `Vocab.jlptLevel` trả về `""` khiến các từ này hiển thị màu xám trung tính mất màu JLPT | Xóa bỏ các khai báo trùng thiếu level ở phần đuôi object |
| 4 | sentence_candidates_test.js:15-69 | **Bộ test giả mạo tự sao chép code production vào file test để tự assert** — các hàm `isOwnedCue`, `canReceiveAsrCandidate`, `serializeCueRevision`, `findBestCueForSegmentByIoU` được copy paste thẳng vào file test thay vì import từ source. Vi phạm trực tiếp lệnh cấm anti-fake test của repo (đạt 0/10 điểm) | Export hàm từ content.js / shared helpers và import vào test thật sự, hoặc xóa file test giả này |

### P1 — bảo mật & tính chính xác

- gemini_translate.js:66-68 — **Lưu Gemini API key dạng plaintext trong `chrome.storage.sync`**: `sync` tự động đồng bộ key sang tất cả các máy tính đăng nhập cùng tài khoản Google và lưu trên server Google. Cần đổi sang `chrome.storage.local` để bảo vệ key của người dùng.
- gemini_translate.js:7 — Model mặc định `gemini-3.8-flash` không phải là model public của Google; fallback `gemini-1.5-flash` đã cũ. Mỗi lần service worker khởi động lại đều mất công gọi thử thất bại rồi mới fallback. Cần cập nhật sang `gemini-2.5-flash`.
- timedtext_parse.js:12-27 và dfxp_parser.js:72-83 — Hai bộ giải mã HTML entity tự viết có cách hoạt động khác nhau; xử lý `&amp;` trước các entity số dẫn tới lỗi double-decode (ví dụ chuỗi gốc `&amp;#39;` bị decode quá tay thành dấu `'`).
- normalize_cues.js:146-190 — Hơn 45 dòng code xuất khẩu các hàm chết không ai gọi (`mergeRollingAsrCues`, `isRollingAsrUpdate`, `charLen`, `isMusicOnly`).
- cue_timing.js:48-58 — Hàm `clampCueEndsToNextStart` không có caller nào sử dụng (chỉ có 1 no-op stub ở content.js:81).
- extension/popup/* — Build artifact Next.js đã minify: `popup.html`/`index.html` 14.6KB, `404.html` 8.7KB, `inline-main-*.js` 43B-3.4KB; `wc -l` = 0 nhưng **không rỗng**. Cần quyết định rebuild/exclude, không phải xóa file rỗng.

---

## 8a) iOS Apps: ipad-app + iphone-app (SwiftUI)

Tổng quan: Hai app là hai bản fork của cùng một codebase — 20/26 file Swift trùng byte-identical (~4.700 dòng nhân bản ×2) và được fix tay trên cả hai cây ở mọi commit (git history: `d4d020aa9`, `de6430fc9`, `f5daa5e26`, `524247f81` đều patch cả hai). Không có gì chặn fix tiếp theo chỉ rơi vào một cây.

### Mức trùng lặp đã đo

| Cặp file | Similarity | Verdict |
|---|---|---|
| ScriptStore / BackupService / DictionaryService / DriveAuthService / SettingsSync / VocabSync (+15 file khác) | **100% byte-identical** | Exact duplicate |
| DriveScriptsService.swift | ~99.5% (chỉ khác prefix `deviceId` "ipad-"/"iphone-") | Duplicate |
| YouTubePlayerView.swift | 96.4% (iPad có thêm `scrollRequest`/`jsEvalRequest`) | Duplicate |
| SidePanelToolbar.swift | 82.6% — **bản iPhone bị compile nhưng KHÔNG có caller nào** | Dead on iPhone |
| ContentView.swift | **66.4%** (1221 vs 762) | Heavily diverged |
| CueEditorRow.swift | **38.8%** (iPad full editor vs iPhone read-only) | Diverged |
| user_script.js | **185 dòng lệch nhau** | Diverged |

→ ~61% byte duplication. **P1: Không có shared Swift package; mỗi fix phải áp dụng 2 lần.**

### Các tính năng iPhone đang thiếu (drift chứ không phải thiết kế)

1. iPhone `ContentView.swift:381-392` — menu "…" chỉ có "Connect Google Drive". Thiếu Reload, + Cue, Xóa dịch, Xóa sub, Export, Import, **thiếu cả Settings entry**. Trong khi `SidePanelToolbar.swift` (được compile, không được dùng) chứa cả những cái đó.
2. iPhone không có bất kỳ đường editing nào: không `saveTask` debounce → không `DriveDirty.mark` khi edit text (`CueEditorRow.swift` iPad:311-329).
3. iPhone không có vocab viewer — `vocabList` (iPad `ContentView.swift:812-831`) và segmented picker `Phụ đề/Từ vựng` (iPad 689-705) bị bỏ; words đã lưu không truy cập được trên iPhone.
4. iPhone không có `addCueAtPlayhead` / `applyImport` / `exportScript` / `confirmClearMT/confirmWipe`.
5. `PlayheadStatusChip` (iPad :1145-1219) — chip giờ cue active chỉ có trên iPad.

### Concurrency / threading

- **P1** `DriveAuthService.swift:37-59` — KHÔNG có mutex refresh: nhiều caller đồng thời (`.task(id:)` sync + `scenePhase` Task + connectDrive) cùng thấy token expired, cùng POST `grant_type=refresh_token`, cùng `saveTokens` (SecItemDelete+SecItemAdd :204-208) — last-write-wins, token của caller đầu có thể thuộc cặp đã bị thay thế. Triệu chứng đã thấy: lỗi "Drive:" thỉnh thoảng sau khi race. → 1 actor/in-flight memo (file dùng chung).
- P2 `DriveAuthService.swift:48` — `try? await refresh(...)` nuốt lỗi refresh im lặng (không log, không status) — errors.log (AGENTS §6) không thấy gì.
- P2 BackupService.swift:78-83 / SettingsSync.swift:115-123 / VocabSync.swift:78-85 — 3 debounce hand-rolled copy-paste cùng pattern. 1 helper chung giảm ~30 dòng ×3.

### Bảo mật

- **Tốt (P0→P1 note, verify được): token Drive nằm trong Keychain** (`DriveAuthService.swift:195-236` cả 2 app): `kSecClassGenericPassword`, `kSecAttrAccessibleAfterFirstUnlock`. Không dùng UserDefaults. Minor: dùng `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` cho chặt hơn; hiện `synchronizable` mặc định false, OK.
- P2 `DriveAuthService.swift:12` — `keychainService = "com.example.YouTubeJPCaptionStudio.drive"` — bundle-id style placeholder của cả 2 app. → Đổi theo bundle id thật per app.
- P2 `DriveOAuthConfig.swift:8` — `clientId` + `folderId = 1K8LPt…` hardcode trong source (PKCE-only nên chấp nhận được; folderId có ACL). → Move xcconfig/Info.plist để không greppable trong diff.
- Verified clean: không localhost hardcode nào trong prod; `grep http://` cả 2 cây trống trong production code.

### Data integrity (ScriptStore / BackupService / DriveDirty)

- P1 `BackupService.swift:280-282` (cả 2) — `apply()` wipe-all + reinsert với 1 `try context.save()` — crash giữa chừng được save() guard, nhưng đường debounce push KHÔNG transactional với lần save lỗi trước đó: `saveAndScheduleBackup()` (:355-363) gọi `try? save()` — constraint failure (`VideoScript.videoId @Attribute(.unique)`, ScriptStore.swift:6) bị nuốt, mutation thất bại không persist, backup vẫn chạy (encode cái đang trên disk). Comment `VocabStore.swift:24` thừa nhận chính failure này. → Fix 1 lần, cả 2 cây hưởng lợi.
- P1 `BackupService.swift:53,247,270-278` — Wire backup chỉ encode start (`duration: nil`, ignored khi apply → `derivedDuration` từ next-start). Cue length user tự chỉnh (`applyTimeline` giữ duration; `commitTimeline` comment "Keep duration") **bị PHỦ DỊCH mỗi lần restore / Drive-newer sync** khi next cue không adjacent. → Persist `duration` trên wire (additive, `CueDTO.duration` đã có sẵn) hoặc documenting invariant.
- P1 `ScriptStore.swift:117-119` (merge) vs :337-339 (import) — lệch cách write relationship: merge chỉ `cue.video = script` (fallback `:77` và docstring `applyDriveSync` cho thấy có thể miss), import làm CẢ `cue.video =` **và** `script.cues.append`. → Align merge theo import (1 dòng, cả 2 cây).
- P2 `ScriptStore.swift:568-586` — `DriveDirty` sống trong UserDefaults ngoài SwiftData; `BackupService.apply()` restore không clear nó → stale dirty id force spurious patch-push + rev bump sau mỗi restore (ping-pong với PC có document trong `DriveScriptsSmoke`).
- P2 Thiếu `SchemaMigrationPlan` — các field mới hiện đang protected nhờ default-based migration (comments :10-15 xác nhận); thêm plan trước field đầu tiên không default.

### SwiftUI / WKWebView / UX

- P1 ipad YouTubePlayerView.swift:22-25,92-104 + ContentView.swift:33-36,336,519-585 — bindings autotest `scrollRequest`/`jsEvalRequest` wire trong **Release** (chỉ `runAutotestIfRequested` được gate `#if DEBUG`) — dead surface trong prod. iPhone đã bỏ chúng → pruning safe.
- P1 `LayoutSmoke.swift` (cặp file) — **assert 2 invariant MÂU THẪN**: iPad "#below must only hide inside html.cs-app-full" (:9-17); iPhone "#below,#secondary,#related must never be hidden and masthead must be hidden" (:8-17). Cả hai guard cùng `user_script.js` mà JS đã lệch 185 dòng → thay đổi bridge dùng chung tiếp ứng một app và phá app kia, không source of truth.
- P2 JS-escaping an toàn hiện trạng — `__csSeek(...)` interpolate `seconds` numerically, `startTime` finite do `repairImportEnds` (:427-436); không NaN injection hôm nay. `String(format:)` hoặc `"\(Int(seconds))"` làm structural safe hơn.
- P2 `onLayoutCheck` → `try? payload.write(... layout_smoke.txt)` chạy cả Release (iPad:312-318 / iPhone:282-284) — `print` là DEBUG-gated nhưng viết Documents không gated, gây Files litter cho user.
- P2 cả hai apps vẫn dùng `VStack` trong `ScrollView` (`subtitlesList`) — ponytail ceiling "ok cho ~300 cues" vẫn hold đúng; LazyVStack khi vượt 300.

### TOP DIVERGED FILE PAIRS

1. **Views/ContentView.swift — 66%** (1221 vs 762): iPhone mất Settings, wipe, export/import, cue-editing, vocab tab, chip đồng hồ; 4 trong số đó là copy-paste drift chứ không phải thiết kế.
2. **Views/CueEditorRow.swift (39%) + Scripts/user_script.js (185 dòng diff)**: hàng read-only ở iPhone + 2 cách fullscreen khác nhau; mỗi app ship một hành vi YT page khác nhau cho cùng bridge protocol.
3. **Views/SidePanelToolbar.swift + Services/LayoutSmoke.swift**: copy iPhone được compile với zero caller (143 dòng chết) trong khi LayoutSmoke của nó assert CSS invariant NGƯỢC LẠI với iPad — rủi ro "fix rơi vào 1 app, quên app kia" cao nhất trong toàn scope.