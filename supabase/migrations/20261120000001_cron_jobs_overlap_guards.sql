-- =============================================================================
-- Phase 2: overlap guards for remaining pg_cron jobs (1, 2)
-- =============================================================================
-- Evidence: none of the 3 cron jobs had overlap protection. Job 3 was
-- confirmed to hang for 36 minutes (see 20261120000000). Jobs 1 and 2 run on
-- fixed short intervals (every 2 min, every 10 min respectively) with no
-- guard against a slow/hung run overlapping the next scheduled tick, and no
-- statement_timeout of their own -- they only inherit the database default.
-- This migration does not change either job's business logic, only wraps
-- each in the same pg_try_advisory_lock + statement_timeout pattern used for
-- job 3, using a distinct lock key per job so they cannot block each other.

-- ---- Job 1: send-push-notifications ----------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_push_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('dispatch_push_notifications', 0);
  v_got_lock boolean;
BEGIN
  v_got_lock := pg_try_advisory_lock(v_lock_key);
  IF NOT v_got_lock THEN
    RETURN;
  END IF;

  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
  END;

  PERFORM pg_advisory_unlock(v_lock_key);
END;
$$;

SELECT cron.alter_job(
  job_id := 1,
  command := 'SELECT public.dispatch_push_notifications();'
);

-- ---- Job 2: run_db_health_monitor ------------------------------------------
-- Wrap the existing monitor (left untouched) in a locking shim rather than
-- editing its body, so its diagnostic logic is unchanged.
CREATE OR REPLACE FUNCTION public.run_db_health_monitor_guarded()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('run_db_health_monitor', 0);
  v_got_lock boolean;
BEGIN
  v_got_lock := pg_try_advisory_lock(v_lock_key);
  IF NOT v_got_lock THEN
    RETURN;
  END IF;

  BEGIN
    SET LOCAL statement_timeout = '15s';
    PERFORM public.run_db_health_monitor();
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
  END;

  PERFORM pg_advisory_unlock(v_lock_key);
END;
$$;

SELECT cron.alter_job(
  job_id := 2,
  command := 'SELECT public.run_db_health_monitor_guarded();'
);
