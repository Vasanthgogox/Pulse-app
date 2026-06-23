# Finance Domain

See also: `docs/database/finance.md` for schema and service API.

## Files
- Screen: `app/(tabs)/finance.tsx` (thin wrapper, lazy loads FinanceScreen)
- Main component: `features/finance/components/FinanceScreen.tsx`
- Ledger hook: `features/finance/hooks/useFinanceLedger.ts`
- Entities hook: `features/finance/hooks/useFinanceEntities.ts`
- Query hook: `lib/queries/useTransactionsQuery.ts`

## Tab Structure
CASH | CUSTOMERS | SUPPLIERS | GARAGE | DRIVERS

- CASH tab: renders immediately, does not wait on entity queries
- Party tabs (others): show spinner while `entitiesLoading` is true
- `entitiesLoading` = clientsLoading || tripsLoading || suppliersLoading || vehiclesLoading || driversLoading

## Realtime
`useRealtimeTransactionsInvalidation()` — merges UPDATEs in-place, full invalidate on INSERT/DELETE.

## Known Performance Notes
- `useFinanceLedger.ts` has deep useMemo chains — avoid adding more client-side computation
- `entitiesRefreshKey` increments on pull-to-refresh and add-entity completion only (not tab switch)
