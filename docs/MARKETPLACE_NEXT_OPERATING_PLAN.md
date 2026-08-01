# Marketplace — next operating plan

**This week:** Validate like a customer. Score friction — don’t only tick pass/fail.  
**North star:** A shipper publishes, receives competitive bids, awards confidently, executes reliably, and finishes thinking: *I’d absolutely trust this with my next high-value shipment.*

---

## Exit criteria (platform milestone)

**A platform milestone is complete only when engineering, product, and customer confidence all agree.**

| Lens | Pass means | Fail means |
|------|------------|------------|
| **Engineering** | No known architectural inconsistencies — M1 consistency matrix passes | Milestone stays **open** |
| **Product** | Scenarios 1–4 behave as expected | Milestone stays **open** |
| **Customer** | Six confidence dimensions average **≥ 4 / 5**, and PO answers **Yes** to the ₹10 lakh trust question | Milestone stays **open** |

If any one fails, the milestone stays open — **not** because the platform needs more architecture, but because the experience isn’t yet trustworthy.

Default acceptance threshold: **average ≥ 4.0 across Discovery · Clarity · Confidence · Decision Making · Execution · Trust** (session rollup in `VALIDATION_OBSERVATIONS.md`). Product may raise the bar; do not lower it without an explicit decision.

---

## Track 1 — Customer validation

### Six dimensions (1–5 after every scenario)

| Dimension | Question |
|-----------|----------|
| Discovery | Could I easily find the load/opportunity? |
| Clarity | Did I always understand what state the load was in? |
| Confidence | Would I trust the information shown (price, bids, ETA, status)? |
| Decision Making | Did I have enough information to confidently award? |
| Execution | Did the transition from marketplace to trip feel seamless? |
| Trust | Would I run a ₹10 lakh shipment through this flow? |

### Scenarios

| # | Name | Must prove |
|---|------|------------|
| 1 | Publish | Feed · Story · Load Center; price everywhere; Open Market consistent |
| 2 | Competition | B network + C marketplace; both bids; tags; still accepting bids |
| 3 | Award | Story closes; other bids inactive; trip; execution; no stale Bid Now |
| 4 | Completion | Marketplace closes; trip complete; history; VBP groundwork intact |

Template: `scripts/marketplace/VALIDATION_OBSERVATIONS.md`.

### M2 priority matrix

After scenarios, rank (do not dump ideas):

| Improvement | User impact | Engineering effort | Priority |
|-------------|-----------------|--------------------|----------|
| Receiving Bids Workspace | High | Medium | P1 |
| Bid Comparison | High | Medium | P1 |
| Progressive Story | High | Medium | P1 |
| Live Market Signals | Medium | Low | P2 |
| *(from observations)* | … | … | … |

---

## Sign-off checklist → Marketplace Platform v1

- [ ] **Engineering:** M1 consistency matrix passes (`docs/MARKETPLACE_M1_CONSISTENCY_CHECKLIST.md`)  
- [ ] **Product:** Scenarios 1–4 behave as expected (+ Gate 2 Branch B as required)  
- [ ] **Customer:** Six-dimension session average ≥ 4/5; no unresolved confidence-breaking items  
- [ ] **Customer:** Product owner **Yes** on ₹10 lakh trust  
- [ ] Top M2 priorities documented and agreed (impact × effort)

When all are true, **explicitly declare:**

### Marketplace Platform v1

- Commercial truth centralized.  
- Operational lifecycle validated.  
- Consumer consistency verified.  
- Customer trust established.  

**Future investment:** UX, intelligence, and business growth — **not** additional platform architecture.  
This declaration tells the team to **stop reopening foundational decisions**.

Record date + signers in `docs/MARKETPLACE_P0_VALIDATION.md`.

---

## Operating rule for every future feature (in order)

1. **Which funnel KPI does this improve?** (Views · Bids · Awards · Execution · Completion)  
2. **Which customer hesitation does this remove?**  
3. **Can it be built by consuming the existing platform?**  

Only if (3) is **no** → discuss extending the platform.  
Architecture serves the product; it does not become the product.

---

## After Marketplace Platform v1 — improvement cadence

| Week | Focus |
|------|--------|
| **1** | Validation, observation, KPI review |
| **2–3** | Highest-impact M2 UX (Receiving Bids Workspace first) |
| **4** | Measure whether **Views→Bids** and **Bids→Awards** improved |
| Repeat | Continuous loop driven by customer behavior, not feature accumulation |

---

## Tracks after v1

| Track | Work |
|-------|------|
| **M2 Experience** | Receiving Bids Workspace → Bid Comparison → Progressive Story → Live Market (UX only) |
| **Driver & Dispatcher** | Fleet Health · Mission · Journey · Exceptions · Dispatcher workflow |
| **Intelligence** | Funnel: Published → Viewed → Interested → Bid → Awarded → Executing → Completed (count · conversion · time · drop-off) |

---

## Pointers

| Artifact | Path |
|----------|------|
| Observations + scores + M2 matrix | `scripts/marketplace/VALIDATION_OBSERVATIONS.md` |
| Gate 4 scenarios | `scripts/marketplace/GATE4_THREE_ORG_JOURNEY.md` |
| Gate 2 Branch B | `scripts/marketplace/GATE2_BRANCH_B_RUNBOOK.md` |
| Go/no-go + v1 declaration log | `docs/MARKETPLACE_P0_VALIDATION.md` |
| M1 consistency | `docs/MARKETPLACE_M1_CONSISTENCY_CHECKLIST.md` |
| Domain + Platform Consumer Rule | `docs/MARKETPLACE_DOMAIN.md` · `docs/PLATFORM_CONSUMER_RULE.md` |
