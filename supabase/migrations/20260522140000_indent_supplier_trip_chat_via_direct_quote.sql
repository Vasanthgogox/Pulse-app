-- Indent / Staff Handshake: trips from accepted direct_quotes could have NULL supplier_id
-- when the shipper-side suppliers row was missing at create time. That hid trips from
-- get_trips_where_org_is_supplier, so trip chat merge returned no rows for the supplier org.
-- Fix: backfill supplier_id when uniquely inferable, ensure party threads, widen RPC + RLS + send RPC.

-- 1) Backfill supplier_id + ensure supplier/client/driver conversation rows
DO $$
DECLARE
  tid uuid;
BEGIN
  FOR tid IN
    WITH cand AS (
      SELECT
        t2.id AS tid,
        (array_agg(s.id ORDER BY s.created_at ASC))[1] AS sid
      FROM public.trips t2
      INNER JOIN public.direct_quotes dq
        ON dq.indent_id = t2.indent_id
       AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
      INNER JOIN public.suppliers s
        ON s.organization_id = t2.organization_id
       AND s.linked_organization_id = dq.bidder_organization_id
      WHERE t2.indent_id IS NOT NULL
        AND t2.supplier_id IS NULL
      GROUP BY t2.id
      HAVING count(DISTINCT s.id) = 1
    ),
    upd AS (
      UPDATE public.trips t
      SET
        supplier_id = cand.sid,
        updated_at = now()
      FROM cand
      WHERE t.id = cand.tid
      RETURNING t.id
    )
    SELECT id FROM upd
  LOOP
    PERFORM public.fn_ensure_trip_party_conversations(tid);
  END LOOP;
END $$;

-- 2) RPC: supplier org sees indent trips they supply OR where they are accepted bidder on the indent
CREATE OR REPLACE FUNCTION public.get_trips_where_org_is_supplier(p_org_id uuid)
RETURNS SETOF public.trips
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT ON (t.id) t.*
  FROM public.trips t
  WHERE t.indent_id IS NOT NULL
    AND public.is_org_member(p_org_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.suppliers s
        WHERE s.id = t.supplier_id
          AND s.linked_organization_id = p_org_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.direct_quotes dq
        WHERE dq.indent_id = t.indent_id
          AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
          AND dq.bidder_organization_id = p_org_id
      )
    )
  ORDER BY t.id, t.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_trips_where_org_is_supplier(uuid) IS
  'Indent/load trips for supplier org: linked suppliers row OR accepted direct_quote bidder = p_org_id.';

-- 3) trips SELECT: supplier org can read trip rows (embeds trip chat) via supplier link OR accepted quote
DROP POLICY IF EXISTS "Orgs can read trips where they are the supplier" ON public.trips;

CREATE POLICY "Orgs can read trips where they are the supplier"
  ON public.trips FOR SELECT
  USING (
    trips.indent_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.suppliers s
        WHERE s.id = trips.supplier_id
          AND s.linked_organization_id IS NOT NULL
          AND s.linked_organization_id IN (
            SELECT om.organization_id
            FROM public.organization_members om
            WHERE om.user_id = auth.uid()
              AND COALESCE(om.status, 'active') = 'active'
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.direct_quotes dq
        WHERE dq.indent_id = trips.indent_id
          AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
          AND dq.bidder_organization_id IN (
            SELECT om.organization_id
            FROM public.organization_members om
            WHERE om.user_id = auth.uid()
              AND COALESCE(om.status, 'active') = 'active'
          )
      )
    )
  );

COMMENT ON POLICY "Orgs can read trips where they are the supplier" ON public.trips IS
  'Supplier org: indent trips where they are linked supplier OR accepted bidder on the indent.';

-- 4) trip_conversations / trip_messages: same OR for linked-supplier read + insert paths
DROP POLICY IF EXISTS "Linked supplier org reads trip conversations for supplied trips" ON public.trip_conversations;

CREATE POLICY "Linked supplier org reads trip conversations for supplied trips"
  ON public.trip_conversations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      INNER JOIN public.suppliers s ON s.id = t.supplier_id
      INNER JOIN public.organization_members om
        ON om.user_id = auth.uid()
       AND om.organization_id = s.linked_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE t.id = trip_conversations.trip_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.trips t
      INNER JOIN public.direct_quotes dq
        ON dq.indent_id = t.indent_id
       AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
      INNER JOIN public.organization_members om
        ON om.user_id = auth.uid()
       AND om.organization_id = dq.bidder_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE t.id = trip_conversations.trip_id
        AND t.indent_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Linked supplier org reads trip messages for supplied trips" ON public.trip_messages;

CREATE POLICY "Linked supplier org reads trip messages for supplied trips"
  ON public.trip_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trip_conversations tc
      INNER JOIN public.trips t ON t.id = tc.trip_id
      INNER JOIN public.suppliers s ON s.id = t.supplier_id
      INNER JOIN public.organization_members om
        ON om.user_id = auth.uid()
       AND om.organization_id = s.linked_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE tc.id = trip_messages.conversation_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.trip_conversations tc
      INNER JOIN public.trips t ON t.id = tc.trip_id
      INNER JOIN public.direct_quotes dq
        ON dq.indent_id = t.indent_id
       AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
      INNER JOIN public.organization_members om
        ON om.user_id = auth.uid()
       AND om.organization_id = dq.bidder_organization_id
       AND COALESCE(om.status, 'active') = 'active'
      WHERE tc.id = trip_messages.conversation_id
        AND t.indent_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Linked supplier org inserts supplier party messages" ON public.trip_messages;

CREATE POLICY "Linked supplier org inserts supplier party messages"
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
        INNER JOIN public.suppliers s ON s.id = t.supplier_id AND s.id = tc.supplier_id
        INNER JOIN public.organization_members om
          ON om.user_id = auth.uid()
         AND om.organization_id = s.linked_organization_id
         AND COALESCE(om.status, 'active') = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'supplier'
      )
      OR EXISTS (
        SELECT 1
        FROM public.trip_conversations tc
        INNER JOIN public.trips t ON t.id = tc.trip_id
        INNER JOIN public.direct_quotes dq
          ON dq.indent_id = t.indent_id
         AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
        INNER JOIN public.organization_members om
          ON om.user_id = auth.uid()
         AND om.organization_id = dq.bidder_organization_id
         AND COALESCE(om.status, 'active') = 'active'
        WHERE tc.id = trip_messages.conversation_id
          AND tc.party_type = 'supplier'
          AND t.indent_id IS NOT NULL
          AND tc.supplier_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.suppliers s2
            WHERE s2.id = tc.supplier_id
              AND s2.linked_organization_id = dq.bidder_organization_id
          )
      )
    )
  );

COMMENT ON POLICY "Linked supplier org reads trip conversations for supplied trips" ON public.trip_conversations IS
  'Supplier org: SELECT conversations for supplied indent trips (linked supplier row OR accepted bidder).';

COMMENT ON POLICY "Linked supplier org reads trip messages for supplied trips" ON public.trip_messages IS
  'Supplier org: read messages for those conversations.';

COMMENT ON POLICY "Linked supplier org inserts supplier party messages" ON public.trip_messages IS
  'Supplier org: post as supplier on supplier party thread when linked or accepted bidder matches.';

-- 5) send_trip_chat_message: allow supplier sender when accepted bidder matches conversation supplier
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
        AND COALESCE(om.status, 'active') = 'active'
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
      AND (
        EXISTS (
          SELECT 1
          FROM public.trips t
          INNER JOIN public.suppliers s ON s.id = t.supplier_id AND s.id = v_conv.supplier_id
          INNER JOIN public.organization_members om
            ON om.user_id = auth.uid()
           AND om.organization_id = s.linked_organization_id
           AND COALESCE(om.status, 'active') = 'active'
          WHERE t.id = v_conv.trip_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.trips t
          INNER JOIN public.direct_quotes dq
            ON dq.indent_id = t.indent_id
           AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
          INNER JOIN public.organization_members om
            ON om.user_id = auth.uid()
           AND om.organization_id = dq.bidder_organization_id
           AND COALESCE(om.status, 'active') = 'active'
          WHERE t.id = v_conv.trip_id
            AND t.indent_id IS NOT NULL
            AND v_conv.supplier_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.suppliers s2
              WHERE s2.id = v_conv.supplier_id
                AND s2.linked_organization_id = dq.bidder_organization_id
            )
        )
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
