-- =============================================================================
-- Short-circuit expensive run_db_health_monitor checks under connection pressure
-- =============================================================================
-- Evidence: run_db_health_monitor runs every 10 min and does ~10 diagnostic
-- queries per run, including a pg_stat_activity scan with string aggregation
-- (section 2, long-running queries), a pg_stat_statements scan (section 9),
-- and a net._http_response scan (section 7). During the 2026-07-05 incident,
-- this function itself failed to run ("job startup timeout") in the same
-- window connections were exhausted -- i.e. the monitor's own heaviest work
-- was competing for the exact resource it exists to report on.
--
-- Fix: move the connection-saturation check (section 4) to the top, since it
-- is already a single cheap COUNT(*) against pg_stat_activity. When usage is
-- >= 80%, skip sections 2, 7, and 9 (the 3 heaviest scans) and emit a
-- "degraded mode" note in the alert instead of silently omitting them. This
-- keeps the monitor itself cheap to run under exactly the conditions where
-- it's most likely to be starved for a backend slot, without changing what
-- gets alerted on when the system is healthy (< 80% connections, the normal
-- case) or suppressing the connection-saturation alert itself.
--
-- Sections 0, 1, 3, 5, 6, 8, 10 are all single cheap lookups/counts and are
-- left unconditional -- they are the core signals needed most during an
-- incident (heartbeat, cron failures, idle-in-transaction, lock waits, disk,
-- replication) and none of them scan pg_stat_activity/pg_stat_statements in
-- a way that adds meaningful load.

CREATE OR REPLACE FUNCTION public.run_db_health_monitor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_slack_url TEXT := 'https://hooks.slack.com/services/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';
  v_alerts TEXT := '';
  v_severity TEXT := 'high';

  v_cron_fail_count INT;
  v_cron_last_success TIMESTAMPTZ;
  v_cron_last_error TEXT;
  v_monitor_last_run TIMESTAMPTZ;
  v_long_query_count INT;
  v_long_query_detail TEXT;
  v_idle_warn_count INT;
  v_idle_crit_count INT;
  v_conn_pct NUMERIC;
  v_conn_used INT;
  v_conn_max INT;
  v_conn_pressure BOOLEAN;
  v_lock_count INT;
  v_queue_depth INT;
  v_net_fail_count INT;

  v_db_bytes BIGINT;
  v_db_gb NUMERIC;
  v_timeout_delta BIGINT;
  v_timeout_prev BIGINT;
  v_timeout_now BIGINT;
  v_slot_inactive INT;
  v_slot_lag_mb NUMERIC;
BEGIN

  -- ── 0. HEARTBEAT ─────────────────────────────────────────────────────────
  SELECT MAX(start_time) INTO v_monitor_last_run
  FROM cron.job_run_details WHERE jobid = 2 AND status = 'succeeded';

  IF v_monitor_last_run IS NULL OR v_monitor_last_run < NOW() - INTERVAL '30 minutes' THEN
    v_severity := 'critical';
    v_alerts := v_alerts
      || ':red_circle: *CRITICAL — Health monitor has not run in >30 min*' || E'\n'
      || '  • Last success: ' || COALESCE(v_monitor_last_run::TEXT, 'never') || E'\n'
      || '  • Action: check cron job 2 in cron.job' || E'\n\n';
  END IF;

  -- ── 1. CRON CONSECUTIVE FAILURES ─────────────────────────────────────────
  SELECT COUNT(*) INTO v_cron_fail_count
  FROM (
    SELECT status, ROW_NUMBER() OVER (ORDER BY start_time DESC) AS rn
    FROM cron.job_run_details WHERE jobid = 1 ORDER BY start_time DESC LIMIT 10
  ) x WHERE status = 'failed' AND rn <= COALESCE(
    (SELECT MIN(rn)-1 FROM (
      SELECT status, ROW_NUMBER() OVER (ORDER BY start_time DESC) AS rn
      FROM cron.job_run_details WHERE jobid = 1 ORDER BY start_time DESC LIMIT 10
    ) y WHERE status = 'succeeded'), 10
  );

  SELECT MAX(start_time) INTO v_cron_last_success
  FROM cron.job_run_details WHERE jobid = 1 AND status = 'succeeded';

  SELECT return_message INTO v_cron_last_error
  FROM cron.job_run_details WHERE jobid = 1 AND status = 'failed'
  ORDER BY start_time DESC LIMIT 1;

  IF v_cron_fail_count >= 3 THEN
    v_severity := 'critical';
    v_alerts := v_alerts
      || ':red_circle: *CRITICAL — `send-push-notifications` failed ' || v_cron_fail_count || 'x consecutively*' || E'\n'
      || '  • Last success: ' || COALESCE(v_cron_last_success::TEXT, 'never') || E'\n'
      || '  • Error: ' || LEFT(COALESCE(v_cron_last_error, 'unknown'), 200) || E'\n'
      || '  • Action: check Vault secret + Edge Function status' || E'\n\n';
  END IF;

  -- ── 2. CONNECTION SATURATION — moved up: cheap, and gates the expensive checks below ──
  SELECT COUNT(*) INTO v_conn_used FROM pg_stat_activity;
  SELECT setting::INT INTO v_conn_max FROM pg_settings WHERE name = 'max_connections';
  v_conn_pct := ROUND((v_conn_used::NUMERIC / NULLIF(v_conn_max, 0)) * 100, 1);
  v_conn_pressure := v_conn_pct >= 80;

  IF v_conn_pct >= 90 THEN
    v_severity := 'critical';
    v_alerts := v_alerts || ':red_circle: *CRITICAL — Connection saturation ' || v_conn_pct || '% (' || v_conn_used || '/' || v_conn_max || ')* — new connections may be refused' || E'\n\n';
  ELSIF v_conn_pct >= 85 THEN
    v_alerts := v_alerts || ':warning: *HIGH — Connection usage ' || v_conn_pct || '% (' || v_conn_used || '/' || v_conn_max || ')* — approaching limit' || E'\n\n';
  ELSIF v_conn_pressure THEN
    v_alerts := v_alerts || ':warning: *Connection usage ' || v_conn_pct || '% (' || v_conn_used || '/' || v_conn_max || ')* — elevated' || E'\n\n';
  END IF;

  IF v_conn_pressure THEN
    v_alerts := v_alerts
      || ':information_source: *Monitor running in degraded mode* — skipping long-running-query scan, pg_net queue/failure checks, and statement-timeout scan while connection usage is >= 80%, to avoid adding load to an already-pressured database.' || E'\n\n';
  END IF;

  -- ── 3. LONG RUNNING QUERIES >60s — skipped under connection pressure ──────
  IF NOT v_conn_pressure THEN
    SELECT COUNT(*), STRING_AGG(LEFT(query, 80) || ' [' || ROUND(EXTRACT(EPOCH FROM (NOW()-query_start))) || 's]', E'\n    ')
    INTO v_long_query_count, v_long_query_detail
    FROM (
      SELECT query, query_start FROM pg_stat_activity
      WHERE state = 'active'
        AND query_start < NOW() - INTERVAL '60 seconds'
        AND backend_type = 'client backend'
        AND query NOT ILIKE '%pg_stat_activity%'
        AND query NOT ILIKE '%run_db_health%'
        AND query NOT ILIKE 'START_REPLICATION%'
        AND query NOT ILIKE '%replication%'
      ORDER BY query_start LIMIT 3
    ) q;

    IF v_long_query_count > 0 THEN
      v_alerts := v_alerts
        || ':warning: *HIGH — ' || v_long_query_count || ' long-running quer' || CASE WHEN v_long_query_count = 1 THEN 'y' ELSE 'ies' END || ' (>60s)*' || E'\n'
        || '    ' || COALESCE(v_long_query_detail, '') || E'\n\n';
    END IF;
  END IF;

  -- ── 4. IDLE IN TRANSACTION ────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE state_change < NOW() - INTERVAL '15 minutes'),
    COUNT(*) FILTER (WHERE state_change < NOW() - INTERVAL '30 minutes')
  INTO v_idle_warn_count, v_idle_crit_count
  FROM pg_stat_activity WHERE state = 'idle in transaction';

  IF v_idle_crit_count > 0 THEN
    v_severity := 'critical';
    v_alerts := v_alerts || ':red_circle: *CRITICAL — ' || v_idle_crit_count || ' session(s) idle-in-transaction >30 min*' || E'\n\n';
  ELSIF v_idle_warn_count > 0 THEN
    v_alerts := v_alerts || ':warning: *HIGH — ' || v_idle_warn_count || ' session(s) idle-in-transaction >15 min*' || E'\n\n';
  END IF;

  -- ── 5. LOCK WAITS >5 MIN ─────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_lock_count
  FROM pg_stat_activity
  WHERE wait_event_type = 'Lock'
    AND state != 'idle'
    AND backend_type = 'client backend'
    AND query_start < NOW() - INTERVAL '5 minutes';

  IF v_lock_count > 0 THEN
    v_alerts := v_alerts || ':warning: *HIGH — ' || v_lock_count || ' session(s) blocked on lock waits >5 min*' || E'\n\n';
  END IF;

  -- ── 6. pg_net QUEUE DEPTH — skipped under connection pressure ─────────────
  IF NOT v_conn_pressure THEN
    SELECT COUNT(*) INTO v_queue_depth FROM net.http_request_queue;
    IF v_queue_depth > 50 THEN
      v_alerts := v_alerts || ':warning: *HIGH — pg_net queue depth: ' || v_queue_depth || ' pending requests*' || E'\n\n';
    END IF;
  END IF;

  -- ── 7. pg_net HTTP FAILURES (last 10 min) — skipped under connection pressure ──
  IF NOT v_conn_pressure THEN
    SELECT COUNT(*) INTO v_net_fail_count
    FROM net._http_response
    WHERE status_code >= 400 AND created > NOW() - INTERVAL '10 minutes';

    IF v_net_fail_count > 5 THEN
      v_alerts := v_alerts || ':warning: *HIGH — ' || v_net_fail_count || ' Edge Function HTTP errors (4xx/5xx) in last 10 min*' || E'\n\n';
    END IF;
  END IF;

  -- ── 8. DISK USAGE ────────────────────────────────────────────────────────
  SELECT pg_database_size('postgres') INTO v_db_bytes;
  v_db_gb := ROUND(v_db_bytes::NUMERIC / 1073741824, 2);

  IF v_db_gb >= 2.0 THEN
    v_severity := 'critical';
    v_alerts := v_alerts || ':red_circle: *CRITICAL — Database size ' || v_db_gb || ' GB* — at or beyond free plan limit (2 GB), writes may fail' || E'\n\n';
  ELSIF v_db_gb >= 1.5 THEN
    v_alerts := v_alerts || ':warning: *HIGH — Database size ' || v_db_gb || ' GB* — approaching 2 GB free plan limit' || E'\n\n';
  END IF;

  -- ── 9. STATEMENT TIMEOUT SPIKE — skipped under connection pressure ────────
  IF NOT v_conn_pressure THEN
    SELECT COALESCE(SUM(calls), 0) INTO v_timeout_now
    FROM pg_stat_statements
    WHERE mean_exec_time >= 58000  -- queries that hit or exceeded the 58s/1min timeout
      AND query NOT ILIKE '%SET statement_timeout%'
      AND query NOT ILIKE '%pg_stat%'
      AND query NOT ILIKE '%cron%';

    SELECT COALESCE(total_timeout_calls, 0) INTO v_timeout_prev
    FROM public._monitor_stmt_snapshot
    ORDER BY captured_at DESC LIMIT 1;

    v_timeout_delta := GREATEST(v_timeout_now - v_timeout_prev, 0);

    -- Update snapshot
    INSERT INTO public._monitor_stmt_snapshot (total_timeout_calls) VALUES (v_timeout_now);
    DELETE FROM public._monitor_stmt_snapshot
    WHERE captured_at < NOW() - INTERVAL '2 hours';

    IF v_timeout_delta >= 5 THEN
      v_alerts := v_alerts || ':warning: *HIGH — ' || v_timeout_delta || ' statement timeouts in last 10 min* — queries are hitting the timeout limit' || E'\n\n';
    END IF;
  END IF;

  -- ── 10. REPLICATION SLOT HEALTH ──────────────────────────────────────────
  SELECT COUNT(*) INTO v_slot_inactive
  FROM pg_replication_slots
  WHERE active = false;

  SELECT ROUND(MAX(GREATEST(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn), 0))::NUMERIC / 1048576, 1)
  INTO v_slot_lag_mb
  FROM pg_replication_slots
  WHERE active = true;

  IF v_slot_inactive > 0 THEN
    v_severity := 'critical';
    v_alerts := v_alerts || ':red_circle: *CRITICAL — ' || v_slot_inactive || ' replication slot(s) inactive* — WAL will accumulate and fill disk' || E'\n\n';
  END IF;

  IF v_slot_lag_mb > 100 THEN
    v_alerts := v_alerts || ':warning: *HIGH — Replication lag ' || v_slot_lag_mb || ' MB* — Realtime may be delayed' || E'\n\n';
  END IF;

  -- ── SEND TO SLACK ─────────────────────────────────────────────────────────
  IF v_alerts <> '' THEN
    PERFORM net.http_post(
      url := v_slack_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'text',
        CASE WHEN v_severity = 'critical'
          THEN ':rotating_light: *SUPABASE DB — CRITICAL ALERT* :rotating_light:'
          ELSE ':large_yellow_circle: *SUPABASE DB — HIGH PRIORITY ALERT*'
        END
        || E'\n\n' || v_alerts
        || '_' || NOW()::TEXT || '_'
      )::jsonb
    );
  END IF;

END;
$function$;
