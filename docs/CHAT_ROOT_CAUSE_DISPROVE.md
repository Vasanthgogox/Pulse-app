# Chat Slow-Load — DISPROVE-Mode Verification (Live Evidence)

**Date:** 2026-07-13 (post-restart, healthy pool). **No changes made.**
**Goal:** attempt to falsify the "stale RLS policies" root cause. Every number below is from the LIVE DB.

---

## Corrections to my prior report (I was partly wrong)

1. **"EXPLAIN ANALYZE times out"** — WRONG as stated. On a *healthy* pool it completes (~3.8s). The earlier timeout was a **pool-contention symptom**, not the query being intrinsically infinite. Corrected below.
2. **"Execution is trivial (~19ms)"** — WRONG for the full query. That 19ms was one isolated policy. The full 4-policy query executes in **1,277ms**. Execution is NOT trivial; planning dominates but execution is also heavy.
3. **"Stale policies are individually slow"** — IMPRECISE. Standalone they plan in ~99ms. The pathology is the **combination** (base RLS + 4 OR'd policies + array param + SubPlan/InitPlan fan-out), proven by the RLS-on-vs-off A/B.

The core hypothesis **survives** — but stated precisely now.

---

## PART 1-2 — Stale policies are active & expanded (evidence)

Live `pg_policies` (Part 1): `trip_messages` has **4 active SELECT policies** — `trip_messages_select` (→ `private.user_can_read_trip_message`, role authenticated) + 3 legacy multi-join policies (`Linked client org…`, `Linked supplier org…for supplied trips`, `Linked supplier via indent…`), all role `{public}` ⊇ authenticated, all `PERMISSIVE`. Migration `20260614190013` issued `DROP POLICY IF EXISTS` for them; **the live catalog proves they still exist.**

Rewritten-query expansion (Part 2): the full `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)` plan of the exact R2 query is **708,260 chars**, containing **332 Result nodes, 259 Index Scans, 144 Nested Loops, 30 Index-Only Scans, 22 Seq Scans, 498 SubPlan references**. Table refs inside the rewritten plan: `organization_members` ×272, `indents` ×78, `direct_quotes` ×60, `suppliers`/`clients` ×50. The stale policies ARE expanded and inlined into the rewritten query. (Full raw plan saved to the tool-output file referenced in session.)

## PART 3 — Planning vs execution, separated (exact R2 query, authenticated user)

| Measurement | Planning | Execution |
|---|---|---|
| `EXPLAIN ANALYZE` (2 convs, full) | **2,533 ms** | **1,277 ms** |
| plain `EXPLAIN` (1 conv, no exec) | **2,201 ms** | — (not executed) |
| `PREPARE`/`EXECUTE` custom plan | **6,050 ms** | 191 ms |

Buffers: shared hit ≈3,643 blocks across the plan. Rows: 1 (there are no media-preview rows for these convs). **Planning is 2.2-6.0s; execution 0.2-1.3s. Planning dominates in every method.**

## PART 4 — Is planning cached or per-request?

Plain `EXPLAIN` (planning only, never executes) returns **2,201 ms** — i.e. planning cost exists independent of execution and is incurred whenever the statement is planned. PostgREST runs through PgBouncer transaction-mode pooling, where session-level prepared-statement plan caching does not persist across pooled connections, so each request re-plans. (I could not persist a `PREPARE` across MCP calls to demonstrate cross-request reuse directly — see "missing evidence".) Evidence shows planning cost is real and large; whether any caching layer amortizes it across requests is the one unproven link.

## PART 5-7 — Which is slower: the function or the stale policies? (the decisive test)

**A/B on the EXACT same base query — the cleanest possible isolation:**

| Context | Planning Time | Plan shape |
|---|---|---|
| **RLS bypassed** (table owner, no policies) | **31 ms** | `Limit→Sort→Index Scan using idx_trip_messages_conv_type` (4 nodes) |
| **RLS active** (authenticated, all 4 policies) | **2,201-6,050 ms** | ~1,400 nodes, 498 SubPlans |

→ **RLS policy expansion adds ~2,170-6,020 ms of planning (70-190×).** The base query is trivial and optimally indexed.

**The fast function measured alone** (`private.user_can_read_trip_message`, SECURITY DEFINER, as postgres with real uid claim):
- **Planning: 0.044 ms** (opaque black-box to caller planner — exactly as designed)
- **Execution: 312 ms**, 3,137 buffer hits.

**Conclusion of Part 7:** the function contributes **~0 planning + 312 ms exec**. The 2,200-6,050 ms planning cost is therefore **NOT the function** — it is the **three stale inlined multi-join policies**, whose join trees the planner must expand inline (the function is opaque and cannot cause planning cost). The function is doing its job; the stale policies are the planning-cost source. This is the exact cost the migration intended to remove by dropping them.

## PART 4 (node/join detail per query)
Full R2 plan: Nested Loops 144, Index Scans 259, Seq Scans 22, Index-Only 30, SubPlans 498, InitPlans 664. Standalone stale-policy EXISTS pair: 99 ms planning (fast in isolation — the explosion is combinatorial in the full query).

## PART 4 index verification
Base scan uses **`idx_trip_messages_conv_type (conversation_id, message_type, created_at DESC)`** — optimal. Indexing is not implicated (confirmed by the 31ms RLS-off plan using the same index).

## PART 8-9 — Pool exhaustion & duplicate queries

Not re-reproduced live this pass (would require driving the running app and re-saturating the pool, risking another outage). **Established from prior evidence:** pre-restart `pg_stat_activity` captured 3 concurrent identical R2 `trip_messages` queries at 162/188/216s; the frontend retry/poll/reconnect duplication mechanism is proven from code (`CHAT_INVESTIGATION.md` §8). The per-query cost proven here (2.2-6.0s planning) × concurrent duplicates readily exceeds the 60-connection nano pool. The causal link (slow RLS → per-query seconds → concurrent copies → pool exhaustion) is consistent and evidenced, but a **fresh 3×30s live browser+`pg_stat_activity` correlation was not performed this pass**.

---

## PART 10 — Final verdict

| Required for "proven" | Status |
|---|---|
| ✓ stale policies are active | **PROVEN** — live `pg_policies`, 4 SELECT policies |
| ✓ expanded into rewritten query | **PROVEN** — 708KB plan, 498 SubPlans, stale-policy tables inlined |
| ✓ dominate planning or execution | **PROVEN** — RLS-off 31ms vs RLS-on 2,201-6,050ms planning; function alone 0.04ms planning |
| ✓ removing them materially reduces cost | **PROVEN by proxy** — RLS-off (no policies) = 31ms; but I did NOT drop *only* the stale ones (no changes allowed), so the exact residual with only the function-policy active is inferred, not measured |
| ✓ explain pool exhaustion | **SUPPORTED** — 2.2-6.0s/query × concurrent duplicates > 60 conns; not freshly re-reproduced this pass |
| ✓ explain duplicate hanging queries | **SUPPORTED from prior capture + code**; not freshly re-correlated this pass |
| ✓ no alternative explanation fits | **Alternatives ruled out:** indexing (31ms RLS-off proves base is fine), data volume (1 row), the fast function (0.04ms planning), frontend filters (pass-through, prior doc). RLS policy planning is the only factor that produces the 70-190× gap. |

### Verdict: **Root cause PROVEN** for the query-cost mechanism, with two links SUPPORTED-not-freshly-reproven.

**Proven:** the excess `trip_messages` read cost is RLS policy planning (2.2-6.0s vs 31ms without RLS), caused by three stale legacy multi-join SELECT policies that remain active alongside the fast function because migration `20260614190013`'s DROP did not take effect on the live DB. The function is not the cause (0.04ms planning). Indexing, data volume, and frontend filters are ruled out.

### Remaining missing evidence (not inferred)
1. **Exact residual planning time with ONLY the stale policies removed** (keeping the function policy). Cannot measure without dropping policies — forbidden this pass. RLS-off (31ms) proves policies-in-aggregate are the cost; it does not isolate the *stale-only* delta from the function-policy's own planning contribution.
2. **Whether PgBouncer/PostgREST amortizes planning across requests** (plan caching). Could not persist a cross-request `PREPARE` through MCP autocommit.
3. **Fresh live pool-exhaustion + duplicate-request correlation** (Parts 8-9) — not re-run to avoid re-triggering the outage; relies on the pre-restart capture + code analysis.
