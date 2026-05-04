-- Fix trip chat for load-hub / supplier users on indent-based trips:
-- 1) send_trip_chat_message: allow linked supplier to post in the *driver* thread (app uses
--    sender_role=supplier when conv.organization_id is the shipper org).
-- 2) ensure_driver_trip_conversation: when trips.supplier_id is still NULL, authorize the
--    executing partner via indents.assigned_supplier_id (FK to organizations — same as quote accept).

CREATE OR REPLACE FUNCTION public.ensure_driver_trip_conversation(
  p_trip_id    uuid,
  p_driver_id  uuid,
  p_party_name text
)
RETURNS public.trip_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
  v_row  public.trip_conversations%ROWTYPE;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF v_trip.driver_id IS NULL OR v_trip.driver_id <> p_driver_id THEN
    RAISE EXCEPTION 'Driver does not match this trip';
  END IF;

  -- Authorized: fleet member | linked supplier for trip | assigned driver (driver app)
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = v_trip.organization_id
      AND om.status = 'active'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.trips t
    INNER JOIN public.suppliers s ON s.id = t.supplier_id
    INNER JOIN public.organization_members om
      ON om.organization_id = s.linked_organization_id
     AND om.user_id = auth.uid()
     AND om.status = 'active'
    WHERE t.id = p_trip_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.trips t
    INNER JOIN public.indents i ON i.id = t.indent_id
    INNER JOIN public.organization_members om
      ON om.organization_id = i.assigned_supplier_id
     AND om.user_id = auth.uid()
     AND om.status = 'active'
    WHERE t.id = p_trip_id
      AND t.supplier_id IS NULL
      AND t.indent_id IS NOT NULL
      AND i.assigned_supplier_id IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.user_id = auth.uid()
      AND d.id = p_driver_id
      AND EXISTS (
        SELECT 1 FROM public.trips t2
        WHERE t2.id = p_trip_id AND t2.driver_id = d.id AND t2.organization_id = v_trip.organization_id
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage trip chat for this trip' USING ERRCODE = '42501';
  END IF;

  v_name := coalesce(nullif(trim(p_party_name), ''), 'Driver');

  INSERT INTO public.trip_conversations (
    organization_id,
    trip_id,
    party_type,
    party_name,
    driver_id
  )
  VALUES (
    v_trip.organization_id,
    p_trip_id,
    'driver',
    v_name,
    p_driver_id
  )
  ON CONFLICT (trip_id, party_type) DO UPDATE SET
    party_name = coalesce(
      nullif(trim(excluded.party_name), ''),
      trip_conversations.party_name
    ),
    driver_id = coalesce(excluded.driver_id, trip_conversations.driver_id),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.ensure_driver_trip_conversation(uuid, uuid, text) IS
  'Idempotent driver party row for trip chat; bypasses RLS under validated fleet, linked supplier (trips.supplier_id), indent assigned org (indents.assigned_supplier_id when trip.supplier_id null), or assigned driver.';

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

  IF p_message_type NOT IN (
    'text', 'update', 'question', 'challenge', 'system', 'ledger_event', 'document_share', 'feedback_request'
  ) THEN
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
        AND om.status = 'active'
    ) AND NOT (
      p_sender_role = 'driver'
      AND v_conv.party_type = 'driver'
      AND EXISTS (
        SELECT 1 FROM public.drivers d
        WHERE d.id = v_conv.driver_id
          AND d.user_id IS NOT DISTINCT FROM auth.uid()
      )
    ) AND NOT (
      p_sender_role = 'supplier'
      AND v_conv.party_type = 'supplier'
      AND EXISTS (
        SELECT 1
        FROM public.trips t
        INNER JOIN public.suppliers s ON s.id = t.supplier_id AND s.id = v_conv.supplier_id
        INNER JOIN public.organization_members om
          ON om.user_id = auth.uid()
         AND om.organization_id = s.linked_organization_id
         AND om.status = 'active'
        WHERE t.id = v_conv.trip_id
      )
    ) AND NOT (
      p_sender_role = 'supplier'
      AND v_conv.party_type = 'driver'
      AND EXISTS (
        SELECT 1
        FROM public.trips t
        INNER JOIN public.suppliers s ON s.id = t.supplier_id
        INNER JOIN public.organization_members om
          ON om.user_id = auth.uid()
         AND om.organization_id = s.linked_organization_id
         AND om.status = 'active'
        WHERE t.id = v_conv.trip_id
      )
    ) AND NOT (
      p_sender_role = 'supplier'
      AND v_conv.party_type = 'driver'
      AND EXISTS (
        SELECT 1
        FROM public.trips t
        INNER JOIN public.indents i ON i.id = t.indent_id
        INNER JOIN public.organization_members om
          ON om.organization_id = i.assigned_supplier_id
         AND om.user_id = auth.uid()
         AND om.status = 'active'
        WHERE t.id = v_conv.trip_id
          AND t.supplier_id IS NULL
          AND t.indent_id IS NOT NULL
          AND i.assigned_supplier_id IS NOT NULL
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

  IF p_message_type = 'feedback_request' THEN
    RETURN v_source_msg;
  END IF;

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

-- RLS: existing policies join trips.supplier_id only; draft indent trips can have NULL supplier_id
-- while indents.assigned_supplier_id still identifies the executing partner org.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_conversations'
      AND policyname = 'Linked supplier via indent reads trip conversations'
  ) THEN
    CREATE POLICY "Linked supplier via indent reads trip conversations"
      ON public.trip_conversations
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.trips t
          INNER JOIN public.indents i ON i.id = t.indent_id
          INNER JOIN public.organization_members om
            ON om.organization_id = i.assigned_supplier_id
           AND om.user_id = auth.uid()
           AND om.status = 'active'
          WHERE t.id = trip_conversations.trip_id
            AND t.supplier_id IS NULL
            AND t.indent_id IS NOT NULL
            AND i.assigned_supplier_id IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_messages'
      AND policyname = 'Linked supplier via indent reads trip messages'
  ) THEN
    CREATE POLICY "Linked supplier via indent reads trip messages"
      ON public.trip_messages
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.trip_conversations tc
          INNER JOIN public.trips t ON t.id = tc.trip_id
          INNER JOIN public.indents i ON i.id = t.indent_id
          INNER JOIN public.organization_members om
            ON om.organization_id = i.assigned_supplier_id
           AND om.user_id = auth.uid()
           AND om.status = 'active'
          WHERE tc.id = trip_messages.conversation_id
            AND t.supplier_id IS NULL
            AND t.indent_id IS NOT NULL
            AND i.assigned_supplier_id IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_messages'
      AND policyname = 'Linked supplier inserts supplier in driver thread'
  ) THEN
    CREATE POLICY "Linked supplier inserts supplier in driver thread"
      ON public.trip_messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        sender_role = 'supplier'
        AND organization_id = (
          SELECT tc.organization_id
          FROM public.trip_conversations tc
          WHERE tc.id = trip_messages.conversation_id
        )
        AND (
          EXISTS (
            SELECT 1
            FROM public.trip_conversations tc
            INNER JOIN public.trips t ON t.id = tc.trip_id
            INNER JOIN public.suppliers s ON s.id = t.supplier_id
            INNER JOIN public.organization_members om
              ON om.user_id = auth.uid()
             AND om.organization_id = s.linked_organization_id
             AND om.status = 'active'
            WHERE tc.id = trip_messages.conversation_id
              AND tc.party_type = 'driver'
          )
          OR EXISTS (
            SELECT 1
            FROM public.trip_conversations tc
            INNER JOIN public.trips t ON t.id = tc.trip_id
            INNER JOIN public.indents i ON i.id = t.indent_id
            INNER JOIN public.organization_members om
              ON om.organization_id = i.assigned_supplier_id
             AND om.user_id = auth.uid()
             AND om.status = 'active'
            WHERE tc.id = trip_messages.conversation_id
              AND tc.party_type = 'driver'
              AND t.supplier_id IS NULL
              AND t.indent_id IS NOT NULL
              AND i.assigned_supplier_id IS NOT NULL
          )
        )
      );
  END IF;
END $$;

COMMENT ON POLICY "Linked supplier via indent reads trip conversations" ON public.trip_conversations IS
  'Executing org (indents.assigned_supplier_id → organizations) can read threads when trips.supplier_id is NULL.';

COMMENT ON POLICY "Linked supplier via indent reads trip messages" ON public.trip_messages IS
  'Read driver/client/etc. threads for indent trips where supplier_id is still NULL.';

COMMENT ON POLICY "Linked supplier inserts supplier in driver thread" ON public.trip_messages IS
  'Direct-insert fallback: supplier posts in shipper-owned driver thread (RPC preferred).';
