# Challenge Report: Backend Stress Test & Empirical Verification (`local-bridge`)

## Challenge Summary

**Overall risk assessment**: **HIGH**

Empirical stress testing of `local-bridge` revealed a **High Severity Race Condition & Data Corruption Defect** in `script_store.py` during concurrent script saving operations. While tokenization (`tokenize_ja.py`) and standard import enrichment workflows (`test_tokenize_import_enrich.py`) passed all empirical edge-case checks, file persistence under concurrency fails due to non-unique temporary file naming in `_atomic_write_text`.

---

## Challenges

### [HIGH] Challenge 1: Non-Unique Temporary File Naming Causes Data Corruption & FileNotFoundError Under Concurrency in `script_store.py`

- **Assumption challenged**: `_atomic_write_text(path, content)` is safe for concurrent write operations to the same `video_id`.
- **Attack scenario**:
  When two or more requests (e.g. auto-save triggers, manual cue edits, batch token enrichment updates) trigger `save_script(video_id, ...)` simultaneously:
  1. Thread A writes to `cues.json.tmp`.
  2. Thread B writes to `cues.json.tmp` at the same time, overwriting Thread A's partial content.
  3. Thread A executes `tmp_path.replace(path)` (renaming `cues.json.tmp` to `cues.json`).
  4. Thread B attempts `tmp_path.replace(path)`. However, `cues.json.tmp` was already deleted/renamed by Thread A!
  5. Thread B crashes with `FileNotFoundError: [Errno 2] No such file or directory: '.../cues.json.tmp' -> '.../cues.json'`.
  6. Simultaneously, concurrent reads from `load_script` or external readers encounter **0-byte truncated reads** or **corrupted JSON** (`JSONDecodeError: Extra data`).
- **Blast radius**: User caption scripts get truncated, lost, or corrupted on disk when multiple async operations write to `scripts/{videoId}/` simultaneously.
- **Mitigation**: Update `_atomic_write_text` in `script_store.py` to use a unique temporary filename per write operation (e.g. `uuid` or `tempfile.NamedTemporaryFile` in the same directory):
  ```python
  import uuid

  def _atomic_write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
      tmp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
      try:
          tmp_path.write_text(content, encoding=encoding)
          tmp_path.replace(path)
      except Exception:
          if tmp_path.exists():
              tmp_path.unlink()
          raise
  ```

---

### [MEDIUM / LOW] Challenge 2: Over-Permissive CORS Origin Pattern (`chrome-extension://.*`)

- **Assumption challenged**: CORS regex `^chrome-extension://.*|^http://(localhost|127\.0\.0\.1)(:\d+)?$` safely isolates the local bridge server to authorized extension clients.
- **Attack scenario**:
  The regex pattern `^chrome-extension://.*` uses an unanchored wildcard `.*` for the extension scheme without grouping. This allows **ANY** Chrome extension installed in the user's browser (or malicious extensions) to make cross-origin requests (`allow_credentials=True`) to `http://127.0.0.1:8765`.
- **Blast radius**: Any malicious or untrusted browser extension running in the user's browser could issue requests to read or modify local caption scripts, invoke tokenization endpoints, or alter extension state.
- **Mitigation**:
  Restrict extension origins to specific valid 32-character extension IDs or format constraints, for example:
  ```python
  allow_origin_regex=r"^(chrome-extension://[a-z0-9]{32}|http://(localhost|127\.0\.0\.1)(:\d+)?)$"
  ```

---

## Stress Test Results

| Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| `test_tokenize_import_enrich.py` Execution | Bridge processes batch tokenize requests, locks EN/VI, enriches reading/JLPT/freq | Processed sample cues `imp1` & `imp2`, returning readings, JLPT tags, and ranks without changing locked EN/VI | **PASS** |
| `tokenize_ja.py` Empty & Whitespace Inputs | Returns empty list `[]` without throwing exceptions | Returned `[]` for `""`, space tokens for `"   "` and `"\n\t  \r\n"` | **PASS** |
| `tokenize_ja.py` Repeating Japanese Words (`"東京東京"`) | Correctly tokenizes into 2 separate tokens with contiguous ranges | Returned 2 tokens (`東京` `[0:2]`, `東京` `[2:4]`) | **PASS** |
| `tokenize_ja.py` Non-Japanese / Special Characters (VI, EN, Emojis, HTML, Null Byte, 10k Chars) | Graceful tokenization without crashes or exceptions | Handled all non-JA input types, emojis, surrogate pairs, and 10k character texts cleanly | **PASS** |
| Path Traversal in `script_store.py` (`../etc/passwd`) | `_safe_video_id` raises `ValueError` | Rejected all 9 path traversal and invalid `video_id` payloads | **PASS** |
| Data Filtering in `script_store.py` | Non-dict items filtered out, valid cues saved | Cleaned dirty list and preserved 6 valid draft/normal cues | **PASS** |
| Git Conflict Marker Protection in `script_txt` | Avoid bare `======` lines that trigger IDE conflict false positives | Verified zero bare `======` lines in generated `script.txt` | **PASS** |
| Concurrent Script Writes (15 threads x 20 iterations) | Isolated atomic writes without data corruption or errors | **248 write errors (`FileNotFoundError`), 2 corrupted/0-byte reads** | **FAIL** |
| CORS Origin Validation (Localhost / IP / Subdomain Attacks) | Accepts localhost/127.0.0.1 (ports optional), rejects `.attacker.com` | Accepted valid local origins; rejected `localhost.attacker.com` | **PASS** |
| CORS Origin Extension Wildcard (`chrome-extension://.*`) | Restricts access to target extension ID | Accepts any extension ID (e.g. `chrome-extension://malicious`) | **WARNING** |

---

## Unchallenged Areas

- **IME Switch Native Interop (`ime_switch.py`)**: macOS `CGEvent` and system input source switching depend on macOS GUI event permissions (`Accessibility API`). Tested only mocked state endpoints during bridge health check.
