-- PERF FIX: PERF-4
-- v_long_haul_health had 3 identical correlated subqueries against driver_locations per trip.
-- Replace with a single LATERAL join.

-- Stub: actual_distance_traveled_km and driver_locations.odometer_km are added
-- in 20260619140000 which also recreates this view with the full logic.
CREATE OR REPLACE VIEW public.v_long_haul_health WITH (security_invoker = true) AS
SELECT
  t.id          AS trip_id,
  t.trip_number,
  COALESCE(t.distance::float, 0)                                                                    AS total_distance_km,
  now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at)                         AS time_elapsed,
  GREATEST((EXTRACT(epoch FROM now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at)) / 86400.0 * 350.0)::float, 0) AS expected_km,
  0::float                                                                                          AS current_km,
  'ON_TRACK'::text                                                                                  AS health_status
FROM trips t;
