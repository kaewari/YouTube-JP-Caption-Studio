# Behaviors — Saved Items

Observed on LR (logged out) + inferred from CSS / forum for logged-in list.

## Scroll

- Page scrolls in main column; sidebar stays fixed
- No sticky header shrink; AppBar is `position: fixed` with elevation overlay

## Click

- Sidebar nav: route changes (stubbed external / disabled for unimplemented)
- Page tabs: switch content panels
- Status filter pills (`lr-sp-pill`): toggle status visibility; active = filled background
- Tag color filters (`lln-word-tag-btn`): visible but disabled (“sắp có”)
- Row status buttons: set known / learning / ignored / special / clear
- PhrasePump / Chatbot / Flashcards: disabled + “sắp có”

## Hover

- Nav items: slight brighten
- Word rows: `#ffffff11` background
- Stage buttons: `#fff3` background; ON state keeps colored border glow

## Responsive

- ≤600px: stage/tag buttons shrink (per SavedItems.css)
- Sidebar collapses to icons-only (toggle)

## Auth

- LR shows login wall when unsigned
- YT Caption clone: **no auth** — demo + localStorage; extension bridge stubbed
