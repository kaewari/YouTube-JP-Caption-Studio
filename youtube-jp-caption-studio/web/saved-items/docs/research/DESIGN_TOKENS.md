# Design Tokens — Language Reactor Saved Items → YT Caption

Extracted from live `https://www.languagereactor.com/saved-items` (headless Chrome DOM + `/assets/index-*.css`) and adapted for **YT Caption**.

## Colors

| Token | LR value | YT Caption use |
| --- | --- | --- |
| App background | `#1a1c1f` | `--background` |
| Surface / sidebar | `#141618` / `#23252a` | `--surface`, `--sidebar` |
| Accent / CTA | `#9c40bf` / `#8e56d4` | `--primary` (kept as LR purple accent) |
| Link | `#f3acff` | `--link` |
| Known | `#9cffcd` | status `known` / Đã biết |
| Learning | `#fda200` / `#ffbd80` | status `learning` / Học |
| Skipped / ignored | `#b894c5` | status `ignored` / Đừng học |
| Special (extension) | `#e74c5c` | status `special` / Đặc biệt |
| Text | `#ffffff` / `#ffffffcc` | foreground / muted |

## Typography

- Body / UI: **Noto Sans** 300–700 (Google Fonts, same as LR)
- Brand wordmark: **Varela Round** (LR logo font)
- Japanese lemmas: inherit Noto Sans + system JP fallbacks

## Spacing / chrome

- Saved Items wrap padding: `42px 12px 120px` (LR)
- Sidebar width ~240px expanded; collapse control present
- Stage filter pills: height 30px, border-radius 15px (`lr-sp-pill`)
- Stage buttons: ~56×35, radius 9px

## Branding adaptation

- Logo text: **YT Caption** (not Language Reactor)
- Study language locked to **日本語**; native gloss **Tiếng Việt**
- Product copy in Vietnamese matching the Chrome extension dict popup
