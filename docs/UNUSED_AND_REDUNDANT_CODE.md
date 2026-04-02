# Unused and Redundant Code — Audit

This document lists **unused code**, **redundant/duplicate code**, and **TODO/placeholder code** identified across the q-mobile workspace. Use it for cleanup sprints or before releases.

**Cleanup completed (see git history):** Unused styles removed from FinanceScreen.styles; unused exports removed (validation, AllowedUrls, demo index); dead files deleted (useRefetchOnFocus, RealtimeInvalidationSubscriber); finance components now use `@/lib/format`; `computeTripSummary` consolidated in `lib/totals.util.ts`.

---

## 1. Unused styles

### 1.1 `features/finance/components/FinanceScreen.styles.ts`

**Done.** The 11 unused keys (`filterBtn`, `filterDropdown`, `filterItem`, `filterItemText`, `filterItemTextActive`, `fabContentWrap`, `fabHighlightEdge`, `fabHighlightEdgeLeft`, `fabPrimaryInnerRing`, `fabIconWrap`, `fabPrimary`) were removed.

### 1.2 Other files

Other files with `StyleSheet.create` were not fully audited.

---

## 2. Unused exports

**Done.** Removed or made non-exported:

- **lib/useRefetchOnFocus.ts** — File deleted (no imports).
- **lib/queries/RealtimeInvalidationSubscriber.tsx** — File deleted (not in index, no imports).
- **lib/validation.ts** — `optional`, `minLength`, `validateDriverLicenseNumber` removed.
- **constants/AllowedUrls.ts** — `ALLOWED_URL_PREFIXES` is no longer exported (still used internally).
- **components/demo/index.ts** — Only `DemoTabBar` and `DemoTabId` are exported; `TeslaHeader` and `TreasuryLedgerLayoutDemo` re-exports removed.

---

## 3. Redundant / duplicate code

### 3.1 Format helpers (INR, date, ledger)

**Done.** Finance components now use `@/lib/format`:

- EntityCompareVerifyView, TripPnLDetailSheet, TripPnLStatementContent, SharedLedgerContent, EntityDetailOverlay, DisputeAuditSheet, TripLedgerDetailScreen, FinancialRow — local `formatINR` / `formatLedgerDate` / `formatLedgerDateTime` / `formatLedgerAmount` removed and replaced with imports from `@/lib/format`.

Other files (e.g. `app/(driver)/trips.tsx`, `features/ratings/components/TripRatingsBlock.tsx`, LedgerReportModal) may still use local `formatDate`-style helpers; consider unifying on `@/lib/format` where applicable.

### 3.2 `computeTripSummary`

**Done.** Shared implementation in **lib/totals.util.ts**; `features/clients/utils/totals.util.ts` and `features/suppliers/utils/totals.util.ts` re-export it.

### 3.3 Superseded / demo-only components

- **components/demo/TeslaHeader.tsx** and **TreasuryLedgerLayoutDemo** — No longer re-exported from `components/demo/index.ts`. Files remain for reference; remove if demo screens are deprecated.

---

## 4. TODO / placeholder code

| File | Location | Comment |
|------|----------|--------|
| **app/(tabs)/report.tsx** | ~40–68 | `// TODO: Open date picker` (×2), `// TODO: Open filter modal`, `// TODO: Implement download`, `// TODO: Implement share`. |
| **contexts/WalletContext.tsx** | ~27 | `// TODO: fetch from wallet API (same source as Q-unified-base); placeholder for UI`. |

**Action:** Implement or remove placeholders; track in backlog if deferred.

---

## 5. Summary table

| Category | Status |
|----------|--------|
| Unused styles (FinanceScreen.styles) | Done (11 keys removed) |
| Unused exports | Done (removed or un-exported; 2 files deleted) |
| Redundant format helpers | Done (8 finance components use @/lib/format) |
| Redundant computeTripSummary | Done (lib/totals.util.ts; clients/suppliers re-export) |
| Demo re-exports | Done (TeslaHeader, TreasuryLedgerLayoutDemo no longer exported) |
| TODO/placeholder | Not changed (report.tsx, WalletContext.tsx) |

---

*Last cleanup: see git history. Re-run audit for new modules.*
