-- ═════════════════════════════════════════════════════════════════════════════
-- BEFORE DIAGNOSTICS — Run these BEFORE applying any migrations.
-- Save the output. Compare against diagnostics_after.sql to measure improvement.
-- ═════════════════════════════════════════════════════════════════════════════
-- Timestamp this baseline:
SELECT now() AS baseline_captured_at;


-- ─── 1. CONNECTION BLOAT ─────────────────────────────────────────────────────
-- Healthy: total ≪ plan limit (Micro=60, Small=200, Pro=400).
-- Broken indicator: many rows with state='idle in transaction' or
--   application_name='PostgREST' flooding the pool.
-- What to look for:
--   • idle_in_tx > 5 → sessions are holding locks, blocking VACUUM
--   • realtime_listeners high → frontend not calling unsubscribe()
--   • total near plan limit → connection pool exhausted, new queries queue

SELECT
  state,
  application_name,
  count(*)                               AS session_count,
  max(now() - state_change)              AS longest_idle,
  count(*) FILTER (
    WHERE (now() - state_change) > interval '5 minutes'
  )                                      AS over_5min
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state, application_name
ORDER BY session_count DESC;

-- Quick total vs plan limit
SELECT
  count(*)                                 AS total_connections,
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle')   AS idle,
  count(*) FILTER (WHERE state LIKE 'idle in transaction%') AS idle_in_tx
FROM pg_stat_activity
WHERE backend_type = 'client backend';


-- ─── 2. WAL LAG (replication slot pressure) ──────────────────────────────────
-- Healthy: wal_lag_size < 50 MB, active = true.
-- Broken indicator: inactive slot with hundreds of MB lag means the Realtime
--   server pod crashed and left a stale slot. Postgres cannot reclaim WAL
--   segments behind this slot → disk fills → DB goes Unhealthy.
-- What to look for:
--   • active = false AND wal_lag_bytes > 50 MB → stale slot, drop it
--   • wal_lag_bytes growing steadily → WAL production rate exceeds consumer speed
--     (REPLICA IDENTITY FULL on hot tables is the most common cause)

SELECT
  slot_name,
  plugin,
  active,
  active_pid,
  pg_size_pretty(
    pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
  )                                        AS wal_lag_size,
  pg_wal_lsn_diff(
    pg_current_wal_lsn(), restart_lsn
  )                                        AS wal_lag_bytes,
  temporary
FROM pg_replication_slots
ORDER BY wal_lag_bytes DESC NULLS LAST;

-- Show current WAL directory total size for comparison baseline
SELECT pg_size_pretty(sum(size)) AS wal_dir_total FROM pg_ls_waldir();


-- ─── 3. ACTIVE CPU LOAD — what is the DB actually doing right now ─────────────
-- Healthy: realtime.list_changes queries complete in <100ms.
-- Broken indicator: list_changes rows with duration > 1s mean the DB is reading
--   massive WAL segments per subscription cycle. Root causes:
--   (a) REPLICA IDENTITY FULL → each UPDATE writes entire row to WAL
--   (b) Too many active subscriptions (client leak — components not unsubscribing)
--   (c) Stale slot forcing Postgres to retain old WAL segments for a dead reader
-- What to look for:
--   • list_changes appearing repeatedly → one user is generating too many events
--   • mark_conversation_read appearing → read receipts are not debounced
--   • pg_available_extensions appearing → Supabase Dashboard Extensions tab is open

SELECT
  pid,
  round(extract(epoch from (now() - query_start))::numeric, 2) AS seconds,
  state,
  left(query, 120)       AS query_snippet,
  wait_event_type,
  wait_event,
  application_name
FROM pg_stat_activity
WHERE state <> 'idle'
  AND pid <> pg_backend_pid()
ORDER BY seconds DESC NULLS LAST
LIMIT 30;

-- Show REPLICA IDENTITY status on hot chat tables (expect 'f' = FULL before fix)
SELECT
  c.relname AS table_name,
  CASE c.relreplident
    WHEN 'd' THEN 'DEFAULT ← healthy'
    WHEN 'f' THEN 'FULL ← WAL-heavy, fix needed'
    WHEN 'i' THEN 'INDEX'
    WHEN 'n' THEN 'NOTHING'
  END AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('trip_messages','trip_conversations','network_messages','network_conversations')
ORDER BY c.relname;

-- Count active Realtime subscriptions per entity + filter tuple
-- (filters is realtime.user_defined_filter[], not jsonb — use unnest.)
-- Healthy: modest counts. Broken: huge counts = client leak
SELECT
  s.entity::text      AS entity_table,
  f.column_name,
  f.op::text          AS op,
  f.value             AS filter_value,
  count(*)            AS subscriber_count
FROM realtime.subscription s,
     LATERAL unnest(s.filters) AS f
GROUP BY 1, 2, 3, 4
ORDER BY subscriber_count DESC
LIMIT 20;
