-- Observability schema: DB health snapshots, slow query log, realtime channel count.
-- All objects use IF NOT EXISTS / CREATE OR REPLACE — safe to run on projects where
-- ops schema already exists from a prior deployment.

CREATE SCHEMA IF NOT EXISTS ops;

-- ── DB health snapshots ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.db_health_snapshots (
  id              bigserial PRIMARY KEY,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  total_conns     int,
  active_conns    int,
  idle_conns      int,
  long_queries    int,    -- queries running >30s
  lock_waiters    int,
  realtime_conns  int,    -- connections with application_name like '%realtime%'
  top_query       text,   -- truncated to 300 chars
  top_dur_ms      numeric -- duration of top_query in ms
);

CREATE INDEX IF NOT EXISTS idx_db_health_snapshots_captured
  ON ops.db_health_snapshots(captured_at DESC);

-- Keep only last 7 days of snapshots (rolling window)
CREATE OR REPLACE FUNCTION ops.trim_health_snapshots() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
BEGIN
  DELETE FROM ops.db_health_snapshots
  WHERE captured_at < now() - interval '7 days';
END;
$$;

-- ── Slow query log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.slow_query_log (
  id              bigserial PRIMARY KEY,
  logged_at       timestamptz NOT NULL DEFAULT now(),
  duration_ms     numeric NOT NULL,
  query_text      text,   -- first 500 chars
  calls           bigint,
  total_ms        numeric,
  rows            bigint
);

CREATE INDEX IF NOT EXISTS idx_slow_query_log_logged_at
  ON ops.slow_query_log(logged_at DESC);

-- ── Capture DB health snapshot ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ops.capture_db_health_snapshot()
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_total     int;
  v_active    int;
  v_idle      int;
  v_long      int;
  v_lock_wait int;
  v_realtime  int;
  v_top_query text;
  v_top_dur   numeric;
BEGIN
  SELECT count(*) INTO v_total  FROM pg_stat_activity;
  SELECT count(*) INTO v_active FROM pg_stat_activity WHERE state = 'active';
  SELECT count(*) INTO v_idle   FROM pg_stat_activity WHERE state = 'idle';

  SELECT count(*) INTO v_long
  FROM pg_stat_activity
  WHERE state = 'active'
    AND now() - query_start > interval '30 seconds'
    AND query NOT ILIKE 'START_REPLICATION%';

  SELECT count(*) INTO v_lock_wait
  FROM pg_stat_activity WHERE wait_event_type = 'Lock';

  SELECT count(*) INTO v_realtime
  FROM pg_stat_activity
  WHERE application_name ILIKE '%realtime%';

  SELECT left(query, 300), extract(epoch FROM (now() - query_start)) * 1000
  INTO v_top_query, v_top_dur
  FROM pg_stat_activity
  WHERE state = 'active'
    AND query NOT ILIKE 'START_REPLICATION%'
  ORDER BY (now() - query_start) DESC
  LIMIT 1;

  INSERT INTO ops.db_health_snapshots
    (total_conns, active_conns, idle_conns, long_queries, lock_waiters, realtime_conns, top_query, top_dur_ms)
  VALUES
    (v_total, v_active, v_idle, v_long, v_lock_wait, v_realtime, v_top_query, v_top_dur);

  -- Trim old snapshots inline (avoids separate maintenance cron)
  PERFORM ops.trim_health_snapshots();
END;
$$;

REVOKE ALL ON FUNCTION ops.capture_db_health_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.capture_db_health_snapshot() TO service_role;

-- ── Capture slow queries from pg_stat_statements ──────────────────────────────
CREATE OR REPLACE FUNCTION ops.capture_slow_queries(p_threshold_ms numeric DEFAULT 500)
  RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_count int := 0;
BEGIN
  -- Only runs if pg_stat_statements is installed
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
  FROM pg_stat_statements
  WHERE mean_exec_time > p_threshold_ms
    AND query NOT ILIKE '%pg_stat%'
    AND query NOT ILIKE 'START_REPLICATION%'
    AND dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  ORDER BY mean_exec_time DESC
  LIMIT 50;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Trim log older than 30 days
  DELETE FROM ops.slow_query_log WHERE logged_at < now() - interval '30 days';

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION ops.capture_slow_queries(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.capture_slow_queries(numeric) TO service_role;

-- ── RPC for app-side observability (authenticated, read-only) ─────────────────
-- Returns last 24h of health snapshots + slow queries >500ms
CREATE OR REPLACE FUNCTION public.get_db_observability_summary()
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_snapshots jsonb;
  v_slow      jsonb;
  v_current   jsonb;
BEGIN
  -- Current live snapshot (point in time)
  SELECT jsonb_build_object(
    'total_conns',    count(*),
    'active_conns',   count(*) FILTER (WHERE state = 'active'),
    'idle_conns',     count(*) FILTER (WHERE state = 'idle'),
    'long_queries',   count(*) FILTER (WHERE state = 'active' AND now() - query_start > interval '30 seconds' AND query NOT ILIKE 'START_REPLICATION%'),
    'realtime_conns', count(*) FILTER (WHERE application_name ILIKE '%realtime%'),
    'captured_at',    now()
  ) INTO v_current
  FROM pg_stat_activity;

  -- Last 24h snapshots (hourly granularity via date_trunc)
  SELECT coalesce(jsonb_agg(s ORDER BY s->>'captured_at' DESC), '[]'::jsonb)
  INTO v_snapshots
  FROM (
    SELECT jsonb_build_object(
      'captured_at', captured_at,
      'total_conns', total_conns,
      'active_conns', active_conns,
      'realtime_conns', realtime_conns,
      'long_queries', long_queries
    ) AS s
    FROM ops.db_health_snapshots
    WHERE captured_at > now() - interval '24 hours'
    ORDER BY captured_at DESC
    LIMIT 96
  ) sub;

  -- Top 10 slow queries from log
  SELECT coalesce(jsonb_agg(q ORDER BY (q->>'duration_ms')::numeric DESC), '[]'::jsonb)
  INTO v_slow
  FROM (
    SELECT DISTINCT ON (query_text)
      jsonb_build_object(
        'duration_ms', duration_ms,
        'query_text', query_text,
        'calls', calls,
        'logged_at', logged_at
      ) AS q
    FROM ops.slow_query_log
    WHERE logged_at > now() - interval '24 hours'
    ORDER BY query_text, duration_ms DESC
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'current', v_current,
    'snapshots', v_snapshots,
    'slow_queries', v_slow
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_db_observability_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_db_observability_summary() TO authenticated;

-- ── pg_cron jobs ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Health snapshot every 15 minutes
    PERFORM cron.schedule(
      'ops_capture_health',
      '*/15 * * * *',
      $cron$ SELECT ops.capture_db_health_snapshot(); $cron$
    );
    -- Slow query log capture hourly (captures queries >500ms from pg_stat_statements)
    PERFORM cron.schedule(
      'ops_capture_slow_queries',
      '0 * * * *',
      $cron$ SELECT ops.capture_slow_queries(500); $cron$
    );
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron not available, skipping schedule jobs: %', SQLERRM;
END;
$$;

-- Grants for ops schema
GRANT USAGE ON SCHEMA ops TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA ops TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA ops GRANT SELECT ON TABLES TO authenticated;
