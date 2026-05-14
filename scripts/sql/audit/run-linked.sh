#!/usr/bin/env bash
# Run read-only catalog audit against the Supabase project linked via CLI.
# Writes one timestamped text file for diffing / archival (historical evidence).
#
# Usage (from repo root):
#   npm run db:audit
#   bash scripts/sql/audit/run-linked.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT"

OUT_DIR="$SCRIPT_DIR/output"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/audit-linked-${STAMP}.txt"

{
  echo "q-web catalog audit (linked Supabase)"
  echo "captured_utc: ${STAMP}"
  echo "repo_root: ${ROOT}"
  echo "supabase: $(command -v supabase || echo 'supabase not in PATH')"
  echo ""
} >"$OUT_FILE"

FILES=(
  00_env.sql
  01_extensions.sql
  02_schema_inventory.sql
  03_publications.sql
  04_triggers.sql
  05_functions_security.sql
  06_rls.sql
  07_indexes.sql
  08_table_activity.sql
  09_replication.sql
  10_lineage_samples.sql
)

for name in "${FILES[@]}"; do
  f="$SCRIPT_DIR/$name"
  {
    echo ""
    echo "================================================================================"
    echo "FILE: scripts/sql/audit/$name"
    echo "================================================================================"
  } >>"$OUT_FILE"
  if ! supabase db query --linked -f "$f" -o table >>"$OUT_FILE" 2>&1; then
    echo "[db:audit] ERROR running $name — see $OUT_FILE" >&2
    exit 1
  fi
done

echo "[db:audit] wrote $OUT_FILE"
exit 0
