# ExecutionOrchestrator v1 — Integration Acceptance Record

> **Freeze policy:** Do **not** freeze on unit tests or green builds alone.
> Freeze **only** after one **completed** acceptance record from a **linked database** live publish.
> This document becomes the reference artifact once signed off.

## Acceptance Run

Copy baseline from `npm run acceptance:baseline` before starting.

```
Acceptance Run
--------------
Date:
Git commit:
Git branch:
Database migration version:   (last row from: supabase migration list --linked)
Environment:                  (e.g. linked remote / preprod)
Commerce URL:                 /oms
Core URL:                     /
Workspace:                    (workspace / org display name)
Organization ID:
Tester:
```

**Record status:** ☐ In progress · ☐ **Completed** · ☐ Failed

---

## Freeze gate (all required)

| # | Criterion | Pass |
|---|-----------|------|
| 1 | Workspace customer created (Commerce + Core) | ☐ |
| 2 | Workspace warehouse created (Commerce + Core) | ☐ |
| 3 | Sales order created (`Pending Consolidation`) | ☐ |
| 4 | Publish succeeded (first attempt) | ☐ |
| 5 | Exactly one indent created | ☐ |
| 6 | Order transitioned to `Planned` | ☐ |
| 7 | Events emitted in correct order | ☐ |
| 8 | Shared `correlationId` across both events | ☐ |
| 9 | Republish #2 — no new indent, no events | ☐ |
| 10 | Republish #3 — no new indent, no events | ☐ |
| 11 | `npm run acceptance:verify` SQL checks passed | ☐ |
| 12 | Orphan indent query returned 0 rows | ☐ |
| 13 | Core opened indent successfully (`/indent/{id}`) | ☐ |

**ExecutionOrchestrator v1 frozen:** ☐ (sign-off date: ______)

On sign-off, update [`LIFECYCLE.md`](./LIFECYCLE.md) command registry:

```
publishIndent() → State: Accepted
  Acceptance Record: <date>
  Git Commit: <hash>
  Database Migration: <version>
```

---

## Stage 1 — Shared master data

Create customer + warehouse in **Commerce**. Verify same records in **Core → Clients**.

| Check | Expected | Pass |
|-------|----------|------|
| Customer visible in Commerce | ✅ | ☐ |
| Same customer in Core Clients | ✅ | ☐ |
| Warehouse visible in Commerce | ✅ | ☐ |
| Same warehouse in Core Client Warehouses | ✅ | ☐ |

| Field | Value |
|-------|-------|
| Organization ID | |
| Customer ID | |
| Warehouse ID | |

---

## Stage 2 — Commerce transaction

Create one sales order (consignee + pickup warehouse + products).

| Field | Value |
|-------|-------|
| Order ID | |
| Order Number | |
| Organization ID | |
| Customer ID | |
| Pickup Warehouse ID | |

**Expected:** `sales_orders.status = 'Pending Consolidation'`

```bash
npm run acceptance:verify -- <order_id> <organization_id>
```

---

## Stage 3 — Orchestration

Publish **exactly once**. Capture from Commerce **Execution lineage** panel:

| Field | Value |
|-------|-------|
| correlationId | |
| orderId | |
| indentId | |

| Check | Expected | Pass |
|-------|----------|------|
| Exactly one indent created | ✅ | ☐ |
| Order becomes `Planned` | ✅ | ☐ |
| No duplicate indent rows | ☐ |

---

## Stage 4 — Cross-product verification (data lineage)

```
Sales Order → sales_order_id → Indent → Trip (future) → POD (future) → Settlement (future)
```

| Check | Expected | Pass |
|-------|----------|------|
| `indents.sales_order_id` = order ID | ✅ | ☐ |
| `indents.organization_id` = workspace ID | ✅ | ☐ |
| Core indent visible at `/indent/{id}` | ✅ | ☐ |
| Commerce “Open indent in Core” resolves | ✅ | ☐ |

---

## Stage 5 — Event verification

Verify **payload**, not just count. Both events share one `correlationId`.

### OrderReadyForDispatch

| Field | Expected | Actual | Pass |
|-------|----------|--------|------|
| event name | `OrderReadyForDispatch` | | ☐ |
| correlationId | (Stage 3) | | ☐ |
| workspaceId | organization ID | | ☐ |
| orderId | order ID | | ☐ |
| occurredAt | ISO timestamp | | ☐ |

### IndentCreated

| Field | Expected | Actual | Pass |
|-------|----------|--------|------|
| event name | `IndentCreated` | | ☐ |
| correlationId | same as above | | ☐ |
| workspaceId | organization ID | | ☐ |
| orderId | order ID | | ☐ |
| indentId | indent ID | | ☐ |
| occurredAt | after OrderReadyForDispatch | | ☐ |

Commerce publish trace runs `verifyPublishIndentAcceptance` on first publish.

---

## Stage 6 — Idempotency

Publish **three times** total (1 initial + 2 republishes via “Republish (idempotency check)”).

| Publish | Indent | Events |
|---------|--------|--------|
| #1 | created | OrderReadyForDispatch + IndentCreated |
| #2 | existing | none |
| #3 | existing | none |

| Check | Pass |
|-------|------|
| Same indent ID all three times | ☐ |
| Order stays `Planned` | ☐ |
| Republish trace shows `0 events (idempotent)` | ☐ |

---

## Orphan check (global)

Included in `npm run acceptance:verify`. Manual:

```sql
SELECT i.id
FROM public.indents i
LEFT JOIN public.sales_orders s ON s.id = i.sales_order_id
WHERE s.id IS NULL AND i.deleted_at IS NULL;
```

**Expected:** 0 rows | Pass: ☐

---

## Post-v1 platform rule

After this record is signed off:

- **`publishIndent()` is a stable contract.** Bug fixes only — no semantic changes.
- New execution capabilities are **new orchestrator commands**, not expansions of `publishIndent()`.

```
ExecutionOrchestrator
├── publishIndent()        ← frozen at v1 sign-off
├── assignVehicle()
├── assignDriver()
├── dispatchTrip()
├── startExecution()
├── completeExecution()
└── cancelExecution()
```

Each future command gets its own acceptance record, idempotency rules, event sequence, and correlation tracing.

---

## Next workflow (after v1)

Stop investing in orchestration infrastructure. Extend the business workflow:

```
Order → Indent ✅
  → Vehicle assignment
  → Driver assignment
  → Dispatch
  → Execution tracking
  → POD completion
  → Finance handoff
```

| Layer | Owns |
|-------|------|
| Workspace | Shared master data |
| Commerce | Commercial transactions |
| ExecutionOrchestrator | Handoff coordination |
| Core | Operational execution |
| Finance | Settlement |
