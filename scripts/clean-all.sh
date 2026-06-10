#!/usr/bin/env bash
# Deep-clean local Expo/Metro state. Safe to run anytime dev feels slow or stale.
# Usage: npm run clean:all
#        npm run clean:all -- --modules   # also reinstall node_modules
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WITH_MODULES=false
for arg in "$@"; do
  case "$arg" in
    --modules) WITH_MODULES=true ;;
  esac
done

echo "==> Stopping Metro / Expo listeners"
node scripts/kill-metro-ports.js

if command -v watchman >/dev/null 2>&1; then
  echo "==> Flushing Watchman"
  watchman watch-del-all 2>/dev/null || true
  watchman shutdown-server 2>/dev/null || true
else
  echo "==> Watchman not installed (optional; brew install watchman)"
fi

echo "==> Clearing Metro / Expo caches"
node scripts/clear-metro-cache.js

DIRS=(
  ".expo"
  ".expo-shared"
  "node_modules/.cache"
  "node_modules/.cache/metro"
  ".turbo"
  "web-build"
  "dist-test-bundle"
)

for dir in "${DIRS[@]}"; do
  if [[ -e "$dir" ]]; then
    rm -rf "$dir"
    echo "[clean-all] removed $dir"
  fi
done

# Legacy / alternate Metro tmp locations
if [[ -n "${TMPDIR:-}" ]]; then
  rm -rf "${TMPDIR}/pulse-metro-cache" "${TMPDIR}/metro-"* 2>/dev/null || true
fi
rm -rf "${TMPDIR:-/tmp}/metro-cache" 2>/dev/null || true

if [[ "$WITH_MODULES" == true ]]; then
  echo "==> Reinstalling node_modules (this takes a few minutes)"
  rm -rf node_modules
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

echo ""
echo "Done. Start fresh with:"
echo "  npm run dev:clean"
echo "  # or: npm run start:clean"
