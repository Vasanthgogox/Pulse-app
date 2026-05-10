-- ═════════════════════════════════════════════════════════════════════════════
-- AFTER DIAGNOSTICS — Run these AFTER applying all migrations and deploying
-- the React batching + debounce changes. Compare output to diagnostics_before.sql.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT now() AS validation_captured_at;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION A: STRESS TEST — simulate 50 messages/sec for 10 seconds (500 total)
-- ─────────────────────────────────────────────────────────────────────────────
-- PURPOSE: Verify the DB remains stable under message burst load after fixes.
-- HOW: Inserts 500 messages into a test conversation bypassing the app.
--      Realtime will broadcast all 500 to connected clients. Watch CPU in
--      Supabase Dashboard during the test — it should stay <30%.
--
-- SETUP: Replace the UUIDs below with real values from your DB.
--        Find a test trip_conversation.id via:
--          SELECT id, party_name FROM trip_conversations LIMIT 5;
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── A1. Create the stress-test function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stress_test_chat_messages(
  p_conversation_id  uuid,
  p_organization_id  uuid,
  p_message_count    int     DEFAULT 500,
  p_batch_size       int     DEFAULT 10,
  p_batch_delay_ms   int     DEFAULT 20
)
RETURNS TABLE (
  messages_inserted  int,
  elapsed_ms         numeric,
  avg_insert_ms      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start    timestamptz := clock_timestamp();
  v_inserted int := 0;
  v_batch    int;
  v_i        int;
BEGIN
  -- Insert in batches to simulate bursty traffic (not one giant transaction).
  v_batch := 0;
  WHILE v_inserted < p_message_count LOOP
    v_i := 0;
    WHILE v_i < p_batch_size AND v_inserted < p_message_count LOOP
      INSERT INTO public.trip_messages (
        conversation_id,
        organization_id,
        sender_user_id,
        sender_role,
        sender_name,
        content,
        message_type,
        is_read,
        created_at
      ) VALUES (
        p_conversation_id,
        p_organization_id,
        NULL,
        'system',
        'StressTest',
        format('Stress test message %s of %s at %s',
               v_inserted + 1, p_message_count, clock_timestamp()::text),
        'system',
        TRUE,
        clock_timestamp()
      );
      v_inserted := v_inserted + 1;
      v_i := v_i + 1;
    END LOOP;

    v_batch := v_batch + 1;
    -- Simulate 50 msg/sec: 10 msgs per batch, 20ms between batches = 500 msg/s
    -- Adjust p_batch_delay_ms to target different rates.
    IF v_inserted < p_message_count THEN
      PERFORM pg_sleep(p_batch_delay_ms::float / 1000.0);
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    v_inserted,
    round(extract(epoch from (clock_timestamp() - v_start)) * 1000, 1),
    round(
      extract(epoch from (clock_timestamp() - v_start)) * 1000
      / NULLIF(v_inserted, 0), 2
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.stress_test_chat_messages(uuid, uuid, int, int, int)
  TO authenticated;

-- ─── A2. Run the stress test ──────────────────────────────────────────────────
-- REPLACE the UUIDs with real values from your DB before running.
-- During execution: watch Supabase Dashboard → Database → CPU.
-- Expected AFTER fix: CPU stays <30%, no "Unhealthy" alert.
-- Expected BEFORE fix: CPU spikes to 80-100%, realtime.list_changes visible
--   in pg_stat_activity for seconds at a time.
--
-- SELECT * FROM public.stress_test_chat_messages(
--   '00000000-0000-0000-0000-000000000000',  -- replace: conversation id
--   '00000000-0000-0000-0000-000000000001',  -- replace: organization id
--   500,   -- total messages
--   10,    -- batch size
--   20     -- ms delay between batches (20ms = ~50 msg/sec)
-- );
--
-- ─── A3. Clean up stress test messages ───────────────────────────────────────
-- Run after the test to remove synthetic data.
-- DELETE FROM public.trip_messages
-- WHERE sender_name = 'StressTest'
--   AND sender_role = 'system';


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION B: EXPECTED STATE AFTER FIX — what pg_stat_activity should show
-- ═════════════════════════════════════════════════════════════════════════════

-- B1. Connection count — should be stable, no growth during message burst
SELECT
  state,
  application_name,
  count(*) AS session_count,
  max(now() - state_change) AS longest_idle
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state, application_name
ORDER BY session_count DESC;

-- Expected AFTER fix:
--   • idle_in_transaction = 0 (killed by kill_idle_in_transaction_sessions cron)
--   • realtime connections = 1 per active org (not 1 per component)
--   • total stable at: PostgREST pool (5-10) + Realtime (1-2) + app (1-3 per user)


-- B2. Long-running queries — realtime.list_changes should be fast
SELECT
  round(extract(epoch from (now() - query_start))::numeric, 3) AS seconds,
  state,
  left(query, 100) AS query_snippet
FROM pg_stat_activity
WHERE state <> 'idle'
  AND pid <> pg_backend_pid()
  AND (now() - query_start) > interval '100ms'
ORDER BY seconds DESC;

-- Expected AFTER fix:
--   • realtime.list_changes: <50ms (was seconds before REPLICA IDENTITY DEFAULT)
--   • mark_conversation_read: appears rarely (was every message open before debounce)
--   • pg_available_extensions: ABSENT (was appearing from Dashboard polling)


-- B3. WAL lag — should be small and stable
SELECT
  slot_name,
  active,
  pg_size_pretty(
    pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
  ) AS wal_lag_size
FROM pg_replication_slots
ORDER BY pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) DESC NULLS LAST;

-- Expected AFTER fix:
--   • active = true (no stale slots)
--   • wal_lag_size < 10 MB during normal operation (was 50-500 MB before)
--   • Lag does not grow during stress test (WAL consumer catches up)


-- B4. REPLICA IDENTITY confirmation — all chat tables should be DEFAULT
SELECT
  c.relname AS table_name,
  CASE c.relreplident
    WHEN 'd' THEN 'DEFAULT ✓'
    WHEN 'f' THEN 'FULL ✗ migration not applied'
  END AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'trip_messages','trip_conversations',
    'network_messages','network_conversations'
  )
ORDER BY c.relname;


-- B5. Index usage on hot chat queries — should show Index Scans (not Seq Scans)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan   AS index_scans,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename IN ('trip_messages','trip_conversations')
  AND indexname LIKE 'idx_%'
ORDER BY idx_scan DESC;

-- Expected AFTER fix:
--   idx_trip_messages_conv_created_desc: highest scan count (getMessagesByConversation)
--   idx_trip_messages_mark_read: growing scan count (mark_conversation_read RPC)
--   idx_trip_messages_org_created: moderate (org-scoped queries)
--   If idx_scan = 0 after 24h of traffic: that index is not being used — drop it.


-- B6. Realtime subscriptions — should be 1 per org, not 1 per component
SELECT
  filters->>'table'  AS table_name,
  filters->>'filter' AS filter_condition,
  count(*)           AS subscriber_count
FROM realtime.subscription,
     jsonb_array_elements(filters) AS filters
GROUP BY 1, 2
ORDER BY subscriber_count DESC;

-- Expected AFTER fix:
--   subscriber_count = 1 for each (table_name, filter_condition) pair.
--   If > 1: a component is mounting without sharing the channel via realtimeRegistry.
