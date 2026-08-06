<!-- date: 2026-07-28 -->
<!-- source: chat:65313a39 (Translate) · user: Cho tôi Plan (auto dịch sau edit) -->

---
name: Auto dịch sau edit
overview: "Plan sau Opus 5 + chốt user: autoOpen setting; Enter-only commit/MT (blur hủy); ownership script; colloquial an toàn; không skill learn riêng lúc này."
todos:
  - id: script-ownership
    content: Script đã sửa thắng YT merge; tombstone cue xóa; không save đè sau Reload mù
    status: completed
  - id: auto-panel-overlay
    content: Fix pill; setting autoOpen=on → overlay+panel 1 lần/tab; tắt được qua popup
    status: completed
  - id: overlay-style
    content: "Popup: opacity nền/chữ, hiện JA/EN/VI; thống nhất với barScale hiện có"
    status: completed
  - id: enter-only-all
    content: "JA/EN/VI: chỉ Enter mới commit (+ MT nếu JA hoặc EN→VI); blur/Escape hủy draft"
    status: completed
  - id: cue-add-delete
    content: add/delete theo cue id (không idx); persist cue rỗng; tombstone
    status: completed
  - id: colloquial-glossary
    content: expand_to an toàn (neo/Sudachi), chỉ input MT; cache key mtime; flag + unit tests
    status: completed
  - id: direct-ja-mt
    content: Giữ NLLB thẳng; Opus pivot chỉ fallback + hiện mt_engine trên UI
    status: completed
  - id: skills-update
    content: Cập nhật youtube-hardsub-ocr; chuyển hardsub-ocr-regression → MT/glossary; KHÔNG tạo learn skill riêng lúc này
    status: completed
  - id: smoke
    content: "Smoke theo wave: toggle/overlay → ownership+add/delete → colloquial"
    status: completed
isProject: false
---

# Caption plan (sau review Opus 5)

**Verdict review:** readiness ~4/10 → **chưa execute nguyên bản cũ**. Đã bổ sung MUST-FIX dưới đây.

## Skills — câu trả lời

- **Không cần skill mới** lúc này (kể cả `script-timeline-learn` — hoãn).
- **Cần:** cập nhật [`.cursor/skills/youtube-hardsub-ocr/SKILL.md`](.cursor/skills/youtube-hardsub-ocr/SKILL.md) sau khi code.
- **Nên:** chuyển [`hardsub-ocr-regression`](.cursor/skills/hardsub-ocr-regression/SKILL.md) sang regression **MT/glossary** (OCR path gần như chết).
- Learn: nếu sau này vẫn muốn → ghi `edits.jsonl` trong `/scripts/save` (không endpoint/skill riêng).

## MUST-FIX (trước / cùng execute)

### 1. Quyền sở hữu script (blocker E)

Reload/`mergeCache` dựng lại từ YT → mất timeline/JA đã sửa, rồi `scheduleSaveTranscript` có thể **ghi đè disk**.

- Video đã chỉnh tay → ưu tiên script đã lưu (hoặc merge giữ start/end/source đã sửa).
- Cue xóa → **tombstone** theo `video_id` để không mọc lại từ YT.
- Không save đè bản giàu hơn bằng merge YT nghèo hơn.

### 2. Add/delete cue theo `id`

- Command dùng **cue id**, không `idx`.
- Cue mới rỗng: id ổn định; cho phép persist (bỏ filter drop empty source khi đang draft).
- Undo xóa = nice-to-have.

### 3. Colloquial `expand_to` an toàn

- Expand **chỉ chuỗi vào MT**, không đụng `cue.source` UI/disk.
- Không substring thô (`てん`/`ねえ` phá từ khác); neo / Sudachi / corpus false-positive test.
- Không match xuyên `\n` (segment).
- Cache key theo **mtime/hash** glossary (không chỉ số entry).
- Feature flag rollback.

### 4. Toggle + auto panel — đã chốt

- Pill: **mở side panel + ensure overlay ON**; không flip OFF khi đang ON. Tắt qua Overlay side panel / popup.
- Setting **`autoOpen`** (popup, default on): khi mở/navigate video, nếu bật → overlay ON + thử mở side panel (**1 lần / tab session**); gesture fallback nếu Chrome chặn. User tắt `autoOpen` → không tự mở.
- Không ép overlay ON khi `autoOpen=false` (giữ preference người dùng).

### 5. Enter-only — đã chốt

**Chỉ Enter mới dịch / commit** cho JA, EN, VI:

| | Enter | Blur / Escape |
| --- | --- | --- |
| **JA** | commit + MT JA→EN∥VI | hủy draft |
| **EN** | commit + MT EN→VI | hủy draft |
| **VI** | commit lưu VI (không reverse-MT) | hủy draft |

Đổi hành vi hiện tại (EN/VI blur = commit) → blur = hủy, thống nhất với JA.

## Đã có sẵn (giảm scope)

- **B** NLLB đã ja→en ∥ ja→vi. Chỉ siết fallback Opus + hiện engine.
- **C** JA Enter-only + IME cơ bản đã có; có thể chỉ tinh chỉnh textarea `lang=ja-JP` nếu cần.
- `barScale` / resize handle đã có — D thêm opacity + show lines, tránh trùng “2 scale”.

## Wave thi hành

1. **Wave 1:** fix pill + `autoOpen` setting + overlay opacity/show lines + Enter-only blur-hủy cho EN/VI  
2. **Wave 2:** script ownership + tombstone + add/delete theo id  
3. **Wave 3:** colloquial expand + tests + cập nhật skills / regression MT  
4. **Wave 4 (optional):** learn log tối giản trong `/scripts/save`

## Kiểm tra

- Pill ON → 1 click mở panel, overlay vẫn ON.  
- Sửa JA/timeline → Reload **không** mất chỉnh (ownership).  
- Xóa cue → Reload không mọc lại.  
- `てんの` / hô ngữ `ねえ、` không bị expand sai.  
- MT thẳng khi NLLB; UI hiện engine nếu Opus.
