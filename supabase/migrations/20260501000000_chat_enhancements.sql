-- ============================================================
-- Chat Enhancement Migration
-- 1. Add metadata column to trip_messages
-- 2. Update send_trip_chat_message to accept new types + metadata
-- 3. Create system-message broadcast function (no auth check)
-- 4. Create trigger: trip status → system message in chat
-- 5. RLS: allow drivers to read/write their own trip conversations
-- ============================================================

-- ── 1. Add metadata column + expand message_type constraint ──────────────────

ALTER TABLE public.trip_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE public.trip_messages DROP CONSTRAINT IF EXISTS trip_messages_message_type_check;
ALTER TABLE public.trip_messages ADD CONSTRAINT trip_messages_message_type_check
  CHECK (message_type = ANY (ARRAY['text','update','question','challenge','system','ledger_event','document_share']));

-- ── 2. Replace send_trip_chat_message with metadata support ───────────────────

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

  -- Auth check skipped for system messages (trigger context has no user session).
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

  -- Mirror only dispatcher + system messages to linked partner org conversations.
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

-- ── 3. System broadcast function (no user session required) ───────────────────

CREATE OR REPLACE FUNCTION public.fn_post_system_message_to_trip_chats(
  p_trip_id uuid,
  p_content  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv RECORD;
BEGIN
  FOR v_conv IN
    SELECT id, organization_id
    FROM public.trip_conversations
    WHERE trip_id = p_trip_id
  LOOP
    INSERT INTO public.trip_messages (
      conversation_id, organization_id, sender_user_id, sender_role,
      sender_name, content, message_type, is_read
    )
    VALUES (
      v_conv.id, v_conv.organization_id, NULL, 'system',
      'Trip System', p_content, 'system', FALSE
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_post_system_message_to_trip_chats(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_post_system_message_to_trip_chats(uuid, text) TO service_role;

-- ── 4. Trigger: trip status changes → system message ─────────────────────────

CREATE OR REPLACE FUNCTION public.fn_broadcast_trip_status_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_msg text;
BEGIN
  -- Skip if status unchanged or new value is null
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_msg := CASE NEW.status
    WHEN 'assigned' THEN
      'Vehicle ' || COALESCE(NULLIF(NEW.vehicle_display_number,''), 'TBD') ||
      ' assigned. Driver ' || COALESCE(NULLIF(NEW.driver_display_name,''), 'assigned') ||
      ' will report shortly.'
    WHEN 'in_progress' THEN
      'Driver ' || COALESCE(NULLIF(NEW.driver_display_name,''), 'assigned') ||
      ' has accepted the trip and is heading to pickup.'
    WHEN 'picked_up' THEN
      'Driver has reached the pickup point — ' ||
      COALESCE(NULLIF(NEW.pickup_area,''), 'pickup location') || '.'
    WHEN 'in_transit' THEN
      'Trip is now in transit. Vehicle departed ' ||
      COALESCE(NULLIF(NEW.pickup_area,''), 'pickup') || '.'
    WHEN 'at_drop' THEN
      'Vehicle has reached the destination — ' ||
      COALESCE(NULLIF(NEW.drop_location,''), 'drop location') || '.'
    WHEN 'completed' THEN
      'Trip ' || COALESCE(NULLIF(NEW.trip_number,''), '') ||
      ' completed successfully.'
    WHEN 'cancelled' THEN
      'Trip has been cancelled.'
    ELSE NULL
  END;

  IF v_msg IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only broadcast when at least one conversation exists for this trip
  IF EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = NEW.id LIMIT 1) THEN
    PERFORM public.fn_post_system_message_to_trip_chats(NEW.id, v_msg);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_status_to_chat ON public.trips;

CREATE TRIGGER trg_trip_status_to_chat
  AFTER UPDATE OF status ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_broadcast_trip_status_to_chat();

-- ── 5. RLS: driver access to their own trip conversations and messages ─────────

-- Allow drivers to read trip_conversations where they are the assigned driver
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trip_conversations'
      AND policyname = 'Drivers can view their own trip conversations'
  ) THEN
    CREATE POLICY "Drivers can view their own trip conversations"
      ON public.trip_conversations
      FOR SELECT
      TO authenticated
      USING (
        driver_id IN (
          SELECT d.id FROM public.drivers d
          WHERE d.user_id = auth.uid()
        )
        OR
        organization_id IN (
          SELECT om.organization_id FROM public.organization_members om
          WHERE om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Allow drivers to read messages in their conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trip_messages'
      AND policyname = 'Drivers can view messages in their conversations'
  ) THEN
    CREATE POLICY "Drivers can view messages in their conversations"
      ON public.trip_messages
      FOR SELECT
      TO authenticated
      USING (
        conversation_id IN (
          SELECT tc.id FROM public.trip_conversations tc
          INNER JOIN public.drivers d ON d.id = tc.driver_id
          WHERE d.user_id = auth.uid()
        )
        OR
        organization_id IN (
          SELECT om.organization_id FROM public.organization_members om
          WHERE om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Allow drivers to insert messages into their conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trip_messages'
      AND policyname = 'Drivers can send messages in their conversations'
  ) THEN
    CREATE POLICY "Drivers can send messages in their conversations"
      ON public.trip_messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        sender_role = 'driver'
        AND (
          conversation_id IN (
            SELECT tc.id FROM public.trip_conversations tc
            INNER JOIN public.drivers d ON d.id = tc.driver_id
            WHERE d.user_id = auth.uid()
          )
          OR
          organization_id IN (
            SELECT om.organization_id FROM public.organization_members om
            WHERE om.user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;
