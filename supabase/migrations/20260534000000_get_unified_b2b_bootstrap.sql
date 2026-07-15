-- ─────────────────────────────────────────────────────────────────────────────
-- get_unified_b2b_bootstrap — next-generation Bootstrap & Patch entry point
--
-- Extends get_b2b_chat_bootstrap with per-message visibility_tags so the
-- frontend can route each event to the correct party tabs without a DB lookup.
--
-- visibility_tags per message:
--   - status_change / system / update  → all conversation IDs for the trip
--   - ledger / ledger_event / payment  → client + supplier conversation IDs only
--   - tracking                         → driver conversation ID only
--   - text / chat / document_share     → originating conversation ID only (legacy)
--   - NULL / empty                     → originating conversation ID (fallback)
--
-- The frontend falls back to get_b2b_chat_bootstrap when this RPC is missing.
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Fetch the base bootstrap payload (conversations + messages)
  v_base := public.get_b2b_chat_bootstrap(p_organization_id, p_message_limit);

  -- Annotate each message with visibility_tags based on message_type routing rules.
  -- This is a pure in-memory transform: no extra DB round trip.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_set(
        conv_row,
        '{messages}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                -- Broadcast messages: all party conversations for this trip
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
                -- Financial messages: client + supplier conversations only
                WHEN (msg->>'message_type') IN ('ledger_event', 'ledger', 'payment') THEN
                  jsonb_set(
                    msg,
                    '{visibility_tags}',
                    COALESCE(
                      (
                        SELECT jsonb_agg(tc2.id::text)
                        FROM trip_conversations tc2
                        WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
                          AND tc2.party_type IN ('client', 'supplier')
                      ),
                      '[]'::jsonb
                    )
                  )
                -- Tracking: driver conversation only
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
                -- All other types: originating conversation only (no tag needed, partyType fallback)
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
  'per-message visibility_tags for multi-party tab routing. After this call the '
  'frontend uses only Realtime — no further SELECT queries.';
