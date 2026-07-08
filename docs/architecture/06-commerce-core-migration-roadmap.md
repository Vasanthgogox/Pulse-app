# Commerce/Core — Migration Roadmap

This is a Layer 3 domain document. It answers: how does Commerce (OMS) and Core converge on **the same workspace-owned records** without sync jobs or duplicate tables?

Since this roadmap was originally drafted, the Customer and Warehouse service-layer consolidation has been completed. The remaining work is primarily architectural decoupling (Execution Orchestrator, event model) and optional future schema evolution, rather than service consolidation.

## Status Summary

| Phase | Status | Scope |
|---|---|---|
| Phase 1 — Shared Master Data Services | ✅ Complete | `CustomerService`, `WarehouseService`, `ProductService` consolidated behind `lib/platform`; Core and Commerce consume the same service layer. |
| Phase 2 — Ownership Alignment | 🟡 Partially Complete | Customer and Warehouse ownership aligned. Product remains Commerce-owned by design. Organization/Membership remain shared identity services — still duplicate service-layer code, no data duplication (see `07-domain-ownership-audit.md`). Only future schema naming (`workspace_*`) remains, if ever needed. |
| Phase 3 — Execution Boundary | 🔜 Next | Contract locked (`lib/platform/orchestration/EXECUTION_ORCHESTRATOR.contract.md`), implementation may begin per `08-phase2-verification.md`'s gate. Establishes the Order → Indent contract; Commerce loses direct knowledge of execution internals. |
| Phase 4 — Event-Driven Integration | 🔜 Planned | Publish lifecycle events (`OrderReadyForDispatch`, `IndentCreated`, `TripStarted`, `PODUploaded`, etc.) for Finance, Marketplace, AI, and future products. Layer on top of Phase 3 — don't design the full event bus at the same time as the orchestration boundary. |
| Phase 5 — Workspace Schema Evolution | 📅 Future | Rename physical tables (e.g. `clients` → `workspace_customers`, `client_warehouses` → `workspace_warehouses`) only when there's clear value and migration capacity — infrastructure evolution, not a prerequisite for the architecture. `commerce_products` → `products` (migration `20261122000000_rename_commerce_products_to_products.sql`) is written but **verified NOT deployed** — `supabase migration list` shows it (and everything from `20261121000000` on) with an empty Remote column. Code currently targets `commerce_products` to match live reality. |

**Deployment prerequisite: confirm `20261122000000_rename_commerce_products_to_products.sql` has been applied to remote (`npm run db:push`) before switching `productRepository.ts` back to `products`, and before treating Phase 1's rename checklist item below as closed.** Also fixed in passing: two unrelated migrations shared the identical `20261122000000` timestamp — the unrelated one (`optimize_get_trip_assigner_displays_for_driver.sql`) was bumped to `20261122000001` to disambiguate; neither has been pushed yet so this was a safe rename.

Target ownership architecture, frozen: `09-workspace-master-data.md`. The detailed phase breakdown below predates this summary and uses its own Phase 1-4 numbering at finer granularity — both describe the same work.

**Authoritative schema (as of ADR-006):** platform services read/write existing `public` tables — not future `workspace_*` renames.

| Platform entity | Table (live, verified) | Target table (pending deploy) | Service |
|-----------------|-------------------------|-------------------------------|---------|
| Customer | `public.clients` | — (no rename planned) | `CustomerService` |
| Warehouse | `public.client_warehouses` | — (no rename planned) | `WarehouseService` |
| Product (catalog) | `public.commerce_products` | `public.products` (migration written, not deployed) | `ProductService` |

> **Note:** `workspace_customers` / `workspace_warehouses` were exploratory names in an earlier draft. They are **not** planned. Evolving `clients` / `client_warehouses` in place (workspace-scoped via `organization_id`) is the target — not parallel tables.

## Target access path

```
Core UI                Commerce UI
   │                       │
   └────────────┬──────────┘
                │
        CustomerService
                │
      customerRepository
                │
             clients
```

Same pattern for `WarehouseService` → `client_warehouses` and `ProductService` → `commerce_products` (→ `products` once the rename migration is deployed).

## Layer ownership (post-migration)

| Layer | Services |
|-------|----------|
| **Platform** | `CustomerService`, `WarehouseService`, `ProductService`, `PlatformReadinessService` |
| **Core** | `IndentService`, `TripService`, `DriverService`, … |
| **Commerce** | `OrderService`, `InventoryService`, `InvoiceService`, … |
| **Orchestration** (Phase 3) | `ExecutionOrchestrator`, event handlers |

## Current State

- `public.clients` — Core customer records; Commerce consignees are the same rows (different UI labels).
- `public.client_warehouses` — fulfillment locations (`organization_id` + `client_id`).
- `public.commerce_products` — platform product catalog. A rename to `public.products` is written (`20261122000000_rename_commerce_products_to_products.sql`) but **not yet deployed** — verified via `supabase migration list`.
- Commerce UI calls platform services only — no `localStorage` master data.
- Core `features/clients/services/clients.service.ts` is a **compatibility adapter** delegating CRUD/list reads to `CustomerService`.

## Migration Phases

### Phase 1 — Platform master data (Commerce complete, Core in progress)

- [x] `lib/platform/{repositories,services,types}`
- [ ] Rename `commerce_products` → `products` — migration written, **not deployed** (verified via `supabase migration list`); do not check this off until confirmed pushed and `productRepository.ts` switched back to `products`
- [x] Commerce CRUD → platform services + `refreshMasterData()`
- [x] Core `clients.service` CRUD + list reads delegate to `CustomerService`
- [x] Core `clientWarehouses.service` delegates to `WarehouseService`
- [ ] Core trip/product refs use `ProductService` where applicable

**Success criteria:** Customer created in Commerce appears in Core client list with zero sync.

### Phase 2 — Core platform migration ✅ (verified)

See `docs/architecture/08-phase2-verification.md` for the full audit.

- [x] Core `clients.service` + `clientProfile.service` delegate to `CustomerService`
- [x] Core `clientWarehouses.service` delegates to `WarehouseService`
- [x] `lib/platform/index.ts` is the versioned public API surface
- [x] No feature imports repositories; no direct master-data mutations on `client_warehouses`

**Phase 2 gate passed** — begin Phase 3 **design** (`lib/platform/orchestration/EXECUTION_ORCHESTRATOR.contract.md`).

### Phase 3 — Domain events + orchestration (contract locked — implementation may begin) (only after Phase 2)

- Events: `OrderReadyForDispatch`, `IndentCreated`, `TripAssigned`, `TripStarted`, `TripDelivered`, `PODUploaded`.
- `lib/platform/orchestration/` — `ExecutionOrchestrator.publishIndent(orderId)`.

### Phase 4 — Commerce workflow hardening

- Orders, inventory, pricing remain Commerce-owned workflow tables.
- Cross-product links by ID only (`order_id`, `indent_id`, `trip_id`).

## Suggested Build Order

1. ~~Finish Commerce platform CRUD~~ ✓
2. ~~Migrate Core customers + warehouses~~ ✓
3. ~~Phase 2 architectural verification~~ ✓ (`08-phase2-verification.md`)
4. **Design** Phase 3 orchestration contract (`EXECUTION_ORCHESTRATOR.contract.md`)
5. Implement `EventBus` + `ExecutionOrchestrator.publishIndent` (thin coordinator only)
