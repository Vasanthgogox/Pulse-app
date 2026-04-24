# Core Accounting Model (Double Entry)

**Use this document as the single source of truth for all ledger, entry, and finance data flow.** The app must follow double-entry logic even when the UI shows a single “Cash IN” or “Cash OUT” row. Do not disturb existing UI/layout; implement the model in data flow and entry logic.

---

## 1. Core Accounting Model (Very Important)

- **Double-entry logic is required**, even if hidden from the user.
- **Core accounts:**
  - **Accounts Receivable (Customer)** — AR
  - **Accounts Payable (Supplier)** — AP
  - **Driver Payable**
  - **Vehicle Expense**
  - **Revenue**
  - **Cash / Bank**
  - **Commission Expense**
- **Every transaction must hit at least two accounts.** Balance is always computed from transaction history; no direct balance editing.

---

## 2. Entity Structure (Ledgers)

### 2.1 Customer Ledger
- **Type:** Receivable
- **Tracks:** Trip sale value, customer payments, outstanding balance, credit period, aging.

### 2.2 Supplier Ledger
- **Type:** Payable (aggregator use case)
- **Tracks:** Trip purchase cost, payments made, outstanding payable.

### 2.3 Driver Ledger
- **Tracks:** Salary (fixed), per-trip commission, advances, deductions, net payable.

### 2.4 Vehicle Ledger (Asset Based Only)
- **Tracks:** Trip revenue allocated, fuel expense, maintenance, toll, insurance, permit, EMI, net contribution margin. This is **Vehicle P&L**.

---

## 3. Trip Creation → Ledger Flow

### CASE 1: Asset Vehicle Used

**Trip input example:** Sale value ₹100,000, driver commission ₹5,000, fuel estimate ₹20,000, other cost ₹5,000.

| Step | Double entry | Effect |
|------|--------------|--------|
| 1 – Customer receivable | Dr Accounts Receivable ₹100,000 · Cr Revenue ₹100,000 | Customer ledger updated |
| 2 – Driver commission | Dr Commission Expense ₹5,000 · Cr Driver Payable ₹5,000 | Driver ledger updated |
| 3 – Vehicle cost | Fuel/toll etc.: estimated at trip creation **or** entered later as expense | Optional at trip creation |
| 4 – Vehicle revenue | Allocate to vehicle P&L: Revenue ₹100,000, Expenses ₹25,000, Net ₹75,000 | Vehicle P&L updated |

### CASE 2: Aggregation (Supplier Vehicle Used)

**Trip input:** Sale value ₹100,000, supplier rate ₹85,000.

| Step | Double entry | Effect |
|------|--------------|--------|
| 1 – Customer receivable | Dr Accounts Receivable ₹100,000 · Cr Revenue ₹100,000 | Same as asset case |
| 2 – Supplier payable | Dr Cost of Service ₹85,000 · Cr Accounts Payable (Supplier) ₹85,000 | Supplier ledger updated |
| 3 – Gross margin | Revenue ₹100,000 − Cost ₹85,000 = Margin ₹15,000 | No driver/vehicle ledger impact |

---

## 4. Cash Flow Entry Structure

Separate **invoice/commitment** (trip creation) from **payment recording** (ledger entry).

### 4.1 Customer payment (Cash IN)
- **Example:** Customer pays ₹60,000  
- **Entry:** Dr Cash/Bank ₹60,000 · Cr Accounts Receivable ₹60,000  
- **Effect:** Outstanding (AR) reduces.

### 4.2 Supplier payment (Cash OUT)
- **Example:** Paid supplier ₹50,000  
- **Entry:** Dr Accounts Payable ₹50,000 · Cr Cash/Bank ₹50,000  
- **Effect:** Outstanding (AP) reduces.

### 4.3 Driver payment (Cash OUT)
- **Example:** Paid driver ₹10,000  
- **Entry:** Dr Driver Payable ₹10,000 · Cr Cash/Bank ₹10,000  

### 4.4 Vehicle expense (Cash OUT)
- **Example:** Fuel ₹20,000  
- **Entry:** Dr Vehicle Expense ₹20,000 · Cr Cash/Bank ₹20,000  
- **Effect:** Vehicle P&L updated.

---

## 5. Vehicle P&L Structure

Per vehicle:
- **Revenue:** Trip revenue (asset-only trips).
- **Expenses:** Fuel, maintenance, driver salary, toll, EMI, insurance.
- **Dashboard:** | Vehicle | Revenue | Expense | Net Margin | Trips | Avg Margin/Trip |

Use for decisions: sell asset, replace driver, adjust rate.

---

## 6. Data Flow Summary

| Trigger | System behaviour |
|--------|-------------------|
| **User creates trip** | Identify **Asset** vs **Aggregation** |
| **If Asset** | Create AR entry · Create Driver payable · Allocate revenue to vehicle |
| **If Aggregation** | Create AR entry · Create Supplier payable · No vehicle allocation |
| **Cash received** | Update AR (Dr Cash, Cr AR) |
| **Payment made** | Update AP or Driver payable (Dr AP/Driver Payable, Cr Cash) |
| **Every transaction** | Append to audit log · Emit event for analytics |

---

## 7. Ledger Entry Data Model (Target)

Each ledger entry answers **Who / Why / How** and should support (or be interpretable as):

- **Who:** `entity_type` + `entity_id` → today mapped from `contact_type` + `contact_id` (client | supplier | driver); vehicle / garage lines use `vehicle_number` and category in `description`.
- **Why:** `trip_id` (recommended, optional) + **category** (first segment of `description`, e.g. Trip Payment, Fuel).
- **How:** **payment mode** + optional **reference** → stored in `description` as `| Mode: …` and `| UTR: …` (reference omitted for Cash). Helpers: `features/finance/ledger/ledgerEntryModel.ts` (`buildLedgerSyncDescriptionLine`, `interpretLedgerRowStructured`).

Unified shape (logical; DB may evolve):

- `entry_id`
- `entity_type` (customer / supplier / driver / vehicle)
- `entity_id`
- `trip_id` (nullable)
- `transaction_type` (receivable | payable | expense) — infer: Cash IN → receivable; Cash OUT + driver/supplier → payable; vehicle-style expense → expense
- `category`, `payment_mode`, `reference_number`, optional `notes`
- `created_by` · `created_at` · `status`

**Do not store only balance.** Store full transaction history; **balance must be computed**.

Current `transactions` table (`amount_in`, `amount_out`, `contact_id`, `contact_type`, `trip_id`, `description`, optional `vehicle_number` / `driver_name` when present) plus optional **`ledger_entity_type`**, **`ledger_flow_type`**, **`ledger_category`** (migration `20260423190000_transactions_ledger_meta_columns.sql`) is the single-entry surface; see `features/finance/accounting/accountingModel.ts` for double-entry mapping. `createLedgerEntry` fills meta from `interpretLedgerRowStructured` when columns exist.

---

## 8. Special Rules to Implement

- **Trip rate edit** → Auto-adjust receivable (AR).
- **Supplier rate edit** → Auto-adjust payable (AP).
- **Trip cancellation** → Reverse entries.
- **Ledger edit after 7 days** → Require admin approval.
- **No direct balance editing** — balance always derived from history.

---

## 9. Advanced (Intelligence-Ready)

Store (or derive where possible):
- Payment delay days
- Avg driver commission %
- Avg vehicle cost per km
- Margin variance per route
- Cash flow gap (AR − AP days)

Examples of future insights: *“Vehicle KA01AB123 margin dropped 18% this month.”*

---

## 10. UI Plan for Ledger Management (Reference)

Sidebar / tabs:
- Ledger
- Customers
- Suppliers
- Drivers
- Vehicles
- Cash & Bank

Each page: Summary · Transaction list · Outstanding · Aging · Cash flow chart.

Existing Finance tab (Customers, Suppliers, Trips, Garrage, Drivers, Ledger) and entity details already align with this structure; new screens should follow the same pattern without disturbing current layout.
