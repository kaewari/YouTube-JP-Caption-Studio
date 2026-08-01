---
name: hardsub-ocr-regression
description: >-
  Runs tokenize/import-enrich regression for the local bridge. Use when
  changing Sudachi tokenize, JLPT/freq tokens, or post-import enrich.
---

# Tokenize / Import Enrich Regression

Caption pipeline is timedtext → import/manual EN–VI → bridge `/tokenize_batch`.
No machine translation or OCR.

## Run

```bash
# Bridge must be running on 127.0.0.1:8765
cd local-bridge && source .venv/bin/activate
python test_tokenize_import_enrich.py
```

## What to cover

| Area | File | Checks |
| --- | --- | --- |
| Post-import enrich | `test_tokenize_import_enrich.py` | Locked EN/VI unchanged; tokens get `reading` + `freq_rank`/`jlpt` |

## Checklist after tokenize changes

1. Start bridge (`./start.sh`)
2. Run `python test_tokenize_import_enrich.py` — must PASS
3. Confirm side panel shows furigana after Import / JA Enter
