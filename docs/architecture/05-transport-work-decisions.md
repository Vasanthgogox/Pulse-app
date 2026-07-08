# Transport Work — Decision Log

Not an ADR process — just decisions, so someone joining later understands why the model looks the way it does. Append-only; don't edit past entries, add a new one if a decision is reversed.

---

**Decision 001 — Transport Work chosen over Trip as the aggregate root**
Reason: Trip is execution only.

---

**Decision 002 — Capacity Strategy instead of Indent/Marketplace as products**
Reason: Indent and Marketplace are each one implementation of acquiring capacity, not the concept of capacity acquisition itself.

---

**Decision 003 — Trip's foreign key points to Transport Work, not the reverse**
Reason: Supports 1:N execution (single-leg, relay, split shipment, multi-drop, cross-docking).

---

**Decision 004 — "Order" rejected as the root entity name**
Reason: Collides conceptually with the existing (dormant) `sales_orders`/`execution_plans` commerce_module schema — a different, SKU/warehouse-consolidation domain that happens to use the same word.

---

**Decision 005 — Completion and Settlement kept as separate lifecycle stages**
Reason: Different business departments (Operations vs. Finance) with different timing — the ledger is written well after `completed_at` in the current system, and collapsing the stages would hide that real gap.

---

**Decision 006 — Invoice and Supplier Bill modeled as two distinct objects, not one "Invoice"**
Reason: Already separate tables today with separate lifecycles (`invoices`: draft/sent/paid/cancelled/void; `supplier_bills`: pending/approved/paid/cancelled) — receivable and payable are not the same object.

---

**Decision 007 — Master data must never store operational state**
Reason: Prevents duplicated/conflicting state between master records and Transport Work/Trip. Named one existing violation rather than treating the principle as purely aspirational: `drivers.status` includes `'on_trip'` today.

---

**Decision 008 — "Capacity Method" renamed to "Capacity Strategy"**
Reason: More accurate terminology — Manual, Direct Supplier, Marketplace, API, and AI are strategies for acquiring capacity, not the capacity itself.
