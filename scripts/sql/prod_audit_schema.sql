-- Row counts + sizes
SELECT c.relname AS table_name,
       s.n_live_tup AS est_rows,
       s.n_tup_ins AS total_inserts,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN (
    'chat_conversations','chat_messages','chat_participants',
    'trip_conversations','trip_messages',
    'driver_locations','trips','shared_ledger_notifications'
  )
ORDER BY pg_total_relation_size(c.oid) DESC;

SELECT 'trips' AS tbl, count(*)::bigint AS exact_rows FROM public.trips
UNION ALL SELECT 'trip_messages', count(*) FROM public.trip_messages
UNION ALL SELECT 'trip_conversations', count(*) FROM public.trip_conversations
UNION ALL SELECT 'driver_locations', count(*) FROM public.driver_locations
UNION ALL SELECT 'chat_messages', count(*) FROM public.chat_messages
UNION ALL SELECT 'chat_conversations', count(*) FROM public.chat_conversations
UNION ALL SELECT 'chat_participants', count(*) FROM public.chat_participants
UNION ALL SELECT 'shared_ledger_notifications', count(*) FROM public.shared_ledger_notifications;

-- Sample IDs for EXPLAIN
SELECT 'org' AS kind, id::text FROM public.organizations ORDER BY created_at DESC NULLS LAST LIMIT 1;
SELECT 'trip_conv' AS kind, id::text, organization_id::text FROM public.trip_conversations ORDER BY last_message_at DESC NULLS LAST LIMIT 1;
SELECT 'driver' AS kind, id::text FROM public.drivers WHERE user_id IS NOT NULL LIMIT 1;
SELECT 'trip' AS kind, id::text, organization_id::text FROM public.trips ORDER BY created_at DESC LIMIT 1;

-- Realtime publication
SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;

-- Replica identity
SELECT c.relname, c.relreplident,
  CASE c.relreplident WHEN 'd' THEN 'DEFAULT' WHEN 'f' THEN 'FULL' WHEN 'i' THEN 'INDEX' WHEN 'n' THEN 'NOTHING' END AS replica_identity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('trip_messages','trip_conversations','chat_messages','chat_conversations','driver_locations','trips','shared_ledger_notifications')
ORDER BY c.relname;

-- Stats reset age (context for idx_scan=0)
SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();

-- Indexes WITH usage (idx_scan > 0)
SELECT relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE schemaname='public' AND relname IN ('trips','trip_messages','trip_conversations','driver_locations','chat_messages','chat_conversations','chat_participants','shared_ledger_notifications')
  AND idx_scan > 0
ORDER BY idx_scan DESC
LIMIT 30;
