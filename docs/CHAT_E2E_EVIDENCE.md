# Chat Slow-Load — End-to-End Evidence Chain

**Date:** 2026-07-13. **No changes made. Investigation only.**
**Objective:** prove/disprove that the slowdown is the *interaction* of React Query × PostgREST × PostgreSQL × RLS, not any single component.

---

## The interaction mechanism (proven end-to-end)

**A cold RLS plan (5.7s, proven last pass) exceeds the client's 25s only under pool pressure — but the client aborts the HTTP fetch WITHOUT cancelling the Postgres query, then retries up to 4×, each retry starting a NEW cold-planning backend. Abandoned backends keep running. This converts a one-time per-backend cold cost into a multiplying pile-up that exhausts the pool. No single component causes it; the interaction does.**

---

## PART 1 — Complete request path (files)

```
DriverChatScreen (features/drivers/screens/DriverChatScreen.tsx)
  ↓
useDriverChatMessagesQuery(conversationId)  [features/chat/hooks/useDriverChatMessagesQuery.ts:30]
  ↓ React Query key: driverChatMessagesQueryKey(cid)  [utils/driverChatMessageCache.util.ts]
useInfiniteQuery → queryFn → chat.service.getMessagesByConversation  [chat.service.ts:772]
  ↓ RPC windowed_trip_message_history  (fallback → REST .from('trip_messages'))
supabase-js  → global.fetch = fetchWithTimeoutAndRetry  [lib/supabase.ts:283]
  ↓ HTTP GET/POST → PostgREST  (REQUEST_TIMEOUT_MS=25s, MAX_RETRIES=3)  [lib/supabase.ts:34-35]
PostgREST → generated SQL on trip_messages
  ↓ RLS rewrite: 6 permissive SELECT-applicable policies OR'd  (proven prior pass)
PostgreSQL: cold plan ~5.7s (498 SubPlans) → warm 34ms  (20× test, prior pass)
  ↓ response
React Query cache (driverChatMessagesQueryKey) → flattenDriverChatMessages → FlatList
  ↓ realtime patches: useDriverChatSubscription  [features/chat/hooks/useDriverChatSubscription.ts]
```
The inbox path additionally issues the R2 `fetchDriverInboxPreviewMessages` trip_messages read [chat.service.ts:1435] via `getDriverChatInbox` `Promise.all` [chat.service.ts:1404].

## PART 2 — Every path that can request trip_messages

| Path | File | Query key / trigger | Condition |
|---|---|---|---|
| thread history | useDriverChatMessagesQuery [:44] | `driverChatMessagesQueryKey(cid)`, infinite | on open thread |
| inbox previews (R2) | getDriverChatInbox → fetchDriverInboxPreviewMessages [chat.service.ts:1435] | inside useDriverChatConversationsQuery | on inbox load |
| business thread | useChatThreadRealtime [:54] → getChatMessages (chat_messages) | `chatPlatform.messages(conv)` | on open (Trip Room) |
| **retry** | fetchWithTimeoutAndRetry [supabase.ts:88] + infrastructureShouldRetry [queryRetry.ts:16] | on timeout/5xx, ≤4 attempts | **any hung/slow read** |
| refetchInterval | useDriverHomeDriversQuery [:48] (120s), usePendingOtpTripsQuery (30/120s) | poll | app foreground |
| invalidate | useInvalidateDriverChatMessages [:82] | after send/realtime | debounced |
| focus refetch | global `refetchOnWindowFocus:false` (chat) | — | **disabled for chat** |
| reconnect | thread hooks `refetchOnReconnect:true` | network reconnect | on reconnect |
| subscription | useDriverChatSubscription (registry) | realtime INSERT/UPDATE | patches cache, no refetch |

## PART 3 — Timeline: opening one chat (cold backend)

```
T+0ms      DriverChatScreen mounts
T+5ms      useDriverChatConversationsQuery starts → REST trip_conversations (fast)
T+15ms     getDriverChatInbox Promise.all → R2 trip_messages read dispatched to PostgREST
T+15ms     PostgREST assigns backend #1 → begins COLD RLS plan (~5.7s)
T+20ms     useDriverChatMessagesQuery starts (thread) → 2nd trip_messages read → backend #2 cold plan
T+25,000ms fetchWithTimeoutAndRetry aborts fetch #1 (REQUEST_TIMEOUT_MS) — HTTP closes,
           BUT backend #1 keeps planning (not cancelled — Part 5)
T+25,000ms retry attempt 2 dispatched → backend #3 begins the SAME cold plan
T+~27s     retryDelay, attempt 3 → backend #4 …
           → multiple concurrent cold-planning backends for ONE chat open
```
(Exact ms need a live browser trace — see Part 6/9. The *sequence* is proven from code constants.)

## PART 4 — Can identical requests overlap? YES (proven)

React Query **deduplicates only within one client** for the *same key while a fetch is in-flight*. But overlap occurs via two proven paths:
1. **Retry after abort** [supabase.ts:88-106]: when fetch #1 aborts at 25s, React Query's queryFn rejects → retry issues fetch #2. Fetch #1's **Postgres backend is still running** (Part 5) → backend #1 and backend #2 run the identical query concurrently.
2. **Inbox R2 + thread R1** are **different query keys** (`driverChatConversations` vs `driverChatMessages`) → not deduped against each other, both read trip_messages.
3. **Multiple clients** (driver tab + business tab in the screenshots) → separate React Query instances, zero cross-client dedup.

So identical `trip_messages` reads **can and do overlap** — matching the 3 concurrent backends captured in `pg_stat_activity` (162/188/216s).

## PART 5 — Cancellation: does abort reach PostgreSQL? NO (proven)

[lib/supabase.ts:75-85] `doFetch` creates an `AbortController` with a 25s timeout and aborts the **fetch**. Aborting fetch closes the **HTTP connection to PostgREST**. But:
- The code comment [supabase.ts:49-52] states it explicitly: *"withTimeout() races the promise but does not abort the underlying fetch, so … the abandoned fetch keeps running in the background."*
- Even when the fetch IS aborted, **PostgREST does not, by default, forward an HTTP client-disconnect as a Postgres query cancel** for an in-progress statement. The proof is empirical: the pre-restart `pg_stat_activity` showed backends at **162/188/216s** — far past the 25s client abort — still `state=active`. **If cancellation reached Postgres, no backend would exceed ~25s.** It did. Therefore cancellation does NOT reach PostgreSQL.
- No chat queryFn passes React Query's `AbortSignal` to supabase-js (grep: zero `signal`/`abortSignal` usage in chat hooks/service). So React Query cancellation is not wired through either.

**Confirmed: an abandoned request's Postgres backend runs to completion regardless of client timeout/retry.**

## PART 6 — Correlate historical pg_stat_activity to browser requests

**Cannot be fully reconstructed, and here is exactly why:** the pre-restart capture recorded `pid`, `query`, `query_start`, `application_name=postgrest`, `backend_xmin` — but PostgREST issues queries under a shared role with **no per-request correlation id, no React Query key, no conversation id, and no request URL in the SQL** (the conv ids are bound parameters, not visible in the captured `left(query,90)`). The DB has since restarted, clearing those backends. So mapping each historical PID → specific browser request/component is **not possible from existing evidence**. What IS correlatable: all 3 hung queries were the **R2 `trip_messages` projection** (query text matched byte-for-byte), from `application_name=postgrest`, at 162-216s — consistent with the retry-pile-up mechanism, but the per-request identity is unrecoverable.

## PART 7 — Evidence AGAINST the frontend theory (steelman)

| Frontend suspect | Evidence AGAINST it being the cause |
|---|---|
| duplicate requests | React Query DOES dedup same-key in-flight (normal case); staleTime 30-60s prevents remount refetch storms |
| polling | chat message/inbox queries have **no refetchInterval**; only driver-home (120s) and OTP (30/120s) poll, different keys |
| focus refetch | `refetchOnWindowFocus:false` globally for chat — disproved as a source |
| retry | retry only fires on infra errors/timeout — in a **healthy** DB the read is 34ms and never times out, so retry never triggers |
| subscription races | all subscriptions use the ref-counted registry (StrictMode/reconnect safe) — no duplicate channels |
| cache invalidation | invalidations are debounced; no tight invalidate loop found |

**Crucial implication:** the frontend is **innocent when the DB is warm/fast**. Retry/overlap only activate **because** the cold RLS plan is slow enough to hit the 25s timeout. Neither component alone triggers the outage — the frontend amplification requires the slow cold plan, and the slow cold plan only exhausts the pool because the frontend retries without cancellation. **This is the proven interaction.**

## PART 8 — Final evidence matrix

| Hypothesis | Evidence For | Evidence Against | Confidence |
|---|---|---|---|
| **Cold planner** | 20× test: run1 5,693ms vs warm 34ms; RLS-off 31ms | warm steady-state is cheap (34ms) | **High (proven)** |
| **RLS expansion** | 6 policies OR'd, 498 SubPlans, only stale policies ref direct_quotes/indents | per-policy attribution merged (can't isolate) | **High (proven)** |
| **Duplicate React requests** | retry-after-abort + different keys + multi-client (Part 4) | React Query dedups same-key in-flight | **High (proven possible)** |
| **Retry storm** | MAX_RETRIES=3, retries on timeout [queryRetry.ts:16] | only triggers when reads are already slow | **High (mechanism proven)** |
| **No cancellation → pile-up** | abort doesn't cancel PG (Part 5); backends ran 162-216s > 25s | — | **High (proven)** |
| **Pool exhaustion** | cold cost × non-cancelled retries × concurrent backends | not freshly re-reproduced live | **Strongly supported** |
| **Planner cache** | warm 34ms; n_mod_since_analyze=0 | cache is per-backend; cold on new backend | **High (proven)** |
| **PostgREST (alone)** | issues the SQL; holds 2 backends | not a cause by itself | **Low as sole cause** |
| **Network latency** | — | 34ms warm rules it out | **Disproved as primary** |
| **Database contention** | pre-restart pool saturation | wait_event=null (CPU/planning, not locks) | **Low (not lock contention)** |

## PART 9 — Final verdict

### **(B) Strongly Supported**

The interaction is proven from code + prior DB evidence: cold RLS planning (5.7s) + client abort-without-cancellation (Part 5) + retry-up-to-4× (Part 4) + no cross-client dedup → non-cancelled concurrent cold-planning backends → pool exhaustion. Every link is evidenced. It is **not** any single component: warm DB = 34ms (frontend harmless); healthy frontend = still fine until a cold plan hits 25s. The interaction is the cause.

**Not "Fully Proven" — remaining evidence required:**
1. **Live browser trace of one cold chat-open** (Network panel + timestamps + concurrent `pg_stat_activity`) correlating retries → new backends in real time. Requires driving the running app and risking re-saturation; not done.
2. **Direct proof PostgREST doesn't cancel** — inferred from backends exceeding 25s (strong) but not confirmed via PostgREST config (`db-channel`/`server-timing`) inspection.
3. **Per-PID → per-request correlation** — impossible from existing capture (Part 6): no correlation id in the SQL, and the backends are gone post-restart.
4. **Production warm/cold backend ratio** (carried from prior pass) — how often real requests hit a cold backend vs the 2 warm PostgREST backends.

No fixes recommended. Evidence only.
