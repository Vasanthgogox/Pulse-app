# Domain Ownership Audit — Customer / Warehouse / Product / Organization / Membership

Layer 3 domain document (`00-platform-reconciliation.md`'s three-layer framework), a direct precursor to `06-commerce-core-migration-roadmap.md`'s Phase 1/2. This is a current-state inventory only — **no code changes are proposed or made here.** Every row below was verified by reading the actual service/repository file and grepping its `.from(...)` calls against `supabase/migrations/`, not inferred from naming.

Note on terminology collision surfaced while doing this audit: the word "platform" is now used for four distinct things in this repo — `packages/platform/` (npm monorepo packages), `lib/platform/` (new shared Customer/Warehouse/Product services, this doc's subject), `lib/platform-identity/` (pre-existing Core organization/membership resolution, predates this session), and `platform.*` (OMS's Postgres schema for the Identity/Gateway technical roadmap, not used by any of the entities below). Out of scope to resolve here, but worth its own note eventually.

## Phase 1 — Current-State Audit

| Entity | Core | Commerce | Platform | Source of Truth | Recommendation |
|---|---|---|---|---|---|
| **Customer** | `features/clients/services/clients.service.ts` — **compatibility adapter** delegating CRUD/list to `@/lib/platform` `CustomerService`. Connection RPCs remain local. | `platform-master-data.service.ts` → `@pulse-platform/index` `CustomerService`. | `CustomerService` → `customerRepository` → `clients`. | `public.clients` | **Shared.** |
| **Warehouse** | `features/clients/services/clientWarehouses.service.ts` — **compatibility adapter** delegating CRUD to `WarehouseService`. | `platform-master-data.service.ts` → `WarehouseService`. | `WarehouseService` → `warehouseRepository` → `client_warehouses`. | `public.client_warehouses` | **Shared.** Core fields (dock, manager, zone) preserved in repository. |
| **Product** | No product UI in Core yet. | `platform-master-data.service.ts` → `ProductService`. | `ProductService` → `productRepository` → `commerce_products` (table-name mismatch found and fixed twice this session — first pass missed `update`/`softDelete`). | `public.commerce_products` | **Keep Commerce-owned**, per explicit direction. No `workspace_products`/`public.products` table exists or is planned yet. |
| **Organization** | `features/organization/services/organization.service.ts` (via `contexts/OrganizationContext.tsx`); `lib/platform-identity/` also reads the same table independently. | `oms/src/lib/services/identity-organization.service.ts`. | **No `OrganizationRepository`/`OrganizationService` in `lib/platform/` yet.** | `public.organizations` | Table already shared (no data duplication) — but three separate service-layer implementations (`organization.service.ts`, `platform-identity`, `identity-organization.service.ts`) each independently query it. Same class of issue as Warehouse, one layer up. |
| **Membership** | `contexts/ActiveWorkspaceContext.tsx` queries `organization_members` directly. | `identity-organization.service.ts` queries `organization_members`. | **No repository in `lib/platform/` yet.** | `public.organization_members` | Same pattern as Organization — shared table, duplicate service code, no Platform abstraction yet. |

**Adjacent, do-not-conflate:** `features/suppliers/services/supplierWarehouses.service.ts` / `supplierFleet.service.ts` → `public.supplier_warehouses` / `supplier_fleet` — a genuinely separate, still-live "supplier-side warehouse" concept, distinct from client/workspace warehouses. Not part of this audit's scope, but anyone touching "warehouse" search results will hit these too.

## Phase 2 — Duplicate Implementation Report

**Customer — resolved.** Both Core and Commerce already route through `lib/platform/services/CustomerService`. This is *not* a pending duplication; it already happened, apparently during this same session's concurrent work. The one open question is Core's connection-RPC carve-out — worth a direct answer on whether that's intentionally deferred or an oversight.

**Warehouse — resolved.** Core `clientWarehouses.service.ts` now delegates to `WarehouseService`. Repository includes Core-specific fields (dock, manager, zone, local GSTIN) so no silent data loss on migration.

**Product — no duplication to resolve.** Core has no independent product implementation to consolidate; Commerce already routes through `ProductService`.

**Organization / Membership — duplicate service code, not duplicate data.** Three (Organization) and two (Membership) independent TypeScript implementations query the same tables with no shared validation or DTO. Lower urgency than Warehouse since there's no data-integrity risk (one table, one shape already), but it's the same category of technical debt the user flagged for Customer/Warehouse — likely worth a `PlatformOrganizationService`/`PlatformMembershipService` eventually, following the exact pattern already proven for Customer.

## Explicitly Not In This Document

Per instruction: no Phase 3 migration map, no `ExecutionService` design, no schema changes, no code changes beyond the `productRepository` table-name fix already applied and reported separately. This document's only job is to make sure the next migration step (Warehouse, if that's next) replaces an identified gap rather than discovers one mid-refactor.
