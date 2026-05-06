# Q-Web Context Index
> Compressed codebase reference for AI systems. Generated 2026-05-06.

---

## 1. PROJECT OVERVIEW

**Q** is a multi-tenant logistics SaaS platform for Indian freight operations. Dispatchers manage trips, clients, suppliers, drivers, vehicles, and finances. Drivers get a separate app for trip control, chat, documents, and wallet. Includes a marketplace (load board/indents) and social network layer.

- **Domain:** Logistics / freight dispatch / fleet management
- **Stack:** React Native 0.81 + Expo SDK 54 + Expo Router 6 (file-based routing) · TypeScript 5.9 · TanStack Query v5 · Supabase (Postgres + Auth + Realtime + Storage) · Gemini AI (ops agent)
- **Targets:** iOS, Android, Web (single codebase)

---

## 2. ARCHITECTURE

**Pattern:** Modular monolith (feature-driven). Single Expo app, feature modules under `features/[domain]/`.

**Data Flow:**
```
Screen → useXQuery (lib/queries/) → XService (features/domain/services/) → supabase() → Postgres/RLS
                                                       ↑
                          Realtime: Postgres CDC → useRealtimeInvalidation → queryClient.invalidate
```

**Key Modules:**

| Module | Responsibility |
|--------|---------------|
| `app/` | Expo Router file-based routes (screens, layouts, guards) |
| `features/[domain]/` | Domain logic: services, components, hooks, utils |
| `lib/queries/` | TanStack Query hooks (data fetching layer) |
| `lib/queryKeys.ts` | Cache key factory (never raw strings) |
| `lib/supabase.ts` | Supabase client singleton (platform-aware storage, timeout+retry) |
| `lib/routes.ts` | Centralized route constants |
| `lib/capabilities.ts` | Capability-based access control |
| `contexts/` | Global React Contexts: Auth, Org, Language, Network, Wallet |
| `components/` | Shared UI (not feature-specific) |
| `constants/Theme.ts` | Design system tokens (always use, never raw colors) |
| `migrations/` | Supabase SQL migrations (run in order) |

---

## 3. FILE INDEX

### Entry Points
| File | Purpose |
|------|---------|
| `app/index.tsx` | Auth guard → routes to `/(driver)` or `/(tabs)` based on `roleVerified` |
| `app/_layout.tsx` | Root shell: all providers, error boundary, `<Stack>` nav, floating UI |
| `app/(tabs)/_layout.tsx` | Dispatcher tab bar (Finance, Trips, Network, Profile) |
| `app/(driver)/_layout.tsx` | Driver tab bar (Control, Documents, Chat, Wallet) |

### Core Infrastructure
| File | Purpose | Key Exports |
|------|---------|-------------|
| `lib/supabase.ts` | Supabase client, session persistence, 25s timeout+1 retry | `supabase()`, `getAccessToken()`, `hasSupabaseConfig()` |
| `lib/routes.ts` | All route strings | `ROUTES.*` |
| `lib/queryKeys.ts` | TanStack Query key factory | `queryKeys.trips.*`, `.transactions.*`, `.clients.*`, etc. |
| `lib/capabilities.ts` | Role/capability ACL | `getEffectivePermissions()`, `getCapabilitiesFromProfile()` |
| `lib/i18n.ts` | i18n setup (EN/HI/TE/TA/KN/ML) | `t()`, `useTranslation()` |
| `lib/queryClient.ts` | TanStack Query client config | `queryClient` |
| `lib/realtimeRegistry.ts` | Supabase Realtime subscription mgmt | `realtimeRegistry` |

### Contexts
| File | Purpose | Key Hook |
|------|---------|---------|
| `contexts/AuthContext.tsx` | Auth state, role verification, session restore | `useAuth()` → `{ user, profile, roleVerified, signIn, signOut }` |
| `contexts/OrganizationContext.tsx` | Active org | `useOrganization()` |
| `contexts/LanguageContext.tsx` | Language selection | `useLanguage()` |
| `contexts/NetworkContext.tsx` | Connectivity state | `useNetwork()` |
| `contexts/WalletContext.tsx` | Wallet/balance | `useWallet()` |

### Feature Services (selected)
| File | Key Functions |
|------|--------------|
| `features/auth/services/auth.service.ts` | `signInWithPassword`, `signUp`, `signOut`, `getProfile`, `onAuthStateChange` |
| `features/trips/services/trips.service.ts` | `getTripsByOrganization`, `getTripsWhereOrgIsClient`, `getTripsWhereOrgIsSupplier`, `createTrip`, `updateTripStatus` |
| `features/finance/services/finance.service.ts` | `getDoubleEntryFromLedgerRow`, `getProfileImageBatch`, ledger aggregation |
| `features/drivers/services/drivers.service.ts` | Driver CRUD, invite, phone lookup |
| `features/invoicing/services/invoicing.service.ts` | Invoice generation, PDF export |
| `features/ops-agent/services/opsAgent.service.ts` | Gemini AI chat, vision, structured extraction (69 KB) |
| `features/network/services/` | Posts, bids, follows (social layer) |

### Query Hooks (lib/queries/)
| Hook | Data |
|------|------|
| `useTripsQuery` | Trips list/detail for org |
| `useTransactionsQuery` | Ledger transactions |
| `useClientsQuery` | Client entities |
| `useSuppliersQuery` | Supplier entities |
| `useDriversQuery` | Driver entities |
| `useVehiclesQuery` | Fleet vehicles |
| `useIndentsQuery` | Marketplace load requests |
| `useBidsQuery` | Marketplace bids |
| `useOrgMembersQuery` | Team members |
| `useRealtimeInvalidation` | Postgres CDC → cache invalidation |

---

## 4. API MAP

### Auth Service (`features/auth/services/auth.service.ts`)
```
signInWithPassword(email, password) → { error }
signUp({ email, password, fullName, role, operatingModel, phone, ... }) → { error }
signOut() → void
getProfile(uid) → AuthProfile | null
onAuthStateChange(cb) → unsubscribe fn
refreshSession() → { user, profile } | null
```

### Trips Service (`features/trips/services/trips.service.ts`)
```
getTripsByOrganization(orgId, opts?) → { error, trips: TripRow[], hasMore }
getTripsWhereOrgIsClient(orgId) → { error, trips }
getTripsWhereOrgIsSupplier(orgId) → { error, trips }
createTrip(data) → { error, trip }
updateTripStatus(tripId, status, userId) → { error }
```

### Finance Service (`features/finance/services/finance.service.ts`)
```
getLedgerTransactions(orgId, opts?) → { error, transactions: LedgerRow[] }
getDoubleEntryFromLedgerRow(row) → { debit_account, credit_account, amount }
getProfileImageBatch(driverIds) → { [driverId]: avatarUrl }
```

### Capabilities (`lib/capabilities.ts`)
```
getEffectivePermissions(capabilities: Capability[]) → EffectivePermissions
  → { canAccessIndents, canAccessTrips, canAccessVehicles, canManageFinance, ... }

getCapabilitiesFromProfile(profile) → Capability[]
  Capability = "fleet_management" | "dispatch" | "marketplace_post" |
               "marketplace_bid" | "finance_view" | "finance_manage" | "team_manage"
```

---

## 5. DATA MODELS

### Core Entities (Postgres tables)

**`trips`**
```
id, organization_id, trip_number, display_trip_id
client_id, client_name, supplier_id, supplier_name
driver_id, vehicle_id, driver_display_name, vehicle_display_number
status: pending|assigned|started|completed|cancelled
pickup_area, drop_location, distance, estimated_duration
client_price, supplier_rate, margin, platform_fee, driver_commission
payment_status, amount_paid, advance_paid
pickup_date, started_at, completed_at
indent_id, source, load_type, load_tons
created_by, owner_user_id, assigned_by_user_id
```

**`transactions`** (ledger)
```
id, organization_id, trip_id, contact_id, contact_type
party_name, description, amount_in, amount_out
transaction_date, created_by
pod_image_url (pod reconciliation fields)
```

**`profiles`** (extends Supabase auth.users)
```
id (= auth.users.id), full_name, avatar_url, avatar_seed
role: "user" | "driver"
phone, company_name, status_text
```

**`organizations`** → `org_members` (M:M to profiles, role: owner/admin/member)

**`drivers`**, **`clients`**, **`suppliers`**, **`vehicles`** — Entity master tables, all scoped to `organization_id`

**`indents`** — Marketplace load requests (origin, destination, load_type, price, status)

**`network_posts`**, **`network_bids`**, **`network_follows`** — Social layer

**`chat_messages`** — Realtime trip chat

**`trip_documents`**, **`pod_documents`** — Storage references

**Key relationships:**
- Trip → Client (optional), Supplier (optional), Driver (optional), Vehicle (optional)
- Transaction → Trip (optional), Contact (driver/client/supplier)
- OrgMember → Organization + Profile (M:M)
- Indent → Organization (creator), Trip (if matched)

**RLS:** All tables enforce `organization_id` scoping. No `service_role` key in app.

---

## 6. CRITICAL FLOWS

### A. App Launch / Auth Guard
```
1. app/_layout.tsx — mounts all providers
2. AuthContext.tsx — calls getSession() → Supabase session restore
3. If session: verifies profile.role against DB (server confirmation)
4. app/index.tsx — reads useAuth().roleVerified
5. driver → router.replace('/(driver)')
   dispatcher → router.replace(lastRoute || '/(tabs)/trips')
   no session → router.replace('/sign-in')
```
Files: `app/index.tsx`, `app/_layout.tsx`, `contexts/AuthContext.tsx`, `features/auth/services/auth.service.ts`, `lib/supabase.ts`, `lib/lastRoute.ts`

### B. Trip Lifecycle (Dispatcher)
```
1. app/(tabs)/trips.tsx mounts
2. useTripsQuery(orgId) → queryKeys.trips.list(orgId)
3. getTripsByOrganization(orgId) → supabase().from('trips').select(...)
4. RLS validates organization_id
5. Realtime: useRealtimeInvalidation subscribes to trips table
6. On DB change → queryClient.invalidateQueries(queryKeys.trips.all(orgId))
7. Add trip: app/add-trip.tsx → createTrip() → DB insert
8. Status change: updateTripStatus(id, status) → DB update → Realtime fires → refetch
```
Files: `app/(tabs)/trips.tsx`, `lib/queries/useTripsQuery.ts`, `features/trips/services/trips.service.ts`, `lib/queries/useRealtimeInvalidation.ts`

### C. Finance Ledger View
```
1. app/(tabs)/finance.tsx mounts
2. useTransactionsQuery(orgId) fetches ledger rows
3. features/finance/hooks/useFinanceLedger.ts aggregates:
   - Filter by period, category, party, direction
   - Join with trips, drivers for display enrichment
   - Compute totals (amount_in, amount_out, net)
4. LedgerRow displayed in FlashList
5. Add transaction: AddTransactionModal → createTransaction() → DB insert → invalidate
```
Files: `app/(tabs)/finance.tsx`, `lib/queries/useTransactionsQuery.ts`, `features/finance/hooks/useFinanceLedger.ts`, `features/finance/services/finance.service.ts`

---

## 7. PATTERNS & CONVENTIONS

### Naming
- Query hooks: `use[Entity]Query.ts` in `lib/queries/`
- Services: `[domain].service.ts` in `features/[domain]/services/`
- Components: PascalCase, feature-scoped in `features/[domain]/components/`, shared in `components/`
- Query keys: always via factory `queryKeys.X.Y(params)` — never inline strings
- Routes: always via `ROUTES.*` from `lib/routes.ts` — never hardcode paths
- Feature index: `features/[domain]/index.ts` re-exports public API

### Folder Structure
```
features/[domain]/
├── services/     # Supabase calls + business logic
├── components/   # Feature UI
├── hooks/        # Feature hooks
├── utils/        # Helpers
├── styles/       # StyleSheet objects
├── types/        # Domain types
└── index.ts      # Public exports
```

### Shared Utilities
- `lib/format.ts` — Currency, distance, duration formatting
- `lib/validation.ts` — Email, phone, password validation
- `lib/entityIdentity.ts` — Avatar seeds, colors by entity type
- `lib/placesService.ts` — Location search (Mapbox → Google → Nominatim fallback)
- `lib/pagination.ts` — Page size constants
- `lib/avatarUpload.ts` — Avatar signed URL resolution
- `constants/Theme.ts` — All design tokens (use exclusively, no raw colors)

### UI Patterns
- Lists: `@shopify/flash-list` for performance
- Bottom sheets: `@gorhom/bottom-sheet`
- Animations: `moti`
- Icons: `lucide-react-native`
- All strings: through `lib/i18n.ts` (6 languages)
- Platform-specific: `.native.tsx` / `.web.tsx` variants for map + PDF components

---

## 8. DEPENDENCY GRAPH (SIMPLIFIED)

```
app/screens
  → lib/queries/use*Query
      → features/[domain]/services/*.service
          → lib/supabase.ts → Supabase DB

contexts/AuthContext
  → features/auth/services/auth.service
      → lib/supabase.ts

lib/queries/useRealtimeInvalidation
  → lib/realtimeRegistry → lib/supabase.ts (Realtime)
  → lib/queryKeys → queryClient (TanStack Query)

features/*/components
  → components/ (shared UI)
  → constants/Theme.ts
  → lib/i18n.ts

lib/capabilities.ts
  → contexts/AuthContext (profile.role)
  → app/screens (gates feature visibility)

services/ (top-level)
  → features/[domain]/services/ (re-exports only)
```

---

## 9. RISKS & COMPLEX AREAS

- **`features/ops-agent/services/opsAgent.service.ts` (69 KB)** — Gemini AI integration; handles vision, structured extraction, chat history. Complex prompt engineering and multi-modal logic.
- **`features/finance/hooks/useFinanceLedger.ts` (341 lines)** — Aggregates ledger + trips + drivers + filtering + sorting in a single hook. Dense client-side data processing.
- **`features/trips/services/trips.service.ts` (67 KB)** — Largest service; handles cross-org trips (org-as-client, org-as-supplier), visibility rules, and complex join queries.
- **`contexts/AuthContext.tsx` (462 lines)** — Multi-path session restore (SecureStore/AsyncStorage/server), "keep signed in" logic, role verification, session expiry handling. Race conditions possible on cold start.
- **Realtime invalidation** (`lib/queries/useRealtimeInvalidation.ts`) — Subscribes per-org per-table; channel proliferation risk if not cleaned up. Each component mounting triggers subscription.
- **Map abstraction** (`lib/mapLibreCompat.*.tsx`) — Web uses maplibre-gl + react-map-gl, native uses @maplibre/maplibre-react-native. Platform-divergent APIs abstracted here; changes must be verified on both.
- **`migrations/001_initial_schema_consolidated.sql` (192 KB)** — Entire initial schema in one file. Hard to diff; subsequent migrations are incremental.
- **`features/invoicing/`** — PDF generation has `.native.tsx` / `.web.tsx` split; native uses `react-native-pdf-lib`, web uses browser APIs.

---

## 10. REUSABLE CONTEXT SUMMARY

**Q** is a React Native + Expo (SDK 54) logistics dispatch platform targeting Indian freight. Single codebase deploys to iOS, Android, and Web. Two user roles: **dispatcher** (tabs: Finance, Trips, Network, Profile) and **driver** (tabs: Control, Documents, Chat, Wallet). Multi-tenant — all data scoped to `organization_id` enforced via Supabase RLS.

**Auth:** Supabase Auth (email/password + Google OAuth). Session stored in SecureStore (native) or AsyncStorage (web). `contexts/AuthContext.tsx` exposes `useAuth()` with `roleVerified` (server-confirmed role). `app/index.tsx` gates routing based on role.

**Data layer:** TanStack Query v5 for all server state (stale 60s, GC 5min, 1 retry). Query hooks in `lib/queries/use*Query.ts` wrap service functions. Cache keys via factory `queryKeys.*` in `lib/queryKeys.ts`. Realtime: `useRealtimeInvalidation` subscribes to Postgres CDC and invalidates relevant cache keys. All Supabase calls go through `lib/supabase.ts` (25s timeout, 1 retry).

**Feature structure:** Each domain under `features/[domain]/` owns services (Supabase calls + logic), components (feature UI), hooks, utils. Top-level `services/` re-exports from features. Shared UI in `components/`, design tokens exclusively in `constants/Theme.ts`, all strings via `lib/i18n.ts` (6 Indian languages).

**Routing:** Expo Router 6 file-based. All route strings via `ROUTES.*` from `lib/routes.ts`. Key layouts: `app/_layout.tsx` (root shell, all providers), `app/(tabs)/_layout.tsx` (dispatcher), `app/(driver)/_layout.tsx` (driver). Dynamic routes: `app/trip/[id].tsx`, `app/driver/[id].tsx`, etc.

**Access control:** Capability-based via `lib/capabilities.ts`. Capabilities: `fleet_management`, `dispatch`, `marketplace_post/bid`, `finance_view/manage`, `team_manage`. `getEffectivePermissions(capabilities)` returns feature flags. Asset-based operators get fleet+dispatch+marketplace; non-asset get dispatch+marketplace_post only.

**DB schema (key tables):** `trips` (full lifecycle, cross-org support), `transactions` (double-entry ledger), `profiles` (extends auth.users), `organizations`+`org_members`, `drivers/clients/suppliers/vehicles` (per-org entities), `indents` (marketplace), `network_posts/bids/follows` (social), `chat_messages` (realtime), `trip_documents/pod_documents` (storage).

**Complex areas:** `opsAgent.service.ts` (69 KB Gemini AI), `trips.service.ts` (67 KB with cross-org visibility), `useFinanceLedger.ts` (client-side ledger aggregation), `AuthContext.tsx` (multi-path session restore). Platform-specific map and PDF implementations use `.native.tsx`/`.web.tsx` file splits.

**Change guide:** New API call → `features/[domain]/services/`. New screen → `app/[path].tsx` + `lib/routes.ts`. New query → `lib/queries/use[X]Query.ts` + `lib/queryKeys.ts`. Shared UI → `components/`. Feature UI → `features/[domain]/components/`. Access rule → `lib/capabilities.ts`. DB change → `migrations/` + `npm run db:push`.
