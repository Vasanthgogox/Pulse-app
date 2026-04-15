# Tesla Logistics OS → Q-Mobile Integration Plan

This plan maps the **Canvas Tesla Logistics OS** update (Mission Telemetry, Financial Summary adjustments, Treasury summary, Network handshake) into **q-mobile** while following `.cursor/rules/q-mobile-standards.mdc` and using `@/constants/Theme`.

---

## 1. Feature mapping (Canvas → q-mobile)

| Canvas feature | q-mobile target | Notes |
|----------------|-----------------|--------|
| **Mission Telemetry** (trip tracking + timeline) | `app/trip/[id].tsx` | Add Tracking vs Finance tabs; telemetry-style route + mission log timeline |
| **Financial Summary (trip P&L + adjustments)** | `app/trip/[id].tsx` (Finance tab) | Revenue/Due summary, base sale value, credit/deduct adjustments, commit ledger |
| **Treasury summary banner** | `app/(tabs)/finance.tsx` | Dark banner: Total Cash In / Total Cash Out; period filter TODAY / MONTH / RANGE |
| **Treasury period filter** | Same + `financeService` | Filter ledger/aggregates by period (backend or client-side from existing APIs) |
| **Network handshake notification** | Reusable overlay component | “Partner Synced” / “Handshake Sent” modal with progress bar (use when integrating network/partner flows later) |
| **Ops Autopilot (AI chat)** | `app/(tabs)/ops-agent.tsx` | Already aligned; optional: “Neural Trip Control” subtitle, Sparkles icon, success toast “SYNC COMPLETE” |
| **Load Board** | `LoadBoardModal` + `app/(tabs)/indents.tsx` | Already present; keep GIVE/GET and styling consistent |

---

## 2. Implementation phases

### Phase A: Trip detail – Tracking + Finance (Mission Telemetry + P&L)

**File:** `app/trip/[id].tsx`

- **A1. Layout**
  - Keep `DetailPageLayout` (or extend with optional subtitle).
  - Add a **tab strip** at top (below header): **Tracking** | **Finance** (black pill, white active; use `Theme.teslaRed` for accent if needed).

- **A2. Tracking tab**
  - **Telemetry block:** Dark card (`Theme.darkBackground` / `Theme.darkSurface`) showing:
    - Label: “TELEMETRY LINK”
    - Route: `pickup_area → drop_location` with arrow (e.g. `Theme.teslaRed`).
    - Simple “progress” line (e.g. dashed line + dot/truck icon) to suggest in-transit state.
    - Assigned driver (from `trip` or “—”) and unit/vehicle info.
  - **Mission log:** Vertical timeline of “Mission Log Entries”:
    - For now use **existing trip timestamps**: Created, Started, Completed (from `tripsService.TripRow`).
    - Each row: time (or “—”), status label, optional location/subline.
    - Style: dot + connector line; first item can use `Theme.teslaRed`, rest `Theme.textMutedDemo`.

- **A3. Finance tab**
  - **Summary card:** Two columns:
    - Revenue (sale/client price) – green up icon; `formatINR(trip.client_price)`.
    - Due (client price − amount_paid) – red down icon; `formatINR(trip.client_price - trip.amount_paid)`.
  - **Net Trip P&L:** Single row: margin or (client_price − supplier_rate); color by sign (`Theme.positive` / `Theme.negative`).
  - **Revenue adjustment (optional v1):**
    - Base amount input (₹).
    - List of adjustments (plus/credit, minus/deduct) with reason placeholder and remove; compute `netSaleValue = base + sum(credits) − sum(deductions)`.
    - Buttons: CREDIT / DEDUCT; “COMMIT LEDGER ENTRY” that calls `financeService.createLedgerEntry` (trip_id, amounts) and then navigates back or shows success.
  - Use `Theme` only; no hardcoded hex.

- **A4. Data**
  - All from existing `tripsService.getTripById(id)` and `tripsService.TripRow`.
  - Driver/vehicle names: if not on `TripRow`, add optional joins or keep “—” until drivers/vehicles services are wired.

**New/updated components (optional):**
- `components/TripTrackingBlock.tsx` – telemetry card + mission log (receives `trip`, uses Theme).
- `components/TripFinanceBlock.tsx` – summary + P&L + adjustment form (receives `trip`, `organizationId`, `onCommit`).

---

### Phase B: Treasury summary banner + period filter

**File:** `app/(tabs)/finance.tsx`

- **B1. Summary banner (above table)**
  - Dark full-width block (`Theme.darkBackground`), two cells:
    - **Total Cash In** (or tab-specific label): from `summaryLabels.in` (ledger: “Total Cash In”; customers: “Total Billing”; etc.).
    - **Total Cash Out** (or tab-specific): `summaryLabels.out`.
  - Compute `totalIn` / `totalOut` from:
    - **Ledger:** sum of `amount_in` / `amount_out` from `financeService.getTransactionsByOrganization` (optionally filtered by period).
    - **Customers/Suppliers/Garrage/Drivers:** from existing finance components’ data (e.g. sum sales, sum due, etc.).
  - Use `Theme.positive` / `Theme.teslaRed` (or `Theme.negative`) for icons/labels; white text for values.

- **B2. Period filter**
  - Row of pills: **TODAY** | **MONTH** | **RANGE** (store in state e.g. `financeTimeFilter`).
  - **Ledger:** filter `transaction_date` by selected period (today, current month, or all/range). If `financeService` doesn’t support date filter, filter client-side after fetch.
  - **Other tabs:** same period can apply to aggregated data if/when API supports it; otherwise show “MONTH” as default and disable or hide filter for non-ledger until backend is ready.

- **B3. Labels**
  - `summaryLabels` per tab: ledger → “Total Cash In” / “Total Cash Out”; customers → “Total Billing” / “Total Balance”; suppliers → “Total Payables” / “Unsettled Due”; garrage → “Vehicle Revenue” / “Net Profit”; drivers → “Total Payroll” / “Salary Due”.

**New:** Optional `components/finance/TreasurySummaryBanner.tsx` (props: `totalIn`, `totalOut`, `labelIn`, `labelOut`, `periodFilter`, `onPeriodChange`).

---

### Phase C: Network handshake notification (reusable)

- **C1.** Add `components/NetworkHandshakeOverlay.tsx`:
  - Full-screen overlay (backdrop + blur), centered card.
  - Variants: “Partner Synced” (e.g. UserCheck icon) / “Handshake Sent” (e.g. Mail icon).
  - Title + short message; progress bar that fills over ~2.5s then closes.
  - Used when we add partner/network accept or invite flows (e.g. from a future Network or Resources screen).

- **C2.** Do **not** add a full “Network Registry” screen in this phase unless product asks for it; the overlay alone is enough to match the Canvas interaction.

---

### Phase D: Ops Agent polish (optional)

**File:** `app/(tabs)/ops-agent.tsx`

- Subtitle: “Neural Trip Control” (already “AUTOPILOT INTERFACE”).
- On “sync complete” response: show a short-lived success toast: “SYNC COMPLETE” with checkmark (reuse or add a small `SuccessToast` using Theme).
- Optional: use Sparkles-style icon (e.g. FontAwesome “bolt” already used) for bot label; keep Tesla accent `Theme.teslaRed`.

---

## 3. Technical constraints (from q-mobile standards)

- **Colors:** Only `@/constants/Theme` (e.g. `Theme.teslaRed`, `Theme.darkGreen`, `Theme.darkBackground`, `Theme.positive`, `Theme.negative`).
- **Safe area:** All new screens/overlays use `useSafeAreaInsets()` or existing layout components (e.g. `DetailPageLayout`, `ListScreenLayout`).
- **Data:** No new migrations; use existing `tripsService`, `financeService`, etc. New API calls only if Q-unified-base already exposes them (e.g. date-filtered ledger).
- **Services:** Keep one service per domain; trip finance “commit” uses `financeService.createLedgerEntry` with `trip_id` and amounts.
- **Navigation:** Trip detail remains `app/trip/[id].tsx`; Finance remains under `(tabs)`; no new bottom tabs.

---

## 4. Suggested order of work

1. **Phase A** – Trip detail Tracking + Finance (telemetry block, mission log, P&L card, optional adjustment form).
2. **Phase B** – Treasury summary banner + period filter on Finance screen.
3. **Phase C** – `NetworkHandshakeOverlay` component (and wire to a future action).
4. **Phase D** – Ops Agent subtitle + success toast (optional).

---

## 5. Reference assets

- **Canvas:** The provided React (web) component with `TeslaHeader`, `FinancialRow`, trip detail modals, Load Board, and network notification.
- **Existing q-mobile:** `app/trip/[id].tsx`, `app/(tabs)/finance.tsx`, `components/finance/*`, `components/LoadBoardModal.tsx`, `components/DetailPageLayout.tsx`, `constants/Theme.ts`.
- **Optional reference in repo:** Draft file was removed after implementation; logic lives in `app/(tabs)/finance.tsx` and `components/finance/TreasurySummaryBanner.tsx`.

---

## 6. Out of scope (for this plan)

- New Supabase migrations or RLS changes (schema lives in Q-unified-base).
- A dedicated “Network Registry” screen (only the handshake overlay is in scope).
- Real-time telemetry (e.g. live GPS); only static/timestamp-based mission log from existing trip fields.
- Changing bottom tab structure (Home / Resources only per standards).

---

## 7. Implementation status (completed)

- **Phase A:** `app/trip/[id].tsx` — Tracking | Finance tabs; `TripTrackingBlock`, `TripFinanceBlock`; single read `getTripById`, refetch on focus + realtime.
- **Phase B:** `app/(tabs)/finance.tsx` — `TreasurySummaryBanner`, period filter (TODAY/MONTH/RANGE), single ledger fetch + client-side filter; tab totals via `onTotals`.
- **Phase C:** `components/NetworkHandshakeOverlay.tsx` — reusable; wire when partner flows exist.
- **Phase D:** `app/(tabs)/ops-agent.tsx` — subtitle "Neural Trip Control", "SYNC COMPLETE" toast.
- **Realtime:** `lib/useRealtime.ts` — subscriptions for `transactions` and `trips`; one refetch only when Postgres changes (no polling, reduced reads).
- **Cleanup:** Draft file removed per plan §5.
