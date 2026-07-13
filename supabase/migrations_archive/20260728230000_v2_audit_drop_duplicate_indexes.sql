-- =============================================================================
-- V2 Audit Fix 4: Drop duplicate/redundant indexes (PERF-2)
-- True duplicates: identical column + predicate, different name
-- Full indexes: supersede their partial counterparts on same column
-- =============================================================================

-- True duplicates (identical definition)
DROP INDEX IF EXISTS public.idx_transactions_transaction_date;  -- dup of idx_transactions_org_date
DROP INDEX IF EXISTS public.idx_trip_conversations_trip;        -- dup of idx_trip_conversations_trip_id
DROP INDEX IF EXISTS public.idx_tripmsg_unread;                 -- dup of idx_tm_unread
DROP INDEX IF EXISTS public.idx_tm_priority_sort;               -- dup of idx_tm_org_time
DROP INDEX IF EXISTS public.idx_trip_messages_org_created;      -- dup of idx_tm_org_time

-- Full index on organization_id supersedes these partial indexes
DROP INDEX IF EXISTS public.idx_clients_deleted_at;
DROP INDEX IF EXISTS public.idx_drivers_deleted_at;
DROP INDEX IF EXISTS public.idx_indents_org_active;
DROP INDEX IF EXISTS public.idx_suppliers_deleted_at;
DROP INDEX IF EXISTS public.idx_trips_deleted_at;
DROP INDEX IF EXISTS public.idx_vehicles_deleted_at;

-- Stricter partial (deleted_at IS NULL AND ...) supersedes looser partial (... only)
DROP INDEX IF EXISTS public.idx_clients_org_linked;
DROP INDEX IF EXISTS public.idx_suppliers_org_linked;

-- Partial indexes whose patterns are covered by full indexes above
DROP INDEX IF EXISTS public.idx_drivers_active;
DROP INDEX IF EXISTS public.idx_indents_open;
DROP INDEX IF EXISTS public.idx_posts_new;
DROP INDEX IF EXISTS public.idx_posts_active_load_lanes;
DROP INDEX IF EXISTS public.idx_trip_messages_conv_time;
DROP INDEX IF EXISTS public.idx_trip_messages_undelivered;
