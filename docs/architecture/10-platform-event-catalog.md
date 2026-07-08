# Platform Event Catalog

Layer 3 domain document, extending `09-workspace-master-data.md`'s "One System of Record" law with a concrete registry of the facts products publish and subscribe to. This document tracks what's **actually implemented** in `lib/platform/events/` separately from what's **proposed** — conflating the two is exactly the failure mode the rest of this doc stack exists to prevent.

## Implemented today (`lib/platform/events/types.ts`, `commands.ts`)

The event/command distinction already exists in code: **commands** are intent ("do this"), **events** are fact ("this happened"). Only Commerce→Core Order/Indent/Trip/POD is implemented — nothing for Finance or Master Data yet.

**Events** (`PlatformDomainEventName`):

| Event | Publisher | Typical consumers |
|---|---|---|
| `OrderReadyForDispatch` | Commerce (via `ExecutionOrchestrator`) | Core, Analytics |
| `IndentCreated` | Orchestrator / Core | Commerce (status sync) |
| `TripAssigned` | Core | Commerce |
| `TripStarted` | Core | Commerce |
| `TripDelivered` | Core | Commerce, Finance |
| `PODUploaded` | Core | Commerce, Finance |

**Commands** (`PlatformCommandName`): `PublishIndent`, `AssignTrip`, `CompleteDelivery` — handled by `ExecutionOrchestrator` or product services, never directly by another product.

**Infrastructure that already exists:** `EventBus.contract.ts` (`publish`/`subscribe`, implementation pending Phase 3), `PlatformEventLog.ts` (dev-mode event log keyed by `correlationId` + aggregate type/id, aggregate types currently `order | indent | trip`).

## Two naming reconciliations needed before extending

The event catalog proposed in review doesn't match the implemented names in two places. Same class of issue as the `ExecutionService`/`ExecutionOrchestrator` naming gap — pick one before more code or docs reference either:

| Implemented (`types.ts`) | Proposed | Decision needed |
|---|---|---|
| `OrderReadyForDispatch` | `OrderReleased` | Same event (Commerce order becomes eligible for execution). Recommend keeping `OrderReadyForDispatch` — it names the *state transition* precisely, whereas `OrderReleased` is ambiguous with a possible future "release an order back to draft" action. |
| `TripDelivered` | `TripCompleted` | Same event (Core trip lifecycle end). Recommend keeping `TripDelivered` — "delivered" is the actual domain outcome; "completed" could be read as including cancelled/aborted trips, which is a different event this catalog doesn't have yet. |

## Proposed extensions (not yet in `types.ts` — Master Data and Finance)

Not implemented. Listed here so the eventual `PlatformDomainEventName` union has a reviewed target instead of accreting ad hoc.

**Master Data (Workspace-published — new territory, no publisher exists yet):**

| Event | Publisher | Typical consumers |
|---|---|---|
| `CustomerCreated` | Workspace (`CustomerService`) | Commerce, Core, Finance, Pilot |
| `WarehouseCreated` | Workspace (`WarehouseService`) | Commerce, Core, Finance |

**Commerce (extends existing Order events):**

| Event | Publisher | Typical consumers |
|---|---|---|
| `OrderCreated` | Commerce | Analytics |
| `IndentAccepted` | Core | Commerce |

**Finance (entirely new domain — no Finance product/services exist yet, see `09-workspace-master-data.md`'s ownership table):**

| Event | Publisher | Typical consumers |
|---|---|---|
| `InvoiceGenerated` | Commerce | Finance |
| `InvoiceApproved` | Finance | Commerce |
| `PaymentInitiated` | Finance | Commerce |
| `PaymentCompleted` | Finance | Commerce |
| `SettlementCompleted` | Finance | Commerce |

## Sequencing note

Per the priority order under discussion, this catalog's Commerce/Core section (already implemented) is what `ExecutionOrchestrator` implementation consumes directly — no doc work blocks starting that. The Master Data and Finance sections above are *not* a prerequisite for Execution Boundary work; they're recorded now so the eventual Finance/Pilot integration has a reviewed contract to build against rather than inventing event names per-integration.
