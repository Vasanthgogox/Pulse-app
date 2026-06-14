-- EXPLAIN ANALYZE: high-traffic queries from app services (sample IDs from prod)
-- org: c481a15d-c488-4e26-aa03-d77681fb5835, conv: fd06ab13-d0c0-43c7-a7a6-af45ea52756a, driver: f4aca3f0-5914-4efe-8ee4-f06ec713ee81

-- Q1 trips.service getTripsByOrganization
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT *
FROM public.trips
WHERE organization_id = 'c481a15d-c488-4e26-aa03-d77681fb5835'::uuid
ORDER BY created_at DESC
LIMIT 200;

-- Q2 trips by driver ids (driver home)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, status, driver_id, organization_id, created_at
FROM public.trips
WHERE driver_id = 'f4aca3f0-5914-4efe-8ee4-f06ec713ee81'::uuid
ORDER BY created_at DESC
LIMIT 50;

-- Q3 chat.service getMessagesByConversation fallback
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, conversation_id, organization_id, sender_user_id, sender_role, sender_name, content, message_type, metadata, is_read, read_at, created_at
FROM public.trip_messages
WHERE conversation_id = 'fd06ab13-d0c0-43c7-a7a6-af45ea52756a'::uuid
ORDER BY created_at DESC
LIMIT 50;

-- Q4 driver_locations latest by trip (fallback path)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT latitude, longitude, accuracy, recorded_at
FROM public.driver_locations
WHERE trip_id = (SELECT trip_id FROM public.trip_conversations WHERE id = 'fd06ab13-d0c0-43c7-a7a6-af45ea52756a'::uuid LIMIT 1)
ORDER BY recorded_at DESC
LIMIT 1;

-- Q5 driver_locations latest by driver
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT latitude, longitude, accuracy, recorded_at
FROM public.driver_locations
WHERE driver_id = 'f4aca3f0-5914-4efe-8ee4-f06ec713ee81'::uuid
ORDER BY recorded_at DESC
LIMIT 1;

-- Q6 trip_conversations inbox by org
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, organization_id, trip_id, last_message_at, unread_dispatcher_count
FROM public.trip_conversations
WHERE organization_id = 'c481a15d-c488-4e26-aa03-d77681fb5835'::uuid
ORDER BY last_message_at DESC NULLS LAST, id
LIMIT 50;

-- Q7 chat_messages thread (unified schema)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, conversation_id, content, created_at
FROM public.chat_messages
WHERE conversation_id = (
  SELECT id FROM public.chat_conversations WHERE legacy_trip_conversation_id = 'fd06ab13-d0c0-43c7-a7a6-af45ea52756a'::uuid LIMIT 1
)
ORDER BY created_at DESC, id
LIMIT 50;

-- Q8 shared_ledger_notifications inbox
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, organization_id, status, created_at
FROM public.shared_ledger_notifications
WHERE organization_id = 'c481a15d-c488-4e26-aa03-d77681fb5835'::uuid
ORDER BY created_at DESC
LIMIT 50;

-- Q9 drivers linked to user
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, user_id, organization_id, status, created_at
FROM public.drivers
WHERE user_id = (SELECT user_id FROM public.drivers WHERE id = 'f4aca3f0-5914-4efe-8ee4-f06ec713ee81'::uuid)
ORDER BY created_at DESC
LIMIT 20;

-- WAL: table bloat / dead tuples
SELECT relname, n_dead_tup, n_live_tup, last_autovacuum, last_vacuum
FROM pg_stat_user_tables
WHERE relname IN ('trip_messages','chat_messages','driver_locations','trips')
ORDER BY n_dead_tup DESC;

-- Index count per table
SELECT tablename, count(*) AS index_count,
       pg_size_pretty(sum(pg_relation_size(indexrelid))) AS total_index_size
FROM pg_indexes i
JOIN pg_class c ON c.relname = i.indexname
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
WHERE i.schemaname = 'public'
  AND i.tablename IN ('trips','trip_messages','trip_conversations','driver_locations','chat_messages','chat_conversations')
GROUP BY tablename
ORDER BY sum(pg_relation_size(indexrelid)) DESC;

-- Q10 driver chat inbox — trip_conversations by driver_id (no LIMIT currently)
-- Verify: idx_trip_conversations_driver_last_msg is used, no sequential scan
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, organization_id, trip_id, party_type, party_name, client_id, supplier_id, driver_id,
       last_message_at, last_message_preview, unread_dispatcher_count, created_at, updated_at
FROM public.trip_conversations
WHERE driver_id = 'f4aca3f0-5914-4efe-8ee4-f06ec713ee81'::uuid
ORDER BY last_message_at DESC NULLS LAST
LIMIT 100;

-- Q11 driver inbox preview messages — the multi-conversation IN query
-- Verify: idx_trip_messages_conv_type used for (conversation_id, message_type, created_at DESC)
-- Replace the UUIDs with actual conversation IDs from prod for accurate timing
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, conversation_id, message_type, metadata, created_at
FROM public.trip_messages
WHERE conversation_id IN (
  'fd06ab13-d0c0-43c7-a7a6-af45ea52756a'::uuid
  -- add 10-30 more real conversation IDs here for a realistic test
)
AND message_type IN ('image', 'document_share', 'document_upload')
ORDER BY created_at DESC
LIMIT 120;

-- Q12 windowed_trip_message_history RPC (thread bootstrap)
-- Verify: uses idx_trip_messages_conv_created_desc index-only scan
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, conversation_id, organization_id, sender_user_id, sender_role, sender_name,
       content, message_type, metadata, is_read, read_at, created_at,
       sender_avatar_seed, is_delivered, delivered_at, reactions, reply_to_id,
       reply_to_preview, edited_at
FROM public.trip_messages
WHERE conversation_id = 'fd06ab13-d0c0-43c7-a7a6-af45ea52756a'::uuid
ORDER BY created_at DESC
LIMIT 20;

-- Q13 driver_locations table size and dead tuple ratio
SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
  last_autovacuum,
  last_autoanalyze,
  pg_size_pretty(pg_relation_size(oid)) AS table_size,
  pg_size_pretty(pg_total_relation_size(oid)) AS total_size
FROM pg_stat_user_tables
WHERE relname = 'driver_locations';

-- Q14 trip_messages table size (main table bloat check)
SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
  last_autovacuum,
  last_autoanalyze,
  pg_size_pretty(pg_relation_size(oid)) AS table_size,
  pg_size_pretty(pg_total_relation_size(oid)) AS total_size
FROM pg_stat_user_tables
WHERE relname IN ('trip_messages', 'trip_conversations', 'chat_messages', 'driver_locations')
ORDER BY pg_total_relation_size(oid) DESC;

-- Q15 Index usage for driver chat specific indexes
SELECT
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE relname IN ('trip_conversations','trip_messages')
  AND indexrelname IN (
    'idx_trip_conversations_driver_id',
    'idx_trip_conversations_driver_last_msg',
    'idx_trip_messages_conv_type',
    'idx_trip_messages_conv_created_desc',
    'idx_trip_messages_covering',
    'idx_trip_messages_metadata_gin'
  )
ORDER BY relname, idx_scan DESC;

-- Q16 pg_stat_statements top queries by total_exec_time (requires pg_stat_statements extension)
-- Run this to find the actual slowest queries in production:
SELECT
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS avg_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  calls,
  rows,
  left(query, 200) AS query_preview
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat%'
  AND query NOT ILIKE 'START_REPLICATION%'
ORDER BY total_exec_time DESC
LIMIT 20;
