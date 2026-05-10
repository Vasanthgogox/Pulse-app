-- ─────────────────────────────────────────────────────────────────────────────
-- Replication Slot Maintenance Script
--
-- Run in Supabase SQL Editor when the DB shows "Unhealthy" status or when
-- Storage is growing unexpectedly. Stale slots accumulate WAL on disk because
-- Postgres cannot reclaim segments that a slot has not yet consumed.
--
-- Usage:
--   Step 1 — Run Section A to diagnose. Examine output before dropping anything.
--   Step 2 — Run Section B to drop only confirmed-stale slots (inactive, high lag).
--   Step 3 — Re-run Section A to confirm cleanup.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── A. DIAGNOSE ─────────────────────────────────────────────────────────────

-- A1. All replication slots: activity, lag, and WAL retained
SELECT
  slot_name,
  plugin,
  slot_type,
  active,
  active_pid,
  -- pg_wal_lsn_diff gives bytes behind current WAL position (lag)
  pg_size_pretty(
    pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
  )                                AS wal_lag_size,
  pg_wal_lsn_diff(
    pg_current_wal_lsn(), restart_lsn
  )                                AS wal_lag_bytes,
  restart_lsn,
  confirmed_flush_lsn,
  temporary
FROM pg_replication_slots
ORDER BY wal_lag_bytes DESC NULLS LAST;


-- A2. Total WAL disk usage (ballpark — includes all segments, not just slot lag)
SELECT pg_size_pretty(sum(size)) AS wal_directory_size
FROM pg_ls_waldir();


-- A3. Active Realtime subscriptions (what the server is watching)
-- Shows how many postgres_changes channels are alive.
-- High counts here correlate directly with list_changes CPU load.
SELECT
  channel,
  extension,
  insert,
  update,
  delete,
  truncate,
  filters,
  created_at
FROM realtime.subscription
ORDER BY created_at DESC
LIMIT 50;


-- A4. Current long-running queries (spot realtime.list_changes if it's hot)
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
  AND state <> 'idle'
ORDER BY duration DESC;


-- A5. Table-level WAL amplification check: how many UPDATEs vs INSERTs
-- on the hot chat tables since last stats reset.
SELECT
  relname                       AS table_name,
  n_tup_ins                     AS inserts,
  n_tup_upd                     AS updates,
  n_tup_del                     AS deletes,
  n_tup_hot_upd                 AS hot_updates,   -- HOT = no index update, cheaper
  CASE WHEN n_tup_upd > 0
    THEN round(n_tup_hot_upd::numeric / n_tup_upd * 100, 1)
    ELSE 0
  END                           AS hot_update_pct,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE relname IN (
  'trip_messages', 'trip_conversations',
  'network_messages', 'network_conversations',
  'transactions', 'trips'
)
ORDER BY n_tup_upd DESC;


-- A6. Confirm REPLICA IDENTITY is now DEFAULT on chat tables
-- (run after applying 20260525140000_replica_identity_default_chat.sql)
SELECT
  c.relname      AS table_name,
  CASE c.relreplident
    WHEN 'd' THEN 'DEFAULT (pk only)'
    WHEN 'f' THEN 'FULL (entire row) ← WAL heavy'
    WHEN 'i' THEN 'INDEX'
    WHEN 'n' THEN 'NOTHING'
  END            AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'trip_messages', 'trip_conversations',
    'network_messages', 'network_conversations'
  )
ORDER BY c.relname;


-- ─── B. DROP STALE SLOTS ─────────────────────────────────────────────────────
-- WARNING: Only drop a slot if:
--   • active = false  (no process is consuming it)
--   • wal_lag_bytes is large (slot is holding WAL hostage)
--   • You are certain the consumer (Realtime server) has reconnected and
--     created a fresh slot, OR the old Realtime pod is fully dead.
--
-- Dropping an active slot will disconnect the Realtime server abruptly.
-- Supabase Realtime will reconnect and create a new slot automatically.

-- B1. Preview: stale candidates (inactive + >100 MB lag)
SELECT
  slot_name,
  active,
  pg_size_pretty(
    pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
  ) AS wal_lag_size
FROM pg_replication_slots
WHERE active = false
  AND pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) > 100 * 1024 * 1024;


-- B2. Drop a specific stale slot — replace 'supabase_realtime_slot' with
-- the actual slot_name from section A1 output.
-- UNCOMMENT ONLY AFTER REVIEWING A1 OUTPUT.
--
-- SELECT pg_drop_replication_slot('supabase_realtime_slot');


-- B3. Bulk-drop ALL inactive slots with >500 MB lag (nuclear option).
-- Review the SELECT output before uncommenting the DELETE form.
--
-- SELECT statement (safe — read-only preview):
SELECT
  slot_name,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag
FROM pg_replication_slots
WHERE active = false
  AND pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) > 500 * 1024 * 1024;
--
-- Action form — UNCOMMENT ONLY WHEN CERTAIN:
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN
--     SELECT slot_name FROM pg_replication_slots
--     WHERE active = false
--       AND pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) > 500 * 1024 * 1024
--   LOOP
--     RAISE NOTICE 'Dropping stale slot: %', r.slot_name;
--     PERFORM pg_drop_replication_slot(r.slot_name);
--   END LOOP;
-- END;
-- $$;


-- ─── C. IDLE-IN-TRANSACTION SESSIONS ────────────────────────────────────────
-- Sessions stuck "idle in transaction" hold row locks and block VACUUM.
-- VACUUM can't reclaim dead rows while a lock is held — table bloat → seq
-- scans → CPU spikes. These sessions are the #2 cause of "Unhealthy" after
-- WAL pressure.

-- C1. Preview sessions eligible for termination (>5 min threshold)
SELECT
  pid,
  usename,
  application_name,
  now() - state_change                AS idle_duration,
  left(query, 200)                    AS last_query,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND (now() - state_change) > interval '5 minutes'
ORDER BY idle_duration DESC;

-- C2. Run the killer function (safe — uses pg_terminate_backend, not pg_cancel_backend)
-- Requires migration 20260525150000 to be applied first.
SELECT * FROM public.kill_idle_in_transaction_sessions('5 minutes');

-- C3. Table bloat check: high n_dead_tup means VACUUM is being blocked
SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  CASE WHEN n_live_tup > 0
    THEN round(n_dead_tup::numeric / (n_live_tup + n_dead_tup) * 100, 1)
    ELSE 0
  END AS dead_pct,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE relname IN ('trip_messages', 'trip_conversations', 'transactions', 'trips')
ORDER BY dead_pct DESC;


-- ─── D. REALTIME SUBSCRIPTION AUDIT ─────────────────────────────────────────
-- If realtime.list_changes is still hot after dropping stale slots,
-- the issue is too many active subscriptions (client leak).
-- This query shows duplicate subscriptions for the same table+filter.

SELECT
  filters->>'event'   AS event,
  filters->>'table'   AS table_name,
  filters->>'filter'  AS filter_condition,
  count(*)            AS subscriber_count,
  min(created_at)     AS oldest,
  max(created_at)     AS newest
FROM realtime.subscription,
     jsonb_array_elements(filters) AS filters
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY subscriber_count DESC;

-- Healthy: one subscriber per org per table filter.
-- Unhealthy: many subscribers for same filter = frontend subscription leak
--   (component unmounting without calling channel.unsubscribe()).
--
-- ─── E. DIAGNOSTIC CHECKLIST (Supabase Dashboard) ────────────────────────────
-- After applying all migrations, verify recovery via these 3 metrics:
--
-- 1. CPU Usage (Database → Usage):
--    Expect: drops from sustained >80% to <30% idle during chat activity.
--    If still high: check Section D above for subscription count > 1 per filter.
--
-- 2. Active Connections (Database → Usage → Connections):
--    Expect: stabilises at (active users × 1 per org) + PostgREST pool.
--    If growing unbounded: frontend is not calling channel.unsubscribe() —
--    check realtimeRegistry TEARDOWN_GRACE_MS and clearAllRealtimeChannels().
--
-- 3. WAL Disk Usage (Database → Usage → Disk):
--    Expect: no longer growing monotonically after REPLICA IDENTITY DEFAULT migration.
--    If still growing: a replication slot is stale — run Section B to diagnose.
--
-- 4. pg_stat_activity: realtime.list_changes query duration
--    Run Section A4 during a message burst. Healthy: <100ms. Unhealthy: seconds.
--    Improvement comes from REPLICA IDENTITY DEFAULT (smaller WAL rows to scan)
--    + batched React state updates (fewer optimistic INSERT round-trips).
