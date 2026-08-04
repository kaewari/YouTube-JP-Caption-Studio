# Page Topology — Saved Items

Target: `https://www.languagereactor.com/saved-items` (logged-out shell observed; list UI reconstructed from CSS + forum docs + extension vocab model).

## Layout (desktop)

1. **SideNav** (fixed left) — logo, study-lang chip, nav links, forum/login footer
2. **Main column**
   - **PageTabs** — Từ vựng | Từ đã lưu | Câu đã lưu (+ toolbar icons)
   - **Content**
     - Tab *Từ đã lưu*: filter pills + search + word list (primary)
     - Tab *Từ vựng*: All Words frequency catalog → stub “sắp có”
     - Tab *Câu đã lưu*: saved phrases → stub “sắp có”

## Interaction model

- **Click-driven** tabs, filters, status buttons, row selection
- No scroll-driven tab switching
- Status change updates local store immediately (mirrors extension `userVocab`)

## Z-index

- Sidebar / app bar: elevated
- Coming-soon overlays: in-flow dimmed panels (not modal)
- Language modal (LR): not cloned — languages fixed for this project
