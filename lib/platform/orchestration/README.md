# Platform orchestration

Coordinates cross-product workflows. **Not** a domain service — validates prerequisites, invokes platform services, publishes events, returns correlation metadata.

## Command lifecycle

See [`LIFECYCLE.md`](./LIFECYCLE.md) for state definitions (Draft → Implementing → Accepted → Deprecated).

**Current:** `publishIndent()` is **Implementing**. Freeze gate: signed [`ACCEPTANCE_RECORD.md`](./ACCEPTANCE_RECORD.md) (13 checks, linked DB).

## Shipping a new command

Ship all four together:

| Artifact | Purpose |
|----------|---------|
| Contract | `*.contract.md` + command types |
| Implementation | Thin orchestrator method |
| Acceptance | Live DB record (signed when complete) |
| Verification | SQL script + programmatic checks |

## `publishIndent` (v1)

```
Commerce → PublishIndentCommand → ExecutionOrchestrator.publishIndent()
  → OrderService / CustomerService / WarehouseService / IndentService
  → EventBus (OrderReadyForDispatch, IndentCreated)
  → Core indent (sales_order_id)
```

| Artifact | File |
|----------|------|
| Contract | `EXECUTION_ORCHESTRATOR.contract.md` |
| Implementation | `ExecutionOrchestrator.ts` |
| Acceptance | `ACCEPTANCE_RECORD.md` |
| Verification | `verifyPublishAcceptance.ts`, `npm run acceptance:verify` |

```bash
npm run acceptance:baseline   # reproducibility header for acceptance record
npm run acceptance:verify -- <order_id> <org_id>
```

## Next commands (after v1 Accepted)

`assignVehicle` → `assignDriver` → `dispatchTrip` → `startExecution` → `completeExecution` → `cancelExecution`

Each follows the same four-artifact pattern. Do not expand `publishIndent()` semantically after Accepted.

## References

- [`EXECUTION_ORCHESTRATOR.contract.md`](./EXECUTION_ORCHESTRATOR.contract.md) — `publishIndent` behavior
- [`LIFECYCLE.md`](./LIFECYCLE.md) — stability guarantees
- [`ACCEPTANCE_RECORD.md`](./ACCEPTANCE_RECORD.md) — v1 release artifact (fill on live run)
- `docs/architecture/06-commerce-core-migration-roadmap.md` — Phase 3 context
