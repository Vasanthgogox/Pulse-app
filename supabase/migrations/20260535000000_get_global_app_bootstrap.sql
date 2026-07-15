-- ─────────────────────────────────────────────────────────────────────────────
-- get_global_app_bootstrap — single-shot app hydration RPC
--
-- Returns one JSONB object with four slices:
--   active_trips    → non-terminal trips + unread counts + last 5 events
--   global_alerts   → actionable items (pending salary requests, open disputes)
--   notifications   → last 10 salary/dispute events with unread count
--   network_status  → org-link counts + connected partner list
--
-- Called once per org-session from GlobalSyncContext.  After hydration all
-- updates arrive exclusively via Realtime — no follow-up SELECTs.
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
  -- Non-terminal trips with aggregate unread count and the last 5 messages
  -- across all party conversations (client/supplier/driver merged, ASC).

  WITH trip_base AS (
    SELECT
      t.id,
      t.trip_number,
      t.display_trip_id,
      t.status,
      t.pickup_area,
      t.drop_location,
      t.driver_display_name,
      t.vehicle_display_number,
      t.driver_id,
      t.supplier_id,
      t.client_id,
      t.created_at
    FROM trips t
    WHERE t.organization_id = p_org_id
      AND t.status NOT IN ('completed', 'cancelled')
    ORDER BY t.created_at DESC
    LIMIT 100
  ),
  conv_unread AS (
    SELECT
      tc.trip_id,
      SUM(tc.unread_dispatcher_count) AS total_unread
    FROM trip_conversations tc
    WHERE tc.organization_id = p_org_id
      AND tc.trip_id IN (SELECT id FROM trip_base)
    GROUP BY tc.trip_id
  ),
  recent_msgs AS (
    -- Rank messages per trip, keep last 5
    SELECT
      tm.id,
      tc.trip_id,
      tc.party_type,
      tm.sender_role,
      tm.sender_name,
      tm.content,
      tm.message_type,
      tm.metadata,
      tm.is_read,
      tm.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY tc.trip_id
        ORDER BY tm.created_at DESC
      ) AS rn
    FROM trip_messages tm
    JOIN trip_conversations tc ON tc.id = tm.conversation_id
    WHERE tc.organization_id = p_org_id
      AND tc.trip_id IN (SELECT id FROM trip_base)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
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
        'total_unread',           COALESCE(cu.total_unread, 0),
        'recent_events',          COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id',           rm.id,
                'party_type',   rm.party_type,
                'sender_role',  rm.sender_role,
                'sender_name',  rm.sender_name,
                'content',      rm.content,
                'message_type', rm.message_type,
                'metadata',     rm.metadata,
                'is_read',      rm.is_read,
                'created_at',   rm.created_at
              )
              ORDER BY rm.created_at ASC
            )
            FROM recent_msgs rm
            WHERE rm.trip_id = t.id
              AND rm.rn <= 5
          ),
          '[]'::jsonb
        )
      )
    ),
    '[]'::jsonb
  )
  INTO v_active_trips
  FROM trip_base t
  LEFT JOIN conv_unread cu ON cu.trip_id = t.id;


  -- ── 2. Global alerts ─────────────────────────────────────────────────────────
  -- Actionable items that require dispatcher attention.
  -- salary_request_pending: pending >2 hours → severity warning
  -- dispute_received:        partner raised dispute against us → severity critical

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
  -- Unified notification feed from salary requests + disputes.
  -- is_read derived from status: pending/OPEN = unread, otherwise read.

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
          LIMIT 10
        ) sub
      ),
      '[]'::jsonb
    )
  )
  INTO v_notifications
  FROM notif_agg na;


  -- ── 4. Network status ────────────────────────────────────────────────────────
  -- Org-link counts + connected partner org metadata.

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
  'Global single-shot bootstrap RPC. Returns active trips with unread counts and '
  'last 5 events, operational alerts (pending salary requests, open disputes), '
  'notification feed with unread count, and network partner status. '
  'After this call the frontend uses only Realtime — no further SELECT queries.';
