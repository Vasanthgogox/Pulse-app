-- Index usage snapshot (resets on stats reset; still useful for diffs between envs).
SELECT schemaname,
       relname,
       indexrelname,
       idx_scan,
       idx_tup_read,
       idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, relname, indexrelname
LIMIT 200;
