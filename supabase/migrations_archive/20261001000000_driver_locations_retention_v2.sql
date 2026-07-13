-- Driver locations retention v2: 3-tier policy
-- Tier 1: orphaned rows (no trip_id) → delete after 24h
-- Tier 2: completed/cancelled trip rows → delete after 30 days
-- Tier 3: active/assigned trip rows → retain until trip completes, then tier 2

-- One-time cleanup: delete orphaned rows older than 24h immediately
DELETE FROM public.driver_locations
WHERE trip_id IS NULL
  AND recorded_at < now() - interval '24 hours';

-- One-time cleanup: tighten completed trip retention from 90d to 30d
DELETE FROM public.driver_locations
WHERE recorded_at < now() - interval '30 days'
  AND trip_id IN (
    SELECT id FROM public.trips
    WHERE status IN ('completed', 'cancelled', 'done', 'delivered')
      AND completed_at < now() - interval '30 days'
  );

-- Drop old cron job and replace with 3-tier version
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old job
    PERFORM cron.unschedule('driver_locations_ttl');
  END IF;
EXCEPTION WHEN others THEN NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Tier 1: orphaned rows (no trip_id) — nightly 1am
    PERFORM cron.schedule(
      'driver_locations_ttl_orphaned',
      '0 1 * * *',
      $cron$
        DELETE FROM public.driver_locations
        WHERE trip_id IS NULL
          AND recorded_at < now() - interval '24 hours';
      $cron$
    );
    -- Tier 2: completed trip rows — weekly Sunday 2am
    PERFORM cron.schedule(
      'driver_locations_ttl_completed',
      '0 2 * * 0',
      $cron$
        DELETE FROM public.driver_locations
        WHERE recorded_at < now() - interval '30 days'
          AND trip_id IN (
            SELECT id FROM public.trips
            WHERE status IN ('completed', 'cancelled', 'done', 'delivered')
              AND completed_at < now() - interval '30 days'
          );
      $cron$
    );
  END IF;
END;
$$;

-- Partial index to accelerate orphaned row cleanup (if not exists)
CREATE INDEX IF NOT EXISTS idx_driver_locations_orphaned_cleanup
  ON public.driver_locations(recorded_at DESC)
  WHERE trip_id IS NULL;

COMMENT ON INDEX idx_driver_locations_orphaned_cleanup
  IS 'Accelerates nightly TTL delete for rows with no trip_id (orphaned GPS pings).';
