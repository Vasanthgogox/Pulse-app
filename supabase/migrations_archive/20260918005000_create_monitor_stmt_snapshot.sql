-- Table used by the health-monitor cron job (20261120000003) to track
-- pg_stat_statements timeout deltas between runs. Internal/system table,
-- no direct client access — service role / RPCs only.
CREATE TABLE IF NOT EXISTS public._monitor_stmt_snapshot (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  total_timeout_calls BIGINT NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
