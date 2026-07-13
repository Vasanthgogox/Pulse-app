CREATE SCHEMA IF NOT EXISTS ops;
CREATE TABLE IF NOT EXISTS ops.db_health_snapshots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at    timestamptz NOT NULL DEFAULT now(),
  total_conns    int,
  active_conns   int,
  idle_conns     int,
  long_queries   int,
  lock_waiters   int,
  realtime_conns int,
  top_query      text,
  top_dur_ms     numeric
);
