# DB Performance Hardening Checklist

This checklist is based on live `pg_stat_statements` and table stats from the linked Supabase project.

## What we observed

- Connection count is low and stable; unhealthy periods are not caused by max connections.
- Resource spikes align more with expensive read patterns (chat/trips) and repeated metadata/introspection queries.
- RLS-heavy tables (`trip_messages`, `trips`) are hot paths, so missing support indexes amplify CPU.

## Immediate actions (today)

- Run the SQL patch: `scripts/sql/db_perf_hardening_patch.sql`.
- Temporarily lower non-critical snapshot jobs frequency (for example `ops.capture_db_health_snapshot()` cadence) during incident windows.
- Keep driver location writes at 3-minute interval (already adjusted).

## App query/realtime actions (this repo)

- **Trip chat refresh storm protection**
  - `features/chat/contexts/TripChatContext.tsx` now uses debounced refresh for focused realtime inserts.
- **Avoid full-list reloads on every message event**
  - Prefer incremental state updates for unread counters and preview text.
  - Only hydrate missing conversations on demand, then batch refresh once.
- **Pagination guardrails**
  - Always bound thread/history reads (`limit`, cursor/range based pagination).
  - Do not fetch full nested message arrays for background badge updates.
- **Subscription hygiene**
  - Use one org-scoped subscription per screen mode.
  - Unsubscribe immediately on blur/unmount and avoid duplicate subscriptions across tabs.

## Post-deploy validation queries

Run these after shipping fixes and compare against baseline:

```sql
select count(*) filter (where state='active') as active_sessions,
       count(*) filter (where wait_event_type is not null) as waiting_sessions,
       count(*) as total_sessions
from pg_stat_activity
where datname=current_database();
```

```sql
select calls,
       round(total_exec_time::numeric,2) as total_ms,
       round(mean_exec_time::numeric,2) as mean_ms,
       left(query,160) as query_sample
from pg_stat_statements
where dbid = (select oid from pg_database where datname=current_database())
order by total_exec_time desc
limit 20;
```

```sql
select schemaname,
       relname as table_name,
       seq_scan,
       idx_scan,
       n_live_tup,
       n_dead_tup
from pg_stat_user_tables
order by n_dead_tup desc
limit 20;
```

## Success criteria

- p95 read/query latency down during peak windows.
- Fewer CPU spike bursts in Grafana during chat-heavy usage.
- No unhealthy flips during routine traffic.
- `pg_stat_statements` top total time shifts away from trip/chat list fetches.
