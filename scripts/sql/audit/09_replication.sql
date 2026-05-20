-- Upstream replication (empty row set on single-node / non-replica).
SELECT application_name,
       state,
       sync_state,
       client_addr,
       replay_lag,
       flush_lag,
       write_lag
FROM pg_stat_replication;

-- Logical replication slots (if any).
SELECT slot_name,
       plugin,
       slot_type,
       database,
       active,
       restart_lsn,
       confirmed_flush_lsn
FROM pg_replication_slots
ORDER BY slot_name;
