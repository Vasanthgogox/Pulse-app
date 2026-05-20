-- get_unified_b2b_bootstrap: remove O(messages × subquery) pattern.
-- Previously every message re-ran trip_conversations aggregates; that hammered
-- Postgres on busy fleets. Tags depend only on trip_id (same for all messages
-- in a conversation row) or on the message's own conversation_id (ledger).

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
  v_base  JSONB;
  v_result JSONB;
BEGIN
  v_base := public.get_b2b_chat_bootstrap(p_organization_id, p_message_limit);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_set(
        conv_row,
        '{messages}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN (msg->>'message_type') IN ('status_change', 'system', 'system_log', 'update') THEN
                  jsonb_set(msg, '{visibility_tags}', tx.tags_all_parties)
                WHEN (msg->>'message_type') IN ('ledger_event', 'ledger', 'payment') THEN
                  jsonb_set(
                    msg,
                    '{visibility_tags}',
                    CASE
                      WHEN nullif(trim(msg->>'conversation_id'), '') IS NOT NULL THEN
                        jsonb_build_array(trim(msg->>'conversation_id'))
                      ELSE '[]'::jsonb
                    END
                  )
                WHEN (msg->>'message_type') = 'tracking' THEN
                  jsonb_set(msg, '{visibility_tags}', tx.tags_driver_lanes)
                ELSE msg
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
            AND tc2.party_type = 'driver'
        ),
        '[]'::jsonb
      ) AS tags_driver_lanes
  ) AS tx;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL    ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) IS
  'Unified bootstrap: adds visibility_tags with one trip_conversations scan per '
  'conversation (not per message). Same semantics as 20260601120000.';
