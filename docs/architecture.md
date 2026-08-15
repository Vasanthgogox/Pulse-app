# Architecture

**Domain & team ownership blueprint:** [DOMAIN_ORG_AUDIT.md](./DOMAIN_ORG_AUDIT.md) (personas, feature domains, suggested team mapping, audit checklist).

## Pattern
Modular monolith (feature-driven). Single Expo app, feature modules under `features/[domain]/`.

## Data Flow
```
Screen → useXQuery (lib/queries/) → XService (features/domain/services/) → supabase() → Postgres/RLS
                                                   ↑
                      Realtime: Postgres CDC → useRealtimeInvalidation → queryClient.invalidate
```

## Key Modules
| Module | Responsibility |
|--------|---------------|
| `app/` | Expo Router file-based routes |
| `features/[domain]/` | Domain logic: services, components, hooks, utils |
| `lib/queries/` | TanStack Query hooks |
| `lib/queryKeys.ts` | Cache key factory |
| `lib/supabase.ts` | Supabase client singleton |
| `lib/routes.ts` | Centralized route constants |
| `lib/capabilities.ts` | Capability-based ACL |
| `contexts/` | Auth, Org, Language, Network, Wallet |
| `components/` | Shared UI |
| `constants/Theme.ts` | Design tokens |

## Dependency Graph
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
  → lib/queryKeys → queryClient

features/*/components
  → components/ → constants/Theme.ts → lib/i18n.ts

lib/capabilities.ts
  → contexts/AuthContext → app/screens
```

## State Management
- TanStack Query v5 — all server state (staleTime 60s, GC 5min, 1 retry)
- React Context — global UI state only (Auth, Org, Language, Network, Wallet)
- No Redux or Zustand

## Complex Areas
- `features/finance/hooks/useFinanceLedger.ts` — dense client-side ledger aggregation
- `features/trips/services/trips.service.ts` (67 KB) — cross-org visibility, complex joins
- `contexts/AuthContext.tsx` (462 lines) — multi-path session restore, race conditions possible
- Realtime invalidation — channel proliferation risk if subscriptions not cleaned up
- Map abstraction — `.native.tsx`/`.web.tsx` split; verify changes on both platforms

## Organization KYC

Pulse, Admin, and `submit_business_verification` share one requirement matrix.
See [`KYC_REQUIREMENT_POLICY.md`](./KYC_REQUIREMENT_POLICY.md).
