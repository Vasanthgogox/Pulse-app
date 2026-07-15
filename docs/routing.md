# Routing

## Setup
Expo Router 6 — file path = route path. All route strings via `ROUTES.*` from `lib/routes.ts` — never hardcode paths.

## Navigation authority
Client navigation is owned by **`lib/navigationPolicy/`** (mounted via `NavigationPolicyShadowHost` in `app/_layout.tsx`, `enforce=true`).

| Concern | Owner |
|---------|--------|
| Session / experience redirects (`replace`) | `evaluateNavigationPolicy` + `NavigationActor` |
| Registry (path → experience / grants) | `lib/navigationPolicy/registry/` |
| Authenticated cold boot (suite, last tab, OAuth resume) | `app/index.tsx` |
| Onboarding resume flags | `(tabs)` / `(driver)` layouts (temporary) |
| Data authorization | **Supabase RLS** — never the nav layer |

Navigation ≠ Authorization.

### Fail-closed defaults
- Anonymous + non-public → `/sign-in?returnTo=…` (RFC §5.4)
- Driver on org experience → `/(driver)`
- Org on driver experience → `/trips`
- Unknown path → fail-closed home (authenticated) or sign-in (anonymous)
- Grant miss with `softDeny: true` → allow soft (UI may hide)
- Kill switch: `EXPO_PUBLIC_NAV_POLICY_ENFORCE=0|false|off`

### Adding / protecting a screen
1. Create `app/[path].tsx` + `ROUTES.*` in `lib/routes.ts`
2. Add a `PolicyRecord` under `lib/navigationPolicy/registry/`
3. Keep `ROUTE_INVENTORY` coverage green (`registryCoverage` test)

## Entry Points
| File | Purpose |
|------|---------|
| `app/index.tsx` | Authenticated boot resolver → suite / last tab / driver home |
| `app/_layout.tsx` | Root shell + NavigationPolicy host + `<Stack>` |
| `app/(tabs)/_layout.tsx` | Org tab bar + splash / onboarding resume |
| `app/(driver)/_layout.tsx` | Driver shell + splash / signup-success resume |

## Route Groups
- `app/(tabs)/` — org dispatcher screens
- `app/(driver)/` — driver screens
- `app/(modals)/` — modal screens
- `app/auth/` — sign-in, sign-up

## Dynamic Routes
- `app/trip/[id]/…`
- `app/driver/[id].tsx`
