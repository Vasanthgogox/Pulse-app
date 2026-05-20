-- ─────────────────────────────────────────────────────────────────────────────
-- WhatsApp-style chat bootstrap RPC
--
-- get_initial_chat_state
--   Single call that loads all non-cancelled trip conversations + last N
--   messages per conversation on app boot.  After this one call the app
--   relies exclusively on Realtime for incremental updates — no further
--   DB polls or per-conversation hydrate() calls.
--
-- change_trip_status_with_notification
--   Atomic: updates trip.status AND inserts a status_change system message
--   in every conversation for that trip.  Used by the chat context's
--   changeTripStatus optimistic handler.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. get_initial_chat_state ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_initial_chat_state(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 20
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
        -- conversation row
        'id',                      tc.id,
        'organization_id',         tc.organization_id,
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
        -- trip metadata (embedded — avoids a second round-trip per conversation)
        'trip_number',             t.trip_number,
        'display_trip_id',         t.display_trip_id,
        'trip_status',             t.status,
        'trip_driver_id',          t.driver_id,
        'trip_supplier_id',        t.supplier_id,
        'trip_created_at',         t.created_at,
        'pickup_area',             t.pickup_area,
        'drop_location',           t.drop_location,
        -- last N messages in ascending order (oldest first for chat display)
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
      WHERE tc.organization_id = p_organization_id
        AND t.status <> 'cancelled'
    ) rows
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.get_initial_chat_state(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_initial_chat_state(UUID, INT) TO authenticated;


-- ── 2. change_trip_status_with_notification ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_trip_status_with_notification(
  p_trip_id         UUID,
  p_organization_id UUID,
  p_new_status      TEXT,
  p_user_id         UUID  DEFAULT NULL,
  p_user_name       TEXT  DEFAULT 'Dispatcher'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_status TEXT;
  v_changed_at  TEXT;
BEGIN
  -- Verify org ownership and capture previous status
  SELECT status INTO v_prev_status
  FROM   public.trips
  WHERE  id = p_trip_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trip_not_found: % / %', p_trip_id, p_organization_id;
  END IF;

  -- Update trip status
  UPDATE public.trips
  SET    status     = p_new_status,
         updated_at = NOW()
  WHERE  id = p_trip_id;

  v_changed_at := to_char(
    now() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  -- Insert one system message per conversation for this trip.
  -- These INSERT events propagate via Realtime → NEW_MESSAGE handler →
  -- SYSTEM_UPDATE branch in the store (metadata.new_status updates TripMeta).
  INSERT INTO public.trip_messages (
    conversation_id, organization_id,
    sender_user_id, sender_role, sender_name,
    content, message_type, metadata,
    is_read, is_delivered
  )
  SELECT
    tc.id,
    tc.organization_id,
    p_user_id,
    'system',
    'System',
    p_user_name || ' changed status: '
      || COALESCE(v_prev_status, '—') || ' → ' || p_new_status,
    'status_change',
    jsonb_build_object(
      'event_type',      'status_change',
      'previous_status', v_prev_status,
      'new_status',      p_new_status,
      'changed_by',      p_user_id,
      'changed_by_name', p_user_name,
      'changed_at',      v_changed_at
    ),
    TRUE,   -- is_read (system messages are auto-read)
    TRUE    -- is_delivered
  FROM public.trip_conversations tc
  WHERE tc.trip_id = p_trip_id;

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'previous_status', v_prev_status,
    'new_status',      p_new_status,
    'changed_at',      v_changed_at
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.change_trip_status_with_notification(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_trip_status_with_notification(UUID, UUID, TEXT, UUID, TEXT) TO authenticated;
