#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
SAVED_ITEMS="$REPO_ROOT/web/saved-items"
SAVED_ITEMS_PORT="${SAVED_ITEMS_PORT:-3000}"
SAVED_ITEMS_PID_FILE="$ROOT/.saved-items.pid"
SAVED_ITEMS_LOG="$ROOT/.saved-items.log"

# Local overrides (.env). Never commit .env.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

cleanup_saved_items() {
  if [[ -f "$SAVED_ITEMS_PID_FILE" ]]; then
    local old
    old="$(cat "$SAVED_ITEMS_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${old:-}" ]] && kill -0 "$old" 2>/dev/null; then
      kill "$old" 2>/dev/null || true
      wait "$old" 2>/dev/null || true
    fi
    rm -f "$SAVED_ITEMS_PID_FILE"
  fi
}

# Stop Saved Items child when bridge exits / Ctrl-C
trap cleanup_saved_items EXIT INT TERM

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

if [[ ! -f .venv/bin/uvicorn ]]; then
  pip install -q --upgrade pip
  pip install -q -r requirements.txt
fi

# Ensure Sudachi dict present
python3 - <<'PY'
try:
    from sudachipy import Dictionary
    Dictionary().create()
    print("Sudachi OK")
except Exception as e:
    print("Sudachi warn:", e)
PY

# macOS IME helper for side-panel JA focus (POST /ime/switch) — no Native Messaging install
IME_BIN="$ROOT/bin/ime-select"
IME_SRC="$ROOT/../tools/ime-switch/ime_select.swift"
if [[ "$(uname -s)" == "Darwin" ]] && [[ -f "$IME_SRC" ]]; then
  if [[ ! -x "$IME_BIN" ]] || [[ "$IME_SRC" -nt "$IME_BIN" ]]; then
    mkdir -p "$ROOT/bin"
    if command -v swiftc >/dev/null 2>&1; then
      echo "Building ime-select → bin/ime-select"
      swiftc -O -o "$IME_BIN" "$IME_SRC" -framework Carbon -framework AppKit \
        || echo "ime-select build warn (JA IME via bridge disabled)"
      chmod +x "$IME_BIN" 2>/dev/null || true
      # Stable identifier so Accessibility grant survives rebuilds (ad-hoc sign).
      codesign --force --sign - --identifier com.ytcaption.ime-select "$IME_BIN" 2>/dev/null || true
    else
      echo "swiftc missing — skip ime-select (web lang=ja-JP only)"
    fi
  fi
fi

# Language Reactor–style Saved Items (localhost) — optional if node missing
start_saved_items() {
  if [[ "${SKIP_SAVED_ITEMS:-}" == "1" ]]; then
    echo "Skipping Saved Items (SKIP_SAVED_ITEMS=1)"
    return 0
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm not found — skip Saved Items UI (extension popup still works offline)"
    return 0
  fi
  if [[ ! -f "$SAVED_ITEMS/package.json" ]]; then
    echo "web/saved-items missing — skip"
    return 0
  fi
  cleanup_saved_items
  if [[ ! -d "$SAVED_ITEMS/node_modules" ]]; then
    echo "Installing web/saved-items dependencies…"
    (cd "$SAVED_ITEMS" && npm install) || {
      echo "npm install failed — skip Saved Items"
      return 0
    }
  fi
  echo "Starting Saved Items on http://127.0.0.1:${SAVED_ITEMS_PORT}"
  (
    cd "$SAVED_ITEMS"
    npm run dev -- --port "$SAVED_ITEMS_PORT"
  ) >>"$SAVED_ITEMS_LOG" 2>&1 &
  echo $! >"$SAVED_ITEMS_PID_FILE"
  echo "  → UI http://127.0.0.1:${SAVED_ITEMS_PORT}  (log: local-bridge/.saved-items.log)"
  echo "  → Extension popup: chrome-extension://<id>/popup/popup.html (static build)"
  echo "  → Sync: chrome.storage ↔ GET/POST http://127.0.0.1:8765/extension_state"
}

start_saved_items

export PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}"
echo "Starting bridge on http://127.0.0.1:8765"
exec python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --workers 1
