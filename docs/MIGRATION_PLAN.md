# Pulse TMS Migration Plan
## Separate Apps + Shared Logic (Monorepo)

> **Decision:** Option B — Vite (web) + React Native (mobile) with shared `/packages`
> **Rationale:** TMS has heavy tables, complex dispatcher UI — full RN Web would degrade UX.

---

## Target Folder Structure

```
pulse-monorepo/
├── apps/
│   ├── mobile/          ← current pulse repo (RN + Expo)
│   └── web/             ← new Vite + React app (dispatcher web UI)
├── packages/
│   ├── core/            ← Supabase client, services, business logic
│   ├── hooks/           ← TanStack Query hooks (shared)
│   └── ui/              ← shared primitive components (nativewind/tamagui)
└── package.json         ← pnpm/npm workspaces root
```

---

## Phase Breakdown

### Phase 1 — Stabilize & Audit (Week 1)
> Keep both apps running. No breakage.

- [ ] Audit current `features/` and identify logic that is pure JS (no RN imports)
- [ ] Audit `lib/queries/` — all TanStack Query hooks are portable
- [ ] List screens that are **dispatcher-only** (web candidates)
- [ ] List screens that are **driver-only** (stay mobile)
- [ ] Document Supabase tables used per feature

**Output:** Migration candidate list

---

### Phase 2 — Extract Shared Core (Week 2–3)
> Move APIs, services, and hooks into `/packages/core` and `/packages/hooks`

#### packages/core
Extract from `features/[domain]/services/`:
- Supabase client (`lib/supabase.ts`)
- All service files (trips, drivers, finance, network, auth)
- Query keys (`lib/queryKeys.ts`)
- Capabilities (`lib/capabilities.ts`)
- i18n strings (`locales/`)

#### packages/hooks
Extract from `lib/queries/`:
- All `use*Query.ts` hooks
- `useRealtimeInvalidation.ts`

**Rule:** No `react-native` imports allowed inside `/packages`. Pure TS only.

---

### Phase 3 — Build Vite Web App (Week 3–5)
> Scaffold the dispatcher web UI in `apps/web`

```bash
pnpm create vite apps/web --template react-ts
```

**Priority screen order:**
1. Auth (sign-in, sign-up)
2. Dashboard / overview
3. Trips list + detail
4. Drivers / Network
5. Finance
6. Forms (create trip, assign driver)

**Consume shared packages:**
```ts
import { getTrips } from '@q/core/trips'
import { useTripsQuery } from '@q/hooks/useTripsQuery'
```

**Keep in Vite only:**
- Heavy data tables (use TanStack Table)
- Complex forms with rich validation
- Reports / exports

---

### Phase 4 — Mobile App Cleanup (Week 4–5)
> Remove dispatcher-only screens from mobile if they belong in web only

- Driver tab group `app/(driver)/` — keep fully in mobile
- Dispatcher tabs — keep lightweight versions in mobile, full version in web
- Remove duplicated service files now living in `packages/core`
- Update all imports to use `@q/core` and `@q/hooks`

---

### Phase 5 — Shared UI Primitives (Week 5–6)
> Reuse where safe, don't force it

Only share components that work on both platforms:
- Buttons, badges, status indicators
- Simple cards
- Form inputs (text, select)

**Approach:** Use `nativewind` in mobile + plain Tailwind in Vite — same class names, different renderers.

**Do NOT share:**
- Tables → Vite only (TanStack Table)
- Complex modals → platform-specific
- Navigation components → platform-specific

---

### Phase 6 — Optimize & Unify (Week 6+)
> Performance and scalability

**Mobile:**
- Replace heavy lists with `FlashList`
- Memoize expensive renders
- Audit bundle size

**Web:**
- Code-split by route (React.lazy)
- Add loading skeletons
- Optimize Supabase query selection (no `select *`)

---

## Key Rules

| Rule | Detail |
|------|--------|
| No RN imports in `/packages` | Keeps core portable |
| Query keys from `@q/core/queryKeys` | Single source of truth |
| Navigation is never shared | Each app owns its router |
| Styles are never shared directly | nativewind (mobile) / Tailwind (web) |
| Supabase RLS stays as-is | No changes to DB layer |

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Circular deps in packages | Medium | Strict layer rules: core ← hooks ← apps |
| Auth token sharing between apps | Low | Each app manages its own `expo-secure-store` / `localStorage` |
| Supabase realtime on web | Low | Works natively in browser |
| i18n drift between apps | Medium | Single `locales/` in `@q/core` |
| Table UX on mobile | High | Keep tables in Vite only |

---

## Monorepo Setup (pnpm workspaces)

**Root `package.json`:**
```json
{
  "name": "pulse-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "mobile": "pnpm --filter mobile start",
    "web": "pnpm --filter web dev",
    "build:web": "pnpm --filter web build"
  }
}
```

**`packages/core/package.json`:**
```json
{
  "name": "@q/core",
  "main": "src/index.ts",
  "dependencies": {
    "@supabase/supabase-js": "*"
  }
}
```

---

## Migration Checklist

### Infra
- [ ] Init pnpm workspaces at root
- [ ] Move current repo to `apps/mobile`
- [ ] Scaffold `apps/web` (Vite + React + TanStack Query)
- [ ] Create `packages/core`, `packages/hooks`, `packages/ui`

### Core Package
- [ ] Move Supabase client
- [ ] Move all service files
- [ ] Move query keys
- [ ] Move capabilities
- [ ] Move i18n / locales
- [ ] Add `@q/core` as dependency in both apps

### Hooks Package
- [ ] Move all `use*Query` hooks
- [ ] Move `useRealtimeInvalidation`
- [ ] Add `@q/hooks` as dependency in both apps

### Web App
- [ ] Auth screens
- [ ] Dispatcher dashboard
- [ ] Trips CRUD
- [ ] Network / drivers
- [ ] Finance
- [ ] Realtime updates (Supabase channel in browser)

### Mobile Cleanup
- [ ] Remove service files now in `@q/core`
- [ ] Update all import paths
- [ ] Verify driver flows unchanged
- [ ] Run E2E tests

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-28 | Option B (separate apps) | TMS tables need full DOM — RN Web too limiting |
| 2026-04-28 | pnpm workspaces | Simpler than Turborepo for current team size |
| 2026-04-28 | nativewind for mobile styling | Matches Tailwind mental model for web devs |
