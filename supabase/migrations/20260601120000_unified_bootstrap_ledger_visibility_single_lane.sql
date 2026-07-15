-- Ledger / payment chat rows live on one trip_conversation. Tags must not list every
-- financial lane, or the client tab shows supplier-thread rows (and vice versa).

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
                  jsonb_set(
                    msg,
                    '{visibility_tags}',
                    COALESCE(
                      (
                        SELECT jsonb_agg(tc2.id::text)
                        FROM trip_conversations tc2
                        WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
                      ),
                      '[]'::jsonb
                    )
                  )
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
                  jsonb_set(
                    msg,
                    '{visibility_tags}',
                    COALESCE(
                      (
                        SELECT jsonb_agg(tc2.id::text)
                        FROM trip_conversations tc2
                        WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
                          AND tc2.party_type = 'driver'
                      ),
                      '[]'::jsonb
                    )
                  )
                ELSE msg
              END
            )
            FROM jsonb_array_elements(conv_row->'messages') AS msg
          ),
          '[]'::jsonb
        )
      )
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM jsonb_array_elements(v_base) AS conv_row;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL    ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.get_unified_b2b_bootstrap IS
  'Unified Bootstrap & Patch entry point. Extends get_b2b_chat_bootstrap with '
  'per-message visibility_tags for multi-party tab routing. Ledger rows tag only '
  'their originating conversation_id so client and supplier lanes stay private.';
