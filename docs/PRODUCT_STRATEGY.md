# Pulse Product Strategy

**Status:** Operating north star after foundational platforms. Architecture is not the bottleneck — **commercial conversion** and **operational excellence** are.

Companions: `docs/MARKETPLACE_DOMAIN.md` · `docs/TRIP_OPERATIONS_PLATFORM.md` · `docs/SCALABILITY_PLATFORM.md` · `docs/PLATFORM_CONSUMER_RULE.md` · `docs/MARKETPLACE_M1_CONSISTENCY_CHECKLIST.md`

---

## Where Pulse is today — platform pillars

These are foundational. They should **not** keep changing every sprint. What evolves now is how users **experience** them — **after** system health gates are green.

| Pillar | Truth it owns | Status | Doc |
|--------|---------------|--------|-----|
| **Trip Operations Platform** | Execution truth | ✅ Stable | `docs/TRIP_OPERATIONS_PLATFORM.md` |
| **Marketplace Platform** | Commercial truth | ✅ Stable | `docs/MARKETPLACE_DOMAIN.md` |
| **Scalability & Reliability Platform** | Performance & synchronization truth | 🟡 Active (P0–P4 before M2 UX) | `docs/SCALABILITY_PLATFORM.md` |
| **Product Intelligence Platform** | Analytics, AI, recommendations | 🔵 Future — do not mix into Scalability | TBD |
| **Driver Mission** | Execution experience (consumes Trip Ops) | Product surface | Trip domain + driver Mission UI |

**Release discipline:** Marketplace M2 and major Driver/Dispatcher UX wait until Scalability **P0–P4** are gated. Intelligence stays separate from Scalability (“Can the system survive?” vs “How do we improve the business?”).

**Long-term advantage:** the same shipment flows seamlessly  

```
Discovery → Bidding → Award → Execution → Completion → Trusted relationship
```

Most products are either a marketplace *or* a TMS. Pulse is a **logistics operating platform** where commercial decisions and operational execution share one continuous journey — one commercial truth, one operational truth, one performance truth under them, UX on top. Maintain that discipline to avoid fragmentation as the product grows.

---

## Core principle

> **Platform exists to eliminate duplicate business logic.  
> Product exists to improve customer outcomes.**

After a platform milestone is complete, future work optimizes **user behavior and business metrics** before extending the platform itself.

That prevents slipping back into infrastructure because it is intellectually satisfying. See also `docs/PLATFORM_CONSUMER_RULE.md`.

---

## Change the operating model

Stop asking: *“What should we build next?”*

Ask every week:

> **Which KPI moved least, and what customer friction caused it?**

Mindset: **product improvement**, not feature delivery.

No architecture discussion unless a KPI proves the platform is limiting you.

---

## Four business KPIs (next quarter)

Everything maps to one of these.

| KPI | Why it matters | Primary owner |
|-----|----------------|---------------|
| **Views → Bids** | Are loads attractive enough to receive bids? | Marketplace UX |
| **Bids → Awards** | Can shippers confidently choose a supplier? | Receiving Bids Workspace |
| **Awards → Completion** | Is execution reliable? | Trip Operations |
| **Completion → Repeat Business** | Do companies come back and build relationships? | Commerce Network (later) |

```
Published → Viewed → Bid → Awarded → Executed → Completed → Repeat
```

---

## Dual product streams

Do **not** run Marketplace → Marketplace → Marketplace.

```
Marketplace                         Trip Operations
    ↓                                       ↓
Commercial Conversion               Operational Excellence
```

| Stream | Focus |
|--------|--------|
| Marketplace | M2 conversion UX (tiers below) |
| Trip Operations | Dispatcher Fleet Health · Driver Mission polish |

---

## Quarterly effort allocation

| Share | Focus |
|-------|--------|
| **40%** | Marketplace Experience (Receiving Bids, Compare, Progressive Story, Live Market) |
| **35%** | Trip Operations UX (Dispatcher Fleet Health, Driver Mission polish) |
| **15%** | Intelligence & instrumentation (event collection, KPI pipeline, weekly reporting) |
| **10%** | Platform maintenance and defects |

Matches where user impact now lies — not more domain services.

---

## Weekly Operating Review (standing meeting — one page)

### Marketplace

| KPI | Target | Trend | Owner |
|-----|--------|-------|-------|
| View → Bid % | ↑ | ▲/▼ | Product |
| Avg Bids / Load | ↑ | ▲/▼ | Marketplace |
| Bid → Award % | ↑ | ▲/▼ | Marketplace |
| Award Time | ↓ | ▲/▼ | Marketplace |

### Operations

| KPI | Target | Trend | Owner |
|-----|--------|-------|-------|
| Pickup SLA (on-time %) | ↑ | ▲/▼ | Ops |
| Delivery SLA (on-time %) | ↑ | ▲/▼ | Ops |
| Avg Pickup Dwell | ↓ | ▲/▼ | Ops |
| Trip Completion % | ↑ | ▲/▼ | Ops |

### Product — three questions only

1. Where did customers hesitate?  
2. Which KPI explains that hesitation?  
3. What’s the smallest UX change that could improve it?

If these eight numbers improve every month, Pulse is becoming a better logistics platform. If not, more features will not compensate.

---

## Close M1 first

No new Marketplace platform code. Run `docs/MARKETPLACE_M1_CONSISTENCY_CHECKLIST.md`.

- Surfaces disagree → consumer bug  
- Surfaces agree → **M1 Complete** → freeze Marketplace platform  

---

## M2 backlog — by conversion impact

### 🟢 Tier 1 — Highest ROI (build first)

1. **Receiving Bids Workspace**  
2. **Bid Comparison**  
3. **Progressive Story Evolution**  
4. **Live Market Indicators**  

### 🟡 Tier 2 — Confidence

Supplier cards · lane history · previous work · award confirmation · bid timeline  

### 🔵 Tier 3 — Optimization

Search · filters · saved suppliers · recommendations  

Every M2 surface consumes `resolveCommercialOpportunity()`.

---

## Intelligence — collect now, dashboards later

```
Publish → View → Open Story → Bid Started → Bid Submitted
  → Awarded → Trip Started → Completed
```

Pipeline first; expose analytics in M3. Six months of behaviour data is invaluable.

---

## Roadmap

```
✅ M0 Stabilization
    ↓
✅ M1 Commercial Resolver  (complete after consistency matrix)
    ↓
M2 Marketplace Experience          ║  Trip Operations UX (parallel)
  • Receiving Bids                 ║    • Dispatcher Fleet Health
  • Compare                        ║    • Driver Mission polish
  • Progressive Story
  • Live Market
    ↓
M3 Marketplace Intelligence
    ↓
M4 Commerce Network (earned relationship)
    ↓
M5 Financial Platform (Assist · Escrow · Credit · Insurance)
```

---

## In one sentence

One commercial truth and one operational truth, already built; the next phase makes every interaction increase confidence, reduce hesitation, and improve the four commercial and four operational KPIs — not invent more platform capabilities.
