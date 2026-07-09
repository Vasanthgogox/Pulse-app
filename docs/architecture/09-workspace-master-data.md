# Workspace Master Data — Target Ownership Architecture (Frozen)

Layer 3 domain document (`00-platform-reconciliation.md`'s three-layer framework). Sits between the current-state audit and the migration roadmap:

```
03-workspace.md
        │
04-products.md
        │
07-domain-ownership-audit.md   ← what exists today
        │
09-workspace-master-data.md    ← this document — what the architecture should become (frozen)
        │
06-commerce-core-migration-roadmap.md   ← how to migrate from 07 → 09
        │
implementation
```

(Numbered `09`, not `08` — `08-phase2-verification.md` already exists as the Phase 2 architectural checklist and is a different document.)

This document defines **ownership only** — which product is authoritative for which entity, and the law governing how products communicate. It does not sequence migration work, estimate effort, or specify schema/table names; that belongs in `06`. Once frozen, changing an ownership assignment here means re-opening a decision every product built against it depends on — treat edits to this document as seriously as `docs/architecture/platform/`.

## Ownership

**Workspace owns master data** — single source of truth, shared by every product:
- Organization
- Membership
- Customer
- Warehouse
- Workspace settings
- Shared contacts
- Shared addresses

**Commerce owns commercial transactions:**
- Products
- Inventory
- Orders
- Pricing
- Quotations

**Core owns execution:**
- Indents
- Trips
- Vehicles
- Drivers
- Tracking
- POD
- Route execution

**Finance owns financial records:**
- Receivables
- Payables
- Ledger
- Escrow
- Settlement

Products never own master data. Products own transactions.

## Entity Classification

Every entity in the suite falls into exactly one of three categories. This classification is what resolves future ambiguity — e.g. when someone proposes moving Orders into Workspace because multiple products read them, this table is the answer: Orders are transactional, so they stay Commerce-owned regardless of how many products consume them.

| Category | Examples | Rule |
|---|---|---|
| **Master Data** | Customer, Warehouse, Organization, Membership | Shared across products, single source of truth, owned by Workspace |
| **Transactional Data** | Orders, Trips, Indents, Invoices | Owned by exactly one product, even when other products consume it |
| **Reference Data** | Vehicle types, UOM, Tax codes, Incoterms | Shared, mostly read-only, no single product "owns" it in the transactional sense |

## Law: Cross-Product Communication

**Products never manipulate another product's transaction tables directly. Everything flows through services or events.**

```
Commerce
   │
   Order Released
   │
   ▼
ExecutionOrchestrator
   │
   ▼
Core
   │
   Indent Created
   │
   ▼
Trip
   │
   ▼
POD
   │
   ▼
Finance
```

Commerce calling `ExecutionOrchestrator.publishIndent(orderId)` (see `lib/platform/orchestration/EXECUTION_ORCHESTRATOR.contract.md`) and never writing to `indents`/`trips` directly is the concrete instance of this law, in the same way Master Data ownership is the concrete instance of Law #1/#3 in `docs/architecture/platform/01-platform-principles.md`. This document's law is that architecture's law, applied to the Commerce/Core/Finance boundary specifically — not a new rule.

**Naming standardized on `ExecutionOrchestrator`, not `ExecutionService`:** it coordinates multiple domain services (Order, Customer, Warehouse), emits events, and manages workflow — that's orchestration, not a single API boundary. Reserve `*Service` names for lower-level domain services inside a product (e.g. a future Core-internal `IndentService`).

## Law: One System of Record

**A business capability has exactly one system of record. Other products may project, cache, or enrich that data, but they do not become authoritative for it.**

This complements the ownership model above and resolves the case the ownership table doesn't cover by itself — *displaying* an entity is not the same as *owning* it:

- Commerce may display Trips → Core remains the system of record.
- Core may display Orders → Commerce remains the system of record.
- Finance may display Customers → Workspace remains the system of record.

A product rendering another product's data is expected and encouraged (that's the whole point of shared master data and published events); a product treating its own copy of that data as authoritative — accepting writes, resolving conflicts locally, or drifting out of sync with the real owner — is the failure mode this law exists to name and forbid.

## Law: Four Validations Before Any State-Changing Action

**Every state-changing business action must pass four platform validations before execution: Identity, Relationship, Permission, Financial Integrity.**

1. **Identity** — who is performing the action? (Is there a real, authenticated user behind this request?)
2. **Relationship** — are the parties authorized to transact with each other? (`docs/architecture/11-relationship-guard-v1.md`'s `RelationshipService.canAward()` is the first concrete instance of this check.)
3. **Permission** — does the actor have permission for this specific action within their workspace? (Role, feature flag, ownership, approval chain.)
4. **Financial Integrity** — will this action leave the ledger in a valid state? (`docs/FINANCE_ACCEPTANCE_GATE_v1.md` is the concrete backing for this check.)

This is a platform-wide invariant, not a feature-specific rule — it belongs alongside "One System of Record" for the same reason: it's a law every product's write path answers to, not a design choice any single product gets to opt out of. Not every action needs all four to be *meaningful* (e.g. a pure master-data read has no financial-integrity dimension), but no action gets to skip a validation that *is* meaningful for it just because implementing the check is inconvenient. `AwardBid` is the first action this session scoped against — see `11-relationship-guard-v1.md`'s award guard for what "Relationship" looks like in practice; `IndentCreated`'s `ExecutionOrchestrator` validation (customer/warehouse must resolve, order must be dispatchable) is an existing instance of "Permission"/"Financial Integrity"-adjacent checks that predates this law being named.

## Relationship to `07`, `08`, and `06`

- `07-domain-ownership-audit.md` recorded what exists today, including two findings worth noting here since they affect how "frozen" this document actually is in practice: **Customer and Warehouse ownership already match this document** — both were consolidated onto `lib/platform/services/CustomerService`/`WarehouseService` during the same work that produced this document. This document is ratifying an already-substantially-real state for those two entities, not proposing a change from a cold start.
- `08-phase2-verification.md` is the checklist that verified the `07` state above and gated the start of orchestration design — read it before assuming Customer/Warehouse consolidation is fully clean; it lists specific documented exceptions (workflow read lookups, soft-delete variance).
- `06-commerce-core-migration-roadmap.md` should be read as the sequencing plan to close whatever gap remains between `07` and this document — Execution Service/Orchestrator and the event model are the two pieces that don't exist yet.
