-- Direct messages (user↔user + legacy network org DMs) stay hot indefinitely.
-- Trip / lane / channel threads remain eligible for archive_chat_messages (12-month default).

CREATE OR REPLACE FUNCTION public.archive_chat_messages(
  p_older_than interval DEFAULT interval '12 months',
  p_batch      int      DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved integer;
BEGIN
  WITH moved AS (
    DELETE FROM chat_messages m
    WHERE m.id IN (
      SELECT cm.id
      FROM chat_messages cm
      JOIN chat_conversations cc ON cc.id = cm.conversation_id
      WHERE cm.created_at < now() - p_older_than
        AND cc.conversation_type NOT IN ('direct', 'direct_org')
      ORDER BY cm.created_at
      LIMIT greatest(coalesce(p_batch, 5000), 1)
    )
    RETURNING m.*
  )
  INSERT INTO chat_messages_archive (
    id, conversation_id, organization_id, sender_user_id, sender_type,
    sender_name, sender_role, message_type, content, metadata, reply_to_id,
    client_message_id, edited_at, deleted_at, legacy_source, created_at
  )
  SELECT
    id, conversation_id, organization_id, sender_user_id, sender_type,
    sender_name, sender_role, message_type, content, metadata, reply_to_id,
    client_message_id, edited_at, deleted_at, legacy_source, created_at
  FROM moved;

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN v_moved;
END;
$$;

COMMENT ON FUNCTION public.archive_chat_messages(interval, int) IS
  'Moves non-DM messages older than p_older_than into chat_messages_archive. Skips direct and direct_org (persistent WhatsApp-style DMs).';
