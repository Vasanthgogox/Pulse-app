-- Close the last residual instance of the session-scoped advisory-lock leak
-- documented in 20261123000000_fix_cron_advisory_lock_leak_and_slow_dispatch.sql.
--
-- prune_cron_job_run_details() was not included in that fix. It still uses
-- session-scoped pg_try_advisory_lock()/pg_advisory_unlock(): if the backend
-- running it is ever FATAL-terminated (idle_in_transaction_session_timeout,
-- OOM, etc.) before the EXCEPTION handler's unlock runs, the lock leaks and
-- — under transaction-mode pgbouncer/Supavisor pooling, where the physical
-- backend is recycled across logical sessions — outlives the session and
-- wedges every subsequent run of this job. Same bug class, just on a
-- once-daily (03:00) job instead of the every-1/2/10-minute jobs already
-- fixed.
--
-- Fix: switch to transaction-scoped pg_try_advisory_xact_lock(), which
-- self-releases on commit, rollback, or backend death — no manual unlock or
-- EXCEPTION shim needed. Same lock key, same statement_timeout, same DELETE,
-- same retention window, same schedule. No behavior change other than lock
-- safety.

CREATE OR REPLACE FUNCTION public.prune_cron_job_run_details()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('prune_cron_job_run_details', 0);
BEGIN
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN;
  END IF;

  SET LOCAL statement_timeout = '30s';
  DELETE FROM cron.job_run_details
  WHERE start_time < now() - INTERVAL '3 days';
END;
$$;
