-- ============================================================================
-- Extend the direct_quote <-> mover_asset status mirror to be bidirectional.
--
-- ROOT CAUSE (verified on live DB 2026-08-28, GOGOVAN / Space X / Idrees
-- Logistics incident, trip TRP007 vs TRP009):
--   20270117000001_sync_mover_asset_trip_status.sql made the mirror flow
--   direct_quote -> mover_asset only, because at the time mover_asset rows
--   only ever sat passively in 'draft' waiting for the aggregator to move.
--
--   That assumption is no longer true. mover_asset rows can now receive their
--   own live status writes directly (e.g. the vendor's driver app progressing
--   its own trip through assigned -> in_progress -> ... -> completed). When
--   that happens, the aggregator's (direct_quote) row never hears about it,
--   because the trigger's only branch requires NEW.source = 'direct_quote'.
--
--   Evidence: of 23 direct_quote/mover_asset pairs sharing an indent, 2 had
--   mover_asset genuinely ahead of direct_quote (mover_asset's updated_at was
--   also the more recent of the two), including TRP007 (direct_quote,
--   GOGOVAN, stuck at 'assigned') vs TRP009 (mover_asset, Idrees Logistics,
--   'completed' with real started_at/completed_at). 3 more pairs were the
--   already-known direct_quote-ahead case. 1 pair is a genuine conflict
--   (completed vs cancelled) that must NOT be auto-resolved either way.
--
-- FIX:
--   1. A small immutable rank helper (_trip_status_rank) gives every known
--      status a forward-progress rank, with unknown/NULL/empty statuses
--      mapped to -1 so they can never be treated as progress in either
--      direction. This is NOT a full transition-legality graph -- no such
--      graph exists anywhere in this codebase (checked app code, RPCs, and
--      migrations); it only answers "did this side move further along the
--      known lifecycle than its counterpart," which is sufficient to
--      guarantee no regression and no resurrection of a terminal trip.
--   2. fn_sync_mover_asset_trip_status() now branches on which side changed
--      and, either direction, only ever advances a counterpart that is (a)
--      uniquely identifiable (exactly one match by source_indent_id + source
--      + differing organization_id -- if zero or more than one, do nothing
--      rather than guess), (b) not already at a terminal rank (7:
--      completed/cancelled), and (c) strictly behind the new status's rank.
--   3. A one-time backfill (run separately, not part of this migration file)
--      already advanced the known-affected rows in production on 2026-08-28.
--      This migration file exists so the live database's already-applied fix
--      is captured in version control and reproducible from a fresh replay --
--      it does not need to re-run any backfill itself.
--
-- WHY A TRIGGER, NOT RPC EDITS:
--   Status is written from multiple places (driver app via
--   change_trip_status_with_notification, ops console, bulk tools). A single
--   trigger on the status column covers every writer, including future ones,
--   the same reasoning as the original one-way trigger.
--
-- WHAT THIS DOES NOT DO:
--   - Does not synchronize last_location_at, last_location_chat_at, or
--     trip_location_checkpoints. Live location propagation between the two
--     org-specific rows is a separate, unimplemented follow-up.
--   - Does not resolve genuine conflicts (e.g. one side completed, the other
--     cancelled) -- both sides being at terminal rank blocks any write, by
--     design, so a real business disagreement stays visible instead of being
--     silently overwritten.
--   - Does not change trg_trip_status_audit / log_trip_status_change. Every
--     mirrored UPDATE still produces its own audit row on the target trip,
--     same as the existing one-way leg already did.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._trip_status_rank(p_status text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT CASE lower(trim(coalesce(p_status, '')))
    WHEN 'draft' THEN 0
    WHEN 'pending_acceptance' THEN 1
    WHEN 'assigned' THEN 2
    WHEN 'active' THEN 2
    WHEN 'in_progress' THEN 3
    WHEN 'picked_up' THEN 3
    WHEN 'loading' THEN 3
    WHEN 'at_pickup' THEN 3
    WHEN 'in_transit' THEN 4
    WHEN 'transit' THEN 4
    WHEN 'at_drop' THEN 5
    WHEN 'unloading' THEN 5
    WHEN 'delivered' THEN 6
    WHEN 'done' THEN 6
    WHEN 'completed' THEN 7
    WHEN 'cancelled' THEN 7
    ELSE -1
  END;
$fn$;

COMMENT ON FUNCTION public._trip_status_rank(text) IS
  'Forward-progress rank for a trip status, used only to decide whether one '
  'side of a direct_quote/mover_asset pair is genuinely ahead of the other. '
  'Not a transition-legality graph -- unknown/NULL/empty statuses rank -1 so '
  'they can never be read as forward progress in either direction.';

CREATE OR REPLACE FUNCTION public.fn_sync_mover_asset_trip_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_indent_id   uuid;
  v_source      text;
  v_new_rank    int;
  v_target_id   uuid;
  v_target_rank int;
  v_counterpart_count int;
BEGIN
  v_source := lower(trim(coalesce(NEW.source::text, '')));
  IF v_source NOT IN ('direct_quote', 'mover_asset') THEN
    RETURN NULL;
  END IF;

  v_indent_id := COALESCE(NEW.indent_id, NEW.source_indent_id);
  IF v_indent_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_new_rank := public._trip_status_rank(NEW.status);
  IF v_new_rank < 0 THEN
    -- Unknown/empty NEW.status: never treated as forward progress.
    RETURN NULL;
  END IF;

  IF v_source = 'direct_quote' AND v_new_rank = 0 THEN
    -- Preserves original behavior: draft direct_quote never propagates.
    RETURN NULL;
  END IF;

  -- Hard safety invariant: exactly one counterpart, or do nothing.
  IF v_source = 'direct_quote' THEN
    SELECT count(*) INTO v_counterpart_count
    FROM public.trips m
    WHERE m.source = 'mover_asset'
      AND m.source_indent_id = v_indent_id
      AND m.organization_id <> NEW.organization_id
      AND m.deleted_at IS NULL;
  ELSE
    SELECT count(*) INTO v_counterpart_count
    FROM public.trips a
    WHERE a.source = 'direct_quote'
      AND a.source_indent_id = v_indent_id
      AND a.organization_id <> NEW.organization_id
      AND a.deleted_at IS NULL;
  END IF;

  IF v_counterpart_count <> 1 THEN
    -- Zero or ambiguous (>1) counterparts: do nothing rather than guess.
    RETURN NULL;
  END IF;

  IF v_source = 'direct_quote' THEN
    SELECT m.id, public._trip_status_rank(m.status) INTO v_target_id, v_target_rank
    FROM public.trips m
    WHERE m.source = 'mover_asset'
      AND m.source_indent_id = v_indent_id
      AND m.organization_id <> NEW.organization_id
      AND m.deleted_at IS NULL;
  ELSE
    SELECT a.id, public._trip_status_rank(a.status) INTO v_target_id, v_target_rank
    FROM public.trips a
    WHERE a.source = 'direct_quote'
      AND a.source_indent_id = v_indent_id
      AND a.organization_id <> NEW.organization_id
      AND a.deleted_at IS NULL;
  END IF;

  -- Target status unknown, already terminal, or not strictly behind: do nothing.
  IF v_target_rank < 0 OR v_target_rank >= 7 OR v_new_rank <= v_target_rank THEN
    RETURN NULL;
  END IF;

  UPDATE public.trips t
  SET
    status = NEW.status,
    started_at = COALESCE(t.started_at, NEW.started_at),
    completed_at = CASE
      WHEN NEW.status = 'completed' THEN COALESCE(t.completed_at, NEW.completed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE t.id = v_target_id
    AND t.status IS DISTINCT FROM NEW.status;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.fn_sync_mover_asset_trip_status() IS
  'Mirrors trip status forward between an aggregator (direct_quote) trip and '
  'its mover_asset relative for the same indent, in whichever direction '
  'reflects real progress. Requires exactly one counterpart to exist; does '
  'nothing if zero or more than one match. Never regresses a status, '
  'resurrects a terminal row, or advances via an unrecognized status value '
  'on either side.';

DROP TRIGGER IF EXISTS trg_sync_mover_asset_trip_status ON public.trips;
CREATE TRIGGER trg_sync_mover_asset_trip_status
AFTER UPDATE OF status ON public.trips
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.fn_sync_mover_asset_trip_status();

COMMIT;
