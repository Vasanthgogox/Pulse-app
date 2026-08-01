# Realtime & Authorization Platform Rules

**Status:** Frozen rules, live findings
**Origin:** DB-health incident, chat on tab view (2026-08-01) — P0.5 measurement phase
**Related:** `docs/architecture/platform/01-platform-principles.md` (Laws #1-7), `docs/MARKETPLACE_DOMAIN.md`

## Platform Realtime Rule

> `postgres_changes` is for low-frequency, narrowly scoped data.
> Broadcast is for high-frequency or organization-wide fan-out.
> Clients consume domain events, not raw table mutations.
> No organization-wide `postgres_changes` subscription without documented justification.

## One Authorization Truth

Every table has **one** SELECT policy, **one** INSERT policy, **one** UPDATE policy, **one** DELETE policy. Never four overlapping SELECT policies computing the same access decision five different ways.

If a policy is replaced, the migration must:

```
DROP old policy
  ↓
CREATE new policy
```

Never `CREATE new` and leave the old one in place "to be safe." Postgres combines every policy on a table with OR into one compiled plan — a forgotten duplicate doesn't just sit there harmlessly, it costs real planning time on *every* read of that table, forever, until someone finds it.

Enforcement today, in `supabase/tests/chat_rls_single_select_policy.sql`: **SELECT is enforced** (fails the run) — measured, proven safe to fix, both tables confirmed at exactly 1. **INSERT/UPDATE/DELETE are reported only** (NOTICE, does not fail) — `trip_messages` currently has 5 separate INSERT policies (driver / linked-supplier / dispatcher / org paths). Those have not been measured the way SELECT was; they may be legitimate distinct authorization paths, not the same leftover-duplicate bug. Consolidating them without measuring first would repeat the exact mistake this whole investigation exists to avoid. Promote that block to enforced once it's actually measured.

## Why this rule exists — the finding that produced it

**Incident:** DB reported unhealthy while multiple users used chat across browser tabs.

**Initial hypothesis:** org-wide `postgres_changes` subscriptions force an RLS re-evaluation per connected subscriber per row change; the `trip_conversations`/`trip_messages` SELECT policies join `trips → clients/suppliers/indents/direct_quotes → organization_members`, so fan-out × join cost = DB load.

**What P0.5 measurement actually found**, on a local repro (1 home org, 50 linked orgs, 3k trips/conversations, 45k messages):

| Check | Result |
|---|---|
| Client subscription count (1 tab, 1 active conversation) | Not 1/1/1. Actual: 1 org-wide ack sub + N linked-org ack subs + 1 org-wide conversation-list sub + (1+N) trip-status subs, multiplied again per open tab. **Confirmed contributor.** |
| React Query invalidation storm | Every chat surface (main trip chat, driver chat, unified chat thread) patches cache/store directly on incoming messages. The only `invalidateQueries` calls found are user-action-triggered or unused dead code. **Ruled out.** |
| Are the RLS joins actually expensive? | **Yes, but not by executing.** `trip_messages`/`trip_conversations` each carried a fast function-based policy (`private.user_can_read_trip_message`/`user_can_read_trip_conversation`, home-org check first) *plus* three leftover multi-JOIN policies from before a 2026-07 reconsolidation that were never dropped. At runtime the fast policy short-circuits the rest (0 executions) — but Postgres still has to **plan** all four every time. Isolated: ~7ms planning. With the dead policies compiled in: ~100-210ms planning. A single-row authorization check went from ~292ms (cold) / ~24ms (warm, avg over 30) down to ~14ms (cold) / ~1.2ms (warm, avg over 30) after dropping them — roughly a 20x cut, purely from deleting unused policies. |
| Fan-out multiplication (N subscribers × 1 insert) | Per-subscriber authorization cost is real and multiplies with subscriber count (confirmed above); the live end-to-end websocket delivery count for N concurrent subscribers was not captured with a running multi-socket harness — treat the per-check cost as measured, the full socket fan-out count as architecturally consistent but not independently verified. |

**Fix shipped:** `supabase/migrations/20270131090000_drop_duplicate_chat_rls_policies.sql` — drops the six leftover policies. Purely subtractive, no client/transport/security changes, no access removed (the function-based policies already cover every case the old ones did).

**Sequencing (deliberately reordered from the original plan):**

```
Measure
  ↓
Remove duplicate policies   ← shipped, low risk, ~20x planning-cost cut
  ↓
Measure production again
  ↓
Only then evaluate Broadcast migration for trip_messages:acks:org / trip_conversations:org
```

Removing the duplicate policies does not remove the *structural* fan-out (org-wide channel × linked-org count × tab count still means N independent authorization checks per event) — it removes the ~20x cost multiplier on each of those checks. If production CPU/pool/latency don't recover after this ships, that's a strong signal the next bottleneck is the subscription fan-out itself, and the staged Broadcast migration (Stage 1: `trip_messages:acks:org` → Broadcast, Stage 2: `trip_conversations:org` → Broadcast, Stage 3: leave `trip_messages:conv` on `postgres_changes` — already scoped) is the next step, backed by a smaller, better-isolated problem than before.

## Roadmap position

```
P0   Instrument                    ✓
P0.5 Observe / measure             ✓
P0.6 Authorization cleanup         ✓ (this doc)
P1   Subscription inventory        (chat only, done above; full-platform sweep is separately scoped)
P2   Realtime transport (Broadcast)
P3   Database optimization
P4   Cache
P5   Lifecycle
P6   Event platform (domain events, not raw row mutations)
P7   Regression
```
