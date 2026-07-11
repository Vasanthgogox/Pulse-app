# Platform Event Catalog

Layer 3 domain document, extending `09-workspace-master-data.md`'s "One System of Record" law with a concrete registry of the facts products publish and subscribe to. This is the canonical registry for event contracts — each event gets a standard definition (Business Owner, Emitted By, Aggregate, Version, Payload, Consumers, Guarantees), not just a name in a table.

## Implementation Status Matrix

Governance-level view — update this table in the same change that promotes or adds an event, per the Review Checklist below. "Verified" means a test exercises the publish call and its payload, not just that the code exists.

| Event | Status | Publisher | Consumer | Verified |
|---|---|---|---|---|
| `OrderReadyForDispatch` | ✅ Implemented | Commerce | Core, Analytics | Yes |
| `IndentCreated` | ✅ Implemented | Core | Commerce | Yes |
| `TripAssigned` | ✅ Implemented | Core | — (none wired up yet) | Yes |
| `TripStarted` | ✅ Implemented | Core | — (none wired up yet) | Yes |
| `TripDelivered` | ✅ Implemented | Core | — (none wired up yet) | Yes |
| `PODUploaded` | ✅ Implemented | Core | — (none wired up yet) | Yes |

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
| `TripAssigned` | ✅ Implemented |
| `TripStarted` | ✅ Implemented |
| `TripDelivered` | ✅ Implemented |
| `PODUploaded` | ✅ Implemented |

`OrderReadyForDispatch`/`IndentCreated` verified against `lib/platform/orchestration/ExecutionOrchestrator.ts`'s `publishIndent()`. `TripAssigned` verified against `updateTripAssignment()` in `features/trips/services/trips.service.ts` — a direct publish from Core's own service, not an orchestrator (see its entry below for why that's the right shape here). `TripStarted`/`TripDelivered` verified against `updateTripStatus()` in the same file, same shape — direct publish from Core's own service. `TripStarted` is idempotent via a new before-fetch check (this function has no optimistic-concurrency parameter to piggyback on); `TripDelivered` reuses the `wasAlreadyCompleted` before-fetch that already existed in this function for `ensureAssetCompletionAutoEntries`. `PODUploaded` verified against `uploadTripDocument()` in `features/trips/services/tripDocuments.service.ts` — no idempotency guard needed there, since every call writes to a fresh, randomly-generated storage path, so there is no "retry of the same commit" to dedupe.

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
- **Emitted By:** `updateTripAssignment()` (`features/trips/services/trips.service.ts`) — not an orchestrator, a direct publish from Core's own trip-assignment service. No `TripService`/orchestration layer exists for Core yet, and this event didn't need one — see the note on this below.
- **Aggregate:** Trip
- **Version:** v1
- **Consumers:** Commerce (status sync) — no real consumer wired up yet; recorded here as the intended one, per `09-workspace-master-data.md`'s ownership table
- **Guarantees:** Published exactly once per successful commit, only when `data.driver_id != null` (vehicle-only reassignment does not fire it). A stale-`expectedUpdatedAt` retry is rejected by the existing optimistic-concurrency check *before* reaching the publish call, which is what makes retries idempotent — there's no separate dedup mechanism, the idempotency comes from the same guard that already existed for the audit trail.

| Payload Field | Status |
|---|---|
| `tripId` | ✅ Implemented |
| `indentId` | ✅ Implemented (nullable — trips without a linked indent publish `null`) |
| `driverId` | ✅ Implemented |
| `vehicleId` | ✅ Implemented (nullable) |
| `correlationId` | ✅ Implemented (envelope, freshly generated per publish — no caller-supplied command envelope exists for this path) |
| `workspaceId` | ✅ Implemented (envelope, `trip.organization_id`) |
| `occurredAt` | ✅ Implemented (envelope) |

(Verified directly from `updateTripAssignment()` — payload confirmed by reading the publish call, not inferred. Tests: `features/trips/services/__tests__/updateTripAssignment.tripAssigned.test.ts` — success emits exactly one event with the exact payload above, a rejected conflict emits none, a stale-retry emits none, a vehicle-only update emits none.)

**Note on "Emitted By" not being an orchestrator:** `09-workspace-master-data.md`'s law says Business Owner and Emitted By can differ, but doesn't require every event to go through an orchestration layer — `OrderReadyForDispatch`/`IndentCreated` go through `ExecutionOrchestrator` because that's a genuine cross-product coordination point (Commerce calling into Core). `TripAssigned` is Core publishing about its own domain with no cross-product write on the other side yet; adding an orchestrator here now would be exactly the premature abstraction this session has repeatedly avoided (see `09`'s deferred `ProductEvaluator`, `11`'s deferred universal trust layer). Revisit if/when a real Commerce-side consumer needs more than "Business Owner: Core, Emitted By: Core's own service."

### `TripStarted`
- **Business Owner:** Core
- **Emitted By:** `updateTripStatus()` (`features/trips/services/trips.service.ts`) — same shape as `TripAssigned`: a direct publish from Core's own trip-status service, not an orchestrator. No cross-product write exists on the other side yet, so an orchestration layer would be premature here for the same reason it's premature for `TripAssigned` (see that entry's note).
- **Aggregate:** Trip
- **Version:** v1
- **Consumers:** Commerce — no real consumer wired up yet; recorded here as the intended one, per `09-workspace-master-data.md`'s ownership table
- **Guarantees:** Published exactly once, only when a status update sets `started_at` to a non-empty value. Idempotency guard: a before-fetch reads the trip's current `started_at` immediately before the update; if it was already non-empty, the publish is skipped — this makes a retry that re-sends the same `started_at` a no-op for this event, mirroring `TripAssigned`'s guarantee but via an explicit check instead of an optimistic-concurrency parameter, since `updateTripStatus()` has none.

| Payload Field | Status |
|---|---|
| `tripId` | ✅ Implemented |
| `indentId` | ✅ Implemented (nullable — trips without a linked indent publish `null`) |
| `driverId` | ✅ Implemented (nullable) |
| `vehicleId` | ✅ Implemented (nullable) |
| `startedAt` | ✅ Implemented |
| `correlationId` | ✅ Implemented (envelope, freshly generated per publish) |
| `workspaceId` | ✅ Implemented (envelope, `trip.organization_id`) |
| `occurredAt` | ✅ Implemented (envelope) |

(Verified directly from `updateTripStatus()` — payload confirmed by reading the publish call, not inferred. Tests: `features/trips/services/__tests__/updateTripStatus.tripStarted.test.ts` — success emits exactly one event with the exact payload above, an update without `started_at` emits none, a retry where `started_at` was already set emits none, a failed commit emits none, an invalid status emits none.)

### `TripDelivered`
- **Business Owner:** Core
- **Emitted By:** `updateTripStatus()` (`features/trips/services/trips.service.ts`) — same shape as `TripAssigned`/`TripStarted`: a direct publish from Core's own trip-status service, not an orchestrator, for the same reason (see `TripAssigned`'s note).
- **Aggregate:** Trip
- **Version:** v1
- **Consumers:** Commerce, Finance — no real consumer wired up yet; recorded here as the intended ones, per `09-workspace-master-data.md`'s ownership table
- **Guarantees:** Published exactly once, only when the trip transitions into `COMPLETED_STATUS_SET` (`completed`/`delivered`/`done`) for the first time. Idempotency guard: reuses the same `wasAlreadyCompleted` before-fetch this function already computed for `ensureAssetCompletionAutoEntries` — a retry that re-sends the same completed status is a no-op for this event too, with no separate dedup mechanism needed.
- **Naming rationale:** not `TripCompleted` — a trip's terminal state can be delivered, cancelled, aborted, failed, or expired. "Completed" is an implementation-state word that would get overloaded the moment a second terminal state is needed. "Delivered" is the specific business outcome this event names; `TripCancelled`/`TripFailed`/`TripAborted` are the correct future events for the other terminal states, not variants of "completed."
- **`orderId` omitted from payload:** the original contract target listed `orderId`, but `trips` rows carry no `order_id` column — only `indent_id`. Publishing a guessed or joined `orderId` would violate the "reflects the actual call site" rule. A consumer that needs the order can resolve it via `indentId` once a real one exists; revisit if that becomes a real bottleneck.

| Payload Field | Status |
|---|---|
| `tripId` | ✅ Implemented |
| `indentId` | ✅ Implemented (nullable — trips without a linked indent publish `null`) |
| `driverId` | ✅ Implemented (nullable) |
| `vehicleId` | ✅ Implemented (nullable) |
| `deliveredAt` | ✅ Implemented (from `completed_at`) |
| `correlationId` | ✅ Implemented (envelope, freshly generated per publish) |
| `workspaceId` | ✅ Implemented (envelope, `trip.organization_id`) |
| `occurredAt` | ✅ Implemented (envelope) |

(Verified directly from `updateTripStatus()` — payload confirmed by reading the publish call, not inferred. Tests: `features/trips/services/__tests__/updateTripStatus.tripDelivered.test.ts` — success emits exactly one event with the exact payload above, a non-completion status update emits none, a retry where the trip was already completed emits none, a failed commit emits none, a supplier-link validation block emits none.)

### `PODUploaded`
- **Business Owner:** Core
- **Emitted By:** `uploadTripDocument()` (`features/trips/services/tripDocuments.service.ts`), gated to `documentType === 'pod'` — same shape as the other Trip-lifecycle events: a direct publish from Core's own service, not an orchestrator, for the same reason (see `TripAssigned`'s note).
- **Aggregate:** Trip
- **Version:** v1
- **Consumers:** Commerce, Finance — no real consumer wired up yet; recorded here as the intended ones, per `09-workspace-master-data.md`'s ownership table
- **Guarantees:** Published once per successful `pod` upload, at either of the function's two success returns — the real `trip_documents` insert, or the metadata-table-unavailable fallback (the function's own doc comment already treats a durable storage write as sufficient when the metadata table/schema-cache entry is missing). No idempotency guard is needed the way the other three events need one: `uploadTripDocument` writes to a fresh `randomUUID()` storage path on every call, so there's no "retry of the same commit" case — each successful call is a genuinely new document, not a repeat of a prior one. `workspaceId` is resolved via a small best-effort lookup of the trip's `organization_id` (not otherwise available inside this function); if that lookup fails, the publish is silently skipped rather than blocking the upload.
- **`orderId` omitted from payload:** same reasoning as `TripDelivered` — `trip_documents` rows carry no `order_id`, only `trip_id`. Omitted rather than guessed or joined.

| Payload Field | Status |
|---|---|
| `tripId` | ✅ Implemented |
| `documentId` | ✅ Implemented (the `trip_documents` row id, or a synthetic `storage-meta-*` id under the metadata-table-unavailable fallback) |
| `storagePath` | ✅ Implemented |
| `fileName` | ✅ Implemented |
| `uploadedBy` | ✅ Implemented (nullable) |
| `correlationId` | ✅ Implemented (envelope, freshly generated per publish) |
| `workspaceId` | ✅ Implemented (envelope, resolved via a `trips.organization_id` lookup by `tripId`) |
| `occurredAt` | ✅ Implemented (envelope) |

(Verified directly from `uploadTripDocument()`/`publishPodUploadedEvent()` — payload confirmed by reading the publish call, not inferred. Tests: `features/trips/services/__tests__/uploadTripDocument.podUploaded.test.ts` — success emits exactly one event with the exact payload above, a non-`pod` document type (e.g. `manifest`) emits none, a storage-upload failure emits none, a metadata-insert failure unrelated to a missing table emits none, and the metadata-table-unavailable fallback still emits exactly one event.)

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

Not needed today, but every event will eventually want a documented **Reliability** (e.g. at-most-once), **Ordering** (e.g. per-aggregate), **Idempotency** (e.g. required — a consumer receiving `IndentCreated` twice for the same `indentId` must not create two trips), and **Correlation** (required — every event in an Order→Indent→Trip→POD chain shares one `correlationId`, already true in code today) contract. Not filled in per-event yet — all six Implemented events now exist (`OrderReadyForDispatch`/`IndentCreated`/`TripAssigned`/`TripStarted`/`TripDelivered`/`PODUploaded`), each documented with its own per-event Guarantees line above, but a real cross-product *consumer* still doesn't exist for any Trip-lifecycle event, so generalizing Reliability/Ordering into one shared table would still be guessing the wrong shape from the publisher side alone. Revisit once a real consumer is wired up for any of them.

## Sequencing note

The Implemented section above is what already exists. All four Trip-lifecycle events (`TripAssigned`, `TripStarted`, `TripDelivered`, `PODUploaded`) are now implemented and verified, each a direct publish from Core's own service rather than an orchestrator — see each entry's note on why that's the right shape while no cross-product consumer exists yet. The next natural step for this catalog is wiring up a real consumer for one of them (most likely Commerce, or a future Finance product for `TripDelivered`/`PODUploaded`), not adding more Trip-lifecycle events speculatively. The Reserved section remains a non-prerequisite reference — it exists so Finance/Pilot integration has a reviewed contract to build against later rather than inventing event names per-integration.

## Document stack, for orientation

- Platform principles — *why* (`docs/architecture/platform/01-platform-principles.md`)
- Product ownership — *who owns what* (`09-workspace-master-data.md`)
- ADR decisions — *why specific choices were made* (`docs/decisions.md`)
- Migration roadmap — *how to get there* (`06-commerce-core-migration-roadmap.md`)
- Verification — *did we get there?* (`08-phase2-verification.md`)
- Event catalog — *how products communicate* (this document)
