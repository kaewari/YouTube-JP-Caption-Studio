<!-- date: 2026-08-26 -->
<!-- source: chat:grilling · user: nâng cấp từ điển Nhật - Việt chất lượng cao, âm Hán Việt, greedy lookup và bỏ cầu nối EN-VI -->

# JA-VI Studio Dictionary & Sino-Vietnamese Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the dictionary subsystem to high-accuracy offline Japanese-Vietnamese (Yomitan JA-VI) with Sino-Vietnamese (Hán-Việt) reading support, multi-word idiom greedy matching, and clean JMdict English fallback, completely removing inaccurate word-by-word EN-VI translation bridging.

**Architecture:** 
- Database: Optimized `dict.sqlite` with 3 core tables: `jmdict_vi` (expression, reading, glosses), `kanji_hanviet` (kanji, hanviet), `jmdict` (expression, payload).
- Service: Enhanced `dictionary.py` with multi-token greedy idiom detection, kanji decomposition to Sino-Vietnamese readings, and clean fallback resolution.
- UI: Caption popups & sidepanel render Kanji + Furigana + Sino-Vietnamese tag (Hán-Việt) + top Vietnamese definitions + secondary English glosses.

**Tech Stack:** Python 3.11+, FastAPI, SQLite 3 (read-only URI mode), SudachiPy, Vanilla TS/JS MV3 Extension.

---

## Global Constraints

- **No MT Bridge:** Remove `en_vi` table queries and translation guessing (`_vi_from_en_glosses`).
- **Offline & Low-latency:** Lookups must remain under 5ms using SQLite indexes and LRU caching.
- **Data Integrity:** `dict.sqlite` must be deterministically buildable via CLI script with automated regression testing.

---

## Tasks

### Task 1: Sino-Vietnamese (Hán-Việt) Data Table & Model Definition

**Files:**
- Create: `local-bridge/app/data/hanviet_data.py`
- Modify: `local-bridge/app/schemas/models.py:93-115`
- Test: `local-bridge/tests/test_hanviet.py`

**Interfaces:**
- Consumes: Character strings containing Kanji characters `[㐀-鿿豈-﫿]`.
- Produces: `get_hanviet_reading(text: str) -> str` (e.g. `約束` -> `Ước Thúc`, `勉強` -> `Miễn Cưỡng`).
- Updates `DictResponse` schema with `hanviet: str = ""` field.

- [ ] **Step 1: Write failing test for Hán-Việt generator and schema**

```python
import pytest
from app.data.hanviet_data import get_hanviet_reading
from app.schemas.models import DictResponse

def test_hanviet_lookup():
    assert get_hanviet_reading("約束") == "Ước Thúc"
    assert get_hanviet_reading("日本語") == "Nhật Bản Ngữ"
    assert get_hanviet_reading("食べる") == "Thực"
    assert get_hanviet_reading("あいつ") == ""

def test_dict_response_schema_hanviet():
    resp = DictResponse(surface="約束", reading="やくそく", hanviet="Ước Thúc")
    assert resp.hanviet == "Ước Thúc"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest local-bridge/tests/test_hanviet.py -v`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement Hán-Việt dictionary mapping and schema update**

Create `local-bridge/app/data/hanviet_data.py` with full unihan/kanji Hán-Việt mapping table and uppercase formatter.
Update `DictResponse` in `local-bridge/app/schemas/models.py` to include `hanviet: str = ""`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest local-bridge/tests/test_hanviet.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add local-bridge/app/data/hanviet_data.py local-bridge/app/schemas/models.py local-bridge/tests/test_hanviet.py
git commit -m "feat(dict): add Sino-Vietnamese Han-Viet mapping and schema field"
```

---

### Task 2: Yomitan JA-VI Parser & SQLite Dict Builder

**Files:**
- Modify: `local-bridge/app/scripts/build_dict_sqlite.py`
- Modify: `local-bridge/app/scripts/import_jmdict_vi.py`
- Test: `local-bridge/tests/test_build_dict.py`

**Interfaces:**
- Consumes: Yomitan JA-VI zip / JSON data and Hán-Việt dictionary dataset.
- Produces: Clean `data/dict/dict.sqlite` containing:
  - `jmdict_vi (expression TEXT, reading TEXT, glosses TEXT)` indexed on `(expression, reading)`
  - `kanji_hanviet (kanji TEXT PRIMARY KEY, hanviet TEXT)`
  - `jmdict (expression TEXT PRIMARY KEY, payload TEXT)`
- Removes: obsolete `en_vi` table and `vnedict.txt` dependencies.

- [ ] **Step 1: Write test for SQLite DB schema and tables**

```python
import sqlite3
from pathlib import Path
import pytest

def test_dict_sqlite_tables():
    db_path = Path("data/dict/dict.sqlite")
    if not db_path.exists():
        pytest.skip("dict.sqlite not built yet")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    cur = conn.cursor()
    tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "jmdict_vi" in tables
    assert "kanji_hanviet" in tables
    assert "jmdict" in tables
    assert "en_vi" not in tables
    conn.close()
```

- [ ] **Step 2: Update `build_dict_sqlite.py` and `import_jmdict_vi.py`**

- Update `import_jmdict_vi.py` to extract direct definitions cleanly without English bridge markers.
- Update `build_dict_sqlite.py` to populate `jmdict_vi`, `kanji_hanviet`, `jmdict` with proper B-Tree indices and `PRAGMA user_version = 4`.
- Delete generation of `en_vi` table.

- [ ] **Step 3: Run SQLite build and verify schema test**

Run: `python3 local-bridge/app/scripts/build_dict_sqlite.py && pytest local-bridge/tests/test_build_dict.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add local-bridge/app/scripts/build_dict_sqlite.py local-bridge/app/scripts/import_jmdict_vi.py local-bridge/tests/test_build_dict.py
git commit -m "feat(dict): build clean SQLite dictionary with JA-VI, Han-Viet, and JMdict tables"
```

---

### Task 3: Bridge Dictionary Service & Greedy Idiom Matcher

**Files:**
- Modify: `local-bridge/app/services/dictionary.py`
- Modify: `local-bridge/app/api/dict.py`
- Test: `local-bridge/tests/test_dictionary_service.py`

**Interfaces:**
- Consumes: `DictRequest(surface, lemma, sentence_id)` and optional `context_tokens: list[str]`.
- Produces: `DictResponse` containing accurate `glosses_vi`, `hanviet`, `senses` (EN), `reading`, and matched lemma.
- Implements:
  - `_query_hanviet(kanji_text: str) -> str`
  - `_vi_glosses_for(key: str, reading: str = "") -> list[str]` (direct JA-VI > curated seed > empty).
  - Greedy sequence matching for multi-word expressions (`気にする`, `足がつく`).
  - Deprecation and removal of `_query_en_vi` and `_vi_from_en_glosses`.

- [ ] **Step 1: Write test for accurate Vietnamese definitions and Hán-Việt output**

```python
import pytest
from app.services.dictionary import lookup_word, load_dictionary

def test_lookup_accuracy_and_hanviet():
    load_dictionary()
    res = lookup_word("約束")
    assert res is not None
    assert res.hanviet == "Ước Thúc"
    assert any("hứa" in g.lower() for g in res.glosses_vi)
    assert not any("gốc tiếng anh" in g.lower() for g in res.glosses_vi)

def test_lookup_fallback_rare_word():
    load_dictionary()
    # Word with no JA-VI should retain high quality JMdict EN senses without broken EN-VI machine bridge
    res = lookup_word("頑な")
    assert res is not None
    assert len(res.senses) > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest local-bridge/tests/test_dictionary_service.py -v`
Expected: FAIL.

- [ ] **Step 3: Refactor `dictionary.py`**

- Integrate `get_hanviet_reading` and `kanji_hanviet` table query.
- Strip all `en_vi` code paths (`_query_en_vi`, `_vi_from_en_glosses`, `EN_VI_JSON`).
- Improve direct JA-VI matching with lemma inflection stripping.
- Cache results in `dict_cache`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest local-bridge/tests/test_dictionary_service.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add local-bridge/app/services/dictionary.py local-bridge/app/api/dict.py local-bridge/tests/test_dictionary_service.py
git commit -m "feat(dict): upgrade dictionary service with accurate JA-VI, Han-Viet, and remove EN-VI bridge"
```

---

### Task 4: UI Display for Hán-Việt & Clean Definitions

**Files:**
- Modify: `extension/src/content/ui/dictPopup.ts` (or `extension/src/content/ui/overlay.ts` / related popup component)
- Modify: `extension/src/types/dict.ts`
- Test: Build extension `npm run build` or assert DOM render.

**Interfaces:**
- Consumes: `DictResponse` with `{ surface, reading, hanviet, glosses_vi, senses }`.
- Produces: Popup card header:
  ```html
  <div class="dict-header">
    <span class="dict-surface">約束</span>
    <span class="dict-reading">【やくそく】</span>
    <span class="dict-hanviet-badge">Ước Thúc</span>
  </div>
  <div class="dict-vi-glosses">
    <ol><li>lời hứa, giao ước</li>...</ol>
  </div>
  ```

- [ ] **Step 1: Update TypeScript interface for DictResponse**

Ensure `hanviet?: string` is defined in extension dict types.

- [ ] **Step 2: Render Hán-Việt badge in dict popup UI**

Update popup rendering logic to display `.dict-hanviet-badge` when `hanviet` is non-empty.

- [ ] **Step 3: Verify extension build**

Run: `cd extension && npm run build` (or verify static scripts).
Expected: PASS with no TS errors.

- [ ] **Step 4: Commit**

```bash
git add extension/
git commit -m "feat(ui): display Sino-Vietnamese Han-Viet badge and refined definitions in dict popup"
```

---

### Task 5: End-to-End Verification & Regression Benchmark

**Files:**
- Test: `local-bridge/tests/test_dict_regression.py`
- Modify: `walkthrough.md`
- Modify: `README.md`

- [x] **Step 1: Write comprehensive 50-word regression test**

Verify core JLPT N5-N1 vocabulary, compound verbs, idioms, and ensure no EN-VI bridge artefacts appear in outputs.

- [x] **Step 2: Run all tests in bridge**

Run: `pytest local-bridge/tests/ -v`
Expected: ALL PASS.

- [x] **Step 3: Update documentation in `walkthrough.md` and `README.md`**

Document new dictionary features: Yomitan JA-VI standard, Hán-Việt Sino-Vietnamese readings, and JMdict EN fallback.

- [x] **Step 4: Final Commit**

```bash
git add local-bridge/tests/test_dict_regression.py walkthrough.md README.md
git commit -m "docs(dict): document high-accuracy JA-VI dictionary and Han-Viet features"
```
