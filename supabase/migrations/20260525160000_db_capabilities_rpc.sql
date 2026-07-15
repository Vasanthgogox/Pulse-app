-- ─────────────────────────────────────────────────────────────────────────────
-- get_db_capabilities RPC
--
-- WHY THIS EXISTS:
-- The Supabase Dashboard runs a complex four-way JOIN across pg_available_extensions,
-- pg_extension, pg_namespace, and pg_available_extension_versions whenever the
-- Extensions page is loaded. pg_available_extension_versions is a set-returning
-- function that scans the PostgreSQL extension directory on disk — under load this
-- creates CPU I/O-wait spikes visible in pg_stat_activity.
--
-- The app never needs the full extension catalog. It only needs boolean flags:
--   "is pg_cron installed so I can schedule jobs?"
--   "is uuid-ossp available so I can call uuid_generate_v4()?"
--
-- This function returns those flags in one cheap catalog lookup:
--   SELECT extname FROM pg_extension WHERE extname = ANY(ARRAY[...])
-- No filesystem scan, no four-way join, no I/O wait.
--
-- React pattern: call this ONCE on app start in DbCapabilitiesContext.
-- Cache forever in component state — extensions never change at runtime.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_db_capabilities()
RETURNS json
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'pg_cron',           EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'),
    'pg_trgm',           EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'),
    'uuid_ossp',         EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'),
    'pg_stat_statements',EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'),
    'vector',            EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector'),
    'postgis',           EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis')
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_db_capabilities() TO authenticated, anon;
COMMENT ON FUNCTION public.get_db_capabilities IS
  'Returns boolean capability flags for installed extensions. '
  'Cache on app init — never query pg_available_extensions from application code.';
