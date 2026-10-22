#!/usr/bin/env bash
# Runs every repo sanity script and reports pass / skip / fail honestly.
#
# Exit-code contract for a sanity script:
#   0  = passed
#   77 = skipped (needs an external input, a live bridge, or an optional browser dep)
#   *  = failed
#
# A skip is not a pass: the summary prints the skipped ones so CI shows what did
# not run instead of counting it as green.
#
# Usage: scripts/run_sanity_suite.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The Python sanity scripts import the bridge package (fastapi, uvicorn).
PY=python3
if [ -x "$ROOT/local-bridge/.venv/bin/python" ]; then
  PY="$ROOT/local-bridge/.venv/bin/python"
fi

pass=0
skip=0
fail=0
failed=()

run() {
  local label="$1"
  shift
  local out code
  out=$("$@" 2>&1)
  code=$?
  case "$code" in
    0)
      printf 'PASS %s\n' "$label"
      pass=$((pass + 1))
      ;;
    77)
      printf 'SKIP %s\n' "$label"
      skip=$((skip + 1))
      ;;
    *)
      printf 'FAIL %s (exit %s)\n' "$label" "$code"
      printf '%s\n' "$out" | tail -15
      fail=$((fail + 1))
      failed+=("$label")
      ;;
  esac
}

for f in scripts/*sanity*.js scripts/*sanity*.cjs; do
  [ -f "$f" ] || continue
  run "node $f" node "$f"
done

for f in scripts/*sanity*.py; do
  [ -f "$f" ] || continue
  run "python $f" "$PY" "$f"
done

echo
echo "sanity suite: $pass passed, $skip skipped, $fail failed"
if [ "$fail" -gt 0 ]; then
  printf 'failed: %s\n' "${failed[@]}"
  exit 1
fi
exit 0
