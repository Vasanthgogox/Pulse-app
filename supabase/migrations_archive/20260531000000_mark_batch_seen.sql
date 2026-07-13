-- ─────────────────────────────────────────────────────────────────────────────
-- mark_batch_seen — unified seen acknowledgment
--
-- Replaces the dual mark_conversation_read + mark_messages_seen pattern.
-- WhatsApp-style: marks only the explicitly specified messages as read,
-- then re-derives the unread counter in one transaction.
-- Never does a blind "WHERE conversation_id = X" bulk UPDATE on trip_messages,
-- which was triggering N Realtime events per conversation open.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old bulk-update version. mark_messages_seen (20260527 migration)
-- already supersedes it; this just removes the dangerous fallback.
DROP FUNCTION IF EXISTS public.mark_conversation_read(UUID);

-- Thin wrapper kept for backwards compat — callers that still reference
-- mark_conversation_read by name will call this instead.
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only reset the counter — do NOT bulk-update trip_messages rows.
  -- mark_messages_seen handles the per-row updates; this avoids N Realtime events.
  UPDATE public.trip_conversations
  SET    unread_dispatcher_count = 0,
         updated_at = NOW()
  WHERE  id = p_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;
