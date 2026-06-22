-- Drop the old 4-param overload of assign_aggregate_trip_driver.
-- On fresh deploys the 5-param version (20260805150000) hasn't been created yet,
-- so this migration is a no-op; the cleanup happens naturally once the 5-param exists.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'assign_aggregate_trip_driver'
      AND pg_get_function_arguments(p.oid) = 'p_trip_id uuid, p_driver_org_id uuid, p_driver_phone text, p_vehicle_display_number text, p_vehicle_id uuid'
  ) THEN
    DROP FUNCTION IF EXISTS public.assign_aggregate_trip_driver(uuid, uuid, text, text);
    GRANT EXECUTE ON FUNCTION public.assign_aggregate_trip_driver(uuid, uuid, text, text, uuid) TO authenticated;
  END IF;
END $$;
