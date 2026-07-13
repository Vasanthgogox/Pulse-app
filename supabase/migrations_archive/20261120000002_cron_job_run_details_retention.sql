-- =============================================================================
-- Phase 2: prevent cron.job_run_details from growing unbounded
-- =============================================================================
-- Evidence: cron.job_run_details had 13,956 rows with no retention/cleanup
-- job and pg_stat_user_tables showed it is only ever seq-scanned (idx_scan=0).
-- With 3 jobs running every 1, 2, and 10 minutes, this table grows by
-- thousands of rows per week indefinitely, and every read of it (including
-- run_db_health_monitor's own heartbeat/failure-count checks) does a full
-- table scan that gets slower over time.
--
-- Fix: schedule a daily pg_cron job to prune rows older than 3 days. This
-- keeps enough history for the health monitor's "last 10 runs" checks while
-- bounding table growth. Wrapped with an advisory lock for consistency with
-- the other jobs, though a daily job overlapping itself is not a realistic
-- risk given the fast delete.

CREATE OR REPLACE FUNCTION public.prune_cron_job_run_details()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('prune_cron_job_run_details', 0);
  v_got_lock boolean;
BEGIN
  v_got_lock := pg_try_advisory_lock(v_lock_key);
  IF NOT v_got_lock THEN
    RETURN;
  END IF;

  BEGIN
    SET LOCAL statement_timeout = '30s';
    DELETE FROM cron.job_run_details
    WHERE start_time < now() - INTERVAL '3 days';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
  END;

  PERFORM pg_advisory_unlock(v_lock_key);
END;
$$;

SELECT cron.schedule(
  'prune-cron-job-run-details',
  '0 3 * * *',
  $$SELECT public.prune_cron_job_run_details();$$
);
