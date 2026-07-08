# Platform Event Catalog

Layer 3 domain document, extending `09-workspace-master-data.md`'s "One System of Record" law with a concrete registry of the facts products publish and subscribe to. This is the canonical registry for event contracts — each event gets a standard definition (Business Owner, Emitted By, Aggregate, Version, Payload, Consumers, Guarantees), not just a name in a table.

**Event names are treated as stable** as of this document. Don't rename `OrderReadyForDispatch` or `TripDelivered` unless the underlying business semantics actually change — they're named for the business transition/outcome, not the implementation state, precisely so they don't need revisiting when implementation details shift.

**Commands vs. events**, enforced rigorously: commands (`PublishIndent`, `AssignTrip`, `CompleteDelivery`) represent intent — products issue them. Events represent facts that already happened — products react to them.

**Business Owner vs. Emitted By:** the domain that owns the business event is not always the code that technically calls `publish()`. `OrderReadyForDispatch` is a Commerce business event, but `ExecutionOrchestrator` is what actually emits it on Commerce's behalf. This distinction stays valuable when orchestrators get refactored but domain ownership doesn't move.

**Reserved-event rule:** an event must not be added to `PlatformDomainEventName` until there is at least one real publisher and one identified consumer. This keeps the event union from growing into a wishlist.

## Review checklist — before promoting an event from 🟡 Planned to ✅ Implemented

The criterion for "implemented" is a real `eventBus.publish()` call site, never just the type union — the `TripAssigned`/`IndentCreated` correction in this document's history is exactly the drift this checklist exists to prevent. Before moving an event's Status cell:

1. **At least one real publish call site exists** — grep for `name: 'EventName'` inside an `eventBus.publish(...)` call, not just the string appearing in `PlatformDomainEventName`.
2. **At least one test exercises that publish** — asserting the event fires (and with what payload) under the relevant success/failure paths, not just that the orchestrator function returns.
3. **The Payload Field table reflects the actual call site**, not a guess — every field either verified from the real `payload: { ... }` object or explicitly marked 🔄 Contract target if still aspirational.
4. **The inverse holds too**: if a publish call site is added to code, the event must be added (or promoted) here in the same change — an implemented event missing from this catalog is the same drift in the other direction.

Not automated yet — a CI check enumerating `PlatformDomainEventName` against real `publish()` call sites and test coverage would enforce this mechanically, but isn't built. This checklist is the manual equivalent until that exists.

**Sequence for introducing a new event** (the four checks above, in the order a developer actually does them): add the event type → add a publish site → add or update a test proving it's emitted → document it in the Implemented section. If any step isn't done yet, the event stays in Reserved/Planned — never document ahead of the code.

## Status legend

| Status | Meaning |
|---|---|
| ✅ Implemented | Typed in `PlatformDomainEventName` **and** has a real `eventBus.publish()` call site in code |
| 🟡 Planned | Typed in `PlatformDomainEventName`, no publisher yet |
| 🔒 Reserved | Not typed, no publisher, no consumer — documented as a future target only |

## Implemented and Planned events (`lib/platform/events/types.ts`)

| Event | Status |
|---|---|
| `OrderReadyForDispatch` | ✅ Implemented |
| `IndentCreated` | ✅ Implemented |
| `TripAssigned` | 🟡 Planned |
| `TripStarted` | 🟡 Planned |
| `TripDelivered` | 🟡 Planned |
| `PODUploaded` | 🟡 Planned |

Verified against `lib/platform/orchestration/ExecutionOrchestrator.ts`: only `publishIndent()` exists, and it publishes exactly `OrderReadyForDispatch` then `IndentCreated`. No code anywhere calls `eventBus.publish()` with the other four names — they exist in the type union (presumably reserved for the Trip-lifecycle orchestration that hasn't been built) but are not yet real event traffic.

---

### `OrderReadyForDispatch`
- **Business Owner:** Commerce
- **Emitted By:** `ExecutionOrchestrator.publishIndent()`
- **Aggregate:** Order
- **Version:** v1
- **Consumers:** Core, Analytics
- **Guarantees:** Published once, after Commerce order validation succeeds (dispatchable status, customer + pickup warehouse resolved) and before indent creation begins.
- **Naming rationale:** not `OrderReleased` — "released" is overloaded (released from approval / to warehouse / back to draft / to carrier). "ReadyForDispatch" names the exact business transition: commercial workflow finished, execution may begin.

| Payload Field | Status |
|---|---|
| `orderId` | ✅ Implemented |
| `orderNumber` | ✅ Implemented |
| `requestedBy` | ✅ Implemented |
| `correlationId` | ✅ Implemented (envelope) |
| `workspaceId` | ✅ Implemented (envelope) |
| `occurredAt` | ✅ Implemented (envelope) |

(Verified directly from `publishDispatchEvents()` in `ExecutionOrchestrator.ts` — this is the one event in this catalog with a fully confirmed payload, not a target.)

### `IndentCreated`
- **Business Owner:** Core
- **Emitted By:** `ExecutionOrchestrator.publishIndent()` (on Core's behalf, immediately after `IndentService.createFromSalesOrder()`)
- **Aggregate:** Indent
- **Version:** v1
- **Consumers:** Commerce (status sync)
- **Guarantees:** Published once the indent row is persisted in Core (or immediately, with the existing indent's id, if `publishIndent` is called again for an already-`Planned` order).

| Payload Field | Status |
|---|---|
| `orderId` | ✅ Implemented |
| `indentId` | ✅ Implemented |
| `correlationId` | ✅ Implemented (envelope) |
| `workspaceId` | ✅ Implemented (envelope) |
| `occurredAt` | ✅ Implemented (envelope) |

### `TripAssigned`
- **Business Owner:** Core
- **Emitted By:** *(not yet built — no Trip orchestration exists)*
- **Aggregate:** Trip
- **Version:** v1 (reserved)
- **Consumers:** Commerce
- **Guarantees:** *(not yet defined)*

| Payload Field | Status |
|---|---|
| `tripId` | 🔄 Contract target |
| `indentId` | 🔄 Contract target |

### `TripStarted`
- **Business Owner:** Core
- **Emitted By:** *(not yet built)*
- **Aggregate:** Trip
- **Version:** v1 (reserved)
- **Consumers:** Commerce

| Payload Field | Status |
|---|---|
| `tripId` | 🔄 Contract target |

### `TripDelivered`
- **Business Owner:** Core
- **Emitted By:** *(not yet built)*
- **Aggregate:** Trip
- **Version:** v1 (reserved)
- **Consumers:** Commerce, Finance
- **Naming rationale:** not `TripCompleted` — a trip's terminal state can be delivered, cancelled, aborted, failed, or expired. "Completed" is an implementation-state word that would get overloaded the moment a second terminal state is needed. "Delivered" is the specific business outcome this event names; `TripCancelled`/`TripFailed`/`TripAborted` are the correct future events for the other terminal states, not variants of "completed."

| Payload Field | Status |
|---|---|
| `tripId` | 🔄 Contract target |
| `orderId` | 🔄 Contract target |

### `PODUploaded`
- **Business Owner:** Core
- **Emitted By:** *(not yet built)*
- **Aggregate:** Trip
- **Version:** v1 (reserved)
- **Consumers:** Commerce, Finance

| Payload Field | Status |
|---|---|
| `tripId` | 🔄 Contract target |
| `orderId` | 🔄 Contract target |

---

**Infrastructure that already exists:** `EventBus.contract.ts` (`publish`/`subscribe`), `InProcessEventBus.ts` (the real implementation `getPlatformEventBus()` returns), `PlatformEventLog.ts` (dev-mode event log keyed by `correlationId` + aggregate type/id — currently `aggregateType: 'order' | 'indent' | 'trip'` only).

## Reserved (not typed, no publisher, no consumer)

Per the reserved-event rule above: these are documented as a future target only. `CustomerCreated`/`WarehouseCreated`/`ProductUpdated` have real services that *could* publish them today (`CustomerService`/`WarehouseService`/`ProductService` already exist) — deliberately not wired up, since nothing subscribes yet and an unconsumed event is speculative infrastructure, not a contract. The Finance rows have no product to publish or consume them at all — no Finance product exists yet (see `09-workspace-master-data.md`'s ownership table).

| Event | Status | Business Owner | Would Be Emitted By |
|---|---|---|---|
| `CustomerCreated` | 🔒 Reserved | Workspace | `CustomerService` |
| `WarehouseCreated` | 🔒 Reserved | Workspace | `WarehouseService` |
| `ProductUpdated` | 🔒 Reserved | Commerce | `ProductService` |
| `OrderCreated` | 🔒 Reserved | Commerce | — |
| `IndentAccepted` | 🔒 Reserved | Core | — |
| `InvoiceGenerated` | 🔒 Reserved | Commerce | — (no Finance product) |
| `InvoiceApproved` | 🔒 Reserved | Finance | — (no Finance product) |
| `PaymentInitiated` | 🔒 Reserved | Finance | — (no Finance product) |
| `PaymentCompleted` | 🔒 Reserved | Finance | — (no Finance product) |
| `SettlementCompleted` | 🔒 Reserved | Finance | — (no Finance product) |

## Future: operational metadata

Not needed today, but every event will eventually want a documented **Reliability** (e.g. at-most-once), **Ordering** (e.g. per-aggregate), **Idempotency** (e.g. required — a consumer receiving `IndentCreated` twice for the same `indentId` must not create two trips), and **Correlation** (required — every event in an Order→Indent→Trip→POD chain shares one `correlationId`, already true in code today) contract. Not filled in per-event yet because there's exactly one real integration (`publishIndent`) to generalize from — adding this table now, before a second real orchestration flow exists, risks guessing the wrong shape. Revisit once Trip-lifecycle events get a real publisher.

## Sequencing note

The Implemented section above is what already exists and is what any Trip-lifecycle orchestration work would extend. The Reserved section is not a prerequisite for that work — it exists so Finance/Pilot integration has a reviewed contract to build against later rather than inventing event names per-integration.

## Document stack, for orientation

- Platform principles — *why* (`docs/architecture/platform/01-platform-principles.md`)
- Product ownership — *who owns what* (`09-workspace-master-data.md`)
- ADR decisions — *why specific choices were made* (`docs/decisions.md`)
- Migration roadmap — *how to get there* (`06-commerce-core-migration-roadmap.md`)
- Verification — *did we get there?* (`08-phase2-verification.md`)
- Event catalog — *how products communicate* (this document)
