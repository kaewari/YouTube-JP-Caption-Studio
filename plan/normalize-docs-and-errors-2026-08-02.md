<!-- date: 2026-08-02 -->
<!-- source: chat:e011231b · user: Tổng hợp, normalize lại bug, plan -->

---
name: Normalize docs and errors
overview: Cập nhật §3.6 walkthrough cho đúng follow-scroll hiện tại (top-align, coalesce cue ngắn), và append errors.log chỉ các lỗi hội thoại chưa có — đã normalize về format `ERROR:bridge:…`.
todos:
  - id: walkthrough-36
    content: Update walkthrough §3.6 (+ §1.1 if needed) to top-align/coalesce/force instant
    status: completed
  - id: errors-append
    content: Append 3 normalized ERROR:bridge lines; skip existing dups
    status: completed
isProject: false
---

# Normalize walkthrough + errors.log từ hội thoại

## Normalize rules (áp dụng trước khi ghi)

**errors.log** ([error-log-and-docs](youtube-jp-caption-studio/.cursor/rules/error-log-and-docs.mdc)):
- Một dòng / lỗi distinct; format `ERROR:bridge:<ngắn gọn>` hoặc `WARNING:bridge:…`
- Append only — không rewrite file
- Bỏ qua dòng đã có (dup)

**walkthrough**: giọng hiện có (§ how-to-try ngắn); mọi claim đối chiếu code trước khi viết.

## 1. [walkthrough.md](youtube-jp-caption-studio/walkthrough.md) — sửa §3.6 (stale)

Hiện §3.6 nói *“scroll vào giữa list”* — **sai** so với code.

Sửa **Theo timeline** cho khớp [`ContentView.scrollActiveIntoView`](ipad-app/Views/ContentView.swift):
- Cue list = `ScrollView` + `LazyVStack` (không còn `List` — `scrollTo` no-op khi row đã visible).
- Advance: soft-scroll, **anchor `.top`** — ĐANG PHÁT sát dưới tab Phụ đề/Từ vựng.
- Load / bật lại follow (`force`): jump instant, không animate từ đầu list.
- Cue ngắn (1–2 chữ): `scrollAnimInFlight` + `pendingScrollId` coalesce — tránh chồng animation.
- Giữ: kéo list / sửa cue tắt follow; ĐANG PHÁT reserve height.

Một dòng extension (đã mirror): sidepanel `scrollIntoView({ block: "start", behavior: smooth|instant })`.

How-to-try: bật Theo timeline → play qua vài cue (kể cả dòng ngắn) → ĐANG PHÁT luôn sát dưới tab, scroll mượt.

Chỉnh nhẹ bullet §1.1 `ContentView` nếu còn hàm ý “giữa list”.

**Skipped:** README (polish follow có sẵn, không feature discovery mới).

## 2. [errors.log](youtube-jp-caption-studio/local-bridge/errors.log) — append normalized

Đã có (không thêm lại):
- `…follow flash…scrollTo(.center)…`
- `…DriveScriptsSmoke try! cues.json missing on device`

Append **mới** (đã normalize từ triệu chứng hội thoại):

```text
ERROR:bridge:iPad follow: List.scrollTo no-op when active cue already visible — stuck at list bottom
ERROR:bridge:iPad follow stutter on short 1-2 char cues — overlapping easeInOut scrollTo
ERROR:bridge:iPad follow used screen-midY anchor; user needed flush under Phu de tabs
```

## Done when

- §3.6 mô tả top-align + coalesce + force instant; khớp code.
- errors.log chỉ thêm 3 dòng mới (không dup).
