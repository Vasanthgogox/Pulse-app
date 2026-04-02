# Shared Ledger: See Mismatch, Raise Dispute, Auto-Update with Confirmation

## Context (your two transactions)

| Party              | Org ID        | Trip ID (TRP002) | amount_in | amount_out | Meaning                    |
|--------------------|---------------|------------------|-----------|------------|----------------------------|
| Nihas's Org        | cf49d70b-...  | f8ceeafc-...     | 0         | 25,000     | Supplier: we received 25k  |
| Mukunt's Org       | 1a46726a-...  | f8ceeafc-...     | 20,000    | 0          | Client: we paid 20k        |

**Mismatch:** Same trip; supplier shows Paid ₹25,000, client shows Paid ₹20,000 → **₹5,000 variance**.

---

## 1. See the data mismatch

**Where it appears:** Compare & Verify tab on the entity detail (supplier or client). Each mission row shows **My Book** (your sales/paid) and **Partner** (their sales/paid). When they differ, status is **MISMATCH** and the Variance column shows the difference.

**Why you see "Wait" today:** Partner numbers come from the backend RPC `get_shared_ledger_entries(org_id, partner_key)`. The app calls it with `partner_key = entity.id` (the contact_id of the other party). If the RPC returns no entries for that trip, or the connection is missing, the app shows "Wait" and status **PENDING**.

**What the backend must do (Q-unified-base):**

- When Org A and Org B have an active `shared_ledger_connection` and a shared contact (e.g. client/supplier link), the RPC **get_shared_ledger_entries(org_id, partner_key)** must return the **partner org’s** ledger view for trips involving both parties.
- Example: Nihas (supplier org) opens Compare & Verify for Mukunt (client). The app calls `get_shared_ledger_entries(Nihas_org_id, Mukunt_contact_id)`. The backend should return entries that represent **Mukunt’s org’s** view of those trips (e.g. for TRP002: sales 30,000, paid 20,000), with `reference_id` = trip_id so the app can aggregate by trip into `extSales` and `extPaid`.
- So: backend must expose the **other org’s** per-trip sales/paid (or equivalent in/out amounts) keyed by `reference_id` (trip_id). Then the app will show partner columns and compute variance; when `intSales !== extSales` or `intPaid !== extPaid`, status becomes **MISMATCH** and the user **sees** the mismatch.

**Mobile app:** No change needed for “see mismatch” once the backend returns partner entries; the UI (MISMATCH, Variance, Reconciliation Statement) is already implemented.

---

## 2. Raise a dispute

**Already in the app:**

- For a row with status **MISMATCH** or **UNRECOGNIZED**, the user can tap **Raise Dispute**.
- A modal collects an optional reason; on submit the app calls **createDispute** with `transaction_id` (tripId), `internal_snapshot` (your net), `partner_snapshot` (partner net), `reason_code`.
- The other party sees **Dispute received** and can **Accept & Auto-Update Ledger** or **Decline**.

**Backend:** Ensure `create_dispute` (or insert into `dispute` table) and `get_disputes` / `get_disputes_received` are implemented and RLS allows the right orgs to read/write (see SHARED_LEDGER_BACKEND_CONTRACT.md).

---

## 3. Auto-update with confirmation

**Update My Book (you accept partner’s numbers):**

- When status is **MISMATCH** or **PENDING** and partner data exists, the row shows **Update My Book**.
- **Change made:** Before calling `acceptPartnerView`, the app now shows a **confirmation dialog**:
  - Title: **Confirm update**
  - Message: “Update your book to match [Partner]? Sales: ₹X | Paid: ₹Y. This will update your ledger for this trip.”
  - Buttons: **Cancel** | **Update my book**
- On **Update my book**, the app calls `accept_partner_view(org_id, trip_id, partner_sales, partner_paid)`; the backend updates the caller’s ledger for that trip to match the partner. After success, the app shows “Ledger updated” and refreshes so the row becomes MATCHED.

**Accept & Auto-Update Ledger (partner accepts your dispute):**

- When the other party raised a dispute, you see **Dispute received** and **Accept & Auto-Update Ledger**.
- **Change made:** Before resolving, the app now shows a **confirmation dialog**:
  - Title: **Accept partner's view?**
  - Message: “Your ledger for this trip will be updated to match the partner's numbers. This cannot be undone.”
  - Buttons: **Cancel** | **Accept & update**
- On **Accept & update**, the app calls `resolve_dispute(dispute_id, 'ACCEPT', org_id)`; the backend updates your ledger to match the raiser’s view and marks the dispute RESOLVED. Then the app shows “Ledger updated”.

---

## 4. End-to-end flow (after backend is ready)

1. **Nihas (supplier)** opens Nihas’s Organization → Compare & Verify. Sees TRP002: My Book Sales 30k, Paid 25k; Partner (Mukunt) Sales 30k, Paid 20k → **Mismatch**, Variance ₹5,000.
2. **Options:**
   - **Update my book** → Confirm → Ledger updated to Sales 30k, Paid 20k (match partner).
   - **Raise dispute** → Enter reason → Submit → Mukunt sees “Dispute received”.
3. **Mukunt (client)** opens Compare & Verify for Nihas (or sees dispute in list). Sees “Dispute received” → **Accept & update** (with confirmation) → Ledger updated to match Nihas; or **Decline** → Nihas sees “Declined”.

---

## 5. Files touched (mobile)

- **EntityCompareVerifyView.tsx**
  - `handleUpdateMyBook`: wrapped in `Alert.alert("Confirm update", msg, [Cancel, Update my book])`; on confirm call `acceptPartnerView`, then success alert.
  - `handleAcceptReceivedDispute`: wrapped in `Alert.alert("Accept partner's view?", ..., [Cancel, Accept & update])`; on confirm call `resolveDispute(..., 'ACCEPT', ...)`, then success alert.

---

## 6. Backend checklist (Q-unified-base)

- [ ] **get_shared_ledger_entries(org_id, partner_key)** returns the **partner org’s** ledger entries for shared trips, with `reference_id` = trip_id and amounts that allow the app to derive partner sales/paid per trip.
- [ ] **shared_ledger_connection** links the two orgs (and optionally contact_id) so the app knows they are “integrated”.
- [ ] **accept_partner_view(org_id, trip_id, partner_sales, partner_paid)** updates the caller’s ledger (e.g. transactions or cash_entries for that trip/contact) to match the given sales/paid.
- [ ] **resolve_dispute(..., 'ACCEPT', ...)** updates the receiver’s ledger to match the raiser’s view and sets dispute to RESOLVED.

Once these are in place, the mobile app will show the mismatch, allow raising a dispute, and perform auto-update only after user confirmation for both “Update my book” and “Accept & Auto-Update Ledger”.
