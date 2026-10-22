# Wiki log

Append-only. Each entry starts with `## [YYYY-MM-DD] kind | Title` so `rg '^## \[' wiki/log.md | tail` works.

## [2026-09-19] ingest | Open Code Review verification & comprehensive hardening
- Fixed OCR review findings: restored timedtext_parse routing tests, hardened dictionary scalar cache against empty/None values, added non-EN/VI language guard and O(1) Map lookup to bilingual styling, added renderRubyHtml unit tests, restored sidepanel header settings modal trigger, guarded content.js keydown against modifier keys (Ctrl/Cmd/Alt), and hardened getSortedCues cache with array length validation.
- Verification: 20/20 pytests, 6/6 live Chrome DOM tests, 6/6 native mouse/keyboard QA, wiki link lint, anti-fake test gate passed with exit code 0.

## [2026-09-19] cleanup | Purge pre-2026-09 plans and reviews
- Purged 32 plans and 22 reviews dated before 2026-09-01 per user request.
- Cleaned up `wiki/index.md` active table and raw catalogs to eliminate stale/broken links.

## [2026-09-19] ingest | Studio Caption Fixes, Performance & UX Optimization
- Filed: `plan/studio-caption-fixes-and-ux-optimization-2026-09-19.md` and updated `review/code-review-2026-09-19.md`.
- Scope: Fix overlay vertical resize, fix overlay hidden toggle, fix timeline cut, fix prev/next ordering & index-based seek, simplify video overlay to JP-only, smart mini-hover dict popover, <16ms realtime playback sync, sidepanel virtualization and floating playhead return.

## [2026-09-19] ingest | Fix Overlay Resize Freedom and Dual Subtitles (VI/EN)

- Filed: `plan/fix-overlay-resize-and-subtitles-2026-09-19.md` and `review/code-review-2026-09-19.md`.
- Overlay Resize: Resolved height lock in `panel.css` (`min-height: calc(var(--bar-box-h0) * var(--bar-user-scale-h, 1)) !important`), delta-based resizing in `content.js` without discontinuous jumps, and window-bound pointer event listeners for bulletproof dragging.
- Dual Subtitles: Fixed poisoned 429 throttle cascade in `service_worker.js` with isolated language errors, prioritized signed tracks over unsigned direct tracks, enforced `fmt=json3` for `tlang` variants in both `service_worker.js` and `page_capture.js`, and enabled concurrent `.lr-card-vi` and `.lr-card-en` rendering in `content.js` and `sidepanel.js`.
- Verification: Measured real pixel expansion (+47.7px height, +80px width) and verified simultaneous live JA/VI/EN subtitle rendering in real Chrome runtime DOM with exit code 0. Anti-fake-test gate PASSED.

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

## [2026-08-05] ingest | Flatten — DeepSeek V4 Flash execute brief

Plan thêm checklist disk + prompt dán; stray root `local-bridge/` ghi rõ. Topic: [topics/flatten-repo-layout.md](topics/flatten-repo-layout.md).

## [2026-08-05] ingest | Đổi tên stray → `_stray-local-bridge-data`

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

## [2026-08-06] ingest | Gộp INCIDENTS → walkthrough; xóa Makefile

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

## [2026-08-24] ingest | Caption throttle: sidepanel trống + overlay không hiện
- Root cause (verified live): SW bắn ≤24 timedtext request/load → YouTube throttle 429/502 per-IP; mọi tầng (SW, page, bridge) dính cùng wall; stall ~25s trước khi báo empty.
- Fix: SW fan-out 24→12 + abort sớm khi 429/502 + negative-cache 60s (`ttMiss:*`); bridge `/captions` bỏ retry ≥400, timeout 10s, LRU cache 10 phút; content bridge tier cap 12s.
- Mobile: iPhone/iPad `CaptionService` tuần tự không burst — không cần sửa; cả hai app BUILD SUCCEEDED.
- Files: `extension/background/service_worker.js`, `extension/content/content.js`, `local-bridge/app/api/captions.py`; plan `plan/fix-caption-throttle-stall-2026-08-24.md`.

## [2026-09-19] ingest | Bridge NLP & Live Chrome Browser Integration Test
- Verification: Started local Python bridge on port 8765 with NLP models (Sudachi, JMdict, vocab frequency). Ran end-to-end live runtime verification suite `scripts/test_live_bridge_and_browser.js` targeting real Google Chrome on macOS with YouTube player.
- Test Phases Verified (6/6 Passed):
  1. GET /health: 200 OK, models_loaded: {sudachi: true, dict: true, freq: true}.
  2. POST /tokenize & /dict: Authentic furigana readings, JLPT level annotations, bilingual Vietnamese/English glosses.
  3. Overlay connection: .hardsub-bridge-pill.ready confirmed present in Chrome DOM.
  4. Live Furigana ruby markup in DOM: Active Japanese cue tokenized with authentic ruby/rt annotations.
  5. Hover Word Dictionary popover: Mouseenter on Japanese token displays .dict-head with bilingual glosses, measured 320x220px in DOM.
  6. Visual screenshot proof captured at `.artifacts/chrome_live_bridge_qa.png`.

## [2026-09-19] ingest | Sidepanel Scroll Button (#sp-follow) Restoration & E2E Proof
- Root cause: `#sp-follow` had a legacy hardcoded `hidden` attribute in `extension/sidepanel/sidepanel.html` that had remained in the main repo. When `#sp-scroll-to-active` was removed, `#sp-follow` was invisible.
- Fix:
  1. Removed `hidden` attribute from `<button id="sp-follow">` in `sidepanel.html`.
  2. Added `.active` styling in `sidepanel.css` (`#233524` / `#a8dfa0` when auto-scroll is on, `#242434` when paused/off).
  3. Guaranteed `followBtn.hidden = false` and descriptive dynamic titles in `syncFollowBtn()`.
  4. Synced changes to main repo `/Users/hoangson/Projects/YouTube JP Caption Studio/`.
- Verification: Reloaded extension in Google Chrome, tested real DOM layout geometry (`width: 60.8px, height: 25.8px`), active green style (`rgb(35, 53, 36)`), click toggle off (`rgb(36, 36, 52)`), and click toggle on (`rgb(35, 53, 36)`) via `scripts/test_scroll_button_qa.js` (Exit code 0).

## [2026-09-20] ingest | Code-taste migration plan and agent hooks

- Filed research and migration plan; detailed style stays in CODE_STYLE.md.
- Native hook configs installed for Codex, Claude, Gemini, ZCode, Antigravity, Hermes, VS Code and Cline; Roo uses shared rules.
- Tests execute protocols, real Git fixtures and installed handlers. Xcode setup, full IDE session coverage and final independent review remain NOT VERIFIED.
- Reconciled preliminary research suggestions with actual manifests and installed hook protocols; no production code migration performed.

## [2026-09-20] ingest | Code-taste hook verification and remaining blockers

- Filed review/code-taste-hooks-verification-2026-09-20.md with commands, actual output and scoped requirements.
- Independent review found three reproducible issues; fixes now have passing regression checks. Reviewer re-check hit the usage limit.
- Xcode app shows the Apple agreement dialog; Roo remains rules-only. All-IDE activation is NOT VERIFIED.

## [2026-09-20] ingest | Xcode hook preparation and independent fix verification

- New follow-up: review/code-taste-hooks-followup-2026-09-20.md.
- Xcode first-launch blocker cleared; prepared isolated Claude/Codex configs and executed their handlers with exit 0.
- Independent reviewer verified all three prior fixes. Xcode login/agent trust and live-session coverage remain open; Roo is rules-only.

## [2026-09-20] ingest | Live Codex edit hook delivery

- Filed review/code-taste-codex-live-probe-2026-09-20.md: sandboxed Codex CLI created a temporary file, exit 0.
- Native session log records before/after hook context around the completed edit; other IDE dispatch remains unverified.

## [2026-09-20] ingest | Claude live hook delivery and client auth blockers

- Filed review/code-taste-other-clients-live-2026-09-20.md: native Claude before/after Write context verified; Hermes real write plus style guidance observed.
- Gemini lacks auth/trust and ZCode has an invalid signing credential; their probes stopped before edits. Full all-client coverage remains unverified.

## [2026-09-20] ingest | Separate Antigravity app, IDE and CLI evidence

- Filed review/antigravity-hook-retry-2026-09-20.md: IDE post-edit dispatch and SYSTEM_SDK context observed in native logs.
- Desktop app remains unverified; CLI probe reports NOT OBSERVED despite hook-file loading and requires first-run consent for interactive inspection.

## [2026-10-09] ingest | YouTube sentence enhancement MVP

Filed supplied revised plan and execution decisions. [Topic](topics/youtube-sentence-enhancement-mvp.md): Phase 0 active; five source transcript snapshots collected, one real HTTP200 JSON3 captured. Existing sidepanel stitch defect reproduced and Original rows restored; full MVP and independent runtime remain NOT VERIFIED. Contradictions retained: old no-Gemini docs, sidepanel heuristic absent from plan overview, analysis-only gate is not release approval.

## [2026-10-10] ingest | YouTube sentence MVP source audit

Read the filed source/pure-slice review from disk. Five HTTP 200 JSON3 sources and independent bounded pure PASS recorded; installed integration, storage, gold/KPI and readiness remain NOT VERIFIED. Historical completion claims do not close these new gates.

## [2026-10-10] ingest | Sentence MVP queue, NLP and backup/restore

Read the new raw review from disk; updated topic/index. Worktree integration supersedes
the earlier module-not-loaded snapshot. Bounded independent slice PASS; installed Chrome,
actual script-store/Drive, gold and readiness remain NOT VERIFIED. Raw reviews preserved.

## [2026-10-10] ingest | Broker lifecycle and native cache identity

Read both new raw reviews fully from disk. Cache bounds/migration/date cooldown and
epoch cancellation have independent bounded PASS. Native first duplicate-ID failure
was reproduced and fixed with owned/deleted/token regressions; later native toggle/export
verified102 unique IDs and source/time preservation. Four automatic MT rows changed;
protected native round trips, anchors, gold, metrics and full release remain open.
Historical raw reviews retained; topic/index/product preview docs updated.

## [2026-10-10] ingest | Source fingerprint and native parser follow-up

Read the raw review fully from disk. Source-content digest/cache identity and async
navigation guards have independent bounded PASS in the worktree. Native worker
follow-up delivered a hashed backup; zero anchors can reflect XML and do not prove
JSON3 parser failure. Native selected track/fingerprint, gold/KPI and full release
remain open. Current Gemini context reports unavailable key, not deleted storage.

## [2026-10-10] ingest | Runtime metrics bounded review

Read the raw review fully from disk. Independent VM/helpers and localhost HTTP
PASS after Red/Green seeking and hidden-RAF fixes; bounded events/receipt dedup
verified. Sampled readiness does not observe intervening clear/restore and does
not certify release. Native metrics/download, independent DOM and KPI remain open.

## [2026-10-10] ingest | Selected track identity and script clock precision

Read both new raw reviews fully from disk. Selected metadata/fresh-cached MAIN
helpers and real HTTP have independent bounded PASS; nine extension files copied
with guarded hashes, native Reload interrupted. Script-store real HTTP/disk
precision loss fixed with independent edge/import/manual TXT preservation checks.
Backend stays worktree-only; full pytest baseline still9failed/25passed. Native
activation, gold/KPI/protected storage/Drive and full release remain open.

## [2026-10-10] ingest | Fifty annotation candidates

Read raw review fully from disk. Prepared50 ignored source windows,30tune/20holdout;
independent integrity matches150 source records and all five snapshot hashes.
All references/review labels remain null, source clocks overlap naturally. Gold,
category coverage, alignment and quality/KPIs remain NOT VERIFIED.

## [2026-10-10] lint | Annotation holdout evidence boundary

Independent final confirms source integrity but cannot certify historical holdout
isolation. Topic retains that qualification; raw preparation statement records the
parent assignment decision, not proof of unseen development data. Overlapping
windows cannot be counted as independent statistical samples.

## [2026-10-10] ingest | Sentence usage and dated cost estimate

Read immutable cost-instrumentation review in full. Independent bounded PASS actual localhost HTTP usage/rejection/privacy/thinking/cache/fallback/expiry; billing null. Two modules copied to main with old-hash guards/backups/modes; native activation still open. Full release remains NOT VERIFIED.

## [2026-10-10] ingest | Native metrics and selected-track activation

Read immutable native-metrics-activation review in full. Actual Chrome Reload/new document exported970408B backup/32214B metrics; independent byte/source/clock/target/production fingerprint/normalization PASS. Supersedes earlier pending activation state, retains prior raw reviews. XML no anchors; Original JA10onsets only/request0, TTFV13.2772s includes enabling overlay; no translation/Enhanced/release KPI claim.

## [2026-10-10] ingest | Metric player clock consistency

Read immutable metric-clock review fully. Production one-line sampler fix independently Red/Green PASS: interleaved frame/player timestamps1discontinuity/2onsets→0/1, renderer/cue/sidepanel inputs unchanged, real exclusion guards retained. Main hash-guarded copy verified; new native activation pending. Native tenanchors distinct, all237discontinuity causes unknown without raw samples. Earlier artifact integrity PASS does not certify release metrics.

## [2026-10-10] ingest | TXT export metadata warning

Filed/read raw warning review; bounded reviewer-authored/root-executed UI and independent exporter/audit PASS. Main HTML/CSS copied with guarded receipts. Native activation/speech/download NOT VERIFIED; three named rollback flags retained as explicit open gap.

## [2026-10-10] ingest | Rollback flags and native cost-clock follow-up

Read immutable follow-up review fully. Independent bounded flags/settings/late MT+NLP/save+restore PASS after initial-disabled sidecar serializer Red/Green fix. Native Chrome Reload/fresh TJ2zrbH0BB4 document confirms readable TXT warning and cost schema; independent artifact/screenshot audit verifies6 distinct OriginalJAonsets/0discontinuity/request0/costnull. Different session/no raw samples prevents causal or full KPI claim. Flags copied after native window, activation remains open. Earlier absent-flags/pending cost-clock-warning states explicitly superseded; gold/live/protected storage/Drive/full goal remain open.

## [2026-10-10] ingest | Lifecycle and mid-flight receipts

Read immutable lifecycle review fully. Independent runtime privacy/bounds/submission/accepted-stale-cache-error and retired-session checks PASS. Actual16-job two-batch Red15ready/request0→Green1midflight/2final reproduced independently; final contentSHA5f5335d supersedes initial5181c301. Three main files guarded copied after review, native flags/lifecycle activation still open. Parent five-source structural coverage/counts remain separate from gold/semantic KPI; full goal active.

## [2026-10-10] ingest | Native preparation lifecycle activation

Fresh Katou/main extension Reload and native export Done; independent artifact/schema/arithmetic PASS for206063B/996preparation revisions/5OriginalJAonsets/measuredpaint. Translation events/HTTP0, costnull, individual flags/quality/protected storage still NOT VERIFIED. Supersedes basic lifecycle pending activation, preserves earlier raw boundaries. [Raw review](../review/youtube-sentence-mvp-native-lifecycle-2026-10-10.md).

## [2026-10-10] ingest | Bridge regression, fresh-process persistence and runtime identity

Read immutable backend review fully. Independent current43tests/pipcheck/actualHTTP/NLP/fresh-process restart PASS; builder/punctuation/rare-HV/cache Reds fixed at shared helpers. Guarded main4file sourcecopy backup/modes/bytes independently verified; no active runtime/data changes. Actual8765belongs to older Antigravity checkout; six overlapping state paths differ, authority transition pending human preference. Main source staging is not native activation. Fullgoal/gold/Gemini/Drive/nativeprotected/fullKPI remain active/unverified.

## [2026-10-10] query | Runtime transition data preservation

Separate main/active state backup receipts prepared with source/destination SHA checks and0700parent; original data/PID unchanged. Authority choice pending; no migration performed. Backend raw remains immutable.

## [2026-10-10] ingest | Native confirmation and benchmark source guard

Read new immutable raw review fully. Independent artifact arithmetic/screenshot PASS confirms native TXT note and cost schema; no live request/billing or clock-causality proof. Stale fingerprint after navigation independently Red→Green fixed by existing sourceKey guard; main staged with backup/hash/mode, native latestguard activation remains open. Historical raw evidence retained. Fullgoal and data-authority choice remain active/pending.


## [2026-10-10] ingest | Partial creator reference and real-data semantic Red

Read immutable raw partial-reference review. Independent29JPEG/current-byte/receipt/uncertainty artifact PASS; actual JSON3 production grouping crosses source17 offsets4/9 and checker exit1, while mandatoryどこquestion boundedPASS. Preservation6cues/70UTF16exactonce does not certify semantics. Fifty source candidates SHA unchanged/null reference values; partial58186B observations separate, no audio timing/gold/KPI promotion. Earlier no-creator-reference state superseded, raw historical reviews preserved. Fullgoalactive; native/bridge/data-authority gaps remain.

## [2026-10-10] ingest | Backrooms partial reference and presented-frame readiness

Read new immutable [raw review](../review/youtube-sentence-mvp-rra-reference-readiness-2026-10-10.md). Independent39accepted/3rejected visuals, byte/receipt/source integrity PASS; three stale/loading pictures excluded/preserved.29readiness4 receipts plus10qualified earlier captures, no audio alignment. Rows08–10 promotional/outro expose representativity gap. Real JSON3 lexical join probe exit1 with6cues/125UTF16 preservationPASS; な/んで and 第1/弾 remain separate. Source speaker hint/gap4.719s means no guard removal or source retiming to force Green. Prior29/source50 unchanged; separate153059B artifact retains original pendingreview fields with later verdict in raw. Fullgoal active, gold/native/Gemini/bridgeauthority gates NOT VERIFIED.

## [2026-10-10] ingest | Bounded ordinal continuation, version metadata and delivery

Read finalized immutable [raw review](../review/youtube-sentence-mvp-ordinal-continuation-2026-10-10.md). Independent shared-helper/version/safety Red→Green PASS after reviewer-found verb false positive narrowed; root actual DOM Undo/Original text/clocks/pixel delta0 and independent screenshot/receipt audit PASS. Main two-file exact guarded copy/backup/mode0644 independently verified; native activation NOT VERIFIED. Only prior rra08 lexical FAIL superseded; rra05/source17 and gold/live Gemini/full KPI/bridge authority remain open, previous raw reviews unchanged. Fullgoal active, Original default.

## [2026-10-10] ingest | Bilingual active-cue JLPT renderer

Read finalized [raw review](../review/youtube-sentence-mvp-bilingual-active-cue-2026-10-10.md) from disk. Local Node renderer unit and isolated Chromium ten-case DOM receipt checker PASS: active-cue N-level colors, 単純 N3, neutral missing/unrelated text, exact whitespace, token immutability, and N4→N2 text/bounds invariants. No independent reviewer or native extension activation for this slice, so status remains NOT VERIFIED; Gemini/video, gold, KPI and full release gates stay open.


## [2026-10-10] ingest | Revised plan copy and latest native reload/cost-clock check

Filed the Downloads revision as a new dated raw plan with its body byte-identical to the source; older 2026-10-09 raw plan remains unchanged. Read the new native follow-up from disk before ingest. Chrome reload and exact eight-file hash comparison confirm the current package path; TXT loss warning and measurement export are visible. The 78,624-byte trace has 3,978 ms track-load, 12 ready Original-JA onset samples, no JP paint/TTFV, one seek discontinuity, 0 Gemini requests, and cost NOT VERIFIED; 340 preparation records are not independent sentences. Independent reviewer unavailable. This does not close source17/rra05, five-video audio gold, live translation, persistence/Drive, readiness KPI, or release gates; full goal remains active.


## [2026-10-10] ingest | Semantic recheck and bridge authority

Read the immutable semantic/runtime checkpoint from disk before ingest. Current JSON3 semantic checks remain source17 FAIL and rra05 FAIL; rra08 ordinal join PASS. Five real snapshot structural projection is512 cues/766 groups/7 merges/538 display units, exact source coverage only. User selected the current Antigravity runtime/data as authority; listener/cwd confirm PID74619 there. Synthetic read-only `/health` and `/tokenize_batch` return parsed HTTP200. No production code, script, DB, process, or bridge state changed. This supersedes the pending data-authority choice without authorizing migration. Full gold/Gemini/Drive/KPI/release remain open; original default and full goal active.

## [2026-10-10] ingest | Native bilingual package follow-up

Read the finalized [raw follow-up review](../review/youtube-sentence-mvp-native-bilingual-package-followup-2026-10-10.md) from disk; its two review links resolve and it has no trailing whitespace. Full extension-tree comparison found the active-cue renderer differed from the previously inspected Chrome source. A guarded two-file copy preserved old bytes/modes and now verifies equal source/main hashes; main Node unit and syntax checks pass. This is filesystem evidence only: a post-copy native Chrome reload is pending. Source17/rra05, gold, live translation, Drive, KPI and release remain open; bridge authority remains Antigravity by user choice.

## [2026-10-10] ingest | Semantic boundary tokenizer recheck

Read the immutable raw review from disk. Five real `/tokenize_batch` inputs return HTTP200 and exact source; Sudachi leaves `きし` as a noun, so POS does not establish source17's visual intra-cue offsets. rra05 `な`/`んで` POS distinction does not override `speakerChange:true` and the 4.719s source-window gap. No heuristic/source/runtime data change; the live probe increments an in-memory latency metric only. Semantic boundaries and full50 audio gold remain NOT VERIFIED/FAIL; full goal active.


## [2026-10-11] ingest | Enhanced default, independent review and delivery correction

Read finalized immutable [implementation review](../review/youtube-sentence-mvp-enhanced-default-2026-10-11.md) and [delivery companion](../review/youtube-sentence-mvp-default-delivery-2026-10-11.md) from disk. Content Red→Green and actual localhost HTTP scheduler independent PASS; parent isolated production sidepanel default/toggle/Undo PASS with separate independent artifact audit. Exact one-file main copy/backup/mode0644 and main syntax/diff-check verified. Supersedes historical Original-default statements. Companion withdraws unsupported scroll cause: first top delta−60.5px, other dimensions0 and later deltas0; cause NOT VERIFIED. Native reload, source17/rra05, audio gold, live Gemini, protected storage/Drive and full release remain open. Antigravity runtime/data retained; full goal active.


## [2026-10-11] ingest | Authorized Antigravity restart and TXT clock preservation

Read the finalized immutable [runtime/import review](../review/youtube-sentence-mvp-runtime-and-import-clocks-2026-10-11.md) from disk. User authorized only two clock helpers plus same-runtime restart, keeping Antigravity data. Independent backend/parser/deployment PASS; currentPID42809/samecwd/venv/8765 and livehealth200/readytrue verified. All44 live data files/set/hash/size/modes and44 backups unchanged. Deployed-source isolated actualHTTP save/disk/newprocess/load preserves precise clocks and protected fixture fields;422 leaves temp disk unchanged. Main TXT parser delivery independently verified after Red→Green and150013 Python→JS cases. Supersedes old candidate-pending/PID74619/process-unchanged status without authorizing migration or reconstructing earlier rounded clocks. Native latest reload/import, live8765 script round-trip, renderer independent review, gold/Gemini/Drive/KPI/full release remain open; full goal active.


## [2026-10-11] ingest | Independent bilingual renderer, alias fixes and delivery

Read finalized immutable [renderer follow-up](../review/youtube-sentence-mvp-renderer-independent-2026-10-11.md) and [caller correction](../review/youtube-sentence-mvp-renderer-callers-correction-2026-10-11.md) from disk. Three independent real-module Reds closed by minimal shared alias/collision fix; existing assertions retained plus regressions. Independent module/main checks and byte/mode/backups PASS. Parent actual five-case/15line DOM N4→N2 color/text/input/bounds PASS with independent artifact audit; no reviewer browser run, screenshot viewport only. Supersedes bounded renderer independent-review-unavailable status and current main hash, not native/gold/Gemini/storage/Drive proof. Correct actual caller names updateBar/renderBilingualVi/renderBilingualEn; raw historical labels preserved with correction. Antigravity runtime/data retained and all44 preservation still verified; full goal active.

## [2026-10-11] ingest | Cue provenance and exact TXT revision candidate

Read finalized immutable [raw review](../review/youtube-sentence-mvp-cue-provenance-2026-10-11.md) from disk. Independent provenance and exact-clock revision Reds closed in worktree plus selected-runtime two-helper candidate8adeebf…; realHTTP/tempdisk/newprocess/productionNode composition and44pytest PASS. Candidate other30 Python files unchanged; sidecar maps are fixtures and native/Drive NOT VERIFIED. Historical normalization caveats superseded only for candidate. Current Antigravity remains source5551989…/PID42809, parent all44 preservation/health PASS; additional deployment pending scope approval, no script writes/migration. Full goal active.

## [2026-10-11] ingest | Source mapping restore and authorized provenance deployment

Read finalized immutable [companion review](../review/youtube-sentence-mvp-source-restore-runtime-2026-10-11.md) from disk. New explicit authorization applied reviewed two-helper Antigravity provenance/revision update: PID42809→60231/source8ade…, same cwd/venv/8765, independent health200 and all44data+44backups hashes/bytes/modes preserved. Selected-source isolated actualHTTP/disk/newPID/productionNode composition PASS; no live scripts writes/migration. New shared extension metadata/clock converter and legacy lock fixes independently PASS after original/extra/full-loader Reds;36 actual save-worker-freshVM checks,512captured mappings/group equality and guarded main4file delivery verified. Supersedes candidate-pending/metadata-drop history in bounded scope; native actual sidecar/Drive/oldclient/audioGold/Gemini/KPI/fullrelease still open, fullgoalactive.


## [2026-10-11] ingest | Partial native reload and current runtime delta

Read finalized [raw review](../review/youtube-sentence-mvp-native-reload-partial-2026-10-11.md) from disk. Parent Katou mainpath/0.11.2/Reloaded observed; fresh Parako backup unavailable after window change. Independent verifier1 supersedes current equality inference: baseline44/current48,added4/changed4/removed0;44backups exact. Independent512orderedIDs/texts/targets/starts/flags retained,12ends about0.05s different; cause/cache/timing intent NOT VERIFIED. Prior deployment point-in-time PASS remains historical. Runtime/source/main verified; no new code, production-data rollback/reconcile or fullMVP claim.


## [2026-10-11] ingest | Stale-save guard, load/save race and main client delivery

Read finalized [raw review](../review/youtube-sentence-mvp-stale-revision-guard-2026-10-11.md) from disk. Three actual Reds closed: explicit stalePOST wipescue, heldTXTload rolls7→6, failedclient409 schedulesDrive. Independent boundedPASS current45pytest/12standalone/HTTP/newprocess/clientlateconflict; selectedsourcecandidate twofilesonly/other29exact NOTDEPLOYED. Main3df134/clientcheck delivery independentlyPASS bytes0644/oldbackup/protocol/36restore; nativeactivation NOTVER. Loglater512cuePOST200 plusactualoldformatter12/12compatibility narrowtiminghypothesis; causalityNOTVER/norollback. LegacyNone/rawmirror/delete/external/multiworker/fullSTORE-02 andgold/Gemini/KPI/source17rra05 remainopen; goalactive.

## [2026-10-11] ingest | Authorized revision deployment and mirror validation

Read new finalized raw review; Antigravity exact2file revision guard deployed PID95355/all48current+backups exact; separate3function mirror candidate independentlyPASS/notdeployed. Human confirms source17boundary and rejects rra05stray; partial references only. Fullgoal/native/Drive/audio50/Gemini/KPI remainopen.

## [2026-10-11] ingest | Approved mirror deployment and separate revision race

Read finalized [raw review](../review/youtube-sentence-mvp-mirror-deploy-revision-race-2026-10-11.md). Live PID8005/store3396 onefile deployment independentlyPASS/all48current+backups exact; supersedes prior mirror candidate pending. Separate incominglowerrevision/worker honest failure candidate PASS/notdeployed, equal-revision/legacy/native/Drive/gold/Gemini/KPI gates open; full goal active.

## [2026-10-11] ingest | Equal-revision mirror conflict

Read finalized [raw review](../review/youtube-sentence-mvp-equal-revision-conflict-2026-10-11.md). Actualsame6collision changed3files Red→409/all4exact Green; productionworker local6→7remote7 and6→8remote7 verified. Candidatea2e8store/2bdAPI/862worker independentlyPASS/notdeployed; livePID8005base retained, expandedruntimeapproval separate. Legacy/native/Drive/gold/Gemini/KPI/fullgoal open.

## [2026-10-11] ingest | Conflict guard deployment and legacy TXT regression

Filed/read [raw review](../review/youtube-sentence-mvp-conflict-deploy-legacy-txt-2026-10-11.md); updated active/index/topic. Exact approved deployment independently verified at48-file checkpoint; native activation remains unverified; new disposable JSON-only compatibility failure retained as required next work.

## [2026-10-11] ingest | Legacy JSON/TXT candidate and quota checkpoint

Read finalized [raw review](../review/youtube-sentence-mvp-legacy-txt-sync-2026-10-11.md) from disk. Actual JSON-only regression and reviewer clock-alias Red closed in final57cef one-file candidate; independent HTTP/worktree/selected source and46pytest boundedPASS. Not deployed; previous runtime/data checkpoint remains historical; actual Drive/native/audio50/Gemini/KPI/fullgoal open. Updated topic/index, retained immutable prior failure/deployment reviews.

## [2026-10-11] ingest | Authorized legacy JSON/TXT deployment

Read finalized [raw companion](../review/youtube-sentence-mvp-legacy-txt-deployment-2026-10-11.md) from disk. Explicit onefile/restart/preservedata approval executed; PID18180/source57cef verified independently,31app exactonechange/30same and48current+48backups inventory/hash/bytes/modes exact at fresh audit. Supersedes pending candidate without editing previous raw. No live scripts writes/native actions; actual Drive/native/audio50/Gemini/KPI/fullgoal open.


## [2026-10-11] ingest | Native legacy checkpoint and bounded artifact audit

Read finalized [raw review](../review/youtube-sentence-mvp-native-legacy-checkpoint-2026-10-11.md). Actual Katou Reloaded/Enhanced/backup/benchmark,102 ordered cue fields match current/deployment; raw109/source101/backup102 separate; zero protected/Undo/translations. Independent artifact audit exit0; JA cold2/warm38 only, no provider requests/nullcost. Current48 paths4changed/rev9→15 with cue fields/tokens unchanged supersede perpetual data-equality inference, historical deploy audit retained. UI key missing/currentcontext, Drive menuhint/nofreshOAuth; native restore/audio50/Gemini/KPI/fullgoal open.


## [2026-10-11] ingest | Real Chrome MV3 local storage restart

Read finalized [raw review](../review/youtube-sentence-mvp-chrome-storage-restart-2026-10-11.md). New actual fresh-Chromium storage regression closes interim save assertions after reviewer finding; parent+independent final exit0, lockedblank/owned/tombstones/nonempty targets/tokens/Undo/savedother/restart/stale script+state verified. Onlycopied worker/manifest bridge URL adapters,80others exact; no production/native UI mutations. Content restore/valid recovery/Drive/audioGold/Gemini/KPI/fullgoal still open.


## [2026-10-11] ingest | Actual content restore and Undo across reload

Read finalized [raw review](../review/youtube-sentence-mvp-content-undo-reload-2026-10-11.md) from disk. Parent actual direct-row Red closed by three-line shared loader await+generation guard; final parent and independent Chromium UI/API Green, protected blank/precise clocks/export/Undo/recovery bounded synthetic matrix. Actual DOM rectangles, Undo/reload IDs/text exact; independent0px deltas only those snapshots. Main delivery86files exactly1changed/85same/source6999d4ac/originalbackup3df134/mode0644 independently verified. No bridge/data/user-profile mutation, native activation and fullSTORE-02/sourcechange/Drive/audio50/Gemini/KPI/fullgoal open. Prior raw history retained, new quiet availability question pending.

## [2026-10-12] ingest | Audio listening model gated plan, benchmarks, and candidate integration

Read finalized raw plan `plan/audio-listening-model-2026-10-12.md` and review reports `review/audio-access-feasibility-2026-10-12.md` and `review/asr-benchmark-2026-10-12.md`.
- Milestone M0 (Feasibility): GATE GO, documented tabCapture delayed mode (2.5s–5.5s) and user-gesture requirement.
- Milestone M1 (Gold Dataset): 20 candidate windows in `testdata/audio-gold/manifest.json`, 16 kHz polyphase resampler script `scripts/slice_gold_audio.py` with ffmpeg fallback.
- Milestone M2 (Metal Benchmark): `scripts/asr_benchmark.py` verified Levenshtein CER and normalized CER preserving `々` (\u3005) and `ー`. `mlx-community/whisper-large-v3-turbo` on Apple Silicon Metal measured RTF = 0.0505, RAM RSS = 1.728 GB, Cue 19 aligned CER = 0.00% (corrected `勘無料` -> `感無量`).
- Milestone M3 (Candidate Integration): Backend route `POST /asr/transcribe` in `local-bridge/app/api/asr.py` and `app/services/asr.py`. Offscreen audio capture via WebM Opus in `extension/offscreen/audio_capture.js`. Strict data protection invariant `canReceiveAsrCandidate(cue)` protecting locked/edited/owned cues. Sidepanel candidate UI with Accept / Revert and Undo revision creation.
- Audited entire branch diff: verified 100% test pass on candidate lifecycle, sentence groups, ASR API (14/14), root benchmark tests (30/30), and clean `git diff --check` with exit code 0.

## [2026-10-20] ingest | P0 remediation of the full-codebase audit

Read the finalized raw audit `review/full-codebase-improvement-audit-2026-10-18.md` and filed
`plan/p0-remediation-2026-10-20.md`; topic `topics/p0-remediation-2026-10-20.md`.
Every P0 was re-verified against the code before patching (the audit itself contains two wrong
findings and one half-right finding, so it was treated as a hypothesis list). Shipped on
`fix/audit-p0-remediation-20261020`, based on `fix/audit-p0-20261020` @ 378e2aeb6 — `master`
was never a base of the branch.

Fixed: local-bridge (per-thread SQLite connections + once-per-process schema creation, sync
cap with a `has_more`/`next_since` cursor, 413 on oversized payloads, duplicate `hanviet`
field, missing `Any` import, `close_dictionary` over all threads, ffmpeg timeouts, title/url
injection), extension (`nextCursor` ReferenceError, JLPT levels lost to duplicate map keys,
Drive mirror queue across an SW idle-kill, offscreen capture error propagation, MediaRecorder
timeslice slicing, offscreen document close, layout interval leak, `ev.data` primitive guard,
`play` listener leak, fail-closed tab id, `awaitDisk` promise), side panel (row order, shared
settings blob, slider write storm, modal nesting, tab re-render, `tabStates` leak, entity
injection), web companion (hydration mismatch, vocab resurrection, swallowed write errors),
CI (`bridge-test-suite` honestly green on Linux, `BRIDGE_URL` honoured, new `extension-tests`
and `root-tests` jobs, anti-fake gate scope) and housekeeping (no machine-specific paths,
valid walkthrough evidence, 0-byte capture removed, TTML fixture moved to `testdata/`).

Verified: 11/11 extension suites exit 0; local-bridge 84 passed / 5 skipped (mlx-only);
repo-root 30 passed; `npm run check` exit 0; anti-fake gate PASSED; `git diff --check` clean.
An independent read-only review flagged one blocking defect (a cold-start SQLite
"database is locked" race introduced by the first fix) and four partial gaps; all were fixed
in `769f501a6` and a second review was run.

Open: the audit's P1/P2 lists, 5 pre-existing `scripts/*sanity*.js` failures (identical on a
pristine base tree), and the `bridgeJson()` 5xx blind spot that keeps a failed Drive mirror in
the queue.

## [2026-10-21] ingest | P1/P2 remediation of the full-codebase audit and the merge into master

The P0 remediation topic now also covers the P1 and P2 rows of the same audit
(2026-10-18) and the merge into `master` (2fff75c48, `git merge --no-ff`, no
conflicts: master's tree was identical to the branch base 378e2aeb6).

Closed in the branch (19 commits): the Gemini API key moved out of
`chrome.storage.sync` into `chrome.storage.local` (sync replicated it to every
signed-in Google account); `/asr/transcribe` accepts only allowlisted models and
takes a governor slot; the error bodies no longer echo ffmpeg/MLX internals;
`tokenize_ja` emits no sentence-wide token when Sudachi is missing (the repo's
anti-clumping invariant); `vocab_freq` reports "loaded" only after a successful
read; `script_store` fsyncs before the atomic replace; the dictionary queries the
Han-Viet characters in one go and holds one connection under a lock; the content
script only rebuilds the sentence engine when the cues changed; the web app got
a schema version and a first `node --test` suite; the launchd plists were fixed
(a quoted `$HOME` path - `bash -lc "~/Documents/YouTube JP Caption Studio/…"`
was word-split and could never run); the anti-fake gate now scans the worker and
the content script; CI runs the new worker/content/web tests.

Found while repairing the stale sanity harnesses: a failed translation was
retried immediately when the revision changed (the 30 s backoff no longer
depends on the revision), and a bridge 5xx read as "nothing to mirror" so a
queued Drive upload was dropped (the mirror now reads strictly and fails
loudly).

Verified on `master` after the merge: 15 extension suites, 133 bridge tests, 30
repo-root tests, 25 sanity scripts, 7 web tests, the anti-fake gate - all green;
all four CI jobs simulated green on a clean `git archive master` tree. Seven
independent read-only reviews ran in total; every finding is closed with a test
that fails on the old code.

## [2026-10-21] lint | Wiki state after the audit remediation merge

Checked per AGENTS.md §4 (lint):

- **Stale "active" rows**: the P0 remediation row now reads *merged into `master`*. The other
  open rows (local-bridge audit 2026-08-06, perf/UX sweep 2026-08-23, codebase improvements
  2026-08-22, the sentence MVP native activation) are older work with open items - left
  untouched, no evidence here to close them.
- **Topic vs newer review**: `topics/p0-remediation-2026-10-20.md` was reconciled with the
  final acceptance review - the "5 sanity suites fail" claim and the "bridgeJson 5xx blind
  spot" gap are gone (both fixed), and the raw plan file was restored to its filed content
  (§4: `plan/` is immutable) with the corrections moved into the topic page.
- **Orphans / cross-links**: `review/full-codebase-improvement-audit-2026-10-18.md` and
  `plan/p0-remediation-2026-10-20.md` are both linked from the topic page and from
  `index.md`; no orphan topic was found.
- **Open gaps not tracked as topics**: none - every remaining gap of the 2026-10-18 audit is
  listed in the P0 remediation topic ("Open gaps").
- **Layer rule**: no file under `plan/` or `review/` was rewritten after filing; the one
  exception (the cursor contract and the verification commands) was reverted and re-filed in
  the wiki layer.

## [2026-10-22] ingest | Codebase audit 2026-10-22 — 8 P0 / 24 P1

Filed [review/codebase-audit-2026-10-22.md](../review/codebase-audit-2026-10-22.md); topic page
[topics/codebase-audit-2026-10-22.md](topics/codebase-audit-2026-10-22.md).

Read-only audit of the whole repo by 6 parallel agents (bridge / extension / web / iOS /
infra+docs / cross-cutting), each P0/P1 re-verified by hand against disk with a real command.
Distinct from the 2026-10-18 audit: that one's P0s were remediated and merged (`2fff75c48`) and were
re-verified here as **closed**; this audit covers what remains.

Top findings (full detail + evidence in the raw review):

- **A-1** `vocab[].meaning` carries two incompatible meanings (bridge packs *status*,
  iOS packs *gloss*) in the same `caption-studio-backup.json` -> silent vocabulary data loss in
  **both** directions. Root cause of the cluster: no single source of truth for the vocab record.
- **A-2** iOS writes `caption-studio-vocab.json`; **nothing reads it** -> the documented
  iPad->extension vocab path is dead.
- **A-3** iPhone does not bundle `user_script.js` -> the whole WKWebView bridge is dead on iPhone.
- **A-4** the capability-token gate rejects a *wrong* token but never a *missing* one.
- **A-5** `extension/popup/` is tracked but `_next/` is gitignored -> blank Saved Items UI on a
  fresh clone; no CI job builds the extension.
- **A-6/A-7** `scripts/test_bugfixes_qa.js` is a banned string-matching test, and the anti-fake
  gate has a false negative that let it pass.
- **A-8** README/walkthrough document UI that does not exist (`[ (LR) ON ⚙ ]` pill, `.lr-card-vi`).
- **B-1** `pytest -q local-bridge/tests/` exits **139 (SIGSEGV)** after "140 passed" on macOS/arm64
  (native MLX/Metal static-destructor teardown, order-dependent). Reproduced 3/3.

Also verified clean and recorded: XSS sweep, secret scan, network-egress inventory, bridge
path/command/SQL injection, iOS Keychain + ATS, web type safety, extension 15/15 suites.

Wiki hygiene fixed during this ingest (the lint was **red** before, green after):

- 4 broken links: `plan/studio-caption-fixes-and-ux-optimization-2026-09-19.md` and
  `review/code-review-2026-09-19.md` never existed on disk. Re-pointed to the two real 2026-09-19
  plans; the missing review is now stated as missing instead of linked.
- 7 catalog warnings: 5 plans + 2 reviews added to the `wiki/index.md` catalogs.
- `topics/flatten-repo-layout.md` was an orphan topic -> now in the navigation table.
- `topics/vietnamese-caption-loading.md:4` link depth `../plan/` -> `../../plan/`.
- 5 absolute `file:///Users/hoangson/...` links -> relative.
- `topics/studio-caption-fixes-and-ux-optimization.md` claimed "0 broken links, 0 warnings, Exit 0"
  and "pytest -> Exit 0"; both were false on 2026-10-22. Corrected in place with the real numbers
  instead of being silently dropped.

`bash scripts/wiki_sync_and_lint.sh` -> **Exit 0, 0 broken links, 0 warnings** (was Exit 1, 4 errors,
7 warnings).

## [2026-10-22] lint | Correction: the A-8 "pill does not exist" claim was wrong

While fixing A-8 I re-read the toggle path and found my own audit conclusion was wrong.
`content.js:4000-4013` does build the player pill (`.hardsub-ytp-toggle`: `LR` badge +
`playerToggleLabel()` -> "ON"/"OFF" + `⚙` -> `openSettingsModal()`), inserted into
`.ytp-left-controls` after `.ytp-time-display`. `.hardsub-bridge-pill` is a different
element: the bridge-status dot inside the overlay.

The real documentation defect is narrower: the `[ ... ]` notation in README/walkthrough
does not match the DOM, and "dual-card / lower card" is wrong because only one
`.lr-card-ja` is rendered with `.bar-vi` / `.bar-en` rows inside it.

A-8 therefore drops from P0 to P2. Because `review/` is immutable (§4) the correction is
recorded in [topics/codebase-audit-2026-10-22.md](topics/codebase-audit-2026-10-22.md)
instead of editing the filed audit.

Method note: concluding "does not exist" from a literal-string grep is string matching —
the very practice A-6/A-7 of the same audit condemns. Absence claims must be made by
behaviour (class/handler), not by the wording a doc author invented.

`bash scripts/wiki_sync_and_lint.sh` -> exit 0, 0 broken links.

## [2026-10-22] cleanup | Remediation round 1 + A-3 correction

Fixed and committed (each with its own red-before/green-after evidence):

| Commit | Finding |
|---|---|
| `7788db731` | B-21 — `write_files()` accepted a `cues.json` with no `cues` array when the payload had no `meta.json`, writing unreadable JSON to disk. Reproduced, then hoisted the shape check out of the rev branch. |
| `775d275ae` | A-4 — the capability gate rejected a *wrong* token but accepted a *missing* one (`capAcceptsReply`). Old predicate executed: `('secret', undefined) -> true`; new: `-> false`. |
| `561472851` | A-6/A-7 — the anti-fake gate hardcoded two variable names, so `test_bugfixes_qa.js` passed CI while being the banned pattern. New rule: assert on a receiver assigned from `readFileSync()` or a literal = fake. It found a **second** fake test the audit missed (`test_scroll_button_qa.js:44,58`). |
| `28b59d1e4` | A-8 — README/walkthrough now describe the real DOM (one `.lr-card-ja` with `.bar-vi`/`.bar-en` inside; pill `.hardsub-ytp-toggle`). |
| `f669bcd9c` | A-1 — `vocab[].meaning` no longer carries the status; the Drive upload merges by word instead of replacing the file. |

Correction — **A-3 drops from P0 to P2**: the iPhone deliberately ships no page bridge and
has native fallbacks for captions (`CaptionService.fetchCues`), playhead (0.125 s timer +
extrapolation) and the overlay rect (`resolvedVideo` falls back to the full pane). Two code
comments state the intent. The real defect is only the silent `if let` plus six handlers in
`YouTubePlayerView.swift:49-59` that can never fire. Consequence for B-10: both
`LayoutSmoke.swift` files are **never called** in either app, so they are dead, mutually
contradictory code — delete them, do not "merge the rules".

Still open: A-2 (iOS writes `caption-studio-vocab.json`, nothing reads it), A-5 (popup
`_next/` not tracked), B-1 (macOS pytest SIGSEGV), B-2 (3 dead self-checks), B-10/B-14
(delete dead LayoutSmoke, ATS drift in `ipad-app/project.yml`), B-15/B-16 (25 sanity
scripts outside CI).

Gates after this round: `128 passed` bridge (ignoring the known segfault pair), 15/15
extension suites exit 0, anti-fake gate exit 0, wiki lint exit 0.

## [2026-10-22] cleanup | Remediation round 2: dead self-checks + the segfault

- `cf58aaefa` **B-2** — `test_captions_cache.py`, `test_snapshot_roundtrip.py` and
  `test_sqlite_parity.py` only had `main()` + `if __name__`, so pytest collected **0**
  tests and no CI job ran them. Each now exposes `test_selfcheck()`. Caption-cache TTL,
  the snapshot round-trip and SQLite dictionary parity had no coverage at all while
  looking covered. Bridge suite 128 -> 131 passed.
- `105141cc3` **B-1** — `pytest -q tests/` exited **139 (SIGSEGV)** after printing
  "passed", 3/3 runs. Native crash in the MLX/Metal static destructors after
  `Py_FinalizeEx`; needs a real `mlx_whisper` load **and** the scipy/ffmpeg DSP path in
  one process (reversing file order made it vanish — the destructor-ordering signature).
  The five real-model tests are now opt-in behind `JP_RUN_MLX_TESTS=1`:
  default run **exit 0** (145 passed, 5 skipped); opt-in still 150 passed + exit 139.
  This works around a crash inside MLX teardown, it does not fix MLX. CI was never
  affected because `pytest.importorskip("mlx_whisper")` already skipped these on ubuntu.

Round-1 commits: `7788db731` B-21, `775d275ae` A-4, `561472851` A-6/A-7,
`28b59d1e4` A-8, `178a04bc4` A-1.

Gates: bridge `145 passed, 5 skipped, exit 0` · 15/15 extension suites exit 0 ·
anti-fake gate exit 0 · wiki lint exit 0.

## [2026-10-22] ingest | A-2 — iPad vocab file đọc được từ extension

`review/codebase-audit-2026-10-22.md` A-2 (iOS ghi `caption-studio-vocab.json`, không ai đọc)
**đã sửa** ở `cc01eb0ad`. `pullDriveIfNewer` giờ tra file theo tên trong folder sync rồi merge
cộng thêm vào `userVocab` (`mergeIosVocab`): từ đã có trên PC giữ status, từ lạ vào `learning`,
entry rỗng bỏ qua, không ghi đè/không xoá. Ponytail ceiling: additive-only, chưa có LWW theo
từng từ vì wire shape chưa mang `updatedAt` mỗi entry. File phụ là best-effort — thiếu file thì
`{ skipped: "absent" }`, lỗi Drive bị nuốt để không làm hỏng cả lần pull.

Gates: 15/15 extension suite exit 0 (có block `mergeIosVocab` mới, red → green trên worker
pre-fix) · anti-fake gate exit 0 · `verify_extension_popup.js` exit 0 · wiki lint exit 0.

## [2026-10-22] ingest | B-4 + B-6 — pull Drive merge thay vì xoá sạch library

`review/codebase-audit-2026-10-22.md` B-4/B-6 **đã sửa** ở `c6f6097da`.

B-4: `BackupService.apply()` xoá toàn bộ `VideoScript`/`Vocabulary` rồi insert lại; nhánh
`syncFromDriveIfNewer` (auto-pull foreground, không cần user xác nhận) gọi chính hàm đó →
mất phụ đề đã chỉnh trên iPad mỗi lần pull. Thêm `apply(_:to:merge:)`: pull merge theo
`videoId`/`cue id`, giữ row mà snapshot không mang; `Restore` thủ công vẫn giữ semantics thay
thế. `encodeSnapshot` gom từ bảng cue thay vì tin relationship `script.cues` (chính codebase
ghi relationship này có thể rỗng) → snapshot không còn mang script rỗng cue.

Ponytail ceiling: cue bị pull thay bằng row mới thay vì sửa tại chỗ — sửa tại chỗ thì
relationship giữ bản sao cũ và tombstone không tới được UI (chính self-test bắt được lỗi này).

B-6: iPad `clearTranslations()` nạp lại cả cue đã tombstone; iPhone đã filter. Đã đồng bộ 1 dòng.

Thêm `scripts/swift_store_smoke.sh` — `BackupSmoke.run()` trước đây **không có call site**
nên không bao giờ chạy; giờ chạy headless trên macOS (compile cùng source, chỉ bỏ UI picker
iOS-only). Kèm launch arg `-CS_AUTOTEST_BACKUP` cho cả 2 app.

Proof: `scripts/swift_store_smoke.sh ipad-app` + `iphone-app` exit 0 (`[BackupSmoke] ok`) ·
red proof (bỏ `merge: true`) fail với *"a cue absent from the snapshot is not deleted by a merge"*,
exit 133 · build Debug + Release cho iPad/iPhone đều `** BUILD SUCCEEDED **` exit 0 ·
bridge `145 passed, 5 skipped, exit 0` · 15/15 extension suite exit 0 · anti-fake gate exit 0.

## [2026-10-22] ingest | B-5 — wipe tombstone thay vì hard-delete

`review/codebase-audit-2026-10-22.md` B-5 **đã sửa** ở `9248d8388`. `ScriptCue.wipeAll()` xoá
cứng row `VideoScript` → Drive không biết → lần pull sau hồi sinh đúng script user vừa xoá.
Giờ wipe đặt tombstone (`isDeleted`) cho mọi cue + đánh dấu dirty; nhánh sync đã có sẵn case
"mọi cue dirty đều là tombstone → merge không còn dòng nào → đẩy script rỗng" nên không cần
code Drive mới. Script cache YouTube (unowned) không đánh dấu dirty — trên Drive không có gì
của user để xoá.

Thêm `ScriptStoreSmoke` (rows còn, mọi cue tombstone, không còn cue sống, script không bị
xoá, cue ids dirty) và chạy nó từ `App.swift` cùng các smoke DEBUG khác. `BackupSmoke.run()`
trước đây **không có call site** → giờ chạy ở `App.swift`; `scripts/swift_store_smoke.sh` chạy
cả hai headless trên macOS.

Proof: `scripts/swift_store_smoke.sh ipad-app` + `iphone-app` exit 0 · red proof (bản wipe cũ)
fail *"wipe keeps the rows"* exit 133 · build Debug + Release iPad/iPhone đều BUILD SUCCEEDED.

## [2026-10-22] ingest | B-15/B-16 — sanity scripts vào CI, skip không còn giả vờ pass

`review/codebase-audit-2026-10-22.md` B-15/B-16 **đã sửa** ở `c90f3a082`.

- `scripts/run_sanity_suite.sh` chạy toàn bộ `scripts/*sanity*` và tách pass/skip/fail:
  exit 0 = pass, **77 = skip**, khác = fail; summary in ra script bị skip để CI thấy rõ
  phần nào **chưa chạy**.
- 4 script "cần input ngoài" đổi exit 0 → 77; 2 script playwright thiếu dependency thì skip
  kèm hướng dẫn thay vì crash `Cannot find module 'playwright'`.
- CI thêm job `sanity-scripts` (ubuntu) và `ios-build` chạy thêm `scripts/swift_store_smoke.sh`
  cho cả 2 app.

Quan trọng: suite này **bắt được regression do chính commit A-2 gây ra** — harness
`sentence_drive_mirror_sanity.js` cắt riêng `pullDriveIfNewer()` khỏi worker và stub các hàm
lân cận, nên lời gọi `pullIosVocabSnapshot()` mới không tồn tại → cả lần pull chết với
"pullIosVocabSnapshot is not defined" thay vì HTTP409 mong đợi. Đã stub trong harness, và worker
đổi `.catch()` → `try/catch` (throw đồng bộ không phải promise reject, `.catch()` không bắt được —
nếu không sửa thì một lỗi helper có thể làm hỏng cả Drive sync).

Proof: `scripts/run_sanity_suite.sh` → **21 passed, 6 skipped, 0 failed**, exit 0 ·
`scripts/sentence_script_store_sanity.py` exit 0 (trước đó fail) · 15/15 extension suite exit 0 ·
anti-fake gate exit 0.

## [2026-10-22] ingest | B-22/B-23/B-24 — biên nhận payload, N+1 query, 5000 transaction

Ba finding hiệu năng/robustness của bridge **đã sửa**:

- **B-22** `ad20ed44e` — `/asr/transcribe` đọc cả body rồi mới so 50 MB. Giờ đọc theo chunk
  1 MB, chặn ngay khi vượt hạn mức; request có `Content-Length` khai báo vượt hạn bị từ chối
  **không đọc byte nào**. Multipart cũng đọc theo chunk thay vì `await file.read()`.
- **B-23** `a8b0f7c31` — `_get_mazii_details()` chạy 1 SELECT cho **mỗi** kanji (137 statement
  cho từ dài). Gom thành 1 query `WHERE kanji IN (...)`; giữ nguyên thứ tự chữ và bỏ qua chữ
  không có dòng.
- **B-24** `a8b0f7c31` — `/saved/sync` gọi `upsert_item()` từng item: mỗi item 1 transaction +
  1 SELECT đọc lại → 5000 commit cho 1 page 5000 item. Giờ là 1 `executemany` trong 1
  transaction; `_upsert_params()` tách phần chuẩn hoá; `upsert_batch()` (không có caller) đã xoá.
  Vẫn giữ guard Last-Write-Wins `WHERE excluded.updated_at >= saved_items.updated_at`.

Proof: bridge suite **155 passed, 5 skipped, exit 0** · red proof B-23: 2 statement
`SELECT ... WHERE kanji =` thay vì 1 · red proof B-24: *"200 commits for 200 items"* · test mới
đếm statement qua `sqlite3.set_trace_callback`, không đọc source.

## [2026-10-22] ingest | C-11/C-28/C-31/C-32 — vá lỗi nhỏ, xoá code chết

- **C-31** `11f1df9b8` — `append_errors_log()` ghi message nguyên văn, mà `/log` nhận text từ
  client → chèn newline giả được cả dòng `ERROR:bridge:` (log forging). Sanitize đặt trong helper
  **dùng chung** nên mọi caller được bảo vệ, không chỉ route: gộp whitespace thành 1 dấu cách.
- **C-28** `11f1df9b8` — `tokenize()` có `if _KANJI_RE...` với 2 nhánh **byte-identical**; xoá nhánh.
- **C-32** `11f1df9b8` — `build_dict_sqlite.py` `del m_rows` rồi log `len(m_rows) if ... else 0`
  → luôn "0 expressions"; giờ log count trước khi xoá.
- **C-11** `e739d4a5f` — comment `HardsubSettings` trỏ `extension/popup/popup.js` (đã xoá); trỏ
  `DEFAULTS` trong `extension/content/content.js`.

Proof: bridge **158 passed, 5 skipped, exit 0** · red proof C-31: 3 dòng log (1 dòng bị giả) thay
vì 1 · tokenize smoke: `日本語を勉強します` → `日本語/にほんご · 勉強/べんきょう …` (nhánh gộp không đổi hành vi).

## [2026-10-23] ingest | C-18/C-19/C-20 — negative cache, Drive failure log, ASR timeout

Ba finding extension **đã sửa** ở `47d10eef4`:

- **C-18** — mỗi video bị throttle ghi 1 key `ttMiss:<videoId>` vào `chrome.storage.session` và
  **không bao giờ xoá**. Giờ `setTtMiss` ghi key mới rồi prune các key đã quá TTL 5s (giữ key vừa ghi).
- **C-19** — 3 chỗ lỗi Drive mirror chỉ `console.warn`, không vào `errors.log` (AGENTS §6). Thêm
  `logDriveFailure()` đẩy `POST /log`; lỗi log không bao giờ chặn đường retry.
- **C-20** — ASR slice dispatch là bridge call **duy nhất không timeout**, và backstop timer 8s
  không được clear → mỗi slice xong để lại 1 timer treo. Giờ có `AbortSignal.timeout(60s)`
  (abort log riêng "timed out") và backstop được clear khi recorder stop / capture kết thúc.

Test: SW suite prune key hết hạn (giữ key mới) + mirror failure phải `POST /log` có cause; offscreen
suite thêm test 4 (AbortSignal + backstop cleared). Sandbox test phải thêm `AbortSignal` và
`get(null)` kiểu chrome (trả mọi key).

Proof: 15/15 extension suite exit 0 · anti-fake gate 0 · sanity suite 21 passed / 6 skipped / 0 failed ·
red proof từng cái: "expired keys must be dropped" / "a Drive mirror failure must POST /log" /
"the ASR call must carry an AbortSignal".
