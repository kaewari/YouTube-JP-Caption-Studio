# Project: YouTube Caption Code Review & Refactored System

## Architecture
3 Main Components:
1. **Chrome Extension (MV3)**: Content script on YouTube video pages capturing subtitle/OCR elements, background service worker managing messaging & bridge sync, popup UI.
2. **FastAPI Local-Bridge**: Local backend service (`local-bridge`) providing text processing, tokenization, dictionary enrichment, subtitle import/export, and CORS-enabled endpoints.
3. **Next.js Web UI**: Frontend dashboard for subtitle viewing, vocabulary learning, and interactive translation management.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Architecture & Exploration | Audit entire codebase (local-bridge, Chrome extension, Web UI) | none | IN_PROGRESS |
| 2 | Refactoring & Patching | Implement fixes, optimize performance/memory, align with MV3, pass test_tokenize_import_enrich.py | M1 | PLANNED |
| 3 | Verification & Forensic Audit | Code review, stress testing, and forensic anti-cheat verification | M2 | PLANNED |
| 4 | Reporting & Handoff | Synthesize final Markdown report & notify Sentinel | M3 | PLANNED |

## Interface Contracts
- **Chrome Extension ↔ Local-Bridge**: REST APIs (`http://localhost:8000/api/...`) for tokenization (`/tokenize`), dictionary enrichment (`/enrich`), subtitle import (`/import`).
- **Web UI ↔ Local-Bridge**: REST APIs & WebSocket (if configured) for subtitle management and vocabulary learning.

## Code Layout
- `local-bridge/`: Python FastAPI app, tokenizer, enrichment engine, `test_tokenize_import_enrich.py`.
- `extension/` or `src/extension/` (or similar): Chrome Extension MV3 files (`manifest.json`, `background.js`, `content.js`, `popup.js`, styles).
- `web-ui/` or `web/` or similar: Next.js application frontend.
