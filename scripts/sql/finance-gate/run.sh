#!/usr/bin/env bash
# Finance Acceptance Gate v1 — Phase 1 (Ledger Integrity) read-only checks,
# run against the Supabase project linked via CLI. Every query is a SELECT;
# nothing here writes to the database.
#
# Usage (from repo root):
#   bash scripts/sql/finance-gate/run.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT"

OUT_DIR="$SCRIPT_DIR/output"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/finance-gate-phase1-${STAMP}.txt"

{
  echo "pulse finance acceptance gate — phase 1 (ledger integrity), read-only"
  echo "captured_utc: ${STAMP}"
  echo "repo_root: ${ROOT}"
  echo ""
} >"$OUT_FILE"

FILES=(
  01_orphan_ledger_rows.sql
  02_duplicate_postings.sql
  03_negative_balances.sql
  04_debit_credit_consistency.sql
)

for name in "${FILES[@]}"; do
  f="$SCRIPT_DIR/$name"
  {
    echo ""
    echo "================================================================================"
    echo "FILE: scripts/sql/finance-gate/$name"
    echo "================================================================================"
  } >>"$OUT_FILE"
  if ! supabase db query --linked -f "$f" -o table >>"$OUT_FILE" 2>&1; then
    echo "[finance-gate] ERROR running $name — see $OUT_FILE" >&2
    exit 1
  fi
done

echo "[finance-gate] wrote $OUT_FILE"
exit 0
