-- Stop cron job log-watcher-main from inserting NULL urls into pg_net
CREATE OR REPLACE FUNCTION public.dispatch_log_watcher_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('dispatch_log_watcher_scheduler', 0);
  v_got_lock boolean;
  v_url text;
  v_key text;
BEGIN
  v_got_lock := pg_try_advisory_lock(v_lock_key);
  IF NOT v_got_lock THEN
    RETURN;
  END IF;

  BEGIN
    v_url := nullif(btrim(current_setting('app.supabase_url', true)), '');
    IF v_url IS NULL THEN
      PERFORM pg_advisory_unlock(v_lock_key);
      RETURN;
    END IF;

    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';

    IF v_key IS NULL OR btrim(v_key) = '' THEN
      PERFORM pg_advisory_unlock(v_lock_key);
      RETURN;
    END IF;

    PERFORM net.http_post(
      url := v_url || '/functions/v1/log-watcher-scheduler',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
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

REVOKE ALL ON FUNCTION public.dispatch_log_watcher_scheduler() FROM PUBLIC;

DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'log-watcher-main';
  IF jid IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id := jid,
      command := 'SELECT public.dispatch_log_watcher_scheduler();'
    );
  END IF;
END $$;