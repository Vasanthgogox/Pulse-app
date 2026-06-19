-- Post-crash stability fixes (root cause: 06/14/2026 OOM+IO-burst outage)
--
-- Crash sequence:
--   07:10 – connections hit 42 (28 idle)
--   07:15 – 1 long-running query at 117 s (PostgREST introspection, postgres role)
--   07:20 – 53 connections (max = 60) as new requests pile up
--   07:25 – 2 queries at 276 s, EBS IO burst depleting
--   07:30 – OOM + IO burst = 0% → crash
--
-- Primary root cause (already fixed in 20260923000000):
--   Duplicate fn_post_trip_room_action_card caused PostgREST to loop on schema
--   introspection (51 pg_proc scans, 98 pg_timezone_names calls), each running as
--   postgres role with no statement_timeout.
--
-- This migration fixes four latent hazards discovered during post-mortem:
--
--   1. Duplicate health-snapshot cron jobs fire simultaneously every 15 min,
--      wasting 2× CPU and risking lock contention on pg_stat_activity.
--
--   2. analyze-pg-catalog runs EVERY 10 MIN on pg_proc/pg_class/pg_attribute.
--      Under load this causes ShareUpdateExclusiveLock contention with PostgREST
--      introspection, amplifying the latency that led to the crash.
--
--   3. trip_conversations missing from supabase_realtime publication — unread
--      counts and last-message previews only update via the message INSERT path,
--      not from direct conversation row UPDATEs (e.g. read-receipt triggers).
--
--   4. discover_organizations scans all public.posts rows to find active LOAD
--      posts (559 ms mean, 166 calls). Only idx_posts_active on (is_active)
--      exists — PostgreSQL must filter type='LOAD' in a second heap pass.

-- ── 1. Remove duplicate health-snapshot cron job ─────────────────────────────
-- capture-db-health-every-minute (every 5 min) + ops_capture_health (every 15 min)
-- both call ops.capture_db_health_snapshot(). Keep the 5-min job; drop the 15-min one.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ops_capture_health') THEN
    PERFORM cron.unschedule('ops_capture_health');
  END IF;
END;
$$;

-- ── 2. Slow analyze-pg-catalog from every 10 min → every 6 hours ─────────────
-- Running ANALYZE on pg_proc/pg_class every 10 minutes is excessive.
-- Statistics on catalog tables are stable enough for 6-hourly updates.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analyze-pg-catalog') THEN
    PERFORM cron.unschedule('analyze-pg-catalog');
  END IF;

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
END;
$$;

-- ── 3. Add trip_conversations to the Realtime publication ─────────────────────
-- Required so read-receipt triggers and direct unread-count updates reach clients
-- without waiting for the next message INSERT event.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'trip_conversations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_conversations';
  END IF;
END;
$$;

-- ── 4. Partial index for discover_organizations active-LOAD posts scan ────────
-- discover_organizations queries all posts WHERE is_active = true AND type = 'LOAD'.
-- The existing idx_posts_active only covers is_active; type is filtered in a
-- subsequent heap scan. A partial index cuts the scan to the exact working set.
CREATE INDEX IF NOT EXISTS idx_posts_active_load
  ON public.posts (organization_id, origin, destination)
  WHERE is_active = true AND type = 'LOAD';
