# Pulse Growth Platform — v0.1 (Reach MVP)

*A short, non-technical product overview. This document is meant to evolve phase by phase rather than be replaced — see `docs/decisions.md` (ADR-009) for the underlying architectural decisions, and the migration files under `supabase/migrations/2026122*` for implementation detail.*

**Milestone:** tagged `v0.1` not because it's feature-complete, but because it establishes the core architecture everything else extends: Reach engine, Credits, Wallet, Ledger, Campaigns, Admin adjustments, Platform IAM, Upgrade flow. Earn Credits, Reward Rules, Promotions, and AI are extensions of this foundation, not replacements for it.

## The Product in One Diagram

The full loop — why credits exist at all is that using them productively creates more opportunities to earn them again:

```
               Pulse Growth Platform

      Earn Credits
            │
            ▼
      Credits Wallet
            │
            ▼
      Pulse Reach Campaign
            │
            ▼
 More Reach → More Views → More Bids
            │
            ▼
     More Business Won
            │
            ▼
 More Activity on Pulse
            │
            ▼
 More Opportunities to Earn Credits
```

Today, "Earn Credits" is a single manual admin action (Operations grants credits directly) — the loop doesn't close itself yet. Everything from Credits Wallet through More Bids is real and working; the "More Business Won → More Activity → More Opportunities to Earn Credits" return path is the reason Phase 2.4 (Automation) matters, not just a nice-to-have.

## Why Growth Exists

**Growth exists to increase successful business transactions on Pulse — not to maximize campaign impressions.** That sentence is the whole philosophical difference between Reach and an ad platform. Everything should optimize for:

```
More Loads → More Bids → More Trips → More Revenue
```

**Not:**

```
More Clicks → More CTR → More CPM
```

**North Star metric: Additional Qualified Bids Generated.** Not impressions, not clicks, not views — customers ultimately care whether Reach gets them more relevant bids. Every other number in this document supports that one.

## Growth Principles

Six rules that should keep every future Growth feature aligned, not just Reach:

1. **Simple for customers.** Customers should never configure campaigns like an ad platform — pick a plan, pay, done.
2. **Configurable for operations.** Credits, rewards, promotions, and plans are configuration (database rows an admin edits), not application code.
3. **Everything is event-driven.** Business events (verification approved, invitation accepted, campaign published) trigger rules — rules don't poll for state.
4. **One wallet.** Every growth incentive — however earned, however spent — moves through the same `pulse_credit_wallets` ledger. No parallel currencies.
5. **Reach is reusable.** Stories are the first consumer. Marketplace, Vehicles, Drivers, and future products reuse the same campaign/payment/lifecycle/analytics engine (see ADR-009) instead of each building their own.
6. **Customers buy outcomes, not advertising.** Don't expose CPM, CPC, an audience builder, demographics, or keywords. Expose Reach, Views, Bids, Upgrade — that's it. This is a permanent constraint, not a temporary MVP simplification.

## Phase 2.1 — Reach MVP (this milestone)

### Problem Statement

Loads often don't reach enough fleet owners. A broadcast load sits in the network feed alongside everyone else's — there's no way for an organization to say "this one matters more, put it in front of more people."

### Solution

Pulse Reach lets an organization promote a broadcast to a wider audience, paying with Pulse Credits or cash. Three plans — Starter, Growth, Business — each promise a reach range (up to 25 / 60 / 150 verified fleet owners) and a fixed duration (24h / 48h / 72h).

### Customer Journey

```
Broadcast  →  Boost  →  Campaign  →  Analytics
```

1. **Broadcast** — org posts a load (existing Stories flow, unchanged).
2. **Boost** — from that story, pick a plan and pay with credits (instant) or cash (recorded, not yet gateway-confirmed — see Out of Scope).
3. **Campaign** — the load is promoted for its plan's duration; a progress sheet shows status, reach delivered, and time remaining, and offers an in-place upgrade to a higher plan (charging only the price difference).
4. **Analytics** — Reach History shows every campaign (active and past) with exactly four numbers: Impressions, Views, Bids, Credits Used. No CTR/CPM/CPC — this is an operations audience, not a marketing one.

### Operations Journey

```
Grant Credits  →  Wallet  →  Ledger  →  Customer Boost
```

Since customers currently have no way to *earn* credits (see Out of Scope), Operations grants them manually from the existing admin console (`analytics/`, `Growth › Credits`): search an org, grant a preset or custom amount with a standardized reason, and the org can immediately boost. Every grant is auditable in the ledger (who — self-reported today, no login yet; when; why; how much).

**Manual credit adjustments are an operational bootstrap mechanism, not the end-state** — expected to decrease over time as automated reward rules (Phase 2.4) are introduced.

### What's Intentionally Out of Scope (this phase)

- **Earn Credits** (customer-facing referral/verification reward screens)
- **Referral rewards** and **Verification rewards** as automated triggers (the reward *amounts* exist as configurable DB rows — `reward_rules` — but nothing surfaces them to customers or auto-grants beyond the existing KYC-approval hook)
- **Reward Rules / Reach Plans / Invitation Rules / Promotions** as an admin-configurable module
- **A real payment gateway** for cash boosts (cash campaigns are recorded `pending` and stay in `draft` until manually confirmed — no such confirmation flow exists yet either)
- **AI optimization** (best publish time, audience recommendations, campaign health scoring beyond simple rule-based states)
- **Credit expiry / lifecycle rules** (do promotional, purchased, or refunded credits expire? — deferred to a future ADR until there's real commercial need)

### Success Metrics (Phase 2.1)

The document so far says what's being built. This is how leadership will know if it's working — a handful of numbers per area, not a full dashboard:

**Customer Adoption**
```
Broadcasts Created → Boost Conversion % → Credits Used → Campaign Completion
```

**Campaign Performance**
- Reach Delivered
- Views
- Bids
- Upgrade Rate

**Growth**
- Credits Issued
- Credits Spent
- Manual Adjustments (should trend down over time — see the bootstrap statement above)
- Automated Rewards (0 today — becomes real in Phase 2.4)

**Platform Health**
- Campaign Success %
- Wallet Errors
- Failed Payments
- Unauthorized Credit Attempts (should be 0 — this is a security invariant, not a business metric; see the `increment_credit_wallet` auth-bypass bug caught and fixed during Phase 2.1)

### Questions to Validate in the Demo

- Is the pricing (₹250/₹500/₹1000 → Starter/Growth/Business) understood?
- Do people understand "Boost" as an action, and "credits" as a currency? Would they actually pay ₹250 to promote a broadcast?
- Does the 4-metric analytics view answer "how is my campaign doing?"
- Does the Grant Credits admin workflow feel operationally practical to Ops?

## Phase 2.2 — Reach Home *(not started)*

Customer-facing Reach entry in the Pulse app: a dedicated nav destination with Overview, Campaigns, and Earn Credits.

## Phase 2.3 — Growth Rules *(not started)*

Operations configures growth without engineering: Reward Rules, Reach Plans, Invitation Rules, Promotions — one Growth admin module (Credits, Reach Plans, Reward Rules, Invitation Rules, Promotions, Ledger, Analytics), not split into separate admin products.

**Future simplification, not for MVP:** Reward Rules and Invitation Rules will likely converge into one rule engine with a type field (Verification / Invitation / Promotion / Campaign) rather than staying as separate screens — one rule engine, not many rule screens. Don't build this distinction now; build it if/when adding a third rule type makes the duplication actually hurt.

## Phase 2.4 — Automation *(not started)*

```
Verification Approved
        ↓
   Reward Rule
        ↓
  Credits Issued
        ↓
  Wallet Updated
        ↓
 Notification Sent
```

Manual credit grants become the exception rather than the normal workflow.

## Roadmap Status

```
Pulse Growth Platform

✓ Phase 2.1   Reach MVP
□ Phase 2.2   Reach Home
□ Phase 2.3   Growth Rules
□ Phase 2.4   Automation
□ Phase 3     Intelligence
```

## Recommendation

Phase 2.1 is officially closed. Accept this milestone and stop building new capabilities for now. Spend the next effort on running the internal demo and collecting structured feedback — the validation questions and Success Metrics above — before starting Phase 2.2.
