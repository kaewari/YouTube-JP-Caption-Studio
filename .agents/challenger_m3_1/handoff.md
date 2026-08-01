# Hard Handoff Report: Challenger 1 (Backend Stress Test & Empirical Verifier)

## 1. Observation

- **Command Execution**:
  - `cd local-bridge && .venv/bin/python test_tokenize_import_enrich.py`
    - Output:
      ```
      PASS: import enrich → tokens with reading+jlpt/freq; EN/VI locked unchanged
        imp1: 4 toks e.g. 日本語(にほんご) jlpt=None freq=None
        imp2: 5 toks e.g. 今日(きょう) jlpt=n5 freq=76
      ```
  - `cd local-bridge && .venv/bin/python ../.agents/challenger_m3_1/test_tokenize_edge_cases.py`
    - 21 test cases passed including empty string, repeating words (`"東京東京"`), Vietnamese, English, symbols, emojis, HTML tags, null bytes, surrogate pairs, and 10,000-character Japanese text.
  - `cd local-bridge && .venv/bin/python ../.agents/challenger_m3_1/test_script_store_stress.py`
    - Output:
      ```
      Concurrent write errors: 248
      Read corruption / truncation events detected: 2
      Writer errors: ["Writer T1 iter 0 error: [Errno 2] No such file or directory: '.../cues.json.tmp' -> '.../cues.json'", ...]
      Read corruptions: ['cues.json corrupted read: Extra data: line 143 column 2 (char 3778)', 'script.txt read 0 bytes (truncated file exposed!)']
      AssertionError: Concurrent writers encountered errors!
      ```
  - `cd local-bridge && .venv/bin/python ../.agents/challenger_m3_1/test_cors_regex.py`
    - Accepted valid `localhost`/`127.0.0.1` and Chrome extension scheme. Rejected `http://localhost.attacker.com`. Matched wildcard `chrome-extension://.*` for non-standard IDs.

- **File Inspections**:
  - `local-bridge/script_store.py:108-112`:
    ```python
    def _atomic_write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        tmp_path.write_text(content, encoding=encoding)
        tmp_path.replace(path)
    ```
  - `local-bridge/main.py:53-59`:
    ```python
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^chrome-extension://.*|^http://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    ```

---

## 2. Logic Chain

1. **Observation**: `_atomic_write_text` constructs `tmp_path` as `path.with_suffix(path.suffix + ".tmp")`, producing static temporary paths like `cues.json.tmp`.
2. **Step**: When 15 threads concurrently call `save_script(concurrent_vid, ...)` on the same video ID, multiple threads attempt to write to `cues.json.tmp` simultaneously.
3. **Observation**: Thread A writes to `cues.json.tmp` and renames it to `cues.json`. Thread B is in the middle of writing or attempting `tmp_path.replace(path)`, but `cues.json.tmp` has already been moved by Thread A.
4. **Observation**: Thread B throws `FileNotFoundError: [Errno 2] No such file or directory: '.../cues.json.tmp' -> '.../cues.json'`. Concurrent readers encounter 0-byte truncated files or invalid JSON with trailing data (`Extra data: line 143 column 2`).
5. **Conclusion**: `script_store.py` suffers from a high-severity file atomicity race condition under concurrent requests.

6. **Observation**: `main.py:55` uses `r"^chrome-extension://.*|^http://(localhost|127\.0\.0\.1)(:\d+)?$"`.
7. **Step**: While `http://localhost.attacker.com` is properly rejected, `^chrome-extension://.*` matches any origin starting with `chrome-extension://`.
8. **Conclusion**: Any Chrome extension installed in the user's browser can interact with the local bridge server without restriction.

---

## 3. Caveats

- `ime_switch.py` native macOS input switching was not tested with actual keyboard hardware state changes as it requires macOS Accessibility API event posting.
- No other caveats.

---

## 4. Conclusion

`local-bridge` tokenization (`tokenize_ja.py`) and import enrichment (`test_tokenize_import_enrich.py`) are robust and function correctly across all tested edge cases.
However, **`script_store.py` contains a critical concurrency defect** in `_atomic_write_text` that causes data corruption, 0-byte reads, and `FileNotFoundError` during simultaneous script save operations. Additionally, the CORS regex should be tightened to restrict extension origins.

---

## 5. Verification Method

To independently verify these findings:

1. **Run `test_tokenize_import_enrich.py`**:
   ```bash
   cd local-bridge && .venv/bin/python test_tokenize_import_enrich.py
   ```
   *Expected output*: `PASS: import enrich → tokens with reading+jlpt/freq; EN/VI locked unchanged`.

2. **Run Edge Case Tokenization Test**:
   ```bash
   cd local-bridge && .venv/bin/python ../.agents/challenger_m3_1/test_tokenize_edge_cases.py
   ```
   *Expected output*: All 21 test categories PASS.

3. **Run Concurrency & File Atomicity Stress Harness**:
   ```bash
   cd local-bridge && .venv/bin/python ../.agents/challenger_m3_1/test_script_store_stress.py
   ```
   *Expected output*: Triggers `AssertionError: Concurrent writers encountered errors!` showing 200+ `FileNotFoundError` exceptions and corrupted 0-byte reads.

4. **Run CORS Regex Verification Harness**:
   ```bash
   cd local-bridge && .venv/bin/python ../.agents/challenger_m3_1/test_cors_regex.py
   ```
