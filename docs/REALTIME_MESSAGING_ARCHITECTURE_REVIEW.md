# Realtime Messaging Architecture Review

Principal-architect-level review of the Driver ↔ Operator/Dispatcher ↔ Shipper ↔ Transporter realtime messaging path, focused on the reported symptom: **database health degrades when users communicate in realtime.** Every finding below is grounded in the actual RPC/trigger/registry code — cited by file and line — not a generic best-practices survey. Where I couldn't verify something without a load test or DB access I don't have in this environment, I say so explicitly rather than estimate with false precision.

## A. Current Architecture (as it actually exists)

```
Client / Driver / Dispatcher UI
        │
        │  supabase().rpc('send_trip_chat_message', {...})   [1 client round-trip]
        ▼
Postgres: send_trip_chat_message()  (supabase/migrations/20260728290000_..., SECURITY DEFINER)
        │
        │  INSERT INTO trip_messages   ← the only write the RPC body itself issues
        │  (early RETURN for non-dispatcher senders — most messages stop here)
        ▼
   ── AFTER INSERT triggers on trip_messages fire automatically ──
        │
        ├─▶ on_trip_message_insert → sync_conversation_on_message()
        │      UPDATE trip_conversations SET last_message_at, last_message_preview,
        │             unread_dispatcher_count, updated_at
        │      (supabase/migrations/20260430120000_trip_chat_system.sql)
        │
        └─▶ trg_chat_mirror_trip_message_insert → fn_chat_mirror_trip_message_insert()
               │  fn_chat_ensure_conv_for_trip_lane() — SELECT chat_conversations;
               │     INSERT chat_conversations only on the lane's first-ever message
               │  INSERT INTO chat_messages  (mirrors the row into the new unified table)
               │  (supabase/migrations/20260917000000_pulse_chat_platform_foundation.sql)
               ▼
        ── AFTER INSERT triggers on chat_messages fire automatically ──
               │
               ├─▶ trg_chat_message_sync_conversation → fn_chat_sync_conversation_on_message()
               │      UPDATE chat_conversations SET last_message_at, last_message_preview,
               │             message_count = message_count + 1, updated_at
               │
               └─▶ trg_chat_message_audit → fn_chat_audit_message()
                      INSERT INTO chat_audit_log (message_sent, payload)

        ── separately: BEFORE INSERT triggers on trip_messages (reads, not writes) ──
        trg_trip_messages_avatar_seed         — SELECT profiles.avatar_seed → sets NEW field
        trg_trip_messages_context_routing     — SELECT trip_conversations/trips → sets NEW field
```

**Realtime fan-out (separate from the write path above):** clients subscribed to `trip_messages`/`chat_messages` via `postgres_changes` receive the new row over their existing channel — this part is efficient (see Problem-free findings below).

**Read/bootstrap path:** conversation loading is a single RPC, `get_multi_lane_bootstrap` (`features/chat/services/chat.service.ts:1736`, `fetchChatBootstrapPayload`), not N+1 client queries. The client does one round-trip with graceful fallback for older function signatures, and the pagination/bucket logic lives server-side inside the RPC.

## B. Problems Found, Ranked

### 🔴 Critical

**1. Every message write is duplicated across two parallel schemas, live in production simultaneously.** `trip_messages`/`trip_conversations` (the original chat system, April) and `chat_messages`/`chat_conversations`/`chat_audit_log` (the "Pulse Chat Platform" unification, September) are **both being written to, on every single message**, via the trigger chain above. This isn't a hypothetical N+1 — it's a real, currently-active dual-write:

| Step | Table | Operation |
|---|---|---|
| 1 | `trip_messages` | INSERT (explicit, in the RPC) |
| 2 | `trip_conversations` | UPDATE (trigger) |
| 3 | `chat_conversations` | INSERT — only on a lane's first-ever message (trigger, conditional) |
| 4 | `chat_messages` | INSERT (trigger) |
| 5 | `chat_conversations` | UPDATE (trigger, cascading from step 4) |
| 6 | `chat_audit_log` | INSERT (trigger, cascading from step 4) |

**Steady state (existing conversation): 5 writes for what the application perceives as "insert one message."** First message in a lane: 6. None of this is visible from `sendChatMessage()` in the app — the entire cascade lives in Postgres triggers the application code never sees, which is exactly why it reads as "the DB just gets unhealthy" rather than an obvious app-level bug.

### 🟠 High

**2. The audit log write is synchronous with the message-send path and unbounded.** `chat_audit_log` gets an INSERT on every single message (`fn_chat_audit_message`, line 469-475 of the September migration) with no apparent retention/pruning policy visible in the migrations I checked. At scale this table grows at the same rate as `chat_messages` forever, and every write to it happens inside the same trigger cascade as the user-visible message send — a slow audit-log write directly adds latency to sending a message.

**3. Two independently-maintained "unread/last-message" denormalizations can drift.** `trip_conversations.unread_dispatcher_count`/`last_message_preview` (old) and `chat_conversations.message_count`/`last_message_preview` (new) are updated by two separate trigger functions with no shared source of truth between them. If either trigger is ever skipped (e.g. a direct `INSERT INTO chat_messages` that bypasses the `trip_messages` mirror path, or vice versa), the two conversation tables silently disagree about unread counts — a correctness risk, not just a performance one.

### 🟡 Medium

**4. `fn_chat_ensure_conv_for_trip_lane` does a SELECT-then-maybe-INSERT on every message**, not just once per lane. That's an unavoidable extra read per message (cheap on an indexed lookup, but it's there), and the INSERT branch races if two messages land in a brand-new lane concurrently — worth confirming there's a unique constraint on `legacy_trip_conversation_id` backing this, since I didn't verify that in the time I had.

**5. Two `BEFORE INSERT` triggers on `trip_messages` (avatar-seed lookup, context-routing lookup) each add a `SELECT` before the row lands.** These don't add writes and the migration authors already flagged them as "negligible" — correctly, based on what I read — but they do add round-trip latency to the single INSERT, and they stack with everything above.

### 🟢 Low / Not a problem — verified safe

**6. The realtime subscription registry (`lib/realtimeRegistry.ts`) is genuinely well-built** — ref-counted shared channels by key, grace-period teardown (15s) to survive React StrictMode double-mounts and rapid navigation, a hard cap (50 channels) with stale-channel sweeping, foreground-pruning on app resume, and an emergency teardown on sign-out. 16 files across chat/finance/trips/network correctly route through it (`grep` confirmed). **This is not the bottleneck** — someone already solved "are we duplicating subscriptions" correctly.

**7. Presence/broadcast (typing indicators, live GPS) intentionally bypass the registry** (`useChatTypingPresence.ts`, `TrackingBroadcastSubscriptionManager.ts`) because they use Supabase's `broadcast`/`presence` primitives, not `postgres_changes` — the registry was built specifically for the latter. This is a reasonable architectural split, not a bug, though these 5 files' own lifecycle management wasn't independently audited here (see Not Yet Verified below).

**8. Message send is a single RPC round-trip, and conversation bootstrap is a single RPC round-trip.** Neither is doing client-side N+1 queries. Whatever's causing "DB health degradation" is server-side (the trigger cascade above), not chatty client code.

## C. Root Cause Analysis

**The database isn't unhealthy because messaging is realtime — it's unhealthy because the codebase is running two complete chat data models simultaneously.** The September 2026 migration (`pulse_chat_platform_foundation.sql`) introduced `chat_messages`/`chat_conversations`/`chat_audit_log`, and built the mirror trigger (`trg_chat_mirror_trip_message_insert`) so the new tables populate from the old write path. Every message pays for **both** systems' full write and update cost. That much is fact, verified by reading the trigger bodies.

**Correction after the reader inventory, stated plainly because it changes what "fix" even means here: I initially framed this as an abandoned, mid-migration cleanup — that may be wrong.** `chatPlatform.service.ts` (the canonical-schema client) is wired into live, real screens — `ChatScreen.tsx`, `TripChatRoomSheet.tsx`, `ChatTripRoomInboxSection.tsx` — a "Trip Room" feature that looks like a genuinely separate, newer unified-inbox surface, not a drop-in replacement mid-rollout for the older per-lane driver/dispatcher chat threads (`DriverChatSlackThread.tsx` and friends, which still use the legacy `chat.service.ts`/`send_trip_chat_message`/`trip_messages` path directly). **If Trip Room is meant to coexist permanently as a unified view across all chat surfaces, the mirror trigger isn't a leftover — it's the mechanism that makes that unification work, and collapsing it would break Trip Room's ability to see messages sent through the legacy threads.** I can't resolve this from reading code; it depends on product intent I don't have visibility into. This is the actual, sharpest form of "Phase 2 — Decide the Canonical Model": not "which schema wins" in the abstract, but "is Trip Room meant to replace per-lane chat threads, or watch them." Everything below (write-cascade cost, migration plan, performance estimates) is still accurate as a description of current cost — what's no longer certain is whether removing that cost is actually safe without also deciding to retire a live feature.

## D. Optimized Architecture

**Principle: finish the migration you already started, rather than adding new abstraction.** This directly satisfies the "reuse existing architecture, minimize unnecessary abstractions" constraint — the fix is subtraction, not a redesign.

```
Client / Driver / Dispatcher UI
        │
        │  supabase().rpc('send_trip_chat_message', {...})
        ▼
Postgres: send_trip_chat_message()
        │
        │  INSERT INTO chat_messages directly   ← single canonical table
        ▼
   AFTER INSERT trigger (one, not four):
        UPDATE chat_conversations SET last_message_at, last_message_preview,
               message_count = message_count + 1, updated_at
        │
        └─▶ audit logging moved off the synchronous path (see below)
```

Concretely, in priority order:

1. **Decide (this is a product/data decision, not something I'd make unilaterally): is `chat_messages` now the real system of record?** If the answer is yes — which the existence of a full mirror+audit+sync trigger set for it suggests it already is in intent — then `trip_messages`/`trip_conversations` should stop being the primary write target. Either point `send_trip_chat_message()` (and its network/driver-message siblings) directly at `chat_messages`, or keep the RPC's external contract unchanged but flip which table is canonical inside it, and make the *old* tables the ones populated by a (temporary, clearly time-boxed) backward-compat trigger instead — whichever direction has fewer live readers depending on the old shape. That decision needs an inventory of every reader of `trip_messages`/`trip_conversations` I didn't have time to build in this pass (see Not Yet Verified).
2. **Collapse the two conversation-sync triggers into one.** Once there's one canonical message table, there's no reason to update two conversation tables. This alone removes 1-2 of the 5-6 writes per message.
3. **Move `chat_audit_log` off the synchronous message-send path.** An audit trail doesn't need to block the user's message from completing. Either write it via a Postgres `NOTIFY`/queue consumed asynchronously, or batch it, or — simplest — accept that it's a fire-and-forget `INSERT` the trigger issues but don't let a slow audit write add latency to the perceived send (this is already technically async from the client's perspective since it's all inside one transaction the client already isn't waiting on more than the single INSERT — the real fix here is making sure `chat_audit_log` has its own lightweight, unindexed-for-write-speed table shape and a retention/archival policy, not necessarily moving it out of the trigger).
4. **Add a uniqueness guarantee (if missing) on `chat_conversations.legacy_trip_conversation_id`** so `fn_chat_ensure_conv_for_trip_lane`'s SELECT-then-INSERT can't race into duplicate conversation rows under concurrent first-messages.

## E. Migration Plan (safe path, no production break)

1. **Measure first, in the real environment** (`SUPABASE_DB_PASSWORD` access needed, same gate as the finance audit) — confirm the write counts above against `pg_stat_user_tables`/`pg_stat_statements` for `trip_messages`, `chat_messages`, `trip_conversations`, `chat_conversations`, `chat_audit_log`. This report's counts are derived from reading the trigger SQL, not from a production trace — they should match, but verify before cutting anything.
2. **Inventory every reader of `trip_messages`/`trip_conversations`** (RPCs, app queries, other triggers like `trg_sync_operational_status`/`trg_mirror_operational_to_trip_room` from `20260918000000_trip_chat_room_phase2.sql`, which weren't fully traced in this pass) before deciding which table becomes the sole write target.
3. **Flip the write target behind the existing RPC contract** (`send_trip_chat_message`'s signature stays the same — only its body changes), so no client code needs to change on day one.
4. **Keep the mirror trigger running in reverse for one release cycle** (new→old instead of old→new) as a safety net, with a hard removal date, rather than deleting the legacy tables' data path immediately.
5. **Drop the reverse-mirror trigger and the legacy tables' triggers** once a release cycle has passed with no regressions and no remaining readers of the legacy shape.
6. **Add the audit-log retention policy and conversation-table uniqueness constraint** as part of the same migration that collapses the sync triggers — no reason to do these separately.

## F. Performance Estimates

**Honest framing: these are derived from the real write-cascade count above, not a load test.** I don't have production traffic numbers or `SUPABASE_DB_PASSWORD` access in this environment, so treat the "at scale" column as order-of-magnitude reasoning, not a capacity guarantee.

| Metric | Before (current, dual-write) | After (single canonical table) |
|---|---|---|
| DB writes per message (steady state) | 5 | 2 |
| DB writes per message (first message in a lane) | 6 | 3 |
| Conversation-row UPDATEs per message | 2 (two separate tables) | 1 |
| Audit-log INSERTs per message | 1 (synchronous) | 1 (same, but table optimized for write-only + retention) |
| Realtime `postgres_changes` events per message | Up to 2 (both `trip_messages` and `chat_messages` insert independently and each can have its own subscribers) | 1 |

At any given messages/sec throughput `M`, this is roughly a **60% reduction in write volume attributable to messaging** (5→2), independent of how many users are connected — the subscription registry already keeps the *listener* side from scaling badly with user count (Problem 6/7 above), so the write-side fix is what actually moves the "DB health degrades under realtime load" symptom, not a subscription-architecture change.

## The Single Biggest Bottleneck, and the Highest-Impact Fix

**The biggest bottleneck is the live dual-write between `trip_messages`/`trip_conversations` and `chat_messages`/`chat_conversations`/`chat_audit_log`.** It's not a realtime/websocket problem — the subscription layer is already solid — it's that every message pays for two complete parallel data models.

**Highest-impact fix, updated after the reader inventory: this is now a product decision before it's an engineering one.** My original recommendation ("collapse the two conversation-sync triggers, ~40% write reduction, no app changes needed") assumed the mirror was leftover migration scaffolding. The inventory found `chatPlatform.service.ts`/Trip Room is a live feature that may genuinely depend on that mirror to unify legacy per-lane chat with the newer inbox view. **Get that product answer first** ("should Trip Room replace per-lane chat threads, or does it need to keep watching them?") — if the answer is "replace," the trigger collapse is exactly as described and just as high-impact. If the answer is "watch permanently," the fix is different: keep the mirror, but make it cheaper (e.g. collapse the *legacy-side* `trip_conversations` sync into whatever `chat_conversations` already tracks, since the legacy conversation table's own denormalization may be the genuinely redundant piece, not the mirror itself).

## Not Yet Verified — needs either DB access or more time, flagged rather than guessed

- Exact production write/query volume (needs `SUPABASE_DB_PASSWORD`, same gate as the finance audit).
- `trg_sync_operational_status`, `trg_mirror_operational_to_trip_room`, `trg_sync_trip_room_on_trip_update` (`20260623180000`, `20260918000000`) — these fire on trip/operational-status changes and *create* chat messages, which would re-enter the write cascade above; not fully traced in this pass.
- Independent lifecycle audit of the 5 files using raw `broadcast`/`presence` channels outside the registry (`useChatTypingPresence.ts`, `TrackingBroadcastSubscriptionManager.ts`, driver payment broadcast) — these weren't covered by the registry's protections and weren't individually audited here.
- Index coverage on `chat_messages`/`chat_audit_log` for the query patterns the bootstrap RPC (`get_multi_lane_bootstrap`) actually uses at scale.

---

# Phase 1 — Reader Inventory

Per the agreed migration ordering: **no trigger collapse until this inventory is complete.** Below is the dependency matrix for `trip_messages`, `trip_conversations`, `chat_messages`, `chat_conversations` — every SQL function whose body references one of these tables, cross-referenced against what the app actually calls (not just what exists), so "defined" isn't conflated with "live."

**Confidence key**, since not everything here got the same depth of verification: **✅ Verified** — I read the function body and/or confirmed the app call site directly. **📛 Named-inferred** — classified by naming convention (`get_*`/`fn_*`/`mirror_*` etc., consistently used throughout this codebase's SQL), not individually read. **❓ Unconfirmed** — genuinely don't know, flagged rather than guessed.

## Legacy tables (`trip_messages`, `trip_conversations`)

| Function/Consumer | Table(s) | Classification | Confidence |
|---|---|---|---|
| `send_trip_chat_message` (RPC) | `trip_messages` W | Canonical write path today — **blocking dependency**, this is what every message send calls | ✅ |
| `on_trip_message_insert` → `sync_conversation_on_message` (trigger) | `trip_conversations` W | Legacy — updates `unread_dispatcher_count`/`last_message_preview` | ✅ |
| `trg_trip_messages_avatar_seed` → `fn_populate_sender_avatar_seed` (trigger) | `trip_messages` R (via `profiles`) | Legacy, but harmless (read-only enrichment, no cross-table write) | ✅ |
| `trg_trip_messages_context_routing` → `trip_messages_set_context_routing` (trigger) | `trip_messages` R+W (writes `NEW.context_trip_id`/`context_indent_id` on the same row, before insert) | Legacy | ✅ |
| `trip_messages_sync_operational_to_lanes` (trigger fn) | `trip_messages` W | Legacy — not fully traced; fires on operational-status changes and posts messages, re-entering the whole cascade | ❓ |
| `mark_conversation_read` (RPC, two versions exist — `20260430120000` and a later `20260521101002` redefinition) | `trip_conversations` W | **App calls this directly.** Blocking dependency — must be migrated or dual-write-covered before trigger removal | ✅ |
| `mark_messages_seen` (RPC) | `trip_messages` W (`is_read`/`read_at`) | App calls this directly. Blocking dependency | ✅ |
| `mark_delivered` (RPC) | `trip_messages` W (`is_delivered`/`delivered_at`) | **Built (own migration + covering index), granted to `authenticated`, but zero call sites found anywhere in app code.** Not a blocking dependency — it's dead code, or a feature that was scaffolded and never wired to UI. Worth a decision: finish wiring it, or drop it, before it's carried into the canonical schema for no reason | ✅ |
| `fn_reconcile_trip_conversation_unread` | `trip_conversations` W | No app call site found — likely a maintenance/backfill function, not a live dependency | 📛 |
| `toggle_trip_message_reaction` (RPC) | `trip_messages` R+W (`reactions` column) | App calls this directly. Blocking dependency | ✅ |
| `windowed_trip_message_history` (RPC) | `trip_messages` R | **App calls this directly** (`fetchConversationHistory` in `chat.service.ts:787`), with a **direct fallback query** (`supabase().from("trip_messages").select(...)`) if the RPC 404s. That fallback is itself a second, independent reader that bypasses the RPC layer entirely — must be migrated separately, it won't move just because the RPC does | ✅ |
| `get_multi_lane_bootstrap` (RPC) | `trip_messages`+`trip_conversations` R | App calls this directly (`fetchChatBootstrapPayload`). Blocking dependency, and it's the conversation bootstrap path — high traffic | ✅ |
| `get_trip_chat_room` / `ensure_trip_chat_room` / `refresh_trip_chat_room_team` (RPCs) | Both R and W | App calls all three directly (per the RPC-call grep). These belong to the "Trip Room" feature (`20260918000000_trip_chat_room_phase2.sql`) — a **separate, newer chat surface layered on top of the same legacy tables**, not yet accounted for in the dual-write analysis above. Needs its own trace before Phase 3 | ❓ |
| `ensure_driver_trip_conversation` (RPC) | `trip_conversations` R+W | App calls this directly. Blocking dependency for the driver lane specifically | ✅ |
| `fn_ensure_trip_party_conversations`, `fn_post_system_message_to_trip_chats`, `fn_post_system_log_to_trip_chats`, `fn_broadcast_trip_status_to_chat` | `trip_messages`/`trip_conversations` W | No app RPC call sites — these are trigger-invoked or called by other SQL functions, not directly by the client. Still real writers, just not client-facing | 📛 |
| `submit_atomic_feedback`, `confirm_trip_feedback`, `fn_post_trip_feedback_prompt_to_chats` | `trip_messages` W (posts feedback-prompt/confirmation as chat messages) | App calls `submit_atomic_feedback`/`confirm_trip_feedback`/`fn_post_trip_feedback_prompt_to_chats` directly per the RPC grep. A separate, real writer into the legacy table that isn't part of the "normal message send" path — needs covering in the migration, not just the main `send_trip_chat_message` RPC | ✅ |
| `submit_trip_feedback` | ❓ | No direct app call site found (only `submit_atomic_feedback` and `confirm_trip_feedback` matched) — possibly superseded by those two. Needs a decision (deprecate vs. still-used-somewhere-not-grepped) before assuming safe to leave behind | ❓ |

## New/canonical tables (`chat_messages`, `chat_conversations`)

| Function/Consumer | Table(s) | Classification | Confidence |
|---|---|---|---|
| `fn_chat_mirror_trip_message_insert`/`_update` (triggers) | `chat_messages` W | Populates the canonical table from the legacy write path — this *is* the dual-write | ✅ |
| `fn_chat_sync_conversation_on_message` (trigger) | `chat_conversations` W | Canonical conversation sync | ✅ |
| `fn_chat_message_audit` (trigger) | `chat_audit_log` W | Canonical audit trail | ✅ |
| `get_chat_inbox`, `get_chat_messages`, `search_chat_messages`, `send_chat_message`, `toggle_chat_reaction`, `ensure_chat_channel`, `ensure_direct_chat` | `chat_messages`/`chat_conversations` R+W | **App calls all of these directly** per the RPC grep — meaning there is already a live, parallel client code path reading/writing the canonical schema *directly*, separate from the legacy `send_trip_chat_message`/`get_multi_lane_bootstrap` path. This is important: some readers have **already migrated**, or were built canonical-first and never touched the legacy tables. The reader migration in Phase 3 is not "start from zero" — it's "find out how much of it already happened" | ✅ |
| `archive_chat_messages` | `chat_messages_archive` (separate archive table, W) | No app call site — background/cron job for the retention policy this review recommended. Already exists; wasn't invented by this review | ✅ |

## What this changes about the migration plan

1. **The reader migration (Phase 3) is partially done already.** `get_chat_inbox`/`get_chat_messages`/`send_chat_message`/`ensure_chat_channel`/`ensure_direct_chat` are live, app-called, canonical-schema RPCs that don't touch the legacy tables at all. Before assuming every reader needs migrating, find out **which UI surfaces call the legacy RPCs (`send_trip_chat_message`, `get_multi_lane_bootstrap`, `windowed_trip_message_history`) versus the canonical ones (`get_chat_inbox` etc.)** — this may turn out to be two genuinely separate features (e.g. "Trip Chat" vs. a newer unified inbox) rather than one feature mid-migration. That distinction changes everything about what "cutover" even means here.
2. **The "Trip Room" feature** (`ensure_trip_chat_room`/`get_trip_chat_room`/`refresh_trip_chat_room_team`, September migration) is a third surface layered on the legacy tables that wasn't accounted for in the root-cause write-cascade analysis. It needs the same trace (does it also get mirrored into `chat_messages`, or is it yet another parallel path?) before Phase 2 declares a canonical model.
3. **`mark_delivered` is dead code as far as I can find** — built, granted, indexed, never called. Worth a decision now (finish it or drop it) rather than migrating unused infrastructure into the canonical schema.
4. **`fetchConversationHistory`'s direct `trip_messages` fallback query is a second reader hiding behind one RPC name** — Phase 3's "move every remaining reader to the canonical schema" needs to catch fallback/error-path queries like this, not just the primary RPC call.

## Still not done — this inventory has its own gaps

- I did not open and read all ~55 function bodies individually — the "📛 Named-inferred" and "❓ Unconfirmed" rows above are exactly where that would matter before Phase 2 formally declares a canonical model.
- Edge Functions, background/cron jobs, and any mobile-native (non-Expo) API surface weren't checked — I only have visibility into this repo's `supabase/migrations/` and app code.
- Notifications/push (`fn_enqueue_chat_push_outbox`) and search (`search_chat_messages`) are named but not individually traced for which table they actually read from at query time versus what their name suggests.
- The observability dashboard (writes/message, trigger executions/message, signed-URL generation rate, etc.) recommended alongside this inventory has not been built — that's instrumentation work, not something derivable from reading migrations.
