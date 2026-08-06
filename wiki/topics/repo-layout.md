# Repo layout (flattened 2026-08-05)

Status: **đã execute** (flatten done 2026-08-05). Root tree matches `README.md` layout; `youtube-jp-caption-studio/` wrapper deleted.

## Folder map

```text
# Product
extension/  local-bridge/  web/  macos-bridge-app/
ipad-app/   iphone-app/    scripts/  tools/  testdata/

# Knowledge / dataset owners
plan/  review/  wiki/  skills/
README.md  walkthrough.md   # product docs at ROOT (no docs/)
data/   # runtime — mostly gitignored

# Local only (gitignored)
.cursor/  .claude/  .obsidian/  .agents/  .vscode/  .codegraph/  .nodegraph/
*.sqlite*  .venv/  node_modules/
```

## Skill catalog (exactly 5, §5 of AGENTS.md)

`skills/ponytail`, `skills/codegraph`, `skills/youtube-caption`, `skills/local-bridge`, `skills/tokenize-regression`. `.cursor/skills` is a local symlink (gitignored).

## Knowledge map (§G — schema in AGENTS.md §8)

| Loại | Chỗ đúng | GitHub? |
|------|----------|---------|
| Plan / review | `plan/`, `review/` | Có |
| Tổng hợp sống | `wiki/` | Có |
| Gist tham chiếu | `wiki/upstream/` | Có |
| Skill (5) | `skills/` | Có |
| Docs sản phẩm | Root `README` / `walkthrough` | Có |
| Deploy app | `ipad-app/Scripts/`, `iphone-app/Scripts/` | Có |
| Fixture test | `testdata/` | Có (nhỏ) |
| Dict / model | `data/dict/`, `local-bridge/data/` | Không (trừ seed nhỏ) |
| Subtitle runtime | `data/subtitles/` | Không |
| Config máy | `data/config/` | Không |
| Evidence tạm | `.tmp-*/` hoặc xóa | Không |
| IDE scratch | `.cursor/plans/`, `.agents/` | Không |

## Tool surface

- Bridge: `local-bridge/start.sh` → `127.0.0.1:8765` (`/health`, `/tokenize`, `/dict`, `/scripts/*`, `/ime/*`). Error log: `local-bridge/errors.log` (`ERROR:bridge:<msg>`).
- macOS menu-bar app: `macos-bridge-app/build.sh` (icon từ `ipad-app/Assets.xcassets`; `$BRIDGE` root ghi vào `bridge_root.txt`).
- Dict sqlite: `local-bridge/data/dict/dict.sqlite` (local, gitignored — từ `_stray-local-bridge-data/` merge 2026-08-05, đã xóa stray).

## Notes

- `web/` = clone-and-run `saved-items` (tracked except `.cursor`, `docs/`, build dirs).
- `data/dict/en_vi.json` + `vnedict.txt` kept tracked (bootstrap chưa chắc — nợ ghi trong plan §A).
