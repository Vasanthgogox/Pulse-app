# AI Chatbot — Structure Plan

This document defines a **structured plan** for the Ops Agent / AI assistant, building on the **existing confirmation flow and in-chat UI** already implemented in `app/(tabs)/index.tsx` and `services/opsAgentService.ts`.

---

## Current Foundation (Already Built)

- **Confirmation flow:** User says intent → bot collects/validates → user confirms in chat → in-chat card with "Edit details below, then confirm" + Cancel / primary action (Create client, Add supplier, etc.).
- **Session state:** `OpsSessionState` holds pending payloads (`pendingCreateClientPayload`, etc.) and `confirmationRequestedAt` for 5‑min expiry.
- **Create entities:** Client, Supplier, Vehicle, Driver — all use the same pattern: tool call → `requiresUiConfirmation` → single system message with `pendingConfirm` card → execute on "Confirm" from card.
- **Image/OCR:** Last user message can include an image; Gemini vision extracts details; bot asks for missing fields and then confirms.
- **Natural language only:** No raw code in replies; `toNaturalLanguageReply()` strips code blocks.

---

## 1. Create Records via Natural Language

**Goal:** Parse intent → validate required fields → call correct backend API → confirm action (reuse existing card UI).

### 1.1 Already Implemented

| Entity   | Tool            | Required fields                         | Confirmation UI |
|----------|-----------------|-----------------------------------------|-----------------|
| Client   | `create_client` | contact_person, phone                   | In-chat card    |
| Supplier | `create_supplier` | phone + (company_name or contact_person) | In-chat card  |
| Vehicle  | `create_vehicle` | vehicle_number                           | In-chat card    |
| Driver   | `create_driver` | name, phone, license_number              | In-chat card    |

### 1.2 To Add: Create Trip

**Examples:** “Create trip from Chennai to Bangalore for 50,000” / “Add trip Chennai–Bangalore ₹50,000”.

**Plan:**

- **New tool:** `create_trip` (or `create_trip_request`).
- **Schema (minimal):** `origin`, `destination`, `amount` (or `freight`), optional `client_name`, `trip_number` (if system-generated later).
- **Backend:** Use existing trips service/API (e.g. `features/trips` or `services/tripsService`). If no API exists, add `createTrip(orgId, payload)` in trips feature.
- **Session state:** Extend `OpsSessionState` with `pendingCreateTripPayload?: { origin, destination, amount, client_name?, ... }`.
- **UI:** Reuse same in-chat confirmation card pattern: when `requiresUiConfirmation` and `pendingCreateTripPayload`, push system message with `pendingConfirm: { type: "trip", data: { ... } }`. Render trip-specific fields (origin, destination, amount, client) and "Create trip" button; on confirm call `executePendingCreateTrip` (new) then replace with success + optional `createdPreview` for trip.

**Validation:** Origin + destination + amount required; ask for missing: “Please provide origin and destination.” / “What’s the freight amount?”

---

## 2. Financial Updates via Natural Language

**Goal:** Identify entity + direction (IN/OUT) → create transaction → recalculate summaries.

**Examples:**

- “Client paid 20,000 for Trip T101”
- “Add 3,000 loading charge to Trip T101”
- “Add 2,500 fuel expense for TN01AB1234”
- “Supplier paid 5,000 penalty”

### 2.1 Design

- **New tools (recommended):**
  - `create_transaction` — single tool with params: `party_name` (or `party_id`/client/supplier/driver), `description`, `amount_in`, `amount_out`, `trip_id` or `trip_number` (optional), `transaction_date` (optional), `contact_type` (client | supplier | driver), `vehicle_number` (optional), `category` (fuel | toll | loading | penalty | payment | etc.).
- **Backend:** Use existing `createLedgerEntry` from `features/finance` (`CreateLedgerEntryData`: party_name, description, amount_in, amount_out, trip_id, contact_id, contact_type, vehicle_number, etc.).
- **Confirmation flow:** Same as creates: tool returns `requires_ui_confirmation` with `pendingCreateTransactionPayload`. In-chat card: “Add ₹X [description] for [party/trip]? In: ₹Y, Out: ₹Z.” → Confirm / Cancel.
- **Recalculate summaries:** After creating a transaction, refresh `opsContext` (revenue summary, entity counts) on next load or trigger a refetch so “What’s my revenue?” stays correct.

### 2.2 Core accounting model (mandatory for ledger/transaction tools)

All ledger and transaction creation/updates must follow the **core accounting model** (see `docs/CORE_ACCOUNTING_MODEL.md`). The Ops Agent system instruction in `services/opsAgentService.ts` includes this logic so the chatbot acts accordingly when discussing or updating ledger fields.

- **Customer payment (Cash IN):** amount_in, contact_type client, party_name = customer (Dr Cash, Cr AR).
- **Supplier payment (Cash OUT):** amount_out, contact_type supplier, description e.g. SUPPLIER (Dr AP, Cr Cash).
- **Driver payment (Cash OUT):** amount_out, contact_type driver, description = payment type e.g. Monthly salary (Dr Driver Payable, Cr Cash).
- **Vehicle expense (Cash OUT):** Do **not** use vehicle as party. Use **expense type** only: Fuel, Maintenance, Toll, Repair, Other. amount_out, no contact_id, party_name = expense type (Dr Vehicle Expense, Cr Cash). Vehicle is never a party.
- Balance is always computed from history; no direct balance editing.

### 2.3 Intent Parsing (System Instruction)

- “Client paid X” / “Received X from client” → amount_in, contact_type client, link to trip if “for Trip T101”.
- “Add X loading charge” / “Add X fuel expense” → amount_out, description/category, vehicle_number if given.
- “Supplier paid X penalty” → amount_out (or amount_in depending on convention), contact_type supplier.

Map natural language to `amount_in` vs `amount_out` and to `contact_type` and optional `trip_id`/`vehicle_number`.

### 2.4 Session State Extension

```ts
// OpsSessionState
pendingCreateTransactionPayload?: {
  party_name: string;
  description: string;
  amount_in: number;
  amount_out: number;
  trip_id?: string | null;
  contact_id?: string | null;
  contact_type?: 'client' | 'supplier' | 'driver' | null;
  vehicle_number?: string | null;
  category?: string | null;
  transaction_date?: string;
};
```

Execute function: `executePendingCreateTransaction(orgId, payload)` → calls `createLedgerEntry`, returns success/error and optionally a short summary for the reply.

---

## 3. Reporting Queries

**Goal:** Answer questions like “Show outstanding from ABC Logistics”, “Vehicle expense for TN01AB1234”, “Profit for Trip T101”, “Last 10 completed trips”, “Driver commission for February” — **without** letting the AI generate arbitrary SQL (safety).

### 3.1 Safe Approach: Predefined Report Tools

- **No dynamic SQL from the model.** Expose fixed tools that call backend report APIs.
- **New tools (examples):**
  - `get_client_outstanding` — params: `client_name` or `contact_id`. Backend: aggregate client ledger (sum in vs out), return balance and last N transactions.
  - `get_vehicle_expense_summary` — params: `vehicle_number`, optional `from_date`, `to_date`. Backend: filter transactions by vehicle_number, sum amount_out (and optionally by category).
  - `get_trip_profit` — params: `trip_number` or `trip_id`. Backend: trip revenue (amount_in) − trip costs (amount_out), optionally breakdown.
  - `get_last_trips` — params: `limit` (e.g. 10), optional `status` (completed). Backend: query trips table (no raw SQL from AI).
  - `get_driver_commission` — params: `driver_id` or `driver_name`, `month`/`year` or date range. Backend: use existing aggregation (e.g. `computeDriverCommissionForTrip`, aggregate by period).
- **Implementation:** Each tool returns a structured summary (e.g. `{ summary: string, rows?: Array<...> }`). System instruction: “Use the tool result to answer in natural language; do not invent numbers.”

### 3.2 Report Modules (Backend)

Implement (or align) these in `features/finance` or a dedicated reports module, all deriving from **transactions** (and related tables):

| Report                     | Source / logic                                                                 |
|----------------------------|---------------------------------------------------------------------------------|
| Client Outstanding        | Sum(amount_in) − Sum(amount_out) per client; from transactions + contact_type |
| Supplier Payable           | Sum(amount_out) − Sum(amount_in) per supplier (or by convention)               |
| Trip Profitability        | Per trip_id: amount_in − amount_out                                            |
| Vehicle Expense Summary   | Filter by vehicle_number; sum amount_out, optional by category                 |
| Driver Commission          | Existing aggregation + date filter                                             |
| Completed Operations       | Trips with status completed + optional summary                                  |
| Daily Cashflow             | Group transactions by date; sum in/out per day                                  |

AI tools call these as **read-only** APIs; no SQL string from the LLM.

---

## 4. OCR Module (Structured)

**Goal:** User uploads fuel bill, toll receipt, maintenance invoice, or payment receipt → OCR extracts structured fields → AI suggests mapping → user confirms → create transaction.

### 4.1 Extracted Fields (from OCR)

- `vendor_name`
- `date`
- `amount`
- `vehicle_number` (if visible)
- `bill_type` (fuel | toll | maintenance | payment_receipt | unknown)

OCR can be:

- **Option A:** Gemini vision on the same image already sent (extract text + structure). Prompt: “From this receipt/bill image extract: vendor_name, date, amount, vehicle_number (if any), and classify bill_type as one of: fuel, toll, maintenance, payment_receipt, or unknown.”
- **Option B:** Dedicated OCR service (e.g. Google Document AI, or a small parser on top of Gemini vision). Output: same structured object.

### 4.2 Flow (Reuse Existing Confirmation + Image)

1. User attaches image (existing “attach image” in chat).
2. User message: “Add this receipt” or “Add fuel bill” or just image.
3. **New tool or extended flow:**  
   - If last message has image, model (or a dedicated step) returns **structured OCR result** (e.g. via a tool `ocr_receipt` that returns the extracted fields).  
   - Then a second step or same turn: AI suggests mapping: “Add ₹2,350 fuel expense to TN01AB1234?” with `pendingCreateTransactionPayload`: amount_out=2350, description=“Fuel – [vendor_name]”, vehicle_number=TN01AB1234, category=fuel, transaction_date=extracted date.
4. **Confirmation:** Same in-chat card: “Add ₹2,350 fuel expense to TN01AB1234?” → Confirm / Edit / Cancel.
5. On confirm: `createLedgerEntry` with the mapped data.

### 4.3 Bill Type → Transaction Mapping

| bill_type      | Suggested mapping                          |
|----------------|--------------------------------------------|
| fuel           | category=fuel, amount_out, vehicle_number  |
| toll           | category=toll, amount_out, vehicle_number  |
| maintenance    | category=maintenance, amount_out, vehicle  |
| payment_receipt| amount_in, party from vendor or context    |

System instruction: “When the user attaches a receipt/bill image, use OCR to extract vendor_name, date, amount, vehicle_number, and bill_type. Suggest a single transaction (e.g. ‘Add ₹X fuel expense to vehicle Y?’). Only create after user confirms.”

---

## 5. Ledger View (Mobile-Friendly)

**Goal:** 4-column view: Date | Ref | In | Out; Trip tag if linked; row click → detail; add entry; edit only if manual; soft delete.

### 5.1 Layout

- **Columns:** Date | Ref (trip number or “Manual”) | In | Out.
- **Rules:**
  - Show Trip tag (e.g. badge “T101”) when `trip_id` is set.
  - Tap row → open trip detail or expense detail (existing `EntityDetailOverlay` or trip detail screen).
  - “Add entry” → same as today: add ledger entry (can be wired to Finance tab or a FAB that opens add-transaction flow).
  - Edit: only if entry is “manual” (e.g. no trip_id or a `source` flag); otherwise show read-only or “Linked to trip”.
  - Soft delete: mark as deleted (e.g. `deleted_at` or status); do not hard-delete.

### 5.2 Implementation Notes

- Reuse `LedgerTab` / `FinancialRow` / `LedgerBlock` in `features/finance`.
- Ensure transactions table (or view) has: `trip_id`, `trip_number` (from join), `amount_in`, `amount_out`, `transaction_date`, and a way to distinguish “manual” vs trip-linked (e.g. `trip_id` null = manual).
- Add “Ref” column: display `trip_number` or “Manual” / “—”.
- Row press: `onPress` → navigate to trip detail by `trip_id` or to a generic transaction detail bottom sheet.

---

## 6. Report Modules (Required Reports)

All reports **derive from transactions table** (and joined trip/entity data). Implement as read-only APIs or server-side report generators; AI calls them via tools.

| Report                      | Description / logic                                                                 |
|-----------------------------|--------------------------------------------------------------------------------------|
| Client Outstanding Report   | Per client: sum(amount_in) − sum(amount_out); list clients with balance             |
| Supplier Payable Report     | Per supplier: sum(amount_out) − sum(amount_in) (or per your convention)              |
| Trip Profitability Report  | Per trip: revenue (in) − costs (out); optional margin %                              |
| Vehicle Expense Summary    | Per vehicle: sum(amount_out), optional by category (fuel, toll, maintenance)        |
| Driver Commission Report   | Use existing driver aggregation; filter by date range                               |
| Completed Operations Summary| Count/sum of completed trips in period; optional revenue/cost totals                |
| Daily Cashflow Report      | Group by transaction_date; sum amount_in, amount_out; running or daily net          |

- **Backend:** Add report functions in `features/finance` (e.g. `getClientOutstandingReport`, `getVehicleExpenseSummary`) or a dedicated `features/reports` that uses finance + trips.
- **AI tools:** Each report has one tool (e.g. `get_client_outstanding_report`) that takes filters (date range, entity id) and returns a structured summary string (or JSON) for the model to turn into natural language.

---

## 7. Implementation Phases (Suggested Order)

| Phase | Scope                                                                 | Dependencies |
|-------|-----------------------------------------------------------------------|--------------|
| **1** | Create Trip (tool + backend + pendingConfirm card for trip)          | Trips API    |
| **2** | Financial updates (create_transaction tool + payload + execute + card)| createLedgerEntry |
| **3** | Report tools (get_client_outstanding, get_vehicle_expense, get_trip_profit, get_last_trips, get_driver_commission) | Finance aggregation APIs |
| **4** | OCR structured (extract vendor, date, amount, vehicle, bill_type) → suggest transaction → same confirm card | Image already sent; create_transaction |
| **5** | Ledger 4-column view + row tap + add entry + edit/delete rules       | LedgerTab / FinancialRow |
| **6** | All report modules (backend report APIs + corresponding AI tools)     | Phase 3 + finance aggregation |

---

## 8. Consistency with Existing UI

- **All confirmations** use the same in-chat card: title (“Add supplier?”, “Add transaction?”, etc.), “Edit details below, then confirm.”, editable fields, Cancel + primary button.
- **Session state** stays in `OpsSessionState`; add `pendingCreateTripPayload`, `pendingCreateTransactionPayload`, and optionally `pendingOcrTransactionPayload` (or reuse transaction payload for OCR-suggested entry).
- **Success:** Toast “Successfully added. You can edit this in history or in the app.” and card moves to “Added to history” with optional “Edit” to re-open.
- **Natural language only:** All bot replies remain plain language; no code or raw SQL in the chat.

---

## 9. Files to Touch (Summary)

| Area                | Files / locations                                                                 |
|---------------------|------------------------------------------------------------------------------------|
| Ops Agent UI        | `app/(tabs)/index.tsx` (pendingConfirm cards for trip, transaction; OCR suggestion card if separate) |
| Ops service         | `services/opsAgentService.ts` (new tools, session state, executePendingCreateTrip, executePendingCreateTransaction, report tools) |
| Trips               | `features/trips` or trips service (createTrip)                                    |
| Finance             | `features/finance` (createLedgerEntry already; add report helpers)                |
| Reports             | New or under `features/finance`: report APIs used by report tools                  |
| Ledger view         | `features/finance` (LedgerTab, FinancialRow, 4-column layout, row tap, edit/delete rules) |

This plan keeps the **existing confirmation flow and UI** as the single pattern for all create/update actions and adds the new capabilities in a structured, phased way.

---

## 10. Reference: Existing Confirmation Flow (Code)

| What | Where |
|------|--------|
| In-chat confirmation card (Create client / Add supplier / etc.) | `app/(tabs)/index.tsx`: `msg.pendingConfirm` block; `updatePendingConfirmData`, `handlePendingConfirmSubmit`, `handlePendingConfirmCancel` |
| Session state & payloads | `services/opsAgentService.ts`: `OpsSessionState`, `pendingCreateClientPayload`, etc.; `setConfirmation()` in tool handlers |
| Single system message with card | `app/(tabs)/index.tsx`: `runProcessMessages` → when `result.requiresUiConfirmation` push one message with `content` + `pendingConfirm` |
| Execute after confirm | `app/(tabs)/index.tsx`: `handlePendingConfirmSubmit` → `executePendingCreateClient` / `executePendingCreateSupplier` / etc. |
| Post-create editable preview | `app/(tabs)/index.tsx`: `msg.createdPreview` (same card UI, “Added to history” + Edit to re-edit and “Confirm & update”) |
| Image attachment for OCR | `app/(tabs)/index.tsx`: `pickImageForOcr`, `lastUserMessageImage` passed to `processOpsMessage`; `buildContents` in opsAgentService adds `inlineData` for last user turn |
| Finance ledger API | `features/finance/services/finance.service.ts`: `createLedgerEntry`, `getTransactionsByOrganization`, `getTransactionsByOrganizationAndParty` |
| Aggregation (for reports) | `features/finance/aggregation`: `aggregateCustomers`, `aggregateSuppliers`, `aggregateDrivers`, `computeDriverCommissionForTrip` |
