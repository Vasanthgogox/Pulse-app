# 07 — Open Decisions

Every unresolved call, its impact, and what blocks on it. **BLOCKING** = do not write code in
the affected area until decided.

| ID | Decision | Impact | Blocks | Recommendation |
|---|---|---|---|---|
| **D0** | Is this marketplace-first (bidding is the product) or execution-first (bidding is a feature)? | Reorders the entire roadmap; changes what "success" means | **BLOCKING — everything** | Execution-first. Bidding platforms in this space have a poor track record; the defensible asset is the trip record. |
| **D1** | Aggregated resource model: supplier-owned (A) or mover-owned external records (B)? | Schema of `trucks`/`drivers`; supplier onboarding burden; migration risk on the busiest tables | **BLOCKING — R3, and the schema in R1** | B now, A as an R3+ upgrade with a claim flow. Small truck owners will not onboard as tenants. |
| **D2** | How does an aggregated driver authenticate? Full account vs per-trip magic link/OTP | Driver adoption (the top product risk); mobile auth complexity | **BLOCKING — R1 E6** | Support both: account preferred, OTP link fallback. Costs more; unlocks the drivers who won't install an app. |
| **D9** | Load eligibility for bidding: connected movers only / any `LOAD_MOVER` / region+vehicle matched? | Whether this is a closed network or an open marketplace. Follows from D0. | **BLOCKING — R2 E9** | Connected movers only in R2. Open discovery is a separate product bet. |
| D3 | Is the Giver's identity visible pre-award? | Bid quality vs disintermediation risk | R2 E9 | Reputation proxy pre-award; identity on award. |
| D4 | Show bid count / rank to movers? | Price dynamics; race-to-the-bottom risk | R2 E10 | Show nothing in v1. Never show rank. |
| D5 | Who closes a trip — Giver, Mover, or auto on POD acceptance? | Terminal-state ownership; future settlement trigger | R1 E8 | Giver accepts POD → auto-close, with Mover able to request closure. |
| D6 | "Driver cum Load Mover" = owner-driver Org, or driver with extra roles? | Whether the driver app needs a bidding surface (significant mobile work) | R2 scope | Both fall out of the model; confirm which to build UI for. If owner-driver, budget +2 ew mobile. |
| D7 | Does the driver see the Giver's identity, or only site contacts? | Mover's customer leaked via an aggregated driver; needs call masking | R1 E6 | Site contacts + masked numbers. Costs telephony infra — flag the spend. |
| D8 | Does the Giver learn a resource was subcontracted? | Contractual/misrepresentation exposure; Mover margin | R3 E14 | Per-contract flag, default `AGGREGATED_FLAG_ONLY`. **Owner: whoever owns customer contracts, not engineering.** |
| D10 | Can a truck be reassigned mid-transit? | Implies physical transhipment; needs Giver consent | R3 E14 | Block in R3. Handle as cancel + new trip. |
| D11 | Is POD mandatory to mark DELIVERED? | Data completeness vs driver friction at the gate | R1 E6 | Mandatory, with a "POD pending" escape that flags for ops. Purely optional POD kills the payment thesis. |
| D12 | Multi-org membership for one user? | Auth complexity, org switcher UI | R1 E1 | Yes — brokers legitimately operate several entities. Cheaper now than retrofitted. |
| D13 | Does platform admin get audited grants or blanket RLS bypass? | Whether the confidentiality promise in `04` is real | R1 E1 | Audited grants. Cutting it is defensible — but write down that you cut it. |
| D14 | Driver app languages? | Adoption | R1 E6 | **[UNKNOWN]** — needs a real answer from the pilot geography. |
| D15 | Statutory documents (e-way bill / LR / GST) — required for launch? | Was a possible legal blocker | R1 scope | **RESEARCHED — see `09`. Not blocking for a pilot** if the e-way bill number is a manual field. Becomes blocking the moment we generate or update e-way bills. |
| **D17** | Do we ever *generate/update* e-way bills, or stay a system of record? | Determines whether GSP integration, per-tenant GST credential storage and Part-B sync are in scope at all | R2+ scope | Stay a system of record in v1. Revisit once GSP costs are known (`09` Q5, unanswered). |
| D18 | Part B / vehicle-number update on truck reassignment | A mid-trip truck change is a statutory Part-B update. If the product implies it synced and it didn't, the customer's consignment is non-compliant in transit. | R3 E14, ties to D10 | Do not build reassignment in a way that implies e-way bill sync until integrated. |
| D19 | DLT template registration for driver SMS | Indian telecom requirement, unrelated to GST. Blocks the SMS notification channel. | R1 E7 | **[UNKNOWN]** — not researched. Needed if SMS is a driver channel. |
| D16 | Does this ship inside q-web or as a separate surface? | Reconciliation effort in `05` §9; possibly weeks | **BLOCKING — Phase 0** | Inside, reusing tenancy/connections, if the existing schema supports it. |

---

## Decision log

| Date | ID | Decision | By | Rationale |
|---|---|---|---|---|
| — | — | *(empty — nothing is decided yet)* | | |

Every resolution gets a row here and the `[UNKNOWN]`/`[ASSUMPTION]` markers in the other docs
get updated to `[DECIDED yyyy-mm-dd]` in the same commit.

---

## Assumptions I made to keep the docs coherent

If any of these is wrong, the affected doc needs revising:

1. Supabase/Postgres + RLS is the stack (`05` throughout)
2. React web + React Native driver app (`01` §5)
3. One Award per Load; no load splitting across movers (`02`, `05` schema)
4. One Trip per Award; no multi-leg (`02`, `05` schema)
5. Driver acceptance is an explicit step (`02` trip lifecycle) — may be unnecessary friction
6. Reassignment notifies the Giver but does not require approval (`03` S14)
7. Expired driver licence warns rather than blocks (`03` S3) — may be legally wrong somewhere
8. Aggregated supplier is not a self-serve tenant in v1 (`01` §3)
9. The primary geography is India (drives compliance, connectivity and language assumptions
   throughout) — **not actually stated anywhere in the source spec**
