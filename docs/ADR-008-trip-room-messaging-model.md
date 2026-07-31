# ADR-008 (resolved) — Trip Room vs. Legacy Chat: What Is the Intended Messaging Architecture?

**Status: Resolved — Option A (Replace).** Trip Room's canonical schema (`chat_messages`/`chat_conversations`) replaces the legacy per-lane chat (`trip_messages`/`trip_conversations`); the legacy tables are retired on a measured, no-downtime timeline. Full migration plan: `docs/MESSAGING_CONSOLIDATION_DESIGN.md`. The options analysis below is kept for historical record — it's what the decision in that document is actually deciding between.

**Original status (superseded):** Awaiting a product decision. Engineering work on the messaging dual-write is frozen until this is answered — see `docs/REALTIME_MESSAGING_ARCHITECTURE_REVIEW.md` and its Phase 1 Reader Inventory for the full technical trace this ADR summarizes. This document exists to get a decision from whoever owns product direction for Trip Room and Driver/User chat, not to make that decision unilaterally from code inspection.

## Why this exists

A database-health review of the realtime messaging system found that every chat message is written to two parallel schemas: the original `trip_messages`/`trip_conversations` (used by per-lane Driver/User/Dispatcher chat threads) and a newer `chat_messages`/`chat_conversations` (used by a "Trip Room" feature), bridged by a database trigger that mirrors every legacy write into the new schema. The engineering fix seemed obvious — collapse the duplication — until the reader inventory found `chat_messages` is consumed by real, live screens (`ChatScreen.tsx`, `TripChatRoomSheet.tsx`, `ChatTripRoomInboxSection.tsx`) that appear to be a genuinely separate feature, not a half-finished replacement for the legacy chat threads (`DriverChatSlackThread.tsx` and others, still built directly on `trip_messages`). Whether the mirror trigger is temporary migration debt or permanent, load-bearing infrastructure depends entirely on product intent that isn't visible from the code.

## The single question that has to be answered before engineering proceeds

**What is the intended product architecture for Trip Room?**

1. Is Trip Room intended to completely replace Driver/User chat?
2. Is it intentionally a unified monitoring/operations view over existing chats?
3. Will Driver/User chat continue to exist indefinitely?
4. Is there a roadmap to merge these experiences?

## Option A — Trip Room Replaces Legacy Chat (Migration)

```
Driver/User Chat
        │
        ▼
  chat_messages
        │
        ▼
    Trip Room
```

`trip_messages` becomes legacy. The mirror trigger is temporary migration infrastructure with a removal date. End state: one messaging platform, one schema.

**Trade-offs:** Lowest long-term complexity and write amplification (the dual-write goes away entirely). Highest near-term migration effort — every legacy-chat screen (`DriverChatSlackThread.tsx` and the rest of `features/chat/services/chat.service.ts`'s consumers) needs to move to `chatPlatform.service.ts`/`chat_messages`, not just Trip Room. Operational risk is concentrated in that migration window, not ongoing.

## Option B — Trip Room Is an Observer (Sync Layer, By Design)

```
Driver/User Chat
        │
        ▼
  trip_messages
        │
        ▼
  Mirror Trigger
        │
        ▼
  chat_messages
        │
        ▼
    Trip Room
```

The mirror trigger is a deliberate synchronization layer, not leftover scaffolding. Removing it breaks Trip Room's ability to see legacy-chat messages. The optimization problem shifts from "eliminate the dual-write" to "make the sync layer cheaper" — e.g. collapsing the *legacy-side* `trip_conversations` denormalization (which may be redundant with what `chat_conversations` already tracks) rather than removing the mirror itself.

**Trade-offs:** Lowest near-term engineering effort and risk (no screen migrations). Write amplification is permanent, not temporary — every message pays the sync cost forever, so the ceiling on messaging throughput is lower than Option A's end state. Complexity stays higher indefinitely (two schemas to reason about, not one).

## Option C — Both Are First-Class Products (Shared Domain, Different Projections)

```
Driver Thread        Trip Room
       │                 │
       └─── Shared Messaging Platform ───┘
```

Neither `trip_messages` nor `chat_messages` is the right long-term canonical model as currently shaped. The longer-term architecture is a shared messaging domain (canonical events/commands, matching the `PlatformDomainEventName` pattern already established for Order→Indent→Trip in `docs/architecture/10-platform-event-catalog.md`) with different read-projections for the per-lane thread view and the unified Trip Room view.

**Trade-offs:** Highest upfront design cost — this is a new platform capability, not a migration of an existing one. Best long-term fit if more chat surfaces are coming (the original review's ask mentioned Dispatcher/Operations/Workspace-user views, which hints this may already be the real shape). Risk is mostly in scope creep — this is the option most likely to expand past "fix the write cascade" into a genuine platform build, and per this session's established discipline (`09-workspace-master-data.md`'s deferred `ProductEvaluator`, `10`'s Reserved-events rule), that scale of work shouldn't start until Options A/B are actually ruled out.

## Dependency Map (from the Phase 1 Reader Inventory — see the review doc for full detail)

| Surface | Screens | Service | Table(s) | Affected by |
|---|---|---|---|---|
| Per-lane Driver/User/Dispatcher chat | `DriverChatSlackThread.tsx`, `ChatSlackDesktopChrome.tsx`, `PostDetailScreen`-adjacent chat surfaces | `chat.service.ts` (`sendChatMessage`, `fetchConversationHistory`, `fetchChatBootstrapPayload`, `mark_conversation_read`, `mark_messages_seen`, `toggle_trip_message_reaction`) | `trip_messages`, `trip_conversations` | Options A and C (migrates or gets re-platformed); unaffected by B (stays as-is) |
| Trip Room unified inbox | `ChatScreen.tsx`, `TripChatRoomSheet.tsx`, `ChatTripRoomInboxSection.tsx`, `TripChatRoomActionCard.tsx` | `chatPlatform.service.ts` (`get_chat_inbox`, `get_chat_messages`, `send_chat_message`, `ensure_chat_channel`, `ensure_direct_chat`, `toggle_chat_reaction`) | `chat_messages`, `chat_conversations` | Becomes sole surface under A; stays as an observer under B; re-platformed under C |
| Feedback prompts posted as chat messages | (embedded in trip/feedback flows, not a standalone screen) | `submit_atomic_feedback`, `confirm_trip_feedback`, `fn_post_trip_feedback_prompt_to_chats` | `trip_messages` | Needs explicit migration under A — it's a second writer into the legacy table, not just the main send path |
| Hidden fallback reader | (inside `fetchConversationHistory`, not a separate screen) | direct `.from("trip_messages").select(...)` when the `windowed_trip_message_history` RPC 404s | `trip_messages` | **Must be migrated or removed under A regardless of everything else** — it bypasses the RPC layer entirely, so migrating the RPC doesn't migrate this |
| Archive/retention | (background) | `archive_chat_messages` | `chat_messages_archive` | Already canonical-schema-only; unaffected by the decision |

## The `mark_delivered` Finding — Separate From the Product Question

This one doesn't depend on which option gets chosen. The inventory found: migration exists, permissions granted to `authenticated`, a dedicated covering index exists, and **zero call sites in this repo's app code or Edge Functions** (checked all 8 functions in `supabase/functions/`). Per your framing, this needs confirmation of one of three explanations before any removal:

1. **Planned but not yet implemented** — most likely, given the amount of dedicated infrastructure (its own migration + index migration) built for a function nothing calls.
2. **Invoked externally** — I cannot rule this out from this repo. A separate backend service, a native mobile client outside this codebase, or a partner integration could call it directly against Supabase without appearing anywhere I have visibility into.
3. **Genuinely unused** — only confirmable via Supabase's own function-call logs/`pg_stat_statements`, which needs the same `SUPABASE_DB_PASSWORD` access already gated elsewhere in this review.

**Recommendation: do not remove it. Check Supabase's function invocation logs for `mark_delivered` over a representative window (e.g. 30 days) before deciding.** That's a five-minute check with the right access, versus an unrecoverable mistake without it.

## Recommendation

Freeze Phase 2 (canonical model decision) and Phase 3 (reader migration) until the product question above is answered. Options A and C both imply migrating the legacy-chat screens and the hidden `fetchConversationHistory` fallback — that work is real either way, so it's not wasted if the answer takes time; it just shouldn't start until it's clear it's not migrating *toward* a schema that itself gets replaced under Option C. Option B is the only one where "make the current writes cheaper without eliminating them" is the right target — worth knowing before optimizing for the wrong one.
