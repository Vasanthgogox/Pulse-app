# Architecture Boundaries

This document defines the domain boundary rules for the Pulse codebase.
Violations are caught by `eslint-plugin-boundaries` and the CI `architecture-check` workflow.

## Directory Ownership

| Directory | What belongs here |
|-----------|------------------|
| `app/` | Expo Router screens and layouts only. No business logic. |
| `features/[domain]/` | All domain logic: services, components, hooks, utils, types |
| `lib/` | Shared infrastructure: Supabase client, query hooks, routes, capabilities, i18n, formatting |
| `components/` | Shared UI primitives used by 3+ feature domains with no feature imports |
| `contexts/` | Global React contexts (Auth, Org, Language, Network, Wallet) |
| `constants/` | Design tokens (Theme.ts) and app-wide constants |
| `types/` | TypeScript `.d.ts` declaration files only |

## The 6 Boundary Rules

**Rule 1 — lib/ is infrastructure, not a dumping ground.**
`lib/` can only contain code with no domain owner. If a file name contains a domain noun (`driver`, `fleet`, `salary`, `gpay`), it belongs in `features/`.

**Rule 2 — lib/ never imports from features/.**
Data flows one way: `app/ → features/ → lib/`. A lib/ file that imports from features/ creates an inversion that makes the shared layer depend on domain logic.

**Rule 3 — Shared components/ receive data via props, never import features.**
`components/` files must not import from `features/`. If a shared component needs domain data, its caller passes it as props.

**Rule 4 — Cross-feature imports are services-only.**
`features/[A]` may import from `features/[B]/services/` (to read data) but must never import from `features/[B]/components/` or `features/[B]/hooks/` (component coupling = wrong abstraction layer).

**Rule 5 — Service files live in the feature that owns their primary DB table.**
`sharedLedgerService` → `features/finance/services/` (owns `transactions` table).
`connectionRequestsService` → `features/connections/services/` (owns `connection_requests` table).
Exception: truly cross-domain utilities (e.g. `lib/routingService.ts`) live in `lib/`.

**Rule 6 — Re-export facades are forbidden.**
No `services/clientsService.ts` that only does `export * from '@/features/clients/services/clients.service'`.
If you need a re-export, add it to the feature's `index.ts` barrel.

## Adding New Code

| What | Where |
|------|-------|
| New Supabase query | `features/[domain]/services/[name].service.ts` |
| New screen | `app/[path].tsx` + add route to `lib/routes.ts` |
| New query hook | `lib/queries/use[Entity]Query.ts` + key in `lib/queryKeys.ts` |
| Shared UI (used in 3+ features) | `components/` |
| Feature-specific UI | `features/[domain]/components/` |
| Cross-platform keyboard/navigation hook | `lib/hooks/` |
| Auth-specific hook | `features/auth/hooks/` |
| Domain utility | `features/[domain]/utils/[name].util.ts` |

## Known Pre-Existing Circular Dependencies

Do not add new cycles. Existing ones to be resolved in a future sprint:

1. `features/drivers/components/AddDriverModal` ↔ `DriverRegistrationPortalFlow`
2. `features/drivers/services/drivers.service` ↔ `driverInviteCompensation.util`
3. `features/trips/services/tripOtp.service` ↔ `trips.service`
4. `lib/contactPicker` ↔ `lib/contactPickerNative`
5. `lib/contactPicker` ↔ `lib/contactPickerWeb`

Run `npx madge --circular --extensions ts,tsx . --exclude 'node_modules|dist|\.expo'` to check.
