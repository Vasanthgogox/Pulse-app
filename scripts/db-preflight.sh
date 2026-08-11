#!/usr/bin/env bash
# Preflight before `supabase db push --linked`.
#
# Hard-fails when a Local-only (not yet on Remote) migration file is empty or
# whitespace-only — the failure mode that previously marked versions applied
# with no SQL (owner_vehicles / capacity Story).
#
# Also prints linked Local|Remote sync for inspection, and warns about empty
# files that are already applied (historical MCP placeholders, etc.).
#
# Usage: npm run db:preflight
# Agents MUST run this successfully before any remote migration push.
# Compatible with macOS Bash 3.2 (no mapfile).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MIG_DIR="supabase/migrations"
if [[ ! -d "$MIG_DIR" ]]; then
  echo "ERROR: $MIG_DIR not found" >&2
  exit 1
fi

is_empty_sql() {
  local f="$1"
  [[ ! -s "$f" ]] || [[ -z "$(tr -d '[:space:]' <"$f")" ]]
}

echo "── Linked migration list (inspect Local vs Remote before push) ──"
list_out="$(supabase migration list --linked 2>&1)" || {
  echo "$list_out" >&2
  echo "ERROR: could not list linked migrations. Fix link/auth, then re-run." >&2
  exit 1
}
printf '%s\n' "$list_out"
echo

# Rows look like: "   20270210143000 |                | 2027-02-10 14:30:00 "
# Local-only = version in col1, remote blank.
pending_versions=""
while IFS= read -r ver; do
  [[ -n "$ver" ]] || continue
  pending_versions="${pending_versions}${ver}"$'\n'
done < <(
  printf '%s\n' "$list_out" | awk -F'|' '
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      if ($1 ~ /^[0-9]{14}$/ && $2 == "") print $1
    }
  '
)

pending_empty=""
pending_count=0
pending_ok=0

while IFS= read -r ver; do
  [[ -n "$ver" ]] || continue
  pending_count=$((pending_count + 1))
  # shellcheck disable=SC2086
  matches=$(find "$MIG_DIR" -maxdepth 1 -type f -name "${ver}_*.sql" | sort)
  if [[ -z "$matches" ]]; then
    echo "ERROR: pending version $ver has no local file under $MIG_DIR" >&2
    exit 1
  fi
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    if is_empty_sql "$f"; then
      pending_empty="${pending_empty}${f}"$'\n'
    else
      pending_ok=$((pending_ok + 1))
      bytes=$(wc -c <"$f" | tr -d ' ')
      echo "OK pending: $f ($bytes bytes)"
    fi
  done <<<"$matches"
done <<<"$pending_versions"

if [[ -n "$(printf '%s' "$pending_empty" | tr -d '[:space:]')" ]]; then
  echo >&2
  echo "ERROR: empty Local-only migration(s) — refuse push until restored:" >&2
  printf '%s' "$pending_empty" | while IFS= read -r f; do
    [[ -n "$f" ]] && echo "  - $f" >&2
  done
  echo >&2
  echo "Empty file + push/repair can mark the version applied with no SQL." >&2
  exit 1
fi

# Warn on empty already-synced files (do not block — history includes mcp_applied placeholders).
warn_count=0
while IFS= read -r f; do
  [[ -n "$f" ]] || continue
  base="$(basename "$f")"
  ver="${base%%_*}"
  [[ "$ver" =~ ^[0-9]{14}$ ]] || continue
  if printf '%s' "$pending_versions" | grep -qx "$ver"; then
    continue
  fi
  if is_empty_sql "$f"; then
    warn_count=$((warn_count + 1))
  fi
done < <(find "$MIG_DIR" -maxdepth 1 -type f -name '*.sql' | sort)

if ((warn_count > 0)); then
  echo "WARN: $warn_count already-applied migration file(s) are empty (placeholders / historical)."
  echo "      Do not copy this pattern for new work. New empty Local-only files hard-fail."
fi

if ((pending_count == 0)); then
  echo "OK: no Local-only migrations pending push."
else
  echo "OK: $pending_count pending version(s), all non-empty ($pending_ok file(s))."
fi

echo
echo "Preflight passed. Next: npm run db:push (or supabase db push --linked)."
