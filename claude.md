# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Domain context

**Q Mobile** is a logistics/fleet-finance platform for India. Users are unified dispatchers and fleet owners (`profiles.aggregated` / `profiles.asset`). The three non-negotiables are: **(1) cash tracking accuracy** (advances, expenses, settlements), **(2) trip-finance linkage**, **(3) payment status visibility**. When analysing product flows, assume intermittent connectivity, cash-based operations, and manual data entry.

---

## Commands

```bash
# Development
npm start                   # Expo Go (QR code, exp:// scheme)
npm run start:dev-client    # Dev build (custom scheme — needs device build installed)
npm run start:simulator     # iOS/Android simulator via localhost
npm run preview             # Tunnel + Expo Go (cross-network QR)
npm run web                 # Web dev server only

# Build
npm run build:web           # Production web export → dist/

# Quality
npm run lint                # ESLint on all .ts/.tsx/.js/.jsx
npx tsc --noEmit            # Type-check without emitting

# Tests
npm test                                                    # All Jest tests
npm test -- --testPathPattern=driverCompensation           # Single test file

# Database / backend
npm run db:push             # Push migrations to primary Supabase
npm run db:push-both        # Push to both DBs (primary + secondary)
npm run functions:deploy    # Deploy Supabase Edge Functions
npm run seed                # Seed test data via ts-node
```

`npm start` auto-loads `.env` via `dotenv/config` — no manual sourcing needed.

---

## Platform context

This project is **web-first** (see `.cursor/rules/web-only.mdc`). Always assume `Platform.OS === 'web'`. Do not add native-only modules unless they have `react-native-web` support. Consider hover states, keyboard navigation, and responsive layouts.

This app is the client of **Q-unified-base** — it shares the same Supabase project. **Do not add schema migrations here.** All schema changes go in Q-unified-base `supabase/migrations/`.

---

## Architecture

### Routing — Expo Router (file-based)

```
app/
  _layout.tsx            Root: QueryClientProvider, AuthContext, NetworkContext, DemoTabBar
  index.tsx              Auth gate → redirects to (tabs) or sign-in
  sign-in.tsx / sign-up.tsx
  (tabs)/                Tab navigator (Home, Finance, Trips, Resources, …)
  (driver)/              Separate driver-app navigator
  (modals)/              Sheet modals (add-driver, ledger-sync, add-vehicle, …)
  [entity]/[id].tsx      Detail pages (trip, driver, vehicle, client, supplier, indent)
```

Route files are thin — they compose feature components and pass IDs. No business logic in `app/`.

### Feature modules (`features/<domain>/`)

```
features/<domain>/
  index.ts          Barrel export — the public API of the feature
  services/         Supabase calls; one file per bounded context
  components/       UI specific to this feature
  hooks/            Custom React hooks
  utils/            Pure helpers
  types.ts          Types owned by this feature
```

Active features: `ai`, `auth`, `clients`, `drivers`, `finance`, `indents`, `invoicing`, `log-pods`, `network`, `ops-agent`, `organization`, `pod-reconciliation`, `ratings`, `suppliers`, `trips`, `vehicles`.

Always import from the barrel (`@/features/drivers`), not deep paths, unless the export is not re-exported.

### Shared infrastructure

| Path | Purpose |
|---|---|
| `lib/supabase.ts` | Single Supabase client. SecureStore on native, AsyncStorage fallback on web. Includes 25 s timeout + 1 retry. |
| `lib/capabilities.ts` | Capability-based access control — mirrors Q-unified-base. Gate all UI here. |
| `lib/format.ts` | Shared formatters: INR, dates, vehicle numbers. |
| `lib/queries/` | TanStack Query hooks for cross-feature data fetching. |
| `constants/Theme.ts` | **All colors.** Never hardcode hex/rgba. Add new keys here when needed. |
| `constants/Layout.ts` | Spacing constants (`screenPaddingHorizontal`, `fabBottomOffset`, `fabSize`). |
| `contexts/` | `AuthContext`, `OrganizationContext`, `NetworkContext`, `LanguageContext`, `WalletContext`, `ThemeContext`, `DriverAvatarContext`. |
| `services/` | Thin re-export façade that delegates to feature services. Add no logic here. |
| `locales/*.json` | i18n strings for 21 languages. All user-visible strings go through `useLanguage()` → `t('key')`. |

**State layers:** TanStack Query for server state · React Context for app state · AsyncStorage for persistence · Supabase real-time for live updates (driver locations, trip status, ledger).

---

## Critical patterns

### Colors and layout

```ts
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
// ✓  backgroundColor: Theme.screenBackground, paddingHorizontal: Layout.screenPaddingHorizontal
// ✗  backgroundColor: '#f5f5f5', paddingTop: 48
```

### Capability checks

```ts
import { getCapabilitiesFromProfile, canAccessFinance } from '@/lib/capabilities';
const capabilities = getCapabilitiesFromProfile(
  profile ? { role: profile.role, aggregated: profile.aggregated, asset: profile.asset } : null
);
if (canAccessFinance(capabilities)) { … }
```

`profiles.aggregated` / `profiles.asset` are the unified dispatcher/fleet-owner flags — do not model them as separate roles.

### Safe area — every screen

```ts
const insets = useSafeAreaInsets();
// Header:           paddingTop: insets.top + 16
// ScrollView bottom: paddingBottom: insets.bottom + Layout.fabBottomOffset
// FAB:              bottom: Layout.fabBottomOffset + insets.bottom
```

Prefer layout helpers that handle this automatically:
- **List screens:** `ListScreenLayout` (`@/components/ListScreenLayout`)
- **Full-screen loading:** `CenteredLoadingView` (`@/components/CenteredLoadingView`) — never a bare `ActivityIndicator`
- **FABs:** `FinanceFAB` / `FAB` (`@/components/`)
- **Table columns:** always `flex` + `minWidth: 0`, never fixed `width:` values — fixed widths collapse on small screens

### Double-entry accounting model

The finance module uses a logical double-entry model over `shared_ledger_entries`. Every row maps to a debit/credit pair:

| Transaction | Dr | Cr |
|---|---|---|
| Cash IN from client | Cash/Bank | AR |
| Cash OUT to supplier | AP | Cash/Bank |
| Cash OUT to driver | Driver Payable | Cash/Bank |
| Vehicle expense (fuel/toll) | Vehicle Expense | Cash/Bank |

**Balances are computed from transaction history — never stored.** Use `features/finance/accounting/accountingModel.ts` to interpret debit/credit direction. Do not modify the Finance tab layout; extend data flow only.

### Service layer rules

One service file per bounded context. `tripsService.ts` owns trips only — no cross-domain mashups. Services call `lib/supabase.ts` directly; no fetch wrappers.

---

## Environment

```bash
cp .env.example .env
# EXPO_PUBLIC_SUPABASE_URL      — same as Q-unified-base VITE_SUPABASE_URL
# EXPO_PUBLIC_SUPABASE_ANON_KEY — same as Q-unified-base VITE_SUPABASE_ANON_KEY
```

For local Supabase / device testing: `.env.local.example` has Android emulator (`10.0.2.2`) and iOS simulator (Mac LAN IP) configs.

---

## Hard constraints

- **No schema migrations in this repo** — schema lives in Q-unified-base.
- **No `service_role` key in app code** — RLS enforces all access.
- **`@/` alias** maps to repo root — no `../../` traversal.
- **`expo-env.d.ts`** is Expo-generated — do not edit or commit.
- **`patches/`** is consumed by `patch-package` on `postinstall` — do not remove.
