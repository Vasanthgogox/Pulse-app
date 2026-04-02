# Ledger layout: Treasury-style mock → app mapping

This doc maps the **Treasury / Fiscal Matrix** web mock (dark header + light table) to the current q-mobile Finance tab so we can plan or adopt the layout.

## Mock structure (summary)

| Section | Mock (web) | Current app (`app/(tabs)/finance.tsx` + `LedgerTab`) |
|--------|------------|------------------------------------------------------|
| **Header** | "TREASURY" + "Fiscal Matrix", icons: LayoutGrid, Globe, Bell, User | TeslaHeader with org/title; no "TREASURY" / "Fiscal Matrix" wording |
| **Tabs** | LEDGER \| CUSTOMERS \| SUPPLIERS \| GARRAGE \| DRIVERS | Same tabs (`TABS`, `financeSubTab`) |
| **Summary** | Total Cash In (green) \| Total Cash Out (red) | `TreasurySummaryCard` / tab-specific labels (Total Cash In/Out for ledger) |
| **Toolbar** | Search + "RANGE" + "ALL" + FileText | Search (`searchQuery`) + period filter + entity/source filters; no explicit "RANGE" / "ALL" pills |
| **Table area** | Light (white) bg; 4 cols: ENTITY/DESC \| LINK \| CASH IN \| CASH OUT | Same 4 columns; header in `tableHeaderWrap`; rows via `LedgerTab` → `FinancialRow` |
| **Sub-header** | "From trips: Receivable ₹X • Payable ₹0" | `ledgerTripSummaryWrap` with same text when trip-sourced totals > 0 |
| **Rows** | Entity name, category, date \| route/truck \| cash in \| cash out + ChevronRight | `FinancialRow` type="ledger": entity/subline \| LINK (trip/route + vehicle) \| in \| out + expand/chevron |
| **Bottom nav** | FISCAL \| OPS \| TRIPS | Tab bar is app-level (Home/Resources); demo has `DemoTabBar` (FISCAL / OPS / TRIPS) |

## Data shape alignment

Mock row shape maps to existing types:

- `entityName` → `FinancialRowData.name` (or party + vehicle/driver)
- `entityType` → derived from `contact_type` (Client/Supplier/Driver/Vendor)
- `category` → `description` or expense category → `FinancialRowData.category` / `subline`
- `route` → from `tripDetailsMap` (pickup → drop) → LINK cell
- `tripRef` → `trip_number` / `msn`
- `truckRef` → `vehicleNumber` or from `getVehicleNumberForTripId`
- `type` IN/OUT → `amount_in` / `amount_out`
- `date` → `transaction_date` (formatted)

So the **current data model and LedgerTab/FinancialRow already support** the mock’s columns; the difference is mainly **visual**: dark top (header + tabs + summary + toolbar) and light table.

## Optional UI tweaks (if we adopt this layout)

1. **Header**
   - Optionally show title "TREASURY" and subtitle "Fiscal Matrix" (e.g. when on Finance tab) using Theme colors.
   - Icons: map LayoutGrid/Globe/Bell/User to existing or new header actions (e.g. layout toggle, notifications, profile).

2. **Theme**
   - **Dark top**: use `Theme.darkBackground` / `Theme.darkSurface` for the top section (header, tabs, summary, toolbar).
   - **Light table**: keep current white/surface for the table area (`tableHeaderWrap` + `tableBodyWrap`) so the table stays light as in the mock.

3. **Toolbar**
   - Add explicit "RANGE" (date range) and "ALL" (e.g. layer/entity filter) pills if we want parity with the mock; currently we have period dropdown and entity filter.

4. **Bottom nav**
   - App tabs are Home/Resources; the mock’s FISCAL | OPS | TRIPS is already reflected in `DemoTabBar` for the demo flow. No change needed for production unless we add a dedicated "Fiscal" shell.

5. **Safe area**
   - Keep using `useSafeAreaInsets()` for header and bottom padding; `ListScreenLayout` / existing finance scroll already respect it.

## Demo component

A React Native demo that implements this exact layout (dark header + light table, mock data) lives in:

- **`components/demo/TreasuryLedgerLayoutDemo.tsx`**
- Export: `import { TreasuryLedgerLayoutDemo } from '@/components/demo';`

Use it in a demo route to compare with the real Finance tab. It uses `Theme`, `Layout`, and safe area; no changes to the real finance tab are required.

**To view the demo:** add a route (e.g. `app/(modals)/treasury-demo.tsx`) that renders `<TreasuryLedgerLayoutDemo />` and navigate to it from the Finance tab or a dev menu.

## Rules (from q-mobile-accounting.mdc)

- Do not change existing Finance tab layout; new work should preserve current UI and only adjust data flow and entry logic when needed.
- Adopting the Treasury-style look is optional and can be done via small visual tweaks (header title, dark top section, light table) without altering the existing structure of `LedgerTab`, `FinancialRow`, or the accounting model.
