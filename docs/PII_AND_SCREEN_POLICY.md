# PII and screen capture policy

Screens that display **regulated or sensitive data** (finance, driver docs, salary, payments) are listed below. Screenshot and screen recording are **disabled** on those screens where supported (Android; iOS has OS limitations).

## Screen inventory (sensitive / PII)

| Screen | Route / component | Data type | Screenshot disabled |
|--------|-------------------|-----------|----------------------|
| Finance (Cashbook) | `(tabs)/finance` → `FinanceScreen` | Ledger, AR/AP, driver payroll, entity totals | ✅ |
| Payment detail | `(tabs)/payment-detail` | Transaction list, balances | ✅ |
| Ledger sync (add/edit entry) | `(modals)/ledger-sync` | Ledger entry, party, amounts | ✅ |
| Driver wallet | `(driver)/wallet` | Salary requests, trip earnings, payments | ✅ |
| Driver passbook | `(driver)/passbook/[orgId]` | Trip and revenue details per fleet | ✅ |
| Driver detail (org view) | `driver/[id]` → `DriverDetailScreen` | Driver docs, ledger, ratings, statement | ✅ |

## Implementation

- **Hook:** `usePreventScreenCapture()` from `@/lib/usePreventScreenCapture` is used on the screens above.
- **Library:** `expo-screen-capture` (Android: blocks capture/recording; iOS: cannot block screenshots; listener available for screenshot events).
- **Adding a new sensitive screen:** Import and call `usePreventScreenCapture()` at the top of the screen component, and add the screen to the table above.

## Compliance notes

- For **GDPR** or sector rules (e.g. financial), consider documenting these screens in your DPA and data flow maps.
- **Driver docs / HR data:** Driver detail and wallet/passbook contain PII; access is controlled by RLS and capabilities.
