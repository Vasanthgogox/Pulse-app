-- ═════════════════════════════════════════════════════════════════════════════
-- SESSION TIMEOUT GUARDRAILS
--
-- PURPOSE:
-- Prevent "Feedback" and "Image" queries from hanging and holding the DB
-- Unhealthy when a slow client stalls mid-transaction or a runaway query
-- (e.g. storage signed-URL generation, feedback upsert with a lock wait) ties
-- up a backend slot indefinitely.
--
-- SETTINGS:
--
--   statement_timeout = '60s'
--     Any single SQL statement running longer than 60 seconds is cancelled with
--     ERROR 57014 (query_canceled). This caps runaway queries from:
--       – storage.createSignedUrl loops under high load
--       – slow RLS path joins when planner picks a bad plan after stats drift
--       – submit_trip_feedback under lock contention on trip_messages
--
--   idle_in_transaction_session_timeout = '30s'
--     A backend that has started a transaction but goes idle (e.g. the client
--     crashes or network drops mid-request) is terminated after 30 seconds.
--     Idle-in-transaction sessions hold row locks and block VACUUM — the main
--     reason a DB enters Unhealthy. This is more aggressive than the 1-min
--     value noted in pg_settings but still safe for all normal operations.
--
-- SCOPE: ALTER ROLE applies the setting to every new connection for that role.
-- Supabase uses the `authenticated` role for all RLS-evaluated queries.
-- `anon` covers unauthenticated PostgREST paths (public read policies).
--
-- NOTE: These settings survive Supabase restarts (stored in pg_db_role_setting).
-- They do NOT affect the Supabase dashboard backend or auth service.
-- ═════════════════════════════════════════════════════════════════════════════

-- Statement timeout: cancel any single query running more than 60 seconds.
ALTER ROLE authenticated SET statement_timeout             = '60s';
ALTER ROLE anon           SET statement_timeout             = '60s';

-- Idle-in-transaction timeout: kill sessions that open a transaction and
-- then go silent for more than 30 seconds.
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE anon           SET idle_in_transaction_session_timeout = '30s';


-- ─── Optional: pg_cron tighter kill schedule ─────────────────────────────────
-- The kill_idle_in_transaction_sessions function (migration 20260525150000)
-- was scheduled every 5 minutes. Now that ALTER ROLE handles new connections,
-- reduce pg_cron to a safety net at 2-minute intervals using a 45s threshold
-- (catches any edge cases from long-lived pre-migration connections).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    PERFORM cron.unschedule('kill_idle_in_tx_sessions')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'kill_idle_in_tx_sessions'
    );

    PERFORM cron.schedule(
      'kill_idle_in_tx_sessions',
      '*/2 * * * *',
      $cron$ SELECT public.kill_idle_in_transaction_sessions('45 seconds') $cron$
    );

    RAISE NOTICE 'pg_cron: kill_idle_in_tx_sessions rescheduled to every 2 min (45s threshold)';
  END IF;
END;
$$;
