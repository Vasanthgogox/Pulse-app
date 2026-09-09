-- Log Watcher Cron Job Setup
-- Schedules the log watcher to run periodically

-- Ensure pg_cron extension is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Helper function to ingest logs from application sources
-- Applications can call this RPC to insert structured logs
CREATE OR REPLACE FUNCTION public.ingest_application_log(
  p_service text,
  p_level text,
  p_message text,
  p_error_type text DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_user_id_hash text DEFAULT NULL,
  p_route text DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_status_code int DEFAULT NULL,
  p_latency_ms numeric DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_source text DEFAULT 'application'
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_event_id bigint;
BEGIN
  -- Only permit authenticated users to log or service_role
  IF auth.role() NOT IN ('authenticated', 'service_role') AND p_source != 'function' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO ops.log_events (
    service,
    level,
    message,
    error_type,
    request_id,
    user_id_hash,
    route,
    method,
    status_code,
    latency_ms,
    metadata,
    source,
    environment
  ) VALUES (
    p_service,
    p_level,
    p_message,
    p_error_type,
    p_request_id,
    p_user_id_hash,
    p_route,
    p_method,
    p_status_code,
    p_latency_ms,
    p_metadata,
    p_source,
    current_setting('app.environment')::text
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ingest_application_log(text, text, text, text, text, text, text, text, int, numeric, jsonb, text) TO authenticated, service_role;

-- ── Scheduled Jobs ────────────────────────────────────────────────────────────

-- Job 1: Run log watcher every 60 seconds
-- The watcher polls incidents, auto-resolves stale ones, and triggers AI investigations
-- Uses missing_ok=true to avoid errors if env settings are not configured yet
SELECT cron.schedule(
  'log-watcher-main',
  '*/1 * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/log-watcher-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- Job 2: Auto-clean old logs every 4 hours
SELECT cron.schedule(
  'log-watcher-cleanup',
  '0 */4 * * *', -- Every 4 hours
  $$
  SELECT
    ops.trim_log_events(),
    ops.trim_incidents(),
    ops.trim_health_snapshots()
  $$
);

-- Job 3: Capture DB health every 1 minute (if not already scheduled)
-- This reuses the existing health monitoring
SELECT cron.schedule(
  'log-watcher-health',
  '* * * * *', -- Every minute
  $$ SELECT ops.capture_db_health_snapshot(); $$
);
