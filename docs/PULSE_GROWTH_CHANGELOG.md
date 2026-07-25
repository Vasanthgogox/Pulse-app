# Pulse Growth Platform — Changelog

Simple, append-only version history. Rules:

- **Patch (`2.0.x`)** — bug fixes, performance, analytics improvements, UI polish. No schema changes except bug fixes (architecture is frozen as of 2.0.0).
- **Minor/major** — requires a new epic with its own definition of done (e.g. Pulse Intelligence). "Boost V2" does not grow indefinitely.
- Each entry: version, date, and short bullets. Reference migration files where relevant.

**This document's ownership:** platform evolution, deferred items, and release history. Architecture / governance / Final Sign-off → `docs/PULSE_GROWTH_PLATFORM.md`. Pilot entry gates / rehearsal evidence → `docs/PILOT_ENTRY_VALIDATION.md`.

---

## 2.0.3 — Driver Referral Earnings Card & Withdrawal Flow · January 2027

Driver-side settlement UX for rewards that already exist in `driver_ledger` — no new money movement, rides the proven salary request pipeline (Permanent Principle 3: ledger-driven settlement).

- Stories tab: emerald Referral Earnings card (same design language as the Salary tab's "TO COLLECT" card) — available to withdraw, earned/withdrawn totals, pending-withdrawal chip; replaces the thin earnings strip
- Withdrawal flow: WITHDRAW opens a per-fleet balance sheet; each request creates a `driver_salary_requests` row with new `request_type='reward'` (`20270110000000`) that the fleet owner approves & pays like any salary request
- Earnings math (`features/reach/utils/referralEarnings.ts`): available = ledger rewards − (pending + approved + paid withdrawal requests), per fleet org; rejected requests release back
- Data: `getDriverReferralEarnings()` in `driverReferrals.service.ts` (reward ledger entries + reward requests + org names, RLS-scoped); `useDriverRewardEarningsQuery` / `useRequestRewardWithdrawalMutation`
- Both salary-request UIs (driver history + fleet inbox) label the new type "Referral reward"

**Deferred (post-pilot — do not build yet):** reward withdrawal timeline UI; notification hooks (earned / submitted / approved / rejected / paid); Control Center metrics (total rewards, pending withdrawals, avg approval/payment time, success rate); unified Driver Wallet (Available → Salary / Referral Rewards / Bonuses / Other). Architecture already supports these via the ledger + salary-request model without redesign.

### Credits Operations Workspace — pilot-ready (no new build)

Growth → Credits is treated as an **Operations Workspace** (select org → review position → adjust → immutable ledger → verify balance), not a bare admin form. Ledger-driven via `admin_adjustment` / `increment_credit_wallet`; Source is derived from `type` (System / Admin / User).

**Deferred (usage-driven, after pilot):** short transaction Ref in the ledger table UI (`pulse_credit_transactions.id` already exists — display only, no schema change); adjustment preview (current → delta → new balance); CSV export of ledger / wallet history; activity filters (Grants / Deductions / System / Admin / User); Control Center org-level credit metrics (granted/deducted today, net issued, largest adjustments, low balances). Do not add preemptively.

### Admin Console — Pilot Ready (operations platform)

Select → Understand → Act → Verify across Credits / Referrals / Reward Rules / Boost Control Center / Verification / Team / Document Preview. Maturity aligned with Pulse Growth. Reward Rules & Boost Control Center refinements are usability/visibility only (no evaluation, settlement, delivery, or marketplace changes). Document Preview keeps original MIME + re-signable `storage_path`. Shared two-question change policy in `docs/PULSE_GROWTH_PLATFORM.md`. Verification checklist + post-pilot backlog in `docs/PILOT_ENTRY_VALIDATION.md`. **No pre-pilot UI expansion** — next priorities from operator experience.

**Lifecycle:** Architecture Complete → Implementation Complete → **Pilot Ready** → Operational Validation (ADR-010 → P1–P3) → Pilot Review → GA Decision. Both Growth and Admin Console are Pilot Ready under one freeze; **Pilot Entry is deferred** until ADR-010 (`organization_members` driver role + RLS hardening) ships and P1 passes. Do not re-scope to Independent-only without explicit business acceptance.

## 2.0.2 — Delivery Correctness & Platform Governance · January 2027

Corrective enhancements (not new capability): they make the original "reach" promise operationally true. Schema changes justified under the freeze as correctness fixes — a real campaign spent 500 credits for 0 impressions, 0 bids.

- Structured Delivery Engine: `reach_campaign_targets` (verified-first allocation), 40/40/20 wave pacing, no-bid escalation up to +20%, targeted `get_network_feed`, per-wave delivery panel (`20270107000000`)
- Campaign Snapshot Lifecycle: active campaigns survive source-story deletion, serving from the immutable snapshot; `source_deleted_at` transparency stamp + "Original story deleted — serving campaign snapshot" label; delete flows no longer cancel paid campaigns (`20270108000000`)
- Canonical delivery record: `reach_campaign_targets` carries released → viewed → bid → converted per (campaign, org); bids stamped by trigger, conversions in `convert_reach_referral`; delivery analytics read only from it (`20270108000000`)
- Driver Stories tab in the driver app (`app/(driver)/stories.tsx`): active driver-channel campaigns, recommendation flow, earnings link to existing wallet
- Naming: recommendation reward is customer-facing **"Driver Incentive"** (brief "Driver Tip" interim reverted — it's an escrow-backed incentive, not a gratuity)
- Governance: Four Platform Layers, Permanent Platform Principles 1–4 (immutable snapshots · one delivery truth · ledger-driven settlement · AI never transactional), Pilot Freeze, Pilot KPIs, Pilot Review Process — all in `docs/PULSE_GROWTH_PLATFORM.md`

## 2.0.1 — Operational Excellence · January 2027

UI polish + data-correctness fixes on the frozen v2.0 architecture. UI is now frozen too:
only bug fixes, accessibility, performance, and copy changes until pilot feedback says otherwise.

- Fix: cards showed a UUID fragment as the indent ID — now the real operational indent code (IND001-style), batch-enriched in the campaigns service
- Fix: "Est. Fare" showed the boost plan price — now the load's actual `rate_offer` (fallback: indent supplier target)
- Campaign detail rebuilt as Boost V2 Studio: breadcrumb header with indent reference, hero identity card, health & diagnostics with score ring, performance metrics + target reach, conversion pipeline funnel, Driver/Fleet preview toggle, Referral Escrow summary
- Campaign Timeline: Published → Waves → Escalation → End lifecycle stepper from existing delivery data
- Docs: `RUNBOOK.md` (production operations), Pilot Exit Criteria, evidence-gated roadmap

## 2.0.0 — Production Complete · January 2027

Boost V2 milestone. Architecture frozen. See `docs/PULSE_GROWTH_PLATFORM.md` for the full milestone and Definition of Done.

- Driver distribution: campaigns target fleet and/or driver story feeds (`20270102000000`)
- Stable trip identity via source indent snapshot (`20270101000000`)
- Dual driver participation derived from org membership (employed → recommend, independent → direct bid)
- Referral Escrow: reserved at publish, paid on conversion, auto-refunded on expiry/cancel (`20270102000000`)
- Driver reward payout in INR via existing `driver_ledger` (`20270103000000`)
- Fleet Owner Opportunities inbox with driver profile context (`20270104000000`)
- Priority scoring, structured driver intent, suggested rate, pre-filled bid on approval, decision funnel events (`20270105000000`)
- Campaign Health card + rules-based Smart Suggestions (client-side, customer-facing)
- Boost Control Center: internal operations dashboard in the admin console (`20270106000000`)

## 0.1 — Reach MVP · December 2026

Core architecture everything else extends: Reach engine, Credits, Wallet, Ledger, Campaigns, Admin adjustments, Platform IAM, Upgrade flow (`supabase/migrations/2026122*`).
