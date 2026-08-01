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

## Scenario 3.5 — Award Notification & Winner Journey

**P0-4 candidate.** Confirmed by code inspection before this scenario was added: `useAwardQuote.ts` only toasts the *awarding* org — nothing writes a notification, and no trigger fires anything toward the winning supplier when `direct_quotes.status` becomes `accepted`. A passive "Awarded"/"Claimed" tab exists in Load Center, but nothing points the supplier at it. Whether that's actually a problem in practice is exactly what this scenario measures — don't fix anything from this scenario before running it.

Steps:
1. Org A publishes a Reach load.
2. Org C (marketplace bidder) submits a bid.
3. Org A awards Org C.
4. **Log out of Org A. Log in as Org C** — as if you are the transporter who just won, with no prior knowledge of where to look.

| Check | Pass |
|-------|------|
| Award notification received (push / in-app) | ⬜ |
| Awarded load visible without hunting | ⬜ |
| Appears on Dashboard / home | ⬜ |
| Appears in "My Loads" / "My Jobs" / "Assigned Loads" | ⬜ |
| Status reads Awarded | ⬜ |
| Can begin execution (assign driver / deploy) from here | ⬜ |
| Cannot bid again on this load | ⬜ |
| Other (non-winning) suppliers lose access | ⬜ |

**Record, don't fix yet:**
- Where did you *expect* to see the award, before looking?
- Where did you *actually* look first, second, third?
- How long until you found it (or gave up)?

**After Scenario 3.5:** Score six dimensions + ₹10L in `VALIDATION_OBSERVATIONS.md`. If 8–10 test suppliers converge on the same place (e.g. "Dashboard" or "My Trips"), that — not a guess — is where the Marketplace → Execution Workspace handoff belongs. This is M2 input, not an M0 blocker to fix reactively.

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
