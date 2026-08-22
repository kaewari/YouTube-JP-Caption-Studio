<!-- date: 2026-08-05 -->
<!-- source: chat:c2c429a8 · user: Execute plan/flatten-repo-layout-2026-08-05.md end-to-end (DeepSeek V4 Flash execute brief) -->

# Flatten repo layout — execution report

Status: **done** (2026-08-05). Checklist 1a–6 hoàn tất theo `plan/flatten-repo-layout-2026-08-05.md` execute brief, đúng thứ tự; smoke xanh. Không commit/push (theo yêu cầu).

## Đã thay đổi (theo checklist)

### 1a — .gitignore
Rewrite `.gitignore` root (hợp nhất nested): IDE/scratch (`.cursor/ .claude/ .agents/ .codegraph/ .nodegraph/`), `_stray-local-bridge-data/`, Xcode ignores, `macos-bridge-app/dist/`, `local-bridge/errors.log` + `.bridge*`/`.saved-items*` pid/log, `.env`, `.venv/ __pycache__/ *.pyc`, `*.sqlite*` + dict cache paths, `data/subtitles/*/`, IME binaries, `Không có tiêu đề/`, `scripts/*` (trừ `ime-switch/`), `web/saved-items/out/ .next/`, patch/tmp files. Xóa nested `.gitignore`.

### 1b — Untrack bloat + delete docs
- `git rm --cached`: nested `.cursor/debug-aa2977.log`, `.cursor/rules/*.mdc` (error-log-and-docs, ponytail, ipad-deploy-commands), `.codegraph/.gitignore`, `.vscode/settings.json`, `web/saved-items/.cursor/*`.
- `git rm -r`: `web/saved-items/docs/` (13 files), nested `AGENTS.md`, `CLAUDE.md`.
- Xóa untracked `.github/copilot-instructions.md`. Không tạo `docs/`.

### 1c — Dict keep-decision
Giữ `data/dict/en_vi.json` + `vnedict.txt` tracked (bootstrap chưa confirm — nợ §A). `*.sqlite*` untracked hoàn toàn.

### 1d — Skills (5 keep, 5 meta xóa)
- `git mv` từ nested `.cursor/skills/` → root `skills/`: `ponytail`, `youtube-caption`, `local-bridge`, `tokenize-regression`; `codegraph` stub giữ.
- `git rm -r` 5 meta: `ponytail-{audit,debt,gain,help,review}`.
- Symlink local `.cursor/skills → ../skills` (gitignored). **Skill cuối cùng: đúng 5.**

### 1e — AGENTS.md
- Line 4 sync: bỏ `.cursor/rules/*.mdc` (untracked local, file này thắng khi conflict).
- Thêm §5 Skills (5), §6 Error log (`local-bridge/errors.log`, `ERROR:bridge:<msg>` một dòng, append-only), §7 Feature docs (walkthrough.md + README.md), §8 Bản đồ tri thức (§G table).

### 2a — Stray dict merge
`_stray-local-bridge-data/data/dict/dict.sqlite` (137M) → `local-bridge/data/dict/` (local-only, gitignored); xóa `_stray-local-bridge-data/`. Verify 4 bảng: `jmdict`, `javi`, `jmdict_vi`, `en_vi`.

### 2b — git mv packages
`git mv` `extension` `local-bridge` `web` `macos-bridge-app` `scripts` `tools` `testdata` `data` + `README.md` `walkthrough.md` `INCIDENTS.md` `Makefile` `docker-compose.yml` từ `youtube-jp-caption-studio/` → root. Không đụng `ipad-app`/`iphone-app` (đã ở root). Xóa wrapper rỗng.

### 3 — Hardcoded paths (5 chỗ)
- `macos-bridge-app/build.sh`: `ROOT="$(cd "$(dirname "$0")" && pwd)"`, `REPO="$ROOT/.."`, `BRIDGE="$REPO/local-bridge"`, icon fallback `$REPO/ipad-app/Assets.xcassets/...` (bỏ MONOREPO).
- `macos-bridge-app/Sources/main.swift:268`: fallback `Documents/YouTube JP Caption Studio/local-bridge` (bỏ `youtube-jp-caption-studio/`).
- `ipad-app` + `iphone-app/Services/DriveScriptsService.swift:649`: `.appendingPathComponent("data/subtitles/MOIbaNe4Pmw")` (3×deletingLastPathComponent = repo root).
- `local-bridge/app/services/script_store.py:24`: comment cập nhật (ROOT 4×parent đã đúng, giữ nguyên).
- Phần còn lại (4×parent Python, 3×parent Swift từ #filePath, 2×parent bash) position-independent — không sửa.

### 4 — Wrapper delete
Xóa `youtube-jp-caption-studio/` wrapper rỗng; merge deletes `.agents/` đã stage. Root cuối khớp đúng tree trong plan (19 mục top-level).

### 5 — Smoke (tất cả xanh)
- Bridge track: 35 files + `start.sh`.
- Start từ vị trí mới: `/health` → 200 `{"ready":true,...}`.
- `/dict` `{"surface":"日本語"}` → Nhật Bản (sqlite từ stray merge).
- `/tokenize` → freq_ja rank 68 (`freq_ja.json` tại root `data/dict/`).
- `/scripts` list đọc từ root `data/subtitles/` (script_store ROOT đúng).
- `build.sh` exit 0; dòng Bridge root ghi đúng; icon từ `$REPO/ipad-app`.
- Extension: `manifest.json` + popup structure nguyên vẹn.
- Bridge đã stop sau smoke (trả về trạng thái trước: không chạy).

### 6 — Wiki
`wiki/upstream/karpathy-llm-wiki.md` (mới), `wiki/topics/repo-layout.md` (mới), `wiki/topics/flatten-repo-layout.md` → **xong**, `wiki/index.md` (Navigation + Active table), `wiki/log.md` (append ingest entry).

## Token usage (plan này)

| Session | Giai đoạn | input | output | cache_read | cache_creation | Tổng in+out |
|---------|-----------|-------|--------|------------|----------------|-------------|
| c2c429a8 | Execute chính (full checklist) | 12,703,463 | 169,275 | 12,423,296 | 280,167 | **12,872,738** |
| e28e5cd3 | Khởi động sai (2 phút, chỉ survey, 0 edit) | 1,739,323 | 19,537 | 1,606,528 | 132,795 | 1,758,860 |

Tổng cộng: **14,631,598 tokens** (in+out) cho plan flatten-repo-layout-2026-08-05.

## Nợ mở (ghi theo plan)
- `en_vi.json` / `vnedict.txt` giữ track tạm — cần bootstrap/xác nhận docs seed (§A).
- Link path cũ `youtube-jp-caption-studio/` trong plan/review cũ — ngoài phạm vi (disk wins khi sửa code).
