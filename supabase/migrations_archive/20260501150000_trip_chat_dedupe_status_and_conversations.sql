-- 1) Drop 2-arg overload so a single (uuid, text, text DEFAULT NULL) signature handles all callers.
-- 2) Trip status → chat: skip posting if this conversation already has the same status broadcast
--    (metadata trip_status_broadcast + status). Prevents double lines on retries / double triggers.
-- 3) send_trip_chat_message: partner trip_conversations insert uses ON CONFLICT (trip_id, party_type).

DROP FUNCTION IF EXISTS public.fn_post_system_message_to_trip_chats(uuid, text);

CREATE OR REPLACE FUNCTION public.fn_post_system_message_to_trip_chats(
  p_trip_id uuid,
  p_content text,
  p_dedupe_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
  v_meta  jsonb;
BEGIN
  IF p_dedupe_status IS NOT NULL AND trim(p_dedupe_status) <> '' THEN
    v_meta := jsonb_build_object(
      'trip_status_broadcast', '1',
      'status', trim(p_dedupe_status)
    );
  ELSE
    v_meta := NULL;
  END IF;

  FOR v_conv IN
    SELECT id, party_type, organization_id
    FROM public.trip_conversations
    WHERE trip_id = p_trip_id
  LOOP
    BEGIN
      IF p_dedupe_status IS NOT NULL AND trim(p_dedupe_status) <> '' THEN
        IF EXISTS (
          SELECT 1
          FROM public.trip_messages tm
          WHERE tm.conversation_id = v_conv.id
            AND tm.message_type = 'system'
            AND tm.sender_role = 'system'
            AND tm.sender_name = 'Trip System'
            AND tm.metadata IS NOT NULL
            AND (tm.metadata->>'trip_status_broadcast') = '1'
            AND (tm.metadata->>'status') = trim(p_dedupe_status)
        ) THEN
          CONTINUE;
        END IF;
      END IF;

      IF v_conv.party_type = 'driver' THEN
        INSERT INTO public.trip_messages (
          conversation_id, organization_id, sender_user_id, sender_role,
          sender_name, content, message_type, is_read, metadata
        )
        VALUES (
          v_conv.id, v_conv.organization_id, NULL, 'system',
          'Trip System', p_content, 'system', FALSE, v_meta
        );
      ELSE
        PERFORM public.send_trip_chat_message(
          v_conv.id,
          p_content,
          'system',
          'Trip System',
          NULL,
          'system',
          v_meta
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'fn_post_system_message_to_trip_chats trip % conv %:%',
          p_trip_id, v_conv.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_trip_chat_message(
  p_conversation_id uuid,
  p_content         text,
  p_sender_role     text,
  p_sender_name     text,
  p_sender_user_id  uuid    DEFAULT NULL,
  p_message_type    text    DEFAULT 'text',
  p_metadata        jsonb   DEFAULT NULL
)
RETURNS public.trip_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv          public.trip_conversations%ROWTYPE;
  v_source_trip   public.trips%ROWTYPE;
  v_source_msg    public.trip_messages%ROWTYPE;

  v_target_org_id      uuid;
  v_target_trip        public.trips%ROWTYPE;
  v_target_party_type  text;
  v_target_party_id    uuid;
  v_target_party_name  text;
  v_target_conv_id     uuid;
  v_target_sender_role text;
BEGIN
  IF p_sender_role NOT IN ('dispatcher', 'client', 'supplier', 'driver', 'system') THEN
    RAISE EXCEPTION 'Invalid sender_role: %', p_sender_role;
  END IF;

  IF p_message_type NOT IN ('text', 'update', 'question', 'challenge', 'system', 'ledger_event', 'document_share') THEN
    RAISE EXCEPTION 'Invalid message_type: %', p_message_type;
  END IF;

  SELECT * INTO v_conv
  FROM public.trip_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found: %', p_conversation_id;
  END IF;

  IF p_sender_role <> 'system' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = v_conv.organization_id
    ) THEN
      RAISE EXCEPTION 'Not authorized for source organization';
    END IF;
  END IF;

  SELECT * INTO v_source_trip
  FROM public.trips
  WHERE id = v_conv.trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source trip not found for conversation: %', p_conversation_id;
  END IF;

  INSERT INTO public.trip_messages (
    conversation_id, organization_id, sender_user_id, sender_role,
    sender_name, content, message_type, is_read, metadata
  )
  VALUES (
    v_conv.id, v_conv.organization_id, p_sender_user_id, p_sender_role,
    p_sender_name, p_content, p_message_type, FALSE, p_metadata
  )
  RETURNING * INTO v_source_msg;

  IF p_sender_role NOT IN ('dispatcher', 'system') THEN
    RETURN v_source_msg;
  END IF;

  IF v_conv.party_type = 'client' THEN
    SELECT c.linked_organization_id INTO v_target_org_id
    FROM public.clients c WHERE c.id = v_conv.client_id;
  ELSIF v_conv.party_type = 'supplier' THEN
    SELECT s.linked_organization_id INTO v_target_org_id
    FROM public.suppliers s WHERE s.id = v_conv.supplier_id;
  ELSE
    RETURN v_source_msg;
  END IF;

  IF v_target_org_id IS NULL THEN RETURN v_source_msg; END IF;

  SELECT * INTO v_target_trip
  FROM public.trips t
  WHERE t.organization_id = v_target_org_id
    AND t.trip_number = v_source_trip.trip_number
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN v_source_msg; END IF;

  IF v_conv.party_type = 'client' THEN
    v_target_party_type  := 'supplier';
    v_target_sender_role := 'supplier';
    SELECT s.id, COALESCE(NULLIF(s.company_name,''), NULLIF(s.name,''), 'Supplier')
    INTO v_target_party_id, v_target_party_name
    FROM public.suppliers s
    WHERE s.organization_id = v_target_org_id
      AND s.linked_organization_id = v_conv.organization_id
    ORDER BY s.created_at DESC LIMIT 1;
  ELSE
    v_target_party_type  := 'client';
    v_target_sender_role := 'client';
    SELECT c.id, COALESCE(NULLIF(c.name,''), 'Client')
    INTO v_target_party_id, v_target_party_name
    FROM public.clients c
    WHERE c.organization_id = v_target_org_id
      AND c.linked_organization_id = v_conv.organization_id
    ORDER BY c.created_at DESC LIMIT 1;
  END IF;

  IF v_target_party_id IS NULL THEN RETURN v_source_msg; END IF;

  SELECT tc.id INTO v_target_conv_id
  FROM public.trip_conversations tc
  WHERE tc.trip_id = v_target_trip.id
    AND tc.party_type = v_target_party_type
  LIMIT 1;

  IF v_target_conv_id IS NULL THEN
    INSERT INTO public.trip_conversations (
      organization_id, trip_id, party_type, party_name,
      client_id, supplier_id, driver_id
    )
    VALUES (
      v_target_org_id, v_target_trip.id, v_target_party_type, v_target_party_name,
      CASE WHEN v_target_party_type = 'client' THEN v_target_party_id ELSE NULL END,
      CASE WHEN v_target_party_type = 'supplier' THEN v_target_party_id ELSE NULL END,
      NULL
    )
    ON CONFLICT (trip_id, party_type) DO UPDATE SET
      organization_id = excluded.organization_id,
      party_name      = coalesce(nullif(trim(excluded.party_name), ''), trip_conversations.party_name),
      client_id       = coalesce(excluded.client_id, trip_conversations.client_id),
      supplier_id     = coalesce(excluded.supplier_id, trip_conversations.supplier_id),
      updated_at      = now()
    RETURNING id INTO v_target_conv_id;
  END IF;

  INSERT INTO public.trip_messages (
    conversation_id, organization_id, sender_user_id, sender_role,
    sender_name, content, message_type, is_read, metadata
  )
  VALUES (
    v_target_conv_id, v_target_org_id, p_sender_user_id, v_target_sender_role,
    p_sender_name, p_content, p_message_type, FALSE, p_metadata
  );

  RETURN v_source_msg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_trip_chat_message(uuid, text, text, text, uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_broadcast_trip_status_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg text;
BEGIN
  IF tg_op = 'UPDATE' THEN
    IF old.status IS NOT DISTINCT FROM new.status THEN
      RETURN new;
    END IF;
  END IF;

  v_msg := public.fn_trip_status_chat_message_body(new);
  IF v_msg IS NULL THEN
    RETURN new;
  END IF;

  BEGIN
    PERFORM public.fn_ensure_trip_party_conversations(new.id);

    IF EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = new.id LIMIT 1) THEN
      PERFORM public.fn_post_system_message_to_trip_chats(new.id, v_msg, new.status::text);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'fn_broadcast_trip_status_to_chat trip %:%', new.id, SQLERRM;
  END;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.fn_post_system_message_to_trip_chats(uuid, text, text) IS
  'Posts Trip System lines per trip conversation; optional p_dedupe_status prevents duplicate status rows per thread.';

GRANT EXECUTE ON FUNCTION public.fn_post_system_message_to_trip_chats(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_post_system_message_to_trip_chats(uuid, text, text) TO service_role;
