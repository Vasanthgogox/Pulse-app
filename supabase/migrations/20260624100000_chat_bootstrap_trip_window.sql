-- Trip-windowed chat bootstrap: optional p_trip_limit / p_trip_offset on the bootstrap chain
-- (default NULL = all trips, backward compatible). Weighted trip ranking: unread first,
-- long-haul LATE_RISK/CRITICAL_DELAY, then last_message_at. Exposes trips.source as trip_source.

-- Drop in dependency order (new signatures add optional args; replace 2-arg forms).
DROP FUNCTION IF EXISTS public.get_multi_lane_bootstrap(uuid, integer);
DROP FUNCTION IF EXISTS public.get_unified_b2b_bootstrap(uuid, integer);
DROP FUNCTION IF EXISTS public.get_b2b_chat_bootstrap(uuid, integer);
DROP FUNCTION IF EXISTS public.get_whatsapp_bootstrap_data(uuid, integer);
DROP FUNCTION IF EXISTS public.get_initial_chat_state(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_initial_chat_state(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50,
  p_trip_limit      INT DEFAULT NULL,
  p_trip_offset     INT DEFAULT 0
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
        'trip_organization_id',    t.organization_id,
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

REVOKE ALL    ON FUNCTION public.get_initial_chat_state(UUID, INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_initial_chat_state(UUID, INT, INT, INT) TO authenticated;

COMMENT ON FUNCTION public.get_initial_chat_state(UUID, INT, INT, INT) IS
  'Bootstrap conversations + messages; optional trip window (p_trip_limit NULL = all). '
  'Ranking: unread > long-haul late risk > recency. Adds trip_source from trips.source.';

CREATE OR REPLACE FUNCTION public.get_whatsapp_bootstrap_data(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50,
  p_trip_limit      INT DEFAULT NULL,
  p_trip_offset     INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_initial_chat_state(
    p_organization_id,
    p_message_limit,
    p_trip_limit,
    p_trip_offset
  );
$$;

REVOKE ALL    ON FUNCTION public.get_whatsapp_bootstrap_data(UUID, INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_bootstrap_data(UUID, INT, INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_b2b_chat_bootstrap(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50,
  p_trip_limit      INT DEFAULT NULL,
  p_trip_offset     INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_whatsapp_bootstrap_data(
    p_organization_id,
    p_message_limit,
    p_trip_limit,
    p_trip_offset
  );
$$;

REVOKE ALL    ON FUNCTION public.get_b2b_chat_bootstrap(UUID, INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_b2b_chat_bootstrap(UUID, INT, INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_unified_b2b_bootstrap(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50,
  p_trip_limit      INT DEFAULT NULL,
  p_trip_offset     INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base       JSONB;
  v_augmented  JSONB;
  v_result     JSONB;
  v_by_context JSONB;
BEGIN
  v_base := public.get_b2b_chat_bootstrap(
    p_organization_id,
    p_message_limit,
    p_trip_limit,
    p_trip_offset
  );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_set(
        e.elem,
        '{indent_status}',
        coalesce(to_jsonb(NULLIF(trim(ix.status::text), '')), 'null'::jsonb)
      )
      ORDER BY e.ord
    ),
    '[]'::jsonb
  )
  INTO v_augmented
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_base) = 'array' THEN v_base ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(elem, ord)
  CROSS JOIN LATERAL (
    SELECT i.status
    FROM   public.trips t
    LEFT JOIN public.indents i ON i.id = t.indent_id
    WHERE  t.id = NULLIF(TRIM(e.elem->>'trip_id'), '')::uuid
  ) ix;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_set(
        jsonb_set(
          conv_row,
          '{conversation_type}',
          CASE
            WHEN nullif(trim(conv_row->>'indent_id'), '') IS NOT NULL THEN to_jsonb('integrated_group'::text)
            ELSE to_jsonb('private_trip'::text)
          END
        ),
        '{messages}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN (msg->>'message_type') IN ('status_change', 'system', 'system_log', 'update', 'location_log') THEN
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(msg, '{visibility_tags}', tx.tags_all_parties),
                      '{routing_context_kind}', to_jsonb('trip'::text)
                    ),
                    '{routing_context_id}', to_jsonb(trim(conv_row->>'trip_id'))
                  )
                WHEN (msg->>'message_type') IN ('ledger_event', 'ledger', 'payment', 'ledger_update') THEN
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          msg,
                          '{visibility_tags}',
                          tx.tags_client_supplier
                        ),
                        '{metadata}',
                        coalesce(msg->'metadata', '{}'::jsonb)
                          || jsonb_build_object('visible_to', jsonb_build_array('client', 'supplier'))
                      ),
                      '{routing_context_kind}',
                      CASE
                        WHEN nullif(trim(conv_row->>'indent_id'), '') IS NOT NULL
                          THEN to_jsonb('indent'::text)
                        ELSE to_jsonb('trip'::text)
                      END
                    ),
                    '{routing_context_id}',
                    CASE
                      WHEN nullif(trim(conv_row->>'indent_id'), '') IS NOT NULL
                        THEN to_jsonb(trim(conv_row->>'indent_id'))
                      ELSE to_jsonb(trim(conv_row->>'trip_id'))
                    END
                  )
                WHEN (msg->>'message_type') = 'tracking' THEN
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(msg, '{visibility_tags}', tx.tags_driver_lanes),
                      '{routing_context_kind}', to_jsonb('trip'::text)
                    ),
                    '{routing_context_id}', to_jsonb(trim(conv_row->>'trip_id'))
                  )
                ELSE
                  jsonb_set(
                    jsonb_set(
                      msg,
                      '{routing_context_kind}', to_jsonb('trip'::text)
                    ),
                    '{routing_context_id}', to_jsonb(trim(conv_row->>'trip_id'))
                  )
              END
              ORDER BY (msg->>'created_at')
            )
            FROM jsonb_array_elements(conv_row->'messages') AS msg
          ),
          '[]'::jsonb
        )
      )
      ORDER BY (conv_row->>'last_message_at') DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM jsonb_array_elements(v_augmented) AS conv_row
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(
        (
          SELECT jsonb_agg(tc2.id::text ORDER BY tc2.id)
          FROM public.trip_conversations tc2
          WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
        ),
        '[]'::jsonb
      ) AS tags_all_parties,
      COALESCE(
        (
          SELECT jsonb_agg(tc2.id::text ORDER BY tc2.id)
          FROM public.trip_conversations tc2
          WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
            AND tc2.party_type IN ('client', 'supplier')
        ),
        '[]'::jsonb
      ) AS tags_client_supplier,
      COALESCE(
        (
          SELECT jsonb_agg(tc2.id::text ORDER BY tc2.id)
          FROM public.trip_conversations tc2
          WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
            AND tc2.party_type = 'driver'
        ),
        '[]'::jsonb
      ) AS tags_driver_lanes
  ) AS tx;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'context_kind', g.context_kind,
        'context_id',   g.context_id,
        'message_ids',  g.ids
      )
      ORDER BY g.context_kind, g.context_id
    ),
    '[]'::jsonb
  )
  INTO v_by_context
  FROM (
    SELECT
      trim(both '"' from (m->>'routing_context_kind')) AS context_kind,
      trim(both '"' from (m->>'routing_context_id'))   AS context_id,
      jsonb_agg(DISTINCT to_jsonb(m->>'id') ORDER BY to_jsonb(m->>'id')) AS ids
    FROM jsonb_array_elements(COALESCE(v_result, '[]'::jsonb)) AS c
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c->'messages', '[]'::jsonb)) AS m
    WHERE coalesce(trim(m->>'routing_context_id'), '') <> ''
      AND coalesce(trim(m->>'routing_context_kind'), '') <> ''
      AND coalesce(trim(m->>'id'), '') <> ''
    GROUP BY 1, 2
  ) AS g;

  RETURN jsonb_build_object(
    'conversations',         COALESCE(v_result, '[]'::jsonb),
    'messages_by_context',   COALESCE(v_by_context, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT, INT, INT) IS
  'Unified bootstrap: conversations + messages_by_context; indent_status; optional trip window.';

REVOKE ALL ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT, INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_multi_lane_bootstrap(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50,
  p_trip_limit      INT DEFAULT NULL,
  p_trip_offset     INT DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wrap JSONB;
  v_conv JSONB;
BEGIN
  v_wrap := public.get_unified_b2b_bootstrap(
    p_organization_id,
    p_message_limit,
    p_trip_limit,
    p_trip_offset
  );

  IF jsonb_typeof(v_wrap) = 'array' THEN
    v_conv := v_wrap;
    RETURN jsonb_build_object(
      'conversations', v_conv,
      'lanes', public.fn_build_chat_lanes(v_conv),
      'messages_by_context', '[]'::jsonb
    );
  END IF;

  v_conv := coalesce(v_wrap->'conversations', '[]'::jsonb);

  RETURN jsonb_build_object(
    'conversations', coalesce(v_conv, '[]'::jsonb),
    'lanes', public.fn_build_chat_lanes(v_conv),
    'messages_by_context', coalesce(v_wrap->'messages_by_context', '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_multi_lane_bootstrap(UUID, INT, INT, INT) IS
  'Multi-lane bootstrap: conversations + lanes + messages_by_context; optional trip window.';

REVOKE ALL ON FUNCTION public.get_multi_lane_bootstrap(UUID, INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_multi_lane_bootstrap(UUID, INT, INT, INT) TO authenticated;
