-- ============================================================================
-- Keep the mover's Row B (source='mover_asset') status in step with its
-- aggregator Row A (source='direct_quote'), linked by indent.
--
-- ROOT CAUSE (verified on live DB 2026-07-29):
--   20260728170000 fixed Row B *creation* — Row B is now reliably inserted by
--   _ensure_mover_asset_trip on every deploy path. But that helper inserts it as
--   status='draft' on purpose: draft is exempt from
--   enforce_single_active_trip_per_driver, so Row B can share the aggregator's
--   driver without tripping the single-active-trip rule.
--
--   Nothing ever moves Row B out of draft. There is no trigger on public.trips
--   that touches the mover_asset relative (confirmed by enumerating all 14
--   non-internal triggers), and no RPC other than the creation helper references
--   source='mover_asset'. So Row A runs assigned -> completed while Row B stays
--   draft forever.
--
--   Downstream effect: the driver wallet only counts a mover trip as a "fleet
--   trip" once the mover-org row reaches a real status. A draft Row B is
--   invisible to it, so a completed job lands in the driver's "Open trips"
--   bucket and the driver taps "Mark as fleet trip" — filing a trip_based
--   driver_salary_requests row against the mover org. That request is the
--   symptom operators see as "Attribution requests" on the trips page.
--
--   Evidence: 10 mover_asset rows sat in draft against a live/completed Row A.
--   The 5 that did read 'completed' were closed by hand, not by any automation.
--
-- FIX:
--   1. AFTER UPDATE OF status trigger on Row A mirrors status onto Row B.
--   2. Backfill the existing stale drafts.
--
-- WHY A TRIGGER, NOT RPC EDITS:
--   Row A's status is advanced from many places — driver app ops, ops console,
--   trip-room actions, bulk tools. Wiring each call site would leave the same
--   class of gap that caused this bug. One trigger on the status column covers
--   every writer, including future ones.
--
-- CONSTRAINT NOTES:
--   - trips_check1 requires completed_at IS NOT NULL exactly when
--     status='completed', and NULL otherwise. Row B's completed_at is therefore
--     stamped/cleared in the same UPDATE.
--   - enforce_single_active_trip_per_driver early-returns for
--     source='mover_asset', so moving Row B to an active status can never raise
--     "Driver is already assigned to another active trip".
-- ============================================================================

BEGIN;

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
  -- Only the aggregator row drives the mirror. Guard against recursion: Row B is
  -- source='mover_asset', so an update to it never re-enters this branch.
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
    -- Never resurrect a row an operator deliberately closed out differently.
    AND lower(trim(coalesce(m.status::text, ''))) NOT IN ('cancelled', 'completed')
    AND m.status IS DISTINCT FROM NEW.status;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.fn_sync_mover_asset_trip_status() IS
  'Mirrors aggregator (direct_quote) trip status onto the mover''s own '
  'mover_asset relative for the same indent. Without this the mover row stays '
  'draft forever, which pushes completed work into the driver''s open-trip '
  'bucket and produces spurious attribution requests.';

DROP TRIGGER IF EXISTS trg_sync_mover_asset_trip_status ON public.trips;
CREATE TRIGGER trg_sync_mover_asset_trip_status
AFTER UPDATE OF status ON public.trips
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.fn_sync_mover_asset_trip_status();

-- ── Backfill existing stale drafts ────────────────────────────────────────────
-- Every mover_asset row still 'draft' whose aggregator relative has already
-- moved on. Mirrors the trigger's logic exactly.
DO $backfill$
DECLARE
  v_rows integer := 0;
BEGIN
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

COMMIT;
