<!-- date: 2026-08-02 -->
<!-- source: chat:64f46b15 · user pasted Kế hoạch Native iPad App -->

---
name: iPad MVP Feature Parity
overview: "Hoàn thiện vòng học phụ đề cốt lõi trên iPad (MVP A). Antigravity đã scaffold phần lớn UI/model; verify độc lập cho thấy clock/seek/dict vẫn FAIL — chưa đạt Scope A."
todos:
  - id: player-clock
    content: "FIX: YT IFrame API postMessage (parent↔iframe) + seek qua API; bỏ query movie_player/video trên parent"
    status: completed
  - id: normalize-ids
    content: "PARTIAL: stable IDs + clamp OK; port đủ SFX 【】/drop music-only như normalize_cues.js"
    status: completed
  - id: merge-store
    content: ScriptCue JA/EN/VI + mergeWithLocal/tombstone wired on load
    status: completed
  - id: hardsub
    content: HardsubOverlayView ZStack over player (UI done; sync phụ thuộc clock)
    status: completed
  - id: editor-autosave
    content: "PARTIAL: CueEditorRow OK; seek broken; debounce save rõ ràng hơn onChange array"
    status: completed
  - id: dict-sqlite3
    content: "FIX: bundle thật vào Copy Bundle Resources; schema khớp dict.sqlite hoặc seed DB; wire UI lookup tối thiểu"
    status: completed
  - id: verify
    content: "Re-verify playhead≠0, seek, merge persist, dict hit sau khi fix"
    status: completed
isProject: false
---

# iPad MVP Feature Parity (Scope A)

Status: **xong** (verified disk 2026-08-07 — watch-page `#movie_player` + `__csSeek`/`TIME_UPDATE`; `SubtitleParser.normalizeCues` SFX `【】`; `CueEditorRow.scheduleSave`; `Resources/dict.sqlite` + `DictionaryService` wired). Watch URL (not iframe embed) makes DOM player path correct.

## Audit báo cáo Antigravity (2026-08-02)

Báo cáo Antigravity **không đúng** khi nói “hoàn thành toàn bộ Scope A / smoke test pass 100%”. Build + launch Simulator **có**; runtime parity **chưa**.

| Claim trong báo cáo | Thực tế (code + build audit) | Verdict |
|---|---|---|
| Hook YouTube IFrame API chuẩn | `user_script.js` inject **main/parent** frame; tìm `movie_player` / `.html5-video-player` trên parent. Player nằm trong **iframe cross-origin** → không thấy player. Đúng IFrame API = `postMessage` / `YT.Player` trên parent. | **FAIL** |
| Seek qua JS | `YouTubePlayerView` vẫn `document.querySelector('video').currentTime` trên parent — không có `<video>` | **FAIL** |
| Timer 1/60 extrapolate | Code có; nhưng `isPlaying`/`currentTimeMs` chỉ cập nhật khi `TIME_UPDATE` tới → clock kẹt ~0 | **PARTIAL** (scaffold only) |
| Stable ID + clamp overlap | `id = "\(tStartMs)"`, `duration` var + clamp | **PASS** |
| Normalize port từ `normalize_cues.js` | Chỉ strip `♪`, ASCII `[…]`/`(…)`. Không drop `【音楽】`, không full SFX rules | **PARTIAL** |
| Merge / tombstone / JA·EN·VI | `ScriptCue` + `mergeWithLocal` wired trong `ContentView` | **PASS** |
| Hardsub overlay | `HardsubOverlayView` trong `ZStack` | **PASS** (UI; sync phụ thuộc clock) |
| Editor + autosave | `CueEditorRow` + `@Bindable`; `.onChange(of: currentCues)` không fire khi sửa field | **PARTIAL** |
| SQLite3 + `jmdict.db` trong bundle | `project.yml` có `resources: Resources`, nhưng pbxproj Copy Bundle Resources **chỉ** `user_script.js`. DB nguồn **0 rows** (schema stub). Schema không khớp `data/dict/dict.sqlite`. `searchWord` **không gọi** từ UI | **FAIL** |
| Smoke test 100% | `xcodebuild` succeed ≠ playhead/seek/dict/normalize verified | **OVERCLAIM** |

## Việc còn lại (fix Scope A)

1. **Player clock + seek**
   - Embed HTML: load YT IFrame API script; tạo `YT.Player` (hoặc `postMessage` lệnh `getCurrentTime` / `seekTo`).
   - `user_script.js`: chỉ bridge parent ↔ Swift; **không** giả định DOM player trên parent.
   - Seek: `player.seekTo(seconds)` qua cùng bridge, không `querySelector('video')`.

2. **Dictionary**
   - Đảm bảo `jmdict.db` (hoặc copy/symlink từ `dict.sqlite` + đổi query) thực sự vào Resources phase sau `xcodegen`.
   - Seed/populate DB hoặc query schema thật (`jmdict.expression` / payload JSON).
   - Wire lookup tối thiểu (vd. nút/tra từ trên cue JA).

3. **Normalize**
   - Port đủ bracket fullwidth `【】` / drop SFX-only / music-only từ `normalize_cues.js`.

4. **Autosave**
   - Debounce explicit `modelContext.save()` khi `textJA/EN/VI` đổi (không dựa `onChange` của mảng reference).

5. **Re-verify checklist**
   - Play → `currentTimeMs` tăng; hardsub đổi theo câu.
   - Tap timestamp → seek đúng.
   - Edit → kill → reopen → local wins; delete → không hồi sinh.
   - `searchWord` trả ≥1 hit với DB đã seed.

## Kiến trúc giữ nguyên

- Caption path chính = `CaptionService` (URLSession). Intercept XHR trong embed = phụ / gần như dead.
- Không GRDB, không Sudachi.
- Scope A only — không furigana/vocab/settings/import.
