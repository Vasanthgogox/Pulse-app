-- Index inventory + usage stats
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS times_used,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  pg_get_indexdef(indexrelid) AS index_def
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname IN (
    'chat_conversations','chat_messages','chat_participants',
    'trip_conversations','trip_messages',
    'driver_locations','trips','shared_ledger_notifications',
    'network_conversations','network_messages'
  )
ORDER BY relname, idx_scan DESC;

-- Unused indexes (never scanned since stats reset)
SELECT
  relname AS table_name,
  indexrelname AS unused_index,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  pg_get_indexdef(indexrelid) AS index_def
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname IN (
    'chat_conversations','chat_messages','chat_participants',
    'trip_conversations','trip_messages',
    'driver_locations','trips','shared_ledger_notifications'
  )
  AND idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
