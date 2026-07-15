-- Integrated vs private trip chat flow, financial privacy metadata, driver tracking view,
-- and partial index for integrated message lanes.

-- ── 1. Partial index: integrated context (indent + trip both set on trip_messages) ──
CREATE INDEX IF NOT EXISTS idx_chat_integrated_flow
  ON public.trip_messages (context_indent_id, context_trip_id)
  WHERE context_indent_id IS NOT NULL
    AND context_trip_id IS NOT NULL;

COMMENT ON INDEX public.idx_chat_integrated_flow IS
  'Speeds lane queries for B2B integrated indents (commercial + operational routing).';

-- ── 2. Driver tracking health (350 km / calendar day pace vs actual progress) ───
CREATE OR REPLACE VIEW public.v_driver_tracking_health AS
SELECT
  t.id,
  t.trip_number,
  COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at) AS anchor_at,
  EXTRACT(EPOCH FROM (now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at))) / 86400.0
    AS days_elapsed,
  COALESCE(t.actual_distance_traveled_km::double precision, 0::double precision) AS actual_distance_km,
  GREATEST(
    EXTRACT(EPOCH FROM (now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at))) / 86400.0
      * 350.0,
    0::double precision
  ) AS target_km,
  CASE
    WHEN lower(trim(t.status)) NOT IN (
      'in_transit', 'picked_up', 'in_progress', 'transit', 'at_drop',
      'loading', 'unloading', 'at_pickup', 'assigned', 'active', 'on_route'
    )
      THEN 'ON_TRACK'
    WHEN COALESCE(t.started_at, t.pickup_date::timestamptz) IS NULL THEN 'ON_TRACK'
    WHEN EXTRACT(EPOCH FROM (now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at))) <= 0
      THEN 'ON_TRACK'
    WHEN COALESCE(t.actual_distance_traveled_km::double precision, 0::double precision)
      < (
        EXTRACT(EPOCH FROM (now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at))) / 86400.0
        * 350.0
      )
      THEN 'RUNNING_LATE'
    ELSE 'ON_TRACK'
  END AS tracking_status
FROM public.trips t;

ALTER VIEW public.v_driver_tracking_health SET (security_invoker = true);

COMMENT ON VIEW public.v_driver_tracking_health IS
  'Pace check: actual_distance_traveled_km vs days_since_anchor * 350 km/day. RUNNING_LATE when behind.';

GRANT SELECT ON public.v_driver_tracking_health TO authenticated;

-- ── 3. get_unified_b2b_bootstrap: conversation_type + ledger visible_to + financial tags ──
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
                  jsonb_set(msg, '{visibility_tags}', tx.tags_all_parties)
                WHEN (msg->>'message_type') IN ('ledger_event', 'ledger', 'payment', 'ledger_update') THEN
                  jsonb_set(
                    jsonb_set(
                      msg,
                      '{visibility_tags}',
                      tx.tags_client_supplier
                    ),
                    '{metadata}',
                    coalesce(msg->'metadata', '{}'::jsonb)
                      || jsonb_build_object('visible_to', jsonb_build_array('client', 'supplier'))
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

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL    ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) IS
  'Unified bootstrap: conversation_type (integrated_group|private_trip), visibility_tags, '
  'ledger rows tagged for client+supplier lanes only + metadata.visible_to privacy shield.';
