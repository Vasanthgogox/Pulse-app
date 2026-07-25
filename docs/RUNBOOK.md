# Pulse Growth Platform — Production Runbook

**Platform version 2.0.0 · Architecture Frozen · January 2027**

This is an operational document, not a design document. It is for the person who gets paged
when the Growth platform (Boost campaigns, driver Opportunities, Referral Escrow, rewards)
behaves unexpectedly. Feature context lives in `docs/PULSE_GROWTH_PLATFORM.md`; version history
in `docs/PULSE_GROWTH_CHANGELOG.md`.

All SQL below runs against the linked remote:

```bash
supabase db query "<SQL>" --linked -o table
```

**Money map (read this first):**

| Flow | Where it's recorded |
|---|---|
| Boost fee (credits) | `pulse_credit_transactions` type `spend_reach`, wallet `pulse_credit_wallets.balance` decremented |
| Referral Escrow lock at publish | `pulse_credit_transactions` type `reserve_referral` (negative), `reach_campaigns.reward_reserved` incremented |
| Driver reward payout (INR, on trip start) | `driver_ledger` entry type `reward` via `add_driver_ledger_entry`; campaign `reward_reserved → reward_paid` |
| Unused escrow refund (campaign end/cancel) | `pulse_credit_transactions` type `referral_refund` (positive) via `fn_release_reach_referral_escrow`; campaign `reward_reserved → reward_refunded` |

**Referral pipeline states:** `recommended → approved | rejected → bid_submitted → rewarded` (terminal: `rejected`, `rewarded`, `expired`).

---

## 1. Health Checks

**One-shot marketplace overview** (same RPC that powers the admin console's Boost Control Center):

```sql
select public.get_boost_control_center();
```

**Cron jobs that keep the platform honest** — all three must have recent successful runs:

| Job name | Schedule | What breaks if it dies |
|---|---|---|
| `reach_campaigns_expire` | hourly at :05 | Expired campaigns stay "active"; escrow never refunds |
| `reach_campaigns_pace` | every 10 min | Delivery waves stop releasing; campaigns go dark mid-flight |
| `reach_campaign_daily_metrics_aggregate` | daily 03:15 | Daily metrics drift from `reach_events` |

```sql
select jobname, status, start_time, end_time
from cron.job_run_details jrd join cron.job j on j.jobid = jrd.jobid
where j.jobname in ('reach_campaigns_expire','reach_campaigns_pace','reach_campaign_daily_metrics_aggregate')
order by start_time desc limit 15;
```

**Stuck campaigns** (should always return 0 rows; if not, the expire cron is dead — see §5):

```sql
select id, expires_at, reward_reserved from public.reach_campaigns
where status = 'active' and expires_at < now() - interval '2 hours';
```

**Escrow invariant quick check** (should return 0 rows — see §3 for the full procedure):

```sql
select id, reward_budget, reward_reserved, reward_paid, reward_refunded
from public.reach_campaigns
where driver_reward_enabled
  and reward_reserved + reward_paid + reward_refunded <> reward_budget;
```

## 2. Common Failures

| Symptom / error | Cause | Action |
|---|---|---|
| `escrow_exhausted: remaining escrow cannot cover this reward` from `convert_reach_referral` | Legitimate guard — remaining `reward_reserved` < the referral's snapshotted `reward_amount` | Not a bug. The driver was promised a reward the budget can no longer cover. Business call: top up via a new campaign, or communicate. Never bypass the guard. |
| `not_found: no driver record for user … in organization …` from `convert_reach_referral` | Recommending driver has no `drivers` row in the fleet org (left the org between recommendation and trip start) | Verify membership: `select * from public.drivers where user_id = '<uid>' and organization_id = '<org>'`. If the driver genuinely left, the reward cannot settle — mark the situation in the referral notes and inform the fleet org. |
| Campaigns stay "active" past `expires_at` | `reach_campaigns_expire` cron dead | §5 — run the function manually, then fix the cron. |
| Publish fails with insufficient credits | Wallet balance < fee + escrow | Expected validation. Check `pulse_credit_wallets.balance` vs plan `credit_price` + reward budget. |
| Campaign cancelled with `cancel_reason = 'source_deleted'` | Org deleted the boosted story | Expected lifecycle. Escrow auto-refunds via `cancel_reach_campaign`. Verify the `referral_refund` transaction exists. |
| Sentry: `AsyncRequireError: Loading module … failed` | Stale chunk after Netlify redeploy | Known noise. Recovery listeners already reload. Do NOT "fix" in code. |
| Sentry: `[AuthGuard] refresh_invalid_session_cleared` | Expected warning-level auth signal | Known noise. Ignore. |

## 3. Escrow Reconciliation

Escrow is a **liability**, not revenue. Two invariants must hold at all times.

**Invariant A — per campaign:** `reward_budget = reward_reserved + reward_paid + reward_refunded`
for every campaign with `driver_reward_enabled`. Violations:

```sql
select id, org_id, status, reward_budget, reward_reserved, reward_paid, reward_refunded,
       reward_budget - (reward_reserved + reward_paid + reward_refunded) as drift
from public.reach_campaigns
where driver_reward_enabled
  and reward_reserved + reward_paid + reward_refunded <> reward_budget;
```

**Invariant B — wallet ledger:** the latest `balance_after` in the transaction ledger must equal
the wallet balance for every org:

```sql
select w.org_id, w.balance,
       (select t.balance_after from public.pulse_credit_transactions t
        where t.org_id = w.org_id order by t.created_at desc limit 1) as ledger_balance
from public.pulse_credit_wallets w
where w.balance <> coalesce(
  (select t.balance_after from public.pulse_credit_transactions t
   where t.org_id = w.org_id order by t.created_at desc limit 1), w.balance);
```

**Terminal-campaign check:** completed/cancelled campaigns must hold zero escrow:

```sql
select id, status, reward_reserved from public.reach_campaigns
where status in ('completed','cancelled') and reward_reserved > 0;
```

If a terminal campaign still holds escrow, the release function was skipped — run it manually
(service role): `select public.fn_release_reach_referral_escrow('<campaign_id>');`
then re-run Invariants A and B. If drift persists, escalate — do not hand-edit balances;
any correction must be an `admin_adjustment` transaction with a `notes` explanation, never an UPDATE.

## 4. Reward Settlement Verification

Every `rewarded` referral must have exactly one matching driver payout. Referrals that claim
to be rewarded but have no `driver_ledger` entry:

```sql
select r.id as referral_id, r.campaign_id, r.reward_amount, r.rewarded_at
from public.reach_referrals r
where r.status = 'rewarded' and r.reward_amount > 0
  and not exists (
    select 1 from public.driver_ledger dl
    where dl.reference_id = r.id and dl.reference_type = 'reach_referral'
  );
```

The reverse (payout without a rewarded referral) should also be empty:

```sql
select dl.id, dl.reference_id, dl.amount
from public.driver_ledger dl
where dl.reference_type = 'reach_referral'
  and not exists (
    select 1 from public.reach_referrals r
    where r.id = dl.reference_id and r.status = 'rewarded'
  );
```

Note: `reward_amount` on the referral is **snapshotted at recommendation time** — a later
campaign change never alters what a driver was promised. When investigating "wrong amount"
reports, compare against the referral row, not the campaign row.

## 5. Failed Campaign Recovery

**Expire cron dead / campaigns stuck active:**

```sql
-- Run the same function the cron runs (completes expired campaigns AND releases escrow):
select public.fn_expire_reach_campaigns();
-- Then confirm the job is scheduled and re-runs:
select jobname, schedule, active from cron.job where jobname = 'reach_campaigns_expire';
```

**Delivery stalled (story stopped appearing in feeds mid-campaign):**

```sql
select public.fn_pace_reach_campaigns();
```

**Cancel a misbehaving campaign** (refunds remaining escrow automatically; must be run by an
owner-org member or via service role):

```sql
select public.cancel_reach_campaign('<campaign_id>', 'user_cancelled');
```

After any recovery action, re-run §1 health checks and §3 Invariant A for the affected campaign.

## 6. Event Replay

There is no external queue — events are written inline by the RPCs, so "replay" means
re-deriving from the append-only sources, which are never mutated:

- `reach_events` — impressions/views per campaign (`event_type`, `campaign_id`, actor).
- `platform_events` — funnel/state events: `ReachReferralRecommended`, `ReachReferralDecided`,
  `ReachReferralRewarded`, campaign lifecycle events (`event_type`, `org_id`, `payload` jsonb).

**Reconstruct a referral's full timeline** (e.g. driver disputes a reward):

```sql
select event_type, created_at, payload
from public.platform_events
where payload->>'referral_id' = '<referral_id>'
order by created_at;
```

**Rebuild daily metric aggregates** after a gap (idempotent — recomputes from `reach_events`):

```sql
select public.fn_aggregate_reach_daily_metrics();
```

Referral **state** is authoritative in `reach_referrals` (status + `decided_at`/`rewarded_at`);
events are the audit trail. If they disagree, the table row is what settlement used — investigate
the RPC call path, don't "fix" events.

## 7. Monitoring

- **Sentry**: org `gogox-gr`, region `https://de.sentry.io`. Projects: `gx-pulse` (web + Android
  prod), `react-native`. Live release `pulse@1.0.0`. Known noise that must NOT be "fixed" in
  code: `AsyncRequireError` (stale chunk post-deploy) and `[AuthGuard]
  refresh_invalid_session_cleared` (expected auth signal).
- **Boost Control Center**: admin analytics console → "Boost · Control Center"
  (`get_boost_control_center` RPC). Watch: Need-Attention share rising, funnel timings degrading.
- **Cron health**: `cron.job_run_details` (§1). A retention job trims this table — check recency,
  not history depth.
- **What pages should mean**: settlement failures (§4 queries non-empty), escrow drift (§3),
  stuck campaigns (§1). Impression volume dips are usually campaign mix, not incidents.

## 8. Rollback Procedures

- **Web**: Netlify (`gx-pulse.netlify.app`) → Deploys → restore the previous deploy. Stale-chunk
  errors right after any deploy/rollback are expected and self-recover.
- **Native**: no OTA (`ota_updates` disabled). A client-side fix requires a fresh Android/iOS
  build; plan comms accordingly. There is no native "rollback" other than shipping a new build.
- **Database**: migrations are forward-only. Never revert schema by editing remote directly.
  A bad migration is corrected by a **new** migration (`YYYYMMDDHHMMSS_fix_*.sql`) pushed via
  `supabase db push`. Use `supabase migration repair` only for history mismatches, per
  the migration rules — it is a scalpel, not a rollback tool.
- **RPC-only fixes deploy instantly** via migration push, independent of app builds — prefer
  fixing settlement/escrow logic in SQL over waiting on a client release.

## 9. Release Checklist

Architecture is frozen: schema changes ship only as bug fixes (v2.0.x). For each release:

1. `npx tsc --noEmit` clean (one known pre-existing error in `ClientProfileScreen.tsx`).
2. `supabase migration list --linked` — local and remote in sync before pushing anything new.
3. `supabase db push` for any bug-fix migration; verify with a targeted `db query` smoke test.
4. Run §3 escrow invariants and §4 settlement checks against remote — must be empty.
5. `select public.get_boost_control_center();` returns sane data.
6. Add a `2.0.x` entry to `docs/PULSE_GROWTH_CHANGELOG.md` (version, date, bullets).
7. Web deploy via Netlify; confirm the deploy, expect transient `AsyncRequireError` noise.
8. Native changes: new build required — confirm before promising a fix date.

### 9a. Pilot readiness gate (before GA)

**Status: Ready for Pilot (architecture). Pilot Entry deferred** — gate P1 is ⛔ **Blocked by ADR-010** (`docs/decisions.md`). Treat v2.0 as a **pilot program**, not an open engineering project. Execute remaining gates as an **operational rehearsal** — capture Scenario / Expected / Actual / Evidence / Outcome / Follow-up for each (template: `docs/PILOT_ENTRY_VALIDATION.md`).

**Order is mandatory:** ADR-010 → P1 → P2 → P3 (each depends on the previous).

| # | Validation | Status | Pass criteria |
|---|---|---|---|
| — | ADR-010 (driver `organization_members`) | ⛔ Blocker | RLS patch → role CHECK → onboarding → backfill; freeze-allowed (correctness + security) |
| P1 | Driver personas | ⛔ Blocked by ADR-010 | Independent → bid directly, no recommend incentive; Active fleet → recommend + incentive on conversion; Pending → join-fleet CTA, cannot recommend/bid as fleet driver |
| P2 | Opportunity Inbox E2E | Not Started (depends on P1) | One live path: Recommend → Inbox → Confidence → Reason/Rate → Bid → Award → Conversion → `driver_ledger` reward |
| P3 | Mobile layout | Pending | One narrow-width pass: Reach Home, story cards, timeline, opportunity card, driver earnings card, bottom sheets, credit dialog if used |

**Pilot Entry Criteria** (pilot officially starts only when all are true):

1. ADR-010 implemented  
2. P1 passes  
3. P2 passes  
4. P3 passes  
5. Runbook executed successfully once (§1–5)  
6. Control Center operational  
7. First Pilot Review template ready  

Do **not** re-scope to Independent-only without explicit business acceptance criteria.

**Pilot vs GA:** Pilot = works correctly with real customers. GA = consistent reliability across multiple customers/campaigns.

Non-blocker backlog (keep out of the gate): suppress “Upgrade to a higher tier” when campaign is already on max plan (`campaignHealth` suggestion `upgrade_plan`).

## 10. Incident Contacts

| Role | Owns | Contact |
|---|---|---|
| Platform on-call | This runbook, first response | _TBD_ |
| Growth platform owner | Campaign/escrow/reward logic decisions | _TBD_ |
| Finance escalation | Escrow drift, manual `admin_adjustment` approval | _TBD_ |
| Infra (Supabase/Netlify) | Cron, deploys, database access | _TBD_ |

Escalation rule of thumb: anything touching **money** (§3/§4 non-empty results) pages the
Growth platform owner AND Finance — a wrong balance is an incident even when no user has
complained yet.
