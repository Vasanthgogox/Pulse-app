-- Fix 1: trailing-window cron startup-timeout detector
CREATE OR REPLACE FUNCTION ops.detect_cron_startup_timeout_incident(
  p_detected_by text
)
RETURNS TABLE (incident_id uuid, needs_alert boolean, affected_jobs jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
  v_quiet_interval   CONSTANT interval := interval '10 minutes';
  v_window           CONSTANT interval := interval '10 minutes';
  v_min_failures     CONSTANT int := 3;
  v_new_jobs jsonb;
  v_last_failure timestamptz;
  v_incident_id uuid;
BEGIN
  IF p_detected_by NOT IN ('pg_cron', 'external') THEN
    RAISE EXCEPTION 'invalid p_detected_by: %', p_detected_by;
  END IF;

  UPDATE ops.incidents
  SET status = 'RESOLVED',
      updated_at = now()
  WHERE fingerprint = 'pg_cron_startup_timeout'
    AND status = 'OPEN'
    AND last_seen < now() - v_quiet_interval;

  WITH recent AS (
    SELECT jrd.jobid, j.jobname, jrd.status, jrd.return_message, jrd.start_time
    FROM cron.job_run_details jrd
    JOIN cron.job j ON j.jobid = jrd.jobid
    WHERE jrd.start_time > now() - v_window
      AND jrd.status = 'failed'
      AND jrd.return_message = 'job startup timeout'
  ),
  qualifying AS (
    SELECT jobid, jobname, count(*) AS failure_count, max(start_time) AS last_failure
    FROM recent
    GROUP BY jobid, jobname
    HAVING count(*) >= v_min_failures
  )
  SELECT jsonb_agg(jsonb_build_object('jobid', jobid, 'jobname', jobname)),
         max(last_failure)
  INTO v_new_jobs, v_last_failure
  FROM qualifying;

  IF v_new_jobs IS NULL THEN
    SELECT i.id INTO v_incident_id
    FROM ops.incidents i
    WHERE i.fingerprint = 'pg_cron_startup_timeout' AND i.status = 'OPEN';

    RETURN QUERY SELECT v_incident_id, false, '[]'::jsonb;
    RETURN;
  END IF;

  INSERT INTO ops.incidents (
    status, severity, service, title, fingerprint,
    first_seen, last_seen, event_count, affected_routes
  )
  VALUES (
    'OPEN', 'HIGH', 'postgres-cron', 'pg_cron job startup timeout',
    'pg_cron_startup_timeout',
    v_last_failure, v_last_failure, 1,
    ARRAY(SELECT jsonb_array_elements(v_new_jobs) ->> 'jobname')
  )
  ON CONFLICT (fingerprint) WHERE status = 'OPEN'
  DO UPDATE SET
    last_seen = greatest(ops.incidents.last_seen, excluded.last_seen),
    event_count = ops.incidents.event_count + 1,
    affected_routes = ARRAY(
      SELECT DISTINCT unnest(ops.incidents.affected_routes || excluded.affected_routes)
    ),
    updated_at = now()
  RETURNING id INTO v_incident_id;

  RETURN QUERY
  SELECT v_incident_id,
         (SELECT alerted_at IS NULL FROM ops.incidents WHERE id = v_incident_id),
         v_new_jobs;
END;
$$;

REVOKE ALL ON FUNCTION ops.detect_cron_startup_timeout_incident(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.detect_cron_startup_timeout_incident(text) TO service_role;

-- Fix 2: transaction-scoped lock for log-watcher scheduler
CREATE OR REPLACE FUNCTION public.dispatch_log_watcher_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('dispatch_log_watcher_scheduler', 0);
  v_url text;
  v_key text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN;
  END IF;

  SET LOCAL statement_timeout = '10s';

  v_url := nullif(btrim(current_setting('app.supabase_url', true)), '');
  IF v_url IS NULL THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF v_key IS NULL OR btrim(v_key) = '' THEN
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
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_log_watcher_scheduler() FROM PUBLIC;
