-- =============================================================================
-- V2 Audit Fix 1: Views security_invoker + v_driver_balances LATERAL rewrite
-- Fixes: NEW-SEC-1 (6 views bypass RLS), NEW-PERF-1 (v_driver_balances correlated subqueries)
-- =============================================================================

-- trip_messages_archive_candidates
CREATE OR REPLACE VIEW public.trip_messages_archive_candidates
  WITH (security_invoker = true) AS
SELECT id, conversation_id, organization_id, sender_user_id, sender_role,
       sender_name, content, message_type, is_read, read_at, created_at, metadata
FROM trip_messages
WHERE created_at < (now() - '30 days'::interval)
  AND conversation_id IN (
    SELECT tc.id FROM trip_conversations tc
    JOIN trips t ON t.id = tc.trip_id
    WHERE t.status = ANY (ARRAY['completed','cancelled','done','delivered'])
  );

-- v_active_trips
CREATE OR REPLACE VIEW public.v_active_trips
  WITH (security_invoker = true) AS
SELECT t.id, t.organization_id, t.trip_number, t.status, t.pickup_area,
       t.drop_location, t.pickup_date, t.client_name, t.client_price,
       t.supplier_rate, t.margin, t.payment_status, t.driver_display_name,
       t.vehicle_display_number,
       d.name AS driver_name, d.phone AS driver_phone, d.status AS driver_current_status,
       v.vehicle_number, v.vehicle_type, s.company_name AS supplier_name
FROM trips t
LEFT JOIN drivers  d ON d.id = t.driver_id
LEFT JOIN vehicles v ON v.id = t.vehicle_id
LEFT JOIN suppliers s ON s.id = t.supplier_id
WHERE t.deleted_at IS NULL
  AND t.status <> ALL (ARRAY['completed','cancelled']);

-- v_client_revenue
CREATE OR REPLACE VIEW public.v_client_revenue
  WITH (security_invoker = true) AS
SELECT t.organization_id, t.client_id, c.name AS client_name,
       count(t.id)                        AS total_trips,
       sum(t.client_price)                AS total_billed,
       sum(t.amount_paid)                 AS total_collected,
       sum(t.client_price - t.amount_paid) AS outstanding
FROM trips t
JOIN clients c ON c.id = t.client_id
WHERE t.deleted_at IS NULL AND t.status = 'completed'
GROUP BY t.organization_id, t.client_id, c.name;

-- v_driver_balances — rewritten with LATERAL joins (removes 2 correlated subqueries per row)
CREATE OR REPLACE VIEW public.v_driver_balances
  WITH (security_invoker = true) AS
SELECT
  d.id   AS driver_id,
  d.organization_id,
  d.name AS driver_name,
  d.phone,
  d.status,
  COALESCE(ledger_last.balance_after, 0)    AS current_balance,
  COALESCE(trip_counts.completed_trips, 0)  AS completed_trips
FROM drivers d
LEFT JOIN LATERAL (
  SELECT balance_after FROM driver_ledger
  WHERE driver_id = d.id
  ORDER BY created_at DESC
  LIMIT 1
) ledger_last ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS completed_trips FROM trips
  WHERE driver_id = d.id
    AND status = 'completed'
    AND deleted_at IS NULL
) trip_counts ON true
WHERE d.deleted_at IS NULL;

-- v_driver_tracking_health
CREATE OR REPLACE VIEW public.v_driver_tracking_health
  WITH (security_invoker = true) AS
SELECT
  id, trip_number,
  COALESCE(started_at, pickup_date::timestamptz, created_at) AS anchor_at,
  EXTRACT(epoch FROM now() - COALESCE(started_at, pickup_date::timestamptz, created_at)) / 86400.0 AS days_elapsed,
  COALESCE(actual_distance_traveled_km::float, 0.0) AS actual_distance_km,
  GREATEST((EXTRACT(epoch FROM now() - COALESCE(started_at, pickup_date::timestamptz, created_at)) / 86400.0 * 350.0)::float, 0.0) AS target_km,
  CASE
    WHEN lower(trim(status)) <> ALL (ARRAY['in_transit','picked_up','in_progress','transit','at_drop','loading','unloading','at_pickup','assigned','active','on_route']) THEN 'ON_TRACK'
    WHEN COALESCE(started_at, pickup_date::timestamptz) IS NULL                              THEN 'ON_TRACK'
    WHEN EXTRACT(epoch FROM now() - COALESCE(started_at, pickup_date::timestamptz, created_at)) <= 0 THEN 'ON_TRACK'
    WHEN COALESCE(actual_distance_traveled_km::float, 0.0) <
         (EXTRACT(epoch FROM now() - COALESCE(started_at, pickup_date::timestamptz, created_at)) / 86400.0 * 350.0)::float THEN 'RUNNING_LATE'
    ELSE 'ON_TRACK'
  END AS tracking_status
FROM trips t;

-- v_open_indents
CREATE OR REPLACE VIEW public.v_open_indents
  WITH (security_invoker = true) AS
SELECT i.id, i.organization_id, i.indent_number, i.status, i.pickup_area,
       i.drop_location, i.client_name, i.client_price, i.supplier_target,
       i.pickup_date, i.vehicle_type, i.weight,
       count(dq.id) AS quote_count
FROM indents i
LEFT JOIN direct_quotes dq ON dq.indent_id = i.id AND dq.status = 'pending'
WHERE i.deleted_at IS NULL
  AND i.status = ANY (ARRAY['open','broadcast','pending','quoted'])
GROUP BY i.id;
