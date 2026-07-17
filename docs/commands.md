# Commands

## Dev
```bash
npm run web              # Web dev server (port 8081) — required before Playwright tests
npm run dev              # Pulse web + Commerce (OMS :3004, proxied at /oms)
npm run oms:dev          # Commerce only → http://127.0.0.1:3004/oms/
npm run audit            # DB Audit UI → http://localhost:4040
npm start                # Expo Go (device)
npm run start:simulator  # iOS simulator
npm run start:dev-client # Dev client (native modules)
npm run start:tunnel     # Tunnel mode (remote device)
```

Full localhost / port map: [DEV_URLS.md](./DEV_URLS.md).

## Build
```bash
npm run build            # Production native build
npm run build:web        # Web export (Expo static)
```

## Database
```bash
npm run db:push          # Push migrations to primary Supabase project
npm run db:push-both     # Push to both Supabase projects
npm run seed             # Seed test data
```

## Edge Functions
```bash
npm run functions:deploy       # Deploy to primary project
npm run functions:deploy-both  # Deploy to both projects
```

## Quality
```bash
npm run lint             # ESLint
npm test                 # Jest (all)
npm test -- --testPathPattern=<file>  # Single test file
npm run test:e2e         # Detox E2E (iOS)
npm run test:web         # Playwright E2E (headless) — requires web dev server
npm run test:web:ui      # Playwright E2E with UI
./scripts/validate-pilot-env.sh          # Phase 1 required env vars
./scripts/pre-release-security-check.sh  # Audit + env example secret scan
```

Phase 1 pilot manual smoke: [PHASE1_PILOT_SMOKE.md](./PHASE1_PILOT_SMOKE.md)

## Troubleshooting
```bash
# Clear Metro cache
npx expo start --clear

# Check TypeScript errors
npx tsc --noEmit

# Check which queries are firing (browser)
# Open React Query Devtools in web dev mode

# Supabase local status
npx supabase status

# View migration list
npx supabase migration list
```
