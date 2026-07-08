# Phase 2 — Architectural Verification

Run before starting Phase 3 (orchestration). This is a **grep + code review** checklist, not another migration.

**Verdict (2026-07-08):** Phase 2 **complete for master-data CRUD** on `clients` and `client_warehouses`. Documented exceptions below for workflow read lookups and adapter cross-cutting concerns. Safe to **design** Phase 3 orchestration contract; implementation should wait until `products` table rename is applied on remote (`npm run db:push`).

## Checklist

| Criterion | Status | Notes |
|-----------|--------|-------|
| No feature imports any repository | ✅ PASS | Repositories only imported inside `lib/platform/services/*` |
| No feature performs direct **mutations** on `clients` | ✅ PASS | `clientProfile.service` now delegates hub updates to `CustomerService.updateHubProfile` |
| No feature performs direct **mutations** on `client_warehouses` | ✅ PASS | Only `warehouseRepository` |
| All master-data **mutations** flow through platform services | ✅ PASS | Core via adapters; Commerce via `platform-master-data.service` |
| Soft-delete semantics documented | ⚠️ DOCUMENTED | See table below — not unified across entities |
| Workspace scoping enforced centrally | ✅ PASS | All repository queries include `organization_id` / `workspaceId` |
| Compatibility adapters contain no business logic | ⚠️ MOSTLY | See adapter exceptions |

## Soft-delete semantics (by design, not yet unified)

| Entity | Delete mechanism | List filter |
|--------|------------------|-------------|
| Customer (`clients`) | `status = 'inactive'` | `.eq('status', 'active')` |
| Warehouse (`client_warehouses`) | `deleted_at` timestamp | `.is('deleted_at', null)` |
| Product (`products`) | `deleted_at` + `status = 'archived'` | `.is('deleted_at', null)` |

Unifying on `deleted_at` for customers is tracked as **ADR-007 backlog** — does not block Phase 3.

## Direct `clients` reads (workflow lookups — exempt)

These services perform **read-only** lookups for trips, chat, finance, indents, network — not master-data CRUD. Acceptable for Phase 2; may migrate to `CustomerService.find*` helpers later.

| File | Purpose |
|------|---------|
| `features/chat/services/chat.service.ts` | Avatar / name resolution |
| `features/finance/services/finance.service.ts` | Ledger contact name |
| `features/indents/services/indents.service.ts` | Linked org resolution |
| `features/indents/utils/indentPartnerPublicProfile.util.ts` | Partner link lookup |
| `features/network/services/networkProfileSnapshot.service.ts` | Connection lookup |
| `features/ratings/services/ratings.service.ts` | Linked org IDs |

## Compatibility adapter exceptions

| Adapter | Cross-cutting logic (acceptable) |
|---------|----------------------------------|
| `clients.service.ts` | Session refresh before create; error code mapping; delta cache sync; connection RPCs |
| `clientWarehouses.service.ts` | DTO field mapping only — thin ✅ |
| `clientProfile.service.ts` | Snake_case ↔ camelCase mapping only — thin ✅ |
| `platform-master-data.service.ts` (Commerce) | Commerce DTO mapping only — thin ✅ |

## Master-data domain matrix

| Domain | Shared Service | Core | Commerce |
|--------|----------------|------|----------|
| Customers | ✅ | ✅ adapter | ✅ |
| Warehouses | ✅ | ✅ adapter | ✅ |
| Products | ✅ | N/A (no UI yet) | ✅ |

## Public API boundary

Import only from `lib/platform/index.ts` (`@/lib/platform` or `@pulse-platform/index`). Repositories, mappers, and internal service paths are **not** part of the supported contract.

## Phase 3 gate

**Approved** — exceptions (workflow read joins, adapter integration concerns, soft-delete variance) do not block orchestration. Contract: `EXECUTION_ORCHESTRATOR.contract.md`. Implementation may begin.
