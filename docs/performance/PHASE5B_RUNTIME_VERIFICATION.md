# Phase 5B Runtime Verification

## Scope

This pass focuses on runtime correctness and workflow stability without architecture changes:

- posting idempotency and reconciliation
- reimbursement lifecycle separation from accounting posting state
- operations hub density and lazy data loading
- observability of failures and retries
- normalization of operational references

## Performance Findings

- **Hub expansion load cost:** `OperationsHub` already lazy-loads heavy queries on expand (`enabled: expanded`), avoiding eager timeline and summary cost.
- **Identity waterfalls:** actor IDs are batched via `useResolvedIdentities` to prevent per-row identity requests.
- **Duplicate invalidation risk:** review/save mutations invalidate grouped keys; avoid broad root invalidations.
- **Reconciliation overhead:** reconciliation APIs are opt-in and mutate only mismatches.
- **Offline queue pressure:** queue age and failed counts are now observable for operators.

## Hardening Actions

- Added reconciliation query/mutations to keep posting and ledger state aligned.
- Added reimbursement state transition checks to avoid invalid workflow jumps.
- Added posting/runtime observability snapshot for failures/retries/queue age.
- Added operational reference helper functions for consistent cross-surface labels.

## Recommended Runtime Guardrails

1. Keep timeline and reconciliation queries `enabled` only when hub is expanded.
2. Keep retry logic idempotent by keying on `(source_type, source_id)`.
3. Prefer grouped invalidations:
   - `operationsSummary`
   - `operationsTimeline`
   - trip-level reconciliation key
4. Track offline queue oldest age and fail counts in operator UI.

## Verification Commands

- Typecheck:
  - `npx tsc --noEmit`
- Runtime integrity matrix:
  - `npx ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' scripts/runtime/verifyOperationalIntegrity.ts`
- Lint touched files only:
  - `npx eslint <touched files...>`
