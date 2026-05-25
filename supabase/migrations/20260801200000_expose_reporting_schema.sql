-- Expose the `reporting` schema to PostgREST so supabase-js .schema('reporting').from(...)
-- calls resolve correctly instead of 404-ing.
--
-- After applying this migration you must also add `reporting` to the "Extra schemas"
-- list in Supabase Dashboard → Settings → API → DB Schema (or reload the PostgREST config).
-- The GRANT below ensures the anon/authenticated roles can SELECT from reporting views.

CREATE SCHEMA IF NOT EXISTS reporting;

-- Allow PostgREST roles to use the schema and read from its objects.
GRANT USAGE ON SCHEMA reporting TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting
  GRANT SELECT ON TABLES TO anon, authenticated;

-- Reload PostgREST config so the schema becomes visible immediately without a restart.
NOTIFY pgrst, 'reload config';
