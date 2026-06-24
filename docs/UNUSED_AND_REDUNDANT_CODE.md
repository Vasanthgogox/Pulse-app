# Unused and Redundant Code — Audit

This document lists **unused code**, **redundant/duplicate code**, and **TODO/placeholder code** identified across the pulse workspace. Use it for cleanup sprints or before releases.

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
| **contexts/WalletContext.tsx** | ~27 | `// TODO: fetch from wallet API (same source as pulse-unified-base); placeholder for UI`. |

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



as of 24 jun 2026 

- Summary
30 findings total — 17 high, 9 medium, 4 low.

High confidence (zero references confirmed)
File	Category	Evidence	Action
_reference/ (16 files)	Reference / scratch	Zero imports from app/features/lib	Delete entire folder
assets/illustrations/*-dark.svg (21 files)	Duplicate assets	Only light variants are imported; dark variants have zero hits	Delete all *-dark.svg
assets/avatars/*_screenshot_*.png (23 files)	Dead assets	Staging captures; zero imports	Delete all _screenshot_ PNGs
assets/avatars/3d-happy-cartoon-doctor-*.png	Dead assets	Zero imports	Delete
assets/avatars/elegant-3d-female-witch-avatar-*.png	Dead assets	Zero imports	Delete
assets/avatars/3d-icon-avatar-cartoon-man-*.png	Dead assets	Zero imports	Delete
app/(tabs)/clients.tsx	Orphan route	Not in (tabs)/_layout.tsx; no navigation calls found	Delete
app/(tabs)/report.tsx	Orphan route	Not in (tabs)/_layout.tsx; no navigation calls found	Delete
app/(tabs)/payment-detail.tsx	Orphan route	Not in (tabs)/_layout.tsx; no navigation calls found	Delete
app/(modals)/sms-otp-parsing.tsx	Orphan route	In layout but zero router.push/replace calls; not in routes.ts	Delete
app/(modals)/create-post.tsx	Orphan route	Same — zero navigation calls	Delete
app/(modals)/post-detail.tsx	Orphan route	Same — zero navigation calls	Delete
app/(modals)/story-detail.tsx	Orphan route	Same — zero navigation calls	Delete
app/modal.tsx	Dead code	Expo scaffold; registered in layout but never navigated to	Delete
components/EditScreenInfo.tsx	Dead code	Only imported by dead app/modal.tsx	Delete with modal.tsx
components/StyledText.tsx	Dead code	Only imported by EditScreenInfo.tsx	Delete
components/ExternalLink.tsx	Dead code	Only imported by EditScreenInfo.tsx	Delete
Medium confidence
File	Category	Evidence	Action
components/Themed.tsx	Dead code	Only imported by dead app/modal.tsx; flagged in Feb 2025 audit, still exists	Delete with modal.tsx
constants/Colors.ts	Dead code	Only imported by Themed.tsx; flagged Feb 2025	Delete with Themed.tsx
assets/illustrations/1,5,7,8,10,12,13,15,16,18,21,23–27,30,32–35.svg (21 SVGs)	Dead assets	Only 14 numbers confirmed imported (2,3,4,6,9,11,14,17,19,20,22,28,29,31); rest have no hits — verify visually before deleting	Batch delete unused numbers
lib/globalIdentityService.ts	Dead code	340-line Phase-2 service; zero imports anywhere	Delete or confirm deferred
lib/searchService.ts	Dead code	Phase-3 search service; zero imports	Delete or confirm deferred
scripts/generate_pulse_documentation_docx.py	Stale script	One-off, no callers, no CI reference	Delete
scripts/chaos-identity-test.js	Stale script	One-off chaos test, no callers	Delete
scripts/identity-load-test.js	Stale script	One-off load test, no callers	Delete
scripts/save-driver-icons.js	Stale script	Purpose fulfilled (assets populated), no callers	Delete
Low confidence (needs human review)
File	Category	Evidence	Action
app/branding-settings/ (3 files)	Superseded	Pure <Redirect> shim; ROUTES.BRANDING_SETTINGS is @deprecated; no internal nav calls — but may be a live external deep-link target	Keep for now unless deep-link compat is confirmed unnecessary
.playwright-mcp/ (7 log files)	Reference / scratch	Generated test session artifacts; no code references	Delete (generated)
scripts/sql/audit/ (14 SQL files)	Stale scripts	Ad-hoc DB audit queries; no CI callers; hardcoded org UUIDs	Move to docs/ or delete
scripts/verify-shared-ledger-rpc.ts	Stale script	Hardcoded org UUIDs (cf49d70b…); one-off verification	Needs human review before delete
Merge recommendations: None. _reference/dispatcher-portal-pro/AddClientModal/ overlaps with features/clients/components/AddClientModal/ conceptually but is fully disconnected — just delete, don't merge.

Confirmed live (do not touch): app/(modals)/ledger-sync.tsx (navigated to from 4 feature screens + alert registry), app/(tabs)/indents.tsx (active), all supabase/migrations/*, lib/mapLocationLabel.service.ts, scripts/seed-test-data.ts, illustrations 2/3/4/6/9/11/14/17/19/20/22/28/29/31.
