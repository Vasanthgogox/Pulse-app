CREATE OR REPLACE FUNCTION public.fn_sync_mover_asset_trip_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_indent_id uuid;
  v_status    text;
BEGIN
  IF lower(trim(coalesce(NEW.source::text, ''))) <> 'direct_quote' THEN
    RETURN NULL;
  END IF;

  v_indent_id := COALESCE(NEW.indent_id, NEW.source_indent_id);
  IF v_indent_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_status := lower(trim(coalesce(NEW.status::text, '')));
  IF v_status = '' OR v_status = 'draft' THEN
    RETURN NULL;
  END IF;

  UPDATE public.trips m
  SET
    status = NEW.status,
    completed_at = CASE
      WHEN NEW.status = 'completed' THEN COALESCE(m.completed_at, NEW.completed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE m.source = 'mover_asset'
    AND m.source_indent_id = v_indent_id
    AND m.organization_id <> NEW.organization_id
    AND m.deleted_at IS NULL
    AND lower(trim(coalesce(m.status::text, ''))) NOT IN ('cancelled', 'completed')
    AND m.status IS DISTINCT FROM NEW.status;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.fn_sync_mover_asset_trip_status() IS
  'Mirrors aggregator (direct_quote) trip status onto the mover''s own mover_asset relative for the same indent. Without this the mover row stays draft forever, which pushes completed work into the driver''s open-trip bucket and produces spurious attribution requests.';

DROP TRIGGER IF EXISTS trg_sync_mover_asset_trip_status ON public.trips;
CREATE TRIGGER trg_sync_mover_asset_trip_status
AFTER UPDATE OF status ON public.trips
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.fn_sync_mover_asset_trip_status();

-- Guarded: one-time backfill referencing trips.source_indent_id, not added
-- until 20260828200000_operational_identity_codes_phase1.sql (a month
-- later). Skip entirely on a from-scratch replay -- a fresh local DB has no
-- historical mover_asset/direct_quote pairs to reconcile anyway.
DO $backfill$
DECLARE
  v_rows integer := 0;
BEGIN
  IF to_regclass('public.trips') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = to_regclass('public.trips')
      AND attname = 'source_indent_id' AND attnum > 0 AND NOT attisdropped
  ) THEN
    RAISE NOTICE 'skipping mover_asset status backfill: trips.source_indent_id not present yet (fresh replay)';
    RETURN;
  END IF;

  WITH pairs AS (
    SELECT m.id AS mover_id, agg.status AS agg_status, agg.completed_at AS agg_completed_at
    FROM public.trips m
    JOIN public.trips agg
      ON agg.indent_id = m.source_indent_id
     AND agg.source = 'direct_quote'
     AND agg.deleted_at IS NULL
     AND agg.organization_id <> m.organization_id
    WHERE m.source = 'mover_asset'
      AND m.deleted_at IS NULL
      AND lower(trim(coalesce(m.status::text, ''))) = 'draft'
      AND lower(trim(coalesce(agg.status::text, ''))) NOT IN ('draft', '')
  )
  UPDATE public.trips m
  SET
    status = p.agg_status,
    completed_at = CASE
      WHEN p.agg_status = 'completed' THEN COALESCE(p.agg_completed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  FROM pairs p
  WHERE m.id = p.mover_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'mover_asset status backfill: % row(s) advanced out of draft', v_rows;
END;
$backfill$;
