-- PERF FIX: PERF-4
-- v_long_haul_health had 3 identical correlated subqueries against driver_locations per trip.
-- Replace with a single LATERAL join.

CREATE OR REPLACE VIEW public.v_long_haul_health WITH (security_invoker = true) AS
SELECT
  t.id AS trip_id,
  t.trip_number,
  COALESCE(t.distance::float, 0) AS total_distance_km,
  now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at) AS time_elapsed,
  GREATEST(
    (EXTRACT(epoch FROM now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at)) / 86400.0 * 350.0)::float,
    0
  ) AS expected_km,
  COALESCE(t.actual_distance_traveled_km::float, loc_agg.odometer_range, 0) AS current_km,
  CASE
    WHEN COALESCE(t.started_at, t.pickup_date::timestamptz) IS NULL THEN 'ON_TRACK'
    WHEN lower(trim(t.status)) <> ALL (ARRAY[
      'in_transit','picked_up','in_progress','transit','at_drop',
      'loading','unloading','at_pickup','assigned','active'
    ]) THEN 'ON_TRACK'
    WHEN EXTRACT(epoch FROM now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at)) <= 0 THEN 'ON_TRACK'
    WHEN COALESCE(t.actual_distance_traveled_km::float, loc_agg.odometer_range, 0)
       < (EXTRACT(epoch FROM now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at)) / 86400.0 * 350.0 * 0.7)
      THEN 'CRITICAL_DELAY'
    WHEN COALESCE(t.actual_distance_traveled_km::float, loc_agg.odometer_range, 0)
       < (EXTRACT(epoch FROM now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at)) / 86400.0 * 350.0 * 0.9)
      THEN 'LATE_RISK'
    ELSE 'ON_TRACK'
  END AS health_status
FROM trips t
LEFT JOIN LATERAL (
  SELECT
    CASE WHEN count(*) FILTER (WHERE odometer_km IS NOT NULL) >= 2
      THEN max(odometer_km) - min(odometer_km)
      ELSE NULL
    END AS odometer_range
  FROM driver_locations dl
  WHERE dl.trip_id = t.id
) loc_agg ON true;
