<!-- date: 2026-08-05 -->
<!-- source: chat · user: flatten + wiki/Obsidian + GitHub lean + skills + taxonomy; quét hợp lý; thêm ponytail + codegraph; handoff DeepSeek V4 Flash -->

# Làm phẳng monorepo theo layout README

Status: **xong** (2026-08-05, execute DeepSeek V4 Flash — xem `review/flatten-repo-layout-execute-2026-08-05.md`)  
Quét hợp lý: 2026-08-05 (sửa mâu thuẫn Goal ↔ §G, bảng A bị vỡ, bổ sung lỗ hổng execute).  
Skills policy: 2026-08-05 — **giữ** `ponytail` + thêm `codegraph`; xóa chỉ suite meta `ponytail-*`; 3 domain đã rename (bỏ OCR) trên nested disk.

## Tóm tắt

Làm phẳng `youtube-jp-caption-studio/` ra root đúng README; GitHub tối giản; mọi tri thức/dataset có nhà rõ. `plan/` + `review/` là raw engineering; phần còn lại map theo §G.

## Mục tiêu (cây sau flatten)

```text
# Product
extension/  local-bridge/  web/  macos-bridge-app/
ipad-app/   iphone-app/    scripts/  tools/  testdata/

# Tri thức / dataset có chủ
plan/  review/  wiki/  skills/
README.md  walkthrough.md  INCIDENTS.md   # docs sản phẩm ở ROOT (không tạo docs/)
data/   # runtime — chủ yếu gitignore

# Chỉ local
.cursor/  .claude/  .obsidian/  .agents/  .vscode/  .tmp-*/
*.sqlite*  .venv/  node_modules/
# skills/ trên GitHub = 5 skill: ponytail, codegraph, + 3 domain (đã rename)
```

## Việc cần làm

- [x] GitHub tối giản: `.gitignore`; untrack IDE / debug / web docs / nested `.cursor` (rules/log); không templates/bootstrap
- [x] Luật agent: `AGENTS.md` + `CLAUDE.md`; error-log + § Skills + § Bản đồ tri thức (§G); bỏ `.github/copilot-instructions.md`
- [x] **Skills:** chuyển vào `skills/` **5** skill (§E; domain đã rename trên nested); **giữ** `ponytail`; **thêm** `codegraph`; **xóa** 5 meta `ponytail-*`; catalog AGENTS; optional symlink local
- [x] `git mv` product; gộp `dict.sqlite` stray chỉ local; sửa path cứng; xóa wrapper; smoke
- [x] Wiki: `upstream/` Karpathy + `topics/repo-layout.md` (taxonomy §G)

## Quyết định đã khóa

### A. GitHub nhận gì (tối thiểu)

| Giữ | Lý do |
|-----|--------|
| Source: `extension`, `local-bridge`, `web`, `macos-bridge-app`, `ipad-app`, `iphone-app`, `scripts`, `tools`, `testdata` | Clone-and-run |
| `README.md`, `walkthrough.md`, `INCIDENTS.md`, `Makefile`, `docker-compose.yml`, requirements/Dockerfile bridge | Chạy / vận hành |
| `AGENTS.md` + `CLAUDE.md` mỏng | Luật mọi agent |
| `plan/` `review/` `wiki/` | Tri thức bền |
| `skills/` (5 skill — §E) | Quản lý rõ; ponytail + codegraph + domain |
| `extension/popup/` (kể cả `_next` đã build) | Load unpacked không bắt buộc build ngay — giữ |
| `data/dict/freq_ja.json` (+ seed nhỏ tương tự nếu app cần) | Bundle iPad đã track `freq_ja.json` |
| `ipad-app/Resources/freq_ja.json` | Đã track; `dict.sqlite` đã gitignore sẵn |

| Không push | Việc làm |
|------------|----------|
| `.cursor/` `.claude/` `.obsidian/` `.agents/` `.vscode/` | gitignore cả cây; `git rm --cached` (root + nested + `web/saved-items/.cursor/`) |
| `debug-aa2977.log` (~1.8MB đang track) | Untrack |
| `.github/copilot-instructions.md` | Gỡ khỏi git |
| `.codegraph/` | Không promote; gitignore (skill `codegraph` dạy dùng khi có index local) |
| `data/subtitles/*`, config máy | gitignore |
| `*.sqlite*` (kể cả Resources) | Đã / sẽ ignore; chỉ local |
| Dict bootstrap lớn (JMdict*, …) | Ignore; `/bootstrap` |
| `en_vi.json`, `vnedict.txt` (~4MB+) | **Untrack** nếu README/bootstrap đủ dựng lại; nếu chưa chắc → giữ tạm, ghi nợ |
| `web/saved-items/docs/` (research + design, ~1MB) | **Untrack + xóa** |
| `templates/` + bootstrap script | Không làm (YAGNI) |
| `.venv`, `node_modules`, `__pycache__`, log/pid bridge, `patch_*.py` | Ignore / bỏ |

### B. Luật mọi agent

- Một thân: `AGENTS.md` (ponytail, plan/review, wiki, deploy, error-log path phẳng, Skills, Bản đồ tri thức §G).
- `CLAUDE.md` → `@AGENTS.md`. Không commit `.mdc` / `.claude/`.

### C. Flatten / data

- `git mv` package ra root; stray dict đã đổi tên `_stray-local-bridge-data/` (không còn đụng `local-bridge/`); merge sqlite **local** rồi xóa stray.
- Sửa: `macos-bridge-app/build.sh`, `main.swift` fallback, DriveScriptsService iPad/iPhone (~649), comment `script_store.py`.

### D. Tri thức & Obsidian

- `wiki/upstream/karpathy-llm-wiki.md` (gist nhỏ).
- Obsidian = vault root, **local** (gitignore).
- `wiki/topics/repo-layout.md` = map folder + §G.

### E. Skills — thư mục `skills/` (khóa keep/delete)

**Một nhà:** [`skills/`](../skills/) ở root (push GitHub). Không track `.cursor/skills`.

| Skill (tên sau flatten) | Giữ trong `skills/`? | Lý do |
|-------------------------|----------------------|--------|
| `ponytail` | **Giữ** | User yêu cầu; skill file project song song AGENTS §0 (không xóa) |
| `codegraph` | **Giữ** (stub đã có) | Dạy dùng Codegraph MCP / `.codegraph` khi repo có index; không có skill sẵn ở nested/`~/.agents` |
| `youtube-caption` | **Giữ** (đã rename từ `youtube-hardsub-ocr`) | Domain extension/bridge; bỏ tên OCR |
| `local-bridge` | **Giữ** (đã rename từ `local-bridge-dev`) | start.sh / health / tokenize / IME |
| `tokenize-regression` | **Giữ** (đã rename từ `hardsub-ocr-regression`) | Regression tokenize/import; bỏ tên OCR |
| `ponytail-review` | **Xóa** | Meta-tool; có ở `~/.agents/skills` nếu cần |
| `ponytail-audit` | **Xóa** | Như trên |
| `ponytail-debt` | **Xóa** | Như trên |
| `ponytail-gain` | **Xóa** | Như trên |
| `ponytail-help` | **Xóa** | Như trên |

**Keep list cuối:** `ponytail`, `codegraph`, `youtube-caption`, `local-bridge`, `tokenize-regression`.

Execute: chuyển 3 domain (đã rename trên disk nested) + `ponytail` → `skills/`; stub `skills/codegraph/` (đã có); `git rm` / xóa 5 meta `ponytail-*`; catalog AGENTS = 5 dòng.  
Skill mới chỉ thêm vào `skills/` nếu domain repo + tái sử dụng. Optional local: `ln -sf ../skills .cursor/skills`.

### F. Agent dùng / tạo skill

1. `description:` sắc trong mỗi SKILL.md còn lại.
2. Catalog AGENTS = đúng 5 path trên; trước việc domain → Read skill đó. Coding → Read `skills/ponytail` (+ AGENTS §0). Code nav khi có `.codegraph/` → Read `skills/codegraph` rồi MCP `codegraph_explore`.
3. Symlink local tuỳ chọn.
4. Tạo skill mới → `skills/<kebab>/` chỉ khi cần cho repo; cập nhật catalog.
5. Không copy suite meta `ponytail-*` vào repo “cho đủ” — chỉ giữ `ponytail` core.
6. YAGNI: sửa skill có sẵn trước khi thêm.

### G. Bản đồ tri thức & dataset

| Loại | Chỗ đúng | GitHub? |
|------|----------|---------|
| Plan / review | `plan/`, `review/` | Có |
| Tổng hợp sống | `wiki/` | Có |
| Gist tham chiếu | `wiki/upstream/` | Có |
| Skill (5: ponytail, codegraph, 3 domain) | `skills/` | Có |
| Docs sản phẩm | Root `README` / `walkthrough` / `INCIDENTS` — **không** `docs/` song song | Có |
| Deploy app | `ipad-app/Scripts/`, `iphone-app/Scripts/` | Có |
| Fixture test | `testdata/` | Có (nhỏ) |
| Dict / model | `data/dict/`, `local-bridge/data/` | Không (trừ seed nhỏ) |
| Subtitle runtime | `data/subtitles/` | Không |
| Config máy | `data/config/` | Không |
| Evidence tạm | `.tmp-*/` hoặc xóa | Không |
| Research cạnh `web/` | Không giữ — xóa | Không |
| IDE scratch | `.cursor/plans/`, `.agents/` | Không → bền thì `plan/`/`review/` |
| Codegraph index | `.codegraph/` | Không (local; skill hướng dẫn dùng) |

Luật agent: khớp bảng trước khi tạo docs/dataset; không invent top-level folder; runtime data ≠ wiki; lint wiki bắt file mồ côi.

## Các bước execute

1. Gitignore + untrack bloat + AGENTS + chuyển skills → `skills/` (**5 keep**: domain đã rename; giữ `ponytail`; stub `codegraph` đã có; **xóa 5 `ponytail-*`**) + xóa `web/saved-items/docs/` + untrack IDE.
2. `git mv` product + docs root; xử lý `local-bridge` stray.
3. Sửa path cứng (C).
4. Xóa wrapper rỗng; gộp staged `.agents/` deletes.
5. Smoke: track bridge code; `/health`; sqlite local; Load unpacked `extension/`; `build.sh` macos.
6. Wiki upstream + `repo-layout` + index/log; cập nhật topic flatten → done.

## DeepSeek V4 Flash — execute brief (làm đúng thứ tự)

**Repo root:** `YouTube JP Caption Studio/` (có sẵn `ipad-app/`, `iphone-app/`, `plan/`, `review/`, `wiki/`, `skills/codegraph/`, `AGENTS.md`).  
**Package lồng:** `youtube-jp-caption-studio/` (chứa `extension/`, `local-bridge/` đầy đủ, `web/`, `macos-bridge-app/`, …).  
**Stray dict (đã đổi tên):** `_stray-local-bridge-data/` (chỉ `data/dict/*.sqlite*` local) — **không** phải product. `git mv` nested `local-bridge/` → root **thoải mái** (không còn đụng tên). Sau flatten: merge sqlite vào `local-bridge/data/` nếu cần, rồi xóa `_stray-local-bridge-data/`.

### Luật cứng (đọc trước khi đụng file)

1. **Disk wins** — `Read` lại path trước khi sửa; đừng tin chat/index.
2. **Ponytail** — ít diff nhất; không tạo `docs/`; không copy meta `ponytail-*` vào project.
3. **Không commit / không push** trừ khi user bảo.
4. **Không xóa app trên device**; không `git push --force`; không rewrite lịch sử `plan/`/`review/` cũ.
5. Skill keep đúng **5:** `ponytail`, `codegraph`, `youtube-caption`, `local-bridge`, `tokenize-regression`. Xóa chỉ 5 meta trong nested `.cursor/skills/`: `ponytail-review|audit|debt|gain|help`.
6. **Không đụng / không `git mv` `_stray-local-bridge-data/` như product** — chỉ merge sqlite rồi xóa folder đó.

### Disk hiện tại (2026-08-05) — đừng đoán

| Path | Thực tế |
|------|---------|
| `skills/codegraph/SKILL.md` | Đã có stub |
| `youtube-jp-caption-studio/.cursor/skills/{ponytail,youtube-caption,local-bridge,tokenize-regression}` | Giữ → `git mv` / copy vào `skills/<name>/` |
| Nested `ponytail-{review,audit,debt,gain,help}` | Xóa / `git rm` |
| `_stray-local-bridge-data/` | Stray dict local (gitignore) — **không** phải bridge code |
| `youtube-jp-caption-studio/local-bridge/` | Product thật → `git mv` ra root (tên trống) |
| `ipad-app/`, `iphone-app/` | Đã ở root — không mv lại |

### Checklist execute (tick khi xong)

- [x] **1a** Cập nhật `.gitignore` root (+ nested nếu còn): `.cursor/` `.claude/` `.obsidian/` `.agents/` `.vscode/` `.codegraph/` `*.sqlite*` debug log; giữ `/_stray-local-bridge-data/`; **không** ignore cả `/local-bridge/` sau khi product đã lên root (chỉ ignore runtime: `.venv`, `*.sqlite*`, log/pid…).
- [x] **1b** `git rm --cached` IDE / `debug-aa2977.log` / `.github/copilot-instructions.md` / `web/saved-items/.cursor/` nếu đang track; **xóa** `web/saved-items/docs/`.
- [x] **1c** `en_vi.json` / `vnedict.txt`: chỉ untrack nếu xác nhận bootstrap/docs đủ; **không chắc → giữ**.
- [x] **1d Skills:** `git mv` (hoặc copy+rm) 4 skill từ nested → `skills/` (`ponytail`, `youtube-caption`, `local-bridge`, `tokenize-regression`); giữ stub `codegraph`; **xóa** 5 meta `ponytail-*`; optional `ln -sf ../skills .cursor/skills` (local, gitignore).
- [x] **1e** `AGENTS.md` (+ `CLAUDE.md` → `@AGENTS.md`): error-log path phẳng; § Skills = 5 path; § Bản đồ tri thức = §G; bỏ phụ thuộc `.github/copilot-instructions.md`.
- [x] **2a** Optional: copy/merge `_stray-local-bridge-data/data/dict/dict.sqlite*` vào nested (rồi sau mv) `local-bridge/data/dict/` **local only** → xóa `_stray-local-bridge-data/`.
- [x] **2b** `git mv` từ `youtube-jp-caption-studio/`: `extension` `local-bridge` `web` `macos-bridge-app` `scripts` `tools` `testdata` + docs root cần (`README.md` `walkthrough.md` `INCIDENTS.md` `Makefile` `docker-compose.yml` …) lên root. Không đụng `ipad-app`/`iphone-app`. Không đụng `_stray-*`.
- [x] **3** Sửa path cứng: `macos-bridge-app/build.sh`, `macos-bridge-app/Sources/main.swift` (~fallback `.../youtube-jp-caption-studio/local-bridge` → `.../local-bridge`), DriveScriptsService iPad+iPhone, comment `script_store.py` nếu còn path cũ. Grep `youtube-jp-caption-studio` trong **code** (không bắt buộc sửa plan/review cũ).
- [x] **4** Xóa wrapper `youtube-jp-caption-studio/` khi rỗng; gộp staged `.agents/` deletes nếu còn.
- [x] **5 Smoke:** bridge track được; `curl` `/health`; sqlite local; Load unpacked `extension/`; `macos-bridge-app/build.sh`.
- [x] **6 Wiki:** `wiki/upstream/karpathy-llm-wiki.md` (gist ngắn); `wiki/topics/repo-layout.md`; cập nhật `wiki/index.md` + `wiki/log.md`; topic flatten → **xong**.

### Prompt dán cho DeepSeek (copy)

```text
Execute plan/flatten-repo-layout-2026-08-05.md end-to-end.
Follow section "DeepSeek V4 Flash — execute brief" in order.
Rules: disk wins; ponytail (minimal diff); no commit/push unless I ask;
keep exactly 5 skills (ponytail, codegraph, youtube-caption, local-bridge, tokenize-regression);
delete only meta ponytail-*; do not create docs/;
_stray-local-bridge-data/ is LOCAL DICT DUMP only — never treat it as the product bridge;
git mv youtube-jp-caption-studio/local-bridge → root (name is free).
Re-read files from disk before editing. When done: list what changed + smoke results.
```
## Ngoài phạm vi

- Rewrite link cũ plan/review hàng loạt.
- Tạo `docs/` song song.
- Obsidian Sync / plugin / fork Karpathy.
- Nén AppIcon; xóa lịch sử plan/review.
- Copy suite meta `ponytail-review|audit|debt|gain|help` vào project.

## Rủi ro còn chấp nhận được

| Rủi ro | Cách xử |
|--------|---------|
| Cursor không auto-load `skills/` nếu không symlink | AGENTS bắt Read path; symlink optional trong wiki |
| Untrack `en_vi.json`/`vnedict` làm clone thiếu dict | Chỉ untrack khi xác nhận `/bootstrap` hoặc docs seed; không chắc thì giữ |
| `_next` popup lớn nhưng tiện Load unpacked | Giữ (clone-and-run) |
| Plan/review cũ còn path `youtube-jp-caption-studio/` | Ngoài phạm vi; disk wins khi sửa code |
| Không có `.codegraph/` trên máy | Skill nói fallback Read/Grep; không `codegraph init` trừ khi user hỏi |

## Verdict quét hợp lý

**Đủ để execute** sau các sửa trong bản này:

- Đã bỏ mâu thuẫn Goal `docs/product/` ↔ §G “không tạo docs/”.
- Đã sửa hàng bảng A bị vỡ (`research | design`).
- Đã bổ sung: nested skills đang track, `web/saved-items/.cursor`, debug log, iPad `dict.sqlite` đã ignore, giữ popup `_next`.
- Đã khóa skills: **giữ** `ponytail` + `codegraph` + 3 domain (`youtube-caption`, `local-bridge`, `tokenize-regression`); **xóa** chỉ 5 meta `ponytail-*`.
