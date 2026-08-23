<!-- date: 2026-08-23 -->
<!-- source: review/perf-ux-audit-2026-08-23.md · user: multi-agent perf sweep + UX benchmark -->

# Topic: Audit hiệu năng & UX (2026-08-23)

## 1. Trạng thái
- **Trạng thái**: Đã audit xong (`open` cho việc thực hiện các bản vá)
- **Tài liệu gốc**: [review/perf-ux-audit-2026-08-23.md](../../review/perf-ux-audit-2026-08-23.md)
- **Quy mô audit**: 28 agents (Workflow multi-agent), 59 perf findings confirmed (3 P0, 24 P1, 28 P2, 4 P3), 24 UX benchmark gaps, 8 critic gaps.

## 2. Các lỗ hổng P0 nghiêm trọng cần vá ngay
- **P3-1** (`extension/injected/page_capture.js:971`): Regex `NETFLIX_URL_RE` quá rộng khớp cả media/image CDN của Netflix gây clone & parse nhị phân TTML.
- **P4-1** (`web/saved-items/src/components/SettingsPanel.tsx:234`): `patchOverlay`/`patchLevel` gọi `persistSettingsAsync` unthrottled trên thanh slider Settings.
- **P7-1** (`ipad-app/Services/SettingsSync.swift:62`): NotificationCenter observer lắng nghe `UserDefaults.didChangeNotification` tự kích hoạt `schedulePush` lặp vô tận tới Drive.
- **P7-2** (`ipad-app/Services/VocabStyle.swift:55`): `VocabStyle.color(for:)` chạy `JSONDecoder` giải mã `levelColorsJSON` cho **từng token từ vựng** trên UI frame render.

## 3. Phân giải mâu thuẫn backlog cũ
- **LB-6** (`local-bridge/app/services/script_store.py:459, 528`): Xác nhận **LB-6 VẪN CÒN TỒN TẠI** trên disk (`load_script` ghi đè `cues.json`/`meta.json` mà không có mutex `_video_lock` với `save_script`). Đã gắn lại tracking P5-4 / P6-1.

## 4. Benchmark UX/UI vs Language Reactor / Trancy / Migaku
Top 5 tính năng giá trị cao nhất cho người học JP bị thiếu:
1. **Auto-pause cuối câu (U1-1)**: Dừng video khi hết cue để luyện shadowing / tra từ.
2. **Replay / Loop cue (U1-2, U1-4)**: Phím tắt A/S/D/W hoặc R để tua lại cue hiện tại.
3. **Controls trên overlay bar (U1-5)**: Nút ◀, ↺, ▶ trực tiếp trên floating caption bar.
4. **Lưu câu kèm ngữ cảnh (U1-8, U2-2)**: Lưu cả câu JA + VI + timestamp thay vì chỉ lưu từ đơn lẻ.
5. **Xuất Anki TSV / CSV (U1-6, U1-9, U2-1)**: Xuất flashcard có âm thanh, furigana và mốc thời gian.
