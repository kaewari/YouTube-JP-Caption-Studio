# Local-bridge audit (2026-08-06)

**Status: done — 10/10 findings từ codebase-review-2026-08-04 vẫn ALIVE, chưa fix gì.** Audit là verify, không phải fix.

## Raw

- Source: [review/codebase-review-2026-08-04.md](../../review/codebase-review-2026-08-04.md) §5
- Audit: [review/local-bridge-audit-2026-08-06.md](../../review/local-bridge-audit-2026-08-06.md)

## Verdict tóm tắt

| ID | Severity | Verdict | Anchor |
|----|----------|---------|--------|
| LB-1 | critical | ALIVE | `local-bridge/Dockerfile:27` (0.0.0.0) + `docker-compose.yml:14-15` ("8765:8765") |
| LB-2 | high | ALIVE | `app/main.py:75-81` CORS localhost:ANY-port + credentials, no Host check |
| LB-3 | high | ALIVE | `app/main.py:358` DELETE + POST save/files/backup — 0 auth toàn bridge |
| LB-4 | medium | ALIVE | `import_en_vi.py:29` HTTP dict download (có fallback HTTPS mới, chỉ khi throw) |
| LB-5 | medium | ALIVE | `bootstrap.py:47-55` non-atomic; `:111-112` partial .gz coi là xong |
| LB-6 | medium | ALIVE | `script_store.py:374-388` 4 write không transaction; load ghi trong lúc đọc |
| LB-7 | medium | ALIVE | `main.py:188-196` /log unbounded, no auth |
| MB-8 | medium | ALIVE | `main.swift:234-240` lsof kill mọi process giữ port |
| MB-9 | medium | ALIVE | `main.swift:198-206` không auto-restart |
| MB-10 | low | ALIVE | `build.sh:72-74` nuốt lỗi codesign; `:43` junk iconset entries |

FIXED/CHANGED: 0. Safe-claims cũ (path-traversal regex, SQL parameterized, no shell=True, atomic write) — **4/4 vẫn đúng**.

## Còn mở (chưa fix)

- Docker bind `0.0.0.0` + compose publish → LAN-exposed unauthenticated (LB-1 + LB-3 cùng gốc). Fix gọn nhất: bind `127.0.0.1` trong Dockerfile/compose.
- CORS localhost any-port credentialed (LB-2) — giảm nhẹ vì server bind 127.0.0.1.
- HTTP dict download không checksum (LB-4) — fallback HTTPS mới chỉ cover exception.
- script_store torn cross-file sets + write-during-read (LB-6) — per-file atomic có rồi.
- /log spam tới đầy disk (LB-7).
- Menu bar app: killPort không check ownership (MB-8), không auto-restart (MB-9), build.sh codesign swallow (MB-10).

Xem thêm: [[flatten-repo-layout]] (đường dẫn đổi sau flatten — audit verify từ disk, line numbers hiện tại khớp).
