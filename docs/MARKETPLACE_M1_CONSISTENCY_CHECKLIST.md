# Marketplace M1 — Cross-surface consistency checklist

**Purpose:** Close M1 with QA/product validation. **Do not write Marketplace platform code** while running this.

**Pass criterion:** One real LOAD opportunity shows identical commercial truth on all five surfaces. Any disagreement = consumer bug → fix consumer → re-test.

Together with Scenarios 1–4 + six-dimension average ≥4/5 + PO ₹10L Yes (`docs/MARKETPLACE_NEXT_OPERATING_PLAN.md`), this unlocks:

> **Marketplace Platform v1**  
> Commercial truth centralized. · Operational lifecycle validated. · Consumer consistency verified. · Customer trust established.

Then freeze platform architecture — stop reopening foundations. Future work is UX, intelligence, growth.

## Setup

1. Publish (or pick) one open LOAD with a known target price and at least one path to bid.
2. Use the **same viewer org** for Feed, Story Detail, Story Preview, Bid Sheet.
3. Use the **owner org** for Award Dialog.
4. Optional second pass: after one bid, re-check Receiving Bids / Edit CTA consistency.
5. Optional third pass: after award / deactivate — Closed state matches everywhere.

## Matrix

| Property | Feed | Story Detail | Story Preview | Bid Sheet | Award Dialog |
|----------|------|--------------|---------------|-----------|--------------|
| Display price | ☐ | ☐ | ☐ | ☐ | ☐ |
| Can bid / edit bid | ☐ | ☐ | ☐ | ☐ | — |
| Primary CTA label/kind | ☐ | ☐ | ☐ | ☐ | ☐ |
| Bid count (or offers) | ☐ | ☐ | — | ☐ | ☐ |
| Visibility (open vs hidden) | ☐ | ☐ | ☐ | ☐ | ☐ |
| Lifecycle label / stage | ☐ | ☐ | ☐ | ☐ | ☐ |
| Closed state (if closed) | ☐ | ☐ | ☐ | ☐ | ☐ |

Preview may omit bid count; Award is owner-only (`canAward` instead of `canBid`).

## Result

- Date: ________
- Opportunity id: ________
- ☐ All rows match → **M1 Complete** → platform freeze → M2 conversion UX
- ☐ Mismatch on: ________ → file as consumer bug (not new domain work)

See `docs/MARKETPLACE_DOMAIN.md` (Operating model after M1) and `docs/PLATFORM_CONSUMER_RULE.md`.
