<!-- title: P0 data-loss fixes report -->
<!-- date: 2026-08-04 -->
<!-- source: Downloads/p0-fixes-report.md · verified in chat:e16f1198 -->

# Báo cáo: P0 Data-Loss Fixes — YouTube JP Caption Studio

- **Ngày:** 2026-08-04
- **Phạm vi:** 5 fix P0 theo plan `.cursor/plans/p0_data-loss_fixes_a6397984.plan.md` (áp dụng cho cả `ipad-app` và `iphone-app`)
- **Ngoài phạm vi:** mục #6–#24 trong review (không đụng tới)

---

## 1. Vocab upsert — sửa lỗi lưu từ trùng thất bại âm thầm

**Root cause:** `@Attribute(.unique)` trên `Vocabulary.word`, nhưng `DictPopupView`/`CueEditorRow` luôn `context.insert`; khi lưu từ đã tồn tại, `save()` throw do vi phạm unique constraint nhưng bị `try? save()` nuốt → từ hiện trên UI nhưng không persist, mất sau khi thoát app. `frequencyCount` không bao giờ tăng.

**Fix:**
- `Models/VocabStore.swift`: thêm `Vocabulary.upsert(word:reading:meaning:jlptLevel:context:)`
  - Tồn tại → cập nhật `reading`/`meaning`/`jlptLevel`, `frequencyCount += 1`, refresh `savedAt`
  - Chưa có → insert mới
- `Views/DictPopupView.swift` (`DictPopupHost.save`): chuyển sang `Vocabulary.upsert`
- `Views/CueEditorRow.swift` (cả bản iPad và bản iPhone đơn giản hoá): chuyển `onSave` sang `Vocabulary.upsert`
- Smoke: `VocabSyncSmoke` thêm assert — upsert "日本" 2 lần → 1 row, `frequencyCount == 2`, save thành công

**File thay đổi (x2 cho mỗi app):** `Models/VocabStore.swift`, `Views/DictPopupView.swift`, `Views/CueEditorRow.swift`, `Services/VocabSync.swift` (smoke)

---

## 2. ScriptDTO giữ Lamport state — sửa mất `rev`/`deviceId` khi backup/restore

**Root cause:** `BackupService.ScriptDTO` không lưu `rev`/`deviceId`. Sau restore (kể cả `autoRestoreIfEmpty`), mọi script về `rev = 0` → `DriveScriptsService.needsPull` thấy Drive `rev > 0` → pull và **ghi đè dữ liệu vừa restore** (có thể mới hơn), phá vỡ cơ chế xung đột Lamport.

**Fix:**
- `ScriptDTO` thêm `rev: Int?` và `deviceId: String?` (optional → backup cũ vẫn decode được)
- `encodeSnapshot`: ghi `s.rev` / `s.deviceId`
- `apply`: gán `script.rev = sd.rev ?? 0`, `script.deviceId = sd.deviceId ?? ""` sau khi tạo `VideoScript`
- Smoke `BackupSmoke`: assert round-trip `rev: 7` / `deviceId: "ipad-smoke"`; JSON wire có `rev`/`deviceId`; legacy wire (không có 2 field) decode thành `nil`

**File thay đổi (x2):** `Services/BackupService.swift`

---

## 3. Tách file VocabSync — hết clobber file backup chung

**Root cause:** `VocabSync` dùng lại `BackupService.fileName` (`caption-studio-backup.json`) và push luôn `scripts: []`. Nếu Files bookmark trỏ đúng Drive OAuth folder, push vocab-only sẽ **xoá scripts** khỏi snapshot backup đầy đủ. Hai hệ còn dùng 2 key `lastApplied` riêng → đồng hồ LWW lệch nhau.

**Fix (chọn tách file, không gộp LWW):**
- `VocabSync.fileName` → `"caption-studio-vocab.json"`
- `BackupService.fileName` giữ nguyên `"caption-studio-backup.json"` (snapshot đầy đủ)
- Không migration — lần push OAuth kế tiếp tạo file mới; BackupService tiếp tục sở hữu snapshot full

**File thay đổi (x2):** `Services/VocabSync.swift`

---

## 4. Cue ID unique — hết crash `ForEach` duplicate identifier

**Root cause:** `addCueAtPlayhead` / `addCue(after:)` sinh ID `"\(Int(start))-\(ms % 100_000)-user"` — 2 cue thêm cùng playhead trong cửa sổ 100s → trùng ID → `ForEach(...).id(cue.id)` gặp duplicate identifier → lỗi runtime.

**Fix:**
- Cả 2 đường thêm cue: ID → `"\(Int(applied.start))-\(UUID().uuidString.prefix(8))-user"`

**File thay đổi (x2):** `Models/ScriptStore.swift`

---

## 5. project.yml ↔ Info.plist — hết lệch cấu hình khi chạy xcodegen

**Root cause:** `Info.plist` có `LSSupportsOpeningDocumentsInPlace: true` (cần cho security-scoped bookmark của Files picker) nhưng `project.yml` `info.properties` thiếu → `xcodegen generate` mất key. Toàn bộ thư mục `Scripts/` (sh/md/plist) bị bundle vào `.app`.

**Fix:**
- Cả 2 app: thêm `LSSupportsOpeningDocumentsInPlace: true` vào `info.properties`
- **iPad:** thu hẹp resource Scripts → chỉ `Scripts/user_script.js`
- **iPhone:** bỏ hẳn khối `Scripts` (không có gì cần runtime — iPhone không dùng `user_script.js`)
- Chạy `xcodegen generate` cho cả 2 project
- Ghi chú: `iphone-app/Resources/dict.sqlite` bị thiếu (project.yml tham chiếu file không tồn tại) → đã tạo **symlink** `dict.sqlite → ../../ipad-app/Resources/dict.sqlite`, đúng pattern `freq_ja.json` sẵn có

**File thay đổi (x2):** `project.yml`, `Info.plist` (tái sinh), `*.xcodeproj/project.pbxproj` (tái sinh), + symlink mới `iphone-app/Resources/dict.sqlite`

---

## Kết quả kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| `get_errors` — ipad-app + iphone-app | ✅ Không có lỗi |
| Build iPad (`generic/platform=iOS`, CODE_SIGNING_ALLOWED=NO) | ✅ **BUILD SUCCEEDED** |
| Build iPhone | ⚠️ Fail — **lỗi có sẵn từ trước**, không do các fix này |

### Lỗi build iPhone (có sẵn, ngoài phạm vi)
```
iphone-app/Views/ContentView.swift:33:39: error: cannot find type 'PlayerHistoryAction' in scope
```
- `ContentView.swift` của iPhone tham chiếu `YouTubePlayerView` / `PlayerHistoryAction` nhưng **git chưa từng track** `YouTubePlayerView.swift` cho iPhone (danh sách file Views của iPhone chỉ có 6 file).
- App iPhone đang ở trạng thái **mirror dang dở** — cần copy `YouTubePlayerView.swift` + `user_script.js` từ iPad hoặc cắt bỏ phần player khỏi `ContentView` để build được.
- Các file core đã sửa ở iPhone giống hệt bản iPad (đã build thành công) nên không có lỗi do thay đổi này.

---

## Các file đã thay đổi (tổng hợp)

**ipad-app:**
- `Models/VocabStore.swift` (upsert helper)
- `Models/ScriptStore.swift` (UUID cue ID ×2)
- `Services/BackupService.swift` (ScriptDTO + encode/apply + smoke)
- `Services/VocabSync.swift` (fileName + smoke upsert)
- `Views/DictPopupView.swift` (upsert call)
- `Views/CueEditorRow.swift` (upsert call)
- `project.yml` + tái sinh `Info.plist`, `YouTubeJPCaptionStudio.xcodeproj/project.pbxproj`

**iphone-app:** (giống hệt các thay đổi core)
- `Models/VocabStore.swift`, `Models/ScriptStore.swift`
- `Services/BackupService.swift`, `Services/VocabSync.swift`
- `Views/DictPopupView.swift`, `Views/CueEditorRow.swift`
- `project.yml` + tái sinh `Info.plist`, `YouTubeJPCaptionStudioiPhone.xcodeproj/project.pbxproj`
- Symlink mới: `Resources/dict.sqlite`

**Khác:**
- File plan `.cursor/plans/p0_data-loss_fixes_a6397984.plan.md` đã cập nhật 5 todo → `done` (và đồng bộ nội dung với bản attachment mới — bản trên đĩa còn là bản cũ ghi "iPad only")
- Dọn sạch thư mục build tạm `.build-check/` sau khi kiểm tra

---

## Việc còn lại (đề xuất, ngoài phạm vi P0)
- Sửa build iPhone: copy `YouTubePlayerView.swift` + `user_script.js` từ iPad, hoặc cắt player khỏi `ContentView` iPhone
- Các mục review #6–#24 (kích thước dict.sqlite, `SubtitleParser.activeCue` dead code, guard JA-only LWW, rebuild list khi gõ, timeout URLSession, ATS, version bump, polling JS…)
