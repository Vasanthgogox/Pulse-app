#!/usr/bin/env bash
# Creates .env.local so the app uses local Supabase at your Mac's IP (for device/emulator).
# Run from repo root. Then: npx supabase status → paste anon key into .env.local → npx expo start
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
if [ -z "$IP" ]; then
  echo "Could not get Mac IP. Create .env.local manually with EXPO_PUBLIC_SUPABASE_URL=http://YOUR_IP:54321"
  exit 1
fi
echo "EXPO_PUBLIC_SUPABASE_URL=http://$IP:54321" > .env.local
echo "EXPO_PUBLIC_SUPABASE_ANON_KEY=" >> .env.local
echo "Created .env.local with EXPO_PUBLIC_SUPABASE_URL=http://$IP:54321"
echo ""
echo "Next: run  npx supabase status  and paste the 'anon key' into .env.local (EXPO_PUBLIC_SUPABASE_ANON_KEY=...)"
echo "Then:  npx expo start"
