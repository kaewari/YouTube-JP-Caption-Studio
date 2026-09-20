#!/bin/bash
set -euo pipefail

# Wiki Sync & Lint Script
# Enforces Karpathy LLM-wiki pattern, verifies file links, catalogs, and append-only log.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== LINTING WIKI INTEGRITY ==="

ERRORS=0

# 1. Verify wiki/index.md links
while read -r link; do
  clean_link="${link%%#*}"
  [[ -z "$clean_link" ]] && continue
  target="$ROOT_DIR/wiki/$clean_link"
  if [[ ! -e "$target" ]]; then
    echo "ERROR: Broken link in wiki/index.md -> $link"
    ERRORS=$((ERRORS + 1))
  fi
done < <(grep -oE '\[[^]]+\]\([^)]+\)' wiki/index.md | grep -v 'http' | sed -E 's/.*\(([^)]+)\).*/\1/' || true)

# 2. Check for uncataloged files in plan/ and review/
for p in plan/*.md; do
  [[ -e "$p" ]] || continue
  base="$(basename "$p")"
  if ! grep -qF "$base" wiki/index.md; then
    echo "WARNING: Plan not listed in wiki/index.md: $base"
  fi
done

for r in review/*.md; do
  [[ -e "$r" ]] || continue
  base="$(basename "$r")"
  if ! grep -qF "$base" wiki/index.md; then
    echo "WARNING: Review not listed in wiki/index.md: $base"
  fi
done

# 3. Check format of wiki/log.md
BAD_ENTRIES=$(grep -vE '^## \[[0-9]{4}-[0-9]{2}-[0-9]{2}\] (ingest|query|lint|cleanup) \|' <(grep '^## \[' wiki/log.md) || true)
if [[ -n "$BAD_ENTRIES" ]]; then
  echo "WARNING: Malformed log entry in wiki/log.md:"
  echo "$BAD_ENTRIES"
fi

if [[ $ERRORS -eq 0 ]]; then
  echo ">>> Wiki Lint PASSED with 0 broken links."
  exit 0
else
  echo ">>> Wiki Lint FAILED with $ERRORS error(s)."
  exit 1
fi
