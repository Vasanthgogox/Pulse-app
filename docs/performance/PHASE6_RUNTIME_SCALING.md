# PHASE 6 Runtime Scaling

## Goals

- Keep the operational control layer mobile-first and low-latency.
- Avoid uncontrolled query fanout while adding dispatcher queue depth.
- Preserve additive architecture and existing trip lifecycle flow.

## Runtime guardrails implemented

1. **Lazy loading by intent**
   - `OperationsControlCenter` queries only when expanded.
   - `VehicleEconomicsDashboard` queries only when enabled and org is present.
   - Reconciliation workbench remains opt-in by surface.

2. **Bounded query windows**
   - Control center queue page requests use offset/limit windows.
   - Reconciliation org scans are capped to recent asset trips.
   - Vehicle economics scans are capped to recent trip windows.

3. **Batch over N+1**
   - Vehicle economics uses batched `IN (...)` reads for trip/fuel/toll/maintenance.
   - Reimbursement queue resolves in two batched table reads + join context.
   - Control center derives queue categories from merged batches.

4. **Virtualized/low-scroll UI**
   - Queue surfaces use condensed list cards and bounded scroll regions.
   - Workbench actions are sticky bottom rails to reduce travel.

5. **Grouped invalidation**
   - Operations batch actions invalidate by org-level queue keys plus trip-scope keys.
   - Health snapshots and control-center keys are invalidated together.

6. **Derived analytics memoization**
   - Vehicle economics rows and rankings are computed once per query payload.
   - Reimbursement metrics are built from normalized queue states.

## Operational SLO recommendations

- Control-center first paint (expanded): < 1.2s on median 4G device.
- Batch action completion feedback: < 400ms optimistic response.
- Reconciliation workbench refresh: < 2.0s for <= 30 trip scan window.

## Follow-up hardening

- Add server-side org queue RPC to reduce client merge work.
- Promote reconciliation/observability keys to strict query-key factory usage everywhere.
- Add sampled render-count instrumentation for queue cards in debug builds.
