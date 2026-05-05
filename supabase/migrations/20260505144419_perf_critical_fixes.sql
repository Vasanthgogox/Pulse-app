-- ============================================================
-- CRITICAL PERFORMANCE FIXES — 2026-05-05
-- Safe: all index additions use IF NOT EXISTS; no column drops.
-- ============================================================

-- ── 1. trips.updated_at + vehicle_id ─────────────────────────────────────────
-- updated_at: used in getDriverOngoingTrip / getVehicleOngoingTrip ORDER BY updated_at DESC.
CREATE INDEX IF NOT EXISTS idx_trips_updated_at
  ON public.trips(updated_at DESC);

-- vehicle_id: vehicle busy-check WHERE vehicle_id = ? AND status NOT IN (...)
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_id
  ON public.trips(vehicle_id) WHERE vehicle_id IS NOT NULL;

-- ── 2. trip_messages composite + org index ────────────────────────────────────
-- (conversation_id, message_type, created_at): covers feedback_request filter
--   WHERE conversation_id = ? AND message_type = 'feedback_request' LIMIT 1
CREATE INDEX IF NOT EXISTS idx_trip_messages_conv_type
  ON public.trip_messages(conversation_id, message_type, created_at DESC);

-- organization_id plain: needed for RLS policy INSERT scan
CREATE INDEX IF NOT EXISTS idx_trip_messages_org_id
  ON public.trip_messages(organization_id);

-- ── 3. network_messages indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_network_messages_sender_org
  ON public.network_messages(sender_org_id);

-- ── 4. transactions.contact_type covering index ───────────────────────────────
-- ensureAssetCompletionAutoEntries: trip_id + contact_type filter
CREATE INDEX IF NOT EXISTS idx_transactions_trip_contact_type
  ON public.transactions(trip_id, contact_type) WHERE trip_id IS NOT NULL;

-- ── 5. GIN indexes on JSONB / ARRAY columns ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vehicles_documents_gin
  ON public.vehicles USING gin(documents);

CREATE INDEX IF NOT EXISTS idx_suppliers_operating_areas_gin
  ON public.suppliers USING gin(operating_areas);

CREATE INDEX IF NOT EXISTS idx_suppliers_vehicle_types_gin
  ON public.suppliers USING gin(vehicle_types);

CREATE INDEX IF NOT EXISTS idx_trip_messages_metadata_gin
  ON public.trip_messages USING gin(metadata) WHERE metadata IS NOT NULL;

-- ── 6. driver_locations TTL cleanup ───────────────────────────────────────────
-- Delete rows >90 days old from completed/cancelled trips.
-- Rows on active trips and rows without trip_id are retained.
DELETE FROM public.driver_locations
WHERE recorded_at < now() - interval '90 days'
  AND (
    trip_id IS NULL
    OR trip_id IN (
      SELECT id FROM public.trips
      WHERE status IN ('completed', 'cancelled', 'done', 'delivered')
        AND completed_at < now() - interval '90 days'
    )
  );

-- Nightly pg_cron job (no-op if pg_cron extension is not installed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'driver_locations_ttl',
      '0 2 * * *',
      $cron$
        DELETE FROM public.driver_locations
        WHERE recorded_at < now() - interval '90 days'
          AND (
            trip_id IS NULL
            OR trip_id IN (
              SELECT id FROM public.trips
              WHERE status IN ('completed', 'cancelled', 'done', 'delivered')
                AND completed_at < now() - interval '90 days'
            )
          );
      $cron$
    );
  END IF;
END;
$$;

-- ── 7. trip_messages archive view (non-destructive) ───────────────────────────
-- Identifies messages >30 days old on closed trips. Use for cold-storage export.
CREATE OR REPLACE VIEW public.trip_messages_archive_candidates AS
SELECT *
FROM public.trip_messages
WHERE created_at < now() - interval '30 days'
  AND conversation_id IN (
    SELECT tc.id
    FROM public.trip_conversations tc
    JOIN public.trips t ON t.id = tc.trip_id
    WHERE t.status IN ('completed', 'cancelled', 'done', 'delivered')
  );

COMMENT ON VIEW public.trip_messages_archive_candidates IS
  'Messages >30d old on completed/cancelled trips — safe to move to cold storage.';
