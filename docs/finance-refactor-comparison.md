# Finance Refactor vs Reference Comparison

Comparison of the refactored finance implementation (`features/finance/`, `app/(tabs)/finance.tsx`) against the original single-file reference (`app/(tabs)/finance.tsx.reference`).

## Summary

**Verdict: Feature parity.** All features, styles, and functionality from the reference are preserved in the refactor. Structure is split across hooks, components, and styles.

---

## 1. Constants & Types

| Item | Reference | Refactored | Match |
|------|-----------|------------|-------|
| `SUMMARY_LABELS` | Total Billing, Total Balance, etc. | `features/finance/types.ts` — same text | ✅ |
| `TABS` | LEDGER, CUSTOMERS, SUPPLIERS, GARAGE, DRIVERS | Same in `types.ts` | ✅ |
| `ADD_NODE_LABELS` | Add client, Add supplier, etc. | Same in `types.ts` | ✅ |
| `LAST_COL_LABEL` | TO COLLECT, TO PAY, PROFIT, DUE | Same in `types.ts` | ✅ |
| `LedgerCategory` | all \| customers \| suppliers \| vehicle \| driver | Same in `types.ts` | ✅ |
| `MIN_FISCAL_TAB_WIDTH` | 56 | Same in `types.ts` | ✅ |

---

## 2. Data & State

| Feature | Reference | Refactored | Match |
|---------|-----------|------------|-------|
| Ledger fetch & realtime | `getTransactionsByOrganization`, `useRealtimeTransactions` | `useFinanceLedger` | ✅ |
| Entity fetch (clients, trips, suppliers, vehicles, drivers, offers, connections, salary requests) | Inline `useEffect` + `Promise.all` | `useFinanceEntities` | ✅ |
| Ledger period filter (TODAY / MONTH / RANGE) | `filterLedgerByPeriod` | `features/finance/lib/filterLedgerByPeriod.ts` + hook | ✅ |
| Source filter (all / asset / aggregate) | `filteredLedgerBySource` | `useFinanceLedger` | ✅ |
| Ledger category (all / customers / suppliers / vehicle / driver) | `ledgerRowsByCategory`, AsyncStorage persist | `useFinanceLedger` (same logic + persist) | ✅ |
| Cash direction filter (all / in / out) | Filter on `amount_in` / `amount_out` | Same in hook | ✅ |
| Search, sort (entity, source, cash_in, cash_out, date) | Same logic | `useFinanceLedger` | ✅ |
| `tripCountByParty`, `tripPartyMap`, `tripDetailsMap`, `getVehicleNumberForTripId` | Inline useMemos | `useFinanceLedger` / entities | ✅ |
| Driver ledger for selected driver | `getDriverLedgerByDriver` in `useEffect` | Same in `FinanceScreen` | ✅ |
| Focus refresh | `useFocusEffect` refresh keys | Same in `FinanceScreen` | ✅ |

---

## 3. Handlers & Submit

| Feature | Reference | Refactored | Match |
|---------|-----------|------------|-------|
| Transaction submit (create/update, duplicate check, overpayment warnings) | `handleTransactionSubmit` + `doSubmit` inline | `useFinanceTransactionSubmit` | ✅ |
| Driver ledger + salary request cleanup after pay | Same | In hook | ✅ |
| Add client/supplier/vehicle/driver + invitations | Inline handlers | `useFinanceAddEntityHandlers` | ✅ |
| Ledger row select (navigate to trip) | `handleLedgerRowSelect` | Same in `FinanceScreen` | ✅ |
| Ledger mission change (update trip_id) | `handleLedgerMissionChange` | Same in `FinanceScreen` | ✅ |
| Entity row select (open overlay) | `handleEntityRowSelect` | Same in `FinanceScreen` | ✅ |

---

## 4. UI Structure & Styles

| Element | Reference | Refactored | Match |
|---------|-----------|------------|-------|
| Container, safe area | `styles.container`, insets | Same; `FinanceScreen.styles.ts` | ✅ |
| No access / no org views | Centered message + TeslaHeader for no-org | Same in `FinanceScreen` | ✅ |
| Header block | TeslaHeader + TreasurySummaryCard + tab row | `FinanceSummarySection` | ✅ |
| Tab row | Inline ScrollView + TABS | `FinanceTabRow` (same styles) | ✅ |
| Summary card | TreasurySummaryCard (totals, search, filters, report) | Same via `FinanceSummarySection` | ✅ |
| ScrollView + RefreshControl | Pull-to-refresh, refresh keys | Same in `FinanceScreen` | ✅ |
| AI Insights | `AIInsightsPanel` in scroll content | Same in `FinanceScreen` | ✅ |
| Table header | Inline th + sort/filter buttons | `FinanceTableHeader` (same styles) | ✅ |
| Ledger category banner | When category !== "all" | `LedgerCategoryFilterBanner` | ✅ |
| Trip summary strip (receivable/payable) | Inline chips | `LedgerTripSummaryStrip` | ✅ |
| Table body | LedgerTab, CustomersTab, SuppliersTab, GarrageTab, driver block, DriversTab | `FinanceTabBody` (same components + styles) | ✅ |
| FAB | FabButton when tab !== "ledger" | `FinanceFab` when tab !== "ledger" | ✅ |
| Modals | AddTransaction, AddClient, AddSupplier, AddVehicle, AddDriver, EntityDetailOverlay, TripPnL, LedgerReport, SharedLedger | `FinanceModals` (all same props/behavior) | ✅ |
| Entity list category modal | Modal + category list | `EntityListCategoryModal` | ✅ |
| StyleSheet | Single StyleSheet at end of file | `FinanceScreen.styles.ts` (same keys/values) | ✅ |

---

## 5. Behaviour Details

- **Entity overlay “Add transaction”:** Reference sets `addEntryContext` and calls `router.push('/(modals)/ledger-sync?...)` when entity is set; refactor does the same in `onEntityAddTransaction` passed to `FinanceModals`. ✅  
- **Ledger report:** Both use `filteredLedgerBySource` for `LedgerReportModal`. ✅  
- **Shared ledger:** Same props (`organizationId`, `ledgerTransactions`, `clients`, `suppliers`, `tripCountByParty`). ✅  
- **Garage tab:** Same `onTripSelect` → `router.push('/trip/...')`; `TripPnLDetailSheet` uses `garageTripIdForPnL` in both (state is only cleared in refactor; reference also never sets it from UI). ✅  
- **Driver salary requests:** Pay/Reject flow and refs/setters match. ✅  

---

## 6. Files Involved (Refactor)

- **Route:** `app/(tabs)/finance.tsx` — thin wrapper, renders `FinanceScreen`.
- **Screen:** `features/finance/components/FinanceScreen.tsx` — main orchestrator (~1k lines).
- **Styles:** `features/finance/components/FinanceScreen.styles.ts` — shared styles.
- **Hooks:** `useFinanceLedger`, `useFinanceEntities`, `useFinanceTransactionSubmit`, `useFinanceAddEntityHandlers`.
- **Components:** `FinanceSummarySection`, `FinanceTabBody`, `FinanceTabRow`, `FinanceTableHeader`, `FinanceFab`, `FinanceModals`, `LedgerCategoryFilterBanner`, `LedgerTripSummaryStrip`, `EntityListCategoryModal`, `FinanceDriverSalaryRequests`, plus existing LedgerTab, CustomersTab, SuppliersTab, GarrageTab, DriversTab, EntityDetailOverlay, modals.

---

## 7. Optional Follow-ups

- Consider adding a test or manual checklist that opens each tab, adds/edits a transaction, opens entity overlay, and uses report/shared ledger to guard against regressions.
- If `garageTripIdForPnL` is intended to open the PnL sheet from the Garage tab, the reference does not wire it; refactor matches that. Wiring it would require passing a callback (e.g. from `GarrageTab`) to set `garageTripIdForPnL` when a trip is chosen for PnL.
