# Comprehensive Code Review Report: FastAPI `local-bridge` Backend

**Project Root**: `/Users/hoangson/Documents/Translate realtime OCR youtube video`  
**Target Subsystem**: `local-bridge/` (FastAPI backend service)  
**Date**: 2026-07-29  
**Reviewer**: Explorer 1 (`local-bridge` Focus)  

---

## Executive Summary

The `local-bridge` service is a Python FastAPI application (`http://127.0.0.1:8765`) designed as a local sidecar service for the YouTube Caption Chrome Extension (MV3). It handles Japanese tokenization via SudachiPy, bilingual dictionary lookups (JMdict English + curated Vietnamese), local caption script persistence (`scripts/{videoId}/`), macOS Input Source (IME) switching, and state mirroring for the Next.js `saved-items` web interface.

While the service is functionally targeted and well-tailored to local caption management, this code review identified critical security vulnerabilities (wildcard CORS on localhost exposing user data to arbitrary websites), thread safety flaws (unprotected global mutable state during lazy initialization), performance bottlenecks (blocking synchronous I/O, subprocess creation on UI events, uncompiled regexes), and architectural coupling issues.

---

## Detailed Audit Findings by Domain

### 1. Architecture & Dataflow

#### 1.1 Unprotected Global Mutable State & Thread Concurrency Risks
- **File**: `local-bridge/dictionary.py` (lines 173–175), `tokenize_ja.py` (lines 14–15), `vocab_freq.py` (lines 19–20), `main.py` (lines 60, 64–69)
- **Category**: Architecture / Concurrency
- **Severity**: High
- **Observation**:
  - `dictionary.py` maintains global dictionaries `_jmdict` and `_javi` mutated by `load_dictionary()` without any threading lock.
  - `tokenize_ja.py` maintains `_tokenizer` and `_loaded` mutated by `load_tokenizer()` without a lock.
  - `vocab_freq.py` maintains `_freq` and `_loaded` mutated by `load_freq()` without a lock.
  - `main.py` maintains `_latencies = deque(maxlen=50)` updated concurrently across HTTP requests without locking.
- **Impact**: In FastAPI, endpoints are served in Starlette worker threads. Concurrent incoming requests triggering lazy loading can cause data races, double dictionary loading, corrupted cache entries, or `RuntimeError: dictionary changed size during iteration`.
- **Root Cause**: Reliance on global module-level singletons initialized on-demand without synchronization primitives.
- **Proposed Strategy**: Introduce `threading.Lock()` or an `async` application state container (FastAPI `app.state`) managed cleanly during lifespan startup events.

#### 1.2 Coupling and Dynamic Local Imports
- **File**: `local-bridge/dictionary.py` (lines 405–414), `vocab_freq.py` (lines 114–137), `bootstrap.py` (lines 55–56, 88–89, 98–100)
- **Category**: Architecture / Maintainability
- **Severity**: Medium
- **Observation**:
  - `dictionary.py` performs inline dynamic imports inside `_expand_candidates()` (`from tokenize_ja import is_loaded, tokenize`) to avoid circular dependency errors between `dictionary.py` and `tokenize_ja.py`.
  - `vocab_freq.py` dynamically instantiates a fresh `sudachipy.Dictionary()` instance inside `_reading_lookup()` (line 136) rather than reusing `tokenize_ja.py`'s existing tokenizer.
- **Impact**: Inline dynamic imports obscure dependency graphs, bypass static analysis tools, and lead to duplicate memory allocations (e.g., instantiating multiple Sudachi dictionaries in memory).
- **Root Cause**: Entangled responsibilities among tokenizer, dictionary, and vocabulary frequency modules.
- **Proposed Strategy**: Refactor into a clean service layer hierarchy (e.g., `services/tokenizer.py`, `services/dictionary.py`, `services/freq.py`) with explicit dependency injection or single application context.

---

### 2. Maintainability & Code Quality

#### 2.1 Code Duplication Across Modules
- **File**: `local-bridge/tokenize_ja.py` (lines 45–53), `dictionary.py` (lines 264–272), `vocab_freq.py` (lines 139–147)
- **Category**: Maintainability
- **Severity**: Low
- **Observation**:
  - The function `_kata_to_hira(text: str)` is identically implemented across three separate Python files.
- **Impact**: Code duplication increases maintenance burden; changes to Japanese text normalization must be replicated in three places.
- **Root Cause**: Lack of a shared utilities module for string manipulation and normalization.
- **Proposed Strategy**: Move text normalization helpers (`_kata_to_hira`, `_hira_to_kata`, `_nfkc`) to a unified utility file `local-bridge/utils_text.py`.

#### 2.2 Incomplete Model Typing in Shared Contracts
- **File**: `local-bridge/models.py` (lines 125, 156), `main.py` (lines 235–239)
- **Category**: Maintainability
- **Severity**: Medium
- **Observation**:
  - `ScriptCue.tokens` is typed as `list[Any] = Field(default_factory=list)` instead of `list[Token]`.
  - `ScriptLoadResponse.meta` is typed as `dict[str, Any]`.
  - `main.py` line 235 parses cues using `ScriptCue(**c) if isinstance(c, dict) else ScriptCue()`, leaving tokens unvalidated.
- **Impact**: Type checking with `mypy` or IDE auto-complete cannot verify the structure of token objects within cues. Invalid token payloads can pass validation silently.
- **Root Cause**: Permissive Pydantic models designed for quick prototype serialization.
- **Proposed Strategy**: Strict type definition `tokens: list[Token] = Field(default_factory=list)` in `ScriptCue`.

#### 2.3 Hardcoded Seed Data in Source Code
- **File**: `local-bridge/dictionary.py` (lines 21–158)
- **Category**: Maintainability
- **Severity**: Low
- **Observation**:
  - A 137-entry Japanese-to-Vietnamese seed dictionary `_SEED_JA_VI` is defined directly as a python `dict` literal occupying ~140 lines of `dictionary.py`.
- **Impact**: Bloats source code file size, separates seed data from resource assets, and complicates translation additions.
- **Root Cause**: Inline fallback dataset definition.
- **Proposed Strategy**: Externalize `_SEED_JA_VI` into `data/dict/ja_vi_seed.json` and load it dynamically during dictionary initialization.

---

### 3. Performance & Resource Usage

#### 3.1 Uncompiled Regex in Hot Code Paths
- **File**: `local-bridge/dictionary.py` (lines 319–322)
- **Category**: Performance
- **Severity**: Medium
- **Observation**:
  - `re.match(r"^([\u3400-\u9fff]+)([\u3040-\u309f]+)$", t)` is compiled on every call to `_stem_variants()`.
  - `_expand_candidates()` calls `_stem_variants()` for every single lookup candidate, recompiling this regex thousands of times during bulk tokenization or dictionary lookups.
- **Impact**: High CPU overhead during batch tokenization and candidate expansion.
- **Root Cause**: Inline regex string compilation instead of module-level `re.compile()`.
- **Proposed Strategy**: Move regex to module scope: `_KANJI_OKURIGANA_RE = re.compile(r"^([\u3400-\u9fff]+)([\u3040-\u309f]+)$")`.

#### 3.2 Inefficient Subprocess Execution for macOS IME Switch
- **File**: `local-bridge/ime_switch.py` (lines 45–56, 112–145, 242–297)
- **Category**: Performance
- **Severity**: High
- **Observation**:
  - Every input focus event in the side panel invokes `/ime/switch`, which calls `get_current()`, `save_prev()`, `pick_first()`, `set_id()`, and `accessibility_status()`.
  - Each of these functions runs `subprocess.run(["bin/ime-select", ...])`.
  - Switching input source spawns between 2 to 4 synchronous subprocesses, each incurring macOS process creation overhead (10ms–50ms per invocation).
- **Impact**: Noticeable UI latency and typing lag when moving focus in YouTube caption edit panel.
- **Root Cause**: Polling and command execution via CLI subprocess rather than a persistent binary channel, C-extension (PyObjC / Carbon FFI), or caching availability status.
- **Proposed Strategy**: Cache helper availability and accessibility status in memory; optimize `ime-select` helper calls or batch query.

#### 3.3 Linear Substring Search in Tokenizer
- **File**: `local-bridge/tokenize_ja.py` (lines 104–106)
- **Category**: Performance
- **Severity**: Medium
- **Observation**:
  - `idx = text.find(surface, cursor)` is called inside the loop over morphemes.
  - If a surface appears multiple times or text contains repeated particles/kanji, repeated `find()` calls degrade to $O(N^2)$ search time and can return incorrect indices if character offsets drift.
- **Impact**: Incorrect character start/end boundaries on repetitive caption text; suboptimal token indexing.
- **Root Cause**: Manual string search instead of utilizing Sudachi's native morpheme offset methods `m.begin()` and `m.end()`.
- **Proposed Strategy**: Use Sudachi morpheme offset methods `m.begin()` and `m.end()` directly!

---

### 4. Security Analysis

#### 4.1 CORS Wildcard Policy on Local Daemon (CRITICAL)
- **File**: `local-bridge/main.py` (lines 53–58)
- **Category**: Security
- **Severity**: Critical
- **Observation**:
  ```python
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["*"],
      allow_methods=["*"],
      allow_headers=["*"],
  )
  ```
- **Impact**: Any malicious or third-party website opened in the user's web browser can send cross-origin AJAX/fetch requests to `http://127.0.0.1:8765`. A malicious site can exfiltrate saved caption scripts (`GET /scripts/{video_id}`), modify user vocabulary (`POST /extension_state`), trigger input source changes (`POST /ime/switch`), or delete saved scripts (`DELETE /scripts/{video_id}`).
- **Root Cause**: Overly permissive CORS settings intended for local browser extension development.
- **Proposed Strategy**: Restrict `allow_origins` or `allow_origin_regex` specifically to Chrome extension origins (`chrome-extension://*`) and localhost development servers (`http://localhost:3000`, `http://127.0.0.1:3000`).

#### 4.2 Insecure HTTP Transport for Bootstrap Dictionary Download
- **File**: `local-bridge/bootstrap.py` (line 84)
- **Category**: Security
- **Severity**: High
- **Observation**:
  ```python
  _download("http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz", gz)
  ```
- **Impact**: Unencrypted HTTP download is susceptible to Man-In-The-Middle (MITM) attacks and DNS spoofing, allowing an attacker on the same network to serve arbitrary or corrupted dictionary files.
- **Root Cause**: Hardcoded HTTP protocol URL.
- **Proposed Strategy**: Upgrade URL to HTTPS: `https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz` (or use mirror supporting TLS).

#### 4.3 Non-Atomic File Writes for Caption Persistence
- **File**: `local-bridge/script_store.py` (lines 163–171), `main.py` (lines 94–98)
- **Category**: Security / Data Integrity
- **Severity**: Medium
- **Observation**:
  - `cues_path.write_text(...)`, `txt_path.write_text(...)`, `meta_path.write_text(...)`, and `_save_ext_state_disk()` write directly to target file paths without using temporary files or atomic replacement.
- **Impact**: If the bridge process is terminated or crashes mid-write (or system loses power), files can be truncated or corrupted (`0 bytes`), resulting in lost user caption edits.
- **Root Cause**: Direct synchronous file overwriting.
- **Proposed Strategy**: Implement atomic file writing pattern: write content to a temporary file in the same directory (`cues.json.tmp`) and atomically rename (`os.replace`).

---

### 5. Test Harness Review

#### 5.1 Analysis of `local-bridge/test_tokenize_import_enrich.py`
- **File**: `local-bridge/test_tokenize_import_enrich.py` (lines 1–196)
- **Category**: Test Harness / Quality Assurance
- **Severity**: Medium
- **Current Coverage**:
  - Verifies post-import token enrichment behavior: tests that imported EN/VI captions have `mt_locked=True` and `translation_source="import"`, and that calling `/tokenize_batch` enriches cues with `reading`, `freq_rank`, and `jlpt` levels while preserving existing translations.
  - Tests idempotency of `/tokenize_batch` (second call returns `0` enriched cues).
- **Gaps & Weaknesses**:
  1. **Requires Live Running Bridge**: The test makes actual HTTP requests to `http://127.0.0.1:8765` using `urllib.request`. If the bridge is not running, the test fails immediately (`FAIL: bridge not reachable`).
  2. **No Automated In-Process Unit Tests**: Lacks `pytest` integration or FastAPI `TestClient` / `httpx.AsyncClient` test harness.
  3. **Uncovered Subsystems**:
     - `script_store.py` (`save_script`, `load_script`, `delete_script`) is completely untested.
     - `dictionary.py` lookup variations, stem matching, and cache behavior are untested.
     - `ime_switch.py` fallback modes are untested.
     - `main.py` CORS and exception handling routes are untested.
- **Proposed Improvement Strategy**:
  - Create a `tests/` directory containing pytest suites using FastAPI `TestClient(app)` for fast, isolated, in-process unit and integration testing without requiring a live server process.

---

## Prioritized Audit Summary Table

| ID | Module | Category | Issue Description | Severity | Fix Complexity |
|---|---|---|---|---|---|
| SEC-01 | `main.py:53-58` | Security | Wildcard CORS (`*`) allows arbitrary website access to local API | **Critical** | Low |
| SEC-02 | `bootstrap.py:84` | Security | Unencrypted HTTP download of dictionary archive (`http://ftp.edrdg.org`) | **High** | Low |
| PERF-01 | `tokenize_ja.py:104-126` | Performance | Manual `find()` string search instead of Sudachi `m.begin()`/`m.end()` | **Medium** | Low |
| PERF-02 | `ime_switch.py:45-145` | Performance | Multiple synchronous subprocess calls per UI focus event | **High** | Medium |
| PERF-03 | `dictionary.py:319` | Performance | Re-compiling kanji/okurigana regex inside loop on every candidate | **Medium** | Low |
| ARCH-01 | `dictionary.py`, `tokenize_ja.py` | Architecture | Unprotected global state (`_jmdict`, `_tokenizer`) causing data races | **High** | Medium |
| MAINT-01| `tokenize_ja.py`, `dictionary.py` | Maintainability | `_kata_to_hira()` duplicated across 3 separate files | **Low** | Low |
| MAINT-02| `models.py:125` | Maintainability | Loose typing `list[Any]` in `ScriptCue.tokens` | **Medium** | Low |
| DATA-01 | `script_store.py:163-171` | Data Integrity | Non-atomic disk writes risk file truncation on crash | **Medium** | Low |
| TEST-01 | `test_tokenize_import_enrich.py` | Test Harness | Regression test requires live HTTP server; no pytest harness | **Medium** | Medium |

---

## Proposed Refactoring & Fix Strategy

Below are concrete, drop-in replacement snippets for key issues identified during review:

### Fix SEC-01: Restrict CORS Policy in `main.py`
```python
# main.py line 53
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^chrome-extension://.*|http://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
```

### Fix PERF-01: Use Native Morpheme Offsets in `tokenize_ja.py`
```python
# tokenize_ja.py line 102
for m in _tokenizer.tokenize(text):
    surface = m.surface()
    idx = m.begin()
    end_idx = m.end()
    lemma = m.dictionary_form() or surface
    # ...
```

### Fix PERF-03 & MAINT-01: Extracted Utilities & Pre-compiled Regex
In `utils_text.py`:
```python
import re

_KANJI_RE = re.compile(r"[\u3400-\u9fff]")
_OKURIGANA_RE = re.compile(r"^([\u3400-\u9fff]+)([\u3040-\u309f]+)$")

def kata_to_hira(text: str) -> str:
    out = []
    for ch in text:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        else:
            out.append(ch)
    return "".join(out)
```

### Fix DATA-01: Atomic Write Helper for `script_store.py`
```python
import os
import tempfile
from pathlib import Path

def atomic_write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False, encoding=encoding) as tf:
        tf.write(content)
        temp_name = tf.name
    os.replace(temp_name, path)
```

---

## Next Steps for Implementation Team
1. Apply **SEC-01** (CORS restriction) immediately to secure the local daemon.
2. Extract text utilities (**MAINT-01**) and refactor regex compilation (**PERF-03**).
3. Fix token character offset indexing (**PERF-01**).
4. Implement atomic file writing (**DATA-01**).
5. Add `pytest` test suite with `TestClient` for isolated CI/CD test execution (**TEST-01**).
