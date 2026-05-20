-- Heap activity (seq vs index scans, dead tuples — not a full bloat model).
SELECT schemaname,
       relname,
       seq_scan,
       idx_scan,
       n_live_tup,
       n_dead_tup,
       last_vacuum,
       last_autovacuum,
       last_analyze,
       last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_scan + idx_scan DESC NULLS LAST
LIMIT 100;
