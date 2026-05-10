-- ═════════════════════════════════════════════════════════════════════════════
-- DB HEALTH MONITOR — single query, single screen, real-time dashboard
-- Run this repeatedly (F5 in Supabase SQL Editor) to watch recovery in progress.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── OPTION A: Tabular health scorecard ──────────────────────────────────────
-- One metric per row. Status column gives GREEN/YELLOW/RED signal.
-- Run during incident: refresh every 30s to track recovery.

SELECT * FROM (

  -- ── Connections ─────────────────────────────────────────────────────────────
  SELECT
    'Connections: Total'      AS metric,
    count(*)::text            AS value,
    CASE
      WHEN count(*) > 150 THEN 'RED — near plan limit, connection leak likely'
      WHEN count(*) > 80  THEN 'YELLOW — elevated, monitor closely'
      ELSE                     'GREEN'
    END                       AS status
  FROM pg_stat_activity
  WHERE backend_type = 'client backend'

  UNION ALL

  SELECT
    'Connections: Idle-in-Tx',
    count(*)::text,
    CASE
      WHEN count(*) > 10 THEN 'RED — sessions holding locks, blocking VACUUM'
      WHEN count(*) > 3  THEN 'YELLOW — some lock contention possible'
      ELSE                    'GREEN'
    END
  FROM pg_stat_activity
  WHERE state LIKE 'idle in transaction%'
    AND backend_type = 'client backend'

  UNION ALL

  SELECT
    'Connections: Active Queries',
    count(*)::text,
    CASE
      WHEN count(*) > 30 THEN 'RED — DB overwhelmed with concurrent queries'
      WHEN count(*) > 15 THEN 'YELLOW'
      ELSE                    'GREEN'
    END
  FROM pg_stat_activity
  WHERE state = 'active'
    AND pid <> pg_backend_pid()

  UNION ALL

  -- ── WAL / Replication ────────────────────────────────────────────────────────
  SELECT
    'WAL: Max Slot Lag',
    coalesce(
      pg_size_pretty(max(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn))),
      'no slots'
    ),
    CASE
      WHEN max(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) > 500*1024*1024
        THEN 'RED — >500MB lag, disk filling, stale slot likely'
      WHEN max(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) > 50*1024*1024
        THEN 'YELLOW — >50MB lag, monitor slot activity'
      ELSE 'GREEN'
    END
  FROM pg_replication_slots

  UNION ALL

  SELECT
    'WAL: Stale Inactive Slots',
    count(*)::text,
    CASE
      WHEN count(*) > 0 THEN 'RED — ' || count(*) || ' inactive slot(s) retaining WAL; run maintenance_replication_slots.sql Section B'
      ELSE 'GREEN'
    END
  FROM pg_replication_slots
  WHERE active = false
    AND pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) > 10*1024*1024

  UNION ALL

  -- ── Query Performance ────────────────────────────────────────────────────────
  SELECT
    'Queries: Longest Running',
    coalesce(
      round(max(extract(epoch from (now() - query_start)))::numeric, 1)::text || 's',
      '0s'
    ),
    CASE
      WHEN max(extract(epoch from (now() - query_start))) > 30
        THEN 'RED — query running >30s, check pg_stat_activity for lock waits'
      WHEN max(extract(epoch from (now() - query_start))) > 5
        THEN 'YELLOW — query >5s, possible slow list_changes or seq scan'
      ELSE 'GREEN'
    END
  FROM pg_stat_activity
  WHERE state = 'active'
    AND pid <> pg_backend_pid()
    AND query_start IS NOT NULL

  UNION ALL

  SELECT
    'Queries: list_changes active',
    count(*)::text,
    CASE
      WHEN count(*) > 5  THEN 'RED — >5 concurrent realtime scans, WAL read overload'
      WHEN count(*) > 2  THEN 'YELLOW — check REPLICA IDENTITY and subscription count'
      ELSE 'GREEN'
    END
  FROM pg_stat_activity
  WHERE state = 'active'
    AND query ILIKE '%list_changes%'

  UNION ALL

  -- ── Table Bloat (VACUUM health) ──────────────────────────────────────────────
  SELECT
    'Bloat: trip_messages dead rows',
    coalesce(n_dead_tup::text, '0'),
    CASE
      WHEN n_dead_tup > 100000 THEN 'RED — >100K dead tuples, VACUUM blocked (idle-in-tx?)'
      WHEN n_dead_tup > 10000  THEN 'YELLOW — autovacuum lagging behind INSERT/UPDATE rate'
      ELSE 'GREEN'
    END
  FROM pg_stat_user_tables
  WHERE relname = 'trip_messages'

  UNION ALL

  -- ── REPLICA IDENTITY ─────────────────────────────────────────────────────────
  SELECT
    'Schema: trip_messages REPLICA IDENTITY',
    CASE relreplident
      WHEN 'd' THEN 'DEFAULT'
      WHEN 'f' THEN 'FULL'
      ELSE relreplident::text
    END,
    CASE relreplident
      WHEN 'd' THEN 'GREEN — minimal WAL per UPDATE'
      WHEN 'f' THEN 'RED — full row in WAL per UPDATE, apply migration 20260525140000'
      ELSE           'YELLOW — check migration status'
    END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'trip_messages'

  UNION ALL

  -- ── Realtime subscription density ────────────────────────────────────────────
  SELECT
    'Realtime: Max subscribers per filter',
    coalesce(max(sub_count)::text, '0'),
    CASE
      WHEN max(sub_count) > 3 THEN 'RED — components subscribing without sharing channel (useChat hook not used)'
      WHEN max(sub_count) > 1 THEN 'YELLOW — possible duplicate subscriptions'
      ELSE 'GREEN'
    END
  FROM (
    SELECT count(*) AS sub_count
    FROM realtime.subscription,
         jsonb_array_elements(filters) AS f
    GROUP BY f->>'table', f->>'filter'
  ) sub_counts

) health_check
ORDER BY
  CASE
    WHEN status LIKE 'RED%'    THEN 1
    WHEN status LIKE 'YELLOW%' THEN 2
    ELSE 3
  END,
  metric;


-- ─── OPTION B: Single-row numeric snapshot ───────────────────────────────────
-- For scripted monitoring or a quick single-number pulse check.
-- Lower is better for all values except (no threshold applies to wal_lag_mb separately).

SELECT
  (SELECT count(*) FROM pg_stat_activity
   WHERE backend_type = 'client backend')                                 AS total_connections,
  (SELECT count(*) FROM pg_stat_activity
   WHERE state LIKE 'idle in transaction%')                               AS idle_in_tx,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'
   AND pid <> pg_backend_pid())                                           AS active_queries,
  (SELECT coalesce(round(max(
     pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
   ) / 1024.0 / 1024.0, 1), 0)
   FROM pg_replication_slots)                                             AS max_wal_lag_mb,
  (SELECT count(*) FROM pg_replication_slots WHERE active = false
   AND pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) > 10*1024*1024) AS stale_slots,
  (SELECT coalesce(n_dead_tup, 0) FROM pg_stat_user_tables
   WHERE relname = 'trip_messages')                                       AS trip_messages_dead_tup,
  (SELECT count(*) FROM pg_stat_activity WHERE query ILIKE '%list_changes%'
   AND state = 'active')                                                  AS active_list_changes,
  now()                                                                   AS checked_at;
