-- Restore three pg_cron jobs that migration history defines as intended-active
-- but that are currently absent from cron.job on the live project (confirmed
-- via `cron.job` query against the linked project — jobs 'analyze-pg-catalog',
-- 'ops_capture_health', 'ops_capture_slow_queries' do not exist; no migration
-- after their creation ever unschedules them without also rescheduling them).
-- This drift was made outside the migration trail (e.g. a dashboard/SQL-editor
-- unschedule), not by any change in this repo.
--
-- Correlates directly with the 2026-09-07 investigation: PostgREST was
-- observed running a 34s `SELECT name FROM pg_timezone_names` (normally
-- sub-millisecond) inside an idle-in-transaction session, at the same moment
-- pg_cron's `monitor-watchdog` job failed with "job startup timeout" — both
-- symptoms of catalog/instance contention. `analyze-pg-catalog` exists
-- specifically (20260624020000, rescheduled 20261005000001) to keep
-- pg_catalog statistics fresh so PostgREST's own introspection queries stay
-- on a fast query plan; it has not been running.
--
-- ── 1. analyze-pg-catalog ─────────────────────────────────────────────────
-- Restored on its current intended schedule: every 6 hours, exactly as set by
-- 20261005000001_prod_stability_post_crash.sql (which itself superseded the
-- original 10-minute schedule from 20260624020000 to reduce
-- ShareUpdateExclusiveLock contention with PostgREST introspection). Same SQL
-- body as both prior migrations — six catalog tables, no new ones added.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analyze-pg-catalog') THEN
    PERFORM cron.schedule(
      'analyze-pg-catalog',
      '0 */6 * * *',
      $cmd$
        ANALYZE pg_catalog.pg_class;
        ANALYZE pg_catalog.pg_constraint;
        ANALYZE pg_catalog.pg_attribute;
        ANALYZE pg_catalog.pg_namespace;
        ANALYZE pg_catalog.pg_proc;
        ANALYZE pg_catalog.pg_depend;
      $cmd$
    );
  END IF;
END;
$$;

-- ── 2. ops_capture_slow_queries ───────────────────────────────────────────
-- Never unscheduled by any later migration. Restored on its original
-- definition from 20261001000001_observability_schema.sql: hourly, capturing
-- pg_stat_statements entries with mean_exec_time > 500ms into
-- ops.slow_query_log.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ops_capture_slow_queries') THEN
    PERFORM cron.schedule(
      'ops_capture_slow_queries',
      '0 * * * *',
      $cmd$ SELECT ops.capture_slow_queries(500); $cmd$
    );
  END IF;
END;
$$;

-- ── 3. ops_capture_health ─────────────────────────────────────────────────
-- NOTE ON SCHEDULE: 20261005000001_prod_stability_post_crash.sql intentionally
-- unscheduled this 15-minute job, on the stated assumption that a separate
-- 5-minute job ("capture-db-health-every-minute") would be kept running in
-- its place. That 5-minute job's schedule/definition was never captured in
-- any migration in this repo — it does not exist in migration history and is
-- not present in the live cron.job table either. Per the task's instruction
-- not to invent a new schedule, this restores ops_capture_health on the only
-- schedule this repo actually defines in a migration: every 15 minutes, from
-- 20261001000001_observability_schema.sql. This leaves a real gap between
-- migration-history intent (some form of 5-minute capture) and what this
-- migration restores (15-minute) — flagged for a human decision on which
-- cadence to standardize on; not resolved by this migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ops_capture_health') THEN
    PERFORM cron.schedule(
      'ops_capture_health',
      '*/15 * * * *',
      $cmd$ SELECT ops.capture_db_health_snapshot(); $cmd$
    );
  END IF;
END;
$$;
