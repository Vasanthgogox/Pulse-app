-- Cross-lane dedupe for trip room action_cards.
-- Operational events are inserted once per party lane (client/supplier/driver);
-- legacy_trip_message_id dedupe alone leaves N copies in the unified room.

CREATE OR REPLACE FUNCTION public.fn_post_trip_room_action_card(
  p_trip_id       uuid,
  p_event_type    text,
  p_title         text,
  p_body          text    DEFAULT '',
  p_metadata      jsonb   DEFAULT '{}'::jsonb,
  p_legacy_msg_id uuid    DEFAULT NULL,
  p_created_at    timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.chat_conversations%ROWTYPE;
  v_meta jsonb;
  v_created timestamptz;
  v_body text;
BEGIN
  SELECT * INTO v_room
  FROM public.chat_conversations
  WHERE trip_id = p_trip_id AND conversation_type = 'trip';
  IF NOT FOUND THEN RETURN; END IF;

  IF p_legacy_msg_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.conversation_id = v_room.id
      AND m.metadata->>'legacy_trip_message_id' = p_legacy_msg_id::text
  ) THEN
    RETURN;
  END IF;

  v_created := coalesce(p_created_at, now());
  v_body := left(coalesce(p_metadata->>'body', p_body, ''), 160);

  -- Same operational event mirrored from another lane (client/supplier/driver).
  IF EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.conversation_id = v_room.id
      AND m.message_type = 'action_card'
      AND coalesce(m.metadata->>'event_type', '') = coalesce(p_event_type, '')
      AND left(coalesce(m.metadata->>'body', m.content, ''), 160) = v_body
      AND date_trunc('minute', m.created_at) = date_trunc('minute', v_created)
  ) THEN
    RETURN;
  END IF;

  v_meta := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'event_type', p_event_type,
      'trip_id', p_trip_id,
      'trip_room_mirror', '1'
    );
  IF p_legacy_msg_id IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('legacy_trip_message_id', p_legacy_msg_id::text);
  END IF;

  INSERT INTO public.chat_messages (
    conversation_id, organization_id,
    sender_user_id, sender_type, sender_name,
    message_type, content, metadata, legacy_source, created_at
  )
  VALUES (
    v_room.id, v_room.organization_id,
    NULL, 'system', 'Pulse',
    'action_card',
    coalesce(p_title, ''),
    v_meta || jsonb_build_object('body', coalesce(p_body, '')),
    'trip',
    v_created
  );
END;
$$;

COMMENT ON FUNCTION public.fn_post_trip_room_action_card(uuid, text, text, text, jsonb, uuid, timestamptz) IS
  'Posts a system action_card into the unified trip room (deduped per legacy message id and cross-lane event fingerprint).';
