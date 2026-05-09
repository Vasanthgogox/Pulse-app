-- ============================================================
-- MESSAGING SYSTEM HEALTH VALIDATION
-- Run this entire file in Supabase SQL editor (or psql) after
-- applying migrations 20260509120000 and 20260509130000.
--
-- HOW TO INTERPRET RESULTS:
--   Each section prints PASS / FAIL / INFO rows via RAISE NOTICE
--   or a labelled SELECT. Read the Messages tab in Supabase editor.
--
-- SECTIONS:
--   A. Index existence check
--   B. Function body validation (no longer calls send_trip_chat_message)
--   C. Policy syntax validation (no COALESCE, uses EXISTS)
--   D. Query plan spot-checks (EXPLAIN)
--   E. Index usage stats (pg_stat_user_indexes)
--   F. Before-vs-after operation count model
--   G. Trigger chain timing simulation
--   H. Connection + lock health
--   I. pg_stat_statements slow queries (if extension available)
--   J. Realtime channel count
-- ============================================================

-- ── A. INDEX EXISTENCE CHECK ─────────────────────────────────────────────────
-- Every index listed here was either added by the perf migrations or must not
-- exist (broken_dropped). Any FAIL row means the migration has not been applied.

SELECT
  idx.indexname,
  idx.tablename,
  CASE WHEN idx.indexname IS NOT NULL THEN 'PASS' ELSE 'FAIL — NOT CREATED' END AS status,
  CASE idx.indexname
    WHEN 'idx_trips_org_trip_number'          THEN 'trips(org_id,trip_number) for cross-org mirror lookup'
    WHEN 'idx_drivers_user_id'                THEN 'drivers(user_id) for RLS driver auth'
    WHEN 'idx_org_members_user_id_plain'      THEN 'org_members(user_id) plain — serves queries without status filter'
    WHEN 'idx_trip_conversations_trip_party'  THEN 'trip_conversations(trip_id,party_type) for trigger loop'
    WHEN 'idx_network_messages_conv_unread'   THEN 'network_messages unread filter for bulk mark-read'
    WHEN 'idx_trip_messages_conv_created_desc' THEN 'trip_messages DESC pagination (getMessagesByConversation)'
    WHEN 'idx_network_messages_conv_created_desc' THEN 'network_messages DESC pagination'
    WHEN 'idx_trip_conversations_driver_last_msg' THEN 'trip_conversations driver list sort'
    WHEN 'idx_org_members_user_org_status'    THEN 'org_members covering index (pre-existing, must exist)'
    WHEN 'idx_trip_messages_conv_type'        THEN 'trip_messages (conv_id, message_type, created_at DESC) pre-existing'
    WHEN 'idx_trip_conversations_org'         THEN 'trip_conversations (org_id, last_message_at DESC) pre-existing'
    ELSE '—'
  END AS purpose
FROM (
  VALUES
    ('idx_trips_org_trip_number'),
    ('idx_drivers_user_id'),
    ('idx_org_members_user_id_plain'),
    ('idx_trip_conversations_trip_party'),
    ('idx_network_messages_conv_unread'),
    ('idx_trip_messages_conv_created_desc'),
    ('idx_network_messages_conv_created_desc'),
    ('idx_trip_conversations_driver_last_msg'),
    ('idx_org_members_user_org_status'),
    ('idx_trip_messages_conv_type'),
    ('idx_trip_conversations_org')
) AS expected(indexname)
LEFT JOIN pg_indexes idx
  ON idx.indexname = expected.indexname
  AND idx.schemaname = 'public'
ORDER BY status, expected.indexname;

-- Verify broken index was dropped
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS — broken index removed'
       ELSE 'FAIL — idx_dq_accepted_bidder_indent still exists (unusable predicate)'
  END AS broken_index_check
FROM pg_indexes
WHERE indexname = 'idx_dq_accepted_bidder_indent'
  AND schemaname = 'public';


-- ── B. FUNCTION BODY VALIDATION ──────────────────────────────────────────────

-- B1: fn_post_system_message_to_trip_chats must NOT call send_trip_chat_message
SELECT
  CASE
    WHEN prosrc ILIKE '%send_trip_chat_message%' THEN
      'FAIL — fn_post_system_message_to_trip_chats still delegates to send_trip_chat_message (trigger chain not fixed)'
    WHEN prosrc ILIKE '%INSERT INTO public.trip_messages%' OR prosrc ILIKE '%INSERT INTO trip_messages%' THEN
      'PASS — direct INSERT path confirmed (trigger chain optimised)'
    ELSE
      'UNKNOWN — function body did not match expected patterns'
  END AS trigger_chain_fix,
  left(prosrc, 200) AS body_preview
FROM pg_proc
WHERE proname = 'fn_post_system_message_to_trip_chats'
  AND pronamespace = 'public'::regnamespace
LIMIT 1;

-- B2: fn_broadcast_trip_status_to_chat must contain the no-op guard
SELECT
  CASE
    WHEN prosrc ILIKE '%IS NOT DISTINCT FROM OLD.status%' OR prosrc ILIKE '%NEW.status = OLD.status%' THEN
      'PASS — no-op guard present (same-status updates skip trigger chain)'
    ELSE
      'FAIL — no-op guard missing (every touch-UPDATE still runs full chain)'
  END AS noop_guard_check
FROM pg_proc
WHERE proname = 'fn_broadcast_trip_status_to_chat'
  AND pronamespace = 'public'::regnamespace
LIMIT 1;

-- B3: get_supplier_trip_ids_for_org must have a LIMIT
SELECT
  CASE
    WHEN prosrc ILIKE '%LIMIT%' THEN
      'PASS — LIMIT present (unbounded aggregate fixed)'
    ELSE
      'FAIL — still no LIMIT (large orgs can blow up the IN clause)'
  END AS rpc_limit_check
FROM pg_proc
WHERE proname = 'get_supplier_trip_ids_for_org'
  AND pronamespace = 'public'::regnamespace
LIMIT 1;


-- ── C. POLICY VALIDATION ─────────────────────────────────────────────────────

-- C1: Base policies must use EXISTS, not IN (subquery)
SELECT
  pol.polname,
  CASE
    WHEN poldef ILIKE '%EXISTS%' AND poldef NOT ILIKE '% IN (SELECT%'
      THEN 'PASS — uses EXISTS'
    WHEN poldef ILIKE '% IN (SELECT%'
      THEN 'FAIL — still uses IN (subquery) — forces full materialisation'
    ELSE 'CHECK — manual inspection needed'
  END AS policy_pattern,
  left(poldef, 300) AS policy_preview
FROM (
  SELECT
    p.polname,
    pg_get_expr(p.polqual, p.polrelid) AS poldef
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('trip_conversations', 'trip_messages')
    AND p.polname IN (
      'organization_members_can_manage_trip_conversations',
      'organization_members_can_manage_trip_messages'
    )
) pol;

-- C2: Supplier RLS policies must NOT contain COALESCE(om.status
SELECT
  pol.polname,
  c.relname AS table_name,
  CASE
    WHEN poldef ILIKE '%COALESCE(om.status%' OR poldef ILIKE '%coalesce(om.status%'
      THEN 'FAIL — COALESCE(om.status,...) is non-sargable (blocks index use)'
    WHEN poldef ILIKE '%om.status = ''active''%'
      THEN 'PASS — plain equality (index-friendly)'
    WHEN poldef ILIKE '%om.status IS NULL%'
      THEN 'PASS — OR IS NULL form (index-friendly)'
    ELSE 'INFO — status check not found, verify manually'
  END AS sargability_check,
  left(poldef, 400) AS policy_preview
FROM (
  SELECT
    p.polname,
    p.polrelid,
    pg_get_expr(p.polqual, p.polrelid) AS poldef
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('trip_conversations', 'trip_messages')
    AND p.polname ILIKE '%supplier%'
) pol
JOIN pg_class c ON c.oid = pol.polrelid
ORDER BY pol.polname;


-- ── D. QUERY PLAN SPOT-CHECKS ────────────────────────────────────────────────
-- These show the planner's chosen strategy for key hot-path queries.
-- Replace the placeholder UUIDs with real IDs from your DB for live results.
-- In CI/dev: run after ANALYZE has been called on the tables.

-- D1: Message pagination — should use idx_trip_messages_conv_created_desc
EXPLAIN (FORMAT TEXT, COSTS OFF, BUFFERS OFF)
SELECT id, conversation_id, content, sender_role, created_at
FROM public.trip_messages
WHERE conversation_id = '00000000-0000-0000-0000-000000000001'
ORDER BY created_at DESC
LIMIT 50;

-- D2: Cross-org mirror trip lookup — should use idx_trips_org_trip_number
EXPLAIN (FORMAT TEXT, COSTS OFF, BUFFERS OFF)
SELECT id, organization_id
FROM public.trips
WHERE organization_id = '00000000-0000-0000-0000-000000000002'
  AND trip_number = 'TRP-001'
ORDER BY created_at DESC
LIMIT 1;

-- D3: Driver RLS subquery — should use idx_drivers_user_id
EXPLAIN (FORMAT TEXT, COSTS OFF, BUFFERS OFF)
SELECT 1
FROM public.drivers
WHERE user_id = '00000000-0000-0000-0000-000000000003'
LIMIT 1;

-- D4: Org membership check — should use idx_org_members_user_org_status
EXPLAIN (FORMAT TEXT, COSTS OFF, BUFFERS OFF)
SELECT 1
FROM public.organization_members
WHERE user_id = '00000000-0000-0000-0000-000000000004'
  AND organization_id = '00000000-0000-0000-0000-000000000005'
  AND (status = 'active' OR status IS NULL)
LIMIT 1;

-- D5: Driver conversation list — should use idx_trip_conversations_driver_last_msg
EXPLAIN (FORMAT TEXT, COSTS OFF, BUFFERS OFF)
SELECT id, trip_id, last_message_at
FROM public.trip_conversations
WHERE driver_id = '00000000-0000-0000-0000-000000000006'
ORDER BY last_message_at DESC NULLS LAST;

-- D6: Unread network messages mark-read — should use idx_network_messages_conv_unread
EXPLAIN (FORMAT TEXT, COSTS OFF, BUFFERS OFF)
SELECT id
FROM public.network_messages
WHERE conversation_id = '00000000-0000-0000-0000-000000000007'
  AND is_read_by_other = FALSE;


-- ── E. INDEX USAGE STATISTICS ────────────────────────────────────────────────
-- Run this AFTER a period of real traffic to see which indexes are being hit.
-- idx_scan = 0 after migration means either no traffic yet, or the index
-- is not being selected by the planner (investigate with EXPLAIN ANALYZE).

SELECT
  t.relname AS table_name,
  i.relname AS index_name,
  s.idx_scan          AS scans_since_reset,
  s.idx_tup_read      AS tuples_read,
  s.idx_tup_fetch     AS tuples_fetched,
  pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
  CASE
    WHEN s.idx_scan = 0 AND i.relname NOT LIKE '%pkey%' THEN '⚠ UNUSED — investigate'
    WHEN s.idx_scan > 0 THEN '✓ IN USE'
    ELSE '— primary key / system'
  END AS health
FROM pg_stat_user_indexes s
JOIN pg_class t ON t.oid = s.relid
JOIN pg_class i ON i.oid = s.indexrelid
WHERE t.relname IN (
  'trip_messages', 'trip_conversations', 'network_messages',
  'trips', 'organization_members', 'drivers', 'direct_quotes'
)
ORDER BY
  t.relname,
  s.idx_scan DESC NULLS LAST;


-- ── F. BEFORE-VS-AFTER OPERATION COUNT MODEL ─────────────────────────────────
-- Static model based on actual code audit.
-- N_conv = number of trip conversations; N_linked = those with a linked partner org.
-- Assumptions: 1 driver conv, 1 client conv (linked), 1 supplier conv (linked).
-- Counts every SELECT, INSERT, UPDATE (including trigger UPDATEs).

SELECT
  scenario,
  before_ops,
  after_ops,
  reduction_pct,
  notes
FROM (VALUES
  (
    'Same-status touch-UPDATE (e.g. update trip amounts/notes)',
    33,   -- BEFORE: full chain fires (fn_ensure=7 + EXISTS=1 + loop×3=25)
    0,    -- AFTER: new no-op guard returns immediately
    '100% reduction',
    'Most common write pattern in prod — amounts, updated_at, assigned_by, etc.'
  ),
  (
    'Real status change, 3 conversations (driver + client + supplier both linked)',
    33,   -- BEFORE: fn_ensure(7) + EXISTS(1) + driver(3) + client(11) + supplier(11) = 33
    27,   -- AFTER: fn_ensure(7) + EXISTS(1) + driver(3) + client(8) + supplier(8) = 27
    '18% reduction',
    'Plus: partner_trip lookup now uses index (was full scan). Each non-driver conv -3 ops.'
  ),
  (
    'Terminal status (completed/delivered), 3 conversations',
    39,   -- BEFORE: 33 + feedback loop (3 convs × 2 ops = 6)
    33,   -- AFTER: 27 + feedback loop (same = 6)
    '15% reduction',
    'fn_post_trip_feedback_prompt_to_chats already used direct INSERT — no change there.'
  ),
  (
    'Real status change, 3 convs — source trip fetch redundancy',
    3,    -- BEFORE: SELECT trips called once per non-driver conv = 2 redundant calls
    1,    -- AFTER: SELECT trips called once at top of fn, shared across loop
    '67% fewer trip fetches',
    'With 5 conversations: BEFORE=5 trip fetches, AFTER=1.'
  ),
  (
    'send_trip_chat_message auth-check overhead per call (system role)',
    3,    -- BEFORE: org_members check + driver check + supplier check all evaluate (system bypasses but code still entered)
    0,    -- AFTER: no auth check in direct INSERT path
    '100% reduction',
    'Auth check skipped because fn_post_system_message_to_trip_chats is SECURITY DEFINER + direct INSERT.'
  ),
  (
    'Cross-org mirror trip lookup (per non-driver conv)',
    1,    -- BEFORE: SELECT trips WHERE org_id=? AND trip_number=? — no index = seq scan on trips table
    1,    -- AFTER: same query but now uses idx_trips_org_trip_number (index scan)
    'Same op count, 10–100x faster',
    'Index eliminates full trips table scan. Critical on orgs with 1000+ trips.'
  ),
  (
    'Realtime subscription channels (TripChatContext)',
    2,    -- BEFORE: :background key + :focused key — 2 separate Supabase channels per org
    1,    -- AFTER: single key trip_messages:org:{id}, isActiveRef routes behaviour
    '50% fewer channels',
    'Prevents channel leak during isActive transitions. Shares channel with DriverChatContext.'
  ),
  (
    'ChatScreen: getProfileImageBatch re-fetch trigger',
    'every message',  -- BEFORE: deps=[conversations] — fires on any message in any conv
    'only on new driver join',  -- AFTER: deps=[driverConvIdsKey] stable sorted string
    'Near-zero unnecessary fetches',
    'Eliminates avatar re-fetch waterfall on every incoming message.'
  ),
  (
    'ChatScreen: getRatingsForTrip + hydrateConversationById re-fetch trigger',
    'every incoming message',  -- BEFORE: deps=[selectedConv.messages]
    'once per conversation open',  -- AFTER: selectedConv.messages removed, read via ref
    'Eliminates re-fetch loop',
    'Was triggering cascading updates: message→ratings fetch→hydrate→state update→repeat.'
  )
) AS model(scenario, before_ops, after_ops, reduction_pct, notes);


-- ── G. TRIGGER CHAIN TIMING SIMULATION ───────────────────────────────────────
-- Finds a real trip with conversations and times fn_post_system_message_to_trip_chats.
-- Uses a unique content string so cleanup is surgical — no real data affected.

DO $$
DECLARE
  v_trip_id   UUID;
  v_conv_count INT;
  v_start     TIMESTAMPTZ;
  v_elapsed   INTERVAL;
  v_tag       TEXT := '[VALIDATION-PROBE-' || extract(epoch from now())::bigint || ']';
BEGIN
  -- Find a trip that has at least one conversation
  SELECT tc.trip_id, COUNT(*)
  INTO   v_trip_id, v_conv_count
  FROM   public.trip_conversations tc
  GROUP BY tc.trip_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_trip_id IS NULL THEN
    RAISE NOTICE 'SKIP — no trips with conversations found in this environment';
    RETURN;
  END IF;

  RAISE NOTICE 'TIMING: trip_id=% conversations=%', v_trip_id, v_conv_count;

  v_start := clock_timestamp();

  -- Simulate the new fn_post_system_message_to_trip_chats with a test status
  PERFORM public.fn_post_system_message_to_trip_chats(
    v_trip_id,
    v_tag,
    'validation_probe'
  );

  v_elapsed := clock_timestamp() - v_start;
  RAISE NOTICE 'fn_post_system_message_to_trip_chats: % for % conversations', v_elapsed, v_conv_count;

  -- Count what was actually inserted
  RAISE NOTICE 'Messages inserted: %', (
    SELECT COUNT(*) FROM public.trip_messages WHERE content = v_tag
  );

  -- Clean up — remove every probe message
  DELETE FROM public.trip_messages WHERE content = v_tag;
  RAISE NOTICE 'Probe messages cleaned up.';

EXCEPTION WHEN OTHERS THEN
  -- Always clean up even on error
  DELETE FROM public.trip_messages WHERE content LIKE '[VALIDATION-PROBE-%]';
  RAISE;
END;
$$;


-- ── H. CONNECTION AND LOCK HEALTH ─────────────────────────────────────────────

-- H1: Active connection states
SELECT
  state,
  wait_event_type,
  wait_event,
  COUNT(*)                                AS connection_count,
  MAX(now() - state_change)::text         AS max_duration_in_state,
  MIN(now() - state_change)::text         AS min_duration_in_state
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
GROUP BY state, wait_event_type, wait_event
ORDER BY connection_count DESC;

-- H2: Long-running queries (> 5 seconds) — symptomatic of trigger avalanche
SELECT
  pid,
  now() - query_start     AS duration,
  state,
  left(query, 200)        AS query_preview,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE datname    = current_database()
  AND pid       <> pg_backend_pid()
  AND query_start < now() - interval '5 seconds'
  AND state NOT IN ('idle')
ORDER BY duration DESC
LIMIT 20;

-- H3: Lock contention — heavy trigger chains create lock queues
SELECT
  blocking.pid       AS blocking_pid,
  blocked.pid        AS blocked_pid,
  blocking.state     AS blocking_state,
  left(blocking.query, 100) AS blocking_query,
  left(blocked.query, 100)  AS blocked_query,
  now() - blocked.query_start AS blocked_duration
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.datname = current_database()
ORDER BY blocked_duration DESC NULLS LAST;

-- H4: Total connections vs Supabase Pro limit
SELECT
  COUNT(*) FILTER (WHERE state = 'active')  AS active,
  COUNT(*) FILTER (WHERE state = 'idle')    AS idle,
  COUNT(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_txn,
  COUNT(*)                                  AS total,
  current_setting('max_connections')::int   AS max_connections,
  ROUND(COUNT(*) * 100.0 / current_setting('max_connections')::int, 1) AS pct_used
FROM pg_stat_activity
WHERE datname = current_database();


-- ── I. SLOW QUERY ANALYSIS (pg_stat_statements) ──────────────────────────────
-- Only available if the pg_stat_statements extension is enabled in Supabase.
-- Enable it via Dashboard → Database → Extensions.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
    RAISE NOTICE 'pg_stat_statements is ENABLED — running slow query analysis';
  ELSE
    RAISE NOTICE 'pg_stat_statements is NOT enabled — skipping section I (enable via Extensions tab)';
  END IF;
END;
$$;

SELECT
  round(mean_exec_time::numeric, 2)    AS mean_ms,
  round(stddev_exec_time::numeric, 2)  AS stddev_ms,
  calls,
  round(total_exec_time::numeric, 0)   AS total_ms,
  rows / NULLIF(calls, 0)              AS avg_rows,
  left(query, 150)                     AS query_preview
FROM pg_stat_statements
WHERE (
    query ILIKE '%trip_messages%'
    OR query ILIKE '%trip_conversations%'
    OR query ILIKE '%send_trip_chat_message%'
    OR query ILIKE '%fn_post_system%'
    OR query ILIKE '%fn_broadcast%'
    OR query ILIKE '%organization_members%'
  )
  AND calls > 5
ORDER BY mean_exec_time DESC
LIMIT 30;

-- Top queries by TOTAL time (identifies volume × latency killers)
SELECT
  round(total_exec_time::numeric, 0)   AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2)    AS mean_ms,
  left(query, 150)                     AS query_preview
FROM pg_stat_statements
WHERE query ILIKE '%trip_messages%'
   OR query ILIKE '%trip_conversations%'
ORDER BY total_exec_time DESC
LIMIT 20;


-- ── J. REALTIME AND TABLE BLOAT HEALTH ───────────────────────────────────────

-- J1: Table sizes and dead-tuple ratio (trigger storms create dead tuples)
SELECT
  n.nspname || '.' || c.relname   AS table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  pg_size_pretty(pg_relation_size(c.oid))       AS table_size,
  pg_size_pretty(pg_indexes_size(c.oid))         AS index_size,
  s.n_live_tup                    AS live_rows,
  s.n_dead_tup                    AS dead_rows,
  CASE
    WHEN s.n_live_tup = 0 THEN NULL
    ELSE round(s.n_dead_tup * 100.0 / NULLIF(s.n_live_tup + s.n_dead_tup, 0), 1)
  END                              AS dead_pct,
  CASE
    WHEN s.n_dead_tup > s.n_live_tup * 0.1 THEN '⚠ BLOAT — VACUUM needed'
    ELSE '✓ healthy'
  END                              AS bloat_status,
  s.last_autovacuum::text          AS last_autovacuum,
  s.last_autoanalyze::text         AS last_autoanalyze
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN (
    'trip_messages', 'trip_conversations',
    'network_messages', 'network_conversations',
    'trips', 'organization_members', 'drivers'
  )
ORDER BY pg_total_relation_size(c.oid) DESC;

-- J2: Check if autovacuum is keeping up with trip_messages writes
-- Trigger storms produce many dead tuples; if autovacuum lag > 1 hour, performance degrades
SELECT
  schemaname,
  relname,
  n_tup_ins AS total_inserts,
  n_tup_upd AS total_updates,
  n_tup_del AS total_deletes,
  n_tup_hot_upd AS hot_updates,
  ROUND(n_tup_hot_upd * 100.0 / NULLIF(n_tup_upd, 0), 1) AS hot_update_pct,
  now() - last_autovacuum   AS since_last_vacuum,
  now() - last_autoanalyze  AS since_last_analyze
FROM pg_stat_user_tables
WHERE relname IN ('trip_messages', 'trip_conversations', 'trips')
ORDER BY n_tup_upd DESC;


-- ── K. COMPOSITE HEALTH SCORE ────────────────────────────────────────────────
-- Produces a single pass/fail summary across all critical checks.

WITH checks AS (
  -- Index check
  SELECT 'idx_trips_org_trip_number' AS check_name,
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trips_org_trip_number' AND schemaname = 'public') AS passed
  UNION ALL
  SELECT 'idx_drivers_user_id',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_drivers_user_id' AND schemaname = 'public')
  UNION ALL
  SELECT 'idx_trip_messages_conv_created_desc',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trip_messages_conv_created_desc' AND schemaname = 'public')
  UNION ALL
  SELECT 'idx_trip_conversations_trip_party',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trip_conversations_trip_party' AND schemaname = 'public')
  UNION ALL
  SELECT 'broken_index_dropped',
         NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_dq_accepted_bidder_indent' AND schemaname = 'public')
  UNION ALL
  -- Function check
  SELECT 'trigger_chain_uses_direct_insert',
         (SELECT prosrc NOT ILIKE '%send_trip_chat_message%'
          FROM pg_proc WHERE proname = 'fn_post_system_message_to_trip_chats'
            AND pronamespace = 'public'::regnamespace LIMIT 1)
  UNION ALL
  SELECT 'noop_guard_present',
         (SELECT prosrc ILIKE '%IS NOT DISTINCT FROM OLD.status%' OR prosrc ILIKE '%NEW.status = OLD.status%'
          FROM pg_proc WHERE proname = 'fn_broadcast_trip_status_to_chat'
            AND pronamespace = 'public'::regnamespace LIMIT 1)
  UNION ALL
  -- Policy check
  SELECT 'base_policy_uses_exists',
         NOT EXISTS (
           SELECT 1
           FROM pg_policy p
           JOIN pg_class c ON c.oid = p.polrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'
             AND c.relname IN ('trip_conversations', 'trip_messages')
             AND p.polname IN ('organization_members_can_manage_trip_conversations',
                               'organization_members_can_manage_trip_messages')
             AND pg_get_expr(p.polqual, p.polrelid) ILIKE '% IN (SELECT%'
         )
  UNION ALL
  SELECT 'supplier_policy_no_coalesce',
         NOT EXISTS (
           SELECT 1
           FROM pg_policy p
           JOIN pg_class c ON c.oid = p.polrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'
             AND c.relname IN ('trip_conversations', 'trip_messages')
             AND p.polname ILIKE '%supplier%'
             AND (
               pg_get_expr(p.polqual, p.polrelid) ILIKE '%COALESCE(om.status%'
               OR pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%COALESCE(om.status%'
             )
         )
)
SELECT
  check_name,
  CASE WHEN passed THEN '✓ PASS' ELSE '✗ FAIL' END AS result
FROM checks
ORDER BY passed ASC, check_name;

-- Final score
SELECT
  COUNT(*) FILTER (WHERE passed) AS passed,
  COUNT(*) FILTER (WHERE NOT passed) AS failed,
  COUNT(*) AS total,
  CASE
    WHEN COUNT(*) FILTER (WHERE NOT passed) = 0
      THEN '🟢 ALL CHECKS PASSED — migrations applied correctly'
    WHEN COUNT(*) FILTER (WHERE NOT passed) <= 2
      THEN '🟡 MOSTLY APPLIED — ' || COUNT(*) FILTER (WHERE NOT passed) || ' check(s) failed, review above'
    ELSE
      '🔴 SIGNIFICANT GAPS — ' || COUNT(*) FILTER (WHERE NOT passed) || ' check(s) failed, migrations may not be applied'
  END AS overall_status
FROM (
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trips_org_trip_number' AND schemaname = 'public') AS passed
  UNION ALL SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_drivers_user_id' AND schemaname = 'public')
  UNION ALL SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trip_messages_conv_created_desc' AND schemaname = 'public')
  UNION ALL SELECT NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_dq_accepted_bidder_indent' AND schemaname = 'public')
  UNION ALL SELECT (SELECT prosrc NOT ILIKE '%send_trip_chat_message%' FROM pg_proc WHERE proname = 'fn_post_system_message_to_trip_chats' AND pronamespace = 'public'::regnamespace LIMIT 1)
  UNION ALL SELECT (SELECT prosrc ILIKE '%IS NOT DISTINCT FROM%' OR prosrc ILIKE '%NEW.status = OLD.status%' FROM pg_proc WHERE proname = 'fn_broadcast_trip_status_to_chat' AND pronamespace = 'public'::regnamespace LIMIT 1)
) sub;
