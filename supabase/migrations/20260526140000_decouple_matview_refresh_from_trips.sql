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

-- Keep the function — pg_cron will call it on schedule instead.
-- The function is: SELECT public.refresh_dashboard_trip_metrics()


-- ─── Step 2: Schedule via pg_cron (no-op if not installed) ───────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Remove any existing schedule for this job before re-creating
    PERFORM cron.unschedule('refresh_dashboard_trip_metrics')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'refresh_dashboard_trip_metrics'
    );

    PERFORM cron.schedule(
      'refresh_dashboard_trip_metrics',
      '*/5 * * * *',   -- every 5 minutes
      $cron$ SELECT public.refresh_dashboard_trip_metrics() $cron$
    );

    RAISE NOTICE 'pg_cron: refresh_dashboard_trip_metrics scheduled every 5 minutes';

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
