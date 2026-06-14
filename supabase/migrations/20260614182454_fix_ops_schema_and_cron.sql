-- Fix 3 production issues that caused the 2026-06-14 DB outage:
--
-- 1. ops.db_health_snapshots column name mismatch
--    Table was created in an earlier un-committed migration with legacy column names
--    (total_connections, active_connections, ...). Migration 20261001000001 used
--    CREATE TABLE IF NOT EXISTS (skipped) then replaced capture_db_health_snapshot()
--    with new column names — causing "column total_conns does not exist" every minute.
--
-- 2. pg_stat_statements not installed
--    ops.capture_slow_queries() references pg_stat_statements; failing hourly.
--
-- 3. refresh_dashboard_trip_metrics() cron too aggressive
--    Running every 5 min with no timeout guard; full trips table scan → timeout storm
--    → connection pile-up → DB crash. Rescheduled to 30 min + 60s statement timeout.

-- ── 1. Fix ops.db_health_snapshots column names ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name   = 'db_health_snapshots'
      AND column_name  = 'total_connections'
  ) THEN
    ALTER TABLE ops.db_health_snapshots RENAME COLUMN total_connections    TO total_conns;
    ALTER TABLE ops.db_health_snapshots RENAME COLUMN active_connections   TO active_conns;
    ALTER TABLE ops.db_health_snapshots RENAME COLUMN idle_connections     TO idle_conns;
    ALTER TABLE ops.db_health_snapshots RENAME COLUMN long_running_queries TO long_queries;
    ALTER TABLE ops.db_health_snapshots RENAME COLUMN realtime_connections TO realtime_conns;
    ALTER TABLE ops.db_health_snapshots RENAME COLUMN top_query_duration   TO top_dur_ms;
    ALTER TABLE ops.db_health_snapshots DROP COLUMN IF EXISTS notes;
  END IF;

  -- Guard: ensure all expected columns exist regardless of prior state
  ALTER TABLE ops.db_health_snapshots ADD COLUMN IF NOT EXISTS total_conns    int;
  ALTER TABLE ops.db_health_snapshots ADD COLUMN IF NOT EXISTS active_conns   int;
  ALTER TABLE ops.db_health_snapshots ADD COLUMN IF NOT EXISTS idle_conns     int;
  ALTER TABLE ops.db_health_snapshots ADD COLUMN IF NOT EXISTS long_queries   int;
  ALTER TABLE ops.db_health_snapshots ADD COLUMN IF NOT EXISTS lock_waiters   int;
  ALTER TABLE ops.db_health_snapshots ADD COLUMN IF NOT EXISTS realtime_conns int;
  ALTER TABLE ops.db_health_snapshots ADD COLUMN IF NOT EXISTS top_query      text;
  ALTER TABLE ops.db_health_snapshots ADD COLUMN IF NOT EXISTS top_dur_ms     numeric;
END;
$$;

-- ── 2. Enable pg_stat_statements ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ── 3. Throttle and guard refresh_dashboard_trip_metrics ─────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('refresh_dashboard_trip_metrics');
    PERFORM cron.schedule(
      'refresh_dashboard_trip_metrics',
      '*/30 * * * *',
      $cron$ SELECT public.refresh_dashboard_trip_metrics() $cron$
    );
  END IF;
EXCEPTION WHEN others THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_dashboard_trip_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '60s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.dashboard_trip_metrics;
EXCEPTION WHEN query_canceled THEN
  RAISE WARNING '[refresh_dashboard_trip_metrics] timed out after 60s, skipping this run';
END;
$$;
