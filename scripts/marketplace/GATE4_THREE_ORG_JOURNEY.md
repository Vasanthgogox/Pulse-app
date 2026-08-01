# Gate 4 — Customer validation (three companies)

Forget implementation. Act as **Org A (shipper)**, **Org B (network)**, **Org C (marketplace)**.

Also complete Gate 2 Branch B when relevant: `GATE2_BRANCH_B_RUNBOOK.md`.  
Operating plan / platform sign-off: `docs/MARKETPLACE_NEXT_OPERATING_PLAN.md`.  
Scores + friction: `VALIDATION_OBSERVATIONS.md` (same folder).  
M1 surfaces: `docs/MARKETPLACE_M1_CONSISTENCY_CHECKLIST.md`.

After each scenario: score Discovery · Clarity · Confidence · Decision Making · Execution · Trust (1–5) and answer the ₹10 lakh test.

---

## Scenario 1 — Publish

Publish a load from Org A.

| Check | Pass |
|-------|------|
| Appears in **Feed** | ⬜ |
| Appears in **Story** | ⬜ |
| Appears in **Load Center** | ⬜ |
| Target price visible on all three | ⬜ |
| **Open Market** consistent across surfaces | ⬜ |

**After Scenario 1:** Score six dimensions + ₹10L in `VALIDATION_OBSERVATIONS.md`

---

## Scenario 2 — Marketplace competition

Org B (network) bids. Org C (marketplace) bids.

| Check | Pass |
|-------|------|
| Story remains visible | ⬜ |
| Load remains visible | ⬜ |
| Both bids are shown (shipper) | ⬜ |
| **Network** vs **Marketplace** tags correct | ⬜ |
| Market clearly **still accepting bids** | ⬜ |
| Target price still visible | ⬜ |

**After Scenario 2:** Score six dimensions + ₹10L ⬜

---

## Scenario 3 — Award

Award Org C.

| Check | Pass |
|-------|------|
| Story closes correctly | ⬜ |
| Other bids become inactive | ⬜ |
| Trip is created | ⬜ |
| Execution begins | ⬜ |
| **No stale “Bid Now”** actions remain | ⬜ |
| Other bidders notified (if product supports) | ⬜ |

**After Scenario 3:** Score six dimensions + ₹10L ⬜

---

## Scenario 4 — Completion

Complete the shipment.

| Check | Pass |
|-------|------|
| Marketplace closes for this opportunity | ⬜ |
| Trip completes | ⬜ |
| History is preserved | ⬜ |
| Groundwork for future **Verified Business Partner** intact (note; don’t block M0 on UI) | ⬜ / N/A |

**After Scenario 4:** Score six dimensions + ₹10L ⬜

---

## Fail conditions

- Inconsistent Open Market / price across Feed · Story · Load Center  
- Disappears after first bid while still open  
- Wrong Network / Marketplace tags  
- Stale Bid Now after award  
- No usable trip after award  
- Any dimension consistently ≤2 without mitigation  

---

## Sign-off

Scenarios 1–4 clean + observations/scores filled + M2 matrix drafted → then complete full platform checklist in `docs/MARKETPLACE_NEXT_OPERATING_PLAN.md` (includes M1 consistency matrix + product ₹10L sign-off) → declare **Marketplace Platform (M0 + M1): Complete**.
