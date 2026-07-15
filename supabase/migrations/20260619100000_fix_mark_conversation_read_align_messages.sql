-- Fix unread badge reappearing after refresh / mark_messages_seen.
--
-- 20260531000000_mark_batch_seen.sql changed mark_conversation_read to only zero
-- trip_conversations.unread_dispatcher_count without updating trip_messages.is_read.
-- mark_messages_seen (20260527150000) recomputes the counter from COUNT(*) of rows
-- where is_read = FALSE and sender_role <> 'dispatcher', so any later seen-batch
-- or reload path that trusts message rows would resurrect a non-zero unread count.
--
-- Restore atomic semantics: mark all inbound (non-dispatcher) unread messages read,
-- then set the denormalized counter to 0.

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trip_messages
  SET    is_read = TRUE,
         read_at = COALESCE(read_at, NOW())
  WHERE  conversation_id = p_conversation_id
    AND  is_read = FALSE
    AND  sender_role IS DISTINCT FROM 'dispatcher';

  UPDATE public.trip_conversations
  SET    unread_dispatcher_count = 0,
         updated_at = NOW()
  WHERE  id = p_conversation_id;
END;
$$;

COMMENT ON FUNCTION public.mark_conversation_read(UUID) IS
  'Marks all non-dispatcher unread messages in the thread read and zeros '
  'unread_dispatcher_count. Keeps counters consistent with mark_messages_seen.';
