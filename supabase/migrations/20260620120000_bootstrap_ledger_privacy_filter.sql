-- Ledger / payment chat rows: only return messages where the bootstrapping org is
-- an explicit counterparty (sender_org_id or receiver_org_id). Prevents other parties'
-- financial payloads from being shipped to the device.

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
              'id',                 tm.id,
              'conversation_id',    tm.conversation_id,
              'organization_id',    tm.organization_id,
              'sender_user_id',     tm.sender_user_id,
              'sender_role',        tm.sender_role,
              'sender_name',        tm.sender_name,
              'content',            tm.content,
              'message_type',       tm.message_type,
              'metadata',           tm.metadata,
              'is_read',            tm.is_read,
              'read_at',            tm.read_at,
              'created_at',         tm.created_at,
              'sender_avatar_seed', tm.sender_avatar_seed,
              'is_delivered',       COALESCE(tm.is_delivered, FALSE),
              'delivered_at',       tm.delivered_at
            ) AS msg_row
            FROM (
              SELECT *
              FROM   public.trip_messages m
              WHERE  m.conversation_id = tc.id
                AND  (
                  m.message_type NOT IN ('ledger_event', 'ledger', 'payment', 'ledger_update')
                  OR COALESCE(
                    nullif(trim(m.metadata->>'sender_org_id'), ''),
                    nullif(trim(m.metadata->'event_payload'->>'sender_org_id'), '')
                  ) = p_organization_id::text
                  OR COALESCE(
                    nullif(trim(m.metadata->>'receiver_org_id'), ''),
                    nullif(trim(m.metadata->'event_payload'->>'receiver_org_id'), '')
                  ) = p_organization_id::text
                )
              ORDER  BY m.created_at DESC
              LIMIT  p_message_limit
            ) tm
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
  'Bootstrap conversation rows + last N messages. Ledger rows only when p_organization_id '
  'matches metadata sender_org_id or receiver_org_id. trip_feedback_status from feedback_request metadata.';
