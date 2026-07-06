-- =============================================================================
-- Phase 1 (Critical): dispatch_verification_workers overlap protection
-- =============================================================================
-- Evidence: cron.job_run_details shows job 3 (dispatch_verification_workers,
-- schedule '* * * * *') stuck for 36 minutes (run 13973, 2026-07-05 14:54:01 ->
-- 15:30:11) while running as raw inline SQL directly on cron.job.command, with
-- no overlap guard. Because the schedule fires every 60s, a single hung run
-- allows ~36 subsequent invocations to queue/attempt against an already
-- saturated nano instance, contributing to the connection/resource exhaustion.
--
-- Fix: wrap the dispatch logic in a SECURITY DEFINER function that:
--   1. Takes a session-level advisory lock (pg_try_advisory_lock) and exits
--      immediately if another invocation already holds it (no overlap).
--   2. Sets a local statement_timeout so a hung run cannot block indefinitely.
--   3. Reads the vault secret once per invocation (was already once per
--      invocation, not once per row -- the previous inline SQL only had one
--      vault subquery total; keeping that property, not regressing it).
--   4. Releases the lock in all paths (normal end, exception) via a nested
--      block with EXCEPTION ... plus an outer unconditional unlock.
--   5. Is idempotent: re-running it while jobs are already dispatched has no
--      side effect beyond re-sending the same rows if the WHERE clause still
--      matches -- unchanged from prior behavior, not a new risk.

CREATE OR REPLACE FUNCTION public.dispatch_verification_workers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('dispatch_verification_workers', 0);
  v_got_lock boolean;
  v_service_role_key text;
BEGIN
  v_got_lock := pg_try_advisory_lock(v_lock_key);
  IF NOT v_got_lock THEN
    -- Another invocation is already running; exit immediately, no overlap.
    RETURN;
  END IF;

  BEGIN
    -- Guard against a hung HTTP/queue call blocking this backend indefinitely.
    SET LOCAL statement_timeout = '10s';

    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';

    PERFORM net.http_post(
      url := 'https://nafxpivddesgsrthmosv.supabase.co/functions/v1/verification-worker',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := jsonb_build_object('job_id', j.id, 'organization_id', j.organization_id),
      timeout_milliseconds := 5000
    )
    FROM public.verification_jobs j
    WHERE j.status IN ('QUEUED', 'PARTIAL_REVIEW')
      AND j.attempts < 4
      AND j.next_attempt_at <= now()
    LIMIT 5;

  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
  END;

  PERFORM pg_advisory_unlock(v_lock_key);
END;
$$;

SELECT cron.alter_job(
  job_id := 3,
  command := 'SELECT public.dispatch_verification_workers();'
);
