# Orchestrator command lifecycle

Every orchestrator command has an explicit **lifecycle state**. States define what changes are allowed.

## States

| State | Meaning | Allowed changes |
|-------|---------|-----------------|
| **Draft** | Architecture under active design | Anything |
| **Implementing** | Code built; live acceptance not completed | Refactors, semantic changes, bug fixes |
| **Accepted** | Live acceptance record completed and signed | Bug fixes only — **no semantic changes** |
| **Deprecated** | Superseded by a newer command | Security / critical fixes only |

**Release artifact:** A completed, signed `ACCEPTANCE_RECORD.md` from a **linked database** run — not unit tests or green builds alone.

When a command reaches **Accepted**, record in its acceptance file:

- Acceptance date
- Git commit hash
- Database migration version (last applied on linked)
- Organization / workspace exercised

## Working rule: before vs after `publishIndent` Accepted

| | Before Accepted | After Accepted |
|---|-----------------|----------------|
| Architecture | Allowed if acceptance uncovers a flaw | Only if acceptance or production exposes a real limitation |
| Refactoring | Allowed | Bug fixes only |
| Contracts | May evolve | Versioned; semantic freeze |
| Acceptance record | In progress | Historical evidence |

Subsequent commands (`assignVehicle`, `assignDriver`, …) follow the **same delivery pattern** — not a fresh architecture exercise.

## Execution capability versions (after v1.0)

Treat the platform as **versioned capabilities**, not ongoing architecture:

| Version | Capability | State |
|---------|------------|-------|
| Execution v1.0 | `publishIndent()` | Implementing → Accepted (gate) |
| Execution v1.1 | `assignVehicle()` | Draft |
| Execution v1.2 | `assignDriver()` | Draft |
| Execution v1.3 | `dispatchTrip()` | Draft |
| … | (see registry) | Draft |

Each version ships: contract + implementation + acceptance record + verification — then moves on.

---

## Command registry (governance dashboard)

Single source of truth for orchestrator command maturity. Update when a command changes state.

| Command | State | Accepted on | Git commit | Acceptance record |
|---------|-------|-------------|------------|-------------------|
| `publishIndent()` | **Implementing** | — | — | [`ACCEPTANCE_RECORD.md`](./ACCEPTANCE_RECORD.md) (pending) |
| `assignVehicle()` | Draft | — | — | — |
| `assignDriver()` | Draft | — | — | — |
| `dispatchTrip()` | Draft | — | — | — |
| `startExecution()` | Draft | — | — | — |
| `arrivePickup()` | Draft | — | — | — |
| `departPickup()` | Draft | — | — | — |
| `arriveDelivery()` | Draft | — | — | — |
| `capturePOD()` | Draft | — | — | — |
| `completeExecution()` | Draft | — | — | — |
| `cancelExecution()` | Draft | — | — | — |
| `invoice()` | Draft | — | — | — |
| `settle()` | Draft | — | — | — |

**Freeze gate (current):** `publishIndent()` → 13-point linked-DB acceptance in `ACCEPTANCE_RECORD.md`.

**On sign-off**, update the `publishIndent()` row:

| Command | State | Accepted on | Git commit | Acceptance record |
|---------|-------|-------------|------------|-------------------|
| `publishIndent()` | **Accepted** | YYYY-MM-DD | `<hash>` | `ACCEPTANCE_RECORD.md` (signed) |

Then tag that commit (e.g. `execution-orchestrator-v1`). Do not begin `assignVehicle()` until this row is **Accepted**.

**`assignVehicle()` scope (when started):** validate indent + vehicle → assign → `VehicleAssigned` event → return. No driver, ETA, notifications, routing, or capacity in v1 of that command.

### `publishIndent()` — four artifacts (v1)

v1 ships as flat files under `lib/platform/orchestration/`. Future commands may use per-command folders.

| Artifact | Path |
|----------|------|
| Contract | `EXECUTION_ORCHESTRATOR.contract.md`, `ExecutionOrchestrator.contract.ts`, `types.ts` |
| Implementation | `ExecutionOrchestrator.ts` |
| Acceptance | `ACCEPTANCE_RECORD.md` |
| Verification | `verifyPublishAcceptance.ts`, `scripts/acceptance/verify-orchestrator-v1.sh` |

---

## Shipping rule (every new command)

Do not merge a new orchestrator command without **four artifacts together**:

```
<commandName>/
  contract          # *.contract.md + types
  implementation    # orchestrator method + services
  acceptance        # ACCEPTANCE_RECORD.md (signed after live DB run)
  verification      # script + programmatic checks
```

Examples (planned):

- `assignVehicle/` — contract, implementation, acceptance, verification
- `assignDriver/` — contract, implementation, acceptance, verification
- `dispatchTrip/` — contract, implementation, acceptance, verification

Each command owns: idempotency rules, event sequence, `correlationId` tracing, and its own lifecycle state.

---

## Platform layers (reference)

```
Identity          → authenticates
Workspace         → shared master data (customers, warehouses, products)
Commerce          → commercial transactions (sales orders)
ExecutionOrchestrator → cross-product handoff coordination
Core              → operational execution (indents, trips)
Finance           → settlement
Events            → state-change communication between layers
```

Products integrate through platform services and orchestration — not direct product-to-product dependencies.

---

## Live validation phases (v1 gate)

Execute in order against a **linked database**. Stop and fix before continuing if any phase fails.

| Phase | Proves | Stop condition |
|-------|--------|----------------|
| **1 — Workspace** | Customer + warehouse in Commerce = same records in Core Clients / Warehouses | Duplicate records or sync hacks |
| **2 — Commerce** | Order created → `Pending Consolidation` only | Auto-orchestration or side effects |
| **3 — Orchestration** | Publish → orchestrator only; no cross-product table writes | Product A writing Product B tables |
| **4 — Core** | Indent as if dispatcher-created; origin-agnostic (Commerce/API/future) | Core knowing Commerce internals |
| **5 — Lineage** | Order → `correlationId` → indent via `sales_order_id` | Broken traceability |

Phases 1–5 map to [`ACCEPTANCE_RECORD.md`](./ACCEPTANCE_RECORD.md). **No new architecture until signed.**

---

## Post-v1 freeze (after `publishIndent` Accepted)

Bug fixes only — no semantic changes:

- Workspace master data ownership model
- `CustomerService`, `WarehouseService`, `ProductService`
- `ExecutionOrchestrator.publishIndent()`
- Event contracts (`OrderReadyForDispatch`, `IndentCreated`, …)
- `correlationId` on every orchestration command
- Order ↔ indent linkage (`sales_order_id`)

Expand execution via **new commands** (registry above), not by growing `publishIndent()`.

---

## Backlog: Business Object Registry (Draft)

*Do not implement until `publishIndent` is Accepted.* Proposed canonical IDs for orchestrator commands — exchange these, not product-specific DTOs:

| Object | Owner | Public identifier |
|--------|-------|-------------------|
| Customer | Workspace | `customerId` |
| Warehouse | Workspace | `warehouseId` |
| Product | Platform catalog | `productId` |
| Sales order | Commerce | `orderId` |
| Indent | Core | `indentId` |
| Trip | Core | `tripId` |
| Invoice | Finance | `invoiceId` |

Enables Marketplace, Finance, CRM, and AI without product-to-product coupling.
