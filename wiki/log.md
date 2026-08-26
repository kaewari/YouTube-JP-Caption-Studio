# Wiki log

Append-only. Each entry starts with `## [YYYY-MM-DD] kind | Title` so `rg '^## \[' wiki/log.md | tail` works.

## [2026-08-23] ingest | Codebase review & improvement plan execution

- Filed: `review/codebase-review-2026-08-23.md` và `plan/codebase-improvement-plan-2026-08-23.md`.
- Shared: `import_parse.js` hỗ trợ timeline > 1h (`h:mm:ss`); test suite `import_parse_test.js` PASS.
- Native apps (iPad/iPhone): `SubtitleParser.swift` unique cue ID generation, `YouTubePlayerView.swift` dismantle cleanup message handlers, `ScriptStore.swift` parse time > 1h, `iphone-app` device ID set to `iphone-*`.
- Scripts & Tools: `build_freq_ja.py` hỗ trợ output path arg, `tools/ime-switch/README.md` cập nhật path `tools/ime-switch/`.
- Web: `web/saved-items/package.json` dọn boilerplate template metadata.
- Sanity tests: toàn bộ 7 suite PASS (lang_family, fill_yt_secondary, cue_timing, rev_pick, netflix_dfxp, normalize_cues, import_parse_test).

## [2026-08-23] ingest | Codebase improvements — priority guards & bridge validation

Triển khai nhóm fix ưu tiên theo `plan/codebase-improvement-plan-2026-08-22.md`:
- Bridge: `_governed()` bọc thêm `/dict` (đồng nhất với `/tokenize` & `/tokenize_batch`).
- Pydantic models: thêm `max_length` bounds (`TokenizeRequest` 8192, `DictRequest` surface 512/lemma 256/sentence_id 128, `SegmentCueIn` text 2048/id 128) + validator `userVocab` key ≤ 128.
- Requirements: thêm `pytest`, `pytest-asyncio`, `httpx` vào `local-bridge/requirements.txt`.
- Extension: `DRIVE_UPLOAD_ALARM` + `DRIVE_PENDING_MIRROR_KEY` lưu vào session storage phục vụ crash recovery khi MV3 SW bị kill.
- Sanity tests: lang_family, fill_yt_secondary, cue_timing, rev_pick, netflix_dfxp PASS.
- Wiki: cập nhật `wiki/topics/codebase-improvements-2026-08-22.md` ghi nhận shipped status.


## [2026-08-21] ingest | Vietnamese caption fixes & parallel fetch

`plan/vietnamese-caption-fixes-2026-08-21.md` filed & code shipped. `matchLangFamily()`
(normalize case/separator + 3-letter alias `vie`/`eng`/`jpn`) thay `startsWith` hẹp ở
`service_worker.js` (fetchBestLangPack, hasEn/hasVi, scoreTrack) và `page_capture.js`
(pickBestTrackByPrefix, scoreTrack, noteNetflixTimedtext). Netflix: `bcp47` lowercase
trước khi so (case-insensitive), regex displayName mở rộng `…|vi\b`; `tryFetchTrackDirect`
chạy `Promise.all` + `withTimeout(2s)`; track switcher giữ tuần tự bound 800ms + luôn
restore JA. `content.js` logYtSecondaryMiss thêm via/reason/trackCount.
`scripts/lang_family_sanity.js` 20 case × 2 file PASS. Chưa test thật trên Netflix/YouTube.

## [2026-08-20] ingest | Netflix replay & edit fixes — verify on disk

`review/netflix-replay-edit-verify-2026-08-20.md` filed (no code change). Verified
`plan/netflix-replay-and-edit-fixes-2026-08-20.md` on disk: Bug 1 (Netflix player
API seek/play) ✅, Bug 2 (JA IME nudge/romaji) ✅, Bug 3 (furigana/JLPT) — 2/3
present, **`updateBar(active)` missing** in `onJaEdit` finally (gap ghi nhận, chưa
sửa theo yêu cầu). `netflix-caption-fixes` 3/3 ✅, `netflix-caption-support` shipped ✅,
`sub-load-furigana` T1–T5 done ✅ (wiki đã cập nhật). Còn mở: local-bridge-audit
(no plan). Index Active table + review catalog updated.

## [2026-08-20] lint | Sub-load furigana plan verified done + onJaEdit overlay gap fixed

Verified `plan/sub-load-furigana-100ms-2026-08-08.md` T1–T5 on disk (AGENTS §2):
T1 race SW vs bridge-wait + `Promise.all` cache/meta + skipCache `awaitDisk` only
when owned; T2 enrich parallel + await capped; T3 tokens cache in chrome.storage;
T4 sidepanel `patchRow`/sig incremental + dict delegate; T5 `markFuriganaPainted`
log >150 ms. Wiki topic + index updated → **done** (was stale "chưa làm").

Also verified `plan/netflix-replay-and-edit-fixes-2026-08-20.md` on disk: Bug 1
(`getNetflixPlayer()`/`seek()`/`play()` in page_capture.js), Bug 2 (`nudge.focus()`
removed, `applyRomajiFallback` no callers), Bug 3 (`enrichTokensAfterImport` no
bridgeReady gate, `publishSidePanelState({forceList:true})` in onJaEdit) — but
`updateBar(active)` was **missing** from onJaEdit's finally. Added it so the
overlay re-renders furigana/JLPT immediately after JA edit.

## [2026-08-20] ingest | Netflix Replay (M7375), JA Edit & Furigana Retention

`plan/netflix-replay-and-edit-fixes-2026-08-20.md` filed & shipped. Sử dụng Netflix Player API `seek()`/`play()` thay cho DOM `<video>` tránh mã lỗi M7375 (`page_capture.js`), loại bỏ nhảy focus `nudge` và tắt can thiệp `applyRomajiFallback` để OS IME gõ tự nhiên không mất chữ (`sidepanel.js`), sửa `enrichTokensAfterImport` và `onJaEdit` để giữ nguyên Furigana và màu JLPT tức thì (`content.js`). Topic: `wiki/topics/netflix-support.md`.

## [2026-08-19] ingest | Netflix Caption Fixes & Bridge Concurrency

`plan/netflix-caption-fixes-2026-08-19.md` filed & shipped. Tự động tải ngầm track EN/VI trên Netflix (`page_capture.js`), tái thiết kế nút toggle mờ ở mép trái video (`panel.css`, `content.js`), loại bỏ lỗi 503 nghẽn governor trên `/dict`, thêm `threading.local()` cho SQLite connection và thread lock cho Sudachi tokenize (`tokenize_ja.py`). Topic: `wiki/topics/netflix-support.md`.

## [2026-08-19] ingest | Netflix Caption Support

`plan/netflix-caption-support-2026-08-19.md` filed & shipped. Triển khai parser DFXP / TTML (`extension/shared/dfxp_parser.js`), network hook & player API trong `injected/page_capture.js`, cập nhật `content.js` (key `netflix__<watchId>`), `service_worker.js`, `sidepanel.js` và `manifest.json`. Sanity test `scripts/netflix_dfxp_sanity.js` 12/12 pass. Topic: `wiki/topics/netflix-support.md`.

## [2026-08-08] ingest | Plan: sub load + furigana/level ≤ 100 ms

`plan/sub-load-furigana-100ms-2026-08-08.md` filed (plan-only, no code). Baseline:
Sudachi 0.1 ms/cue — bottleneck là chuỗi RTT tuần tự (waitForPageBridge 2.5 s
trước SW pack), render furigana 2 phase + hydrate RTT riêng, sidepanel full
DOM rebuild. Todos T1–T5. Topic: `wiki/topics/sub-load-furigana-100ms.md`.

## [2026-08-07] ingest | Codebase review closed — C1/H1–H8/M1–M10 fixed

All findings from `review/codebase-review-2026-08-07.md` resolved: C1 (compose
loopback-only publish), H1 (postMessage `ev.source` guard x2), H8
(`BRIDGE_ALLOWLIST`), M1 (CORS no-credentials), M2 (per-video save lock), M4
(governor `_governed()` 503), M5 (finite/range model validator), M6 (manual
timing clamp), M7 (OAuth state + ATS local-only + WebView YT-only, both apps),
M8 (macOS stop owns-process-only). H2/H3/H7/M3 + H4–H6/M9/M10 were already in
the working tree from prior sessions. Verified: iPad/iPhone/macOS builds,
web check, bridge smoke tests green. Topic updated:
`wiki/topics/codebase-review-2026-08-07.md` → **closed**; `index.md` Active
table + Open gaps pruned.

## [2026-08-07] ingest | Full codebase review

Source: `review/codebase-review-2026-08-07.md` — verified current findings across
extension, bridge, iPad/iPhone, web and macOS bridge. Highest priority is empty
script/tombstone data loss and unauthenticated bridge exposure. Topic:
`wiki/topics/codebase-review-2026-08-07.md`.

## [2026-08-05] lint | bootstrap

Scaffolded Karpathy LLM-wiki over `plan/` + `review/`. Created `wiki/index.md`, this log, and topic `p0-data-loss`.

## [2026-08-05] ingest | P0 data-loss cue-merge

Sources (immutable):

- `plan/p0-data-loss-fixes-2026-08-05.md` — todos all `done`
- `review/p0-data-loss-fixes-review-2026-08-05.md` — verified on disk (build + smoke)

Wiki updates: [topics/p0-data-loss.md](topics/p0-data-loss.md), [index.md](index.md) Active table.

Status: **done**. Known ceilings left open: extension cue-merge, `try? save`, iPhone fullscreen, security P1s.

## [2026-08-05] ingest | Flatten repo layout (planned)

Source (immutable):

- `plan/flatten-repo-layout-2026-08-05.md` — todos all pending; filed from Cursor plan draft

Wiki updates: [topics/flatten-repo-layout.md](topics/flatten-repo-layout.md), [index.md](index.md) Active + catalog.

## [2026-08-05] lint | Flatten plan hợp lý

Đã quét + sửa `plan/flatten-repo-layout-2026-08-05.md`: bỏ mâu thuẫn docs/; sửa bảng A; bổ sung nested skills track, web/.cursor, debug log, rủi ro bootstrap dict.

Verdict: **đủ execute**.

## [2026-08-05] ingest | Skills — gọn: giữ 3, xóa ponytail*

Plan §E: `skills/` chỉ 3 domain; xóa 6 `ponytail*` khỏi project.

## [2026-08-05] ingest | Đổi tên skill (bỏ OCR lệch)

Đổi tên thư mục + `name:` trong SKILL.md:

- `youtube-hardsub-ocr` → `youtube-caption`
- `local-bridge-dev` → `local-bridge`
- `hardsub-ocr-regression` → `tokenize-regression`

(Vẫn nằm dưới `.cursor/skills/` nested cho đến khi execute flatten → `skills/`.)

## [2026-08-05] ingest | Skills — giữ ponytail + codegraph

User: thêm `ponytail` + `codegraph` vào project `skills/`. Plan §E keep 5: `ponytail`, `codegraph`, `youtube-caption`, `local-bridge`, `tokenize-regression`; xóa chỉ meta `ponytail-*`; stub `skills/codegraph/SKILL.md`. Wiki: [topics/flatten-repo-layout.md](topics/flatten-repo-layout.md).

## [2026-08-05] update | Flatten — DeepSeek V4 Flash execute brief

Plan thêm checklist disk + prompt dán; stray root `local-bridge/` ghi rõ. Topic: [topics/flatten-repo-layout.md](topics/flatten-repo-layout.md).

## [2026-08-05] update | Đổi tên stray → `_stray-local-bridge-data`

Root `local-bridge/` (chỉ dict sqlite) → `_stray-local-bridge-data/` + `.gitignore`; tránh DeepSeek `git mv` đụng tên. Product vẫn ở `youtube-jp-caption-studio/local-bridge/`.

## [2026-08-05] ingest | Flatten repo layout — execute xong

Sources (immutable):

- `plan/flatten-repo-layout-2026-08-05.md` — checklist 1a–6 all done, smoke xanh (bridge `/health` `/dict` `/tokenize` `/scripts`, sqlite 4 bảng, build.sh)
- `review/flatten-repo-layout-execute-2026-08-05.md` — execution report (kèm token usage)

Wiki updates: [topics/repo-layout.md](topics/repo-layout.md) (mới), [topics/flatten-repo-layout.md](topics/flatten-repo-layout.md) → **xong**, [upstream/karpathy-llm-wiki.md](upstream/karpathy-llm-wiki.md) (mới), [index.md](index.md) Active table.

Status: **done**. Nợ mở: `en_vi.json`/`vnedict.txt` seed confirm (§A), link path cũ trong plan/review cũ (ngoài phạm vi).

## [2026-08-05] lint | Flatten execute report check

Đối chiếu `review/flatten-repo-layout-execute-2026-08-05.md` ↔ disk: flatten **đúng** (wrapper gone, 5 skills, paths, sqlite merge, wiki pages). Sửa lệch nhỏ: plan status → xong + tick todos; thêm review vào catalog `wiki/index.md`; comment iPhone `DriveScriptsService` `ipad-app`→`iphone-app`. Token table trong report không verify được.

## [2026-08-06] ingest | Local-bridge audit — 10/10 ALIVE

Source (immutable): `review/local-bridge-audit-2026-08-06.md` — audit theo §5 `codebase-review-2026-08-04.md`, verify từng finding từ disk (11 agents + verify tay LB-5).

Verdict: **10/10 findings còn ALIVE** (LB-1 critical, LB-2/3 high, LB-4..9 medium, LB-10 low); FIXED/CHANGED = 0; safe-claims cũ 4/4 vẫn đúng. Thay đổi duy nhất: LB-4 có fallback HTTPS (chỉ khi HTTP throw — không phải fix). Flatten chỉ đổi path, không rework logic.

Wiki updates: [topics/local-bridge-audit.md](topics/local-bridge-audit.md) (mới), [index.md](index.md) Active + catalog.

## [2026-08-06] docs | Gộp INCIDENTS → walkthrough; xóa Makefile

Root docs 4 → 2: `INCIDENTS.md` gộp vào `walkthrough.md` §4 (nội dung giữ nguyên, h3 theo ngày), xóa `INCIDENTS.md` + `Makefile` (không code/script/CI nào dùng `make`; `make dev`/`build-ext` = một dòng đã có trong README/package.json; `make clean` là `rm -rf data/subtitles/*` chưa từng được ghi chú). Cập nhật: `AGENTS.md` §8 bảng map (bỏ INCIDENTS), `walkthrough.md` §3.7 pointer → §4, [topics/repo-layout.md](topics/repo-layout.md). Tham chiếu cũ trong plan/review/flatten topic giữ nguyên (lịch sử bất biến).

## [2026-08-06] lint | Check 2 plan P0 đã code

Đối chiếu disk vs `plan/p0-data-loss-fixes-2026-08-04.md` + `2026-08-05.md` (+ reviews): **cả 2 đúng trên disk**. 08-04: upsert/ScriptDTO rev/vocab file/UUID cue/LSSupports… (iPad+iPhone). 08-05: DriveDirty merge+tombstone+clearDirty, backup single-save, extension raw-rev guard tại `extension/content/content.js`. Sửa wiki topic path extension (bỏ nested). Note: report 08-04 nói iPhone thiếu `YouTubePlayerView` — disk hiện **đã có** (gap cũ hết).

## [2026-08-07] ingest | Plans completion check

Sources:

- `review/plans-completion-check-2026-08-07.md` — disk matrix for all 17 plans
- Stale plan YAML/checklist updated: bridge-ram-sqlite, ipad-mvp, master backlog cancel, ipad-build, flatten execute ticks, ipad-app-review P0 ticks

Wiki: [topics/plans-completion.md](topics/plans-completion.md), [index.md](index.md).

Verdict: **product plans done**; polish + local-bridge audit remain open (no plan to execute audit).

## [2026-08-08] lint | Codebase review topic audit

Verified `wiki/topics/codebase-review-2026-08-07.md` claims on disk (AGENTS §2):
H1/H2/H3/H6/H8, M1/M2/M3/M5/M6/M8, M9/M10 all present in source; bridge
`python -m tests.test_script_store` passes; pytest fixture error on
`test_script_store` confirmed pre-existing (matches Known open). No stale
active rows; `sub-load-furigana-100ms` topic matches raw plan. Proceeded to
implement T1–T5.

## [2026-08-22] ingest | Codebase improvements plan

Filed behavior-preserving audit plan:
`plan/codebase-improvement-plan-2026-08-22.md`. Topic:
`wiki/topics/codebase-improvements-2026-08-22.md`. Scope covers extension,
local bridge, iPad/iPhone, macOS bridge, web, tests, build hygiene and docs.
Execution pending; no source functionality changed.

## [2026-08-24] fix | Caption throttle: sidepanel trống + overlay không hiện
- Root cause (verified live): SW bắn ≤24 timedtext request/load → YouTube throttle 429/502 per-IP; mọi tầng (SW, page, bridge) dính cùng wall; stall ~25s trước khi báo empty.
- Fix: SW fan-out 24→12 + abort sớm khi 429/502 + negative-cache 60s (`ttMiss:*`); bridge `/captions` bỏ retry ≥400, timeout 10s, LRU cache 10 phút; content bridge tier cap 12s.
- Mobile: iPhone/iPad `CaptionService` tuần tự không burst — không cần sửa; cả hai app BUILD SUCCEEDED.
- Files: `extension/background/service_worker.js`, `extension/content/content.js`, `local-bridge/app/api/captions.py`; plan `plan/fix-caption-throttle-stall-2026-08-24.md`.
