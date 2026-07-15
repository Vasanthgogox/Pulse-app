-- BRIDGE FIX: refresh_dashboard_trip_metrics still points to public.dashboard_trip_metrics
-- but migration 20260518020000 already moved it to private schema.
-- Without this fix, migration 20260518120000 (UPDATE trips) fires the trigger and fails:
--   ERROR: relation "public.dashboard_trip_metrics" does not exist
--
-- This migration corrects the schema reference so the trigger works until
-- 20260526140000 drops it entirely and replaces with a pg_cron job.

CREATE OR REPLACE FUNCTION public.refresh_dashboard_trip_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.dashboard_trip_metrics;
  RETURN NULL;
END;
$$;
