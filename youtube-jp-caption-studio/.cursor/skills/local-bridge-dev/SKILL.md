---
name: local-bridge-dev
description: >-
  Starts and debugs the local caption FastAPI bridge. Use when running
  start.sh, bootstrap, /health, tokenize, dict, or IME switch.
---

# Local Bridge Dev

## Start

```bash
cd local-bridge
./start.sh
```

Listens on:

| Service | URL |
| --- | --- |
| Bridge | `http://127.0.0.1:8765` (docs `/docs`) |
| Saved Items | `http://127.0.0.1:3000` (`web/saved-items` via `npm run dev`) |

Skip web UI: `SKIP_SAVED_ITEMS=1 ./start.sh`. Log: `local-bridge/.saved-items.log`.

On macOS, `start.sh` also builds `bin/ime-select` so side-panel JA focus can
flip Input Source via `POST /ime/switch` (no Native Messaging install).

Extension popup is **offline-static** (`extension/popup/` from
`web/saved-items` `npm run build:extension`). Live sync for localhost uses
`GET|POST /extension_state`.

**No MT / OCR** — bridge is tokenize + dict + scripts only.

## Bootstrap

```bash
curl -X POST http://127.0.0.1:8765/bootstrap
curl http://127.0.0.1:8765/health
```

Watch `bootstrap.stage` / `percent` until `done`. Indexes JMdict + loads Sudachi/freq (no CT2 models).

## Health fields that matter

- `ready` — extension waits on this
- `models_loaded.sudachi` / `dict` / `freq`
- `models_loaded.mt` / `ocr` — always false
- `pressure` — governor pressure
- `caps.max_in_flight` — leftover governor field (unused for MT)

## Common fixes

- Bridge offline in popup → run `./start.sh`
- Sudachi warn → `pip install sudachipy sudachidict_core` in `.venv`
- Port busy → `lsof -i :8765` and kill old uvicorn
- Hover dict “không có trong từ điển” / empty EN+VI → JMdict index missing
  (`jmdict` rows in `data/dict/dict.sqlite`). Re-run bootstrap after fixing
  download (URL is `https://www.edrdg.org/.../JMdict_e.gz` + certifi SSL).
  Bootstrap must **not** report `done` while JMdict keys &lt; 150k.
- IME not flipping → `curl http://127.0.0.1:8765/ime/status` (need Japanese
  Input Source + `bin/ime-select`); bridge offline = web `lang=ja-JP` only

## Notes

- Warm load on startup: dictionary + freq + Sudachi tokenizer only
