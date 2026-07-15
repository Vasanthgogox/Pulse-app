-- ─────────────────────────────────────────────────────────────────────────────
-- get_global_app_bootstrap v2 — optimised single-shot app hydration RPC
--
-- Changes vs v1 (20260535000000):
--   • LATERAL JOINs replace ROW_NUMBER() CTE — stops scanning once LIMIT hit
--   • History depth raised from 5 → 50 messages per trip
--   • Each trip now returns conversations[] with per-party metadata so the
--     frontend can seed useChatStore directly without a second RPC
--   • Each event carries conversation_id + party_type for correct lane mapping
--   • Visibility filter applied at SQL level: messages with visibility_tags
--     that don't reference any conversation belonging to p_org_id are skipped
--   • Notifications cap raised from 10 → 25
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_global_app_bootstrap(
  p_org_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_trips   JSONB;
  v_global_alerts  JSONB;
  v_notifications  JSONB;
  v_network_status JSONB;
BEGIN

  -- ── 1. Active trips ─────────────────────────────────────────────────────────
  -- LATERAL JOIN pattern: PostgreSQL stops scanning trip_messages after LIMIT 50
  -- per trip — O(50 × trips) instead of O(all_messages) with ROW_NUMBER().
  -- The inner subquery fetches DESC (newest first, cheapest with a btree index),
  -- then the outer jsonb_agg re-orders ASC for chronological display.

  SELECT COALESCE(jsonb_agg(trip_obj ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_active_trips
  FROM (
    SELECT
      id, trip_number, display_trip_id, status,
      pickup_area, drop_location,
      driver_display_name, vehicle_display_number,
      driver_id, supplier_id, client_id, created_at
    FROM trips
    WHERE organization_id = p_org_id
      AND status NOT IN ('completed', 'cancelled')
    ORDER BY created_at DESC
    LIMIT 100
  ) t
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(tc.unread_dispatcher_count), 0) AS total_unread,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'conversation_id',     tc.id,
            'party_type',          tc.party_type,
            'party_name',          tc.party_name,
            'organization_id',     tc.organization_id,
            'unread_count',        COALESCE(tc.unread_dispatcher_count, 0),
            'client_id',           tc.client_id,
            'supplier_id',         tc.supplier_id,
            'driver_id',           tc.driver_id,
            'last_message_at',     tc.last_message_at,
            'last_message_preview', tc.last_message_preview
          )
        ),
        '[]'::jsonb
      ) AS conversations
    FROM trip_conversations tc
    WHERE tc.trip_id = t.id
      AND tc.organization_id = p_org_id
  ) convs ON true
  LEFT JOIN LATERAL (
    -- Fetch the 50 most-recent messages for this trip across all party lanes,
    -- then re-aggregate them in ASC order for the frontend event_stream.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',              ranked.id,
          'conversation_id', ranked.conversation_id,
          'party_type',      ranked.party_type,
          'content',         ranked.content,
          'message_type',    ranked.message_type,
          'sender_role',     ranked.sender_role,
          'sender_name',     ranked.sender_name,
          'metadata',        ranked.metadata,
          'visibility_tags', COALESCE(ranked.visibility_tags, '[]'::jsonb),
          'is_read',         ranked.is_read,
          'created_at',      ranked.created_at
        )
        ORDER BY ranked.created_at ASC
      ),
      '[]'::jsonb
    ) AS recent_events
    FROM (
      SELECT
        m.id,
        m.conversation_id,
        tc_m.party_type,
        m.content,
        m.message_type,
        m.sender_role,
        m.sender_name,
        m.metadata,
        m.visibility_tags,
        m.is_read,
        m.created_at
      FROM trip_messages m
      INNER JOIN trip_conversations tc_m
        ON tc_m.id = m.conversation_id
        AND tc_m.trip_id = t.id
        AND tc_m.organization_id = p_org_id
      WHERE (
        -- No tags → legacy broadcast, always include
        m.visibility_tags IS NULL
        OR jsonb_array_length(m.visibility_tags) = 0
        -- Tagged → at least one tag must reference a conversation owned by p_org_id
        OR EXISTS (
          SELECT 1
          FROM trip_conversations tc_vis
          WHERE tc_vis.trip_id = t.id
            AND tc_vis.organization_id = p_org_id
            AND m.visibility_tags @> to_jsonb(tc_vis.id::text)
        )
      )
      ORDER BY m.created_at DESC
      LIMIT 50
    ) ranked
  ) msgs ON true
  CROSS JOIN LATERAL (
    SELECT jsonb_build_object(
      'trip_id',                t.id,
      'trip_number',            t.trip_number,
      'display_trip_id',        t.display_trip_id,
      'status',                 t.status,
      'pickup_area',            t.pickup_area,
      'drop_location',          t.drop_location,
      'driver_display_name',    t.driver_display_name,
      'vehicle_display_number', t.vehicle_display_number,
      'driver_id',              t.driver_id,
      'supplier_id',            t.supplier_id,
      'client_id',              t.client_id,
      'created_at',             t.created_at,
      'total_unread',           COALESCE(convs.total_unread, 0),
      'conversations',          COALESCE(convs.conversations, '[]'::jsonb),
      'recent_events',          msgs.recent_events
    ) AS trip_obj
  ) build;


  -- ── 2. Global alerts ─────────────────────────────────────────────────────────
  -- Unchanged from v1.

  WITH alert_rows AS (
    SELECT
      'salary_' || sr.id::text               AS id,
      'salary_request'                        AS source,
      sr.id::text                             AS source_id,
      'salary_request_pending'                AS alert_type,
      'warning'                               AS severity,
      'Pending Salary Request'                AS title,
      'Amount: ₹' || sr.amount::text          AS body,
      sr.amount                               AS amount,
      sr.driver_id                            AS driver_id,
      NULL::uuid                              AS trip_id,
      sr.created_at
    FROM driver_salary_requests sr
    WHERE sr.organization_id = p_org_id
      AND sr.status = 'pending'
      AND sr.created_at < NOW() - INTERVAL '2 hours'

    UNION ALL

    SELECT
      'dispute_' || d.id::text                          AS id,
      'dispute'                                         AS source,
      d.id::text                                        AS source_id,
      'dispute_received'                                AS alert_type,
      'critical'                                        AS severity,
      'Dispute Received'                                AS title,
      'Partner raised a dispute. Amount: ₹' || d.partner_snapshot::text AS body,
      d.partner_snapshot                                AS amount,
      NULL::uuid                                        AS driver_id,
      NULL::uuid                                        AS trip_id,
      d.created_at
    FROM dispute d
    WHERE d.partner_org_id = p_org_id
      AND d.status = 'OPEN'
  )
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',         ar.id,
          'source',     ar.source,
          'source_id',  ar.source_id,
          'alert_type', ar.alert_type,
          'severity',   ar.severity,
          'title',      ar.title,
          'body',       ar.body,
          'amount',     ar.amount,
          'driver_id',  ar.driver_id,
          'trip_id',    ar.trip_id,
          'created_at', ar.created_at
        )
      )
      FROM (
        SELECT * FROM alert_rows
        ORDER BY created_at DESC
        LIMIT 25
      ) ar
    ),
    '[]'::jsonb
  )
  INTO v_global_alerts;


  -- ── 3. Notifications ─────────────────────────────────────────────────────────
  -- Cap raised from 10 → 25.

  WITH notif_rows AS (
    SELECT
      'salary_' || sr.id::text                          AS id,
      'salary_request'                                  AS source,
      sr.id::text                                       AS source_id,
      'Salary Request'                                  AS title,
      INITCAP(sr.request_type)                          AS subtitle,
      sr.amount                                         AS amount_meta,
      (sr.status <> 'pending')                          AS is_read,
      sr.created_at
    FROM driver_salary_requests sr
    WHERE sr.organization_id = p_org_id

    UNION ALL

    SELECT
      'dispute_' || d.id::text                          AS id,
      'dispute'                                         AS source,
      d.id::text                                        AS source_id,
      CASE
        WHEN d.raised_by_org_id = p_org_id THEN 'Dispute Raised'
        ELSE 'Dispute Received'
      END                                               AS title,
      'Status: ' || d.status                            AS subtitle,
      d.partner_snapshot                                AS amount_meta,
      (d.status <> 'OPEN')                              AS is_read,
      d.created_at
    FROM dispute d
    WHERE d.raised_by_org_id = p_org_id
       OR d.partner_org_id   = p_org_id
  ),
  notif_agg AS (
    SELECT
      COUNT(*) FILTER (WHERE NOT is_read)  AS unread_count,
      jsonb_agg(
        jsonb_build_object(
          'id',          n.id,
          'source',      n.source,
          'source_id',   n.source_id,
          'title',       n.title,
          'subtitle',    n.subtitle,
          'amount_meta', n.amount_meta,
          'is_read',     n.is_read,
          'created_at',  n.created_at
        )
        ORDER BY n.created_at DESC
      ) AS all_rows
    FROM notif_rows n
  )
  SELECT jsonb_build_object(
    'unread_count', COALESCE(na.unread_count, 0),
    'rows',         COALESCE(
      (
        SELECT jsonb_agg(r)
        FROM (
          SELECT jsonb_array_elements(na.all_rows) AS r
          LIMIT 25
        ) sub
      ),
      '[]'::jsonb
    )
  )
  INTO v_notifications
  FROM notif_agg na;


  -- ── 4. Network status ────────────────────────────────────────────────────────
  -- Unchanged from v1.

  WITH link_counts AS (
    SELECT
      COUNT(*)                                          AS total_links,
      COUNT(*) FILTER (WHERE link_type = 'client')     AS client_links,
      COUNT(*) FILTER (WHERE link_type = 'supplier')   AS supplier_links
    FROM organization_links
    WHERE owner_org_id = p_org_id
  ),
  partner_list AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'org_id',    o.id,
        'org_name',  o.name,
        'link_type', ol.link_type
      )
      ORDER BY o.name ASC
    ) AS partner_orgs
    FROM organization_links ol
    JOIN organizations o ON o.id = ol.linked_org_id
    WHERE ol.owner_org_id = p_org_id
  )
  SELECT jsonb_build_object(
    'total_links',    COALESCE(lc.total_links, 0),
    'client_links',   COALESCE(lc.client_links, 0),
    'supplier_links', COALESCE(lc.supplier_links, 0),
    'partner_orgs',   COALESCE(pl.partner_orgs, '[]'::jsonb)
  )
  INTO v_network_status
  FROM link_counts lc
  CROSS JOIN partner_list pl;


  -- ── Result ───────────────────────────────────────────────────────────────────

  RETURN jsonb_build_object(
    'active_trips',   COALESCE(v_active_trips,   '[]'::jsonb),
    'global_alerts',  COALESCE(v_global_alerts,  '[]'::jsonb),
    'notifications',  COALESCE(v_notifications,  '{"unread_count":0,"rows":[]}'::jsonb),
    'network_status', COALESCE(v_network_status, '{"total_links":0,"client_links":0,"supplier_links":0,"partner_orgs":[]}'::jsonb)
  );

END;
$$;

REVOKE ALL    ON FUNCTION public.get_global_app_bootstrap(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_global_app_bootstrap(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_global_app_bootstrap IS
  'Global single-shot bootstrap RPC v2. Returns active trips (up to 100) each with '
  'conversations[] (per-party metadata) and recent_events[] (up to 50 messages, LATERAL '
  'JOIN for O(50×trips) efficiency). Visibility filter applied at SQL level. '
  'Also returns operational alerts, notification feed (25 rows), and network status. '
  'After this call the frontend uses only Realtime — no further SELECT queries.';
