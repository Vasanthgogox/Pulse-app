# Chat Slow-Load — FINAL FALSIFICATION Verdict (Live Evidence)

**Date:** 2026-07-13 (post-restart, healthy pool). **No changes made.**
**This pass materially revised the confidence level. Read Part 4 first.**

---

## HEADLINE: the 20× test falsified my "every request pays 2.5-6s" claim

The single most decisive test (Part 4) shows the cost is paid **ONCE PER WARM BACKEND**, then collapses 170×. This changes the verdict from "PROVEN" to **STRONGLY SUPPORTED**, with a specific remaining gap.

---

## PART 1 — Active SELECT policies on trip_messages (live `pg_policy`)

| oid | name | roles | perm | cmd | expr shape |
|---|---|---|---|---|---|
| 591270 | `trip_messages_select` | `{authenticated}` | permissive | SELECT | `private.user_can_read_trip_message(org, conv)` |
| 591559 | `Linked client org reads trip messages` | `{-}` = PUBLIC | permissive | SELECT | 4-table EXISTS (clients) |
| 591561 | `Linked supplier org reads trip messages for supplied trips` | PUBLIC | permissive | SELECT | 4-table + 5-table (direct_quotes) OR |
| 591563 | `Linked supplier via indent reads trip messages` | PUBLIC | permissive | SELECT | 5-table EXISTS (direct_quotes) |
| 591565 | `organization_members_can_manage_trip_messages` | PUBLIC | permissive | ALL (incl SELECT) | 1-table EXISTS (org_members) |
| 591271 | `trip_messages_org_write` | `{authenticated}` | permissive | ALL (incl SELECT) | 1-table EXISTS (org_members) |

`{-}` = `polroles {0}` = PUBLIC (applies to authenticated & anon). **SIX permissive policies touch SELECT** (4 pure-SELECT + 2 ALL) — even more OR branches than previously stated. All active. WITH CHECK is null for all SELECT-applicable branches (SELECT has no WITH CHECK). No RESTRICTIVE policies exist. **Confirmed: the 3 legacy multi-join policies (591559/561/563) are active — migration 20260614190013's DROP did not take effect.**

## PART 2 — Per-policy planner complexity

Exact per-policy node attribution is **impossible** and I state why: PostgreSQL merges all permissive USING expressions into a **single OR'd security-barrier qual** on the base relation before path search, then plans the whole thing as one tree. `pg_stat_statements`/EXPLAIN report the *merged* plan, not per-policy sub-costs. Measured proxies instead:
- Full 6-policy plan (EXPLAIN ANALYZE JSON): **332 Result, 259 Index Scan, 144 Nested Loop, 30 Index-Only, 22 Seq Scan, 498 SubPlan refs, 664 InitPlan** — ~1,400 nodes.
- The 3 stale policies reference `direct_quotes`, `indents`, `suppliers`, `clients` (absent from the function policy and the 2 org-member policies) — so the join-tree explosion is attributable to them by construction: no other SELECT policy references those tables.

## PART 3 — WHY planning is expensive (mechanism, cold path)

From the plan fragments: the planner must, for the OR'd security-barrier qual, generate **parameterized subplans of each policy's EXISTS join tree, per base row / per array element**. The `conversation_id = ANY($array)` + 6 OR'd policies → the planner explores join orders for each EXISTS (trip_conversations→trips→{clients|suppliers|indents→direct_quotes}→organization_members) and materializes them as **498 SubPlans / 664 InitPlans**. The dominant mechanism is **security-barrier OR-qual expansion + repeated EXISTS subplan planning across a wide join search**, not execution. Cold planning = 2,201-6,050 ms (measured 3 ways).

## PART 4 — Statistical proof (20× consecutive, SAME warm session) ★ DECISIVE

Total per-query wall time (planning+execution), same query, same backend:

| Run | ms | Run | ms |
|---|---|---|---|
| 1 | **5,693.5** | 11 | 33.8 |
| 2 | 375.0 | 12 | 33.3 |
| 3 | 65.9 | 13 | 33.6 |
| 4 | 48.3 | 14 | 33.3 |
| 5 | 47.5 | 15 | 33.8 |
| 6 | 34.5 | 16 | 35.8 |
| 7 | 42.1 | 17 | 39.3 |
| 8 | 37.2 | 18 | 35.0 |
| 9 | 33.2 | 19 | 33.8 |
| 10 | 34.6 | 20 | 33.6 |

**min 33.2 · max 5,693.5 · avg ~330 · median ~34.5 · stddev ~1,255**

**Interpretation (this falsifies the strong form of my claim):** the expensive cost is paid **ONCE** (run 1, cold: 5.7s), then drops **170×** to a ~34ms steady state. This is per-backend **relcache + plan-cache warmup**, NOT a per-request 2.5-6s tax. Within a warm backend the query is cheap.

**Caching is REPEATED PER COLD BACKEND, not per request.** Evidence it's session-local warmup: `n_mod_since_analyze = 0` on all involved tables (no data churn → no plan invalidation), so a warm backend stays warm. PostgREST holds **2 long-lived backends** (Part 6) direct to Postgres (not per-request PgBouncer connections for its data path), so in steady state most requests should hit warm backends at ~34ms.

**MCP/PgBouncer limitation stated explicitly:** I could not drive real PostgREST HTTP requests through its actual 2-backend pool to measure the *production* warm/cold ratio. The 20× test used one MCP session (one backend). Whether production requests predominantly hit warm backends (cheap) or repeatedly hit cold ones (expensive) is **not directly measured** — it is the central remaining gap.

## PART 5 — The 31ms (RLS off) vs 2,200-6,000ms (RLS on, cold) gap

RLS OFF (table owner): base query = `Limit→Sort→Index Scan using idx_trip_messages_conv_type`, 4 nodes, **31ms planning**. RLS ON (cold): the planner additionally must, before path selection, inject the 6 permissive USING quals as an OR'd security-barrier predicate, then for the 3 stale policies expand and cost 3-5 table join trees each as EXISTS subplans, exploring join orders → ~1,400 nodes, 498 SubPlans. The 70-190× gap = the cost of **first-time planning of that inlined multi-policy join forest**. Once cached in the backend's plan cache, subsequent identical statements skip re-planning → 34ms (Part 4).

## PART 6 — Strongest arguments AGAINST the stale-policy hypothesis

| Alternative | Evidence verdict |
|---|---|
| **Warm-backend caching means stale policies are NOT the practical cause** | **SUPPORTED as a partial counter** — Part 4 proves steady-state is 34ms. IF production backends stay warm, the stale policies cost ~one 5.7s hit per backend lifetime, not per request. This is the strongest argument against the *severity* of the hypothesis. |
| Generic vs custom plans (array param) | **SUPPORTS hypothesis** — PREPARE/EXECUTE showed 6,050ms cold planning; the array `ANY($1)` forces custom-plan re-planning that interacts badly with the policy forest. Contributes to cold cost. |
| PostgREST/PgBouncer per-request cold connections | **INCONCLUSIVE — the key gap.** If PostgREST's 2 backends churn or are recycled, each recycle pays 5.7s. Not measured live. |
| Planner bug | **Not supported** — behavior (cold-expensive, warm-cheap) is normal PG plan-cache behavior, not a bug. |
| Statistics/cardinality | **Not supported** — `n_mod_since_analyze=0`; estimates aren't drifting. |
| Index misestimation | **Disproved** — base scan uses the correct covering index; 31ms RLS-off proves the base path is optimal. |
| SECURITY DEFINER effects | **Neutral** — the function is opaque (0.04ms planning, 312ms exec measured); it is not the planning-cost source. |
| Bad row estimates | **Not supported** — plan estimates rows=1, matches reality. |

## PART 7 — Final confidence assessment

### Verdict: **(B) Root cause STRONGLY SUPPORTED** — not PROVEN.

**Why not (A):** the 20× test proved the expensive path is **cold-only** (5.7s once, then 34ms). "PROVEN" would require showing production requests actually pay the cold cost repeatedly (i.e., PostgREST backends going cold under real load / connection churn), which I could not measure. The severity link between "stale policies exist" and "sustained pool exhaustion" depends on that warm/cold behavior.

**What IS proven:**
- Stale multi-join SELECT policies are active (live catalog, 6 permissive SELECT-applicable policies).
- They are expanded into the rewritten plan (~1,400 nodes, 498 SubPlans; only they reference direct_quotes/indents/suppliers/clients).
- They cause the cold-planning cost (RLS-off 31ms vs RLS-on cold 2,201-6,050ms; function alone 0.04ms planning).
- Base indexing, data volume, cardinality, planner bug, and the helper function are all ruled out.

**What is NOT proven (remaining gaps):**
1. **Warm/cold ratio of real PostgREST requests** — the central gap. 34ms warm vs 5.7s cold; which dominates production is unmeasured. Requires driving real HTTP traffic + per-backend correlation (would risk re-saturation).
2. **Exact residual after removing ONLY the 3 stale policies** — cannot measure without dropping them (forbidden). RLS-off (31ms) proves policies-in-aggregate, not stale-only delta.
3. **Whether the original incident's 162-216s hangs were cold-planning pile-up or lock/contention under pool pressure** — the pre-restart capture showed `wait_event=null` (CPU, consistent with planning), but I cannot now reproduce the exact 200s state to confirm it was cold-plan contention vs. something else.
4. **PgBouncer pooling mode** for any non-PostgREST path — not confirmed.

**Honest summary:** the stale policies are real, active, and demonstrably cause a severe **cold-plan** cost. Whether that translates to the observed sustained outage depends on production warm/cold backend behavior, which remains unmeasured. Confidence: **STRONGLY SUPPORTED, not PROVEN.**
