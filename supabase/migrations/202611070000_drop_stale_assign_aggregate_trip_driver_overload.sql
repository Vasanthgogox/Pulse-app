-- Fix: "Could not choose the best candidate function" on assign_aggregate_trip_driver
-- The 20260527060818 cleanup ran before the 5-arg version (20260805150000) existed,
-- so it was a no-op and the stale 4-arg overload was never dropped. Both overloads
-- are ambiguous whenever the caller omits p_vehicle_id. Drop the 4-arg overload now
-- that the 5-arg version is guaranteed to exist.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'assign_aggregate_trip_driver'
      AND pg_get_function_arguments(p.oid) = 'p_trip_id uuid, p_driver_org_id uuid, p_driver_phone text, p_vehicle_display_number text'
  ) THEN
    DROP FUNCTION IF EXISTS public.assign_aggregate_trip_driver(uuid, uuid, text, text);
  END IF;
END $$;
