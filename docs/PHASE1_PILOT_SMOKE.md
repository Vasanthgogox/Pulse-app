# Phase 1 Pilot — Smoke Checklist

Manual smoke paths for a Phase 1 pilot cut. Target runtime: ~30–45 minutes after deploy.

Prerequisites:

```bash
git checkout develop && git pull --ff-only
npm run typecheck
npm test -- --ci
./scripts/validate-pilot-env.sh
./scripts/check-env-example-no-secrets.sh
supabase migration list --linked   # expect Local = Remote (no empty pending rows)
```

Hosting secrets (external — must be set before smoke):

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | API auth |
| `EXPO_PUBLIC_WEB_BASE_URL` | Share / deep links |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Place search |
| `EXPO_PUBLIC_SENTRY_DSN` | Crash reporting (recommended) |

Code touchpoints:

- Crash reporting: `lib/crashReporter.ts`, `components/AppErrorBoundary.tsx`
- GST supplier RPCs: migration `supabase/migrations/20261204000000_supplier_rpc_return_gstin.sql`
- Admin KYC approve/reject: `supabase/migrations/20260716062940_admin_approve_reject_allow_unverified.sql`

---

## Smoke A — Business signup

1. Open pilot URL (incognito).
2. Complete business signup through account creation.
3. **Pass:** no white screen; lands in onboarding/workspace without crash.
4. **Fail:** blank screen, uncaught exception, stuck spinner >30s.

## Smoke B — Trip + finance

1. Sign in as an org that can create trips.
2. Create a trip (minimal valid pickup/drop + client).
3. Open trip detail → Finance view.
4. **Pass:** finance card/section renders; no missing-component crash.
5. **Fail:** white screen on finance tab; `TripFinancialCard` / adjustment wizard crash.

## Smoke C — Supplier GSTIN

1. Open a supplier with a known GSTIN in DB (`organizations` / supplier profile).
2. Open supplier detail (and desktop hub if used in pilot).
3. **Pass:** UI shows the real GSTIN (from `s.gstin`), not a wrong/null field.
4. **Fail:** GST blank when DB has value, or wrong identifier shown.

## Smoke D — Crash visibility

1. Confirm `EXPO_PUBLIC_SENTRY_DSN` is set on the deployed environment.
2. Trigger a handled error path or temporarily force a boundary catch in staging only.
3. **Pass:** `AppErrorBoundary` UI (not silent blank) **and/or** event in Sentry within ~2 minutes.
4. **Fail:** silent white screen with no boundary and no Sentry event.

## Smoke E — Admin KYC (if ops console in pilot)

1. In admin console, open an org with `verification_status = unverified` (queued as Pending).
2. Approve and/or reject with required notes/reasons.
3. **Pass:** RPC succeeds; status updates; audit log row written.
4. **Fail:** “not awaiting review” error for unverified orgs.

---

## Sign-off

| Check | Tester | Pass |
|-------|--------|------|
| A Signup | | ☐ |
| B Trip + finance | | ☐ |
| C Supplier GSTIN | | ☐ |
| D Crash visibility | | ☐ |
| E Admin KYC (if in scope) | | ☐ |

**GO** only if A–D pass (E if admin console is in the pilot scope) and Product Lead signs the Phase 1 pilot cut.

Record deployed git SHA: _______________
