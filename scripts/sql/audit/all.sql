-- Read-only catalog audit pack. Safe on production (SELECT-only).
--
-- Run (from repo root, paths work with \ir):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/audit/all.sql
--
-- Or Supabase CLI (one file at a time), or archived multi-file run:
--   npm run db:audit
--   supabase db query --linked -f scripts/sql/audit/00_env.sql -o table
--
\set ON_ERROR_STOP on
\echo '=== 00_env ==='
\ir 00_env.sql
\echo '=== 01_extensions ==='
\ir 01_extensions.sql
\echo '=== 02_schema_inventory ==='
\ir 02_schema_inventory.sql
\echo '=== 03_publications ==='
\ir 03_publications.sql
\echo '=== 04_triggers ==='
\ir 04_triggers.sql
\echo '=== 05_functions_security ==='
\ir 05_functions_security.sql
\echo '=== 06_rls ==='
\ir 06_rls.sql
\echo '=== 07_indexes ==='
\ir 07_indexes.sql
\echo '=== 08_table_activity ==='
\ir 08_table_activity.sql
\echo '=== 09_replication ==='
\ir 09_replication.sql
\echo '=== 10_lineage_samples ==='
\ir 10_lineage_samples.sql
\echo '=== done ==='
