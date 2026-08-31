-- WS6 (Gate 4, step 2 of 7): release_and_reopen_indent().
--
-- Explicit, Business-authorized lifecycle operation for an Indent whose
-- canonical execution trip was cancelled. Cancellation never auto-reopens an
-- Indent (confirmed by read-only audit: no existing trigger/RPC does this
-- today) -- this is the only path back to open/broadcast, and it is only
-- ever called deliberately.
--
-- Guard design (locked after a dedicated read-only check): this function
-- does NOT use indents.status = 'completed' or trips.status = 'completed' as
-- evidence of genuine delivery. The audit proved there is no authoritative
-- completion signal in this system today -- change_trip_status_with_notification()
-- accepts any p_new_status with zero validation, and trips.pod_required /
-- pod_received_at are read-only display fields never wired to any status
-- gate. Both award_indent_to_trip() and create_trip_from_assigned_indent()
-- already set indents.status='completed' the moment a trip is created --
-- including, per create_trip_from_assigned_indent's own idempotent branch,
-- when that trip is already 'cancelled'. Treating 'completed' as proof of
-- delivery would therefore make this function reject a legitimate release.
--
-- Instead, the single source of truth is the same guard the shared award
-- engine uses: does any non-cancelled trip currently hold this indent_id?
-- If yes, release is refused (whether that trip is genuinely mid-execution
-- or genuinely delivered -- either way it is still the live canonical trip
-- and must not be superseded). If no -- the only trip(s) for this indent are
-- all cancelled, or the release step 3 sanity check below already required
-- the indent to have been through a real award -- release proceeds.
--
-- Step-3 sanity check: releasable indents.status values were derived from
-- the actual award flows (read-only check, this session), not guessed.
-- set_indent_assigned_supplier_on_quote_accepted() sets status='awarded' the
-- moment a direct_quote is accepted; award_indent_to_trip(),
-- create_trip_from_assigned_indent(), and create_trip_from_direct_quote()
-- all then set status='completed' the moment a trip is created. Both values
-- represent "this indent has been matched," which is exactly the state this
-- RPC exists to reverse -- an indent that is still 'open'/'broadcast' (never
-- awarded) or already 'cancelled'/'closed'/'expired' (a different terminal
-- state) is not a valid target for "release and reopen."

CREATE OR REPLACE FUNCTION public.release_and_reopen_indent(p_indent_id uuid)
RETURNS public.indents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_indent public.indents%ROWTYPE;
  v_uid uuid := auth.uid();
  v_next_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_indent
  FROM public.indents
  WHERE id = p_indent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'indent_not_found: %', p_indent_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_indent.organization_id
      AND om.user_id = v_uid
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller is not an active member of the indent-owning organization';
  END IF;

  IF lower(trim(coalesce(v_indent.status, ''))) NOT IN ('awarded', 'completed') THEN
    RAISE EXCEPTION 'invalid_lifecycle: indent % is not in an awarded/matched state (status=%)', p_indent_id, v_indent.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.indent_id = p_indent_id
      AND t.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'active_canonical_trip_exists: indent % still has a non-cancelled canonical trip', p_indent_id;
  END IF;

  -- Same choice logic as the one precedent for un-sticking an indent's status
  -- (20270128103100's backfill): prefer 'broadcast' when an active LOAD story
  -- still points at this indent, else 'open'.
  v_next_status := CASE
    WHEN EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.source_indent_id = v_indent.id
        AND coalesce(p.is_active, false) = true
        AND upper(coalesce(p.type, '')) = 'LOAD'
    ) THEN 'broadcast'
    ELSE 'open'
  END;

  UPDATE public.indents
  SET status = v_next_status, updated_at = now()
  WHERE id = p_indent_id
  RETURNING * INTO v_indent;

  RETURN v_indent;
END;
$$;

REVOKE ALL ON FUNCTION public.release_and_reopen_indent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_and_reopen_indent(uuid) TO authenticated;

COMMENT ON FUNCTION public.release_and_reopen_indent(uuid) IS
  'WS6: explicit Business-authorized release of an awarded/matched Indent whose canonical trip was cancelled, back to open/broadcast for a new award. Rejects if any non-cancelled trip still holds indent_id -- the same guard the shared award engine uses, deliberately never reasoning about indents.status/trips.status = completed as proof of delivery (no authoritative completion signal exists in this system). Never nulls trips.indent_id -- historical lineage is permanent. Never auto-invoked on cancellation -- this is the only path back to open/broadcast.';
