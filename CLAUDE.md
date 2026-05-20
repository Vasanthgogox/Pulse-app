# CLAUDE.md

@CONTEXT_INDEX.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                  # Expo Go (device)
npm run start:simulator    # iOS simulator (localhost)
npm run start:dev-client   # Dev client (native modules)
npm run web                # Web dev (port 8081)
npm run build              # Production build (native)
npm run build:web          # Web export (Expo static)
npm run lint               # ESLint
npm test                   # Jest (all)
npm test -- --testPathPattern=<file>  # Run a single Jest test file
npm run test:e2e           # Detox E2E (iOS)
npm run test:web           # Playwright E2E (headless, requires web dev server)
npm run test:web:ui        # Playwright E2E with UI
npm run db:push            # Supabase DB push (primary project)
npm run db:push-both       # Push to both Supabase projects
npm run functions:deploy   # Deploy Edge Functions (primary)
npm run functions:deploy-both  # Deploy to both projects
npm run seed               # Seed test data
npm run start:tunnel       # Expo tunnel mode (remote device testing)
```

## Architecture

**Stack:** React Native 0.81 + Expo SDK 54 + Expo Router 6 (file-based routing) + TanStack Query v5 + Supabase

### Routing & Layouts

`app/` is the Expo Router root. File path = route path.

- `app/index.tsx` — root auth guard; routes to `/(tabs)` (dispatcher) or `/(driver)` (driver) based on `useAuth().roleVerified`
- `app/_layout.tsx` — app shell: wraps all providers + ErrorBoundary + theme
- `app/(tabs)/` — dispatcher tab group (Finance, Trips, Network, Profile)
- `app/(driver)/` — driver tab group
- `app/(modals)/` — modal screens
- `app/auth/` — sign-in, sign-up
- `lib/routes.ts` — all route strings live here; never hardcode paths

### Feature Modules

Business logic is split by domain under `features/[domain]/`:

```
features/[domain]/
├── services/     # Supabase calls + business logic
├── components/   # Feature-scoped UI
├── hooks/        # Feature-scoped hooks
└── utils/        # Helpers
```

`services/` at the top level re-exports from `features/` — prefer importing from `@/features/[domain]/services/` directly.

### Data Flow

Screen → Query Hook → Service → Supabase

```
app/(tabs)/trips.tsx
  → useTripsQuery(orgId)          # lib/queries/
  → getTripsByOrganization()      # features/trips/services/trips.service.ts
  → supabase().from('trips')      # lib/supabase.ts
```

- All query hooks live in `lib/queries/`
- Query keys are defined in `lib/queryKeys.ts` — always use the factory, never raw strings
- Realtime invalidation: `lib/queries/useRealtimeInvalidation.ts` subscribes to Postgres changes and invalidates the relevant query key

### State Management

- **TanStack Query** — all server state; stale time 60s, GC 5min, 1 retry
- **React Context** — global UI state only: `AuthContext`, `OrganizationContext`, `LanguageContext`, `NetworkContext`, `WalletContext`
- No Redux or Zustand

### Auth

- `contexts/AuthContext.tsx` exposes `useAuth()` → `{ user, profile, roleVerified, ... }`
- `roleVerified` is server-confirmed role — gates routing in `app/index.tsx`
- Storage: `expo-secure-store` on device (2KB limit), `AsyncStorage` fallback for web/Expo Go
- Auth service: `features/auth/services/auth.service.ts`

### Access Control

- `lib/capabilities.ts` — capability-based feature flags aligned with Q-unified-base
- Roles: `driver` | `user` (dispatcher/admin)
- Operating models: `ASSET_BASED` | `NON_ASSET` | `HYBRID`
- Feature visibility tied to capabilities, not hardcoded role checks

### Supabase

- Client: `lib/supabase.ts` (detects platform → picks storage adapter)
- RLS enforced at DB level — no `service_role` key in app
- Fetch wrapper: 25s timeout, 1 retry on network error
- Env vars loaded via `app.config.js` from `.env` (see `.env.example`)
- Edge Functions: `supabase/functions/ops-agent-chat/` (Gemini AI), `supabase/functions/check-user-by-phone/`
- 212 migrations in `supabase/migrations/` — always add incremental files, never edit existing ones

**Required env vars** (all `EXPO_PUBLIC_` prefix except local DB strings):
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MAPBOX_TOKEN`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_MAPS_ANDROID_KEY`, `GEMINI_API_KEY`, `ROUTE_PROXY_URL`, `WEB_BASE_URL`

### UI Conventions

- Shared components: `components/` (not feature-specific)
- Theme: `constants/Theme.ts` — always use theme tokens, not raw colors
- Lists: `@shopify/flash-list` for performance-critical lists
- `lib/i18n.ts` + `locales/` — all user-facing strings go through i18n
- Platform splits: map and PDF components use `.native.tsx` / `.web.tsx` file variants — changes must be verified on both platforms

### ESLint Rules

Custom rules enforce naming conventions inside `features/`:
- Service files must be named `*.service.ts`
- Utility files must be named `*.util.ts`

### Playwright E2E

Tests in `tests/e2e/`, POM pattern in `tests/`, fixtures in `tests/fixtures/`. Runs against the Expo web dev server on port 8081 — start `npm run web` before running Playwright tests. Config: `playwright.config.ts`.

### Path Alias

`@/*` maps to repo root (tsconfig). Use `@/features/...`, `@/lib/...`, `@/components/...`.

## Change Guide

| What | Where |
|------|-------|
| New API call | `features/[domain]/services/` |
| New screen | `app/[path].tsx` + add route to `lib/routes.ts` |
| New query hook | `lib/queries/use[X]Query.ts` + key in `lib/queryKeys.ts` |
| Shared UI component | `components/` |
| Feature-specific component | `features/[domain]/components/` |
| Theme/colors | `constants/Theme.ts` |
| Access control rule | `lib/capabilities.ts` |
| DB schema change | `supabase/migrations/` (new file) + `npm run db:push` |
| Edge Function change | `supabase/functions/[name]/` + `npm run functions:deploy` |
