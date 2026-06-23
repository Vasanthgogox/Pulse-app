# Trips Domain

See also: `docs/database/trips.md` for schema and service API.

## Files
- Screen: `app/(tabs)/trips.tsx`
- Query hook: `lib/queries/useTripsQuery.ts`
- Service: `features/trips/services/trips.service.ts` (67 KB — largest service)
- Realtime: `lib/queries/useRealtimeInvalidation.ts` → `useRealtimeTripsInvalidation()`

## Query Hooks
| Hook | Purpose |
|------|---------|
| `useTripsQuery(orgId)` | All trips for org |
| `useTripsWhereOrgIsClientQuery` | Cross-org: this org is client |
| `useTripsWhereOrgIsSupplierQuery` | Cross-org: this org is carrier |

## Realtime Strategy
- UPDATE events merge in-place (avoids refetch storms from GPS pings)
- INSERT/DELETE fully invalidate the trips list
- Only invalidates when relevant fields changed (client name, assignment, counterparty)

## Adding a Trip
`app/add-trip.tsx` → `createTrip()` → DB insert → Realtime fires → list refetches
