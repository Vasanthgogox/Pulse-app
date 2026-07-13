-- Strategic bootstrap: get_unified_b2b_bootstrap returns conversations + messages_by_context index.
-- Commercial (ledger) → routing_context_kind indent when indent_id present, else trip.
-- Operational / status / GPS → routing_context_kind trip.
-- get_multi_lane_bootstrap unwraps { conversations } for fn_build_chat_lanes and passes through messages_by_context.

CREATE OR REPLACE FUNCTION public.get_unified_b2b_bootstrap(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base           JSONB;
  v_result         JSONB;
  v_by_context     JSONB;
BEGIN
  v_base := public.get_b2b_chat_bootstrap(p_organization_id, p_message_limit);

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
  FROM jsonb_array_elements(v_base) AS conv_row
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

REVOKE ALL    ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) IS
  'Unified bootstrap: conversations array + messages_by_context (message ids grouped by indent|trip routing_context). '
  'Each message carries routing_context_kind + routing_context_id for commercial vs operational lanes.';


CREATE OR REPLACE FUNCTION public.get_multi_lane_bootstrap(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50
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
  v_wrap := public.get_unified_b2b_bootstrap(p_organization_id, p_message_limit);

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

REVOKE ALL    ON FUNCTION public.get_multi_lane_bootstrap(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_multi_lane_bootstrap(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.get_multi_lane_bootstrap(UUID, INT) IS
  'Multi-lane bootstrap: conversations + lanes + messages_by_context (context-grouped message id index).';
