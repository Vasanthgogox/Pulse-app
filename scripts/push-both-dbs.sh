#!/usr/bin/env bash
# Push migrations and deploy edge functions to both Supabase projects.
#
# Requires: Supabase CLI installed and logged in (npx supabase login).
# Projects: 1.mhedvagyuplkbrfaoctl  2.nafxpivddesgsrthmosv
#
# Usage: npm run db:push-both
# After running, the repo is linked to the second project (nafxpivddesgsrthmosv).

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_1="mhedvagyuplkbrfaoctl"
PROJECT_2="nafxpivddesgsrthmosv"

deploy_project() {
  local ref="$1"
  echo "=============================================="
  echo "  Project: $ref"
  echo "=============================================="
  supabase link --project-ref "$ref"
  echo "  Pushing migrations..."
  if supabase db push; then
    echo "  Migrations pushed."
  else
    echo "  WARNING: db push failed (e.g. migration history mismatch). Deploying functions anyway."
    echo "  To apply new migrations manually, run the SQL in supabase/migrations/ in the SQL Editor."
  fi
  echo "  Deploying edge functions..."
  supabase functions deploy
  echo "  Done: $ref"
  echo ""
}

deploy_project "$PROJECT_1"
deploy_project "$PROJECT_2"

echo "Both projects updated: $PROJECT_1, $PROJECT_2"
