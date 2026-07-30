# Messaging Consolidation Design (MCD)

**Status: Frozen.** The architectural decision — `chat_messages`/`chat_conversations` is the canonical communication platform; `trip_messages`/`trip_conversations` enters deprecation on the timeline in Section 5 and `docs/MESSAGING_MIGRATION_EXECUTION_PLAN.md` — is settled. **No further architectural changes to this design unless a newly discovered production blocker requires one.** Everything from here forward is implementation against `docs/MESSAGING_MIGRATION_EXECUTION_PLAN.md`'s releases, gated by that document's Section 0 dependency audit, Section 1a exit criteria, Section 9 failure-injection review, and the Migration Scorecard/Stop Conditions added there — not further design discussion. This resolves ADR-008: the single question that document left open ("does Trip Room replace or watch the legacy per-lane threads?") is answered with **replace**.

Everything in this document is grounded in the two existing reviews already in this repo (`docs/ADR-008-trip-room-messaging-model.md`, `docs/REALTIME_MESSAGING_ARCHITECTURE_REVIEW.md`) plus direct reads of `supabase/migrations/20260917000000_pulse_chat_platform_foundation.sql` (the canonical schema) and `supabase/migrations/20260430120000_trip_chat_system.sql` (the legacy schema). Where something is a proposal rather than a confirmed fact, it's marked as such — no fabricated metrics.

---

## 1. What is the canonical data model?

`chat_conversations` / `chat_messages` (introduced `20260917000000_pulse_chat_platform_foundation.sql`), unchanged from what already exists in production today — no new tables. Confirmed columns:

**`chat_conversations`**: `id`, `organization_id`, `conversation_type` (`direct | direct_org | trip | trip_lane | customer | supplier | channel | system`), `title`, `trip_id`, `client_id`, `supplier_id`, `driver_id`, `channel_key`, `created_by`, `is_archived`, `last_message_at`, `last_message_preview`, `message_count`, `metadata` (jsonb), `legacy_trip_conversation_id` (unique), `legacy_network_conversation_id` (unique), timestamps.

**`chat_messages`**: `id`, `conversation_id`, `organization_id`, `sender_user_id`, `sender_type` (`user | system | integration`), `sender_name`, `sender_role` (free text, legacy-compat lane), `message_type`, `content`, `metadata` (jsonb), `reply_to_id`, `client_message_id` (**offline-idempotency key — already solves the "duplicate image message" failure mode in the roadmap's Phase A** without new work), `edited_at`, `deleted_at`, `legacy_source` (`'trip' | 'network'` when mirrored), `created_at`.

This already covers 5 of your 7 requested "event" fields without a schema change:

| Your field | Already exists as |
|---|---|
| `event_id` | `chat_messages.id` |
| `trip_id` | `chat_conversations.trip_id` (one join from a message via `conversation_id` — not denormalized onto every message row, so there is exactly one place trip↔conversation truth lives) |
| `conversation_id` | `chat_messages.conversation_id` |
| `event_type` | `chat_messages.message_type` — recommend reusing this column as "event type," not adding a second column with the same purpose |
| `actor` | `sender_user_id` + `sender_type` + `sender_name` + `sender_role` (structured, not a single string — an improvement on a flat `actor` field, not a gap) |
| `payload` | `chat_messages.metadata` (jsonb) |
| **`visibility`** | **genuinely missing** — see 1.1 |

### 1.1 The one real schema gap: `visibility` — explicit scope enum, not free strings

Today, "who can see this event" is buried ad hoc inside `metadata` per event type — e.g. `LedgerEventMetadata.visible_to?: ("client" | "supplier")[]` (`features/chat/types/chat.types.ts`), with a code comment "never driver." That's exactly the kind of scattered, per-type special case Permanent Platform Principle 5 (Reach's own governance doc) warns against: identity, authority, and data-ownership concerns should be structural, not embedded per-payload.

**Revised proposal (superseding the earlier `text[]` draft): a real Postgres enum, not arbitrary strings.**

```sql
CREATE TYPE public.chat_visibility_scope AS ENUM (
  'public',              -- anyone with conversation access (today's default — unchanged behavior)
  'organization',        -- org members only, any role
  'trip_participants',   -- everyone actually party to this trip's conversation
  'dispatch',
  'driver',
  'client',
  'supplier',
  'finance',
  'system',
  'admin'
);

ALTER TABLE public.chat_messages
  ADD COLUMN visibility public.chat_visibility_scope[] DEFAULT NULL;
```

Why an **array of a real enum type**, not a bitmask and not free-form `text[]`:
- **Validates at the database layer.** An invalid scope simply cannot be inserted — Postgres rejects it at the `INSERT`, not "hopefully the app remembered to check a string against a list somewhere." This is the actual complaint about arbitrary strings, solved directly.
- **Multi-audience is still just an array element**, e.g. `{dispatch,finance}` for an internal note two roles should see — satisfies the multi-audience requirement without bit-position bookkeeping.
- **Extending the vocabulary is one `ALTER TYPE ... ADD VALUE`**, not a migration that touches every existing row's encoding — cheaper than a bitmask's "which bit is FINANCE again" problem once a new scope is added later.
- `NULL` (not an empty array) means "no restriction" — semantically distinct from "restricted to zero audiences," and preserves today's behavior for every row that predates this column with zero backfill required.

**Enforcement**: server-side, not client-side-only, once Payment/Ledger/Commission events (real financial data) start landing on a table drivers can otherwise read from freely. Recommend a `SECURITY DEFINER` read RPC (`get_chat_messages` already exists and already gates access — extend its `WHERE` clause to filter on `visibility @> ARRAY[caller_scope]::chat_visibility_scope[] OR visibility IS NULL`, resolving `caller_scope` from the caller's role the same way existing RLS helpers resolve `is_org_member`/`is_org_staff`) rather than trusting every UI surface to independently filter `metadata.visible_to` correctly — that's the exact repeated-per-surface bug class this whole consolidation exists to eliminate.

### 1.1a Event vs. Message — a first-class distinction, not just a type value

Two different things have been living in one `message_type` column with no structural separation:

| | **Event** | **Message** |
|---|---|---|
| Definition | Something happened (a fact) | A human communicated |
| Examples | Trip Assigned, POD Uploaded, Driver Verified, Payment Received, Commission Credited | "Running 15 minutes late.", "Customer unavailable.", "Call me." |
| Mutability | **Immutable** — never edited, never deleted, never reacted to | Editable, reply-able, reactable (existing `edited_at`/`deleted_at`/`reply_to_id`/`reactions` columns already model this for messages) |
| Actor | Often `system`/`integration` (`sender_type`), or a human action reduced to a fact | Always a specific human (`sender_type = 'user'`) |
| Consumers | Reporting, audit, analytics, future AI — needs a clean, unambiguous fact stream | Chat UI, notifications |

**Schema addition**: `chat_messages.event_kind text NOT NULL DEFAULT 'message' CHECK (event_kind IN ('event','message'))`. A column, not an inference drawn from `message_type` at read time — every future reporting/audit/analytics query should be able to say `WHERE event_kind = 'event'` and trust it, rather than re-deriving "which message_types count as facts" in every consumer (exactly the kind of duplicated logic this consolidation is trying to kill).

**Immutability enforcement for `event_kind = 'event'`**: not a CHECK constraint spanning multiple columns (fragile, hard to read) — a guard inside the existing `SECURITY DEFINER` write RPCs, matching this codebase's established pattern (explicit caller/state guards inside RPCs, not constraint-encoded business rules). `updateChatMessageContent`/`deleteChatMessage`/`toggleMessageReaction` (`chat.service.ts`) should refuse when `event_kind = 'event'`, returning a clear error rather than silently succeeding on a row that's supposed to be a permanent fact.

**Mapping `message_type` → `event_kind`** (server-assigned at insert, not client-chosen — a client claiming `event_kind='event'` for a plain text message would be exactly the kind of thing that shouldn't be trusted from the client):

| `event_kind = 'event'` | `event_kind = 'message'` |
|---|---|
| `status_change`, `tracking`, `assignment_update`, `ledger_event`, `ledger_update`, `payment`, `pod_uploaded`, `kyc_status_update`, `commission_credited`, `system`, `system_log` | `text`, `chat`, `update`, `question`, `challenge`, `image`, `document_share`, `document_upload`, `feedback_request`, `feedback` |

### 1.2 `event_type` vocabulary — extending, not replacing

`message_type`'s CHECK constraint has already been extended eight times in production (`text`, `chat`, `update`, `question`, `challenge`, `system`, `system_log`, `ledger_event`, `ledger`, `payment`, `ledger_update`, `assignment_update`, `document_upload`, `document_share`, `feedback_request`, `feedback`, `image`, `status_change`, `tracking`, `location_log` — confirmed in `20260611160000_trip_messages_b2b_message_types.sql`). Your requested vocabulary maps almost entirely onto what's already there:

| Requested | Maps to existing | New? |
|---|---|---|
| TEXT | `text` | — |
| PHOTO | `image` | — |
| DOCUMENT | `document_share` / `document_upload` | — |
| SYSTEM | `system` / `system_log` | — |
| STATUS | `status_change` | — |
| TRACKING / ETA | `tracking` (`TrackingMetadata.eta_minutes`/`eta_label` already modeled) | — |
| PAYMENT | `payment` | — |
| LEDGER | `ledger_event` / `ledger_update` | — |
| ASSIGNMENT | `assignment_update` | — |
| POD | — | **new**: `pod_uploaded` (distinct from generic `document_share` so it can render/badge distinctly, per the earlier Trip Card work) |
| KYC | — | **new**: `kyc_status_update` (Phase B) |
| COMMISSION | — | **new**: `commission_credited` (already-partially covered by `reward` type in `driver_ledger`, not chat — this is the chat-side notification of that same fact, not a new ledger concept) |

Net new CHECK values: `pod_uploaded`, `kyc_status_update`, `commission_credited`. Everything else is "start actually using what's already defined" (`status_change`, `tracking` in particular — the review found these exist in the type system but the driver-facing renderer never special-cases them).

---

## 2. What can be safely deprecated?

**Deprecate (Phase A):**
- `trip_messages`, `trip_conversations` as write targets — reads continue against them (or a compatibility view) until Section 5's retirement gate closes.
- `on_trip_message_insert` / `sync_conversation_on_message` trigger — the whole reason `trip_conversations` needs its own UPDATE per message.
- `trg_chat_mirror_trip_message_insert` / `fn_chat_mirror_trip_message_insert` — once nothing writes `trip_messages` directly, there's nothing left to mirror.
- `trg_trip_messages_avatar_seed`, `trg_trip_messages_context_routing` — read-only enrichment triggers that only matter for rows landing in `trip_messages`.

**Not in scope for this MCD — flag, don't touch:** `network_conversations` / `legacy_network_conversation_id`. The reader inventory found this is a *third* legacy system layered under the same canonical tables. Your stated focus is Driver App / Trip chat, so Phase A targets `trip_messages` only; `network_conversations`' retirement is a follow-up MCD once Phase A's pattern is proven, not bundled in now — bundling it would violate the same "no scope creep" discipline this whole session has been holding to.

**Still unresolved from the existing review, blocking a *complete* retirement (not blocking canonical-write cutover):**
- `trip_messages_sync_operational_to_lanes`, `trg_sync_operational_status`, `trg_mirror_operational_to_trip_room` — fire on trip/operational-status changes and *write* `trip_messages` directly, outside the normal send path. These need individual tracing before the legacy tables can be dropped (not before the write-path cutover — they can keep writing to a deprecated-but-present table during the compatibility window).
- `mark_delivered` RPC — built, granted, indexed, zero call sites. Decide now: wire it into the canonical schema's read-receipt story, or drop it. Recommend **drop** — reviving genuinely dead code into a new canonical schema just carries the ambiguity forward.
- `submit_trip_feedback` — no confirmed call site (superseded by `submit_atomic_feedback`/`confirm_trip_feedback`, which do have call sites and write `trip_messages` directly — these need their own migration to target `chat_messages`, they don't ride along with `send_trip_chat_message`'s cutover for free).

---

## 3. What migrations are required?

In order, each one small enough to review and roll back independently:

1. **Schema**: create `chat_visibility_scope` enum; add `chat_messages.visibility chat_visibility_scope[]` and `chat_messages.event_kind text CHECK (event_kind IN ('event','message')) DEFAULT 'message'` (both nullable/defaulted — zero behavior change for existing rows, backfill `event_kind` for existing rows per the mapping table in Section 1.1a); extend `chat_messages`/legacy `trip_messages` `message_type` CHECK constraints with `pod_uploaded`, `kyc_status_update`, `commission_credited`.
2. **Write-path flip, same RPC contract**: `send_trip_chat_message(...)` keeps its exact signature; its body changes from "INSERT into `trip_messages`" to "INSERT into `chat_messages` (resolving/creating the right `chat_conversations` row first, same logic `fn_chat_ensure_conv_for_trip_lane` already has)". No client code changes on day one — this is the whole point of the RPC boundary already existing.
3. **Compatibility shim, reversed**: replace the forward mirror (`trg_chat_mirror_trip_message_insert`, legacy→canonical) with a **reverse** mirror (canonical→legacy, `chat_messages` → `trip_messages`) for exactly one release cycle, so any reader still on the legacy path (there are several per Section 2) doesn't go dark the moment the cutover ships.
4. **Reader migration**: move `windowed_trip_message_history`'s direct fallback query, `get_multi_lane_bootstrap`, `mark_conversation_read`, `mark_messages_seen`, `toggle_trip_message_reaction`, `ensure_driver_trip_conversation` to their canonical equivalents (`get_chat_messages`, `get_chat_inbox`, `mark_chat_conversation_read`, `toggle_chat_reaction`, `ensure_chat_channel`/`ensure_direct_chat`) — several of these canonical RPCs **already exist and are already live** (`get_chat_inbox`, `get_chat_messages`, `send_chat_message`, `ensure_chat_channel`, `ensure_direct_chat`, `toggle_chat_reaction`, `search_chat_messages` — confirmed in `20260917000000_pulse_chat_platform_foundation.sql`), so this phase is substantially "point existing driver/dispatcher UI at RPCs that already exist," not new backend work.
5. **`DriverChatSlackThread.tsx` and friends re-point** to `chatPlatform.service.ts` instead of `chat.service.ts` for these calls — a service-layer swap behind the same component props where possible, to keep this a plumbing change, not a UI rewrite.
6. **Drop the reverse mirror + legacy triggers**, once Section 5's retirement gate passes.
7. **Audit-log write moved off the synchronous path** (own retention policy, own write-optimized shape) — same recommendation the existing review already made, unchanged by the replace decision.
8. **`chat_conversations.legacy_trip_conversation_id` uniqueness** — confirm it backs `fn_chat_ensure_conv_for_trip_lane`'s SELECT-then-INSERT before concurrent first-messages can race (flagged, not yet verified, in the existing review).

None of this is a new architecture — every step targets a table, RPC, or trigger that already exists.

---

## 4. How do we migrate without downtime?

- **Every step above is additive or a body-swap behind a stable RPC signature** — no step requires an app release synchronized to a specific migration; the RPC contract is the seam.
- **The reverse-mirror window (step 3) is the safety net**, not a permanent fixture — it exists so that a reader nobody found in the inventory doesn't silently break the moment the write target flips. It has a hard removal date (end of the release cycle it ships in), tracked the same way the existing review already recommended for the forward mirror.
- **Feature-flag the write-path flip** (`send_trip_chat_message` body) so it can be reverted in seconds if the canonical path misbehaves under real traffic, without a second migration.
- **Roll out by conversation type first**, not by percentage of traffic: cut driver-lane trip chat (`DriverChatSlackThread.tsx`'s call path) over first, since it's the smallest, most self-contained reader set per the inventory; dispatcher/client/supplier lanes follow once that's proven stable for one full release cycle.

---

## 5. How do we preserve existing conversation history?

- **Nothing is deleted until Section 2's retirement gate closes.** `trip_messages`/`trip_conversations` remain readable (directly, or behind a compatibility view matching the old shape) for the entire compatibility window.
- **Every legacy message already mirrored into `chat_messages` today keeps its `legacy_source = 'trip'` tag** — history isn't re-created, it's already there. Any message sent before the cutover is visible in the canonical schema exactly as it is right now.
- **Retirement gate** (mirrors the Reach pilot's own exit-criteria discipline — a measured gate, not a calendar date): drop legacy tables only after (a) the inventory's remaining unclassified writers (`trip_messages_sync_operational_to_lanes` and friends) are traced and migrated, (b) one full release cycle has passed with the reverse mirror active and zero regressions, and (c) a query against `trip_messages`/`trip_conversations` for `created_at > cutover_date` returns zero rows (proof nothing is still writing there).

---

## 6. How do we measure database improvements?

Baseline numbers below are **derived from reading the trigger SQL** (per the existing review — explicitly not a production trace). Before this migration starts, confirm them against `pg_stat_user_tables`/`pg_stat_statements` in the real environment (same access gate as the finance audit) — that's the "measure first" step, and it's a precondition, not a nice-to-have, since a design built on a wrong baseline number is worse than no number.

| Metric | Before (dual-write) | After (canonical only) | Source |
|---|---|---|---|
| DB writes / message (steady state) | 5 | 2 | Existing review, Section F |
| DB writes / message (first message in a lane) | 6 | 3 | Existing review, Section F |
| Conversation-row UPDATEs / message | 2 | 1 | Existing review, Section F |
| Realtime `postgres_changes` events / message | Up to 2 | 1 | Existing review, Section F |
| Audit-log INSERTs / message | 1 (synchronous, blocking) | 1 (async / batched, off critical path) | Existing review, Section D.3 |

**Additional metrics to instrument** (not yet built — this is the observability gap the existing review flagged at the end of its own report):
- p50/p95/p99 message-send latency, before vs. after — the actual user-facing number nobody has today.
- Realtime channel count and re-subscription rate (the registry, `lib/realtimeRegistry.ts`, is already confirmed healthy — this is a regression guard, not a fix target).
- Postgres connection count / CPU during peak messaging windows.
- Duplicate-message rate — should be definitionally zero post-cutover given `client_message_id`'s existing unique index, but worth confirming it actually is zero today too (a wrong assumption here would mean the "image upload duplicate" symptom has a different cause than the dual-write).
- Image/document upload success rate — baseline this before touching anything, since Phase A's "fix image upload reliability" item needs its own before/after, independent of the chat cutover.

---

## Sequencing (maps onto your Phase A)

1. Land the schema migration (Section 3, step 1) — zero behavior change, reviewable in isolation.
2. Baseline the metrics in Section 6 against the real database — the actual "measure first" gate.
3. Flip `send_trip_chat_message`'s body behind the feature flag (steps 2-3), starting with the driver lane only (Section 4).
4. Migrate readers (step 4-5), one call site at a time, each independently testable.
5. Hold for one full release cycle with the reverse mirror live.
6. Close the retirement gate (Section 5) and drop legacy triggers/tables (step 6).
7. Only then: Phase B (Driver KYC, unblocked by all of this but sequenced after so it doesn't land on a moving messaging foundation) and Phase C (Trip Activity Timeline, POD/KYC/commission event types, issue reporting — all of which now target one canonical table instead of guessing which of two).

This MCD does not cover Driver KYC's schema — that's a separate, smaller design (clone `organization_kyc_documents`/`client_kyc_documents`/`supplier_kyc_documents`'s existing pattern for a new `driver_kyc_documents` table), worth its own short doc when Phase B starts rather than folding it into a messaging document.
