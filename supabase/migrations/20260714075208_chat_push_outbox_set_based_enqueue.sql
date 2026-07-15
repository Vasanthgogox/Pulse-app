-- Restored from remote schema_migrations (version 20260714075208)

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
