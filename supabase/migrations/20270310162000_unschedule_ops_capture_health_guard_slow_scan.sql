-- 2026-09-07 incident: database reported unhealthy while connection count
-- stayed low (~10). Evidence from postgres logs 19:31–19:58 UTC:
--   * platform health probe on extensions.pg_stat_statements ran 12–15s
--   * realtime.list_changes 12–15s
--   * PostgREST schema-cache reload (ledger function DDL) scanning catalog
--   * checkpoints stretched to 35–60s write time (IO stall)
--   * cron jobs 2, 6, 9, 12 failed with "job startup timeout"
--
-- 20261005000001 already unscheduled ops_capture_health after the June crash
-- (duplicate 15-min snapshot of pg_stat_activity). 20270310030000 restored it
-- because the replacement 5-minute job was never in migration history. That
-- restore put a second activity scan back on the same cadence as
-- cron-health-alert and monitor-watchdog, and job 12 then failed to start
-- during this saturation window. Keep it unscheduled.
--
-- ops.capture_slow_queries also full-scans extensions.pg_stat_statements.
-- Bound it so the hourly job cannot sit on that view while the platform
-- probe is already slow.

DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid FROM cron.job WHERE jobname = 'ops_capture_health'
  LOOP
    BEGIN
      PERFORM cron.unschedule(r.jobid);
    EXCEPTION WHEN OTHERS THEN
      DELETE FROM cron.job WHERE jobid = r.jobid;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION ops.capture_slow_queries(p_threshold_ms numeric DEFAULT 500)
  RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_count int := 0;
BEGIN
  -- Fail fast: never hold the pg_stat_statements scan the platform health
  -- probe already struggles with under IO pressure.
  SET LOCAL statement_timeout = '5s';
  SET LOCAL lock_timeout = '1s';

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
    RETURN 0;
  END IF;

  INSERT INTO ops.slow_query_log (duration_ms, query_text, calls, total_ms, rows)
  SELECT
    round(mean_exec_time::numeric, 2),
    left(query, 500),
    calls,
    round(total_exec_time::numeric, 2),
    rows
  FROM extensions.pg_stat_statements
  WHERE mean_exec_time > p_threshold_ms
    AND query NOT ILIKE '%pg_stat%'
    AND query NOT ILIKE 'START_REPLICATION%'
    AND dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  ORDER BY mean_exec_time DESC
  LIMIT 50;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM ops.slow_query_log WHERE logged_at < now() - interval '30 days';

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION ops.capture_slow_queries(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.capture_slow_queries(numeric) TO service_role;
