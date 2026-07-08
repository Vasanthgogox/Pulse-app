# Transport Work — Gap Analysis

Brutally honest assessment of current implementation against `01-transport-work-v1.md`, derived from `02-transport-work-mapping.md`.

## Already Good

- Customer (`clients`), Supplier (`suppliers`), Driver (`drivers`), Vehicle (`vehicles`) — clean master data tables, correctly scoped to `organization_id`.
- Invoice (`invoices`), Supplier Bill (`supplier_bills`), Transaction (`transactions`) — already correctly separated into receivable / payable / ledger, matching the target model exactly. Both `invoices` and `supplier_bills` already support bundling multiple trips via `trip_ids[]`.
- The existing convergence points (`award_indent_to_trip()`, `acceptAwardedQuote()`) already funnel every capacity strategy into the same `trips` table — the "everything converges after Capacity" principle is already partially true today.
- Shared UI primitives already exist and are reused: `AssignmentEntityPicker`, phone-lookup and vehicle-plate keypad flows.

## Needs Consolidation

- **Request duplicated** *(Major)* — a Transport Work's initial request lives on `indents` for the direct-supplier path but on `posts` for marketplace, with no shared record.
- **Planning duplicated** *(Major)* — same split as Request; planning fields aren't captured in one place before Capacity branches.
- **Allocation duplicated** *(Major)* — `allocationWizardSteps.ts` (trip) and `indentAllocationWizardSteps.ts` (indent) implement the same driver/vehicle capture logic separately, with three independently-defined TypeScript shapes for the result.
- **Marketplace planning duplicated** *(Major)* — Marketplace doesn't reuse Indent's planning record at all; it has its own via `posts`.

## Missing

- **Transport Work table** *(Critical)* — the aggregate root has no backing schema.
- **`transport_work_id`** *(Critical)* — today's `indents.trip_id` puts the foreign key on the parent, which structurally forecloses one Transport Work producing multiple Trips. The FK needs to live on `trips` instead.
- **Capacity abstraction** *(Major)* — no shared column/mechanism lets `indents` and `posts` resolve into one capacity strategy concept; they're parallel structures, not variants of one thing.
- **POD as its own record** *(Minor)* — POD is currently a column on a `transactions` row, so it can't exist before Settlement, only alongside it.

## Technical Debt

1. **`drivers.status` contains operational state.** *(Minor)* The column includes `'on_trip'`, written directly onto Driver master data — violates Principle 4 (master data never stores operational state).
2. **No `transport_work` table exists.** *(Critical)*
3. **Trips are acting as the aggregate root today.** *(Critical)* In the absence of Transport Work, `trips` carries fields (client, supplier, rates, margin) that conceptually belong to Transport Work, and is the first row created in the Manual path but the *last* row created in the Indent/Marketplace paths.
4. **`indents.trip_id` creates implicit 1:1 coupling** *(Critical)*, foreclosing the multi-Trip extensibility rule until the FK is inverted onto `trips`.

## Priority Summary

| Priority | Items |
|---|---|
| **Critical** | Transport Work table, `transport_work_id` FK direction, Trips acting as aggregate root, `indents.trip_id` 1:1 coupling |
| **Major** | Request duplication, Planning duplication, Allocation duplication, Marketplace planning duplication, Capacity abstraction |
| **Minor** | `drivers.status` operational state, POD as its own record |
