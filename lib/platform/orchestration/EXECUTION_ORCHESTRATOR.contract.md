# ExecutionOrchestrator — contract (Phase 3)

## Command: `publishIndent()`

| Field | Value |
|-------|-------|
| **Lifecycle state** | **Implementing** |
| **Freeze gate** | Signed [`ACCEPTANCE_RECORD.md`](./ACCEPTANCE_RECORD.md) — 13 linked-DB checks |
| **After acceptance** | State → **Accepted**; record date, commit, migration version |

See [`LIFECYCLE.md`](./LIFECYCLE.md) for state definitions and allowed changes.

> Do not treat unit tests or builds as freeze criteria. The acceptance record is the release artifact.

Orchestration **coordinates**, **validates prerequisites**, **invokes product/platform services**, **publishes events**, and **returns correlation metadata**. It is not another service layer.

## Commands vs events

| Kind | Role | Examples |
|------|------|----------|
| **Command** | Intent — "please do this" | `PublishIndent`, `AssignTrip`, `CompleteDelivery` |
| **Event** | Fact — "this already happened" | `OrderReadyForDispatch`, `IndentCreated`, `TripDelivered` |

Commands use a consistent envelope. Events carry `correlationId` for traceability across handlers.

Types: `lib/platform/events/commands.ts`, `lib/platform/events/types.ts`

## Orchestrator responsibilities

**Does:**

- Coordinate cross-product workflows
- Validate prerequisites (order exists, dispatchable, refs present)
- Invoke `OrderService`, `CustomerService`, `WarehouseService`, `IndentService`
- Publish domain events
- Return `correlationId` + entity IDs

**Does not own:**

- Pricing, inventory, invoicing (Commerce)
- Customer/warehouse business validation beyond prerequisite checks (Platform services)
- Trip planning, driver assignment (Core)

## Command envelope

Every orchestration entry point accepts:

```typescript
type OrchestrationCommandEnvelope<TPayload> = {
  correlationId: string;   // UUID — trace across commands + events
  workspaceId: string;
  requestedBy: string;     // user id from session
  requestedAt: string;     // ISO timestamp
  payload: TPayload;
};
```

### `PublishIndent` command

```typescript
type PublishIndentCommand = OrchestrationCommandEnvelope<{
  orderId: string;
}>;
```

Convenience overloads (e.g. `publishIndent(orderId)` from UI) build this envelope from session context internally.

## `ExecutionOrchestrator.publishIndent(command)`

### Reads

| Service | Purpose |
|---------|---------|
| `OrderService.get(orderId)` | Header, status, customer/warehouse refs |
| `CustomerService.findClientRecord` | Consignee snapshot |
| `WarehouseService.findWarehouseRecordById` | Pickup location |

### Publishes (events)

Events are emitted **only after** indent persistence and order transition to `Planned`, in this order:

1. `OrderReadyForDispatch`
2. `IndentCreated`

Both carry the command's `correlationId`. Subscribers must not observe `IndentCreated` before the order is `Planned`.

| Event | When |
|-------|------|
| `OrderReadyForDispatch` | Indent exists and order is `Planned` |
| `IndentCreated` | Immediately after `OrderReadyForDispatch` |

### Idempotency

| Scenario | Behavior |
|----------|----------|
| First publish (`Pending Consolidation`) | Create indent → `Planned` → emit both events |
| Re-publish (`Planned` + linked indent) | Return existing IDs; **no** new indent, **no** events |
| Retry after partial failure (indent exists, order still `Pending`) | Reuse indent → `Planned` → emit events (recovery) |
| Concurrent publish (double-click) | Unique index on `(organization_id, sales_order_id)` + insert race handling |

### Failure semantics (non-transactional)

Persistence is **not** wrapped in a DB transaction. Partial states are possible:

| Failure point | Order status | Indent | Events |
|---------------|--------------|--------|--------|
| Indent insert fails | `Pending Consolidation` | none | none |
| `markPlanned` fails after indent | `Pending Consolidation` | exists | none |
| Event publish fails after `Planned` | `Planned` | exists | partial (retry is idempotent once `Planned`) |

### Returns

```typescript
type PublishIndentResult = {
  indentId: string;
  orderId: string;
  correlationId: string;  // echoes command.correlationId
};
```

### Errors

| Code | Condition |
|------|-----------|
| `INVALID_COMMAND` | Missing `correlationId` |
| `ORDER_NOT_FOUND` | Unknown `orderId` |
| `ORDER_NOT_DISPATCHABLE` | Status not eligible |
| `MISSING_CUSTOMER` | No linked customer |
| `MISSING_WAREHOUSE` | No pickup warehouse |

## Event catalog

| Event | Publisher | Typical consumers |
|-------|-----------|-------------------|
| `OrderReadyForDispatch` | Orchestrator | Core, Analytics |
| `IndentCreated` | Orchestrator / Core | Commerce (status sync) |
| `TripAssigned` | Core | Commerce |
| `TripStarted` | Core | Commerce |
| `TripDelivered` | Core | Commerce |
| `PODUploaded` | Core | Commerce, Finance |

## Implementation order

1. ~~Lock contract~~ ✓
2. `EventBus` implementation (`lib/platform/events/EventBus.contract.ts`)
3. `ExecutionOrchestrator` implementation — thin coordinator
4. Commerce "Publish to execution" → `PublishIndentCommand` only (no Core table access)

## Type references

- `lib/platform/orchestration/types.ts` — command envelope, result, errors
- `lib/platform/orchestration/ExecutionOrchestrator.contract.ts` — interface
- `lib/platform/orchestration/ACCEPTANCE_RECORD.md` — live DB acceptance + v1 freeze artifact
- `lib/platform/events/commands.ts` — command names
- `lib/platform/events/types.ts` — event names

## Stability (after v1 acceptance sign-off)

When `publishIndent()` transitions to **Accepted** (see [`LIFECYCLE.md`](./LIFECYCLE.md)):

- Bug fixes allowed; **no semantic changes** without a new major version and acceptance record.
- New execution steps are **new commands** (`assignVehicle`, `assignDriver`, …), not additions to `publishIndent()`.

Each command ships with: contract, implementation, acceptance record, verification script.
