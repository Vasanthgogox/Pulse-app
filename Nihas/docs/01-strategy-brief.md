# 01 — Strategy Brief

**Status:** Draft, unvalidated. **Date:** 2026-09-02.

---

## 1. The problem we claim to solve

Road freight in the SME segment is coordinated over phone calls, WhatsApp and paper. Three
concrete failures follow from that:

1. **Load Givers can't price competitively.** They call 2–3 known transporters, take whatever
   number they hear, and have no record of what the market rate actually was.
2. **Load Movers can't fill capacity.** They find work through brokers who take a cut and
   control the relationship. Trucks run empty on return legs.
3. **Nobody has a clean execution record.** Status is a phone call to the driver. POD is a
   photo in someone's WhatsApp. This directly delays payment, because the payer has no
   verified proof of delivery.

**The wedge:** structured bidding on loads, and a trip record clean enough to trigger payment.

### Honest counter-argument

Every one of these problems has been "solved" repeatedly by well-funded companies. India alone
has seen Rivigo, BlackBuck, Vahak, FR8, Porter and a dozen others attack this. Most either
pivoted to being an asset-heavy transporter, became a lending business, or died.

The reason is consistent: **the phone call is not a bad product, it is a relationship.** A Load
Giver uses a transporter they trust because trust absorbs the risk of goods being stolen,
damaged, or held hostage over payment. A bidding marketplace optimises price and destroys trust.
Movers respond by bidding low to win and then renegotiating on the road.

**We are only viable if we are not primarily a marketplace.** The defensible product here is
the *execution and settlement* layer for relationships that already exist. Bidding is a
feature for the subset of loads where the Giver genuinely has no preferred mover.

This reframing should be resolved before build starts — it changes what we build first.
See `07-open-decisions.md` D0.

---

## 2. Who this is for

| Segment | Description | Why they'd adopt | Why they wouldn't |
|---|---|---|---|
| **Load Giver** | SME manufacturer / distributor / trader. 10–200 loads/month. Has 1–2 ops staff. | Faster mover discovery, audit trail, fewer "where is my truck" calls | Already has 3 trusted transporters. Zero switching pressure. |
| **Load Mover** | Fleet owner (5–100 trucks) or broker with no trucks. | Load discovery, less broker margin leakage, dispatch tooling | Low digital literacy, distrust of price transparency, sees platform as a future competitor |
| **Aggregated Supplier** | Owner of 1–10 trucks who sub-contracts to Movers. | Utilisation | Gets the *least* value here and the *least* visibility. High churn risk. |
| **Driver** | Employed or attached driver. Android phone, patchy data. | Nothing, honestly. Adoption is coerced by their employer. | Extra work, no benefit, data cost, distrust of tracking. |

**The driver is the load-bearing user and has the weakest incentive.** If drivers don't update
status and upload POD, the entire value proposition (clean execution record → faster payment)
collapses. This is the single biggest product risk. See `08`.

---

## 3. Goals

**Primary (v1):** For a Load Giver's awarded load, produce a complete, timestamped execution
record — assignment, milestone events, POD — without the ops team making a phone call.

**Secondary:** Give Load Movers a dispatch tool good enough that they keep using it even for
loads that came from outside the platform.

**Explicit non-goals for v1:**
- Public open marketplace / anyone bidding on anything
- Freight rate discovery or benchmarking
- Payments, escrow, invoicing, or lending
- GPS hardware, ELD, telematics integration
- Multi-stop / multi-leg / part-load consolidation
- Aggregated supplier as a first-class self-serve tenant
- Negotiation / counter-offer loops on bids
- Mobile app for Load Giver or Load Mover (web only)

---

## 4. Success metrics

These are **hypotheses to instrument**, not commitments. All are per-tenant, measured on a
7-day rolling window.

| Metric | Why it matters | Placeholder target | Confidence |
|---|---|---|---|
| **Driver event completion rate** — % of deployed trips with ≥4 of 5 milestone events | The core mechanism. If this fails nothing else matters. | 70% | Low. This is the number to learn, not to hit. |
| **POD-within-6h rate** — % of delivered trips with POD uploaded ≤6h after DELIVERED | The payment trigger | 60% | Low |
| **Award-to-deploy time** — median hours from award to trip DEPLOYED | Measures whether dispatch tooling is usable | <12h | Medium |
| **Repeat-award rate** — % of Givers who award ≥2 loads in 30 days | Real retention signal | 40% | Medium |
| **Bid coverage** — % of published loads with ≥2 bids | Only meaningful if we go marketplace-first | 50% | Very low — depends on D0 |

**Guardrails (things that must not get worse):**
- Award reversal / trip cancellation rate after deploy — target <10%
- % of trips where ops still called the driver — measured by survey, target <30%
- Aggregated supplier churn

**Anti-metrics — do not celebrate these:** registered tenants, loads posted, bids submitted.
All are trivially inflatable and none imply a completed trip.

---

## 5. Constraints

- **[ASSUMPTION — CONFIRM]** Supabase/Postgres + RLS is the persistence and authz layer,
  consistent with the existing q-web codebase.
- **[ASSUMPTION — CONFIRM]** React web app for Giver/Mover; React Native/Expo for driver.
- **[UNKNOWN]** Team size and composition. Every date in `06-delivery-plan.md` is fiction
  until this is filled in.
- **[UNKNOWN]** Whether this ships inside the existing q-web product or as a new surface.
  Materially changes effort — q-web already has organizations, users, clients, suppliers,
  connections and finance modules that may be reusable or may conflict.
- Drivers are on low-end Android with intermittent connectivity. **Offline-tolerant event
  capture is not optional.**

---

## 6. Timeline

**[UNKNOWN — no team size]** `06-delivery-plan.md` gives relative sequencing and rough effort
in engineer-weeks. It deliberately does not give calendar dates. Anyone who wants dates should
supply headcount first.

Directionally: three sequenced releases (R1 execution core, R2 bidding, R3 aggregation), each
gated on the previous one's metrics rather than on a date.
