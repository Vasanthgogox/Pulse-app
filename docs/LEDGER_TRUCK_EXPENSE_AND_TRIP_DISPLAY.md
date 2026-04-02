# Ledger: truck-related expense and trip display (with NULLs)

How we show **truck-related expenses** (e.g. Fuel, Toll) and linked **trip** data in the ledger, including when fields are NULL.

## 1. Transaction (cash_entries) shape

| Field | Example (truck expense) | Notes |
|-------|-------------------------|--------|
| id | `95a5976c-...` | Required |
| organization_id | `01a0e87a-...` | Required |
| trip_id | `898367b6-...` or **NULL** | When set, we show trip link (route, trip number). When NULL, LINK = "—" / General. |
| party_name | `Fuel` | Shown in ENTITY/DESC. |
| description | `FUEL` | Shown as category/subline. |
| amount_in | `0` | CASH IN column. |
| amount_out | `500` | CASH OUT column. |
| transaction_date | `2026-03-05` | For sorting and expand detail. |
| contact_id | **NULL** | Truck expense has no contact. |
| contact_type | **NULL** | Truck expense has no contact. |
| vehicle_number | Optional on row | If not on row, we resolve from trip when trip.vehicle_id is set. |

**Truck expense rule:** `contact_id` and `contact_type` are NULL; `party_name`/`description` match vehicle expense types (FUEL, MAINTENANCE, TOLL, etc.) per `accountingModel.VEHICLE_EXPENSE_TYPES`.

## 2. Trip shape (for LINK column)

When `transaction.trip_id` is set, we look up the trip (e.g. from `tripRows` / `tripDetailsMap`). Trip fields used:

| Field | Example | When NULL |
|-------|---------|-----------|
| id | `898367b6-...` | N/A (key) |
| organization_id | `01a0e87a-...` | Not used for display |
| trip_number | `TRP002` | Show "—" or "Trip" in LINK when no trip_number |
| indent_id | — | Not shown in ledger |
| source | `manual` | Not shown in ledger row |
| pickup_area | `Vijayawada` | Route: use drop_location only if pickup_area null |
| drop_location | `Agra` | Route: `pickup_area → drop_location` or single part |
| client_id, client_name | — | Shown in expand detail |
| vehicle_id | **NULL** or UUID | **NULL** → no vehicle badge; resolve vehicle_number only when set |
| pickup_date | — | Shown in expand detail |
| status, etc. | — | Not shown in ledger row |

## 3. Display rules (ledger row)

### ENTITY / DESC column

- **Truck-related expense** (no contact_type, vehicle expense party_name/description):
  - **Entity name:** `row.vehicle_number ?? getVehicleNumberForTripId(row.trip_id) ?? row.party_name`
  - So: show vehicle number when available (from row or from trip.vehicle_id); otherwise show **party_name** (e.g. "Fuel").
- **Driver payment:** entity = driver name (contact/driver_name).
- **Client/Supplier:** entity = party name (contact).

Subline: trip_number + description/category when present; otherwise description/category.

### LINK column

- **`trip_id` is NULL:** Show "—" or "General". No route, no trip number, no vehicle badge.
- **`trip_id` set but trip not in map** (e.g. trip deleted or not loaded): Show `row.trip_number` if available (from API join); otherwise "—". No vehicle badge unless `row.vehicle_number` is set.
- **`trip_id` set and trip in map:**
  - **Route:** `pickup_area → drop_location` when both present; else `drop_location` or `client_name` or `pickup_date` (see `formatRoute` in LedgerTab / tripDetailLine in FinancialRow).
  - **Trip number:** From `tripDetailsMap[trip_id].trip_number` or `row.trip_number`.
  - **Vehicle badge:** Show only when `vehicle_number` is available (from row or from `getVehicleNumberForTripId(trip_id)`). When **trip.vehicle_id is NULL**, do not show a vehicle badge (even if we show the route).

### CASH IN / CASH OUT

- As today: amount or "—" by type.

## 4. NULL summary

| Scenario | ENTITY/DESC | LINK |
|----------|-------------|------|
| Truck expense, trip_id NULL | party_name (e.g. Fuel) | — |
| Truck expense, trip_id set, trip in map, vehicle_id NULL | party_name (e.g. Fuel) | Route (e.g. Vijayawada → Agra); no truck badge |
| Truck expense, trip_id set, trip in map, vehicle_id set | vehicle_number (e.g. TN-01-AB-1234) | Route + truck badge with vehicle_number |
| Truck expense, trip_id set, trip **not** in map | party_name | row.trip_number or "—" |
| Any row, trip in map but pickup_area/drop_location NULL | — | trip_number or client_name or date fallback |

## 5. Code references

- **LedgerTab** (`features/finance/components/LedgerTab.tsx`): Builds `FinancialRowData` from `LedgerRow`; resolves `vehicleNum` from `row.vehicle_number` or `getVehicleNumberForTripId(row.trip_id)`; passes `tripDetail` from `tripDetailsMap[row.trip_id]` (undefined when trip not in map).
- **FinancialRow** (`features/finance/components/FinancialRow.tsx`): Renders LINK from `missionLabel` (trip number / General) and `tripDetailLine` (route); when `data.vehicleNumber` is set, can show vehicle badge in LINK cell.
- **finance.tsx**: `getVehicleNumberForTripId` returns `vehicle?.vehicle_number` only when `trip.vehicle_id` is set; `tripDetailsMap` is built from `tripRows` (pickup_area, drop_location, trip_number, etc.).

Schema lives in Q-unified-base; this app is a client. No migrations in q-mobile.
