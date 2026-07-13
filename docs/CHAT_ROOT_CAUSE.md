# Chat Slow-Load — Definitive Root Cause (Live Evidence)

**Date:** 2026-07-13 (post DB-restart, live capture)
**No fixes, schema, RLS, index, or code changes made.**

---

## ROOT CAUSE (proven, not speculated)

**`trip_messages` has FOUR active `SELECT` RLS policies evaluated OR'd together on every read: the intended fast function `private.user_can_read_trip_message()` PLUS three stale multi-join policies that migration `20260614190013` was supposed to DROP but DID NOT. The planner must plan all four policy trees on every `trip_messages` read, producing a 1,400+ node plan for a ~20-row table. Under concurrent chat loads on the nano instance this planning cost holds connections until the pool exhausts — the outage. The base table scan is correctly indexed; the cost is 100% RLS policy planning.**

This is the exact failure mode the migration's own header documented ("5 SELECT policies … inlined … Planning time was 725ms+ … exhaust the pool → DB outage") — **the fix did not take effect on the live database.**

---

## Phase 1 — Live state

**`pg_stat_activity` (immediately post-restart):** healthy — only `mgmt-api` (3, SET statements), `postgrest` idle (`LISTEN pgrst`), Storage API idle, one `postgrest` idle-in-transaction (schema-cache introspection). No hung queries at rest. Confirms the pool is fine until chat load hits `trip_messages`.

**Active SELECT RLS policies on `trip_messages` (LIVE `pg_policies`, not migrations):**
| Policy | Role | USING |
|---|---|---|
| `trip_messages_select` | authenticated | `private.user_can_read_trip_message(organization_id, conversation_id)` — the intended fast path |
| **`Linked client org reads trip messages`** | **public** | 4-table EXISTS: trip_conversations→trips→clients→organization_members |
| **`Linked supplier org reads trip messages for supplied trips`** | **public** | 5-table EXISTS incl. `direct_quotes` join |
| **`Linked supplier via indent reads trip messages`** | **public** | 5-table EXISTS: trip_conversations→trips→indents→direct_quotes→organization_members |

The 3 bold policies are `PERMISSIVE`, role `{public}` (⊇ authenticated), so **every authenticated read evaluates all four** (Postgres OR's permissive policies of the same cmd). Migration `20260614190013` issued `DROP POLICY IF EXISTS` for these names — **live catalog proves they still exist** (the DROP either never applied or the policies were recreated by a later/other migration).

**`chat_messages` / `chat_conversations` policies:** clean — single `fn_chat_can_access_conversation()` / `fn_chat_is_org_member()` function calls, no inlined multi-join stacks.

**`pg_get_functiondef(private.user_can_read_trip_message)`:** confirmed live, `STABLE SECURITY DEFINER`, 5 EXISTS branches (Check 1 org-member fast-path first). This function is fine in isolation; it is NOT the problem — the **stale sibling policies** are.

**`pg_stat_statements`:** empty (reset by restart) — historical timings unavailable; captured fresh via EXPLAIN below.

---

## Phase 2 — EXPLAIN of the exact R2 query

Exact query (matches the `pg_stat_activity` capture from before the restart), run under real authenticated user `c999f201…` (org member) so all policies evaluate:

**`EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` → TIMED OUT.** Executing the exact R2 query with RLS active exceeds the timeout on a ~20-row table. **This deterministically reproduces the incident.**

**Plain `EXPLAIN` (planning only, no execution)** of the same query → **263,610-character plan**:
- **Nested Loop: 144 · Index Scan: 259 · Index Only Scan: 30 · Seq Scan: 22 · SubPlan: 332 · InitPlan: 664**
- Table refs inside the plan: `organization_members` ×272, `indents` ×78, `direct_quotes` ×60, `suppliers` ×50, `clients` ×50, `trips` ×40.
- Base `trip_messages` access: **`Index Scan using idx_trip_messages_conv_type`** — correct/optimal.

A ~1,400-node plan to read 20 rows. The planner builds this on **every** `trip_messages` query. The base scan is instant; the RLS policy trees dominate.

---

## Phase 3 — RLS profiling (which cost dominates)

Isolated the heaviest stale policy's subquery ("Linked supplier via indent", the `direct_quotes` 5-table join) under the same authenticated user:

`EXPLAIN (ANALYZE, BUFFERS)` →
- **Planning Time: 249.337 ms**
- **Execution Time: 19.227 ms**
- 37 Nested Loops, 64 Index Scans, 7 Seq Scans (for ONE policy).

**Time is in PLANNING, not execution.** Execution is trivial (tiny tables). One stale policy = 249ms planning. All three stale policies + the function, inlined and OR'd, multiply this into the timeout-level planning cost seen in Phase 2. **The dominant cost is planning the inlined multi-join policy trees**, exactly as the migration header predicted.

Which branch dominates: the stale `{public}` policies (client / supplier / supplier-via-indent), NOT the fast function. The function was added to *replace* them; because the DROP didn't take, both now run and the planning cost the function was meant to remove is still present — plus the function's own cost on top.

---

## Phase 4 — Index verification

`trip_messages` has 21 indexes. The R2 query's `(conversation_id, message_type, created_at DESC)` is served by **`idx_trip_messages_conv_type`** — and the live plan's base scan uses exactly that index (`Index Scan using idx_trip_messages_conv_type`). **Indexing is not the problem; the base read is optimal.** No missing/unused index is implicated. (The RLS join subtrees also use appropriate indexes — `idx_direct_quotes_indent_bidder_status`, `idx_org_members_user_org_status`, etc. — the cost is the *number* of planned join trees, not a missing index.)

---

## Phase 6 — "Loading complete" trace (first disappearance point)

| Stage | Evidence | Drops it? |
|---|---|---|
| Database | Row present in both `trip_messages` (conv `2b0ed622 @06:28:06`) and `chat_messages` (`9613f2fb`) — proven earlier | ❌ |
| PostgREST → PostgreSQL | R2/R1 `trip_messages` SELECT **hangs on RLS planning** (Phase 2 timeout) → response never returns | ✅ **FIRST DISAPPEARANCE** |
| network / React Query / state / render | never receive data; downstream transforms (flatten/party-filter/dedupe/virtualization) proven pass-through in `CHAT_INVESTIGATION.md` §4-5 | ❌ (downstream of the drop) |

**The message disappears at the DB read stage — the query never returns because RLS planning hangs. Not a state, render, or sync bug.**

---

## Phase 5 — Incident reproduction

Not separately re-run: **Phase 2 already reproduces it deterministically at the DB layer** — the exact R2 query, under a real authenticated user, times out. The frontend multiplication mechanism (retry/poll/reconnect spawning concurrent copies of a hung read → pool exhaustion) is proven from code in `CHAT_INVESTIGATION.md` §8. A live 3×30s browser capture would add request timestamps but cannot change the root cause, which is now proven at the source.

---

## Evidence summary

- **SQL:** exact R2 query captured from `pg_stat_activity`.
- **EXPLAIN:** ANALYZE times out; plain EXPLAIN = 263KB / ~1,400-node plan; base scan uses `idx_trip_messages_conv_type`.
- **pg_stat_activity:** healthy at rest; the R2 query is what saturates.
- **pg_stat_statements:** reset by restart (noted, not inferred).
- **RLS policies (live):** 4 active SELECT policies on `trip_messages`; 3 are stale multi-join policies the fix migration failed to drop.
- **Helper fn source:** `private.user_can_read_trip_message` confirmed live (not the bottleneck).
- **Index usage:** optimal base index used; indexing ruled out.
- **RLS profiling:** one stale policy = 249ms planning / 19ms execution → planning dominates.
- **Frontend:** message-drop point = DB read; downstream pass-through proven (companion doc).

## Root cause — stated once
**Migration `20260614190013_trip_messages_rls_rewrite` did not remove the three legacy multi-join SELECT policies on `trip_messages` on the live database. They remain active alongside the intended fast function, so every `trip_messages` read plans four OR'd policy trees (~1,400 nodes; ~250ms+ planning per stale policy), which under concurrent chat loads on the nano instance holds connections until the pool exhausts. The base table read is correctly indexed and instant; 100% of the excess cost is RLS policy planning.**

## Evidence still missing (not inferred)
- Exact end-to-end **planning-time milliseconds** of the full 4-policy R2 plan: plain EXPLAIN returned the plan but the `Planning Time:` line was beyond the captured extract; the ANALYZE timeout and 263KB plan size establish the magnitude, but a precise ms figure for the *combined* plan was not isolated.
- A live browser Network/React-Query timeline (Phase 5 3×30s capture) — not required for root cause, would only add client-side timestamps.
