# Chat Migration Discoveries — 2026

**Document Version:** v1.0
**Date:** 2026-08-07
**Prepared by:** Engineering Investigation

**Purpose:** Production findings discovered after ADR-008 that should be considered before resuming the messaging migration.

## Executive Summary

Five items were investigated after ADR-008; four are confirmed findings, one was withdrawn after further reading:

1. Driver second-open bug — **Resolved**
2. Duplicate read lifecycle — confirmed
3. ~~Image viewer first-open issue~~ — **withdrawn 2026-08-07, no bug found** (see corrected Finding 3)
4. Platform Chat (`TripChatRoomSheet`) usage assumptions corrected
5. Mirror trigger exception-handling gap

None of these supersede ADR-008. All should be reviewed before continuing execution.

| # | Finding | Category | Impact |
|---|---|---|---|
| 1 | Driver second-open hang | Client lifecycle | High (resolved) |
| 2 | Duplicate read-tracking lifecycle | Functional duplication | Medium |
| 3 | ~~Image viewer first-open failure~~ | — | None (withdrawn — no bug found) |
| 4 | `TripChatRoomSheet` usage reality | Product usage | Medium |
| 5 | Mirror trigger exception handling | Data integrity | High (potential) |

## 1. Scope

- This document does not propose architecture.
- This document does not supersede `ADR-008-trip-room-messaging-model.md`.
- This document records production discoveries made after ADR-008 so they can be reviewed before continuing the migration.

## 2. Confirmed Findings

### Finding 1 — Driver second-open hang

**Status:** Resolved

**Impact:** High

**Evidence:**
- `app/(driver)/_layout.tsx:61` — `chat` is registered as a `Tabs.Screen`, not a pushed stack screen.
- `features/drivers/screens/DriverChatScreen.tsx:137` — the trip-resolution `useEffect`, keyed on `normalizedTripId` / `conversations` / `isLoading` / `queryClient`.
- `features/drivers/screens/DriverChatScreen.tsx:52-53, 212` — the fix (`focusTick` + `useFocusEffect`).

**Root cause:** React Navigation tabs never unmount on tab-switch, so `DriverChatScreen` stays mounted after its first open. Re-opening the same trip's chat pushes the identical `tripId` route param, so `normalizedTripId` never changes value and the trip-resolution effect has no dependency change to react to. Meanwhile, closing the thread (`onBack`) resets local state (`selectedId`, `pendingConvOrgId`) to `null`, and nothing re-populates it on the next open. The render falls into its terminal "no `selectedId`/`resolvedOrgId` yet" branch, which renders a loading splash indefinitely. Fixed by adding a `focusTick` counter (bumped via `useFocusEffect` on every re-focus) to the effect's dependency array, forcing it to re-evaluate the cache on every re-open regardless of whether the route params changed.

**Migration impact:** None — client-side React state bug, unrelated to the messaging schema or the `trip_messages`/`chat_messages` migration. Regression test recommended for this specific fix.

---

### Finding 2 — Duplicate read-tracking lifecycle (legacy chat, both Business and Driver)

**Impact:** Medium

**Evidence:**
- `features/chat/contexts/TripChatContext.tsx:486-529` — `markAsRead` / `markTripThreadsRead`, fired on thread open, call `chatService.markConversationRead` → RPC `mark_conversation_read`.
- `features/chat/hooks/useMarkSeen.ts:42-74` — fired continuously on `FlatList` scroll viewability (50% visible, own-message and already-read rows filtered out), calls `enqueueReadReceiptsDebounced` (`features/chat/store/useChatStore.ts:425-453`), which after a 2s debounce invokes a registered RPC → `mark_messages_seen`.
- Both mechanisms write read state for overlapping message rows in the same conversation, triggered by two different, uncoordinated UI events (thread-open vs. scroll).

**Migration impact:** Two independent RPCs currently mark overlapping data as read. Whatever the migration's eventual read-state model is (`MESSAGING_MIGRATION_EXECUTION_PLAN.md` Section 5, guarantee 3, already flags `unread_dispatcher_count` as needing a compatibility shim against the canonical schema's per-participant `last_read_at` model), it needs to account for both existing call paths, not just one — migrating only `mark_conversation_read` and leaving `mark_messages_seen` on the legacy table would not resolve this.

---

### Finding 3 — Image viewer "first-open failure" — CORRECTED, not a live bug

**Correction (2026-08-07):** The original version of this finding claimed `SmartChatImage.tsx`'s lightbox open attempts an imgproxy transform that reliably 403s before falling back to a raw signed URL, on every cold image open. That was wrong. Kept here rather than deleted, per this document's own append-only rule (Section 4 addendum) — struck through above, corrected below.

**Impact:** None — no bug found.

**What's actually true:**
- `features/chat/utils/resolveChatDocumentUrl.util.ts:277-283` — `resolveChatImageFullDisplayUrl` is a plain alias for `resolveChatImageThumbnail`, which itself calls `resolveChatDocumentStorageUrl` (line 262-274). There is no `/render/image/sign/` (imgproxy transform) call anywhere in this file.
- The file's own header comment (lines 10-17) documents that the imgproxy 403 was found **previously** and already worked around by routing every image request — thumbnail and full-display alike — through the same plain `createSignedUrl` path.
- `features/chat/components/SmartChatImage.tsx:260-274` (`loadFullSize`) does call `resolveChatImageFullDisplayUrl` then conditionally falls back to `resolveChatDocumentStorageUrl` — but since both resolve through the identical function and share the same cache, the fallback branch is unreachable in practice. Dead code, not a live double-request.

**Migration impact:** None.

**Lesson for this document's own process:** this finding was originally written from a code *comment* plus a call-site *pattern*, without reading the full body of the function the comment was describing. The comment was accurate about history; it was misread as describing current behavior. Fixed by reading the full file before finalizing the claim — the same discipline Section 3 already asks for elsewhere in this document.

---

### Finding 4 — `TripChatRoomSheet` ("Platform Chat" UI) usage reality

**Impact:** Medium (changes migration/deletion risk assessment)

**Evidence:**
- Three render sites found: `features/chat/components/ChatScreen.tsx:1476` (gated by `CHAT_TEAM_ROOMS_SIDEBAR_ENABLED`, hardcoded `false` in `features/chat/constants/chatPlatform.flags.ts` — confirmed dead), `features/chat/components/ChatScreen.tsx:9289` (embedded in the trip detail "Team" tab, shown whenever a trip has 2+ party lanes — no flag, confirmed live), `features/trips/components/trip-detail/TripDetailScreen.tsx:5984` (modal sheet, opened via `handleOpenTripChat`, wired to `onPress` handlers at lines 2670 and 2726 — confirmed live).
- Two of three render paths are reachable, unflagged production UI. One is confirmed dead code via a hardcoded flag.

**Migration impact:** Cannot assume Platform Chat's UI is unused. This does not, on its own, tell us production usage *frequency* — code reachability is not the same as usage volume. Requires a product-side usage review (analytics or click data) before any decision to remove, fold in, or leave standing this UI.

---

### Finding 5 — Mirror trigger has no exception handling

**Impact:** High (potential production correctness risk, independent of migration status)

**Evidence:**
- `MESSAGING_MIGRATION_EXECUTION_PLAN.md` Section 9, scenario 2 — cites reading `fn_chat_mirror_trip_message_insert`'s body directly (`supabase/migrations/20260917000000_pulse_chat_platform_foundation.sql:600-631`): a plain `BEGIN...END`, no `EXCEPTION WHEN OTHERS` block.
- This trigger already runs in production today on every `trip_messages` insert (both Business and Driver chat, since both call `send_trip_chat_message`).
- Postgres `AFTER INSERT` triggers run inside the same transaction as the primary write; an unhandled exception in the trigger rolls back the whole transaction, including the user's original message.

**Migration impact:** A mirror-side failure (e.g. a future constraint added to `chat_messages` that an old-shaped mirrored row violates) currently fails the user's message send too, even though nothing was wrong with the original write. This exists today, independent of whether the migration proceeds, is paused, or is reversed. Already flagged in the Execution Plan's own R1 scope as a fix, not deferred.

## 3. Things NOT Confirmed

The following have not been measured, and nothing in this document should be read as if they had been:

- Production write amplification (writes-per-message) — the "5 today / 2 after" figures in `MESSAGING_MIGRATION_EXECUTION_PLAN.md` Section 6 are explicitly derived from reading trigger SQL, not from `pg_stat_statements` or any production trace.
- Realtime subscriber fan-out / channel counts under real load.
- `pg_stat_statements` baseline for any chat-related RPC (`send_trip_chat_message`, `mark_conversation_read`, `mark_messages_seen`, `windowed_trip_message_history`, or any canonical equivalent).
- Production usage frequency for `TripChatRoomSheet`'s two live render paths (Finding 4) — reachability was confirmed; volume was not.
- Whether the mirror trigger's missing exception handling (Finding 5) has actually caused a production failure, or is a risk that has not yet been triggered.
- Internal SQL statement counts inside any RPC body beyond `fn_chat_mirror_trip_message_insert` (which the Execution Plan already read) — RPCs were traced to their client-call boundary, not fully audited server-side in this pass.

## 4. Recommendation

Review these findings before resuming ADR-008.

No architectural recommendation is made here.

---

*End of v1.0 — Future discoveries should be appended as new findings rather than modifying historical findings unless a factual correction is required.*
