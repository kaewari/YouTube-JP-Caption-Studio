# Handoff Report: Explorer 1 (`local-bridge` Code Review)

**Working Directory**: `/Users/hoangson/Documents/Translate realtime OCR youtube video/.agents/explorer_m1_1`  
**Report Date**: 2026-07-29  
**Recipient**: Parent Agent (`8fbaf7bd-cb39-4bcc-bc3e-f4398dae080e`)  

---

## 1. Observation

Direct observations from source files within `/Users/hoangson/Documents/Translate realtime OCR youtube video/local-bridge/`:

1. **`main.py:53-58`**:
   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=["*"],
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```
   Wildcard CORS allows any web origin to interact with the local FastAPI endpoints.

2. **`bootstrap.py:84`**:
   ```python
   _download("http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz", gz)
   ```
   Uses plain `http://` for fetching external dictionary archives via `urllib.request.urlretrieve`.

3. **`tokenize_ja.py:104-106`**:
   ```python
   idx = text.find(surface, cursor)
   if idx < 0:
       idx = cursor
   ```
   Searches for character index linearly using string `.find()` rather than using Sudachi morpheme native offsets `m.begin()` and `m.end()`.

4. **`dictionary.py:319-322`**:
   ```python
   m = re.match(r"^([\u3400-\u9fff]+)([\u3040-\u309f]+)$", t)
   ```
   Compiles regex inline inside `_stem_variants()`, which is called repeatedly for every dictionary candidate expansion.

5. **`dictionary.py:264-272`**, **`tokenize_ja.py:45-53`**, **`vocab_freq.py:139-147`**:
   Duplicate implementation of `_kata_to_hira()` in three separate Python files.

6. **`models.py:125`**:
   ```python
   tokens: list[Any] = Field(default_factory=list)
   ```
   `ScriptCue` uses untyped `list[Any]` for token lists instead of `list[Token]`.

7. **`script_store.py:163-171`**:
   Direct `Path.write_text()` without atomic write (temporary file + rename).

8. **`test_tokenize_import_enrich.py:20-26, 135-139`**:
   Uses `urllib.request.urlopen("http://127.0.0.1:8765/health")` to test a running bridge instance. Requires live server running on localhost port 8765.

---

## 2. Logic Chain

1. **Observation 1 → Security Vulnerability**: Since `CORSMiddleware` explicitly allows `allow_origins=["*"]`, any malicious website open in the user's browser can issue cross-origin requests to `http://127.0.0.1:8765/scripts/save` or `/scripts/{video_id}`. This exposes user caption data and saved settings to external scripts.
2. **Observation 2 → Security Risk**: `http://ftp.edrdg.org/...` uses unencrypted HTTP transport. A local network adversary could alter the downloaded file during bootstrap, risking index corruption.
3. **Observation 3 & 4 → Performance Bottlenecks**: String `.find()` in tokenization has $O(N^2)$ worst-case characteristics on repeating text and loses position context if tokens repeat. Inline regex compilation inside `_stem_variants()` incurs runtime compilation cost thousands of times per dictionary lookup.
4. **Observation 5 & 6 → Code Quality & Maintenance**: Duplicate code (`_kata_to_hira`) increases maintenance friction. Untyped `list[Any]` in Pydantic models bypasses type safety and IDE auto-complete.
5. **Observation 7 → Data Loss Risk**: Direct file overwrites on `cues.json` without atomic renaming mean a process interrupt mid-write leaves `cues.json` corrupted or truncated to 0 bytes.
6. **Observation 8 → Test Harness Gap**: `test_tokenize_import_enrich.py` is an integration test against a running process, not an isolated unit test. If the bridge server is offline, test execution fails.

---

## 3. Caveats

- **macOS Helper Execution Environment**: Investigated `ime_switch.py` via code review; actual macOS Carbon TIS behavior depends on system accessibility permissions (`Privacy & Security -> Accessibility`).
- **External Dependencies**: SudachiPy and JMdict index structures were analyzed statically based on code usage; dictionary XML parsing duration was assessed based on `bootstrap.py` logic.
- **Scope Limit**: Frontend extension (`extension/`) and Next.js app (`web/saved-items/`) were out of scope for this investigation (focused exclusively on `local-bridge/`).

---

## 4. Conclusion

The `local-bridge` backend is functionally sound and well-suited to caption tokenization, dictionary lookup, and storage. However, it requires immediate attention on:
1. **Security**: Hardening CORS policies (`allow_origin_regex`) and HTTPS dictionary fetch.
2. **Performance**: Switching to native Sudachi token offsets, pre-compiling regexes, and optimizing IME helper invocation.
3. **Data Integrity**: Implementing atomic file writes in `script_store.py`.
4. **Maintainability & Testing**: Deduplicating text utilities, tightening Pydantic model types, and adding an in-process `pytest` suite.

Comprehensive findings and refactoring strategies have been documented in `/Users/hoangson/Documents/Translate realtime OCR youtube video/.agents/explorer_m1_1/analysis.md`.

---

## 5. Verification Method

To verify findings independently:
1. **Verify CORS Vulnerability**:
   Run `curl -i -H "Origin: https://malicious-site.example" http://127.0.0.1:8765/health` (when bridge is running). Notice `Access-Control-Allow-Origin: *` returned in headers.
2. **Verify Native Offsets**:
   Inspect `local-bridge/tokenize_ja.py` line 104; compare `.find()` usage vs `m.begin()` / `m.end()` attributes on `sudachipy.Morpheme`.
3. **Verify Existing Test Harness**:
   Run `cd local-bridge && python test_tokenize_import_enrich.py` (requires active bridge at `http://127.0.0.1:8765`).
