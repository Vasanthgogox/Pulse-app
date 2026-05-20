-- Fix refresh_dashboard_trip_metrics to use private schema.
-- Migration 20260518020000 moved the matview to private.dashboard_trip_metrics
-- but 20260526140000 created the cron function still referencing public.dashboard_trip_metrics,
-- causing "relation does not exist" every 5 minutes.

CREATE OR REPLACE FUNCTION public.refresh_dashboard_trip_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.dashboard_trip_metrics;
END;
$$;
