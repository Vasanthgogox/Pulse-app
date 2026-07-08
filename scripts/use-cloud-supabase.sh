#!/usr/bin/env bash
# Removes .env.local so the app falls back to .env (hosted/cloud Supabase).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env.local ]; then
  rm .env.local
  echo "Removed .env.local -> app now uses .env (cloud Supabase)"
else
  echo "No .env.local found -> already using .env (cloud Supabase)"
fi
echo "Restart your dev server: npm run web"
