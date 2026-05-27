-- Drop the old 4-param overload of assign_aggregate_trip_driver.
-- Migration 20260805150000 added a 5-param version (adds p_vehicle_id uuid DEFAULT NULL)
-- but never dropped the 4-param one. Both have trailing DEFAULT NULL args so Postgres
-- cannot resolve the call → "Could not choose the best candidate function" error.
-- The 5-param version is a strict superset; all callers work with it unchanged.
DROP FUNCTION IF EXISTS public.assign_aggregate_trip_driver(uuid, uuid, text, text);

-- Re-grant on the surviving signature (was only granted on the old one in some migrations).
GRANT EXECUTE ON FUNCTION public.assign_aggregate_trip_driver(uuid, uuid, text, text, uuid) TO authenticated;
