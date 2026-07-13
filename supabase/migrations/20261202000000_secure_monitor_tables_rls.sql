-- Lock down internal health-monitor tables flagged by the Supabase linter
-- (rls_disabled_in_public / pg_graphql_anon_table_exposed).
--
-- These tables are written only by SECURITY DEFINER functions
-- (run_db_health_monitor, run_monitor_watchdog), which execute as the table
-- owner and bypass RLS. No client role should read or write them, so we enable
-- RLS with no policies (default-deny) and revoke all grants from anon/authenticated.

-- _monitor_watchdog_state
ALTER TABLE public._monitor_watchdog_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._monitor_watchdog_state FROM anon, authenticated;

-- _monitor_net_fail_snapshot
ALTER TABLE public._monitor_net_fail_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._monitor_net_fail_snapshot FROM anon, authenticated;
