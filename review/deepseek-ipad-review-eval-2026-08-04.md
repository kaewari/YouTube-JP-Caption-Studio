<!-- title: DeepSeek iPad review evaluation -->
<!-- date: 2026-08-04 -->
<!-- source: chat:e16f1198-92ee-49bd-a7b9-011e08f69490 -->

# Đánh giá review DeepSeek V4 Flash — ipad-app CODE_REVIEW_PLAN

**Ngày:** 2026-08-04  
**Yêu cầu:** Đọc và đánh giá `ipad-app/CODE_REVIEW_PLAN.txt` (DeepSeek V4 Flash)  
**Chat:** [DeepSeek review eval + plan](e16f1198-92ee-49bd-a7b9-011e08f69490)

**Nguồn review gốc:** đã lưu tại `plan/ipad-app-review-and-fix-plan-2026-08-04.md` (nội dung CODE_REVIEW_PLAN.txt).  
**Plan P0 sau đánh giá:** `plan/p0-data-loss-fixes-2026-08-04.md`

---

Review khá tốt cho một model flash — bắt đúng vài bug mất dữ liệu thật, có file + nguyên nhân cụ thể. Một số chỗ phóng đại hoặc thiếu nuance.

## Verdict

**Đáng tin cho P0 (#1–#2–#5).** #3–#4 đúng hướng nhưng cần chỉnh mức độ / cách hiểu. Phần cam/vàng phần lớn đúng nhưng lẫn tradeoff có chủ đích với “nên sửa ngay”.

---

## Bug đỏ — đối chiếu code

| # | Claim | Đánh giá |
|---|--------|----------|
| **1** Vocab trùng mất âm thầm | **Đúng, P0.** `@Attribute(.unique)` + `insert` không upsert + `try? save()` trong `saveAndScheduleBackup` → fail bị nuốt. `frequencyCount` chưa bao giờ `+=`. |
| **2** Backup mất `rev`/`deviceId` | **Đúng, P0.** `ScriptDTO` chỉ có videoId/title/owned/cues; `apply` tạo `VideoScript` → `rev=0` → `needsPull` có thể ghi đè bản vừa restore. |
| **3** VocabSync ↔ BackupService clobber | **Đúng kiến trúc, nuance quan trọng.** Cùng `caption-studio-backup.json`, hai `lastApplied` khác nhau. Nhưng I/O khác nhau: Backup = Files bookmark, VocabSync = Drive OAuth API. Chỉ nổ khi bookmark trỏ đúng folder OAuth. Comment `scripts: []` cố ý — mỗi push OAuth **xoá scripts trên file backup** nếu chung chỗ. Fix ưu tiên: tách file (đơn giản hơn gộp LWW). |
| **4** Cue ID trùng | **Đúng nhưng phóng đại.** `% 100_000` ≈ cửa sổ 100s wall-clock; trong 100s mỗi ms là unique. Collision thực tế: double-tap cùng ms + cùng start, hoặc wrap 100s. Vẫn nên thêm UUID — severity thấp hơn “dễ crash”. |
| **5** `project.yml` vs Info.plist | **Đúng.** `LSSupportsOpeningDocumentsInPlace` chỉ trong `Info.plist`; `project.yml` bundle cả `Scripts/` (COMMANDS.md, deploy scripts…) — đã thấy trong `.pbxproj`. |

---

## Cam / vàng — chỗ lệch

- **#7** `activeCue`: đúng first-match vs last-match, nhưng chỉ lệch khi cue chồng. Comment ghi “matches ScriptCue.active” là sai; overlay production dùng `ScriptCue.active`, bản parser chủ yếu smoke — ưu tiên thấp hơn review nói.
- **#8** JA-only pull ghi đè MT: **đúng theo Lamport LWW**, không phải bug — là product choice. “Guard” = feature mới.
- **#9** rebuild `currentCues` mỗi `onSave`: đúng; cần đo trước khi tối ưu.
- **#11** SettingsSync listen mọi `didChangeNotification`: đúng, đã debounce 1.5s nên hại vừa phải.
- **#14** full-wipe cache: đúng, và đã có `ponytail:` comment — intentional shortcut.
- **#17** smoke assert trong `App.init` DEBUG: cố ý fail-fast; “async/report-only” làm yếu smoke.
- **#6** 143MB dict: product/size, không phải defect.
- **#16** version hardcode: đúng nhưng không khẩn.

Kiến trúc overview (Lamport, patch-merge, smoke DEBUG) khớp code.

---

## Kế hoạch sửa — chỉnh lại

**Sửa thật sự (theo thứ tự):**
1. #1 upsert vocab  
2. #2 `rev`/`deviceId` trong ScriptDTO  
3. #3 tách file vocab (đừng gộp LWW trước)  
4. #5 đồng bộ `project.yml` + chỉ bundle `user_script.js`  
5. #4 UUID cho cue id (nhỏ, làm luôn)

**Hoãn / không làm theo flash blindly:**
- #8, #17, #14, #6 — tradeoff có chủ đích hoặc YAGNI  
- #9/#11/#18 — perf khi đã đau thật  
- #7 — xoá dead path hoặc gọi chung một hàm, không “thống nhất logic” phức tạp

---

## Chất lượng review DeepSeek

**Điểm cộng:** trace data-loss end-to-end; phân biệt bug vs polish; ưu tiên hợp lý.

**Điểm trừ:** #4 wording sai; #3 thiếu tách I/O path; vài cam item là design debt có comment sẵn; không đo mức độ xảy ra thực tế.

**Tóm lại:** dùng được làm backlog P0 — đừng sửa hết 24 mục. Ba việc đáng làm ngay: **vocab upsert, backup rev, tách file VocabSync**.
