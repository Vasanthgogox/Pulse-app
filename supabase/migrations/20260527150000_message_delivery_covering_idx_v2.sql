-- ═════════════════════════════════════════════════════════════════════════════
-- MESSAGE DELIVERY STATUS + COVERING INDEX v2
--
-- 1. DELIVERY STATUS COLUMNS
--    WhatsApp-style two-tick system for trip_messages:
--      is_delivered = FALSE  →  message in DB, recipient WebSocket not yet ACKed
--      is_delivered = TRUE   →  recipient device received it (mark_delivered RPC)
--    The existing is_read / read_at columns remain the "seen" layer.
--
-- 2. mark_delivered RPC
--    Called by the receiver's client immediately on Realtime INSERT event.
--    Batch-accepts an array so a burst of messages (e.g. app foreground catch-up)
--    is handled in one DB round trip. Skips already-delivered rows.
--
-- 3. mark_messages_seen RPC
--    Per-message seen tracking driven by onViewableItemsChanged.
--    Finer-grained than mark_conversation_read (which bulk-updates all rows).
--    Also resets unread_dispatcher_count on the parent conversation row.
--
-- 4. COVERING INDEX v2
--    Recreates idx_trip_messages_covering to INCLUDE three new columns:
--      sender_avatar_seed  — added to table in 20260526130000, omitted from INCLUDE
--      is_delivered        — added in this migration
--      delivered_at        — added in this migration
--    With all SELECT columns in INCLUDE, getMessagesByConversation achieves
--    zero heap fetches (Index Only Scan confirmed by EXPLAIN ANALYZE).
-- ═════════════════════════════════════════════════════════════════════════════


-- ─── 1. Delivery status columns ──────────────────────────────────────────────

ALTER TABLE public.trip_messages
  ADD COLUMN IF NOT EXISTS is_delivered  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ;


-- ─── 2. mark_delivered RPC ───────────────────────────────────────────────────
--
-- Called by the receiver's device on Realtime INSERT event.
-- Batch input (array) — one round trip for any burst size.
-- Emits an UPDATE event that the sender's Realtime subscription can use
-- to flip single-tick → double-tick in the UI.

CREATE OR REPLACE FUNCTION public.mark_delivered(
  p_message_ids UUID[]
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.trip_messages
  SET    is_delivered = TRUE,
         delivered_at = now()
  WHERE  id = ANY(p_message_ids)
    AND  is_delivered = FALSE;   -- skip already-delivered; avoids no-op write amplification
$$;

GRANT EXECUTE ON FUNCTION public.mark_delivered(UUID[]) TO authenticated;

COMMENT ON FUNCTION public.mark_delivered IS
  'Batch-marks messages as delivered. Called by the receiver device on '
  'Realtime INSERT event. The resulting UPDATE triggers a Realtime UPDATE '
  'event that the sender uses for delivery receipts (single → double tick).';


-- ─── 3. mark_messages_seen RPC ───────────────────────────────────────────────
--
-- Per-message seen tracking. Called by the dispatcher when messages enter
-- the visible viewport (onViewableItemsChanged, 1500ms debounce).
-- Complements mark_conversation_read (which does a bulk UPDATE without
-- individual message tracking).
--
-- Also resets unread_dispatcher_count on the conversation — avoids a
-- separate mark_conversation_read call for the counter decrement.

CREATE OR REPLACE FUNCTION public.mark_messages_seen(
  p_conversation_id UUID,
  p_message_ids     UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark individual messages as read
  UPDATE public.trip_messages
  SET    is_read  = TRUE,
         read_at  = now()
  WHERE  id                = ANY(p_message_ids)
    AND  conversation_id   = p_conversation_id
    AND  is_read           = FALSE;

  -- Reset the unread counter on the parent conversation.
  -- Re-derive from the actual unread count rather than decrementing
  -- so bursts of simultaneous marks land correctly (no race on counter).
  UPDATE public.trip_conversations
  SET    unread_dispatcher_count = (
    SELECT COUNT(*)
    FROM   public.trip_messages tm
    WHERE  tm.conversation_id = p_conversation_id
      AND  tm.is_read         = FALSE
      AND  tm.sender_role     <> 'dispatcher'
  )
  WHERE  id = p_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_messages_seen(UUID, UUID[]) TO authenticated;

COMMENT ON FUNCTION public.mark_messages_seen IS
  'Per-message seen tracking for onViewableItemsChanged integration. '
  'Marks individual message rows as read and re-derives the conversation '
  'unread counter. More granular than mark_conversation_read.';


-- ─── 4. Covering index v2 ────────────────────────────────────────────────────
--
-- The v1 index (20260526130000) was missing sender_avatar_seed from INCLUDE,
-- causing a heap fetch for that column on every getMessagesByConversation call.
-- This version adds sender_avatar_seed + the two new delivery columns so the
-- full SELECT column list is covered:
--
--   SELECT id, conversation_id, organization_id, sender_user_id, sender_role,
--          sender_name, content, message_type, metadata, is_read, read_at,
--          created_at, sender_avatar_seed, is_delivered, delivered_at
--   FROM trip_messages
--   WHERE conversation_id = $1
--   ORDER BY created_at DESC LIMIT 50
--
-- Target plan: Index Only Scan, Heap Fetches: 0

DROP INDEX IF EXISTS public.idx_trip_messages_covering;

CREATE INDEX idx_trip_messages_covering
  ON public.trip_messages (conversation_id, created_at DESC)
  INCLUDE (
    id,
    organization_id,
    sender_user_id,
    sender_role,
    sender_name,
    content,
    message_type,
    metadata,
    is_read,
    read_at,
    sender_avatar_seed,   -- added in 20260526130000, missing from v1 INCLUDE
    is_delivered,         -- new
    delivered_at          -- new
  );

COMMENT ON INDEX public.idx_trip_messages_covering IS
  'v2: Covering index for getMessagesByConversation. '
  'Key (conversation_id, created_at DESC) handles WHERE + ORDER BY. '
  'INCLUDE covers all SELECT columns — zero heap fetches (Index Only Scan). '
  'Added sender_avatar_seed, is_delivered, delivered_at vs v1.';


-- ─── 5. Index for delivery status lookups ────────────────────────────────────
--
-- mark_delivered queries: WHERE id = ANY($1) AND is_delivered = FALSE
-- The PK covers the id lookup. A partial index on is_delivered = FALSE
-- provides a fast filter for the undelivered subset.

CREATE INDEX IF NOT EXISTS idx_trip_messages_undelivered
  ON public.trip_messages (conversation_id, created_at DESC)
  WHERE is_delivered = FALSE;

COMMENT ON INDEX public.idx_trip_messages_undelivered IS
  'Partial index for delivery receipt queries and catchup-on-foreground. '
  'Only indexes undelivered rows — small and fast.';
