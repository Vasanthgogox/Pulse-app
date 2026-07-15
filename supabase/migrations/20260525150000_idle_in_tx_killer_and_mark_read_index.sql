-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Mark-as-read index optimization
--
-- mark_conversation_read RPC executes:
--   UPDATE trip_messages SET is_read=TRUE, read_at=NOW()
--   WHERE conversation_id = ? AND sender_role <> 'dispatcher' AND is_read = FALSE
--
-- The existing partial index covers (conversation_id, is_read) WHERE is_read=FALSE
-- but the planner still has to filter sender_role after the index lookup.
-- Adding sender_role to the partial index allows an index-range scan that
-- excludes dispatcher rows without a table heap fetch.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trip_messages_mark_read
  ON public.trip_messages (conversation_id, sender_role)
  WHERE is_read = FALSE;

-- organization_id index: supports the realtime filter evaluation on INSERT
-- and any org-scoped analytic queries over trip_messages.
CREATE INDEX IF NOT EXISTS idx_trip_messages_org_created
  ON public.trip_messages (organization_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Idle-in-transaction session killer
--
-- Sessions stuck in "idle in transaction" hold row locks and prevent VACUUM
-- from reclaiming dead tuples, bloating tables and raising CPU for sequential
-- scans. This function terminates any such session older than the threshold.
--
-- Usage:
--   SELECT kill_idle_in_transaction_sessions();          -- default 5 min
--   SELECT kill_idle_in_transaction_sessions('2 min');   -- tighter threshold
--
-- Schedule via pg_cron (if installed):
--   SELECT cron.schedule('kill_idle_tx', '*/5 * * * *',
--     $$SELECT kill_idle_in_transaction_sessions()$$);
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kill_idle_in_transaction_sessions(
  p_threshold interval DEFAULT '5 minutes'
)
RETURNS TABLE (
  pid        int,
  duration   interval,
  query      text,
  terminated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.pid,
    (now() - a.state_change)          AS duration,
    left(a.query, 200)                 AS query,
    pg_terminate_backend(a.pid)        AS terminated
  FROM pg_stat_activity a
  WHERE a.state = 'idle in transaction'
    AND (now() - a.state_change) > p_threshold
    -- Never terminate our own connection or system backends
    AND a.pid <> pg_backend_pid()
    AND a.backend_type = 'client backend';
END;
$$;

GRANT EXECUTE ON FUNCTION public.kill_idle_in_transaction_sessions(interval) TO authenticated;
COMMENT ON FUNCTION public.kill_idle_in_transaction_sessions IS
  'Terminates client sessions idle in transaction beyond threshold (default 5 min). '
  'Run manually or schedule via pg_cron.';


-- ─── Optional: set idle_in_transaction_session_timeout at DB level ────────────
-- This is the PostgreSQL-native alternative: Postgres itself kills idle-in-tx
-- sessions after the timeout. Uncomment and run once if preferred over pg_cron.
-- Note: Supabase managed plans may reset this; verify it persists after restarts.
--
-- ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '5min';


-- ─── Schedule via pg_cron (no-op if pg_cron not installed) ───────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'kill_idle_in_tx_sessions',
      '*/5 * * * *',
      $cron$ SELECT public.kill_idle_in_transaction_sessions('5 minutes') $cron$
    );
    RAISE NOTICE 'pg_cron job scheduled: kill_idle_in_tx_sessions every 5 min';
  ELSE
    RAISE NOTICE 'pg_cron not installed — run kill_idle_in_transaction_sessions() manually or set idle_in_transaction_session_timeout';
  END IF;
END;
$$;
