# Wiki log

Append-only. Each entry starts with `## [YYYY-MM-DD] kind | Title` so `rg '^## \[' wiki/log.md | tail` works.

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
