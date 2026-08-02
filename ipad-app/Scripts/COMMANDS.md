# iPad commands — YouTube JP Caption Studio

Ghi nhớ nhanh: **cập nhật code** → `deploy-ipad.sh` · **chữ ký hết hạn** → `renew-ipad-signing.sh` · **dữ liệu** → Backup Drive trong app. **Không xoá app** trên iPad chỉ để update (mất sandbox).

Scripts: `ipad-app/scripts/`. First-run chi tiết: `FIRST_RUN.md`.

---

## Lần đầu cài lên iPad (Xcode signing, Trust)

Làm **một lần** trên Mac + iPad (manual):

1. Mở `ipad-app/YouTubeJPCaptionStudio.xcodeproj` trong Xcode.
2. Chọn iPad làm destination → **Automatic Signing** + **Team** (Apple ID). Giữ nguyên Bundle ID.
3. ⌘R. Trên iPad: **Settings → General → VPN & Device Management → Trust** developer cert.
4. Smoke: Overlay / Side panel. Trong app: **Thư mục** → Connect Drive (OAuth). Cần iOS `client_id` trong `Services/DriveOAuthConfig.swift` (xem mục OAuth bên dưới).

Free account: chữ ký ~7 ngày. Renew từ Mac — **không xoá app**.

---

## Deploy update nhanh từ Mac → iPad thật

Incremental build + overwrite cùng Bundle ID. Không clean DerivedData. Không xoá app trên máy.

```bash
export DEVICE_UDID='YOUR-UDID'   # bắt buộc
# optional: PROJECT SCHEME BUNDLE_ID CONFIGURATION APP_PATH LOG

./ipad-app/scripts/deploy-ipad.sh
```

Chỉ cài lại `.app` đã build (bỏ qua xcodebuild):

```bash
INSTALL_ONLY=1 DEVICE_UDID='YOUR-UDID' ./ipad-app/scripts/deploy-ipad.sh
```

Alias gợi ý:

```bash
alias ipad-deploy='DEVICE_UDID=YOUR-UDID ~/Documents/YouTube\ JP\ Caption\ Studio/ipad-app/scripts/deploy-ipad.sh'
```

Wireless: pair một lần (USB hoặc Xcode Devices), cùng Wi‑Fi, iPad mở khoá — `id=$DEVICE_UDID` vẫn dùng được.

Log: `~/Library/Logs/YouTubeJPCaptionStudio-deploy.log`

---

## Auto renew chữ ký

Free cert hết hạn → renew (không dùng cho code update thường ngày). Skip nếu còn >48h.

```bash
export DEVICE_UDID='YOUR-UDID'
export TEAM='XXXXXXXXXX'   # hoặc DEVELOPMENT_TEAM
./ipad-app/scripts/renew-ipad-signing.sh
```

### LaunchAgent (mỗi 12 giờ)

1. Sửa `DEVICE_UDID` / `TEAM` trong `com.youtubejpcaptionstudio.renew.plist`.
2. Copy → `~/Library/LaunchAgents/`.
3. Load:

```bash
cp ipad-app/scripts/com.youtubejpcaptionstudio.renew.plist ~/Library/LaunchAgents/
# edit REPLACE_WITH_* trong plist trước khi load
launchctl load ~/Library/LaunchAgents/com.youtubejpcaptionstudio.renew.plist
launchctl start com.youtubejpcaptionstudio.renew
```

Logs: `~/Library/Logs/YouTubeJPCaptionStudio-renew.log` (+ `.launchd.out/err.log`).

Paid Developer Program: bỏ qua chu kỳ ~7 ngày free.

---

## OAuth Drive API (iPad)

Chrome extension `client_id` **không** dùng được trên iOS — Google trả **Error 400: invalid_request** / “Yêu cầu … không hợp lệ”. App dùng `ASWebAuthenticationSession` + PKCE (S256) + reverse-client-id redirect (`com.googleusercontent.apps.<prefix>:/oauth2redirect`); không có `client_secret`.

Một lần trên GCP (cùng project với extension):

1. Credentials → Create OAuth client ID → kiểu **iOS** → bundle `com.example.YouTubeJPCaptionStudio`.
2. Paste full `….apps.googleusercontent.com` vào `ipad-app/Services/DriveOAuthConfig.swift` (`clientId`) — **không** paste client của Chrome extension.
3. Đổi URL scheme trong `Info.plist` / `project.yml` thành reverse-client-id: `com.googleusercontent.apps.<prefix>` (bỏ `.apps.googleusercontent.com` khỏi client_id).
4. Consent Testing → thêm email Test users (vd. `sonhoang236@gmail.com`) nếu app chưa publish.

Scope: `https://www.googleapis.com/auth/drive`. Folder cố định: `1K8LPtKici0gVaq5FuTMDmYDWzPpBokFA`.

---

## Backup / Restore Google Drive (trong app)

File vocab snapshot: `caption-studio-backup.json` (vẫn qua Files bookmark nếu đã chọn trước). Script sync: Drive REST + OAuth.

**Folder dùng chung với Desktop extension:** [Drive folder](https://drive.google.com/drive/folders/1K8LPtKici0gVaq5FuTMDmYDWzPpBokFA) (`1K8LPtKici0gVaq5FuTMDmYDWzPpBokFA`).

| Nút toolbar | Việc làm |
|-------------|----------|
| **Thư mục** | Connect Drive (OAuth) nếu chưa token; có token thì sync video đang xem |
| **Backup** | Ghi snapshot vocab ngay (nếu đã có folder bookmark) |
| **Restore** | Đọc JSON → ghi đè SwiftData |

### Script theo folder từng video (`<videoId>/cues.json` + `meta.json`)

Script không đi qua `caption-studio-backup.json`. Mỗi video là một subfolder trên Drive; iPad đồng bộ qua Drive API khi đổi video / foreground / nút **Thư mục**.

Mới/cũ so bằng `rev` (đồng hồ Lamport int trong `meta.json`), **không** dùng thời gian file — đồng hồ Mac/iPad lệch và mtime trên Drive là lúc sync. `rev` Drive lớn hơn → iPad nạp về; iPad có sửa thật → ghi lên với `rev + 1`.

Ghi ngược là **patch**: chỉ `start_media_time`/`end_media_time`/`source`/`en`/`vi` bị ghi đè, `tokens`/`mt_locked`/`translation_source` của PC giữ nguyên. Không sửa gì thì không ghi, nên `rev` không tự tăng qua lại.

Sau khi chọn folder: mỗi lần sửa tự backup (debounce ~1.5s). Khi app vào foreground → **auto-pull** nếu Drive `updatedAt` mới hơn (bỏ qua nếu đang dirty). App trống lúc mở → tự restore nếu có file. Timing wire: chỉ `start`; `duration` suy ra local. Xoá app = mất sandbox local; data vẫn ở Drive nếu đã backup.

---

## Lấy UDID

```bash
xcrun xctrace list devices
# hoặc: xcrun devicectl list devices
# hoặc: Xcode → Window → Devices and Simulators → Identifier
```

---

## Env vars

| Biến | Dùng ở | Ghi chú |
|------|--------|---------|
| `DEVICE_UDID` | deploy, renew | **Bắt buộc** khi build/install lên máy thật |
| `TEAM` / `DEVELOPMENT_TEAM` | renew (+ LaunchAgent) | Apple Team ID; deploy dùng `-allowProvisioningUpdates` |
| `INSTALL_ONLY=1` | deploy | Skip build, chỉ `devicectl install` |
| `APP_PATH` | cả hai | Đường dẫn `.app` tường minh |
| `PROJECT` / `SCHEME` / `BUNDLE_ID` | cả hai | Default: xcodeproj trong `ipad-app/`, scheme `YouTubeJPCaptionStudio`, bundle `com.example.YouTubeJPCaptionStudio` |
| `CONFIGURATION` | deploy | Default `Debug` |
| `LOG` | deploy | Override log path |
