# Shared Ledger Notifications Regression Checklist

Use this checklist before merging shared-ledger notifications to ensure existing
notification and finance flows are not disturbed.

## Notification Center

- Open `/notifications` with org containing only salary requests:
  - salary cards render exactly as before.
  - reject/pay actions still work.
- Open `/notifications` with shared-ledger notifications present:
  - shared-ledger cards appear in Action Required/History correctly.
  - Mark read updates card status locally and moves to History.
  - primary CTA routes to existing finance/trip/client/supplier flows.
- Open `/notifications` when shared-ledger backend is not deployed:
  - screen still renders salary notifications normally.
  - no crash and no blocking error.

## Bell Badge

- Verify badge count = pending salary requests + shared-ledger actionable count.
- Verify badge still works when shared-ledger count endpoint is unavailable
  (should show salary-only count).
- Verify invite indicator (network requests/inbox) remains unchanged.

## Salary Request Flow (must remain unchanged)

- Driver submits salary request.
- Dispatcher sees request in Action Required.
- Reject updates to History with rejected status.
- Pay now opens `/(modals)/ledger-sync` and on successful submit marks request as paid.

## Shared Ledger CTA Routing

- `payload_json.trip_id` present -> routes to `/trip-ledger/[id]`.
- `payload_json.entity_type=CLIENT` + `entity_id` -> routes to `/client/[id]`.
- `payload_json.entity_type=SUPPLIER` + `entity_id` -> routes to `/supplier/[id]`.
- Missing payload route fields -> safe fallback to `/(tabs)/finance`.

## Edge Cases

- Multi-org switch while on notifications: no stale cross-org rows remain visible.
- Re-open notifications after action: statuses rehydrate correctly.
- Duplicate notifications from backend dedupe policy do not render duplicates.
- Shared-ledger endpoints missing: no runtime exception in list or badge loader.

## Quick Smoke Commands

- `npm test -- sharedLedgerNotificationsService.unit.test.ts`
- `npm run lint` (or project-standard scoped lint command if full lint is too heavy)
