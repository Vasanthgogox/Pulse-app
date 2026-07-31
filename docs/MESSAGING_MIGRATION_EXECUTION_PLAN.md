# Messaging Migration Execution Plan

**Status: Draft — awaiting review. No database or migration changes have been made under this plan.** This document is the execution detail for `docs/MESSAGING_CONSOLIDATION_DESIGN.md` (MCD, approved in principle) and resolves ADR-008. Per explicit instruction, nothing in Sections 2-8 below has been applied to any environment — this is the plan to review, not a changelog of work already done.

Every release below is independently deployable and independently rollback-able. No release depends on a later release having already shipped; a release can stop at any point and the system is left in a fully working, if not-yet-fully-migrated, state.

## 0. Platform-Wide Messaging Dependency Audit

Every row below is from reading the actual RPC/component/migration source, not inferred from naming. Confidence key matches the existing `REALTIME_MESSAGING_ARCHITECTURE_REVIEW.md` convention: **✅ Verified** (read the function body and the call site), **⚠️ Partial** (some paths canonical, some not — a single readiness label would misrepresent it), **❌ Not canonical** (confirmed legacy-only).

| Surface | Creates conversation | Sends message | Realtime subscribes to | Renderer | Canonical-ready? | Migration release |
|---|---|---|---|---|---|---|
| **Driver App** | `ensure_driver_trip_conversation` (RPC) → `trip_conversations` only | `send_trip_chat_message` (RPC) → `trip_messages`, forward-mirrored to `chat_messages` | `trip_messages` + `trip_conversations` (`DriverChatContext.tsx`) | `DriverChatSlackThread.tsx` | ❌ | **R3** |
| **Dispatcher / Client / Supplier** (per-lane) | `getOrCreateConversation` (`chat.service.ts`) → direct client-side `upsert` into `trip_conversations` for client/supplier; delegates to `ensure_driver_trip_conversation` when party type is driver | `sendChatMessage` → `send_trip_chat_message` (same RPC as Driver App) | `trip_messages` + `trip_conversations`, subscribed directly in `TripChatContext.tsx` | Rendered inside `ChatScreen.tsx` via `TripChatContext` — **shares a screen with Unified Inbox, see below** | ❌ | **R4** |
| **Unified Inbox / Trip Room** | `ensure_trip_chat_room` (RPC) → `chat_conversations` directly | `send_chat_message` (canonical) for new messages — **but** `toggleMessageReaction`/`updateChatMessageContent`/`deleteChatMessage` (edit, delete, react) call the *legacy* `chat.service.ts` functions that write `trip_messages`, relying on `fn_chat_mirror_trip_message_update` to reach `chat_messages` | `chat_messages` directly (`useChatThreadRealtime.ts`) — **but the same screen (`ChatScreen.tsx`) is also wrapped in both `TripChatProvider` and `IntegratedChatProvider`**, so it has three live realtime subscriptions open simultaneously (`chat_messages`, `trip_messages`/`trip_conversations`, `network_conversations`/`network_messages`), not one | `ChatScreen.tsx` | ⚠️ **Partial** — creation and new-message-send are canonical; edit/delete/react are not; the screen's realtime footprint is the largest of any surface audited | **R3a** (new — edit/delete/react must migrate to canonical equivalents, and `ChatScreen.tsx`'s dependency on `TripChatProvider` must be re-examined, before the reverse-mirror can ever be dropped for this screen) |
| **Network** (org-to-org, non-trip) | `getOrCreateNetworkConversation` → `network_conversations` | `sendNetworkMessage` → `network_messages` | `network_conversations` + `network_messages` (`IntegratedChatContext.tsx`) | Consumed inside `ChatScreen.tsx` via `IntegratedChatContext` | ❌ — and structurally separate: no mirror trigger targets `network_*` tables at all, so it isn't even partially on the migration path this MCD covers | **Out of scope** (per MCD Section 2 — needs its own MCD later) |

**What this changes about the plan:**

1. **R3 is bigger than originally scoped.** It's not "flip one RPC for the driver lane" — it's `send_trip_chat_message` *and* `ensure_driver_trip_conversation` together (Section header finding, now folded into this table), because the second is a hard dependency of the first actually working end-to-end.
2. **R4 was previously described as "same mechanism as R3, proven once already" — that's only true for the send path.** Dispatcher/Client/Supplier share `getOrCreateConversation`, which has its own separate legacy-write branch (a direct `upsert`, not even an RPC) that also needs migrating — not just re-flagging the same flag for a new lane.
3. **A new release, R3a, is required and wasn't in the original plan at all**: Unified Inbox looked "already canonical" in the MCD's first pass because its *message send and creation* paths are — but edit/delete/react are not, and discovering that during R6 (when the reverse mirror is finally dropped) would silently break editing/deleting/reacting to messages in the platform's most-used inbox screen. This is exactly the kind of failure the audit was commissioned to catch before it happens in production.
4. **`ChatScreen.tsx` carrying three simultaneous realtime subscriptions is worth flagging as its own finding**, independent of the write-cascade problem: even after R6, if `TripChatProvider`/`IntegratedChatProvider` are still wrapping this screen for legacy reasons, that's three open channels for what should eventually be one. Not fixed by this plan — flagged for the same future MCD that covers Network's retirement.
5. **Network is confirmed structurally separate** — verified there is no mirror trigger of any kind touching `network_conversations`/`network_messages`. This isn't a smaller version of the same migration; it's an unrelated legacy system that happens to be consumed by the same `ChatScreen.tsx` component. Left fully out of scope, as already stated in the MCD.

---

## 1. Release-by-Release Migration Strategy

| Release | What ships | App code changes required? | Risk |
|---|---|---|---|
| **R0** | Baseline metrics capture (Section 5) | None — read-only queries against prod | None |
| **R1** | Additive schema migration: `chat_visibility_scope` enum, `chat_messages.visibility`/`event_kind` columns, `message_type` CHECK extension (`pod_uploaded`, `kyc_status_update`, `commission_credited`); **plus a production bug fix unrelated to the migration itself, surfaced by Section 9's failure-injection review**: wrap `fn_chat_mirror_trip_message_insert`/`_update` in exception handling so a mirror-side failure can no longer roll back the user's primary message send | None for the schema addition; the trigger fix changes existing behavior (currently: mirror failure kills the send; after: it doesn't) | Near-zero for the schema; the trigger fix is a correctness improvement to *today's* production code, worth its own isolated deploy and rollback test before bundling with anything else |
| **R2** | App reads made resilient to either schema shape (dual-shape response mapping in `chat.service.ts`/`chatPlatform.service.ts`); **no write-path change yet** | Yes — this is the "prepare readers" release | Low — this ships and soaks *before* anything about writes changes, so any bug here is caught with the old write path still fully active |
| **R3** | `send_trip_chat_message` body flip to write `chat_messages` directly, **driver lane only**, behind a feature flag (`messaging_canonical_write_driver_lane`); reverse mirror (`chat_messages` → `trip_messages`) activated simultaneously; **`ensure_driver_trip_conversation` migrated in this same release** to resolve/create the `chat_conversations` row directly (see Section 0) — without this, R3 has no canonical conversation to attach messages to; **`send_trip_chat_message` gains an optional `p_client_message_id uuid DEFAULT NULL` parameter** (Section 9, scenario 6 — the RPC has no idempotency key today, so offline-retry dedupe isn't reachable through it even once it targets `chat_messages`) | No for the two existing RPC contracts (Section 6); the new optional parameter is additive, old callers unaffected | Medium — first real write-path change, scoped to the smallest reader set (per the existing reader inventory) |
| **R4** | Flag expanded to dispatcher/client/supplier lanes, one at a time, each held for observation before the next; **`getOrCreateConversation`'s client/supplier branch migrated off its direct `trip_conversations` upsert** in the same release (Section 0) — this is a separate legacy write path from `ensure_driver_trip_conversation`, not the same fix reapplied | Yes — `getOrCreateConversation` body changes (contract can stay stable per Section 6's guarantee) | Medium — same mechanism as R3 proved once, but a genuinely separate code path, not a re-flag |
| **R3a** | *(new, inserted after R3/R4 rather than at the end — must land before R6, since R6 is what would otherwise silently break it)* Migrate `toggleMessageReaction`/`updateChatMessageContent`/`deleteChatMessage` to canonical `chat_messages`-targeting equivalents; re-evaluate whether `ChatScreen.tsx` still needs `TripChatProvider` wrapping it once R4 completes (Section 0) | Yes — `ChatScreen.tsx`'s edit/delete/react handlers repoint to new service functions | Medium — narrow in code surface, but this is the platform's most-used inbox screen, so regression blast radius is high even though the change itself is small |
| **R5** | Remaining direct legacy writers migrated: `submit_atomic_feedback`, `confirm_trip_feedback`, `fn_post_trip_feedback_prompt_to_chats`, and the three untraced operational-status triggers (`trip_messages_sync_operational_to_lanes`, `trg_sync_operational_status`, `trg_mirror_operational_to_trip_room`) — each gets its own trace-then-migrate, not a single bulk change | Possibly, per call site | Medium — this is the "long tail" the existing review flagged as unfinished tracing; treat each as its own mini-release |
| **R6** | Retirement gate (Section 1 of MCD, Section 5) closes; reverse mirror and legacy triggers dropped; legacy tables kept but read-only/archived, not deleted, pending a separate future decision. **Gated on R3a being complete** — dropping the mirror before R3a ships would break Unified Inbox's edit/delete/react silently | No | Low — by this point nothing writes the legacy tables; dropping the *sync mechanism*, not the data |

### 1a. Release Exit Criteria

Each release is complete when its criteria below hold — not when the code has merely been deployed. A release that's deployed but hasn't met its exit criteria stays in observation; the next release does not start.

**R1 Exit**
- Migration applies cleanly and its down-migration has been executed at least once in staging (not just written).
- `event_kind` backfill matches the mapping table for 100% of existing rows (validation query 3.4 returns zero anomalies).
- Zero application error-rate change attributable to the new columns (nothing reads/writes them yet, so any change indicates something else broke).

**R2 Exit**
- Every reader surface in Section 0's matrix renders correctly regardless of whether the underlying row is legacy- or canonical-shaped.
- Dual-subscription (Section 7.1) verified live in staging: a message written to either table appears in the relevant UI with no reload.
- No increase in client crash rate or error rate post-deploy.

**R3 Exit**
- No new writes to `trip_messages`/`trip_conversations` for driver-lane conversations specifically (validation query 3.2, filtered by lane, not in aggregate).
- Message-send p95 latency within target of the R0 baseline (see Section 4 — this is not evaluable until baseline metrics exist).
- Reverse mirror confirmed populating `trip_messages` correctly for the driver lane (query 3.5 returns zero mismatches).
- Rollback executed at least once in staging: flag flipped off, driver lane reverts to legacy write, zero data loss confirmed.

**R4 Exit**
- Conversation creation for dispatcher/client/supplier lanes verified canonical — no new `trip_conversations` rows for migrated lanes.
- Conversation parity holds for all lanes, not just driver (query 3.1, extended).
- No orphaned conversations: every `chat_conversations` row created is reachable by every party who should see it, and no legacy row exists with no canonical counterpart for a migrated lane.

**R3a Exit**
- Edit/delete/react calls target `chat_messages` exclusively — verified by temporarily disabling `fn_chat_mirror_trip_message_update` in staging and confirming edit/delete/react still function correctly (if they break, something still depends on the mirror for these actions).
- `ChatScreen.tsx`'s dependency on `TripChatProvider` is either removed, or its continued necessity is explicitly documented (not left ambiguous).

**R5 Exit**
- Each of the five long-tail writers (Section 1, R5 row) individually confirmed migrated, or explicitly signed off as intentionally-still-legacy with a named owner and reason.
- No remaining `INSERT INTO trip_messages` from any code path except the reverse mirror trigger itself.

**R6 Exit**
- Zero production reads/writes to legacy messaging tables.
- Mirror disabled.
- Legacy tables retained read-only during an observation window (length TBD — tie to the app-version telemetry recommended in Section 7.3, not a fixed calendar guess).
- Deprecation metrics (Section 4/6) show no regressions against the R0 baseline.
- R3a's exit criteria already satisfied (hard gate, not a parallel checklist item).

---

## 9. Failure Injection / Rollback Validation

Walked through, not just described — each scenario below traces to the actual code path involved. Every one needs a documented expected outcome before R1 is approved; "should be fine" is not a documented outcome.

**1. Canonical send RPC fails** (`send_trip_chat_message`'s flipped body errors writing `chat_messages`). *Expected*: the RPC raises, the client sees the same error contract it sees today, the existing "message failed — tap to retry" UI handles it (already built, since sends can fail today too). Nothing partially written — the RPC's write is one statement in one transaction. *Rollback*: not applicable per-message — this is normal error handling, not a migration-specific failure mode.

**2. Legacy mirror trigger fails** (forward mirror pre-R3, or reverse mirror R3+). **Checked, not assumed — and it's worse than a hypothetical.** `AFTER INSERT`/`AFTER UPDATE` triggers run inside the *same transaction* as the primary write, so an unhandled exception in the trigger rolls back the whole transaction, including the primary message. I read `fn_chat_mirror_trip_message_insert`'s actual body (`20260917000000_pulse_chat_platform_foundation.sql:600-631`): **it has no `BEGIN...EXCEPTION WHEN OTHERS` block at all** — a plain `BEGIN...END`. This means the risk isn't specific to a future reverse mirror; **the forward mirror running in production today has no protection against a mirror-side failure taking down the user's actual message send.** *Expected outcome today, unverified in production but consistent with the code*: if `fn_chat_ensure_conv_for_trip_lane` or the `chat_messages` INSERT inside this trigger ever throws (e.g. a future constraint added to `chat_messages` that an old-shaped mirrored row violates), the *original* `trip_messages` INSERT fails too, and the user sees "message failed to send" for a write that had nothing wrong with it. **Recommendation, added to R1's scope, not deferred**: wrap `fn_chat_mirror_trip_message_insert`/`_update` in an exception handler that logs and swallows rather than propagates, before any other release ships — this is a live production correctness gap this audit surfaced, independent of the migration itself, and the new reverse mirror (R3) must be built with this from day one rather than repeating the same gap.

**3. Realtime disconnect during migration.** *Expected*: standard Supabase client reconnect + a full re-fetch via the bootstrap RPC covers whatever was missed during the gap — this is unchanged from today's existing disconnect handling. The migration doesn't introduce a new failure mode here as long as R2's dual-subscription (Section 7.1) is live during the transition window; it does if R2 ships without it, which is why Section 7.1 treats dual-subscription as a hard requirement, not a nice-to-have.

**4. Offline client reconnects after schema change.** *Expected*: queued RPC calls succeed (Section 5 guarantee 1 — signature stable). The risk is entirely in Section 5 guarantee 3 (the `unread_dispatcher_count` compatibility shim) actually returning a real value rather than `null`/`undefined` that could crash an old client's render — this needs an explicit test with an old app build against a post-migration backend, not an assumption that the shim "should" work.

**5. Mixed app versions operate simultaneously.** *Expected*: an old-version client and a new-version client in the *same conversation* see the same messages, in the same order, with consistent read state — this is the actual bar, not just "both apps don't crash." **Test method**: run an old and new build against the same staging backend side by side, in the same conversation, and diff what each renders. This is an ongoing steady state for the entire migration window (R3 through R6), not a one-time gate.

**6. Duplicate retry from offline idempotency.** **This one surfaced a real, previously-unflagged gap by actually checking the signature.** `chat_messages.client_message_id` has a unique index and is genuinely idempotent for callers that pass it — but **`send_trip_chat_message`'s actual signature (confirmed by reading `20260728290000_fix_chat_image_storage_rls.sql`) has no `client_message_id` parameter at all**: `p_conversation_id, p_content, p_sender_role, p_sender_name, p_sender_user_id, p_message_type, p_metadata`. That means even after R3 points this RPC at `chat_messages`, **calling it twice (an offline retry) creates two rows** — the idempotency guarantee the canonical schema was built for isn't reachable through this call path. *Required fix, added to R3's scope*: add an optional `p_client_message_id uuid DEFAULT NULL` parameter to `send_trip_chat_message` (a signature *addition*, not a break — old callers that don't pass it get today's exact behavior, satisfying Section 6's stability guarantee) and thread it through from `sendChatMessage()`/`sendDriverChatMessage()`, generating a client-side UUID once per compose action the same way the canonical `send_chat_message` path already does.

**7. Conversation created via legacy path while another client already created the canonical one (race).** *Checked, not assumed*: `chat_conversations` already has a partial unique index — `ON CONFLICT (trip_id) WHERE conversation_type = 'trip' AND trip_id IS NOT NULL` (confirmed in `20260918000000_trip_chat_room_phase2.sql`, backing `fn_ensure_trip_chat_room`'s atomic upsert). *Expected*: safe, **as long as the migrated `ensure_driver_trip_conversation` (R3) and the migrated `getOrCreateConversation` (R4) reuse this same index and `ON CONFLICT` pattern** rather than a plain "SELECT then maybe INSERT" (the exact race the original architecture review flagged as unverified for the legacy `fn_chat_ensure_conv_for_trip_lane`). This is a concrete acceptance check for R3/R4's code review, not just a design intent.

**Explicit non-goal for this plan**: dropping `trip_messages`/`trip_conversations` data outright. R6 stops the sync/trigger machinery; a future, separate decision (with its own retention/compliance review) covers whether/when the historical tables themselves are ever deleted.

---

## 2. Rollback Procedures — Per Release

**R1 (schema)**: `DROP COLUMN` for `visibility`/`event_kind`, `DROP TYPE chat_visibility_scope`, revert the `message_type` CHECK constraint to its prior `ADD CONSTRAINT` definition (each CHECK-constraint change in this codebase is already `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`, so reverting is re-running the previous migration's version of that block). No data loss risk — nothing has been written to the new columns by anything except a backfill this plan controls.

**R2 (dual-shape readers)**: standard app rollback — revert to the prior build. The backend hasn't changed, so an app rollback here is a pure client-side revert with no data-state implications.

**R3/R4 (write-path flip)**: **the feature flag is the rollback mechanism**, not a migration. Flipping `messaging_canonical_write_driver_lane` (and the per-lane flags in R4) back off immediately reverts `send_trip_chat_message` to writing `trip_messages` first, with the forward mirror (legacy→canonical) still intact from before R1 touched anything — because the forward mirror is **not removed until R6**, rolling back R3/R4 doesn't lose any canonical-side data; it just stops it being the primary write. Any message written to `chat_messages` directly during the R3/R4 window (via the reverse mirror) stays there; nothing needs to be un-written.

**R5 (long-tail readers)**: each of the traced writers is migrated independently — rollback is per writer (revert that one RPC/trigger to its legacy-table version), not a single all-or-nothing switch.

**R6 (retirement)**: this is the one release where rollback is **not instantaneous** — dropping the reverse mirror trigger means legacy tables stop receiving new rows. Rollback requires re-creating the trigger (the migration that drops it should be written as a paired up/down pair, kept for one additional release cycle past R6 before the down-migration itself is deleted) rather than assuming it's never needed.

---

## 3. Data Migration Validation Queries

Run before and after **every** release from R1 onward — these are the queries that prove "nothing diverged," not aspirational monitoring.

```sql
-- 3.1 Row-count parity: every trip conversation should have exactly one
-- canonical counterpart (post-R1, this should already be true from the
-- existing forward mirror; it's the regression guard for R3+).
SELECT
  (SELECT count(*) FROM trip_conversations) AS legacy_conversations,
  (SELECT count(*) FROM chat_conversations WHERE legacy_trip_conversation_id IS NOT NULL) AS mirrored_conversations;
-- Expect equal, always, until R6.

-- 3.2 Message parity within a lookback window (adjust interval per release cadence).
SELECT
  (SELECT count(*) FROM trip_messages WHERE created_at > now() - interval '1 day') AS legacy_msgs_24h,
  (SELECT count(*) FROM chat_messages WHERE legacy_source = 'trip' AND created_at > now() - interval '1 day') AS mirrored_msgs_24h;
-- Pre-R3: expect equal (forward mirror). Post-R3 (driver lane): legacy count should
-- start exceeding mirrored count for driver-lane conversations specifically, because
-- those messages now land in chat_messages FIRST with no forward mirror needed —
-- verify by lane, not in aggregate, or this query gives a false positive alarm.

-- 3.3 Orphan check: no chat_messages row without a resolvable conversation.
SELECT count(*) FROM chat_messages m
LEFT JOIN chat_conversations c ON c.id = m.conversation_id
WHERE c.id IS NULL;
-- Expect 0, always.

-- 3.4 event_kind backfill correctness (post-R1 backfill of existing rows).
SELECT message_type, event_kind, count(*)
FROM chat_messages
GROUP BY message_type, event_kind
ORDER BY message_type;
-- Cross-check every message_type against the mapping table in MCD Section 1.1a —
-- any message_type appearing under the wrong event_kind is a backfill bug.

-- 3.5 Reverse-mirror consistency (R3 onward): every chat_messages row written
-- during the flag-on window for a driver-lane conversation should have a
-- matching trip_messages row (the safety-net mirror going the other direction).
SELECT count(*) FROM chat_messages m
JOIN chat_conversations c ON c.id = m.conversation_id AND c.conversation_type IN ('trip','trip_lane')
LEFT JOIN trip_messages tm ON tm.id = m.id  -- reverse mirror preserves id per existing convention
WHERE m.created_at > '<flag-flip-timestamp>' AND tm.id IS NULL;
-- Expect 0 for driver-lane conversations while the reverse mirror is active.

-- 3.6 Unread-count divergence check (the two systems' denormalizations, per
-- the existing review's Problem #3) — should trend toward zero divergence
-- as lanes migrate, never increase.
SELECT tc.id, tc.unread_dispatcher_count, cc.message_count, cc.id AS canonical_id
FROM trip_conversations tc
JOIN chat_conversations cc ON cc.legacy_trip_conversation_id = tc.id
WHERE tc.unread_dispatcher_count IS DISTINCT FROM
  (SELECT count(*) FROM chat_messages WHERE conversation_id = cc.id AND /* unread predicate */ true);
```

---

## 4. Performance Benchmarks — Before and After Each Phase

**Baseline (R0, before anything ships)** — capture and store these, they're the comparison point for every subsequent release, not just the final one:

```sql
-- Write volume per table (confirms the existing review's 5-6 writes/message claim)
SELECT relname, n_tup_ins, n_tup_upd
FROM pg_stat_user_tables
WHERE relname IN ('trip_messages','trip_conversations','chat_messages','chat_conversations','chat_audit_log')
ORDER BY relname;

-- Trigger execution counts and total time (needs pg_stat_statements or explicit
-- trigger-level instrumentation — confirm which is available before relying on this)
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
WHERE query ILIKE '%trip_messages%' OR query ILIKE '%chat_messages%'
ORDER BY total_exec_time DESC;
```

Capture the same two queries after **every** release (R1 through R6), plus:

| Metric | How measured | Target trend |
|---|---|---|
| DB writes/message (steady state) | `pg_stat_user_tables` delta over a fixed message-volume window | 5 → 2 by R6 |
| Message-send p50/p95/p99 latency | App-side instrumentation around `sendChatMessage()`/`send_chat_message()` — **not yet built**; add this in R2 alongside the dual-shape reader work, since R3 needs a before/after number and there isn't one today | Flat or improving; a regression here blocks progressing past that release |
| Realtime channel count | `lib/realtimeRegistry.ts` already exposes channel accounting (confirmed healthy in the existing review) — snapshot its metrics pre/post each release as a regression guard, not a fix target | Flat |
| Postgres connection count / CPU during peak messaging window | `pg_stat_activity` snapshot during a known peak window, before and after | Flat or improving |
| Duplicate-message rate | `SELECT conversation_id, client_message_id, count(*) FROM chat_messages WHERE client_message_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1` | 0, always — `client_message_id`'s unique index should already guarantee this; use it to confirm the assumption, not just trust it |
| Image/document upload success rate | Not yet instrumented — needs its own counter (success/failure/retry) independent of the chat migration, since Phase A's "fix image upload reliability" item has a different root cause than the dual-write and needs its own baseline |

**Gate**: no release proceeds to the next if p95 send latency regresses more than 10% or any validation query in Section 3 returns an unexpected non-zero — these are automated checks to run in CI/staging before each release, not just production observation after the fact.

---

## 5. Backward Compatibility Guarantees

1. **`send_trip_chat_message`'s signature never changes** across R1-R6 — `p_conversation_id`, `p_content`, `p_sender_role`, `p_sender_name`, `p_sender_user_id`, `p_message_type`, `p_metadata` stay exactly as they are today. Every release changes the RPC's *body*, never its *contract*. This is the single guarantee everything else in this plan leans on.
2. **`send_trip_chat_message`'s return shape stays field-compatible.** The RPC returns a `TripMessageRow`-shaped object today; post-flip it must still return every field old app code destructures (`id`, `conversation_id`, `content`, `sender_role`, `sender_name`, `created_at`, `message_type`, `metadata`, etc.) even if the underlying row now physically comes from `chat_messages` — a compatibility view or an explicit field-mapping in the RPC's `RETURNS` clause, not a raw `SELECT *` that happens to differ.
3. **`unread_dispatcher_count` needs an explicit compatibility shim, not a field rename.** The canonical schema's unread model is genuinely different — per-participant `last_read_at`, not a single shared counter (confirmed in `20260917000000_pulse_chat_platform_foundation.sql`'s own comment: *"Read receipts model: per-participant last_read_at is the primary unread/tick"*). An old app reading `trip_conversations.unread_dispatcher_count` needs that value computed and kept populated (e.g. count of messages after the dispatcher-role participant's `last_read_at`) for as long as any app version in the wild still reads it — this is real, additional compatibility work, not a rename, and should be scoped explicitly in R2.
4. **Offline-queued sends remain valid.** Because the RPC signature is stable (guarantee 1) and `client_message_id` already provides idempotent dedupe on the canonical table, a driver who queues a message offline before a release and sends it after the release ships resolves correctly either way — this is an existing property of the canonical schema, not new work, but it should be explicitly tested (Section 8) rather than assumed.
5. **No release schema-migrates away anything the previous release's app build still reads.** Concretely: R1 only adds columns/types (nothing removes). R6 only removes triggers/mirrors, and only after Section 1's retirement gate confirms no reader depends on them.

---

## 6. Zero-Downtime Deployment Sequence

Ordering rules, applied to every release above:

1. **Schema changes deploy before the app code that depends on them, never together.** R1 (schema) fully lands and is confirmed stable before R2 (app code) ships — R2's app code should work identically whether R1's new columns exist or not (defensive reads), so the two are decoupled even though they're sequenced.
2. **Feature flags gate every write-path change** (R3, R4) — the flag flip is a config change, not a deploy, so it can be reverted in seconds without a rollback deploy. Flip flags one lane, one organization cohort, or one percentage tranche at a time; never a global flip.
3. **The reverse mirror activates in the same transaction/migration as the flag it protects**, never after — there is no window where writes flow to `chat_messages` without the safety net already in place.
4. **Nothing is dropped (trigger, column, table) in the same release that stops depending on it.** Always one release of "stopped using it, still present" before "removed" — this is what makes every step in Section 2 revertible.
5. **Reads are migrated (R2) strictly before writes are flipped (R3)** — by the time R3 ships, every app surface can already render data from either table shape, so the write flip is invisible to users; if R3 shipped before R2, a user's client wouldn't know how to render a canonical-shaped row it's never seen before.

---

## 7. Risk Assessment

### 7.1 Realtime subscriptions

**Real risk, not hypothetical**: a client subscribed to `trip_messages` via `postgres_changes` receives **nothing** — not an error, just silence — the moment writes stop landing in that table (post-R3 for the driver lane). If R2's dual-shape reader work doesn't also **dual-subscribe** (open channels on both `trip_messages` and `chat_messages`, dedupe by `id`/`legacy_source` client-side) during the transition window, a driver mid-conversation when the flag flips would stop receiving new messages in realtime until they reload the screen. **Mitigation**: R2 must include dual-subscription, not just dual-read-on-fetch, for every lane until that lane's R3/R4 flip is complete and held stable for one release cycle; then the legacy subscription is dropped in the same release that drops that lane's legacy write dependency.

### 7.2 Offline clients

Two distinct sub-risks:
- **Queued RPC calls**: covered by Section 5, guarantee 4 — safe, given signature stability.
- **Stale client-side cache shape**: a client that queued reads (React Query cache) before going offline, built against the pre-flip response shape, then reconnects post-flip — needs the cache key/shape versioning to force a refetch rather than render a stale, incompatible shape. Recommend bumping the relevant React Query cache keys (`queryKeys.chat.*`) as part of R3/R4, not relying on `staleTime` alone to catch this.

### 7.3 Mobile app version skew

**This is the least-covered risk today, and the codebase has no existing mitigation for it** — I checked for a minimum-supported-app-version / forced-update gate and found none. That means old app binaries can persist indefinitely with no forcing function to update them. Concretely: guarantee 1/2 (RPC contract stability) protects old app versions' *write* path indefinitely, and guarantee 3 (unread shim) protects their *read* path — but only for as long as this plan's compatibility shims are kept alive, and there's currently no way to know when it's safe to remove them because there's no telemetry on which app versions are still active in the field.

**Recommendation, separate from and prerequisite to R6**: introduce app-version telemetry (even a simple "last seen app version per active session" log) before R6's retirement gate closes, so "no reader depends on the legacy shape anymore" is a measured fact about real client versions in the field, not an assumption based on how long ago the app-store release went out.

---

## 8. Test Matrix

Rows = surfaces, columns = scenarios that must pass **before** advancing to the next release in Section 1. "✓" means a test exists and passes; this table is meant to be filled in as tests are written, not treated as already-passing.

| Surface | Send text | Send photo/doc | Offline → reconnect send | Mark read / unread count accurate | Realtime receive (new message) | Old-app-version compat |
|---|---|---|---|---|---|---|
| Driver App (`DriverChatSlackThread.tsx`) | — | — | — | — | — | — |
| Dispatcher (legacy per-lane thread) | — | — | — | — | — | — |
| Unified Inbox (`ChatScreen.tsx` / Trip Room) | — | — | — | — | — | — |
| Trip Chat (dispatcher-facing trip detail) | — | — | — | — | — | — |
| Media upload (image/document, both surfaces) | n/a | — | — | n/a | — | — |
| Notifications (push on new message) | — | n/a | — | n/a | — | — |
| Unread counts (badge accuracy, both models during transition) | n/a | n/a | n/a | — | n/a | — |

**Minimum bar before R3 ships** (driver lane flip): every cell in the Driver App row, plus the "Realtime receive" and "Mark read / unread count accurate" columns for every other surface (since those are the ones a driver-lane-only flip could silently break for non-driver viewers of the same conversation).

**Minimum bar before R6** (retirement): every cell in this table, plus a full pass of Section 3's validation queries returning expected results with the reverse mirror already off in a staging environment for at least one full simulated release cycle.

---

## 10. Migration Scorecard

Filled in per release, not once at the end — R1's row exists before R2 starts, R2's before R3, and so on. "Before" is the immediately-preceding release's "After" column (R1's "Before" is the R0 baseline); a release that can't fill in its "After" column yet hasn't finished, regardless of deploy status.

### Release: _____ (fill in — R1, R2, R3, R3a, R4, R5, or R6)

| Metric | Before | After | Pass? |
|---|---|---|---|
| Writes / message (steady state) | | | |
| Trigger executions / message | | | |
| Average send latency (p50 / p95) | | | |
| Duplicate sends (should be 0, always — Section 3.6/Section 9 scenario 6) | | | |
| Failed sends (rate) | | | |
| Active realtime subscriptions (per Section 0's per-surface count, not just a global total) | | | |
| DB CPU (peak messaging window) | | | |
| Realtime broadcasts / message | | | |
| Rollback tested? (Y/N — not "should work," actually executed per Section 2) | | | |

"Pass" is binary per row, sourced from Section 1a's exit criteria for that specific release — a scorecard with every row green is what "exit criteria met" means in practice; a scorecard with any row red means the release stays in observation, per Section 1a, regardless of how long it's been deployed.

## 11. Stop Conditions

Abort the current release and roll back (per Section 2's per-release procedure) — not "investigate first, decide later" — if any of the following hold at any point after a release ships:

- Failed sends increase by more than 1% relative to the immediately-preceding release's baseline.
- Message-send latency (p95) exceeds the agreed threshold (set once real R0 numbers exist — there is no threshold to enforce before that).
- Any duplicate message appears (Section 9 scenario 6's whole point is that this should be structurally impossible once `p_client_message_id` is threaded through — an occurrence means the fix didn't work, not that it's an acceptable rate).
- Realtime disconnects increase materially versus baseline.
- Unread counts diverge between the legacy and canonical models for any conversation still in the dual-write/dual-read window.
- Conversation parity check (Section 3.1) fails for any lane.
- Rollback validation (Section 1a's per-release exit criteria) fails when actually executed — if the rollback itself doesn't work when tested, the release should not have been considered ready to ship in the first place, and going further compounds the problem rather than fixing it.

These are the release's abort criteria, not suggestions to weigh against schedule pressure — a stop condition firing means revert, then investigate, in that order.

---

## Summary

Nothing above requires a database change to produce — it's the plan. Section 1's R1 (additive schema: enum + two columns + CHECK extension, plus the mirror-trigger exception-handling fix per Section 9) is the first candidate for actual execution — gated on this document being reviewed, and on the one remaining Gate 0 item: **real baseline metrics, which require database access neither of us has in this environment.** That gate is left as-is, deliberately — inventing placeholder numbers to unblock R1 would defeat the entire purpose of measuring whether it helped.
