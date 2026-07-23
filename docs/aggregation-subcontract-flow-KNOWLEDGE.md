# Aggregation / Subcontract Flow — Knowledge & Proposal

> Status: **Proposal only. Nothing implemented. Awaiting Vasanth's approval.**
> Context: traced from real data — Indent IND011 (Paperkraft). See [give-load-flow-IND011.md](give-load-flow-IND011.md).

## Real-world trace (what actually happened)

- **Paperkraft** created indent IND011 (client MAX, Delhi→Bengaluru, ₹75,000; supplier target ₹74,000).
- Circulation = `integrated_supplier` → went out as a **direct quote**, not an open broadcast.
- **Lenovo company** gave a direct quote ₹74,000 → **awarded**. Indent flipped to `completed`.
- On award, indent converted to trip **TRP001** (supplier = Lenovo, ₹74,000, driver Ravi, TN 11 DD 2580).
- **Lenovo subcontracted to ABI Logistics** at ₹73,000 (`LEN946-SUB-cmsb89`). Subcontract status `pending`.
- Chain: Paperkraft → Lenovo (₹74k) → ABI (₹73k). Lenovo margin ₹1,000.

## The 3 UI issues that exposed this

1. **ABI can't see the trip** (even though ABI is on the app). Subcontracting writes only Lenovo's row; ABI has no trip, no request, no notification. RLS on `trip_subcontracts` only allows `viewer_org_id` (Lenovo) — ABI (`sub_supplier_org_id`) is locked out.
2. **Lenovo shows as "supplier"** on the trip — this is **correct**. Paperkraft pays Lenovo; Lenovo being an aggregator doesn't change who Paperkraft's supplier is.
3. **Money legs:** Paperkraft→Lenovo ₹74k and Lenovo→ABI ₹73k are two separate deals. App captures the first as a real trip; the second is only a note. ABI-owed money isn't tracked as an actual payable.

## Acceptance vs direct assignment (today's behavior)

- Today it's **direct assignment**. `pending` = Lenovo's internal status, **not** "waiting for ABI to accept."
- ABI can't accept — ABI can't even see it.
- Open decision: keep **direct-assign** (ABI auto-gets a trip, can't decline) vs add an **acceptance step** (request → ABI accepts/rejects → trip on accept, mirrors indent flow).

---

## Case study — what breaks

### If we DON'T fix it
1. ABI works blind (WhatsApp/calls); platform has no visibility.
2. No POD/timestamps from ABI → disputes fall on Lenovo's word.
3. ₹73k payable invisible → no aging, no reconciliation.
4. Trip stuck at `assigned` forever → wrong dashboards.
5. ABI has no reason to use the app → network doesn't grow.

### If we DO fix it — new risks (the chain/looping problem)
1. **Deep/infinite chains** — ABI subcontracts to C, C to D... margin bleeds to zero/negative; status chaos across copies.
2. **A→B→A cycles** — assigning back upstream → infinite loop / duplicate trips.
3. **Acceptance deadlock** — ABI ignores request, load sits unassigned near pickup.
4. **Double-booking** — same load sent to two orgs, both accept.
5. **Cancel/reject cascade** — deep cancel must bubble up cleanly, not orphan records.
6. **Visibility leak** — ABI seeing client name / ₹75k client price leaks Lenovo's margin + end-client identity.
7. **Payment chain stall** — upstream unpaid strands everyone downstream.

### Are these controllable? YES — four mechanisms
- **Depth cap** — `chain_depth` per hop; block beyond max (suggest 3).
- **Cycle check** — keep chain-org list; reject target already in chain.
- **Single canonical status** — physical trip has ONE real status; each hop's view is read-only-derived.
- **Per-hop masked records** — each hop sees only its own rate/route + its own money + acceptance state.

Once these four exist, every risk becomes a bounded, testable rule. Known pattern (multi-tier freight brokerage), just not built yet.

---

## Implementation plan (proposed, on approval)

### Phase 1 — Core (make ABI functional)
1. Create a **real trip on ABI's side** on subcontract, linked to the parent trip (not just a note).
2. Add **RLS policy** so `sub_supplier_org_id` (ABI) can read their leg.
3. Add **acceptance step** — Lenovo requests → ABI accepts/rejects → trip active on accept (reuse indent pattern). *(OR keep direct-assign — decision needed.)*
4. Record **Lenovo→ABI payable** (₹73k) as a real finance record, separate from Paperkraft→Lenovo.

### Phase 2 — Safety rails (mandatory before chaining goes live)
5. **Depth cap** — `chain_depth` field + block beyond max (3).
6. **Cycle check** — chain-org list, reject if target already in chain.
7. **Single canonical status** — parent trip status flows down; hop views read-only-derived.

### Phase 3 — Defer (after core works)
- Masked views (hide client price/name down-chain).
- Expiry/auto-reject, first-accept-wins lock, cancel cascade.
- Independent per-hop payment aging.

## Decisions needed from Vasanth
1. **Acceptance step or direct-assign** for subcontracting (now)?
2. **Max chain depth** (suggest 3)?
3. Priority: ship Phase 1 first, or Phase 1+2 together before enabling chaining?

## Relevant files (for implementation)
- `supabase/migrations/20261027120000_add_trip_subcontracts.sql` — subcontract table + RLS (currently viewer-only)
- `supabase/migrations/20261026120000_add_trips_supplier_view.sql` — supplier trip view
- Tables: `trips`, `trip_subcontracts`, `direct_quotes`, `suppliers`, `indents`
