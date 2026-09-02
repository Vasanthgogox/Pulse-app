# 06 — Delivery Plan

**No calendar dates.** Team size is `[UNKNOWN]`, so dates would be invented. Below is
sequencing plus effort in **engineer-weeks (ew)**, which you can divide by real headcount.

---

## 1. Phase 0 — Reconciliation & decisions *(blocking, ~2–3 ew)*

Nothing else starts until this is done. Everything downstream is mis-estimated otherwise.

| Task | ew |
|---|---|
| Reconcile design against existing q-web schema (`05` §9) | 1.5 |
| Resolve blocking decisions D0, D1, D2, D9 (`07`) | 0.5 |
| Audit RLS coverage on existing tables | 0.5 |
| Set up the party-fixture matrix + leak-test harness (`05` §8) | 0.5 |

**Build the leak-test harness before the features it protects.** Retrofitting it means
auditing code that already shipped.

---

## 2. Release 1 — Execution core *(~11–14 ew)*

| Epic | Scope | ew |
|---|---|---|
| E1 Tenancy & roles | capabilities, member roles, JWT claims, org switching | 2 |
| E2 Resource master | trucks, drivers, driver↔user linking | 1.5 |
| E3 Loads | CRUD, publish/validate, giver views | 1.5 |
| E4 Direct award → trip | `direct_award` txn, trip creation | 1 |
| E5 Assignment & deploy | `assign_resources`, deploy, conflict warnings | 2 |
| E6 **Driver app** | auth, trip list, milestone capture, **offline queue**, POD upload | **4** |
| E7 Notifications | template registry, dedup, channel fan-out | 1.5 |
| E8 Giver tracking | trip timeline, POD view | 1 |

**E6 is the risk.** Offline-first with idempotent replay, image compression, resumable upload
and low-end Android testing is routinely underestimated by 2×. Four weeks is optimistic. If
you must cut, cut everything else before cutting offline support — an online-only driver app
does not work in Indian freight and will produce a false-negative on the R1 gate.

**R1 exit gate:** driver event completion ≥60%, POD-within-6h ≥50%, ≥3 tenants, ≥50 real
trips. *If this fails, stop. Do not build R2.*

---

## 3. Release 2 — Bidding *(~6–8 ew)*

| Epic | Scope | ew |
|---|---|---|
| E9 Load publishing & eligibility | eligibility rules (D9), coarse-location mover views | 2 |
| E10 Bidding | submit, revise, withdraw, history, mover load feed | 2 |
| E11 Award | `award_load` txn, sibling transitions, concurrency guard, comparison UI | 2 |
| E12 Bid confidentiality tests | negative suite specific to bids | 0.5 |

**R2 exit gate:** ≥2 bids on ≥50% of published loads. If movers don't bid, be an execution
tool and skip R3's marketplace assumptions.

---

## 4. Release 3 — Aggregation *(~7–9 ew)*

| Epic | Scope | ew |
|---|---|---|
| E13 Supplier links | invite/accept/revoke, external-resource records (per D1) | 2 |
| E14 Aggregated assignment | four ownership combos, source derivation, validation | 1.5 |
| E15 `assignment_briefs` | build/sync triggers, leg status, supplier surface | 2.5 |
| E16 Supplier-scoped notifications | own-leg only templates | 1 |
| E17 Aggregation leak tests | full brief whitelist enumeration | 1 |

If D1 lands on Model A (supplier-owned records), add **+2 ew** for supplier tenant onboarding
and **+2 ew** for the resource-claim reconciliation flow.

---

## 5. Rough totals

| | ew |
|---|---|
| Phase 0 | 2–3 |
| R1 | 11–14 |
| R2 | 6–8 |
| R3 | 7–9 |
| **Total** | **26–34 ew** |

Not included, and each is real: QA effort beyond dev testing, design/UX, localisation, pilot
support and onboarding, production ops/on-call setup, and the reconciliation overrun risk from
`05` §9.

Realistic multiplier for a team that hasn't built this domain before: **1.4–1.6×**. So plan on
**~40–50 ew**. At 3 engineers that's roughly 4–5 months to R3, not counting the metric gates,
which may deliberately hold you at R1 for a while.

---

## 6. Sequencing rules

1. **Leak-test harness before features.**
2. **Driver app in parallel with R1 backend, not after.** It's the long pole and the riskiest
   assumption; discovering its problems at the end of R1 is the worst case.
3. **Pilot with one real Load Giver during R1**, not after. A partner who will actually make
   their drivers use it. Without this, the R1 gate is measured on synthetic data and means
   nothing.
4. **Do not build R3 speculatively.** Aggregation is the most complex part and only matters if
   R1 and R2 gates pass.

---

## 7. Release checklist (each release)

- [ ] Leak test suite green (`05` §8 items 2, 3, 4)
- [ ] Every new table has RLS enabled and ≥1 policy
- [ ] Every new trip/load/bid field has a `04` matrix row and a leak-test assertion
- [ ] Every new notification template reviewed against `04` §6
- [ ] Migrations tested forward **and** rollback on a production-shaped dataset
- [ ] Offline-path tests green on a real low-end Android device
- [ ] Metric instrumentation live before launch, not after
- [ ] Runbook for the top 3 failure modes (driver can't log in; event stuck; POD upload fails)
- [ ] `07-open-decisions.md` has no BLOCKING items open for this release
