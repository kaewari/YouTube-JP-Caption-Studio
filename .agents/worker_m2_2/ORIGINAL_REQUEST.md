## 2026-07-29T12:35:38Z
You are Worker 2 (Edge-Case Hardening Specialist) for YouTube Caption.

Project Root: /Users/hoangson/Documents/Translate realtime OCR youtube video
Working Directory: /Users/hoangson/Documents/Translate realtime OCR youtube video/.agents/worker_m2_2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task:
Implement 2 specific edge-case fixes discovered by Challengers:

1. **Concurrent Atomic Writing in `local-bridge/script_store.py`**:
   - Update `_atomic_write_text()` in `script_store.py` so that temporary files use a unique UUID string (`import uuid`, `tmp_path = path.with_suffix(f".{uuid.uuid4().hex}.tmp")`).
   - In a `try...finally` block, ensure that if `Path.replace()` fails or throws, the unique `tmp_path` is unlinked (`tmp_path.unlink(missing_ok=True)`).

2. **Attribute Quote Escaping in Extension `escapeHtml` & `escapeAttr`**:
   - In `extension/content/content.js`, `extension/sidepanel/sidepanel.js`, and `extension/shared/vocab_style.js`:
     Update `escapeHtml(s)` to also replace `"` with `&quot;` and `'` with `&#39;`:
     ```js
     function escapeHtml(s) {
       if (s == null) return "";
       return String(s)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#39;");
     }
     ```
   - Ensure `escapeAttr(s)` in `content.js` and `sidepanel.js` also safely handles both double and single quotes.

3. **Re-Verification**:
   - Run python regression test: `cd local-bridge && python3 test_tokenize_import_enrich.py`
   - Run web UI build/typecheck: `cd web/saved-items && npm run typecheck` and `npm run build:extension`

4. **Deliverables**:
   - Document changes in `/Users/hoangson/Documents/Translate realtime OCR youtube video/.agents/worker_m2_2/changes.md`.
   - Write `/Users/hoangson/Documents/Translate realtime OCR youtube video/.agents/worker_m2_2/handoff.md`.
   - Send a message to parent with your completion summary.
