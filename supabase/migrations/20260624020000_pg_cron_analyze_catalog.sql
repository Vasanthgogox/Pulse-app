-- PostgREST schema introspection scans pg_catalog tables (pg_class, pg_constraint,
-- pg_attribute, pg_proc, pg_depend). With 189 functions + 42 tables these stats go
-- stale after migrations, causing the query planner to pick nested-loop joins instead
-- of hash joins — turning a 1ms query into 14s. Every db:push then triggers a
-- PostgREST thundering herd (all workers reload simultaneously) that exhausts the
-- connection pool and trips the Supabase health check → UNHEALTHY.
--
-- This cron job keeps pg_catalog stats fresh so the planner always picks the fast path.

SELECT cron.schedule(
  'analyze-pg-catalog',
  '*/10 * * * *',  -- every 10 minutes
  $$
    ANALYZE pg_catalog.pg_class;
    ANALYZE pg_catalog.pg_constraint;
    ANALYZE pg_catalog.pg_attribute;
    ANALYZE pg_catalog.pg_namespace;
    ANALYZE pg_catalog.pg_proc;
    ANALYZE pg_catalog.pg_depend;
  $$
);
