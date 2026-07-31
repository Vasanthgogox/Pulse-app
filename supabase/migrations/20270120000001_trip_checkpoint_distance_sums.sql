-- Journey Metrics support: sum of trip_location_checkpoints.distance_delta_m
-- per trip, for N trips in one call. Backs "distance actually covered" for
-- long-haul journey-health alerts (features/trips/domain/tripJourneyMetrics.ts) --
-- an honest proxy from real GPS deltas, not a fabricated odometer reading.
--
-- Deliberately NOT SECURITY DEFINER: runs with the caller's own privileges,
-- so the existing "Trip partners read checkpoints" RLS policy
-- (can_access_trip_location()) filters rows exactly as it already does for
-- any other read of this table -- no new access model, same as every other
-- read added this session.
--
-- Aggregation happens in Postgres, not by fetching raw checkpoint rows to
-- the client: a multi-day long-haul trip can have thousands of sparse
-- checkpoints, so summing server-side keeps this a single small result set
-- per trip regardless of trip duration.

CREATE OR REPLACE FUNCTION public.get_trip_checkpoint_distance_sums(p_trip_ids uuid[])
RETURNS TABLE (trip_id uuid, total_distance_m double precision)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.trip_id, SUM(c.distance_delta_m) AS total_distance_m
  FROM public.trip_location_checkpoints c
  WHERE c.trip_id = ANY(p_trip_ids)
    AND c.distance_delta_m IS NOT NULL
  GROUP BY c.trip_id;
$$;

COMMENT ON FUNCTION public.get_trip_checkpoint_distance_sums IS
  'Sum of distance_delta_m per trip for N trips in one query -- backs journey-progress metrics. Not SECURITY DEFINER; relies on the caller''s own RLS on trip_location_checkpoints (can_access_trip_location).';

GRANT EXECUTE ON FUNCTION public.get_trip_checkpoint_distance_sums TO authenticated;
