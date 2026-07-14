-- Rewrite fn_enqueue_chat_push_outbox() from a per-participant loop (one INSERT
-- + one correlated subquery per participant, inside the sender's message-insert
-- transaction) into a single set-based INSERT ... SELECT.
--
-- Why: the loop ran O(participants) INSERTs and O(participants) chat_conversations
-- subqueries synchronously inside every message-write transaction. For large
-- group conversations this lengthened the message-insert transaction (a
-- contributor to idle-in-transaction / transaction-duration pressure) and
-- amplified rows. The trigger fires on every chat message insert (active user
-- flow), independent of downstream push delivery.
--
-- Behavior preserved exactly:
--   * skip soft-deleted messages
--   * system action_card title/body vs. normal message title/body
--   * only participants other than the sender
--   * only participants that have a push token
--   * same columns and payload shape
-- The trip_id lookup is now evaluated once (scalar subquery in the SELECT),
-- not once per participant.

CREATE OR REPLACE FUNCTION "public"."fn_enqueue_chat_push_outbox"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_title text;
  v_body  text;
  v_trip_id uuid;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.sender_type = 'system' AND NEW.message_type = 'action_card' THEN
    v_title := coalesce(NEW.content, 'Trip update');
    v_body  := coalesce(NEW.metadata->>'body', '');
  ELSE
    v_title := coalesce(nullif(trim(NEW.sender_name), ''), 'New message');
    v_body  := left(coalesce(NEW.content, ''), 180);
  END IF;

  -- Resolve trip_id once, not once per participant.
  SELECT trip_id INTO v_trip_id
  FROM public.chat_conversations
  WHERE id = NEW.conversation_id;

  INSERT INTO public.chat_push_outbox (
    user_id, organization_id, conversation_id, message_id,
    title, body,
    payload
  )
  SELECT
    cp.user_id, NEW.organization_id, NEW.conversation_id, NEW.id,
    v_title, v_body,
    jsonb_build_object(
      'conversation_id', NEW.conversation_id,
      'message_id', NEW.id,
      'trip_id', v_trip_id,
      'message_type', NEW.message_type
    )
  FROM public.chat_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id IS DISTINCT FROM NEW.sender_user_id
    AND EXISTS (
      SELECT 1 FROM public.user_push_tokens upt WHERE upt.user_id = cp.user_id
    );

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."fn_enqueue_chat_push_outbox"() OWNER TO "postgres";
