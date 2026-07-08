# Platform orchestration (planned)

**Services** — CRUD-oriented operations on a single domain (`CustomerService`, `WarehouseService`, `ProductService`).

**Orchestration** — Coordinates multiple domains or products. Lives here, not inside individual services.

Example (Phase 3):

```
ExecutionOrchestrator.publishIndent(orderId)
    → OrderService.get(orderId)
    → CustomerService.get(customerId)
    → EventBus.publish(IndentRequested)
    → Core creates Indent (order_id linked)
    → AuditService / NotificationService
```

Commerce must not call Core tables directly. Orchestration publishes intent; Core owns indent/trip writes.

See `docs/architecture/06-commerce-core-migration-roadmap.md` Phase 3 and `EXECUTION_ORCHESTRATOR.contract.md` for the full contract.
