# SavedItemsApp Specification

## Overview
- **Target file:** `src/components/SavedItemsApp.tsx`
- **Screenshot:** `docs/design-references/lr-saved-items-desktop-full.png`
- **Interaction model:** click-driven (tabs, filters, status buttons)

## DOM Structure
- Fixed `SideNav` + main column (`marginLeft` tracks collapse width)
- `PageTabs` sticky header
- Content: toolbar + list OR `ComingSoonPanel`

## Computed Styles (from LR)
- App bg `#1a1c1f`; sidebar `#141618`
- Active nav: purple inset + `#9c40bf` glow mix
- Filter pills: height 30px, radius 15px; stage colors `#9cffcd` / `#ffbd80` / `#b894c5`
- Special (project): `#e74c5c`

## States & Behaviors
- Filter / search recompute visible list client-side
- Status change → `setWordStatus` → `localStorage` + stub `CustomEvent`
- Tabs vocabulary / saved-phrases → coming-soon panels

## Text Content
Vietnamese labels matching extension dict popup.

## Responsive
- Desktop: sidebar 240px; mobile: collapse to 64px; row stacks status buttons
