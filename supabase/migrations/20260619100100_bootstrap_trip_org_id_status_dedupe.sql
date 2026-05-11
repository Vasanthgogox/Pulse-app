-- 1) Bootstrap: expose trips.organization_id as trip_organization_id so the client
--    can submit debriefs as the fleet owner while viewing supplier/client lanes.
-- 2) Status broadcast dedupe: treat system_log / update like system when checking
--    for an existing trip_status_broadcast row (avoids triple inserts if paths differ).

CREATE OR REPLACE FUNCTION public.get_initial_chat_state(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      jsonb_agg(c ORDER BY (c->>'last_message_at') DESC NULLS LAST),
      '[]'::jsonb
    )
    FROM (
      SELECT jsonb_build_object(
        'id',                      tc.id,
        'organization_id',         tc.organization_id,
        'trip_organization_id',      t.organization_id,
        'trip_id',                 tc.trip_id,
        'party_type',              tc.party_type,
        'party_name',              tc.party_name,
        'client_id',               tc.client_id,
        'supplier_id',             tc.supplier_id,
        'driver_id',               tc.driver_id,
        'last_message_at',         tc.last_message_at,
        'last_message_preview',    tc.last_message_preview,
        'unread_dispatcher_count', COALESCE(tc.unread_dispatcher_count, 0),
        'created_at',              tc.created_at,
        'updated_at',              tc.updated_at,
        'trip_number',             t.trip_number,
        'display_trip_id',         t.display_trip_id,
        'trip_status',             t.status,
        'trip_driver_id',          t.driver_id,
        'trip_supplier_id',        t.supplier_id,
        'trip_created_at',         t.created_at,
        'pickup_area',             t.pickup_area,
        'drop_location',           t.drop_location,
        'trip_feedback_status', (
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM   public.trip_messages m
              WHERE  m.conversation_id = tc.id
                AND  m.message_type IN ('feedback_request', 'feedback')
                AND  (m.metadata->>'submitted_at') IS NOT NULL
            )
            THEN 'rated'
            WHEN EXISTS (
              SELECT 1
              FROM   public.trip_messages m
              WHERE  m.conversation_id = tc.id
                AND  m.message_type IN ('feedback_request', 'feedback')
                AND  (m.metadata->>'submitted_at') IS NULL
                AND  COALESCE(m.metadata->>'rating_status', '') <> 'rated'
            )
            THEN 'pending'
            ELSE 'none'
          END
        ),
        'messages', COALESCE((
          SELECT jsonb_agg(msg_row ORDER BY msg_row->>'created_at' ASC)
          FROM (
            SELECT jsonb_build_object(
              'id',                 m.id,
              'conversation_id',    m.conversation_id,
              'organization_id',    m.organization_id,
              'sender_user_id',     m.sender_user_id,
              'sender_role',        m.sender_role,
              'sender_name',        m.sender_name,
              'content',            m.content,
              'message_type',       m.message_type,
              'metadata',           m.metadata,
              'is_read',            m.is_read,
              'read_at',            m.read_at,
              'created_at',         m.created_at,
              'sender_avatar_seed', m.sender_avatar_seed,
              'is_delivered',       COALESCE(m.is_delivered, FALSE),
              'delivered_at',       m.delivered_at
            ) AS msg_row
            FROM (
              SELECT * FROM public.trip_messages
              WHERE  conversation_id = tc.id
              ORDER  BY created_at DESC
              LIMIT  p_message_limit
            ) m
          ) sub
        ), '[]'::jsonb)
      ) AS c
      FROM  public.trip_conversations tc
      JOIN  public.trips              t ON t.id = tc.trip_id
      WHERE (
        tc.organization_id = p_organization_id
        OR tc.trip_id IN (
          SELECT tr.id
          FROM   public.trips tr
          WHERE  tr.status NOT IN ('cancelled')
            AND  EXISTS (
              SELECT 1 FROM public.suppliers s
              WHERE  s.id = tr.supplier_id
                AND  s.linked_organization_id = p_organization_id
            )
          LIMIT 500
        )
      )
        AND t.status <> 'cancelled'
    ) rows
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.get_initial_chat_state(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_initial_chat_state(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.get_initial_chat_state(UUID, INT) IS
  'Bootstrap conversation rows + last N messages. trip_feedback_status from '
  'feedback_request metadata only. trip_organization_id = trips.organization_id (rater org).';

CREATE OR REPLACE FUNCTION public.fn_post_system_message_to_trip_chats(
  p_trip_id       UUID,
  p_content       TEXT,
  p_dedupe_status TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv          RECORD;
  v_meta          JSONB;
  v_source_trip   RECORD;
  v_partner_org   UUID;
  v_partner_trip  RECORD;
  v_partner_conv  UUID;
BEGIN
  v_meta := jsonb_build_object(
    'trip_status_broadcast', '1',
    'status', COALESCE(p_dedupe_status, ''),
    'event_payload', jsonb_build_object(
      'new_status', NULLIF(trim(COALESCE(p_dedupe_status, '')), ''),
      'trip_id', p_trip_id
    )
  );

  SELECT id, organization_id, trip_number, client_id, supplier_id
  INTO   v_source_trip
  FROM   public.trips
  WHERE  id = p_trip_id;

  IF NOT FOUND THEN RETURN; END IF;

  FOR v_conv IN
    SELECT id, party_type, organization_id, client_id, supplier_id
    FROM   public.trip_conversations
    WHERE  trip_id = p_trip_id
  LOOP

    IF p_dedupe_status IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.trip_messages tm
      WHERE  tm.conversation_id = v_conv.id
        AND  tm.message_type IN ('system', 'system_log', 'update')
        AND  (tm.metadata->>'trip_status_broadcast') = '1'
        AND  (
          (tm.metadata->>'status') = trim(p_dedupe_status)
          OR (tm.metadata->'event_payload'->>'new_status') = trim(p_dedupe_status)
        )
      LIMIT 1
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.trip_messages (
      conversation_id,  organization_id,     sender_user_id,
      sender_role,      sender_name,         content,
      message_type,     is_read,             metadata
    ) VALUES (
      v_conv.id,        v_conv.organization_id, NULL,
      'system',         'Trip System',          p_content,
      'system',         FALSE,                  v_meta
    );

    v_partner_org := NULL;

    IF v_conv.party_type = 'client' AND v_conv.client_id IS NOT NULL THEN
      SELECT linked_organization_id INTO v_partner_org
      FROM   public.clients
      WHERE  id = v_conv.client_id;

    ELSIF v_conv.party_type = 'supplier' AND v_conv.supplier_id IS NOT NULL THEN
      SELECT linked_organization_id INTO v_partner_org
      FROM   public.suppliers
      WHERE  id = v_conv.supplier_id;
    END IF;

    IF v_partner_org IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id, organization_id INTO v_partner_trip
    FROM   public.trips
    WHERE  organization_id = v_partner_org
      AND  trip_number     = v_source_trip.trip_number
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT id INTO v_partner_conv
    FROM   public.trip_conversations
    WHERE  trip_id    = v_partner_trip.id
      AND  party_type = v_conv.party_type
    LIMIT 1;

    IF v_partner_conv IS NULL THEN CONTINUE; END IF;

    IF p_dedupe_status IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.trip_messages tm
      WHERE  tm.conversation_id = v_partner_conv
        AND  tm.message_type IN ('system', 'system_log', 'update')
        AND  (tm.metadata->>'trip_status_broadcast') = '1'
        AND  (
          (tm.metadata->>'status') = trim(p_dedupe_status)
          OR (tm.metadata->'event_payload'->>'new_status') = trim(p_dedupe_status)
        )
      LIMIT 1
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.trip_messages (
      conversation_id,  organization_id,           sender_user_id,
      sender_role,      sender_name,               content,
      message_type,     is_read,                   metadata
    ) VALUES (
      v_partner_conv,   v_partner_trip.organization_id, NULL,
      'system',         'Trip System',                  p_content,
      'system',         FALSE,                          v_meta
    );

  END LOOP;
END;
$$;
