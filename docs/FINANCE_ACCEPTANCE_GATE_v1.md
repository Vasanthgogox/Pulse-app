# Finance Acceptance Gate v1

**Status:** Draft — Phase 1 checks written, not yet executed against production (blocked on `SUPABASE_DB_PASSWORD`; see Phase 1 below).

Release gate for finance correctness across every ledger, statement, and report. Modeled on the existing verification pattern in `docs/architecture/08-phase2-verification.md` — a checklist with evidence, not another migration. Read-only throughout: this document and its scripts find problems, they don't fix them.

## How this maps to what actually exists

The 10 phases below are grounded in the real schema, not an idealized one. Two gaps matter before treating any phase as checkable:

- **Phase 2 (CN/DN) has no dedicated feature.** There are no `credit_notes`/`debit_notes` tables. The closest equivalent is `public.trip_finance_adjustments` (`type IN ('revenue','cost')`, `impact IN ('plus','minus')`, `amount`, `reason`, `voided_at`) — a generic trip-level adjustment, not an invoice-linked document. It has no `invoice_id` FK and no GST fields. Phase 2 as literally specified (original invoice exists, CN references it, GST values match) cannot be checked today because the data model doesn't carry that lineage. Treat Phase 2 as "audit `trip_finance_adjustments` for what it actually models" until/unless CN/DN becomes its own feature.
- **A live example of what this gate is for:** the `RECEIVED > SALES` bug found and fixed this session (`features/clients/utils/clientPaidSeed.util.ts`) was a **display-layer** double-count — `trips.amount_paid` is DB-trigger-synced from `transactions` for every trip (`sync_trip_payment_status`, `supabase/migrations/20261101120000_trip_payment_status_sync.sql`), and the client-detail screen was adding linked transaction amounts on top of that already-synced total for non-manual trips. The underlying ledger data was never duplicated — only the UI's arithmetic was. Phase 1's `03_negative_balances.sql` (`trips: amount_paid exceeds client_price`) checks the **data** side of this same failure mode: if `trips.amount_paid` itself is ever wrong (not just how a screen adds it up), this query catches it.
- **The same bug class recurred in two more sibling files, confirming Phase 10 (Cross-module Consistency) is a real risk, not a theoretical one.** `features/finance/aggregation/aggregateCustomers.ts` (clients-list aggregate view) and `features/finance/components/EntityDetailOverlay.tsx` (shared Client/Supplier entity overlay) both had the identical unconditional-seed-plus-add pattern as the already-fixed `ClientDetailScreen.tsx` — one with a comment explicitly (and wrongly) claiming it "aligns with ClientDetailScreen." A partially-paid trip (billed 1000, `amount_paid` 500, one linked transaction for 500) computed `pending = 0` instead of `500` in both — the party appeared fully paid while genuinely owing money. Regression tests confirmed against pre-fix code (`Expected: 500, Received: 0`) before confirming the fix. Found by reading code, not by Phase 1's SQL scripts — this class of bug isn't something the blocked SQL audit would catch even once unblocked, since the ledger data itself was never wrong, only the UI's arithmetic.

### Ledger Derived Amount Rule

**If a trip has ledger-linked transactions, `trip.amount_paid` is a derived value and must never be added to those transactions again.** Consumers choose either the ledger transactions or the derived field — never both.

This rule now has exactly one canonical implementation — `features/finance/utils/ledgerDerivedPaidSeed.util.ts`'s `computeLedgerDerivedPaidSeed({ amountPaid, hasLinkedTransaction })` — used by all three fixed call sites (`ClientDetailScreen.tsx` via the `computeClientPaidSeed` wrapper for naming continuity, `aggregateCustomers.ts`, `EntityDetailOverlay.tsx` directly). Any future screen or aggregator that seeds a running "paid so far" total before walking ledger transactions must call this utility, not reimplement the check — that reimplementation is exactly how this bug reached three files despite being fixed once already.

**Next audit to run** (not yet done): the double-counting direction is now covered. The opposite failure mode — balances that are subtly too *low* or never reconcile — needs its own pass: missing ledger entries, orphaned transactions, partial settlements, CN/DN adjustments, and write-order/race conditions between a transaction being recorded and a derived total (like `amount_paid`) being synced. These won't show up as duplicated values the way the bug above did, so they need a different search strategy, not a re-run of this same grep.

### Revenue/Liability Recognition Rule

**A client is not liable for a shipment, and no revenue is recognized, until an indent has been allocated and converted into a trip.** An indent (a load posted to the network, pending/quoted/awarded but not yet allocated) is a request, not a commitment — billing must come from `public.trips` only.

This was violated in `aggregateCustomers.ts`'s "Pass 4," which added `client_price` from any non-cancelled/non-completed indent to a client's Sales/Due (and, briefly during this session's own fix, to the "Trips" count too) before that indent had become a real trip. `aggregateSuppliers.ts` already got this right — its own header comment states "Supplier payables are from trips only — not from awarded indents before conversion (no pre-trip quote roll-up)" — so the client side was the outlier, not the rule. Fixed by removing Pass 4 entirely (and the now-dead `indents` parameter/prop threaded from `useFinanceEntities.ts` → `FinanceScreen.tsx` → `FinanceCustomersTab.tsx` → `CustomersTab.tsx` → `aggregateCustomers`). A `ClientDetailScreen.tsx` change made earlier in this same session to mirror Pass 4's indent billing was reverted for the same reason — it was matching a behavior that was itself wrong.

Net effect: Sales/Due/Trip-count for a client now only reflect real, allocated trips — an open indent shows nowhere in client financials until a trip exists for it.

## Real tables in scope

| Ledger (Phase 1 term) | Real table(s) |
|---|---|
| Client Ledger | `public.transactions` (`contact_type = 'client'`), `public.trips.amount_paid`/`client_price` |
| Supplier Ledger | `public.transactions` (`contact_type = 'supplier'`), `public.supplier_bills` |
| Vehicle Ledger | `public.vehicle_ledger_entries`, `public.vehicle_operation_ledger_entries` |
| Driver Ledger | `public.driver_ledger` |
| Organization Cash Ledger | `public.transactions` (all contact types, cash in/out) |
| Trip Ledger | `public.trips`, `public.trip_finance_adjustments` |
| Invoices | `public.invoices`, `public.invoice_sequences` (GST sequential numbering, CGST Rule 46) |
| CN/DN | `public.trip_finance_adjustments` only — see gap above |

## Phase 1 — Ledger Integrity (Highest Priority)

**Scripts:** `scripts/sql/finance-gate/` — read-only, run via `bash scripts/sql/finance-gate/run.sh` (mirrors `scripts/sql/audit/run-linked.sh`, uses `supabase db query --linked`). Every query is a `SELECT`; zero rows expected on each.

| File | Checks |
|---|---|
| `01_orphan_ledger_rows.sql` | `transactions.contact_id` not resolving to a real client/supplier/driver; `driver_ledger` settlement rows missing `trip_id`; `vehicle_ledger_entries` with a dead `vehicle_id`; `supplier_bills.trip_ids[]` entries that don't exist; `invoices.client_id` not resolving; `trip_finance_adjustments` org/trip mismatch |
| `02_duplicate_postings.sql` | Repeated `transactions` rows (same org/trip/party/amount/date, excluding intentional opening-balance and chat-mirror duplicates); repeated `driver_ledger`/`vehicle_ledger_entries` postings; duplicate `invoice_number` within a financial year (GST compliance, not just data quality) |
| `03_negative_balances.sql` | Negative `driver_ledger.balance_after`; negative `supplier_bills.balance_payable` (overpaid); `trips.amount_paid > client_price`; negative `trips.amount_paid`; negative `vehicle_ledger_entries.amount` |
| `04_debit_credit_consistency.sql` | `vehicle_ledger_entries` debit/credit/amount mismatches; `transactions` amount_in/amount_out CHECK re-verification; `supplier_bills.net_payable` vs `gross_amount - tds_amount` |

**Status: written, not yet executed.** Running requires `SUPABASE_DB_PASSWORD` (direct Postgres connection via `supabase db query --linked`) — not present in this environment and not documented anywhere in the repo. Run manually:

```bash
export SUPABASE_DB_PASSWORD=...   # from wherever this project's DB credentials are kept
bash scripts/sql/finance-gate/run.sh
```

Output lands in `scripts/sql/finance-gate/output/finance-gate-phase1-<timestamp>.txt` — that file is this phase's evidence.

## Phase 2 — CN/DN Audit

Blocked on the gap above. Before any check here is meaningful, decide: does `trip_finance_adjustments` become the real CN/DN model (add `invoice_id`, GST fields), or does a dedicated `credit_notes`/`debit_notes` pair of tables get built? Until that's decided, the only checkable thing today is `trip_finance_adjustments` referential integrity, already covered by `01_orphan_ledger_rows.sql` (1g).

## Phase 3 — Trip Financial Integrity

Not started. Needs: per-trip `Revenue - CN + DN = Net Revenue` reconciliation (using `trip_finance_adjustments` as the CN/DN proxy), then `Fuel + Toll + Driver + Advance + Misc + Supplier Payment + Vehicle Cost = Trip Cost`, then `Revenue - Cost = Margin`, cross-checked against `TripDetailScreen`, `ClientDetailScreen`, `SupplierDetailScreen`, dashboard, and finance reports for the same trip. This is the highest-value phase to do next given Phase 1's `AJITRIP000004`-style finding, but it touches five screens and needs its own script set.

## Phase 4 — Client Statement

Not started. `Opening Balance → Invoices → Receipts → CN → DN → Closing Balance` per client. Opening balance is real (`transactions.is_opening_balance`); needs a script that walks the sequence per `client_id` and diffs against `ClientDetailScreen`'s computed totals.

## Phase 5 — Supplier Statement

Not started. Same shape as Phase 4, backed by `supplier_bills` instead of `invoices`.

## Phase 6 — Vehicle Ledger

Not started. `vehicle_ledger_entries` (fuel/toll/maintenance/tire/battery/service, per the `source_type` CHECK) should sum to whatever screen displays Vehicle P&L. Needs the P&L screen identified before a reconciliation script can be written against it.

## Phase 7 — Payment Integrity

Partially covered by Phase 1's orphan/duplicate checks on `transactions`. `Cash In → Allocation → Trip → Invoice → Ledger → Outstanding` as a full lineage walk is not yet scripted — needs the allocation mechanism identified (client payments currently allocate to trips via `allocateAmountsToLargestDueTrips`, an app-layer heap allocator, not a DB table — see `features/finance/utils/allocateToLargestDue.ts`). A DB-side check can't verify app-layer allocation logic; this phase may need a targeted app-level test instead of SQL.

## Phase 8 — Finance Reports

Not started. Needs the report screens/queries enumerated before "reconciles against the ledger" is checkable.

## Phase 9 — Orphan Detection

Covered by `01_orphan_ledger_rows.sql` for the cases listed there. Not yet covered: payment without allocation (see Phase 7 note — allocation is app-layer, not a table), duplicate allocations (same reason).

## Phase 10 — Cross-module Consistency

Not started as a general script, but a distinct real instance has been found and fixed: `aggregateCustomers.ts` Pass 4 (pre-trip indent billing) incremented the same `tripCount[clientId]` counter used for real trips (`public.trips`) — so the customer list's "Trips" badge showed e.g. "2" for a client with 1 real trip and 1 open indent, while the Trips board and `ClientDetailScreen` correctly showed 1. Billing amounts (Sales/Due) are supposed to include the open indent — that part is intentional and unchanged — only the *count* conflated the two. Fixed by removing the `tripCount[clientId]++` from Pass 4 while leaving `billedByClientId[clientId] += amount` intact.

This is a fourth instance of the same underlying pattern as the Ledger Derived Amount Rule findings above: one value (here, "how many trips does this client have") computed differently by different screens because a shared bucket held two conceptually different things (real trips and pending indents) instead of one. `Trip Paid → Client Ledger → Outstanding → Dashboard → Reports → Cash Flow` as a general change-propagation check still needs each consuming screen identified before it can be scripted.

## Acceptance Checklist

| Area | Status | Notes |
|---|---|---|
| Client Ledger | ☐ | Phase 1 checks written, not executed |
| Supplier Ledger | ☐ | Phase 1 checks written, not executed |
| Vehicle Ledger | ☐ | Phase 1 checks written, not executed |
| Driver Ledger | ☐ | Phase 1 checks written, not executed |
| Trip Ledger | ☐ | Phase 1 checks written, not executed |
| Cash Ledger | ☐ | Phase 1 checks written, not executed |
| CN | ⚠️ | Blocked — no dedicated CN model, see gap above |
| DN | ⚠️ | Blocked — no dedicated DN model, see gap above |
| Invoice | ☐ | `invoice_number` uniqueness check written, not executed |
| Payment Allocation | ⚠️ | Allocation is app-layer (`allocateToLargestDue.ts`), not DB-checkable as-is |
| Outstanding | — | Not started (Phase 3/4) |
| Trip Margin | — | Not started (Phase 3) |
| Vehicle P&L | — | Not started (Phase 6) |
| Client Statement | — | Not started (Phase 4) |
| Supplier Statement | — | Not started (Phase 5) |
| Dashboard Totals | — | Not started (Phase 10) |
| Finance Reports | — | Not started (Phase 8) |
| Orphan Detection | ☐ | Written, not executed; allocation-related orphans out of scope for SQL |
| Cross-module Consistency | — | Not started (Phase 10) |
| Performance | — | Not started |

☐ = script exists, awaiting a run against real data. ⚠️ = structurally blocked, needs a decision first. — = not started.

## Next steps, in order

1. Run Phase 1 (`bash scripts/sql/finance-gate/run.sh` with `SUPABASE_DB_PASSWORD` set) and file the output as evidence.
2. Resolve the CN/DN gap (extend `trip_finance_adjustments` vs. build dedicated tables) before attempting Phase 2 for real.
3. Phase 3 (Trip Financial Integrity) next — highest leverage given Phase 1's client-ledger finding already showed the margin/received chain can drift from what screens display.
