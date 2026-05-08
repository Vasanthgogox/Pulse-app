-- Chat outage hardening for Supabase Nano.
--
-- Run from Supabase SQL Editor, or with:
--   supabase db query --linked -f scripts/sql/chat_outage_hardening.sql -o table
--
-- Goals:
-- 1) Remove the failing dashboard materialized-view cron from the hot path.
-- 2) Ensure chat read/write support indexes exist.
-- 3) Provide verification queries for pg_stat_statements and cron state.

-- Priority 1: stop the scheduled dashboard refresh that timed out during chat load.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'refresh-dashboard';
  end if;
end $$;

-- Priority 2: make chat hot paths index-friendly.
-- These are safe/idempotent. In Supabase SQL Editor, run each CREATE INDEX
-- statement outside an explicit transaction if CONCURRENTLY is rejected.
create index concurrently if not exists idx_trip_messages_conversation_created_desc
  on public.trip_messages (conversation_id, created_at desc);

create index concurrently if not exists idx_trip_messages_org_created_desc
  on public.trip_messages (organization_id, created_at desc);

create index concurrently if not exists idx_trip_conversations_org_last_message
  on public.trip_conversations (organization_id, last_message_at desc nulls last);

create index concurrently if not exists idx_trip_conversations_driver_last_message
  on public.trip_conversations (driver_id, last_message_at desc nulls last)
  where driver_id is not null;

-- Verification: cron must return zero rows for refresh-dashboard.
select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'refresh-dashboard';

-- Verification: recent chat/API pressure after the next load test.
select
  calls,
  round(total_exec_time::numeric, 2) as total_ms,
  round(mean_exec_time::numeric, 2) as mean_ms,
  rows,
  left(query, 300) as query
from extensions.pg_stat_statements
where query ilike '%trip_messages%'
   or query ilike '%trip_conversations%'
   or query ilike '%send_trip_chat_message%'
   or query ilike '%refresh_dashboard_metrics_safe%'
order by total_exec_time desc
limit 30;
