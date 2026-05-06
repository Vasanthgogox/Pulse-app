# CLAUDE.md

@CONTEXT_INDEX.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                  # Expo Go (device)
npm run start:simulator    # iOS simulator (localhost)
npm run start:dev-client   # Dev client (native modules)
npm run web                # Web dev
npm run build              # Production build
npm run lint               # ESLint
npm test                   # Jest
npm run test:e2e           # Detox E2E (iOS)
npm run db:push            # Supabase DB push
npm run functions:deploy   # Deploy Edge Functions
npm run seed               # Seed test data
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

### UI Conventions

- Shared components: `components/` (not feature-specific)
- Theme: `constants/Theme.ts` — always use theme tokens, not raw colors
- Lists: `@shopify/flash-list` for performance-critical lists
- `lib/i18n.ts` + `locales/` — all user-facing strings go through i18n

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
| DB schema change | `migrations/` + `npm run db:push` |
