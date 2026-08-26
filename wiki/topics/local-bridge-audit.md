# Local-bridge audit (2026-08-06)

**Status: partial — 5/10 findings đã fix (2026-08-07), LB-6 còn tồn tại chuyển tiếp sang perf audit 2026-08-23, còn lại 4 findings mở.**

## Raw

- Source: [review/codebase-review-2026-08-04.md](../../review/codebase-review-2026-08-04.md) §5
- Audit: [review/local-bridge-audit-2026-08-06.md](../../review/local-bridge-audit-2026-08-06.md)
- Codebase review 2026-08-07: [topics/codebase-review-2026-08-07.md](codebase-review-2026-08-07.md)
- Perf/UX audit 2026-08-23: [topics/perf-ux-audit-2026-08-23.md](perf-ux-audit-2026-08-23.md)

## Verdict tóm tắt

| ID | Severity | Verdict (Updated 2026-08-23) | Anchor / Ghi chú |
|----|----------|------------------------------|------------------|
| LB-1 | critical | FIXED (2026-08-07) | C1 fix: Compose publish `127.0.0.1:8765:8765` |
| LB-2 | high | FIXED (2026-08-07) | M1 fix: `allow_credentials=False` |
| LB-3 | high | ALIVE (Open) | `app/main.py` DELETE + POST save/files/backup — 0 auth toàn bridge |
| LB-4 | medium | ALIVE (Open) | `import_en_vi.py:29` HTTP dict download |
| LB-5 | medium | FIXED (2026-08-07) | M3 fix: `bootstrap.py` atomic tempfile + replace |
| LB-6 | medium | ALIVE (Tracking P5-4 / P6-1) | `script_store.py` torn cross-file sets + load ghi đè không mutex |
| LB-7 | medium | ALIVE (Open) | `main.py` /log unbounded, no auth |
| MB-8 | medium | FIXED (2026-08-07) | M8 fix: `main.swift` chỉ kill process do app sở hữu (`bridgeProcessOwned`) |
| MB-9 | medium | ALIVE (Open) | `main.swift` không auto-restart |
| MB-10 | low | FIXED (2026-08-07) | M8/M10 fix: dọn junk iconset + `build.sh` |

## Còn mở (chưa fix)

- LB-3: Bridge unauthenticated endpoints (DELETE/POST).
- LB-4: HTTP dict download không checksum.
- LB-6: script_store torn cross-file sets (được track tại [[perf-ux-audit-2026-08-23]]).
- LB-7: /log spam tới đầy disk.
- MB-9: Menu bar app không auto-restart.

Xem thêm: [[flatten-repo-layout]] (đường dẫn đổi sau flatten — audit verify từ disk, line numbers hiện tại khớp).
