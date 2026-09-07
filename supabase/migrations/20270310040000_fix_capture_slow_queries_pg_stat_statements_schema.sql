-- ops.capture_slow_queries() has been failing on every scheduled run since
-- ops_capture_slow_queries was restored in 20270310030000:
--
--   ERROR: relation "pg_stat_statements" does not exist
--
-- Cause: the function's guard (`IF NOT EXISTS (SELECT 1 FROM pg_extension
-- WHERE extname = 'pg_stat_statements')`) checks pg_extension, which is
-- always resolvable via pg_catalog — so it correctly finds the extension
-- registered and proceeds. But the extension itself is installed in the
-- `extensions` schema on this project (confirmed via
-- pg_extension/pg_namespace), while the function's
-- `SET search_path TO 'ops', 'public', 'pg_catalog'` does not include
-- `extensions`. The unqualified `FROM pg_stat_statements` reference in the
-- SELECT therefore fails to resolve.
--
-- Fix: schema-qualify the one reference (`extensions.pg_stat_statements`)
-- instead of widening search_path. No other line changes — same guard, same
-- threshold parameter, same output columns, same 30-day trim, same return
-- value.

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
  FROM extensions.pg_stat_statements
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
