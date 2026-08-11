# Boost V2 — Campaign Engine Architecture (Design Document)

*Originally written design-only. Superseded in part: driver distribution + referral escrow (`reach_referrals`, extended `reach_campaigns`, `recommend_reach_campaign`/`decide_reach_referral`/`mark_reach_referral_bid`/`convert_reach_referral`) already shipped in `20270102000000_boost_v2_driver_referral_escrow.sql` — folded into this release rather than deferred to a "V2b," per direct feedback. This document now also records a real bug found and fixed in that shipped code (below) and the terminology/sequencing corrections from that feedback. See `docs/GROWTH_REFERRALS_DESIGN.md` and `docs/PULSE_GROWTH_PLATFORM.md` for the foundation this extends.*

## Status update — driver payout bug found and fixed

`convert_reach_referral` marked a referral `'rewarded'` and moved `reach_campaigns.reward_reserved → reward_paid` bookkeeping, but never actually paid the driver anywhere — no `increment_credit_wallet` call (drivers aren't organizations, that wouldn't resolve) and no `add_driver_ledger_entry` call (would need `driver_user_id` (`auth.users`) resolved to `drivers.id`, never done). Confirmed by tracing the migration directly, then reproduced live: created a real throwaway fleet org + driver + campaign + referral, called `convert_reach_referral` via a genuine authenticated session, and confirmed `driver_ledger` received nothing.

**Fixed** in `20270103000000_boost_v2_driver_reward_payout_fix.sql`: `convert_reach_referral` now resolves `drivers.id` from `(fleet_org_id, driver_user_id)` and calls `add_driver_ledger_entry(..., 'reward', ...)` — a new `'reward'` value added to `driver_ledger.type`'s CHECK constraint (that function's amount-sign logic already treats unrecognized types as a positive credit via its `ELSE` branch, so no other change was needed there). Re-verified with the same live reproduction: `driver_ledger` now shows a real `reward` row referencing the exact `reach_referral`, and the campaign's `reward_reserved`/`reward_paid` move correctly together with it. Test fixtures fully cleaned up after.

**Payout currency, confirmed**: INR via the existing `driver_ledger` — matches how drivers are already paid for everything else (trips, salary), visible in the driver's existing wallet screen with no new UI needed. Not Pulse Credits, which drivers have no existing use for.

**Secondary, pre-existing, lower-severity finding (not fixed, flagging only)**: while verifying, `add_driver_ledger_entry` produced `balance_after = NULL` for a driver's very first-ever ledger entry. Its running-balance lookup (`SELECT COALESCE(balance_after, 0) ... ORDER BY created_at DESC LIMIT 1`) returns no row at all for a brand-new driver, and `COALESCE` can't rescue a query that returns zero rows — so `v_balance` itself is `NULL`, not `0`, and `NULL + v_signed` stays `NULL`. This predates this migration and isn't specific to `reward` — it would affect *any* driver's first-ever ledger entry, of any type. The stored `amount` is correct either way (only the running-balance snapshot is wrong), and it's a shared function used by several existing driver-ledger flows (advances, salary, settlements), so fixing it wasn't done as a drive-by change here — flagged for a decision on whether/when to fix separately.

## Executive summary — what's reusable, and what's genuinely new

The "Rewards Engine" idea is sound and maps cleanly onto two things that already exist and work. The "Driver Recommendation" and "escrow budget" ideas do not map onto anything that exists — they are real, substantial new capability, not a reuse-and-wire exercise like Phase 2.4 was. Both are worth saying plainly before any diagram, so the scope is judged accurately:

| Concept in the request | Reality in this codebase |
|---|---|
| A single "Rewards Engine" that settles into either a Credit Wallet or a Cash Wallet | **Two settlement primitives already exist and already do exactly this**, independently: `increment_credit_wallet()` (org-level, Pulse Credits, `pulse_credit_wallets`/`pulse_credit_transactions`) and `add_driver_ledger_entry()` (driver-level, INR, `driver_ledger`). They were built for different domains (Reach credits vs. trip earnings/salary) and never unified — but a thin **dispatcher** over both is a small, low-risk addition, not a new engine. |
| Reward Rules, configurable amounts | **Already built** in Phase 2.4 (`reward_rules` table + admin CRUD panel) — extending its `key` enum to add recommendation-reward types is additive. |
| Campaign Budget → Distribution Fee + Reward Pool, reserved at launch, refunded if unused | **Does not exist.** `pulse_credit_wallets` has one field: `balance`. There is no "reserved," "held," or "escrow" concept anywhere in the wallet or campaign schema today. This is real new schema work, not a reuse of something already there. |
| Driver recommends a load to their Fleet Owner, who approves before a bid is placed | **Does not exist in any form.** Checked directly: drivers have zero visibility into Stories, the network feed, or `bids` today — `bids.bidder_organization_id` is an *organization*, not a driver, and nothing in the driver app (`app/(driver)/*`) reads `get_network_feed` or any Reach data. This is a brand-new surface on both the driver app and the fleet-owner side, not an extension of an existing screen. |
| "Drivers never bid directly to shippers" | Already true today, but not because of any Boost-specific rule — it's true because *only organizations* can bid at all right now. This requirement is automatically satisfied by *not* letting drivers write to `bids` directly, which is also the simplest implementation. |

This reordering matters for scoping: the Rewards Engine + escrow mechanics (rows 1–3) are a contained, mostly-backend project that extends the existing campaign/wallet architecture. The driver recommendation flow (rows 4–5) is a second, much larger project — new driver-facing UI, new fleet-owner approval UI, new data model for "a driver flagged interest in a load." Treating them as one Boost V2 release risks the same mistake Phase 2.4 avoided by finding out first how much already existed — here, doing the same check reveals the opposite: most of this genuinely doesn't exist yet.

## Recommended phased architecture

```
                     Pulse Growth
                    ─────────────
               Campaign Engine (existing reach_campaigns, extended)
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
Boost Engine   Settlement Engine   Assist Engine
(existing)     (org credits +      (driver recommendation —
               driver INR,         folded into this same
               both existing       release, not deferred)
               ledgers)
```

**Renamed "Rewards Engine" → "Settlement Engine"**, per feedback: it settles credits, driver cash, and future incentive types — "rewards" is only one of those. **Driver distribution is folded into this release**, not a deferred "V2b" — it already shipped alongside the escrow mechanics in the same migration, which is also the right product call (the reward pool has no value proposition without the driver network it's meant to activate).

**Boost Engine** = today's `reach_campaigns`/`reach_plans`/`publish_reach_campaign`/`upgrade_reach_campaign` — extended with `distribution_channels`/reward-budget columns, existing behavior unchanged for campaigns that don't opt in.

**Settlement Engine** = not a single dispatcher function in the shipped implementation — `convert_reach_referral` calls `add_driver_ledger_entry` directly (now that it's fixed, above), and the org side calls `increment_credit_wallet` directly. That's a reasonable, simpler choice for two call sites; a shared `settle_reward(recipient_type, ...)` helper (sketch below) becomes worth extracting once a *third* reward type shows up (e.g. Boost Cashback) so the "look up `reward_rules`, branch by recipient type" logic doesn't get copied a third time — not urgent at two.

```sql
-- Extraction point for later, once a third reward type exists — not built now.
CREATE FUNCTION public.settle_reward(
  p_recipient_type   text,   -- 'organization' | 'driver'
  p_recipient_id     uuid,
  p_rule_key         text,   -- looked up in reward_rules
  p_reference_type   text,
  p_reference_id     uuid,
  p_org_id_for_driver uuid DEFAULT NULL
) RETURNS uuid AS $$ ... $$;
```

**Assist Engine** (driver recommendation) = `reach_referrals` + `recommend_reach_campaign`/`decide_reach_referral`/`mark_reach_referral_bid`/`convert_reach_referral` — already shipped, in this release, per the feedback that this is the actual differentiating feature, not scope to defer.

## Campaign Budget — the part that's actually new schema

"Reserved funds must not become Pulse revenue" and "unused budget auto-refunds" describes an escrow that has no precedent in this schema. Proposed, additive to `reach_campaigns` (extend, not replace — matches this codebase's own established pattern from the Campaign Identity work):

```sql
ALTER TABLE public.reach_campaigns
  ADD COLUMN IF NOT EXISTS reward_budget_total    bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_budget_reserved  bigint NOT NULL DEFAULT 0,  -- decrements as rewards settle
  ADD COLUMN IF NOT EXISTS reward_rule_key         text REFERENCES public.reward_rules(key);
```

**As shipped**: reservation happens inside `publish_reach_campaign` — a campaign launched with `driver_reward_enabled` reserves `reward_budget` from the org's `pulse_credit_wallets.balance` via `increment_credit_wallet(..., 'reserve_referral', -budget, ...)`, tracked in `reach_campaigns.reward_reserved` (separate from `reward_paid`/`reward_refunded`). It decrements on each real payout (`convert_reach_referral`, now fixed above) and fully refunds via `'referral_refund'` on both campaign expiry (`fn_expire_reach_campaigns`) and cancellation (`cancel_reach_campaign`) — both call a shared `fn_release_reach_referral_escrow()` helper, so the refund logic isn't duplicated between the two exit paths. This matches the design intent exactly: no escrow table, no second ledger, reuses the campaign row and the existing credit wallet.

## Driver Recommendation (Assist Engine) — shipped in this release, not deferred

Original recommendation here was to defer this to a "V2b" given how much was genuinely new (no driver-facing Stories view existed, no recommend/approve concept, no link between a recommendation and a later bid). **Overridden by explicit feedback, and already reflected in what shipped**: the reward pool has no value proposition without the driver network it's meant to activate, so it belongs in the same release as the escrow mechanics, not after. As built:

```
Campaign (distribution_channels includes 'driver')
        ↓
recommend_reach_campaign()   — driver flags interest; never bids directly
        ↓
decide_reach_referral()      — fleet owner approves/rejects; approval unlocks the normal bid flow, unchanged
        ↓
mark_reach_referral_bid()    — links the fleet owner's real bid (existing bids/accept_bid path) to the referral
        ↓
convert_reach_referral()     — on trip award/start, pays the driver (fixed above) + releases campaign escrow
```

Everything from "the normal bid flow" onward is the pre-existing `bids`/`accept_bid`/`create_trip_from_assigned_indent` machinery, completely unchanged — `reach_referrals` only tracks the recommendation-to-conversion link alongside it.

## Naming — agreed and shipped

"Tip" never made it into any shipped UI copy (checked — this was greenfield). The already-built pipeline uses **Recommendation Reward** terminology throughout (`reward_amount`, `driver_reward_enabled`, `ReachReferralRecommended`/`ReachReferralRewarded` events) — no rename needed.

## What actually shipped vs. what's still postponed

**Shipped, this release**: driver story distribution channel, recommend/approve/bid-link/convert pipeline, flat-only reward type (percentage explicitly rejected in `publish_reach_campaign`), one reward rule per campaign, escrow reserve/release/refund on both expiry and cancellation, driver payout via `driver_ledger` (fixed above).

**Correctly not built yet** (per explicit "postpone" list — matches what's actually absent from the schema): driver ranking, AI recommendations, recommendation history UI beyond the raw table, leaderboards, driver wallet withdrawal flows (drivers see the reward in their existing wallet screen via `driver_ledger`, same as any other earning — no new withdrawal mechanism), gamification, multiple simultaneous reward rules per campaign.

**Boost V3** (not started, no schema for any of this exists): AI ranking, driver intelligence/smart recommendations, vehicle-availability promotion, dynamic reward optimization.

## Structured Delivery Engine (shipped after the escrow/referral release)

Post-launch field finding, from a real campaign that spent 500 credits and got **0 impressions, 0 bids**: delivery was passive. `get_network_feed` made an active sponsored post visible platform-wide, but nothing was ever *delivered* — impressions only happened if another org organically opened its feed while the campaign ran. No verified-first priority, no pacing, and the plan reach number was cosmetic. The driver channel was additionally a dead end: `driverStoryCta`/`ReachCampaignReelCard` existed only as an org-side preview — no screen in `app/(driver)/*` ever showed a boosted story, so driver recommendations were structurally zero for every campaign.

Fixed in `20270107000000_boost_v2_structured_delivery.sql` + client work:

- **`reach_campaign_targets`** — the delivery list. Allocation is **verified orgs first**; unverified only fill what the verified pool can't cover (`fn_allocate_reach_targets`, snapshot `is_verified` per row so reporting stays truthful).
- **Waves** — 40% / 40% / 20% of the plan's `estimated_reach_max`, released at publish, ⅓ and ⅔ of campaign duration (`fn_reach_wave_size`; a 25-reach plan is exactly 10 + 10 + 5). Wave 1 is allocated inside `publish_reach_campaign`; `fn_pace_reach_campaigns` (10-min cron) releases the rest.
- **No-bid escalation** — after wave 3, at ≥75% elapsed, if the campaign has zero bids AND zero driver recommendations, ONE extra push of up to **+20%** of plan reach goes out (wave 4, `ReachCampaignEscalated` event).
- **`get_network_feed`** — sponsored visibility is now targets-only (org must be in a released wave). Active campaigns at migration time were backfilled with a wave-1 allocation so they didn't go dark.
- **Delivery panel** — `get_reach_campaign_delivery` powers a per-wave breakdown (targets, verified split, distinct orgs that actually saw it) on the campaign detail screen.
- **Driver Story tab** — `get_driver_reach_stories` + `app/(driver)/stories.tsx` (`DriverStoriesScreen`). Story lifecycle per spec: visible while the load is open; **disappears once the load is assigned to someone else** (an accepted bid that isn't the driver's own referral bid); the driver's own **rewarded** conversion stays pinned with the earning and links to the existing wallet (`driver_ledger`, unchanged). Rejected recommendations stay visible while the story is live. Driver impressions log via `record_reach_driver_event` (deduped per campaign/day; the org variant requires an actor org drivers don't have).
- **Naming: Driver Incentive** — the boost sheet frames the recommendation reward as a **Driver Incentive** ("reward per converted recommendation", "maximum incentive budget"), with a nudge when Driver Stories is on but no incentive is set: campaigns with an incentive get quicker bids. A brief interim revision used "Driver Tip"; that was reverted on product feedback — "tip" implies an optional gratuity, whereas this is a structured, escrow-backed, campaign-funded incentive. Schema/event names (`reward_amount`, `driver_reward_enabled`, `ReachReferral*`) are unchanged throughout.

## Campaign Snapshot Lifecycle (shipped after structured delivery)

Product decision: **the customer didn't buy a story, they bought distribution.** Previously the client delete flow cancelled an active campaign (`cancel_reason = 'source_deleted'`) and the feed only served sponsored stories `FROM posts`, so deleting the source story killed paid delivery instantly with no refund. The snapshot columns (20261230) already made the campaign row self-sufficient — `20270108000000_campaign_snapshot_lifecycle.sql` makes delivery actually use them:

- **Lifecycle**: Story → Publish (snapshot created) → Story deleted → **campaign continues** → campaign ends → snapshot archived. The campaign row is the immutable marketing artifact from publish time; content authoring and campaign execution are now separate concerns.
- **`source_deleted_at`** on `reach_campaigns` + `mark_reach_campaign_source_deleted` RPC — a transparency/analytics stamp, NOT a lifecycle state. Both delete flows (`StoryDetailScreen`, `PostDetailScreen`) stamp it instead of cancelling, and their confirm dialogs now say the paid campaign continues from its snapshot.
- **Feed**: `get_network_feed` grew a second branch — active campaigns whose post is deactivated or hard-deleted are served from the campaign snapshot to their released targets (and the owning org). The branch stops if the load was already assigned (an accepted bid exists) — continued distribution of a filled load helps nobody, consistent with the driver-story disappearance rule.
- **Transparency label**: campaign detail shows "Original story deleted — serving campaign snapshot" when `source_deleted_at` is set.
- `cancel_reach_campaign('source_deleted')` still exists for historical rows and genuine cancellations; new deletions simply never call it.
- **Driver Bid Now (Option A):** `submit_driver_direct_bid` and `get_driver_reach_stories` use **campaign** eligibility (active campaign + channels), not `posts.is_active`. Soft-deleted source Stories remain biddable while the campaign is active and the load is unassigned — same snapshot-lifecycle rule as Network feed Branch B (`20270210171000` + `20270210183000`).

## Canonical delivery record (`reach_campaign_targets`)

`reach_campaign_targets` is now the single per-(campaign, org) lifecycle row — every delivery question reads from it: `wave`/`released_at` (delivered) → `viewed_at` (first impression, stamped in `record_reach_event`) → `bid_at` (first bid, stamped by an `AFTER INSERT` trigger on `bids` so every bid surface feeds it) → `converted_at` (stamped in `convert_reach_referral`). Historical impressions and bids were backfilled. `get_reach_campaign_delivery` reports the per-wave funnel (targets / verified split / viewed / bids / conversions) from these columns, and the campaign-detail Delivery panel renders it. Click/trip/reward refinements can extend the same row later without new tables.

**Standing principle (Growth Principle 8 in `docs/PULSE_GROWTH_PLATFORM.md`):** this table is the delivery **fact table**. Every future analytics feature joins dimensions onto it — organization, wave, campaign, reward — rather than querying event tables independently. No dashboard should re-derive "did this campaign deliver?" from anywhere else; that is what keeps reporting consistent across the customer detail screen, the admin Control Center, and anything Pulse Intelligence builds later.

## What this document deliberately does not do

- Does not commit to whether "reserved" credits should count toward `lifetime_spent` for reporting purposes — a real open question, not decided here or in the shipped code.
- Does not re-litigate the driver-facing recommendation UI/UX — that already exists and shipped; a future UX pass (V3-adjacent, e.g. surfacing recommendation history or driver-side campaign discovery quality) is a separate, smaller design question if it comes up.
- Does not assume further Boost work is next — per the standing sequencing (Growth Activation → Reach pilot → Phase 2.3 Delivery Engine), Boost V2 shipping doesn't change that order; this document just keeps the record accurate for whenever V3 is picked up.
