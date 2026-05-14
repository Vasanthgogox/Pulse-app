-- ═════════════════════════════════════════════════════════════════════════════
-- DECOUPLE MATERIALIZED VIEW REFRESH FROM TRIPS HOT PATH
--
-- ROOT CAUSE:
-- trg_refresh_dashboard_trip_metrics (migration 20260506055634) fires
-- REFRESH MATERIALIZED VIEW CONCURRENTLY on EVERY trips INSERT/UPDATE/DELETE.
--
-- When a trip status changes, the trigger chain is:
--   trips.status UPDATE
--     → fn_broadcast_trip_status_to_chat → 2-6 trip_messages INSERTs
--     → each INSERT fires on_trip_message_insert → UPDATE trip_conversations
--     → trg_refresh_dashboard_trip_metrics → REFRESH MATERIALIZED VIEW ← PROBLEM
--
-- REFRESH MATERIALIZED VIEW CONCURRENTLY scans the entire trips table to
-- rebuild the view. Under chat load (frequent status changes + message inserts),
-- this runs dozens of times per minute. Each refresh:
--   • Acquires ShareUpdateExclusiveLock on the view (blocks concurrent reads briefly)
--   • Runs a full aggregation over trips
--   • Writes the new snapshot to disk
--   • Generates WAL for the view update
--
-- FIX:
-- Drop the per-row trigger. Replace with a pg_cron job that refreshes every
-- 5 minutes. Dashboard metrics are analytical — 5-minute staleness is
-- acceptable and eliminates the refresh from every trips write path entirely.
--
-- If pg_cron is not installed, a manual scheduled function is provided as fallback.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Step 1: Drop the trigger that fires on every trips write ─────────────────
DROP TRIGGER IF EXISTS trg_refresh_dashboard_trip_metrics ON public.trips;

-- ─── Step 1b: Replace trigger-only function with RETURNS void.
-- Original (20260506055634) used RETURNS trigger; pg_cron / SELECT cannot call that
-- (SQLSTATE 0A000). Postgres also forbids changing return type with CREATE OR REPLACE
-- (SQLSTATE 42P13) — must DROP then CREATE.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      EXECUTE 'SELECT cron.unschedule(''refresh_dashboard_trip_metrics'')';
    EXCEPTION
      WHEN undefined_table OR undefined_function OR invalid_parameter_value THEN
        NULL;
    END;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.refresh_dashboard_trip_metrics();

CREATE FUNCTION public.refresh_dashboard_trip_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.dashboard_trip_metrics;
END;
$$;

COMMENT ON FUNCTION public.refresh_dashboard_trip_metrics() IS
  'Refreshes dashboard_trip_metrics MV. Called by pg_cron; formerly a statement-level trigger on trips.';

-- ─── Step 2: Schedule via pg_cron (no-op if not installed) ───────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      EXECUTE $cron$
        SELECT cron.schedule(
          'refresh_dashboard_trip_metrics',
          '*/5 * * * *',
          $inner$ SELECT public.refresh_dashboard_trip_metrics() $inner$
        )
      $cron$;
      RAISE NOTICE 'pg_cron: refresh_dashboard_trip_metrics scheduled every 5 minutes';
    EXCEPTION
      WHEN undefined_table OR undefined_function OR duplicate_object THEN
        RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE
      'pg_cron not installed. '
      'Dashboard metrics will not auto-refresh. '
      'Run: SELECT public.refresh_dashboard_trip_metrics() manually, '
      'or enable pg_cron in Supabase Dashboard → Database → Extensions.';
  END IF;
END;
$$;


-- ─── Step 3: Immediate one-time refresh to ensure view is current ─────────────
-- (the trigger was keeping it live; now that it is gone, refresh once manually)
SELECT public.refresh_dashboard_trip_metrics();
