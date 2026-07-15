-- Fix cross-org message routing bug
--
-- Root cause (3-part chain):
-- 1. Two overloads of send_trip_chat_message (6-param old, 7-param new with p_metadata) both
--    match when app omits p_metadata → PostgreSQL throws "42725: function is not unique" →
--    error message contains "send_trip_chat_message" → isMissingRpc=true in the client →
--    falls through to direct-insert fallback.
-- 2. Fallback does supabase().from("trip_conversations").select() to get the conv's org_id.
--    The linked-supplier RLS policy on trip_conversations uses a subquery against trips, which
--    is itself RLS-filtered — Deepak's trip is invisible to nihas → convMeta=null →
--    messageOrgId falls back to the sender's own org (c481a15d instead of b177c614).
-- 3. INSERT with wrong org_id succeeds (sender IS a member of their own org via the ALL policy)
--    but Deepak's Realtime subscription (organization_id=eq.b177c614) never fires.
--
-- Fix:
-- A. Drop the old 6-param overload → eliminates ambiguity → app resolves to the new overload.
-- B. Extend the new overload's auth check to accept p_sender_role='dispatcher' from a linked
--    supplier org (the TripChatContext always sends 'dispatcher', never 'supplier').
-- C. Add an RLS INSERT policy so the fallback direct-insert also works correctly when the RPC
--    is unavailable, enforcing organization_id = conv's org_id for linked supplier dispatchers.

-- ── A. Drop old 6-param overload ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.send_trip_chat_message(
  uuid, text, text, text, uuid, text
);

-- ── B. Replace new overload with extended auth (add 'dispatcher' as valid linked-supplier role) ─
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
SET search_path TO 'public'
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
      -- Primary: caller is a member of the conversation's owning org.
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = v_conv.organization_id
        AND om.status = 'active'
    ) AND NOT (
      -- Driver sending in their own driver-lane conversation.
      p_sender_role = 'driver'
      AND v_conv.party_type = 'driver'
      AND EXISTS (
        SELECT 1 FROM public.drivers d
        WHERE d.id = v_conv.driver_id
          AND d.user_id IS NOT DISTINCT FROM auth.uid()
      )
    ) AND NOT (
      -- Linked supplier (or their dispatcher) sending in the supplier-party lane.
      p_sender_role IN ('supplier', 'dispatcher')
      AND v_conv.party_type = 'supplier'
      AND EXISTS (
        SELECT 1
        FROM public.trips t
        INNER JOIN public.suppliers s
          ON s.id = t.supplier_id AND s.id = v_conv.supplier_id
        INNER JOIN public.organization_members om
          ON om.user_id = auth.uid()
         AND om.organization_id = s.linked_organization_id
         AND om.status = 'active'
        WHERE t.id = v_conv.trip_id
      )
    ) AND NOT (
      -- Linked supplier (or their dispatcher) sending in the driver lane (supplier_id set).
      p_sender_role IN ('supplier', 'dispatcher')
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
      -- Linked supplier (or their dispatcher) sending in driver lane (indent-based, no supplier_id yet).
      p_sender_role IN ('supplier', 'dispatcher')
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

  -- Mirror only dispatcher/system messages to linked partner org conversations.
  IF p_sender_role NOT IN ('dispatcher', 'system') THEN
    RETURN v_source_msg;
  END IF;

  -- Determine the linked partner org from the party lane.
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

  -- Only mirror host-org dispatchers to the linked partner, not the linked supplier's own
  -- dispatcher messages (they already landed in the host's conv above).
  IF v_conv.organization_id <> v_source_trip.organization_id THEN
    RETURN v_source_msg;
  END IF;

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

-- ── C. RLS INSERT policy: linked supplier dispatchers can insert into the host's conv ─────────
-- Covers the direct-insert fallback path (used when RPC is unavailable) and ensures that even
-- without the RPC the message lands with the correct organization_id (the conversation's org).
DROP POLICY IF EXISTS "Linked supplier dispatcher inserts in host trip convs" ON public.trip_messages;
CREATE POLICY "Linked supplier dispatcher inserts in host trip convs"
  ON public.trip_messages FOR INSERT
  WITH CHECK (
    sender_role = 'dispatcher'
    -- The message's org_id must equal the conversation's org_id (the host org), not the sender's org.
    AND organization_id = (
      SELECT tc.organization_id
      FROM public.trip_conversations tc
      WHERE tc.id = trip_messages.conversation_id
    )
    AND (
      -- Supplier lane: linked via suppliers.linked_organization_id.
      EXISTS (
        SELECT 1
        FROM public.trip_conversations tc
        JOIN public.trips t ON t.id = tc.trip_id
        JOIN public.suppliers s ON s.id = t.supplier_id AND s.id = tc.supplier_id
        JOIN public.organization_members om
          ON om.user_id = auth.uid()
         AND om.organization_id = s.linked_organization_id
         AND om.status = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'supplier'
      )
      OR
      -- Driver lane: linked via suppliers.linked_organization_id on the trip.
      EXISTS (
        SELECT 1
        FROM public.trip_conversations tc
        JOIN public.trips t ON t.id = tc.trip_id
        JOIN public.suppliers s ON s.id = t.supplier_id
        JOIN public.organization_members om
          ON om.user_id = auth.uid()
         AND om.organization_id = s.linked_organization_id
         AND om.status = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'driver'
      )
    )
  );

-- ── D. Backfill: correct the wrong-org messages already in the DB ──────────────────────────────
-- Messages inserted via the broken fallback path have organization_id = sender's org (c481a15d)
-- but belong to conversations whose organization_id is the host org (b177c614). Fix them so
-- Deepak's Realtime subscription can pick them up on next load.
UPDATE public.trip_messages tm
SET    organization_id = tc.organization_id
FROM   public.trip_conversations tc
WHERE  tm.conversation_id = tc.id
  AND  tm.organization_id <> tc.organization_id
  -- Only fix messages in supplier/driver lanes (not messages the host intentionally put elsewhere).
  AND  tc.party_type IN ('supplier', 'driver')
  -- Only touch messages where the sender's org is a linked supplier of the trip.
  AND  EXISTS (
    SELECT 1
    FROM   public.trips t
    JOIN   public.suppliers s ON s.id = t.supplier_id
    WHERE  t.id = tc.trip_id
      AND  s.linked_organization_id = tm.organization_id
  );
