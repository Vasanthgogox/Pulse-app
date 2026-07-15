# Navigation Policy Registry

## Hard rules

- **Navigation ≠ Authorization** — This package decides which *shell route* to show (`wait` / `allow` / `redirect`). It does **not** authorize data.
- **Navigation ≠ RLS** — Supabase RLS and server RPCs remain the security boundary. SoftDeny grant misses may still *mount* UI; APIs must fail closed.

## Ownership

| Module | Owns |
|--------|------|
| `registry/*` | Path → experience + grants + priority |
| `evaluate.ts` | Pure decision |
| `NavigationActor.ts` | **Sole** auth-driven `router.replace` |
| `NavigationPolicyShadowHost` | Snapshot + enforce wiring |
| `app/index.tsx` | Authenticated *destination* cold boot only (suite / last-tab / driver home) |

Layouts must **not** `replace` for session, role, or onboarding. Splash/chrome only.

## Kill switch

```bash
EXPO_PUBLIC_NAV_POLICY_ENFORCE=0   # Actor does not navigate; evaluate still runs
```

Default is enforce **on**.

## How to add a route safely

1. Add `app/...` screen + `ROUTES.*` in `lib/routes.ts`.
2. Add a `PolicyRecord` in `registry/public.ts`, `driver.ts`, or `org.ts`.
3. Add an inventory entry in `routeInventory.ts` (same sample path the app uses).
4. Run: `npm run test:navigation-policy`
5. Confirm coverage + overlap + auth-replace ban tests pass.

## Experiences

- `public_content` / `public_process` — anonymous + authenticated ok (OAuth/reset stay here)
- `org` — org users
- `driver` — drivers (`/(driver)` kept in canonical path)

## Predicates

Snapshot includes:

- `signup_branding_active`
- `owner_org_incomplete`
- `driver_signup_success`

Evaluate redirects to onboarding destinations before experience checks.
