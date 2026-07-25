# Growth Activation — Design Document (Phase 2.4)

*Design-only. No schema, RPC, or UI code is shipped by this document. See `docs/PULSE_GROWTH_PLATFORM.md` for the overall roadmap and `docs/decisions.md` (ADR-009) for the underlying architecture.*

**Renamed from "Growth Referrals."** Referrals are the first activation rule, not the whole concept — the same `reward_rules` mechanism this phase exposes to admins is meant to later support other activation events (profile completion, first trip, first bid, first connection) without any architecture change. Nothing beyond referrals is built now; the name just stops implying referrals are the only thing this phase will ever be.

**Resequenced ahead of Phase 2.3 (Delivery Engine).** Reasoning: today Reach has a way to *spend* credits (boost a load) but almost no way to *earn* them outside a manual admin grant. A credit economy needs both sides working before optimizing the spend side further — so this phase now runs, and the pilot's credit loop goes live, *before* Phase 2.3 implementation starts. See `docs/PULSE_GROWTH_PLATFORM.md`'s roadmap section for the reordered sequence.

## The most important finding: most of this already exists, live, in production

Before designing anything new, the actual schema was checked. `supabase/migrations/20261224030000_reach_growth_loop.sql` — applied to the linked project (confirmed via `supabase migration list --linked`) — already implements almost the entire backend this phase describes:

- **`reward_rules`** table: configurable award amounts, not hardcoded. Live values today: `verification_approved = 500`, `referral_milestone_verified = 250`.
- **`pulse_credit_referrals`** table: `id, referrer_org_id, referred_org_id (UNIQUE), status ('pending'|'milestone_met'|'credited'), credited_at, created_at`, with a `CHECK` constraint blocking self-referral (`referrer_org_id <> referred_org_id`) already at the DB level.
- **`record_referral(p_referrer_org_id, p_referred_org_id)`** RPC: self-service, callable by an authenticated member of the *referred* org, idempotent (`ON CONFLICT (referred_org_id) DO NOTHING`).
- **`platform_approve_verification(p_org_id, p_notes)`** RPC: already does the *entire* verification → reward → referral-settlement chain atomically in one call — approves KYC (via the existing `admin_approve_profile`), awards the org its own verification credits, checks for a pending referral on that org, awards the *referrer* their referral credits, marks the referral `credited`, and emits both a `BusinessVerified` and a `ReferralCompleted` platform event.
- **Thin typed service wrappers already exist**: `features/reach/services/referrals.service.ts` (`recordReferral`, `getReferralsForOrg`) and `features/reach/services/verification.service.ts` — written, typed, but **called from nowhere in the app**. `pulse_credit_referrals` has zero rows in production — this pipeline has never fired once.

So this phase is not "build a referral system" — it's **"finish wiring a referral system whose backend was already built and has sat unused."**

## Reward amounts — resolved, no code change needed beyond one config value

Both parties should get 500 credits: the referrer for growing the network, the new company for joining and verifying. **This requires no new logic** — `platform_approve_verification` already pays both parties in the same call:

```
platform_approve_verification(org_id)
  → increment_credit_wallet(org_id,            'earn_verification', reward_rules['verification_approved'])   -- already 500, unconditional
  → increment_credit_wallet(referral.referrer_org_id, 'earn_referral', reward_rules['referral_milestone_verified']) -- currently 250
```

The org being verified already gets 500 today, referred or not — that part needs no change. The only actual change is one config row:

```sql
UPDATE public.reward_rules SET credit_amount = 500 WHERE key = 'referral_milestone_verified';
```

That single update makes both sides of a referral 500/500, with the existing function firing both automatically. Nothing else in `platform_approve_verification` needs to change.

## Referral flow — mapped onto what exists vs. what's missing

Requested flow:
```
Invite → Share link/code → Friend installs → Creates account →
Joins/creates org → Completes Verification →
Referrer +500, New company +500 → Ledger entries → Notification
```

What's already real, end to end, today:
```
record_referral(referrer_org_id, referred_org_id)   [exists, unused]
        ↓
   org verification submitted (existing KYC pipeline, unrelated to this migration)
        ↓
platform_approve_verification(org_id)                [exists, unused]
        ↓
   increment_credit_wallet(org itself, 'earn_verification', 500)     [fires automatically, unconditional]
   increment_credit_wallet(referrer,   'earn_referral',     500*)    [fires automatically, *after config change above]
        ↓
   pulse_credit_referrals.status = 'credited'
        ↓
   emit_platform_event('ReferralCompleted', ...)      [fires automatically, no notification consumer yet]
```

What's genuinely missing (the real Phase 2.4 work):

1. **Invite link as the primary sharing mechanism, code as the fallback.** Not `record_referral(referrer_org_id, ...)` called directly with a raw UUID, and not leading with a bare code either — a real link (`pulse.app/r/GATI` or `pulse.app/invite/GATI`) that opens the app directly, still resolves to a short human-readable code internally, and still allows manual code entry as a fallback if the link doesn't open cleanly (e.g. pasted somewhere that strips deep links). Three actions on the Earn Credits screen: **Copy Invite Link**, **Copy Referral Code**, **Share via WhatsApp** — link first, code visible as the secondary/manual option, matching how this codebase already treats WhatsApp-share as an enhancement over a plain copyable value (see `buildPulseStoryPublicUrl` / the share pattern in `StoryDetailScreen.tsx`).
   - Needs: a new nullable, unique `organizations.referral_code` column (short, human-readable, derived from org name + numeric suffix only if needed for uniqueness); a deep-link route (mobile + web) that extracts the code from the URL and carries it through signup/onboarding; a new thin RPC `record_referral_by_code(p_code, p_referred_org_id)` that resolves `code → referrer_org_id` and delegates to the existing `record_referral` — its signature does not need to change.
2. **A "rejected" outcome.** The existing status enum is `pending → milestone_met → credited` with no terminal failure state. If a referred org's verification is rejected (`platform_reject_verification`, which also already exists), the referral row is simply left at `pending` forever. Adding `'rejected'` to the status CHECK and setting it inside `platform_reject_verification` (mirroring what `platform_approve_verification` already does for the success path) closes this gap with a small, additive change.
3. **Customer-facing UI.** `ReachEarnCreditsScreen` (Phase 2.2) is an explicit, intentional placeholder — three "Coming Soon" cards, zero backend calls. This phase replaces it with the real thing: the org's own invite link + code, the three share actions above, and a real list of the org's referrals and their status (`getReferralsForOrg` already returns exactly this).
4. **Admin Growth Console — Referrals *and* Reward Rules views.** Nothing like either exists yet (`analytics/` only has a Credits panel). Two new admin sections:
   - **Referrals**: list view over `pulse_credit_referrals`, admin-scoped (all orgs, not just "mine"), gated by the same `has_platform_permission(..., 'credits.issue')` check `reward_rules`'s own RLS already uses.
   - **Reward Rules**: expose the existing `reward_rules` table for CRUD by platform admins — a simple settings-style table (Event / Credits / Active toggle) so amounts change without a SQL migration. `reward_rules_platform_write` RLS already gates this correctly; this is a UI-only addition on top of an existing, already-secured table.
5. **Notification.** `emit_platform_event('ReferralCompleted', ...)` already fires — nothing turns it into an in-app notification today. Scoped narrowly to this one event type, not a general notification framework.

## Reference ID — reuse the existing pattern, don't invent a new format

This codebase already has exactly this pattern for Reach campaigns — `formatReachTripId()` in `features/reach/utils/campaignFormat.ts` derives a short, human-shown ID from the row's own UUID (`TRIP D193EC61`) rather than storing a second ID column. Same approach here: `formatReferralId()` deriving e.g. `REF-D193EC61` from `pulse_credit_referrals.id` — no new column, no new sequence.

## Database — extend, don't duplicate

**Recommendation, confirmed: do not introduce a new `growth_referrals` table.** `pulse_credit_referrals` already exists, is live, has RLS, and is wired into the one RPC that matters. The additive change:

```sql
ALTER TABLE public.pulse_credit_referrals
  ADD COLUMN IF NOT EXISTS referred_user_id uuid REFERENCES auth.users(id);
-- status gains 'rejected'
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
-- referral_code lives on organizations (identity of the referrer), not on the referral row
```

`referred_user_id` is the one genuinely new field this asks for that today's table doesn't have (today it only tracks org-to-org, not which specific user completed signup) — worth adding if "which person actually joined" needs to be shown to the referrer, otherwise skippable for the pilot.

## Admin Console shape

```
Growth
├── Credits        (exists today — analytics/src/components/credits/CreditsPanel.tsx)
├── Referrals      (new — list view over pulse_credit_referrals, admin-scoped)
├── Reward Rules   (new — CRUD over the existing reward_rules table)
└── Verification   (the existing KYC queue — already built, not part of this migration)
```

**Not building now:** a separate "Invitations" section (an invitation *is* a referral-link share, not a distinct object) and a separate "Activity" section (`platform_events` already serves as the audit log; a dedicated Activity screen is UI-only polish on data that already exists, not blocking).

## Anti-abuse — already partly enforced at the database level

- **Self-referral blocked**: already a `CHECK` constraint on `pulse_credit_referrals` — live today.
- **One reward per referred org**: already enforced — `referred_org_id` is `UNIQUE`, `record_referral` uses `ON CONFLICT (referred_org_id) DO NOTHING`.
- **Referral must complete verification**: already the only path to `credited`.
- **Duplicate verified organizations / manual override**: properties of the existing KYC pipeline, not the referral layer — no new work.
- **Fraud detection**: correctly out of scope.

## Scope, corrected against reality

| Item | Status |
|---|---|
| Referral code + invite link | **New** — column + generator + deep-link route + resolver RPC |
| Invite/share flow (link primary, code secondary, WhatsApp) | **New** — UI reusing existing WhatsApp-share pattern |
| Referral tracking | **Exists** — `pulse_credit_referrals` + `getReferralsForOrg` |
| Verification → reward workflow | **Exists** — `platform_approve_verification` already does this atomically for both parties |
| Automatic credit award, both parties | **Exists** for the verified org (500, unconditional); **config change only** for the referrer (250 → 500) |
| Credit ledger integration | **Exists** — `pulse_credit_transactions` already records `earn_referral`/`earn_verification` rows |
| Rejected-referral handling | **New** — small additive status + one line in `platform_reject_verification` |
| Admin Growth Console — Referrals | **New** — UI only, no new permission model needed |
| Admin Growth Console — Reward Rules | **New** — UI only, over an already-secured existing table |
| Notification on completion | **New** — event already fires, nothing consumes it yet |

**Not building**: referral tiers, multi-level referrals, variable rewards, gamification, leaderboards, time-limited campaigns.

## Sequencing

```
Reach Pilot prep
        ↓
Phase 2.4 — Growth Activation (this document)
   wire: Earn Credits screen, invite link + code, Reward Rules config,
   Referrals admin view, rejected status, notification
        ↓
Run the Reach pilot with a working earn + spend credit loop
        ↓
Pilot data informs whether Phase 2.3 (Delivery Engine) optimizes for
impressions, qualified bids, verified-audience reach, or something else
```

## What this document deliberately does not do

- Ship no code, no migration, no UI — design only, for review before implementation.
- Does not build any activation rule beyond referrals (verification/profile/first-trip/first-bid rules are future work the naming leaves room for, not scoped here).
