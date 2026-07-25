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

## Phase 2.2 — Reach Home *(complete)*

Customer-facing Reach entry in the Pulse app: `/reach` (Credits Balance, Reach Delivered, Active Campaigns, Quick Actions, Recent Campaigns, link to Campaign History), `/reach/earn-credits` (customer-facing placeholder only — no referral/verification automation yet, see Phase 2.4), and a discovery card in the Network screen so Reach doesn't require opening a Story first to be found. No schema, RPC, payment, or lifecycle changes — purely navigation and UI reusing Phase 2.1's existing screens/components (`ReachCampaignCard`, `BoostProgressSheet`, `BoostSheet`).

**Follow-up: Campaign Identity & Lifecycle Integrity** *(complete)* — campaign cards showed only a plan badge with no indication of which load/story was boosted, and deleting a story silently left its campaign in a stale `active` state (or, in a rare RLS-fallback hard-delete path, would have cascade-deleted the campaign and its purchase/event/metrics history outright). Fixed with: a `reach_campaigns` snapshot (route, vehicle, material, post type, posted-at, captured at publish time so it survives the source story being edited or deleted), a `cancel_reach_campaign` RPC wired into the story-deletion flow (with a warning dialog naming the consequence before deleting), the `post_id` foreign key changed from `ON DELETE CASCADE` to `ON DELETE SET NULL` so campaign history is never destroyed by a source-post deletion, and a dedicated Campaign Detail screen (`/reach/campaign/:id`) as the single source of truth for one campaign. **Campaigns cannot be refunded once activated** — cancelling a campaign (including via story deletion) stops delivery but does not reverse any credits or cash already spent; this is a deliberate policy, not a missing feature, since Reach delivery may already have occurred by the time a campaign is cancelled.

**Pilot-period messaging change:** every "Reach up to N verified fleet owners" style copy (plan picker, boost confirmation, campaign progress) has been replaced with outcome language — "Promote your load to relevant fleet owners and shippers across Pulse" — and the customer-facing "Reach Delivered" label has been renamed to **"Campaign Reach"** everywhere (Reach Home, Campaign History, BoostProgressSheet, Campaign Detail). This is a UI-copy-only change, not a computation change: the underlying number is still `min(impressions, plan.estimated_reach_max)` (see Phase 2.3 doc). Exact audience counts implied a delivery guarantee the product doesn't yet enforce — once Phase 2.3 ships real accounted delivery, "Reach Delivered" is the correct name to bring back.

## Phase 2.3 — Reach Delivery Engine *(not started — design doc first)*

**Reordered ahead of Growth Rules/Automation**, on the reasoning that today's distribution mechanism doesn't yet make the product's core promise true. `get_network_feed` currently shows any actively-boosted post to every organization on the platform, unfiltered and undeduplicated — see `docs/REACH_DELIVERY_ENGINE_DESIGN.md` for the full design, but in short:

- No filtering to verified fleet owners/shippers specifically.
- No de-duplication — "Reach Delivered" is currently `min(impressions, plan.estimated_reach_max)`, an approximation from raw impressions, not a count of distinct organizations.
- No enforcement of the plan's promised cap (25 / 60 / 150) — today all three plans differ only in price and duration, not in who actually sees the post or how many.

Phase 2.3 introduces an internal eligibility → ranking → accounting → enforcement pipeline behind `get_network_feed` to close that gap — entirely invisible to the customer. No audience builder, no targeting UI; the customer still only ever sees one number, "Reach Delivered," which becomes accurate instead of approximate.

**Before writing implementation code:** `docs/REACH_DELIVERY_ENGINE_DESIGN.md` should be reviewed — it leaves one real open question (this schema has no stable fleet-owner-vs-shipper classification on organizations) for explicit sign-off before implementation starts.

## Phase 2.4 — Growth Automation *(not started)*

```
Verification Approved
        ↓
   Reward Rule
        ↓
  Credits Issued
        ↓
  Notification Sent
```

Operations configures growth without engineering — Reward Rules, Invitation Rules, Promotions become admin-configurable (one Growth admin module: Credits, Reach Plans, Reward Rules, Invitation Rules, Promotions, Ledger, Analytics — not split into separate admin products) — and manual credit grants become the exception rather than the normal workflow. Deliberately sequenced *after* Phase 2.3: automating credit issuance is only worth building once delivery itself is reliable — otherwise automation just scales up rewards for a promise (accurate reach) that isn't being kept yet.

**Future simplification, not for this phase:** Reward Rules and Invitation Rules will likely converge into one rule engine with a type field (Verification / Invitation / Promotion / Campaign) rather than staying as separate screens. Don't build this distinction now; build it if/when a third rule type makes the duplication actually hurt.

## Phase 3 — Intelligence *(not started, optimization layer only)*

Optimization layers on top of a proven, reliable product — not a prerequisite for anything above: delivery optimization, AI-driven recommendations, campaign performance predictions, fraud detection, best-posting-time suggestions, smart audience ranking (replacing Phase 2.3's deterministic ranking with a scored/learned one). Nothing here is required for Reach to work correctly; it makes an already-working system smarter.

## Roadmap Status

```
Pulse Growth Platform

✓ Phase 2.1   Reach MVP
✓ Phase 2.2   Reach Home
□ Phase 2.3   Reach Delivery Engine  (design doc: docs/REACH_DELIVERY_ENGINE_DESIGN.md)
□ Phase 2.4   Growth Automation
□ Phase 3     Intelligence
```

## Recommendation

Phase 2.1 and 2.2 are both complete: Reach can be discovered, purchased, monitored, and returned to, and Operations can support it. Before building further capability, validate with internal users whether Reach is actually generating qualified business — the validation questions and Success Metrics above — and let that feedback, not an assumption that more features are the next highest-value investment, set the priority for Phase 2.3. If Phase 2.3 does move forward, `docs/REACH_DELIVERY_ENGINE_DESIGN.md` should be reviewed and its one open question (fleet-owner/shipper classification) resolved before implementation starts.
