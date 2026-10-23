<!-- date: 2026-10-23 -->
<!-- source: chat:audit-2026-10-22 · user: "Bắt đầu làm đi" (C-1) -->

# Kế hoạch: gộp 20 file Swift trùng giữa `ipad-app` và `iphone-app` (C-1)

Trạng thái: **plan only — chưa sửa code.** Finding gốc: `review/codebase-audit-2026-10-22.md` C-1.

## 1. Vấn đề (đo trên disk 2026-10-23)

Hai app iOS chia sẻ **20 file .swift giống hệt từng byte — 4 141 LOC**:

| File | LOC |
|---|---|
| `App.swift` | 26 |
| `Models/ScriptStore.swift` | 766 |
| `Models/VocabStore.swift` | 40 |
| `Services/BackupService.swift` | 626 |
| `Services/CaptionService.swift` | 115 |
| `Services/DictionaryService.swift` | 344 |
| `Services/DriveAPIClient.swift` | 228 |
| `Services/DriveAuthService.swift` | 349 |
| `Services/DriveOAuthConfig.swift` | 29 |
| `Services/FreqService.swift` | 30 |
| `Services/NLPTagger.swift` | 123 |
| `Services/SettingsSync.swift` | 265 |
| `Services/SubtitleParser.swift` | 218 |
| `Services/SubtitleParserSmoke.swift` | 44 |
| `Services/VocabStyle.swift` | 113 |
| `Services/VocabSync.swift` | 256 |
| `Services/YouTubeURL.swift` | 33 |
| `Views/DictPopupView.swift` | 175 |
| `Views/HardsubOverlayView.swift` | 241 |
| `Views/TokenizedJAView.swift` | 120 |

5 file **khác nhau** (giữ riêng): `Services/DriveScriptsService.swift` (739),
`Views/ContentView.swift` (1218), `Views/CueEditorRow.swift` (329),
`Views/SidePanelToolbar.swift` (162), `Views/YouTubePlayerView.swift` (322).

Cơ chế hiện tại: header `// MIRRORED FILE — an identical copy lives in the sibling app
(ipad-app/ ⇄ iphone-app/). Apply every change to BOTH copies and keep them byte-identical.`
Cơ chế này **đã hỏng ít nhất 3 lần** (B-6 `clearTranslations`, B-10 `LayoutSmoke` 2 bản mâu thuẫn,
B-11 cùng loại): sửa một bên, quên bên kia.

## 2. Phương án chọn: local SwiftPM package

```
<repo-root>/
  ios-shared/
    Package.swift            # platforms: [.iOS(.v17)], product CaptionShared (library)
    Sources/CaptionShared/
      Models/…  Services/…  Views/…
  ipad-app/project.yml       # + packages: CaptionShared: {path: ../ios-shared}
  iphone-app/project.yml     #   + dependencies: [{package: CaptionShared, product: CaptionShared}]
```

- Một nguồn sự thật, không copy, không symlink.
- `xcodegen generate` vẫn là đường build duy nhất của 2 app.
- `App.swift` **ở lại mỗi app**: mỗi target cần `@main` riêng (kể cả khi nội dung giống nhau).

### Phương án bị loại

| Phương án | Vì sao không |
|---|---|
| Symlink file giữa 2 app | `xcodegen`/git/Xcode index hay vỡ, editor hiển thị trùng, CI macOS không ổn định |
| Script copy lúc build | vẫn là 2 bản trên disk, diff vẫn lệch |
| Gộp 2 app thành 1 target | phá cấu trúc app, Info.plist/asset khác nhau |

## 3. Rủi ro chính và cách giảm

1. **SwiftData store (rủi ro cao nhất).** 3 `@Model` (`VideoScript`, `ScriptCue`, `Vocabulary`) rời
   module app → tên module trong store metadata đổi. Trên máy có store cũ, SwiftData có thể coi là
   schema lạ. Giảm thiểu: test trên thiết bị với dữ liệu thật, **trước** khi merge; backup bằng
   `BackupService` (nút Backup) để restore. Fallback nếu vỡ: giữ `Models/` ở lại mỗi app, chỉ move
   Services + Views (vẫn xoá được ~2 500 LOC trùng).
2. **Access levels.** Package library cần `public` cho mọi symbol app gọi → diff lớn nhưng máy móc.
3. **Resources.** `dict.sqlite`, `freq_ja.json`, `Scripts/user_script.js` **ở lại app target**, nên
   `Bundle.main` trong `DictionaryService`/`FreqService`/`DriveOAuthConfig` vẫn đúng. Không chuyển
   resource vào package (tránh phải đổi sang `Bundle.module`).
4. **Harness macOS** `scripts/swift_store_smoke.sh` đang compile file trong `ipad-app/` → phải trỏ
   sang `ios-shared/Sources/CaptionShared/...` và giữ stub `VocabSync`.

## 4. Thứ tự thực hiện (mỗi bước build + smoke xanh, mỗi bước 1 commit)

- **A. Dựng cơ chế** — tạo `ios-shared/Package.swift`, move 8 file *thuần logic, không SwiftData,
  không View*: `YouTubeURL`, `FreqService`, `NLPTagger`, `VocabStyle`, `SubtitleParser`,
  `DriveAPIClient`, `DriveOAuthConfig`, `DriveAuthService`. Sửa 2 `project.yml`, `xcodegen generate`,
  build Debug+Release cả 2 app. → chứng minh package + `Bundle.main` + `xcodegen` hoạt động.
- **B. Services còn lại** — `BackupService`, `CaptionService`, `DictionaryService`, `SettingsSync`,
  `VocabSync`, `SubtitleParserSmoke` (+ smokes `#if DEBUG` gọi từ `App.swift` phải `public`), sửa
  harness macOS.
- **C. Models** — `ScriptStore`, `VocabStore`. **Chỉ merge sau khi test migration trên máy thật**
  (bước 3 rủi ro 1). Nếu vỡ → dừng ở B, giữ Models 2 bản (ghi lại lý do trong wiki).
- **D. Views dùng chung** — `DictPopupView`, `HardsubOverlayView`, `TokenizedJAView`.
- **E. Dọn** — xoá 19 bản copy + header `MIRRORED FILE`, grep phải = 0; cập nhật `wiki` + plan.

## 5. Acceptance criteria

- `diff -q` giữa 2 app: chỉ còn 5 file khác nhau (App.swift + 5 file đã biết = 6).
- `grep -r "MIRRORED FILE" ipad-app iphone-app` → 0.
- `xcodegen generate` chạy lại được ở cả 2 app, không sinh file lạ.
- `xcodebuild` Debug **và** Release cho cả 2 app: `** BUILD SUCCEEDED **` (exit 0).
- `scripts/swift_store_smoke.sh ipad-app` và `... iphone-app`: exit 0.
- CI job `ios-build` xanh (nó chỉ build, nhưng vẫn phải qua).
- **Test thiết bị**: mở app trên máy có store cũ → library + cues còn nguyên (bước C).

## 6. Non-goals

- Không đổi hành vi, không đổi UI, không gộp 5 file khác nhau.
- Không tạo Swift package cho extension/bridge (khác ngôn ngữ).
- Không thêm dependency ngoài.

## 7. Ước lượng

A+B: ~1 buổi (diff cơ học, rủi ro thấp). C: +nửa buổi kể cả test thiết bị. D: ~1 giờ.
Rollback: mỗi bước là 1 commit độc lập → `git revert` bước đó là xong.
