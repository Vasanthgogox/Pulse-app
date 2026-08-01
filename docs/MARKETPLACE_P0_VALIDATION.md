# Marketplace M0 (P0) — Release checklist / go–no-go

**Exit rule:** A platform milestone is complete only when **engineering**, **product**, and **customer confidence** all agree.  
**Operating plan:** `docs/MARKETPLACE_NEXT_OPERATING_PLAN.md`  
**Observations / scores / M2 matrix:** `scripts/marketplace/VALIDATION_OBSERVATIONS.md`  
**M1 consistency:** `docs/MARKETPLACE_M1_CONSISTENCY_CHECKLIST.md`  
**Ongoing releases:** `docs/MARKETPLACE_RELEASE_CHECKLIST.md`

| Gate | Owner | Status | Notes |
|------|-------|--------|-------|
| 1 — Commercial lifetime | QA / Product | ✅ Pass | Backend + dual-clock SQL proven; app criteria below |
| 2 — Snapshot completeness | QA / Product | ⬜ | Branch B + six-dimension scores |
| 3 — Parallel bid stability | Engineering | ✅ Pass | Concurrent harness 10/25/50 — 100% success (2026-08-01) |
| 4 — End-to-end journey | Product | ⬜ | Scenarios 1–4 as expected |
| M1 consistency matrix | Engineering / QA | ⬜ | Five surfaces — architectural consistency |
| Customer confidence | Product | ⬜ | Six-dimension average ≥ 4/5; no unresolved breaks |
| M2 priorities agreed | Product + Eng | ⬜ | Impact × effort matrix |
| PO ₹10 lakh trust | Product owner | ⬜ | Must be **Yes** |

When all are ✅ → declare **Marketplace Platform v1** (below) → stop reopening foundations → M2 UX cadence.

---

## Marketplace Platform v1 — declaration (fill when closing)

> **Marketplace Platform v1**  
> Commercial truth centralized. · Operational lifecycle validated. · Consumer consistency verified. · Customer trust established.

| Field | Value |
|-------|--------|
| Declared date | |
| Engineering signer | |
| Product signer | |
| PO ₹10L = Yes | ☐ |
| Session score average (≥4.0) | |
| Next: Week 1 validation/KPI → Weeks 2–3 Receiving Bids Workspace → Week 4 measure Views→Bids / Bids→Awards | ☐ Understood |

Future investment: **UX, intelligence, business growth** — not additional platform architecture.

---

## Gate 1 — Commercial lifetime ✅

**Objective:** A load stays discoverable until the commercial lifecycle ends.

| Scenario | Expected | Status |
|----------|----------|--------|
| Publish | Appears in Feed, Story, Load Center | ✅ |
| Supplier A bids | Still visible to B & C | ✅ |
| Supplier B bids | Still visible | ✅ |
| Leave open >24h | Still visible because indent is open | ✅ |
| Award | Story disappears everywhere (non-owner market) | ✅ |
| Cancel / Withdraw | Story disappears | ✅ |
| Completed | Story archived | ✅ |

**Pass condition:** No supplier loses visibility before award.

**Evidence (engineering, linked DB 2026-08-01):** 24/29 open LOAD stories past `expires_at`/24h still `indent_open_for_marketplace_bids`; client expiry auto-kill removed; award trigger `trg_indents_deactivate_linked_posts` present. Product/QA confirmed app behaviour for this gate.

---

## Gate 2 — Snapshot completeness ⬜

**Runbook:** `scripts/marketplace/GATE2_BRANCH_B_RUNBOOK.md`  
**List candidates:** `npm run marketplace:gate2-candidates`

Force Branch B (deactivate post; keep campaign + indent open) and verify in UI:

| Field | Required |
|-------|----------|
| Target price | Visible (never `—` while bidding open) |
| Material | Visible |
| Pickup | Visible |
| Destination | Visible |
| Vehicle | Visible |
| Bid CTA | Present for eligible non-bidders |
| Sponsored styling | Present if campaign |
| Feed vs Story detail | Same commercial price |
| Bid submission | Succeeds |
| Award | Removes opportunity |

**Success:** Branch B is visually indistinguishable from a normal opportunity except Sponsored treatment.

**Fail if:** Sponsored + Price: — ; or Sponsored + price but **no** Bid while indent open.

---

## Gate 3 — Parallel bid stability ✅

**Harness (keep forever / regression):** `npm run marketplace:gate3-harness`  
Requires migration `20270130120000_marketplace_bid_harness_rpc.sql` (pushed) + service role key (`SUPABASE_SERVICE_ROLE_KEY` or `service_role_key` in `.env`).

```bash
npm run marketplace:gate3-harness        # 10, 25, 50
npm run marketplace:gate3-harness:25
HARNESS_POST_ID=<uuid> npm run marketplace:gate3-harness:50
```

Reports land in `scripts/marketplace/reports/gate3-*.json`.

| Concurrent | Success % | avg / p50 / p95 ms | Feed p95 ms | Dup/update | Errors | Status |
|------------|-----------|--------------------|-------------|------------|--------|--------|
| 10 | 100% | 667 / 591 / 1247 | 946 | 0 | 0 | ✅ |
| 25 | 100% | 735 / 747 / 1328 | 630 | 0 | 0 | ✅ |
| 50 | 100% | 1423 / 1369 / 2718 | 543 | 16* | 0 | ✅ |

\*50 level: DB had 34 unique bidder orgs; 16 slots padded (same-org concurrent upsert) — exercises idempotency. Report: `scripts/marketplace/reports/gate3-*.json`.

**Lock waits / pool utilization:** not exposed via PostgREST; re-check in Supabase Dashboard → Database → Reports (or `pg_stat_activity` / pooler metrics) while re-running if latency spikes. Client-side RPC success + p95 is the Gate 3 acceptance bar.

**Accept:** 100% success (no unexpected RPC failures); latency stable under expected load. Re-run this harness before releasing bidding / campaigns / visibility / pricing / notification changes.

**Not a pass:** sequential SQL probe only.

---

## Gate 4 — End-to-end journey ⬜

**Runbook:** `scripts/marketplace/GATE4_THREE_ORG_JOURNEY.md`  
**Observations:** `scripts/marketplace/VALIDATION_OBSERVATIONS.md`

| Scenario | Focus |
|----------|--------|
| 1 Publish | Feed · Story · Load Center · price · Open Market consistent |
| 2 Competition | Visible · both bids · Network/Marketplace tags · still accepting bids |
| 3 Award | Story closes · bids inactive · trip · execution · no stale Bid Now |
| 3.5 Award Notification & Winner Journey | Winning supplier's entry point into execution — see **P0-4** below |
| 4 Completion | Marketplace closes · trip complete · history · VBP groundwork |

After each scenario: score **Discovery · Clarity · Confidence · Decision Making · Execution · Trust** (1–5) and answer **₹10 lakh trust?** Log in `VALIDATION_OBSERVATIONS.md`. Rank M2 via impact × effort matrix — not a dump of ideas.

### P0-4 — Awarded supplier has no execution entry point ⭐⭐⭐⭐⭐

**Confirmed by code inspection (not yet by walkthrough):** `useAwardQuote.ts` only toasts the awarding org; nothing notifies or pushes toward the winning supplier when `direct_quotes.status` becomes `accepted`, and no notification table/trigger exists for it anywhere in the migrations. A passive "Awarded"/"Claimed" tab already exists in Load Center, but nothing surfaces it to the winner proactively.

**Symptoms:** award succeeds, winning supplier doesn't know, no obvious Assigned Loads entry point, Marketplace appears finished from the supplier's side, trip never starts unless the supplier happens to dig through tabs.

**Do not fix reactively.** Run Scenario 3.5 first and record where real testers *actually* look for the award, unprompted. If several converge on the same surface (Dashboard, My Trips, etc.), that observation — not a guess — decides where the Marketplace → Execution Workspace handoff belongs. This is M2 input (`docs/MARKETPLACE_DOMAIN.md`'s Commerce Network / conversion UX track), not something to patch with a notification bolted onto the current architecture before the real landing spot is known.

---

## Platform close → Marketplace Platform v1

**Exit rule:** Engineering + Product + Customer confidence must **all** agree — or the milestone stays open (experience not yet trustworthy, not “more architecture”).

- [ ] **Engineering:** M1 consistency matrix passes  
- [ ] **Product:** Scenarios 1–4 behave as expected  
- [ ] **Customer:** Six-dimension average ≥ 4/5; no unresolved confidence breaks  
- [ ] **Customer:** Product owner **Yes** on ₹10 lakh trust  
- [ ] Top M2 priorities documented and agreed  

Then fill the **Marketplace Platform v1** declaration block at the top of this file.

**Feature intake (in order):** (1) Which funnel KPI? (2) Which hesitation does this remove? (3) Can it consume the existing platform? — only if (3) is no, discuss extending the platform.

**Post-v1 cadence:** Week 1 validation/KPI → Weeks 2–3 Receiving Bids Workspace first → Week 4 measure Views→Bids and Bids→Awards → repeat.

---

## After v1 — roadmap

See `docs/MARKETPLACE_NEXT_OPERATING_PLAN.md`.

| Phase | Name | Status |
|-------|------|--------|
| **1** | Validation + M1 matrix + PO trust (≥4 avg) | ▶️ Now |
| **2 / M2** | Workspace → compare → progressive story → live market | 🔒 After v1 |
| **3** | Driver Mission + Dispatcher Fleet Health | 🔒 |
| **4** | Funnel metrics before ranking / finance | 🔒 |

Supporting SQL: `scripts/sql/p0_validate_*.sql`, `scripts/sql/p0_concurrency_probe.sql`.

**Regression suite (keep forever):** `supabase/tests/marketplace_visibility_predicate.sql` — self-contained, asserts with `RAISE EXCEPTION` (fails loudly, CI-safe), rolls back so it leaves no trace. Covers `indent_open_for_marketplace_bids()` across all ten indent statuses, Branch A (live post, open + awarded), Branch B (hard-deleted post, open + awarded), manual-inactive-post recovery, and bid-allowed/bid-rejected. Protects the one predicate every current and future Marketplace consumer (`CommercialOpportunity`, M2+ ranking/search/recommendations) will depend on — re-run this whenever `indent_open_for_marketplace_bids()`, `get_network_feed()`, or `submit_pulse_bid_with_direct_quote()` change, the same discipline as `deriveTripStage()`'s test coverage in Trip Operations.

```bash
supabase start && supabase db reset   # or apply migrations through 20270130120000
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" \
  -v ON_ERROR_STOP=1 -f supabase/tests/marketplace_visibility_predicate.sql
```
