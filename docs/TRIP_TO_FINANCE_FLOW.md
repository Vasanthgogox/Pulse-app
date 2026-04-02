# Trip → Finance flow

When a **trip is created** (with client, supplier, vehicle, etc.), finance data stays in sync as follows.

**This flow aligns with the double-entry model.** See [CORE_ACCOUNTING_MODEL.md](./CORE_ACCOUNTING_MODEL.md) for core accounts, trip→ledger rules, and cash flow entry structure. Tab-level in/out entry logic in the Finance tab implements the same model (single stored row per transaction; logical debit/credit pair as documented there).

## Table columns (by entity)

| Tab        | Column 1 (SOURCE) | Column 2       | Column 3   |
|-----------|-------------------|----------------|------------|
| **Customers** | SALES (billed)    | COLLECTED      | TO COLLECT |
| **Suppliers** | SALES (payables)  | PAID           | TO PAY     |
| **Garrage**   | TRIPS             | SALES          | PROFIT     |
| **Drivers**   | TO PAY (commission) | PAID         | DUE        |
| **Ledger**    | LINK              | CASH IN        | CASH OUT   |

When you add a transaction (e.g. record collected from customer or paid to supplier), both the entity table and the Ledger tab refresh so Sales/Collected/To collect (or Paid/To pay) and ledger entries stay in sync.

## Immediate reflection

- **Finance tab refetch on focus**: When you open or return to the Finance tab, the app refetches trips, clients, suppliers, vehicles, drivers, and ledger. So:
  - A new trip with **client** and **client_price** (e.g. ₹50,000) shows up in **Customers** as receivable (Total Receivable / Outstanding) and in the customer detail as trip-level receivables.
  - A new trip with **supplier** and **supplier_rate** shows up in **Suppliers** as payable (Total Payables / Unpaid) and in the supplier detail as trip-level payables.
  - A new trip with **vehicle_id** shows up in **Garrage** (vehicle P&L): that vehicle’s Trip Revenue, Expense, and Net P&L include this trip; detail page shows trip-level sales/expense/net.
  - **Ledger** entries linked to a trip (`trip_id`) show full trip context in the expanded row (trip date, route, client, aging, due).

No extra “sync” step: aggregation reads from the same **trips** and **transactions** tables. Refetch on focus keeps Finance in sync after creating a trip (or after creating/editing entities elsewhere).

## Data flow (single source)

| Source   | Customers (client)     | Suppliers              | Vehicles (Garrage)   | Ledger                |
|----------|------------------------|------------------------|----------------------|------------------------|
| **Trips**| `client_id` + `client_price` → billed/receivable | `supplier_id` + `supplier_rate` → payables | `vehicle_id` + `client_price` / `supplier_rate` + ledger → P&L | `trip_id` on rows → trip detail in expand |
| **Ledger** | `amount_in` / `amount_out` by client → received/pending | `amount_out` by supplier → paid | Trip-linked `amount_out` → expense | All entries; trip-linked show trip info |

- **Customer sales (receivable)**: `aggregateCustomers` uses **trips** for `billed` (sum of `client_price` per client) and **transactions** for received/pending. Detail page shows trip-level receivable, received, outstanding.
- **Supplier payables**: `aggregateSuppliers` uses **trips** for due (sum of `supplier_rate` per supplier) and **transactions** for paid. Detail page shows trip-level cost, paid, payable.
- **Vehicle P&L**: `buildVehiclePnLList` uses **trips** (by `vehicle_id`, period) for sales and expense (supplier_rate + trip-linked ledger amount_out). Detail page shows trip-level sales, expense, net.
- **Ledger**: Uses **transactions**; when an entry has `trip_id`, **tripDetailsMap** (from **tripRows**) supplies trip number, date, route, client for the expanded row. Ledger tab also shows a “From trips” summary (total receivable/payable from trips) when non-zero.

## Ledger “From trips” summary

On the Ledger tab, if any trip has a client or supplier, a line above the table shows:

- **From trips: Receivable ₹X · Payable ₹Y**

- **Receivable** = sum of `client_price` over trips that have `client_id`.
- **Payable** = sum of `supplier_rate` over trips that have `supplier_id`.

This ties the ledger view to trip-sourced amounts; actual ledger entries (cash in/out) stay in the table below, with trip-linked rows expandable for full trip detail.
