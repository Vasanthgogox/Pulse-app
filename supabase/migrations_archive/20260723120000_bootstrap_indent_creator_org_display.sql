-- Chat hub: supplier fleet (mirror trip, often no indent_id) must see the **shipper / indent
-- creator** org name on the Client tab (e.g. Deepak Org), not only trip_conversations.party_name
-- (commercial client / MK logistics).
--
-- Restores trip_organization_name on bootstrap rows (regressed when 20260720120000 replaced RPC).
-- Adds indent_creator_organization_name: this trip's indent owner, else same trip_number row with indent.

CREATE OR REPLACE FUNCTION public.get_initial_chat_state(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50,
  p_trip_limit      INT DEFAULT NULL,
  p_trip_offset     INT DEFAULT 0,
  p_hub_trip_bucket TEXT DEFAULT 'active',
  p_include_message_bodies BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket text;
BEGIN
  v_bucket := lower(trim(coalesce(p_hub_trip_bucket, 'active')));
  IF v_bucket NOT IN ('active', 'history', 'all') THEN
    v_bucket := 'active';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(c ORDER BY (c->>'last_message_at') DESC NULLS LAST),
      '[]'::jsonb
    )
    FROM (
      SELECT jsonb_build_object(
        'id',                      tc.id,
        'organization_id',         tc.organization_id,
        'trip_organization_id',    t.organization_id,
        'trip_organization_name',  o_trip.name,
        'indent_creator_organization_name',
          (
            COALESCE(
              (
                SELECT o_ind.name::text
                FROM public.indents ind
                JOIN public.organizations o_ind ON o_ind.id = ind.organization_id
                WHERE ind.id = t.indent_id
              ),
              (
                SELECT o_ship.name::text
                FROM public.trips t_ship
                JOIN public.indents ind2 ON ind2.id = t_ship.indent_id
                JOIN public.organizations o_ship ON o_ship.id = ind2.organization_id
                WHERE t_ship.trip_number = t.trip_number
                  AND t_ship.indent_id IS NOT NULL
                  AND ind2.organization_id IS DISTINCT FROM p_organization_id
                LIMIT 1
              )
            )
          ),
        'trip_id',                 tc.trip_id,
        'indent_id',               t.indent_id,
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
        'trip_source',             COALESCE(t.source::text, ''),
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
        'messages', CASE WHEN p_include_message_bodies THEN COALESCE((
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
        ), '[]'::jsonb) ELSE '[]'::jsonb END
      ) AS c
      FROM  public.trip_conversations tc
      JOIN  public.trips              t ON t.id = tc.trip_id
      LEFT  JOIN public.organizations o_trip ON o_trip.id = t.organization_id
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
        AND (
          v_bucket = 'all'
          OR (
            v_bucket = 'active'
            AND lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'delivered', 'done')
          )
          OR (
            v_bucket = 'history'
            AND lower(trim(coalesce(t.status::text, ''))) IN ('completed', 'delivered', 'done')
          )
        )
        AND (
          p_trip_limit IS NULL
          OR tc.trip_id IN (
            SELECT r.trip_id
            FROM (
              SELECT
                agg.trip_id,
                ROW_NUMBER() OVER (
                  ORDER BY
                    CASE WHEN agg.max_unread > 0 THEN 0 ELSE 1 END,
                    agg.late_flag DESC,
                    agg.last_at DESC NULLS LAST
                ) AS rn
              FROM (
                SELECT
                  base.trip_id,
                  MAX(COALESCE(tc2.unread_dispatcher_count, 0))::int AS max_unread,
                  MAX(tc2.last_message_at) AS last_at,
                  MAX(
                    CASE
                      WHEN h.health_status IN ('LATE_RISK', 'CRITICAL_DELAY')
                      THEN 1
                      ELSE 0
                    END
                  )::int AS late_flag
                FROM (
                  SELECT DISTINCT tc0.trip_id AS trip_id
                  FROM   public.trip_conversations tc0
                  JOIN   public.trips t0 ON t0.id = tc0.trip_id
                  WHERE (
                    tc0.organization_id = p_organization_id
                    OR tc0.trip_id IN (
                      SELECT tr2.id
                      FROM   public.trips tr2
                      WHERE  tr2.status NOT IN ('cancelled')
                        AND  EXISTS (
                          SELECT 1 FROM public.suppliers s2
                          WHERE  s2.id = tr2.supplier_id
                            AND  s2.linked_organization_id = p_organization_id
                        )
                      LIMIT 500
                    )
                  )
                    AND t0.status <> 'cancelled'
                    AND (
                      v_bucket = 'all'
                      OR (
                        v_bucket = 'active'
                        AND lower(trim(coalesce(t0.status::text, ''))) NOT IN ('completed', 'delivered', 'done')
                      )
                      OR (
                        v_bucket = 'history'
                        AND lower(trim(coalesce(t0.status::text, ''))) IN ('completed', 'delivered', 'done')
                      )
                    )
                ) base
                JOIN public.trip_conversations tc2 ON tc2.trip_id = base.trip_id
                LEFT JOIN public.v_long_haul_health h ON h.trip_id = base.trip_id
                GROUP BY base.trip_id
              ) agg
            ) r
            WHERE r.rn > p_trip_offset
              AND r.rn <= p_trip_offset + p_trip_limit
          )
        )
    ) rows
  );
END;
$$;

COMMENT ON FUNCTION public.get_initial_chat_state(UUID, INT, INT, INT, TEXT, BOOL) IS
  'Bootstrap conversations + messages; trip_organization_name + indent_creator_organization_name for supplier Client tab.';
