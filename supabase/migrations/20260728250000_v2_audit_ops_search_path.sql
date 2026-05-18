-- =============================================================================
-- V2 Audit Fix 6: Pin search_path on SECURITY DEFINER function (SEC-2)
-- ops.capture_db_health_snapshot was missing SET search_path — vulnerable to
-- search_path injection if an attacker can create objects in a schema that
-- appears before ops in the default path.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.capture_db_health_snapshot()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ops, public, pg_catalog
AS $function$
declare
  v_total int;
  v_active int;
  v_idle int;
  v_long int;
  v_lock_waiters int;
  v_realtime int;
  v_top_query text;
  v_top_dur interval;
begin
  select count(*) into v_total from pg_stat_activity;
  select count(*) into v_active from pg_stat_activity where state = 'active';
  select count(*) into v_idle from pg_stat_activity where state = 'idle';

  select count(*) into v_long
  from pg_stat_activity
  where state = 'active'
    and now() - query_start > interval '30 seconds'
    and query not ilike 'START_REPLICATION%';

  select count(*) into v_lock_waiters
  from pg_stat_activity
  where wait_event_type = 'Lock';

  select count(*) into v_realtime
  from pg_stat_activity
  where application_name ilike '%realtime%';

  select left(query, 300), (now() - query_start)
  into v_top_query, v_top_dur
  from pg_stat_activity
  where state = 'active'
    and query not ilike 'START_REPLICATION%'
  order by (now() - query_start) desc
  limit 1;

  insert into ops.db_health_snapshots (
    total_connections,
    active_connections,
    idle_connections,
    long_running_queries,
    lock_waiters,
    realtime_connections,
    top_query,
    top_query_duration,
    notes
  ) values (
    coalesce(v_total, 0),
    coalesce(v_active, 0),
    coalesce(v_idle, 0),
    coalesce(v_long, 0),
    coalesce(v_lock_waiters, 0),
    coalesce(v_realtime, 0),
    v_top_query,
    v_top_dur,
    jsonb_build_object('source', 'pg_stat_activity')
  );
end;
$function$;
