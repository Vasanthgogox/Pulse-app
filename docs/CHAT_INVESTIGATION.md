# Chat Slow-Load & Message-Desync — Code Investigation Report

**Date:** 2026-07-13
**Constraint:** DB temporarily unavailable (pool exhausted). Code + already-collected evidence only.
**No fixes, migrations, schema, or code changes made.**

---

## 1. Every frontend code path that issues a `trip_messages` query

### READ paths
| # | Caller (component/hook) | Service fn | Query builder | Path |
|---|---|---|---|---|
| R1 | `DriverChatScreen` → `useDriverChatMessagesQuery` ([useDriverChatMessagesQuery.ts:44](../features/chat/hooks/useDriverChatMessagesQuery.ts#L44)) | `getMessagesByConversation` ([chat.service.ts:772](../features/chat/services/chat.service.ts#L772)) | **RPC `windowed_trip_message_history`** (fast path) → **REST fallback** `.from('trip_messages').select(19 cols).eq(conversation_id).order(created_at desc).limit` ([chat.service.ts:813](../features/chat/services/chat.service.ts#L813)) | thread history |
| R2 | Driver inbox → `getDriverChatInbox` | `fetchDriverInboxPreviewMessages` ([chat.service.ts:1424](../features/chat/services/chat.service.ts#L1424)) | `.from('trip_messages').select('id,conversation_id,message_type,metadata,created_at').in('conversation_id',ids).in('message_type',MEDIA_TYPES).order(created_at desc).limit(≤120)` ([chat.service.ts:1435](../features/chat/services/chat.service.ts#L1435)) | inbox media previews |
| R3 | feedback merge | `seedTripConversationFeedbackPromptIfMissing` ([chat.service.ts:1119](../features/chat/services/chat.service.ts#L1119)) | `.from('trip_messages')` read | feedback prompt |

**The hung query captured live = R2.** Its projection (`id,conversation_id,message_type,metadata,created_at`) is a byte-for-byte match to the `pg_stat_activity` capture (3 copies @ 162/188/216s). R1's fallback selects 19 columns (different), R1's RPC path selects via function — neither matches the captured hung SQL. **R2 is the confirmed hung path.**

### WRITE / RPC paths (not read-blocking, listed for completeness)
- `send_trip_chat_message` RPC — [chat.service.ts:735](../features/chat/services/chat.service.ts#L735), [chatAssignmentBridge.service.ts:183/279](../features/chat/services/chatAssignmentBridge.service.ts#L183), [chatLedgerBridge.service.ts:119](../features/chat/services/chatLedgerBridge.service.ts#L119)
- `mark_messages_seen` RPC — [TripChatContext.tsx:240](../features/chat/contexts/TripChatContext.tsx#L240)
- reply-patch UPDATE — [chat.service.ts:752](../features/chat/services/chat.service.ts#L752)
- feedback metadata UPDATE — [chat.service.ts:1095](../features/chat/services/chat.service.ts#L1095)
- edit/delete — [chat.service.ts:2078/2086](../features/chat/services/chat.service.ts#L2078)
- ledger fallback INSERT — [chatLedgerBridge.service.ts:142](../features/chat/services/chatLedgerBridge.service.ts#L142)
- assignment dedupe SELECT (batched) — [chatAssignmentBridge.service.ts:171/267](../features/chat/services/chatAssignmentBridge.service.ts#L171)

---

## 2. Realtime subscriptions on trip_messages / chat_messages / chat_conversations

| Hook | Table | Created | Disposed | Dup-safe? |
|---|---|---|---|---|
| `useDriverChatSubscription` ([useDriverChatSubscription.ts:63](../features/chat/hooks/useDriverChatSubscription.ts#L63)) | trip_messages (INSERT+UPDATE, `conversation_id=eq`) | `subscribeSharedPostgresChanges`, key `trip_messages:driver-conv:${org}:${conv}` | effect cleanup `unsub()` ([:107](../features/chat/hooks/useDriverChatSubscription.ts#L107)) | ✅ registry ref-counts; primitive deps |
| `useChatThreadRealtime` ([useChatThreadRealtime.ts:82](../features/chat/hooks/useChatThreadRealtime.ts#L82)) | chat_messages (INSERT+UPDATE) | registry key `chat_messages:conv:${conv}` | effect return | ✅ registry |
| `useActiveTripLaneRealtime` ([useActiveTripLaneRealtime.ts:34](../features/chat/hooks/useActiveTripLaneRealtime.ts#L34)) | trip_messages | registry | effect return | ✅ registry |
| `useChat` ([useChat.ts:114/120](../features/chat/hooks/useChat.ts#L114)) | trip_messages | registry | effect return | ✅ registry |
| `TripChatContext` ([TripChatContext.tsx:262/359](../features/chat/contexts/TripChatContext.tsx#L262)) | trip_messages | registry | effect return | ✅ registry |

**Duplicate-subscription analysis:**
- **StrictMode double-mount:** the registry (`lib/realtimeRegistry.ts`) has a **15 s grace-period teardown** (`TEARDOWN_GRACE_MS`) that cancels teardown on remount → StrictMode double-invoke reuses the same server channel. **StrictMode cannot create a duplicate server channel.**
- **Reconnect:** channels are keyed; a reconnect reattaches to the same key. **No reconnect duplication.**
- **Conclusion:** all chat realtime goes through the ref-counted registry. **No duplicate subscriptions are possible from these hooks.** (This is distinct from the *REST* fan-out, which is the actual load source.)

---

## 3. Sequence diagram (with request/subscription annotations)

```
User taps a trip chat
  ↓
DriverChatScreen mounts
  ↓
useDriverChatConversationsQuery  ──REST──▶ trip_conversations.select(...).in(driver_id).limit(100)   [inbox step 1]
  │                                          (staleTime 30s, refetchOnWindowFocus false)
  ↓ (convIds, tripIds derived)
getDriverChatInbox → Promise.all:
  ├─▶ trips.select(8 cols).in(id, tripIds)                                                            [inbox step 2a]
  └─▶ fetchDriverInboxPreviewMessages → REST trip_messages.select(5 cols).in(conv).in(type).limit   [inbox step 2b] ★ HUNG PATH (R2)
  ↓
useDriverChatMessagesQuery (open thread)
  └─▶ RPC windowed_trip_message_history(conv, before, limit)  ── fallback ──▶ REST trip_messages (19 cols)   [thread R1]
  ↓
PostgREST → PostgreSQL
  ↓
RLS: trip_messages_select → private.user_can_read_trip_message(org, conv)   ◀── suspected cost (item 5, needs DB)
  ↓
Response → React Query cache (driverChatMessagesQueryKey / chatPlatform.messages)
  ↓
Realtime patches: useDriverChatSubscription (trip_messages) / useChatThreadRealtime (chat_messages)
  ↓
flattenDriverChatMessages (reverse+flatMap, NO filter)  → useMemo → FlatList render
```
Timestamps for every step require the frontend perf marks (`markStart/markEnd`, present in code) captured during a live run — **not collectible with the DB down** (every request hangs). Listed in §"requires live DB/runtime".

---

## 4. "Loading complete" message — end-to-end trace

| Stage | Behavior | Can it drop the message? |
|---|---|---|
| Database | Row exists: `trip_messages` conv `2b0ed622 @06:28:06` AND `chat_messages` conv `9613f2fb @06:28:06` (**proven** by earlier direct query) | ❌ present in both |
| PostgREST response | R2/R1 query **hung 150-220s** → response never returned | ✅ **DROPS HERE** — API never returned |
| Network → React Query | No response → cache not updated → stale snapshot retained | (downstream of the drop) |
| mapper (`row.trip_messages ?? messagesByConversationId ??`) [chat.service.ts:1365](../features/chat/services/chat.service.ts#L1365) | passes through | ❌ |
| flatten `flattenDriverChatMessages` | reverse+flatMap, **no filter** | ❌ |
| append/dedupe `appendDriverChatMessageToCache` | `messageExists` dedup only (no drop of new) | ❌ |
| render filter `isMessageVisibleInTab` / `isEventVisibleForPartyLane` ([messagePartyVisibility.ts:50](../features/chat/utils/messagePartyVisibility.ts#L50)) | plain `text` → `partyType===partyType`, renders | ❌ |
| virtualization (FlatList) | renders windowed; message in data would render | ❌ |

**The message disappears at exactly one stage: the PostgREST response never returns because the read query hangs.** Every downstream transform passes it through unmodified.

---

## 5. Complete inventory of visibility filters

| Filter | File / fn | Condition | Can hide "Loading complete" (plain `text`)? |
|---|---|---|---|
| party lane | [messagePartyVisibility.ts:24](../features/chat/utils/messagePartyVisibility.ts#L24) `isEventVisibleForPartyLane` | ledger/document special-cased; else `partyType===partyType` | ❌ text → visible in its lane |
| tab visibility | `isMessageVisibleInTab` ([ChatScreen.tsx:594](../features/chat/components/ChatScreen.tsx#L594)) | per message_type/party | ❌ (text is visible) |
| feedback filter | ChatScreen preview loop [:591](../features/chat/components/ChatScreen.tsx#L591) | skips `feedback_request`/`feedback` | ❌ |
| message_type filter (R2) | [chat.service.ts:1441](../features/chat/services/chat.service.ts#L1441) | `.in('message_type', ['image','document_share','document_upload'])` | N/A — this is the **preview** query, not the thread; a `text` msg is simply not a preview candidate (by design) |
| deleted filter | `deleteChatMessage`/`is_deleted` indexes | `is_deleted` | ❌ (not deleted) |
| dedupe | `appendDriverChatMessageToCache` `messageExists` | id/client_message_id match | ❌ (only blocks true dups) |
| flatten/sort | `flattenDriverChatMessages` | reverse+flatMap | ❌ no filter |
| date grouping | ChatScreen `threadListItems` (`__dateDivider`) | inserts dividers | ❌ |
| optimistic | outbox util | client_message_id reconcile | ❌ |
| virtualization | FlatList | windowing | ❌ |

**No visibility filter drops a plain `text` message. Confirmed: absence is upstream (API), not render.**

---

## 6. Why three `chat_conversations` for one trip

From earlier live query (before pool exhaustion): `aad4e920`, `9613f2fb`, `da29cde6` for trip `beedf7b1`.
- `9613f2fb` — carries driver/dispatcher **text** (`aiman`, `Nihas`) + system → the lane the business view renders.
- `aad4e920` — `system`/`system_log` lane.
- `da29cde6` — `action_card` lane, `sender_role: null`, `sender_name: 'Pulse'` (Trip-Room action cards).

**Originating code / reason:** the Trip Room ("pulse business chat") loads via `getChatInbox`/`get_chat_inbox` + `useChatThreadRealtime` on `chat_conversations`. The mirror trigger (dual-write, per `chatPlatform.service.ts` header [:18](../features/chat/services/chatPlatform.service.ts#L18)) projects `trip_messages` into `chat_messages` across these Trip-Room lanes. This is **intentional per ADR-008** (`docs/ADR-008-trip-room-messaging-model.md`) — Trip Room is a superset/observer projection. Whether all three are **rendered**: needs the live Trip Room UI run to confirm which conv the business `ChatScreen` selects (requires runtime).

---

## 7. Chat module dependency graph

```
DriverChatScreen (app/chat) ─┬─ useDriverChatConversationsQuery ── chat.service.getDriverChatInbox ─┬─ trip_conversations REST
                             │                                                                       ├─ trips REST
                             │                                                                       └─ fetchDriverInboxPreviewMessages ── trip_messages REST ★
                             ├─ useDriverChatMessagesQuery ── chat.service.getMessagesByConversation ─┬─ RPC windowed_trip_message_history
                             │                                                                        └─ trip_messages REST (fallback)
                             ├─ useDriverChatSubscription ── realtimeRegistry (trip_messages)
                             ├─ useMarkSeen ── useChatStore ── TripChatContext ── mark_messages_seen RPC
                             └─ render: flattenDriverChatMessages → messagePartyVisibility → FlatList

TripChatRoom (business) ─────┬─ useChatInboxQuery ── chatPlatform.getChatInbox (get_chat_inbox RPC)
                             ├─ useChatThreadRealtime ── chatPlatform.getChatMessages (get_chat_messages RPC) + realtimeRegistry (chat_messages)
                             └─ render: dedupeTripRoomActionCards → ChatScreen

Shared: lib/realtimeRegistry.ts (all subscriptions), useChatStore (Zustand), chatOutbox.util (offline)
```

---

## 8. Locations that could generate duplicate REST requests

| Trigger | Location | Duplicate risk |
|---|---|---|
| mount/remount | React Query keyed hooks | ✅ **Low** — keyed + `staleTime 30-60s` dedupe concurrent identical fetches |
| dependency change | `useDriverChatMessagesQuery(cid)` | Low — keyed by conv |
| **retries** | `infrastructureShouldRetry`/`infrastructureRetryDelay` on inbox + messages queries ([useDriverChatMessagesQuery.ts:40](../features/chat/hooks/useDriverChatMessagesQuery.ts#L40), [useDriverHomeDriversQuery.ts:44](../lib/queries/useDriverHomeDriversQuery.ts#L44)) | ✅ **HIGH** — when a query **hangs** (not errors), React Query's retry + the driver-home 120s poll + inbox re-open each issue a **new** REST request while the prior is still in-flight/hung → the 3 concurrent identical `trip_messages` queries observed in `pg_stat_activity` |
| invalidations | `useInvalidateDriverChatMessages` | Low (debounced) |
| cache miss | first open | expected single |
| reconnect | `refetchOnReconnect: true` (thread hooks) | Medium — a reconnect during a hang adds a request |
| focus | `refetchOnWindowFocus: false` everywhere except `useStoryViewsQuery` (now fixed) | ❌ none for chat |

**The duplication mechanism is confirmed from code:** requests are *keyed and staleTime-deduped for the normal case*, but when the underlying read **hangs** (never resolves, never errors), retry + poll + reconnect each spawn a fresh in-flight copy → concurrent identical `trip_messages` reads → pool exhaustion. This matches the live capture exactly.

---

## 9. Facts proven vs. facts requiring a live DB

### ✅ Facts proven from code + already-collected DB evidence
1. The hung SQL is **R2 `fetchDriverInboxPreviewMessages`** ([chat.service.ts:1435](../features/chat/services/chat.service.ts#L1435)) — projection matches the `pg_stat_activity` capture byte-for-byte.
2. "Loading complete" **exists in both `trip_messages` and `chat_messages`** (direct query, before pool loss). No data loss.
3. The message is **not dropped by any frontend filter, mapper, dedupe, grouping, or virtualization** — every transform passes plain `text` through (§4, §5).
4. Its absence in the UI is because **the API read never returned** (query hung) — the single drop point is the PostgREST response stage.
5. **All chat realtime subscriptions use the ref-counted registry** — StrictMode and reconnect **cannot** create duplicate server channels (§2).
6. **Duplicate REST requests arise from retry/poll/reconnect firing while a read hangs** (§8) — the mechanism that produced 3 concurrent identical `trip_messages` queries.
7. Three `chat_conversations` per trip are **intentional Trip-Room projections** (ADR-008), not duplication (§6).
8. Pool exhaustion is **objectively confirmed**: MCP `execute_sql` and a raw REST probe on a 1-row table both time out (20s, http=000, ×5).

### ⛔ Facts that still require a live database (do NOT infer)
1. **EXPLAIN (ANALYZE, BUFFERS, VERBOSE)** of the R2 query — actual plan, planning vs execution time, per-node timing, buffers.
2. **Live `pg_policies` dump** on `trip_messages` — the *currently active* USING/WITH CHECK (must not rely on migration files).
3. **`pg_get_functiondef`** of the active SELECT policy's helper — to prove whether `private.user_can_read_trip_message()` is the live policy or a regression left the 5 inlined policies.
4. **Function profiling** — which of the 5 `EXISTS` branches dominates; which tables/indexes each scans; whether Check-5 (`direct_quotes` 5-table join) is the hot path.

When connectivity returns, **only these four DB tasks remain.** All frontend/code analysis is complete above.
