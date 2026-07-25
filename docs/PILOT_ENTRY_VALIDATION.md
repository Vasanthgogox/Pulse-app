# Pulse Growth — Pilot Entry Validation (P1–P3)

**Platform status**

| Product | Status |
|---|---|
| Pulse Growth Platform v2.0 | ⛔ **Pilot Entry blocked** — architecture / engines / intelligence / governance frozen and complete, but an open **wallet financial-integrity defect** (see § Wallet Financial Integrity) means the finance layer is not yet trustworthy |
| Admin Console | ✅ Pilot Ready (Credits, Referrals, Reward Rules, Control Center, Verification, Team, document preview recovery) — but Credits **operates on the defective wallet primitive**; adjustments must be re-verified after the fix |

**Mode:** operational rehearsal (not feature QA) · **Freeze:** both products under one Pilot Freeze (`docs/PULSE_GROWTH_PLATFORM.md`)  
**Rule:** execute gates **in order** — P1 → P2 → P3. Each depends on the previous.  
**Backlog stays out of this gate:** suppress “Upgrade to a higher tier” when already on max plan.

**Lifecycle:** Architecture Complete → Implementation Complete → Pilot Ready → **Operational Validation (this doc)** → Pilot Review → GA Decision.

**This document's ownership:** pilot entry criteria, validation gates (P1–P3), and rehearsal evidence. Architecture / governance / Final Sign-off → `docs/PULSE_GROWTH_PLATFORM.md`. Release history / deferred items → `docs/PULSE_GROWTH_CHANGELOG.md`. Unified change policy and Pilot Baseline live in the platform doc — this file is how you **prove** readiness to enter the pilot.

### Gate status (Pilot Entry)

| Gate | Status |
|---|---|
| **Wallet Financial Integrity** (`increment_credit_wallet`) | ⛔ Blocker — credits can be created without settlement; **independent of ADR-010** |
| **ADR-010** (authorization model) | ⛔ Blocker — Step 1 audit complete; matrix sign-off → implementation → then P1 |
| P1 – Driver Personas | ⛔ **Blocked by ADR-010** |
| P2 – Opportunity Inbox | Not Started (depends on P1) |
| P3 – Mobile Validation | Pending (after P2) |

**Pilot Entry is blocked by two independent gates.** Wallet Financial Integrity and ADR-010 share no root cause and no fix: ADR-010 is an authorization-model gap, the wallet defect is a financial-correctness defect in a shared primitive. **Resolving either one alone still leaves the platform unsuitable for pilot.** Both must clear.

Sequence: fix + reconcile the wallet primitive (can run in parallel with ADR-010) → complete ADR-010 → re-run P1 with evidence → P2 → P3 → reassess Pilot Entry. Correctness and security take precedence over schedule. Do **not** re-scope to Independent-only unless an explicit business decision with documented acceptance criteria is recorded.

When every gate below is Pass (and Runbook + Control Center + Pilot Review template are ready), the **pilot officially starts**. Until then: Pilot Ready architecture, **not** Pilot Entry.

---

## Evidence template (use for every scenario)

| Field | Fill in |
|---|---|
| **Scenario** | What was tested |
| **Expected Result** | Documented platform behaviour |
| **Actual Result** | What happened |
| **Evidence** | Screenshots, logs, ledger/DB rows |
| **Outcome** | Pass / Fail |
| **Follow-up** | Attention needed (if any) |

---

## Wallet Financial Integrity — Pilot Entry Blocker

**Status:** ⛔ Blocker · **Class:** financial correctness (value creation) · **Scope:** shared primitive, all credit callers · **Independent of ADR-010**

**Invariant violated:** a paid campaign can reach an active state without successful settlement, and credits can be created without consideration, because `increment_credit_wallet()` does not apply balance validation when the wallet row does not yet exist.

### Root cause

`public.increment_credit_wallet()` — current definition `supabase/migrations/20261228000000_reach_credits_admin_grant_and_payment_state.sql` (L120–185).

The function upserts. Only the **UPDATE** branch performs real arithmetic (`balance + p_amount`) and can therefore trip `pcw_balance_nonnegative` and raise `insufficient_credits`. The **INSERT** branch clamps with `GREATEST(p_amount, 0)`, so a negative amount inserts `balance = 0`, discards the debit, and passes the CHECK:

```
first transaction is negative → no wallet row → INSERT path
→ balance = GREATEST(-N, 0) = 0 → CHECK (balance >= 0) passes
→ debit silently discarded → ledger records the spend → caller succeeds
```

**Provenance:** not a regression. Present since the original `20261224010000_pulse_credits.sql` (L103–118) and copied verbatim into `20261228000000` while the authorization gate was reworked. The comment directly above the statement asserts the CHECK constraint "is the authoritative guard" — intent was documented correctly; the INSERT path never honoured it.

**Blast radius:** organisations whose **very first** credit transaction is a debit. First-time *earns* are unaffected; once a row exists, the UPDATE path enforces correctly. This is precisely the new-org onboarding path, i.e. the common pilot path — the narrow trigger raises severity, it does not reduce it.

### Impact is credit creation, not a free campaign

The escrow release path converts phantom reservations into real spendable credits, because release refunds `reach_campaigns.reward_reserved` unconditionally without checking that the wallet was ever debited:

| Step | Call | Effect |
|---|---|---|
| 1 | `publish_reach_campaign(… payment_method='money', driver_reward_enabled=true, reward_amount=1, reward_budget=N)` | `p_reward_budget` has **no upper bound** (validated only `>= reward_amount`) → `v_escrow = N`. Campaign inserted `status='active'`, `reward_reserved = N`. `increment_credit_wallet(org,'reserve_referral',-N)` takes the INSERT path → wallet created at `balance = 0`. `payment_method='money'` skips the `spend_reach` debit entirely, so no cash and no second wallet call. |
| 2 | `cancel_reach_campaign(campaign_id)` — granted to `authenticated`, permitted on `active`, caller need only be an org member | calls `fn_release_reach_referral_escrow` → `increment_credit_wallet(org,'referral_refund', +N)` → UPDATE path → `balance = 0 + N`. |

**Net:** N spendable credits from two RPCs, nothing paid, no wait for the expiry cron. The escrow ledger types are permitted (`20270102000000` L57), so nothing rolls back. One-shot per organisation (the wallet row then exists and later debits enforce correctly) — but **N is unbounded and organisations are self-serve**, and `fn_expire_reach_campaigns` reaches the same release path unattended. The comment at the escrow call site claims the opposite guarantee — that it "raises insufficient_credits (and rolls back the whole publish) if the wallet can't cover it" — which is false for first-time wallets.

### Invariants to enforce (all three)

Validation parity is necessary but **not sufficient** — the first-time negative insert violates three invariants at once and only the first has any guard today:

| # | Invariant | Current enforcement |
|---|---|---|
| 1 | `balance >= 0` | CHECK constraint exists; **bypassed on INSERT** |
| 2 | `balance = lifetime_earned - lifetime_spent` | **none** — insert writes `balance=0, lifetime_earned=0, lifetime_spent=N` |
| 3 | Ledger continuity: `balance_after = prior_balance + amount` | **none** — insert writes `amount=-N, balance_after=0` |

**Rule to implement:** wallet mutation must be validated identically regardless of whether the wallet row already exists, and the wallet must never record a spend it did not debit. First-time and subsequent transactions follow the same balance rules so insufficient-credit checks cannot be bypassed. Add 2 and 3 as constraints, not merely as corrected arithmetic — that is what prevents recurrence via future callers.

### Required regression (mandatory — shared primitive, not "especially")

Every caller of `increment_credit_wallet`, by function (note: `admin_adjustment` is a transaction *type*, not a caller):

| Caller | Path |
|---|---|
| `publish_reach_campaign` | `spend_reach` debit + `reserve_referral` escrow debit |
| `upgrade_reach_campaign` | incremental debit |
| `cancel_reach_campaign` → `fn_release_reach_referral_escrow` | `referral_refund` credit — **highest risk: converts corruption into credits** |
| `fn_expire_reach_campaigns` → `fn_release_reach_referral_escrow` | same helper, unattended via cron |
| `platform_approve_verification` | `earn_verification` credit |
| `increment_credit_wallet` (`admin_adjustment`) | admin console Credits panel, both directions |
| any future caller | must be covered by the constraints above, not by caller-side pre-checks |

### Reconciliation (fixing the function does not repair existing rows)

The corruption is durable and cheap to detect — treat this as an asset, not just a liability:

- Affected wallets: `balance <> lifetime_earned - lifetime_spent`.
- Affected ledger rows: `balance_after <> ` running sum of `amount` per org ordered by `created_at`.
- Any org that has already been through the release path holds **real outstanding credits** that were never funded.

Reconciliation must run before pilot entry; a code-only fix leaves already-written rows wrong.

### Exit criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Wallet primitive fixed — validation parity on INSERT and UPDATE | ☐ |
| 2 | Invariants 2 and 3 enforced as constraints | ☐ |
| 3 | Reconciliation run; affected wallets/ledger rows quantified and repaired | ☐ |
| 4 | Publish path verified (credits **and** money; reward enabled **and** disabled) | ☐ |
| 5 | Admin adjustment verified (both directions, first-time and existing wallet) | ☐ |
| 6 | Settlement paths verified (escrow reserve, escrow release, expiry cron, verification, referral) | ☐ |
| 7 | Unbounded `p_reward_budget` bounded or justified | ☐ |
| 8 | No financial-integrity regressions across all callers above | ☐ |
| 9 | ADR raised for the wallet invariants (`docs/decisions.md`) | ☐ |

**Gate:** ☐ Pass · Date: ________ · Reviewer: ________

**Allowed under Pilot Freeze** — financial correctness, not new product functionality (same basis as ADR-010).

---

## P1 — Driver Personas (highest priority)

**Goal:** identity and permission model behave correctly for every persona.  
**Execution order:** Independent → Fleet → Pending. Do not advance until the current persona is documented (Pass or agreed follow-up).  
**Started:** 2026-07-26

### Environment note (applies to all personas)

Live DB audit (`organization_members`):

| role | status | count |
|---|---|---|
| owner | active | 30 |
| dispatcher | active | 1 |
| member | active | 1 |
| **driver** | *any* | **0** |

Also: **38** `drivers` rows with `user_id` have **no** matching `organization_members` row (`role='driver'`). Accepted `driver_invites` exist (e.g. Raja, Kumar2, Jeeva) but do not create driver memberships that Stories/`resolveDriverParticipation` read.

**Implication:** every signed-in driver currently resolves to **`independent`**. Fleet and Pending personas cannot be live-validated. Classified under Fleet persona as **Blocker**.

#### Root cause (deeper than onboarding — confirmed against live schema)

1. **`organization_members` cannot hold drivers at all.** Constraint `chk_org_members_role` is
   `CHECK (role = ANY (ARRAY['owner','admin','member','dispatcher','finance']))` — **`'driver'` is not permitted**.
   Boost V2 reads `organization_members.role = 'driver'` in `20270102000000`, `20270104000000`,
   `20270105000000`, `20270107000000` (×2) plus `getDriverFleetMemberships` / `resolveDriverParticipation`.
   That predicate can never match on this database, so the driver personas were unreachable by construction —
   the accept-invite flow is not the only gap.

2. **Adding driver rows to `organization_members` would escalate privileges.** 100 RLS policies reference
   `organization_members`; **87 do not filter on `role`** — they treat *any* active membership row as staff.
   Affected policies include `driver_ledger` (ALL), `driver_salary_requests` (ALL),
   `entity_bank_accounts` (SELECT/INSERT/UPDATE/DELETE), `cashflow_forecast`, `client_risk_scores`,
   `event_store`, `activity_stream`, `bids` (INSERT/UPDATE), `connection_requests`.
   Inserting `role='driver', status='active'` would grant every fleet driver org-wide read/write on
   fleet finance and banking data.

**Resolution — ADR-010 accepted (`docs/decisions.md`). Pilot Entry blocker. Allowed under Pilot Freeze** (correctness + security; not new product functionality).

`organization_members` stays canonical for driver participation; Boost will **not** read from `drivers`, and no fallback chain is permitted. Implementation order (do not reorder — partial delivery = security regression):

1. **Step 1 inventory/matrix:** `docs/ADR-010-RLS-AUDIT.md` (complete — awaiting matrix sign-off).
2. Introduce `is_org_staff`; patch 87 role-blind OM policies + staff policies using `is_org_member` (~95).
3. Widen `chk_org_members_role` to allow `'driver'`.
4. Wire onboarding — invite sent → `pending`, accepted → `active`, `leave_fleet` → `inactive`.
5. Backfill the 38 existing linked drivers.
6. Re-run P1 (Independent screenshot + Fleet + Pending); proceed to P2 only after P1 passes.

**P1 stays blocked** until ADR-010 ships. Fleet and Pending personas are unvalidatable; every driver resolves to `independent`. **Do not start P2.** Do **not** re-scope the pilot to Independent-only without an explicit business decision and acceptance criteria.

---

### P1.1 Independent Driver

| Field | Capture |
|---|---|
| **Scenario** | Persona: Independent. Account: Sadam (`+919008008008`, profile `6e31cf96-…`). Has `drivers` row in AJIO but **no** `organization_members` with `role='driver'` → `resolveDriverParticipation` → `independent`. |
| **Expected** | Lands in driver app; Stories hero: independent copy. Can bid via org Pulse account path; **no** “Recommend to Fleet Owner”; **no** recommendation incentive CTA. No fleet Opportunities as a recommending driver. Refresh/reload keeps independent behaviour. |
| **Actual** | **DB:** confirmed no driver membership → independent. **Code (`DriverStoriesScreen`):** `canRecommend` false; no Recommend button; no Earn-on-conversion CTA; shows info pill *“Direct bidding runs through your organization's Pulse account”* (not a “Bid Now” button — differs from `driverStoryCta()` helper label “Bid Now”). Recommend sheet cannot open. |
| **Evidence** | SQL: 0 `organization_members` where `role='driver'`; Sadam has drivers row `4d04bec0-…` / org AJIO without OM driver row. Code: `getDriverFleetMemberships` filters `role='driver'`; Stories independent branch ~L367–372. **Live screenshot:** pending operator attach (sign in as `9008008008` → Stories). |
| **Outcome** | ☐ PASS / ☐ FAIL — **provisional PASS on permissions** (no recommend / no incentive leak) pending live screenshot of Stories + reload. **Observation (Medium):** docs/`driverStoryCta` say “Bid Now”; UI shows info pill only — no Stories bid CTA. |
| **Follow-up** | Attach live screenshot of Stories as Sadam (hero + card CTA). Decide whether Stories should show Bid Now or keep org-account messaging (product observation, not Blocker). |

**Gate P1.1:** ☐ Pass · Date: ________ · Tester: ________

---

### P1.2 Fleet Driver (Active membership)

| Field | Capture |
|---|---|
| **Scenario** | Persona: Active fleet driver. Requires `organization_members` with `role='driver'` and `status='active'` for the driver’s fleet org. |
| **Expected** | Stories: “Recommend to Fleet Owner”; incentive visible when campaign has Driver Incentive; cannot treat Stories as independent bid path; recommend → fleet Opportunities. |
| **Actual** | **Cannot execute live.** Zero active driver memberships in linked DB. Drivers with accepted invites (Raja / Kumar2 / Jeeva / etc.) still resolve as **independent** in Stories because participation ignores `drivers` + `driver_invites`. |
| **Evidence** | SQL buckets: `active_driver=0`, `drivers_with_user_no_om=38`. Recommend RPC / inbox also guard on `organization_members.role='driver'`. |
| **Outcome** | **FAIL — Blocker** for P1 completion (persona unreachable). |
| **Follow-up** | **Blocker:** Align participation with how fleet employment actually works (`drivers` + accepted invite) **or** ensure accept-invite creates `organization_members (role=driver, status=active)`. Until fixed or seeded for rehearsal, P1 cannot exit. Do not start P2. |

**Gate P1.2:** ☐ Pass · **Blocked** · Severity: **Blocker**

---

### P1.3 Pending Fleet Membership

| Field | Capture |
|---|---|
| **Scenario** | Persona: Pending/invited membership. Requires `organization_members` with `role='driver'` and `status` in (`pending`,`invited`). |
| **Expected** | Stories: “Join your fleet to participate”; cannot recommend; cannot bid as fleet driver. |
| **Actual** | **Cannot execute live.** `pending_or_invited` driver memberships = **0**. No candidate account. |
| **Evidence** | Same OM audit as above. |
| **Outcome** | **FAIL — Blocker** (blocked by same membership gap as P1.2). |
| **Follow-up** | Same as P1.2. After membership path exists, create one pending membership and re-run this record. |

**Gate P1.3:** ☐ Pass · **Blocked** · Severity: **Blocker**

---

### P1 summary

| Persona | Outcome | Severity if fail |
|---|---|---|
| Independent | Provisional PASS (permissions) — live screenshot still needed | Observation Medium: Bid Now vs info pill |
| Fleet (active) | **FAIL — unreachable** | **Blocker** |
| Pending | **FAIL — unreachable** | **Blocker** |

**Gate P1:** ☐ Pass (all three) · **⛔ Blocked by ADR-010** — unresolved correctness/security blocker. · Date: ________ · Tester: ________

**Do not proceed to P2 until P1 exit criteria met** (all three records complete, no unresolved Blocker, evidence attached).

---

## P2 — Opportunity Inbox end-to-end

**Status:** Not Started (depends on P1).

**Goal:** one real recommendation through Marketplace ↔ Financial Engines.

Complete in order:

| Step | Expected | Outcome | Evidence |
|---|---|---|---|
| Driver recommends | `reach_referrals` row `recommended` | ☐ | |
| Fleet Opportunity Inbox | Recommendation visible with confidence score | ☐ | |
| Reason / suggested rate | Intent chips + rate shown | ☐ | |
| Create bid | Referral → `bid_submitted`; bid linked | ☐ | |
| Trip award | Trip created / awarded from bid | ☐ | |
| Referral conversion | `convert_reach_referral` → `rewarded` | ☐ | |
| Reward ledger | `driver_ledger` type `reward`, `reference_type=reach_referral` | ☐ | |

**Gate P2:** ☐ Pass · Referral id: ________ · Date: ________ · Tester: ________

---

## P3 — Mobile verification (one focused pass)

**Status:** Pending (after P2).

**Goal:** usability at a typical narrow width — not device certification.

| Surface | Usable? | Notes |
|---|---|---|
| Reach Home | ☐ | |
| Story cards | ☐ | |
| Campaign Timeline | ☐ | |
| Opportunity card | ☐ | |
| Driver earnings card | ☐ | |
| Bottom sheets | ☐ | |
| Credit adjustment dialog (if used on mobile) | ☐ / N/A | |

**Width used:** ________ · **Gate P3:** ☐ Pass · Date: ________ · Tester: ________

---

## Pilot Entry Criteria (all required)

| # | Criterion | Status |
|---|---|---|
| 1 | P1 passes | ⛔ Blocked by ADR-010 |
| 2 | P2 passes | Not Started (depends on P1) |
| 3 | P3 passes | Pending |
| 4 | Runbook executed successfully once (`docs/RUNBOOK.md` §1–5) | ☐ |
| 5 | Control Center operational (`get_boost_control_center`) | ☐ |
| 6 | First Pilot Review template ready (`docs/PULSE_GROWTH_PLATFORM.md` § Pilot Review Process) | ☐ |
| — | **Wallet Financial Integrity cleared** (fix → constraints → reconciliation → caller regression) | ⛔ Required — independent of ADR-010 |
| — | **ADR-010 implemented** (RLS patch → role CHECK → onboarding → backfill) | ⛔ Required before P1 can pass |

**Pilot officially started:** ☐ No — blocked by **two independent gates** (Wallet Financial Integrity, ADR-010) plus P1–P3 · Date: ________ · Sign-off: ________

**Governance:** Do not re-scope to Independent-only without explicit business acceptance criteria. Entering pilot with two personas that cannot exist, and a known role/RLS mismatch, undermines pilot evidence quality. Entering pilot while credits can be created without settlement invalidates **every** financial metric the pilot is meant to produce — no amount of persona coverage compensates for an untrustworthy ledger.
---

## Pilot vs General Availability

| Milestone | Question it answers |
|---|---|
| **Pilot** | Does the platform work correctly with real customers? |
| **GA** | Has it demonstrated consistent operational reliability across multiple customers and campaigns? |

Success criteria for the **pilot program** (not the engineering project):

- Customers complete campaigns successfully  
- Fleet owners receive quality opportunities  
- Drivers understand and use incentives  
- Operations support the platform using the Runbook  
- Pilot Reviews produce measurable insights for the next iteration  

When P1–P3 are complete, the platform moves from **architecturally complete** to **operationally validated**.

---

## Admin Console — Pilot Ready (operations platform)

Consistent operational loop across Credits · Referrals · Reward Rules · Boost Control Center · Verification · Team · Document Preview:

```
Select → Understand (KPIs / context) → Act → Verify (activity / preview / ledger)
```

**Status:** Admin Console has reached the same maturity as Pulse Growth — operational workflows complete, financial/governance principles preserved, enterprise workspace patterns consistent. Transitioned from active engineering initiative to **pilot operations platform**. Shared change policy with Growth: correctness first; otherwise ADR-backed evidence; otherwise backlog (`docs/PULSE_GROWTH_PLATFORM.md` § Change control).

| Workspace | Status |
|---|---|
| Verification | ✅ Pilot Ready |
| Team | ✅ Pilot Ready |
| Document Preview | ✅ Pilot Ready (refresh signed URL, original MIME, Open/Download) |
| Credits | ✅ Pilot Ready |
| Referrals | ✅ Pilot Ready |
| Reward Rules | ✅ Pilot Ready (dirty-state, save feedback, activate/deactivate, ledger-correction guidance — usability only; evaluation & accounting unchanged) |
| Boost Control Center | ✅ Pilot Ready (KPI health, manual refresh, lane tables, loading/empty/error — visibility only; delivery/health/marketplace behaviour unchanged) |

**Governance:** no pre-pilot UI expansion. Collect friction during real KYC, campaigns, and support. Post-pilot / GA: evidence-driven refinements only. Success = operators complete KYC efficiently and support resolves issues with existing tooling — not new screens.

### Verification workspace checklist (pilot validation)

| Scenario | Expected result | Outcome | Evidence |
|---|---|---|---|
| Open image | Inline preview renders | ☐ | |
| Open PDF | Embedded PDF renders | ☐ | |
| Signed URL expires | Refresh generates a new URL | ☐ | |
| Missing URL, valid storage path | Auto-refresh restores preview | ☐ | |
| Download | Original file downloads | ☐ | |
| Open | Original file opens | ☐ | |
| Long profile | Layout remains stable | ☐ | |
| No document | Empty state shown | ☐ | |

**Gate:** ☐ Pass · Date: ________ · Tester: ________

### Post-pilot backlog (admin console — not blockers)

| Item | Notes |
|---|---|
| Verification queue metrics | Header: Pending KYC, Approved today, Rejected today, Avg verification time |
| Document metadata | Uploaded date · size · MIME (e.g. PDF) for support |
| Preview audit | Log preview opened / download initiated — only if clear compliance/support need |
| Keyboard shortcuts | ↑↓ rows, Enter preview, R refresh, Esc close — productivity only |
