<!-- date: 2026-08-05 -->
<!-- source: chat:e26b380c-c775-4600-bb63-b088eecd30b1 · user: Fix plan p0 data-loss (đọc rule, cache ≠ disk, /loop) -->
<!-- title: P0 data-loss fixes — verified -->

# Review — P0 data-loss fixes

Hoàn thành [`plan/p0-data-loss-fixes-2026-08-05.md`](../plan/p0-data-loss-fixes-2026-08-05.md). Cả 3 todo done, đã verify bằng build + smoke chạy thật trên simulator.

## 1. Drive sync — merge theo cue (`drive-cue-merge`)

Files: [`ipad-app/Services/DriveScriptsService.swift`](../ipad-app/Services/DriveScriptsService.swift) (+250/-77), [`iphone-app/Services/DriveScriptsService.swift`](../iphone-app/Services/DriveScriptsService.swift) — giữ `cp` + khôi phục comment nền tảng, diff byte-identical (`diff` 2 git-diff → "DIFFS IDENTICAL").

**Đã làm (đúng bảng thắng trong plan):**

- `syncThrowing` tách 4 nhánh: dirty+needsPull → merge→apply→push→clearDirty; dirty+!needsPull → push `patchedCues`→clearDirty; !dirty+needsPull → full pull **không push**; !dirty+!needsPull → noop (uống guard `patchedCues == nil` để không bump rev ping-pong).
- `mergedCues(original:dirty:local:)` — nền Drive + overlay dirty local; tombstone (`isDeleted`) drop row; local-only dirty append theo startTime; trả `nil` khi không đổi → không push, không bump rev.
- `mergeRow(base:cue:)` — patch-merge giữ tokens/mt_locked/translation_source/text_source; `push()` helper mới: `rev = max(driveBaseRev, script.rev) + 1`, ghi cả cues.json + meta.json, stamp rev/deviceId/owned, `clearDirty` **chỉ sau khi cả 2 put ok** (throw giữ dirty để retry).
- `pull()` kết thúc bằng `DriveDirty.clear(videoId:)` — trung hòa `importRows(.replace)` đánh dấu mọi id dirty (nếu không, lần sync sau merge local cũ đè Drive mới — chính lỗ P0).
- `needsPull` bỏ nhánh 0-MT (còn 3 nhánh); smoke bỏ 2 assert 0-MT cũ.
- Dirty đã wire sẵn (phiên trước, verify trên disk): `softDelete`, `clearTranslations`, `addCueAtPlayhead`/`addCue(after:)`, `importRows` replace, `CueEditorRow.scheduleSave` — qua `DriveDirty.mark/dirtyIds/clear` (UserDefaults `drive-dirty-cues-{videoId}`).

**Verify:** `xcodebuild` Debug simulator **BUILD SUCCEEDED**; chạy app trên simulator → smoke `DriveScriptsSmoke.run()` (App.init, #if DEBUG) pass toàn bộ assert → ghi `/tmp/drive_scripts_smoke_ok.txt` = `[DriveScriptsSmoke] ok en=337 vi=337`. Assert mới trong smoke: dirty B + non-dirty A cùng sống (A giữ tokens/mt_locked/translation_source), local en/vi/timing thắng trên B; tombstone drop row Drive; local-only `"new"` append index 2; `mergedCues(original:dirty:["zz"], local:[]) == nil`.

## 2. Backup restore — một lần save (`backup-single-save`)

[`ipad-app/Services/BackupService.swift`](../ipad-app/Services/BackupService.swift) + [`iphone-app/Services/BackupService.swift`](../iphone-app/Services/BackupService.swift) — verify trên disk: chỉ còn **một** `try context.save()` ở dòng 319 (sau insert); không có save giữa wipe và insert (wipe+insert là một transaction trên lần save cuối → fail giữa chừng không wipe vĩnh viễn). Diff 2 file như nhau (+3/-3).

## 3. Extension `DRIVE_RESTORED` — rev guard (`ext-drive-restored-guard`)

[`youtube-jp-caption-studio/extension/content/content.js`](../youtube-jp-caption-studio/extension/content/content.js) (+13) — handler `DRIVE_RESTORED` (dòng ~587): trước `chrome.storage.local.remove`, đọc **raw** chrome.storage meta (`metaStorageKey`) vs `loadDiskMeta(videoId)`; nếu `rawRev >= diskRev` và đang có owned cues → skip remove+apply (giữ edit Chrome). **Trap đã tránh:** `transcriptMeta.rev` là `Math.max(local, disk)` nên so `transcriptMeta.rev >= diskRev` luôn true — phải so raw storage rev. `node --check` pass.

## Gap chấp nhận (theo plan "Không làm")

- Extension chỉ rev-skip, chưa cue-merge — edit Chrome chưa bump rev vẫn bị `DRIVE_RESTORED` ghi đè.
- Hai máy sửa cùng cue id → LWW cue (dirty thắng), không merge chữ trong câu.
- `try? context.save()` sau push vẫn nuốt lỗi (ngoài scope).
- Không đụng Docker/bridge/postMessage/OAuth/ATS/Dictionary/fullscreen pinning.

## Trạng thái

Cả 3 todo plan → `done`. Chưa commit (working tree còn dirty của phiên trước: ScriptStore, BackupService, CueEditorRow).
