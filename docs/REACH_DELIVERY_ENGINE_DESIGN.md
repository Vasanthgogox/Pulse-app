# Reach Delivery Engine — Design Document (Phase 2.3)

*Design-only. No code, schema, RPC, or payment changes are made by this document — it exists to be reviewed and revised before Phase 2.3 implementation starts. See `docs/PULSE_GROWTH_PLATFORM.md` for the overall roadmap and `docs/decisions.md` (ADR-009) for the underlying architecture decisions this extends.*

**This document is a living design artifact, not a fixed spec.** Per the recommendation below (see "Validate before implementing"), the internal pilot's findings — whether broader distribution actually produces more qualified bids, whether Starter/Growth/Business pricing feels right, whether users care about "Reach Delivered" at all versus raw bid counts — should be allowed to change the eligibility/ranking rules below before implementation starts, not just confirm them.

## Why now

Reach's product promise is: **"Reach verified fleet owners and verified shippers on Pulse."** Today that promise is not actually true — it's aspirational copy on top of a much blunter mechanism. `get_network_feed` (see `supabase/migrations/20261229000000_reach_extends_visibility_beyond_connections.sql`, which fixed a real bug where boosted posts got *zero* extended reach) now makes any post with an `active` campaign visible **platform-wide, to every organization, unfiltered** — the migration's own comment says this outright: *"it doesn't filter recipients to specifically 'verified fleet owners', and it doesn't enforce the plan's exact `estimated_reach_max` as a hard cap... every org on the platform can currently see any active sponsored post."*

Two consequences of that gap remain to be closed by this phase (a third — Impressions/Views were structurally identical and read as permanently zero — was found during this design work and has already been fixed; see "Instrumentation gap" below):

1. **"Reach Delivered" is not a count of organizations — it's a UI clamp.** `BoostProgressSheet.tsx` and `ReachHistoryScreen.tsx` compute it as `Math.min(metrics.impressions, plan.estimated_reach_max)`: a raw impression count (which can include the same org loading the feed many times) clamped so it never visually exceeds the plan's promise. It looks like a real ceiling; it isn't measuring one. This is the single clearest success criterion for this phase: **replace a display calculation with a true delivery metric.**
2. **The plan tiers (Starter 25 / Growth 60 / Business 150) don't do anything.** `reach_plans.estimated_reach_max` is read only as display copy and as the denominator in that same clamp — nothing in the system stops delivery once that number is reached, and nothing filters *who* counts toward it.

This document proposes the internal delivery engine that closes both gaps — an eligibility → ranking → accounting → enforcement pipeline sitting entirely behind `get_network_feed`, invisible to the customer. The customer-facing surface doesn't change: Reach Home / BoostProgressSheet / ReachHistoryScreen still show the same numbers. Those numbers just become true.

## Goals

- Make "reach up to N verified fleet owners/shippers" a real, enforced ceiling, not descriptive copy.
- Count **distinct organizations** reached per campaign, not raw impressions.
- Stop counting new organizations once a campaign's plan cap is hit — already-reached orgs keep seeing the post; new orgs don't get added.
- Prioritize verified fleet owners and shippers over other org types when the eligible pool is larger than the plan cap.
- Give "Impression" a definition that actually corresponds to feed placement, distinct from "View" (story opened) — see the metrics section below.
- Do all of this without introducing any customer-facing targeting, audience builder, or ad-manager concept — the buyer experience is unchanged.

## Non-goals — Phase 2.3 will NOT include

- Customer-facing audience targeting or an audience builder UI.
- Geography filters exposed to the buyer.
- Vehicle-type filters exposed to the buyer.
- AI/ML ranking or scoring (deferred to Phase 3, once a proven deterministic baseline exists to improve on).
- Manual audience selection by the customer.
- Campaign editing (changing plan/content after publish beyond the existing upgrade flow).
- Fraud detection, best-time-to-post, or performance prediction (Phase 3).

Keeping this list explicit is what keeps the implementation disciplined — every one of these is a plausible "while we're in there" addition that would blur this phase back into a targeting/ad-manager product, which the whole Reach philosophy (`docs/PULSE_GROWTH_PLATFORM.md`, Growth Principle #6) rules out.

## Three stages, kept conceptually separate

The delivery engine is not one query — it's three distinct stages, each answering a different question. Keeping them separate (rather than one combined "who sees this" query) is what makes Phase 3's optimization work additive instead of a rewrite: Phase 3 only ever touches the ranking stage.

1. **Eligible Audience** — everyone who *could* receive the campaign. A broad, cheap-to-compute set: active organizations, not blocked, verified (if required). This is a pure membership test, no ordering, no limit.
2. **Delivery Audience** — the subset actually selected from the eligible audience: ranked, capped at the plan's `estimated_reach_max`, excluding organizations already counted as reached. This is where the plan tiers become real.
3. **Engagement** — what happened *after* delivery: viewed, bid, or ignored. This is downstream of delivery, not part of deciding delivery — an org's past engagement with *other* campaigns may inform ranking (see "Bidding-history match" below), but a given org's engagement with *this* campaign is measured only after it's already in the delivery audience.

The eligibility/ranking/accounting/enforcement sections below map onto these three stages in order.

## Eligible Audience — which organizations could receive a campaign

Proposed v1 rule, deliberately minimal:

- The organization is not the campaign's own org (`org_id <> reach_campaigns.org_id`).
- The organization is verified: `organizations.verification_status = 'verified'` — the existing KYC column (`supabase/migrations/20260801000000_workspace_kyc_structure.sql`), reused as-is. No new verification concept.
- The organization has an active membership, consistent with how every other org-scoped RLS check in this codebase already filters (`organization_members.status = 'active'`).
- Existing connections are **not** a gate — that's already the deliberate decision behind the `20261229000000` migration. Reach's entire value is extending beyond an org's existing connections; eligibility is about verification and role fit, not who they're already connected to.

**Open question, not decided here — and deliberately not invented a solution for:** this is a product decision, not an engineering one. This schema has no column that stably classifies an organization as "fleet owner" vs. "shipper" — `organizations.business_type` answers "what is this org's legal/business registration," and `connection_requests.request_shipper_client` / `request_carrier_supplier` answers "what role did this org play in *one relationship*." Neither answers the actual question: **what type of organization is this on Pulse?**

Two candidate approaches for v1:

1. **Infer role from behavior, no schema change** — for a LOAD post, the eligible audience is organizations that have ever placed a bid (`public.bids`) on any load post, i.e. orgs that behave like carriers/fleet owners. This needs no new column and fits "no schema changes" as a hard constraint for this phase.
2. **Add a real `organizations.primary_role` column** (Fleet Owner / Shipper / Both) — cleaner long-term, but a schema change, which this phase's own constraints rule out for now.

**Recommendation, with an explicit caveat:** ship v1 with option 1 — but treat it strictly as a short-term implementation heuristic, never the permanent product model. Inferring "likely fleet owner" from bidding history is a proxy, not an identity; it should not be allowed to quietly ossify into how Pulse thinks about organizations. Whether the eventual explicit model is `primary_role`, `organization_type`, or something else is a decision for later — but it should be made explicit on purpose, not arrived at by default because the heuristic was never revisited.

## Delivery Audience — how eligible organizations are ranked and capped

Ranking only matters once the eligible pool is larger than the plan's cap (frequently true — verified orgs alone will usually outnumber 25/60/150). Proposed v1, in priority order:

1. **Verification is the eligibility gate, not a rank** — already covered above.
2. **Bidding-history match** — organizations that have previously bid on a post with a matching `vehicle_type` and/or overlapping `origin`/`destination` rank ahead of organizations with no such history. This is a plain join against existing `bids`/`posts` columns — no new signal to collect, no ML.
3. *(Optional, not required for v1)* **Delivery spread** — organizations not recently counted toward a *different* campaign's reach get a small priority boost, so reach doesn't always concentrate on the same most-active handful of orgs. Flagged as a nice-to-have; ship v1 without it if #1–#2 already produce a reasonable order, and only add it if real usage shows reach concentrating too narrowly.

## Delivery accounting & the corrected metric model

### Instrumentation gap — found, and fixed, ahead of this phase

Originally traced in `StoryDetailScreen.tsx`'s view-recording effect: Impression and View fired together, at the same instant, gated on the story actually being opened — meaning Impressions was structurally a duplicate of Views (the two could never diverge), and testing while logged into the boosting org (`isOwnPost` excluded) recorded nothing at all, which is why the numbers read as permanently zero. (The read side — `get_reach_campaign_metrics`, materialized-days-plus-live-tail — was checked separately and confirmed correct; this was a write-side gap only.) This has since been fixed: Impressions now record separately, in `StoryReel.tsx`, when a sponsored story renders into the Network story strip; Views stay in `StoryDetailScreen.tsx`, on story open.

### Corrected metric definitions

Pulse isn't a generic social feed, but the same feed-vs-detail distinction applies. Impression is explicitly versioned — v1 ships now as a documented proxy, not a final definition:

| Metric | Trigger |
|---|---|
| **Impressions (v1)** | A sponsored story rendered into the Network story strip for an eligible organization. **Caveat, important to keep documented:** the strip is a plain `ScrollView`, not virtualized — every story mounts immediately, so a 5-story strip records 5 impressions even if the user only ever looks at the first one. This is "rendered," not "seen." |
| **Views** | The user opened the story (story detail, not just feed placement). |
| **Bids** | The user submitted a bid — read from the existing `public.bids` table, never logged as a separate event (unchanged from Phase 2.1). |
| **Reach Delivered** | Unique eligible organizations that have received the campaign — its own metric (this phase), not derived from Impressions. |

This gives a clean funnel: **Feed Placement → Impression → Story Open → View → Bid.** With Impression and View no longer identical, the funnel becomes informative for the first time — e.g. 100 impressions → 60 views → 15 bids yields a real 60% open rate and 25% bid-conversion rate, which was structurally impossible to compute before this fix (impressions and views were always equal).

**Impression (v2), a later refinement, not required now:** viewport-based visibility (did the card actually scroll into view), superseding the v1 render-based proxy — only worth building if the pilot shows v1 diverging meaningfully from real attention. **Monitor the Views/Impressions ratio during the pilot** to decide: a ratio like 480/500 means the render-based proxy is close enough to real viewing behavior to leave alone; a ratio like 20/500 means "mounted but not seen" is materially inflating impressions, which would justify building v2.

Implications for delivery accounting:

- **"Reach Delivered" stops being `min(impressions, plan_max)`.** With Impressions now a real (if v1-proxy) feed-placement signal, a new durable record is needed: one row per (campaign, organization) the first time that organization's feed placement is recorded — call it `reach_deliveries`. **"Reach Delivered" = `count(distinct org_id)` from that table.** This is the only new storage this design implies; it is **not** created by this document, only specified for the implementation phase.

## Plan enforcement — how Starter/Growth/Business stop at their promised reach

- Once `count(distinct org_id)` in `reach_deliveries` for a campaign reaches `reach_plans.estimated_reach_max`, that campaign stops being offered to **new** organizations — organizations already delivered to keep seeing the post (it doesn't vanish from their feed), but no further orgs get added.
- Concretely, this becomes an additional condition in `get_network_feed`'s sponsorship visibility: an org sees a sponsored post if `(distinct-delivery count for that campaign < plan.estimated_reach_max) OR (that org already has a reach_deliveries row for that campaign)`.
- This is the change that makes Starter/Growth/Business actually different products, rather than differing only in price and duration — today, all three plans behave identically in terms of who sees the post.

## Future extensibility — how Phase 3 plugs in

- **Ranking (Delivery Audience stage) is the intended extension seam.** v1's SQL-only "verified-first + bid-history match" can later become a scored function (lane/geography weighting, or a real recommendation model) without touching eligibility or accounting — ranking only decides *order* among already-eligible orgs, never *whether* an org is eligible or *whether* a delivery counts.
- **Eligibility is the seam for future targeting precision** (a real `primary_role` column, lane/geography filters) — additive predicates on the same eligibility query, not a rewrite.
- **Delivery accounting doesn't change shape** as ranking/eligibility get smarter — `reach_deliveries` stays "one row per org per campaign" regardless of how an org became eligible or how it was ranked.
- **The customer-facing surface doesn't change at all.** Reach Home, BoostProgressSheet, and ReachHistoryScreen only ever need the same numbers to become accurate — no new screens, no new concepts exposed to the buyer, in this phase or the next.

## Validate before implementing

This is a natural checkpoint, not a green light to start coding immediately. Phase 2.1 (build Reach) → Phase 2.2 (make Reach discoverable) → this document (design intelligent delivery *before* writing code) is a deliberate sequence of strengthening the platform layer by layer rather than stacking features on an uncertain foundation. Before implementing any of the above, the internal pilot should answer:

- Do users understand what Reach promises?
- Does broader distribution actually generate more qualified bids — is "reach" the thing customers value, or is it a proxy for something else?
- Are the Starter/Growth/Business plans priced appropriately for the reach they promise?
- Do users care more about "Reach Delivered" as a number, or about actual business outcomes like bid count?

Those answers should be allowed to change the eligibility/ranking rules above — this document is a solid starting foundation, not a fixed spec to implement unchanged regardless of what the pilot shows.

## What this document deliberately does not do

- Ship no code, no migration, no RPC change, no new table — this is a design document only, for review before implementation begins.
- Does not resolve the fleet-owner/shipper classification question above — flagged as an open *product* decision for whoever signs off on this before implementation, not an engineering call to make unilaterally.
- Does not commit to the "delivery spread" ranking heuristic — proposed as optional, to be added only if real usage shows a need.
- Does not build `reach_deliveries` or the eligibility/ranking/enforcement pipeline itself — the Impressions/Views instrumentation fix (recording them as genuinely separate events) shipped ahead of this phase since it corrected an already-live metric, but "Reach Delivered" as its own accounted metric is still this phase's implementation work, not done yet.
