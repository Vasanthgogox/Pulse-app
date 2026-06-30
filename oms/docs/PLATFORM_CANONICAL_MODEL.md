# Pulse Platform Canonical Model

**The platform constitution.** When someone asks *"Where should this live?"* — the answer is here.

Architecture v1.0 boundaries are frozen. This document freezes **names, IDs, lifecycles, events, and ownership** so services evolve without inventing parallel vocabularies.

Related: [ROADMAP.md](./ROADMAP.md) · [PLATFORM_PRINCIPLES.md](./PLATFORM_PRINCIPLES.md)

---

## Bounded contexts

### Business domains (consumers of Platform)

| Context | Owns | Does not own |
|---------|------|----------------|
| **Commerce** | Products, Inventory, Customers, Sales Orders | Execution plans (Planning), indents, trips, platform infra |
| **Planning** | Execution Plans (draft → publish command) | Indents, trips, POD, command store |
| **Execution** | Indents, Dispatch, Trips, Drivers, Vehicles, POD | Orders, catalog, invoices, timeline storage |
| **Finance** | Settlement, Invoices, Ledger | Trips, catalog |
| **Network** | Marketplace, carriers, bidding | Core commerce/execution |
| **Intelligence** | Recommendations, forecasts (no owned state) | Business commits |

### Pulse Platform domain (dedicated team ownership)

**These capabilities must not be owned by Commerce, Execution, or Finance.** They scale organizationally as a Platform team.

```
Pulse Platform
├── Gateway
├── Identity
├── Reference Data
├── Configuration          ← tenant settings, defaults, feature toggles, integration refs
├── Command Store            ← idempotency + full command lifecycle (not a key-value cache)
├── Domain Events            ← business state propagation between services
├── Platform Timeline        ← append-only operational history (≠ event store)
├── Observatory              ← visualization (graph projection)
├── Search
├── Notifications
├── Feature Flags
├── Secrets / Configuration
└── API Contracts            ← OpenAPI → consumer contracts (Pact)
```

Business domains **consume** Platform via Gateway and APIs. They do not embed command stores, timeline tables, or idempotency logic locally.

| Context | Owns | Does not own |
|---------|------|----------------|
| **Identity** | Organization, Business Unit, Warehouse, User, Invitation, Role (minimal) | Products, orders, trips |
| **Reference Data** | Master data lookups (vehicle types, UoM, currencies, etc.) | Business transactions |
| **Configuration** | Tenant settings, default SLA, timezone, currency, workflow rules, integration credential refs | Domain entity state |
| **Command Store** | Command lifecycle, idempotency, replay metadata | Business entities |
| **Events API** | Event envelope contract, ingest, correlation index | Business state |
| **Platform Timeline** | Append-only operational history | Domain event bus transport |

### Context diagram

```
                         ┌──────────────────────────────────┐
                         │         Pulse Platform           │
                         │ Gateway · Command Store · Timeline │
                         │ Identity · Ref Data · Config     │
                         └───────────────┬──────────────────┘
                                         │
     ┌───────────────┬───────────────────┼───────────────────┬───────────────┐
     ▼               ▼                   ▼                   ▼               ▼
┌─────────┐   ┌─────────┐         ┌─────────┐         ┌─────────┐   ┌─────────┐
│Commerce │   │Planning │         │Execution│         │ Finance │   │ Network │
└─────────┘   └─────────┘         └─────────┘         └─────────┘   └─────────┘
```

**Identity** and **Reference Data** are Platform capabilities; **Configuration** is separate from Reference Data (tenant-specific vs global lookups).

---

## Entities by context

### Identity (Phase 1A Sprint 1 — highest priority)

Contract: [api/identity-v1.yaml](./api/identity-v1.yaml) → migration → service → JWT.

Nothing else invents `tenantId`, `organizationId`, `businessUnitId`, warehouse scope, user, or roles.

| Entity | Description | Owned fields |
|--------|-------------|--------------|
| **Organization** | Tenant root | `id`, `name`, `legal_name`, `tenant_id`, `created_at` |
| **Business Unit** | Sub-org division (flat, not a tree) | `id`, `organization_id`, `name`, `code` |
| **Warehouse** | Fulfillment location | `id`, `organization_id`, `business_unit_id?`, `name`, `code`, `address` |
| **User** | Person who logs in | `id`, `organization_id`, `email`, `name`, `role` |
| **Invitation** | Pending team member | `id`, `organization_id`, `email`, `role`, `status`, `expires_at` |

**Defer until customers demand:** team hierarchies, branch trees, fine-grained permissions, SSO, OAuth providers, audit policies.

**Roles (Phase 1A only):**

| Role | Capabilities |
|------|--------------|
| **Admin** | Org setup, users, warehouses, all commerce |
| **Planner** | Products, customers, orders, execution plans |
| **Operator** | Dispatch, trips, POD (Operations workspace) |

### Reference Data (introduce early)

| Lookup type | Examples |
|-------------|----------|
| Vehicle Types | TATA ACE, 14FT, 20FT, 32FT, 40FT |
| Packaging Types | Carton, Pallet, Crate |
| Units of Measure | EA, KG, M3, L |
| Currencies | INR, USD, EUR |
| Tax Codes | GST 5%, GST 12%, … |
| Incoterms | EXW, FOB, CIF |
| Hazard Classes | Class 1–9 |
| Temperature Types | Ambient, Cold Chain, Frozen |
| Order Priorities | Standard, Express, Critical |
| Service Levels | Same Day, Next Day, Standard |
| Stop Types | Pickup, Drop |

Reference Data is **read-only** for all other services. Commerce and Planning store **codes** (e.g. `vehicle_type_code: "32FT"`), not display strings.

### Configuration (Platform — introduce with Reference Data)

Tenant-specific and deployment settings — **not** scattered across domain services.

| Category | Examples | vs Reference Data |
|----------|----------|-------------------|
| Tenant settings | Default currency, timezone, locale | Reference Data = global codes; Configuration = tenant choice |
| Operational defaults | Default SLA hours, vehicle type preference | |
| Feature toggles | Enable planning merge, beta integrations | |
| Integration refs | Shopify shop ID, webhook secret **ref** (not secret storage in domain DB) | Secrets vault holds values; Configuration holds refs |
| Workflow rules | Auto-confirm orders under ₹X | |

| Method | Path |
|--------|------|
| `GET` | `/configuration/{tenantId}` |
| `GET` | `/configuration/{tenantId}/{key}` |
| `PUT` | `/configuration/{tenantId}/{key}` |

Every domain reads configuration through Platform — no per-service copies of tenant defaults.

### Commerce (Phase 1B)

| Entity | Description |
|--------|-------------|
| **Product** | Catalog SKU with weight, volume, dimensions |
| **Inventory** | Stock level per product per warehouse |
| **Customer** | CRM profile with billing/shipping addresses |
| **Sales Order** | Canonical order — all sources normalize here |
| **Order Line** | Product, qty, unit price, weight, volume |

### Planning (Phase 1B surface; may share deploy with Commerce initially)

| Entity | Description |
|--------|-------------|
| **Execution Plan** | Stops, route, allocations, constraints from one or more orders |
| **Plan Stop** | Pickup or drop with address, contact, POD flag |
| **Shipment Allocation** | Order lines mapped to pickup/drop stops |

### Execution (Phase 3+)

| Entity | Description |
|--------|-------------|
| **Indent** | Execution-side acceptance of a published plan |
| **Trip** | Assigned vehicle + driver executing stops |
| **Trip Stop** | Sequential stop with status and POD |
| **Fleet Driver** | Driver master (Execution or Identity — TBD at implement; **Execution owns dispatch assignment**) |
| **Fleet Vehicle** | Vehicle master |

### Finance (post-pilot)

| Entity | Description |
|--------|-------------|
| **Settlement** | Amounts owed/earned from completed trip |
| **Invoice** | Bill to customer |
| **Payment** | Cash application |

---

## Canonical ID formats

IDs are **human-readable in logs and support**. Services generate IDs; format is mandatory.

| Entity | Format | Example |
|--------|--------|---------|
| Tenant | `TENANT-{6 digits}` | `TENANT-000001` |
| Organization | `ORG-{6 digits}` | `ORG-000001` |
| Business Unit | `BU-{6 digits}` | `BU-000001` |
| Warehouse | `WH-{6 digits}` | `WH-000123` |
| User | `USR-{6 digits}` | `USR-000042` |
| Membership | `MEM-{6 digits}` | `MEM-000101` |
| Invitation | `INV-{6 digits}` | `INV-000007` |
| Product | `PRD-{6 digits}` | `PRD-000456` |
| Customer | `CUS-{6 digits}` | `CUS-000789` |
| Sales Order | `SO-{YYYY}-{6 digits}` | `SO-2026-000001` |
| Execution Plan | `EP-{YYYY}-{6 digits}` | `EP-2026-000001` |
| Indent | `IND-{YYYY}-{6 digits}` | `IND-2026-000001` |
| Trip | `TRP-{YYYY}-{6 digits}` | `TRP-2026-000001` |
| Invoice | `INV-{YYYY}-{6 digits}` | `INV-2026-000001` |
| Correlation | `COR-{UUID short}` | `COR-a1b2c3d4` |

**Rules:**

- IDs are immutable once issued.
- Cross-service references use these IDs only — no duplicate surrogate keys in APIs.
- Year in transactional IDs resets sequence per calendar year (configurable per tenant later).

---

## Canonical lifecycles

Statuses are **closed enums**. Services react to transitions; they do not invent local status strings.

### Sales Order

```
Draft → Confirmed → Planned → Published → Allocated → In Transit → Delivered → Settled → Closed
                                                                              ↘ Cancelled (from Confirmed+)
```

| Status | Owner | Meaning |
|--------|-------|---------|
| `draft` | Commerce | Created, not submitted |
| `confirmed` | Commerce | Customer order accepted |
| `planned` | Planning | Included in execution plan |
| `published` | Planning | Plan published to Execution |
| `allocated` | Execution | Indent/trip created |
| `in_transit` | Execution | Trip started |
| `delivered` | Execution | All drops complete + POD |
| `settled` | Finance | Settlement recorded |
| `closed` | Commerce | Terminal success |
| `cancelled` | Commerce | Terminal failure |

**Prototype mapping (retire):** `Pending Consolidation` → `confirmed`; `Planned` → `planned`; `Fulfilled` → `delivered` or `closed`.

### Execution Plan

```
Draft → Ready → Published → Accepted → Dispatched → Completed → Archived
                                              ↘ Cancelled
```

| Status | Owner | Meaning |
|--------|-------|---------|
| `draft` | Planning | Being built |
| `ready` | Planning | Validated, not yet published |
| `published` | Planning | Sent to Gateway / Execution |
| `accepted` | Execution | Indent created |
| `dispatched` | Execution | Driver + vehicle assigned |
| `completed` | Execution | All stops done |
| `archived` | Planning | Terminal, read-only |
| `cancelled` | Planning or Execution | Terminal failure |

### Trip (Execution)

```
Pending → Assigned → In Progress → Completed → Cancelled
```

---

## Frozen platform contracts (v1)

| Contract | Doc | Package |
|----------|-----|---------|
| Command Envelope | [contracts/COMMAND_ENVELOPE.md](./contracts/COMMAND_ENVELOPE.md) | `@pulse/contracts` |
| Event Envelope | [contracts/EVENT_ENVELOPE.md](./contracts/EVENT_ENVELOPE.md) | `@pulse/contracts` |

**Evolution:** never remove fields; only add optional fields in new `schemaVersion` values.

Event envelope required fields: `eventId`, `eventName`, `eventVersion`, `schemaVersion`, `occurredAt`, `tenantId`, `correlationId`, `causationId?`, `parentEventId?`, `payload`.

Command envelope required fields: `commandId`, `commandName`, `commandVersion`, `schemaVersion`, `idempotencyKey`, `correlationId`, `causationId?`, `tenantId`, `payload`.

Internal **`PlatformRuntime.executeCommand()`** orchestrates command store, timeline, and events for all business services. Public `@pulse/sdk` in Phase 5.

---

**These are related but must not share storage or optimization strategy.**

| Component | Purpose | Primary consumer |
|-----------|---------|------------------|
| **Domain Events** | Business state propagation between services | Services (async handlers) |
| **Platform Timeline** | Append-only operational history | Humans, AI, Support |
| **Observatory** | Visualization (projections over Timeline) | Operations |
| **Analytics** | KPIs, reporting, BI | Leadership, Finance |

Domain events may be transported via Kafka later. Timeline is Postgres append-only with projection queries. Do not overload one store for both.

---

## Domain events

Envelope (all events):

```json
{
  "eventId": "EVT-…",
  "eventName": "SalesOrderConfirmed",
  "eventVersion": 1,
  "occurredAt": "2026-06-29T12:00:00Z",
  "correlationId": "COR-a1b2c3d4",
  "causationId": "cmd-uuid-or-entity-id",
  "parentEventId": "EVT-parent-…",
  "tenantId": "…",
  "organizationId": "ORG-000001",
  "source": "commerce",
  "payload": { }
}
```

**`causationId` vs `parentEventId`:** Do not overload causation for graph hierarchy.

| Field | Meaning | Example |
|-------|---------|---------|
| `causationId` | Direct cause (command or entity that triggered this event) | `PublishExecutionPlan` command ID |
| `parentEventId` | Visual/logical parent in Observatory graph | `OrderConfirmed` event ID |

Example chain:

```
OrderConfirmed          (parent for graph: none)
    ↓ parentEventId
PublishExecutionPlan    (causation: order ID)
    ↓
ExecutionPlanPublished (causation: publish command; parentEventId: OrderConfirmed)
```

**Do not persist graph edges separately.** Raw timeline is source of truth; graph is a **projection** (recursive CTE over `parent_event_id`).

### Event catalog (initial)

| Event | Source | Trigger |
|-------|--------|---------|
| `OrganizationCreated` | Identity | Org registered |
| `WarehouseCreated` | Identity | Warehouse added |
| `UserInvited` | Identity | Invitation sent |
| `SalesOrderCreated` | Commerce | `POST /orders` |
| `SalesOrderConfirmed` | Commerce | Order confirmed |
| `ExecutionPlanCreated` | Planning | Plan created |
| `ExecutionPlanPublished` | Planning | `POST …/publish` |
| `IndentCreated` | Execution | Plan accepted |
| `DriverAssigned` | Execution | Dispatch |
| `TripStarted` | Execution | First stop |
| `StopCompleted` | Execution | Pickup/drop done |
| `PODUploaded` | Execution | POD attached |
| `TripCompleted` | Execution | All stops done |
| `SettlementCompleted` | Finance | Settlement posted |
| `InvoiceGenerated` | Finance | Invoice created |

Consumers update their bounded context state from events — they do not poll sibling databases.

---

## API naming conventions

### REST

- **Plural nouns:** `/products`, `/orders`, `/execution-plans`
- **Kebab-case paths:** `/execution-plans/{id}/publish`
- **Version prefix:** `/api/v1/commerce/…`, `/api/v1/identity/…`
- **Gateway routing:** `/api/gateway/v1/{service}/…`

### Commands vs queries

| Pattern | Use |
|---------|-----|
| `POST` | Create resource or command |
| `GET` | Read |
| `PUT` | Full replace |
| `PATCH` | Partial update |
| `POST …/publish` | Domain command (not CRUD) |

### Headers (all authenticated requests)

| Header | Purpose |
|--------|---------|
| `Authorization` | Bearer token |
| `X-Tenant-Id` | Tenant scope |
| `X-Organization-Id` | Org scope |
| `X-Correlation-Id` | Trace (client may supply; server always returns) |

---

## API contracts by phase

### Identity API (Phase 1A Sprint 1)

OpenAPI: [api/identity-v1.yaml](./api/identity-v1.yaml)  
Physical model: [PLATFORM_ENTITY_MODEL.md](./PLATFORM_ENTITY_MODEL.md)

| Method | Path |
|--------|------|
| `POST` | `/organizations` |
| `POST` | `/business-units` |
| `POST` | `/warehouses` |
| `POST` | `/users/invite` |
| `POST` | `/auth/login` |
| `GET` | `/auth/me` |

### Reference Data API (Phase 1A Sprint 2)

| Method | Path |
|--------|------|
| `GET` | `/reference/{type}` |
| `GET` | `/reference/{type}/{code}` |

Types: `vehicle-types`, `units-of-measure`, `currencies`, `order-priorities`, `stop-types`, etc.

### Commerce API (Phase 1B)

| Method | Path |
|--------|------|
| `POST` | `/products` |
| `POST` | `/inventory` |
| `POST` | `/customers` |
| `POST` | `/orders` |
| `GET` | `/orders` |
| `PUT` | `/orders/{id}` |

### Planning API (Phase 1B — may ship with Commerce deploy)

| Method | Path |
|--------|------|
| `POST` | `/execution-plans` |
| `GET` | `/execution-plans` |
| `PUT` | `/execution-plans/{id}` |
| `POST` | `/execution-plans/{id}/publish` |

### Execution API (post-pilot integration)

| Method | Path |
|--------|------|
| `POST` | `/dispatch` |
| `POST` | `/assign-driver` |
| `POST` | `/complete-stop` |
| `POST` | `/upload-pod` |

### Events API (contract now; implementation can follow)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/events` | Ingest event (internal/gateway) |
| `GET` | `/events?correlationId={id}` | Trace by correlation |
| `GET` | `/events/{entityType}/{entityId}` | History for entity |

Backend may later map to Kafka; **clients depend on this contract only**.

---

## Command Store (Platform — not a key-value idempotency cache)

Gateway and domain services record **every mutating command** with full lifecycle. Enables deterministic retries, replay, audit, debugging, metrics, and ops dashboards ("commands stuck > 5 min") without a separate subsystem.

### Record schema

| Field | Type | Purpose |
|-------|------|---------|
| `command_id` | UUID | Primary key |
| `tenant_id` | string | Tenant scope |
| `command_name` | string | e.g. `PublishExecutionPlan` |
| `command_version` | int | Handler version |
| `schema_version` | int | Payload schema version |
| `idempotency_key` | string | Client-supplied (unique per tenant + command) |
| `status` | enum | See lifecycle below |
| `processing_started_at` | timestamptz | |
| `completed_at` | timestamptz | |
| `expires_at` | timestamptz | Idempotency record TTL |
| `request_hash` | string | Detect payload change on same key |
| `request_payload` | jsonb | Stored request (redact secrets) |
| `response_payload` | jsonb | Stored response |
| `response_code` | int | HTTP or domain code |
| `correlation_id` | string | Trace |
| `causation_id` | string | Upstream command or entity |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### Command lifecycle

```
RECEIVED → PROCESSING → COMPLETED
                │
         (timeout expires)
                ▼
              STALE → RETRYING → COMPLETED
                              ↘ FAILED
```

| Status | Meaning |
|--------|---------|
| `RECEIVED` | Accepted, not yet executing |
| `PROCESSING` | Handler running |
| `COMPLETED` | Success; return cached response on idempotent replay |
| `STALE` | PROCESSING exceeded timeout — visible to operators |
| `RETRYING` | Retry worker claimed; not silent re-entry |
| `FAILED` | Terminal error |

**Optimistic recovery:** On timeout, transition `PROCESSING → STALE` (do not silently reprocess). A **retry worker** owns `STALE → RETRYING → COMPLETED`. Operators see stuck commands in dashboards.

Duplicate `idempotency_key` with same `request_hash` → return `response_payload` from `COMPLETED`. Same key, different hash → `409 Conflict`.

### Implementation rules (Sprint 1)

| Rule | Detail |
|------|--------|
| Unique index | `(tenant_id, idempotency_key)` |
| Idempotent accept | `INSERT ... ON CONFLICT DO NOTHING` |
| Status transitions | Serializable transaction |
| Stale detection | Timeout worker: `PROCESSING → STALE` (no silent reprocessing) |
| Retry | Dedicated worker: `STALE → RETRYING → COMPLETED \| FAILED` |
| Replay | Return stored `response_payload` from `COMPLETED` |

Gateway writes every mutating command. Business services do not maintain local command stores.

---

## Platform Timeline

Append-only table. **Source of truth** for operational history. Not the domain event bus. **Build before Observatory** — Observatory is a projection only.

### Write authority

Only **Gateway** or **Platform Event Publisher** may insert Timeline rows. Business services (Commerce, Execution, Finance) **never** write Timeline directly.

### Write path (every successful command)

```
Command received → Command completed → Platform event → Timeline entry
```

Observatory, Support, and AI Context **read** from Timeline projections — they do not own storage.

### Storage tiers

| Tier | Scope | Index strategy |
|------|-------|----------------|
| **Hot** | Last 30 days | Partial index on `occurred_at`, `correlation_id`, `entity_id` |
| **Warm** | 30 days – 12 months | Standard B-tree indexes |
| **Cold** | Archive | Monthly partitions: `platform_timeline_2026_01`, `platform_timeline_2026_02`, … |

Use PostgreSQL native partitioning when volume warrants. Do not optimize Timeline like a message queue.

### Projections (all derived from same append-only table)

| Projection | Sort / shape | Consumer |
|------------|--------------|----------|
| **Timeline** | Newest first | Support engineers |
| **Graph** | DAG via `parent_event_id` recursive CTE | Observatory |
| **Entity** | All events for `SO-2026-000123` | Customer support |

Never maintain separate edge tables for the graph — project at read time.

---

## Webhook versioning (inbound integrations)

**Version belongs in the URL for inbound webhooks** — you do not control the caller.

```
POST /webhooks/shopify/v1/orders
POST /webhooks/shopify/v2/orders
```

**Internal APIs** remain versioned separately:

```
POST /api/v1/orders
```

Inbound adapters normalize to canonical `SalesOrder` regardless of webhook version.

---

## API contract evolution (consumer-driven)

| Phase | Deliverable |
|-------|-------------|
| **1** | OpenAPI specs per service (Identity, Commerce, Planning, Execution) |
| **2** | Consumer contracts (Pact or equivalent) — deployed behavior verified |
| **3** | Breaking changes require contract approval + compatibility matrix update |

Prevents: documentation correct, production behavior wrong.

---

## Ownership rules

| Question | Answer |
|----------|--------|
| Who creates Organization ID? | Identity Service |
| Who writes Sales Order status? | Commerce (until `published`; then event-driven) |
| Who moves order to `in_transit`? | Execution via event; Commerce consumes |
| Who owns vehicle type labels? | Reference Data (read); Execution stores code |
| Who creates Indent? | Execution Service only |
| Can Commerce UI insert into `indents` table? | **Never** |
| Where do dropdown values come from? | Reference Data API |
| Who generates correlation ID? | Gateway (or originating service; propagated everywhere) |
| Where do idempotent commands persist? | Platform Command Store (Gateway writes) |
| Where does support look up order history? | Platform Timeline entity projection |
| Where do services read tenant default SLA? | Configuration API (not Commerce DB) |
| Shopify webhook URL? | `/webhooks/shopify/v1/orders` — not `/api/v1/orders` |

---

## Sales Order sources

All sources normalize to the same `SalesOrder` entity and lifecycle:

Manual · Shopify · WooCommerce · API · CSV · EDI · Marketplace

`source` and `external_id` are metadata on the order; lifecycle is identical.

---

## Compatibility matrix (initial)

| Service | Version | Compatible With |
|---------|---------|-----------------|
| Identity | 1.0 | Commerce 1.0+, Reference Data 1.0+ |
| Reference Data | 1.0 | All services (read) |
| Configuration | 1.0 | All services (read) |
| Command Store | 1.0 | Gateway 1.0+ |
| Timeline / Events API | 1.0 | Observatory 1.0, all publishers |
| Commerce | 1.0 | Planning 1.0, Reference Data 1.0 |
| Planning | 1.0 | Execution 1.0 |
| Execution | 1.0 | Driver 1.0, Operations UI 1.0 |
| Events | 1.0 | All publishers/consumers |
| Finance | 1.0 | Execution 1.0+ |
| SDK | 1.0 | All APIs frozen at 1.0 |

---

## Document changelog

| Date | Change |
|------|--------|
| 2026-06-29 | Initial constitution — IDs, lifecycles, contexts, APIs |
| 2026-06-29 | Platform domain, Command Store, Timeline projections, Configuration, consumer contracts |
| 2026-06-29 | Phase 1A reframed as Pulse Platform Foundation; Sprint 1/2; Identity contract; Timeline write authority |

**Amendment process:** Changes require explicit review. Lifecycle and ID format changes are breaking — bump event versions and compatibility matrix.
