-- Drivers send chat via send_trip_chat_message RPC but are typically NOT rows in
-- organization_members (they authenticate via drivers.user_id). The RPC previously
-- required org membership for every non-system sender, so driver replies failed and
-- never appeared for dispatchers or in the thread.

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
    ) AND NOT (
      p_sender_role = 'driver'
      AND v_conv.party_type = 'driver'
      AND EXISTS (
        SELECT 1 FROM public.drivers d
        WHERE d.id = v_conv.driver_id
          AND d.user_id IS NOT DISTINCT FROM auth.uid()
      )
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
