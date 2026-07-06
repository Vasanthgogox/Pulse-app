-- =============================================================================
-- Fix: cron connection-exhaustion crash (DB refused connections 2026-07-06)
-- =============================================================================
-- ROOT CAUSE
-- The three cron guard functions (dispatch_push_notifications,
-- dispatch_verification_workers, run_db_health_monitor_guarded) protected
-- against overlap with SESSION-level pg_try_advisory_lock() + a manual
-- pg_advisory_unlock() in an EXCEPTION handler.
--
-- Two problems combined to exhaust the 60-connection instance:
--   1. net.http_post() (pg_net) is ASYNCHRONOUS -- it only enqueues the
--      request and returns. The SET LOCAL statement_timeout and
--      timeout_milliseconds therefore do not bound the real work, and the
--      EXCEPTION handler rarely fires on the path that actually kills the
--      backend.
--   2. When a cron backend is terminated by the idle-in-transaction timeout
--      (a FATAL, not a catchable exception), the EXCEPTION handler never runs,
--      so pg_advisory_unlock() is skipped. A session advisory lock should
--      release on backend death, but behind pgbouncer transaction pooling the
--      physical backend is recycled across logical sessions, so the lock
--      outlives the cron session and wedges every subsequent run. Job 3
--      (schedule '* * * * *', every minute) then re-fires against a saturated
--      pool -> "job startup timeout" cascade -> connections hit 60/60 ->
--      "the database system is not accepting connections".
--
-- FIX
--   * Replace session-scoped pg_try_advisory_lock/pg_advisory_unlock with the
--     TRANSACTION-scoped pg_try_advisory_xact_lock(). Transaction advisory
--     locks are released automatically at commit/rollback AND on backend
--     death, and are safe under pgbouncer transaction pooling -- they cannot
--     leak. The manual unlock + EXCEPTION shim is removed entirely.
--   * Slow job 3 from every-1-minute to every-2-minutes to reduce baseline
--     connection pressure on the 60-conn instance.
--
-- Business logic (URLs, payloads, statement_timeout durations, the
-- verification_jobs selection query) is unchanged.

-- ---- Job 1: send-push-notifications -----------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_push_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('dispatch_push_notifications', 0);
BEGIN
  -- Transaction-scoped: auto-released at end of txn / on backend death.
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN;
  END IF;

  SET LOCAL statement_timeout = '10s';

  PERFORM net.http_post(
    url := 'https://nafxpivddesgsrthmosv.supabase.co/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
END;
$$;

-- ---- Job 2: run_db_health_monitor_guarded -----------------------------------
CREATE OR REPLACE FUNCTION public.run_db_health_monitor_guarded()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('run_db_health_monitor', 0);
BEGIN
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN;
  END IF;

  SET LOCAL statement_timeout = '15s';
  PERFORM public.run_db_health_monitor();
END;
$$;

-- ---- Job 3: dispatch_verification_workers -----------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_verification_workers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('dispatch_verification_workers', 0);
  v_service_role_key text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    -- Another invocation is already running; exit immediately, no overlap.
    RETURN;
  END IF;

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
END;
$$;

-- ---- Reduce baseline pressure: job 3 every 2 min instead of every minute ----
SELECT cron.alter_job(job_id := 3, schedule := '*/2 * * * *');
