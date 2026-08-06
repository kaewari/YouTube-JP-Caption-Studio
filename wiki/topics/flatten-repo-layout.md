# Làm phẳng layout repo

Status: **xong** (2026-08-05, execute DeepSeek V4 Flash). Tất cả checklist 1a–6 hoàn tất; smoke xanh.

## Nguồn

- Plan: [plan/flatten-repo-layout-2026-08-05.md](../../plan/flatten-repo-layout-2026-08-05.md)

## Đã làm

- **Flatten:** `git mv` `extension` `local-bridge` `web` `macos-bridge-app` `scripts` `tools` `testdata` `data` + `README.md` `walkthrough.md` `INCIDENTS.md` `Makefile` `docker-compose.yml` từ `youtube-jp-caption-studio/` → root; xóa wrapper rỗng.
- **GitHub lean:** `.gitignore` root hợp nhất (IDE/`*.sqlite*`/runtime); untrack `.cursor/` (rules, debug log), `.codegraph/`, `.vscode/`, `.cursor` + `docs/` của `web/saved-items`; xóa `.github/copilot-instructions.md`; xóa nested `.gitignore` + `AGENTS.md` + `CLAUDE.md`.
- **Skills (5):** `skills/` = `ponytail`, `codegraph` (stub), `youtube-caption`, `local-bridge`, `tokenize-regression`; xóa 5 meta `ponytail-*`; symlink local `.cursor/skills`.
- **AGENTS.md:** sync-line gọn, §5 Skills, §6 error-log phẳng (`local-bridge/errors.log`), §7 feature docs, §8 Bản đồ tri thức (§G).
- **Stray dict:** `_stray-local-bridge-data/data/dict/dict.sqlite` (137M) → `local-bridge/data/dict/` (local); xóa `_stray-local-bridge-data/`.
- **Path cứng:** `macos-bridge-app/build.sh` (bỏ MONOREPO), `main.swift` fallback, DriveScriptsService iPad+iPhone, comment `script_store.py`.
- **Smoke:** bridge 35 files track; `/health` 200 `ready:true`; `/dict` `日本語`→Nhật Bản; `/tokenize` freq_ja; `/scripts` list; sqlite 4 bảng; Load-unpacked structure; `build.sh` build OK (icon từ `$REPO/ipad-app`).

## Mở (nợ đã ghi)

- `en_vi.json` / `vnedict.txt` giữ track tạm (chưa có bootstrap/xác nhận docs seed — plan §A).
- Plan/review cũ vẫn link path `youtube-jp-caption-studio/` — ngoài phạm vi, disk wins khi sửa code.
- Wiki pages: [repo-layout.md](repo-layout.md), [upstream/karpathy-llm-wiki.md](../upstream/karpathy-llm-wiki.md).
