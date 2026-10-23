#!/usr/bin/env bash
# One command for every gate this repo expects before a commit.
#
# Each gate prints PASS/FAIL/SKIP and the summary says how many of each ran, so a
# green run is reproducible by hand instead of assembled from memory.
#
# Exit-code contract for a gate: 0 = passed, 77 = skipped (tool not installed),
# anything else = failed. The runner exits 1 if any gate failed.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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
      printf 'PASS  %s\n' "$label"
      pass=$((pass + 1))
      ;;
    77)
      printf 'SKIP  %s\n' "$label"
      skip=$((skip + 1))
      ;;
    *)
      printf 'FAIL  %s (exit %s)\n' "$label" "$code"
      printf '%s\n' "$out" | tail -20
      fail=$((fail + 1))
      failed+=("$label")
      ;;
  esac
}

extension_suites() {
  local f
  for f in extension/shared/*_test.js \
           extension/offscreen/audio_capture_test.js \
           extension/sidepanel/sidepanel_pure_test.js \
           extension/background/service_worker_test.js \
           extension/content/content_test.js; do
    node "$f" >/dev/null || { echo "failed: $f"; return 1; }
  done
}

run "extension suites" extension_suites
run "anti-fake gate" node scripts/verify_no_fake_tests.js
run "popup assets" node scripts/verify_extension_popup.js
run "freq_ja parity" node scripts/verify_freq_ja_parity.js
run "sanity suite" bash scripts/run_sanity_suite.sh
run "wiki lint" bash scripts/wiki_sync_and_lint.sh
# Real Chrome over CDP: the popup must hydrate and keep its accessible names.
run "browser self-test" node scripts/browser_probe.js --self-test

# The bridge suite needs its venv; the Swift store smoke needs macOS + swiftc.
if [ -x "$ROOT/local-bridge/.venv/bin/python" ]; then
  run "bridge tests" bash -c 'cd local-bridge && ./.venv/bin/python -m pytest -q tests/'
else
  skip=$((skip + 1))
  printf 'SKIP  bridge tests (no local-bridge/.venv)\n'
fi

if [ "$(uname -s)" = "Darwin" ] && command -v swiftc >/dev/null 2>&1; then
  run "swift store smoke (iPad)" bash scripts/swift_store_smoke.sh ipad-app
  run "swift store smoke (iPhone)" bash scripts/swift_store_smoke.sh iphone-app
else
  skip=$((skip + 2))
  printf 'SKIP  swift store smoke (macOS + swiftc only)\n'
fi

# The Saved Items web app has its own typecheck; only when deps are installed.
if [ -d "$ROOT/web/saved-items/node_modules" ]; then
  run "web typecheck" bash -c 'cd web/saved-items && npx tsc --noEmit'
  run "web tests" bash -c 'cd web/saved-items && npm test --silent'
else
  skip=$((skip + 2))
  printf 'SKIP  web typecheck + tests (no web/saved-items/node_modules)\n'
fi

echo
echo "gates: $pass passed, $skip skipped, $fail failed"
if [ "$fail" -gt 0 ]; then
  printf 'failed: %s\n' "${failed[@]}"
  exit 1
fi
exit 0
