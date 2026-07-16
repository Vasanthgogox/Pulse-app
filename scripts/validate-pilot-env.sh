#!/bin/bash
# Validate pilot/production env vars before a Phase 1 cut.
# Loads .env / .env.local from the repo root when present (does not print values).
# Exit 0 when all required vars are set; exit 1 otherwise.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Soft-load dotenv files without exporting secrets to the console.
load_env_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local val="${BASH_REMATCH[2]}"
      val="${val%\"}"
      val="${val#\"}"
      val="${val%\'}"
      val="${val#\'}"
      if [ -z "${!key:-}" ]; then
        export "$key=$val"
      fi
    fi
  done < "$file"
}

load_env_file ".env"
load_env_file ".env.local"

REQUIRED=(
  EXPO_PUBLIC_SUPABASE_URL
  EXPO_PUBLIC_SUPABASE_ANON_KEY
  EXPO_PUBLIC_WEB_BASE_URL
  EXPO_PUBLIC_MAPBOX_TOKEN
)

# Crash reporting: required for pilot observability (app no-ops without it).
RECOMMENDED=(
  EXPO_PUBLIC_SENTRY_DSN
)

# Native Android pilot only.
OPTIONAL=(
  EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY
  EXPO_PUBLIC_GEMINI_API_KEY
  EXPO_PUBLIC_ROUTE_PROXY_URL
)

missing=0
warn=0

echo "Pilot env validation"
echo "--------------------"

for key in "${REQUIRED[@]}"; do
  val="${!key:-}"
  if [ -z "$val" ] || [[ "$val" == your-* ]] || [[ "$val" == https://your-* ]]; then
    echo "FAIL  $key (required, unset or placeholder)"
    missing=1
  else
    echo "OK    $key"
  fi
done

for key in "${RECOMMENDED[@]}"; do
  val="${!key:-}"
  if [ -z "$val" ]; then
    echo "WARN  $key (recommended for pilot — crash reporter no-ops without it)"
    warn=1
  else
    echo "OK    $key"
  fi
done

for key in "${OPTIONAL[@]}"; do
  val="${!key:-}"
  if [ -z "$val" ]; then
    echo "SKIP  $key (optional)"
  else
    echo "OK    $key"
  fi
done

echo "--------------------"
if [ "$missing" -eq 1 ]; then
  echo "Result: FAIL — set required vars in .env or hosting secrets (see .env.example)"
  exit 1
fi
if [ "$warn" -eq 1 ]; then
  echo "Result: PASS with warnings — set recommended vars before pilot cut"
  exit 0
fi
echo "Result: PASS"
exit 0
