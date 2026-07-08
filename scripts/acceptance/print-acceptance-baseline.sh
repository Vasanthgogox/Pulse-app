#!/usr/bin/env bash
# Print reproducibility baseline for ACCEPTANCE_RECORD.md (copy into Acceptance Run section).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "Acceptance Run (baseline)"
echo "-------------------------"
echo "Date:              $(date -u +"%Y-%m-%d %H:%M UTC")"
echo "Git commit:        $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
echo "Git branch:        $(git branch --show-current 2>/dev/null || echo 'unknown')"
echo "Environment:       ${PULSE_ENV:-linked remote (supabase db query --linked)}"
echo "Commerce URL:      ${COMMERCE_URL:-/oms}"
echo "Core URL:          ${CORE_URL:-/}"
echo ""
echo "Database migration version (latest applied on linked):"
supabase migration list --linked 2>/dev/null | tail -5 || echo "  (run: supabase migration list --linked)"
echo ""
echo "Fill in manually after login:"
echo "Workspace:         "
echo "Organization ID:   "
echo "Organization name: "
echo "Tester:            "
