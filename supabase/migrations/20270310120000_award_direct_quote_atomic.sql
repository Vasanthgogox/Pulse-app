-- Phase 6b: atomic replacement for useAwardQuote.ts's org-direct-quote award
-- flow (features/network/hooks/useAwardQuote.ts, non-driver-direct branch).
--
-- Today: updateDirectQuoteStatus(winner,'accepted') -> sequential for-loop
-- rejecting each competing direct_quotes/driver_direct_bids row one call at a
-- time, breaking early (leaving the remainder un-rejected) on the first
-- failure ("Award partially failed" is a real, documented, reachable state)
-- -> separate updateIndent(status:'awarded') call. Three-plus independent,
-- non-transactional round trips; no lock, so two dispatchers awarding the
-- same indent concurrently are not serialized either.
--
-- Key discovery from tracing accept_driver_direct_bid: setting
-- indents.status = 'awarded' already fires the existing
-- deactivate_posts_for_terminal_indent trigger, which rejects every pending
-- bids/driver_direct_bids/market_bids row linked to this indent's posts.
-- That trigger does NOT touch direct_quotes (a separate, non-post-based
-- mechanism) -- so this RPC only needs to handle the winner + competing
-- direct_quotes explicitly; competing driver_direct_bids/bids/market_bids are
-- handled by the same trigger this RPC already relies on, with no new code
-- duplicating what it does. This mirrors the exact division of labor
-- accept_driver_direct_bid already uses for its own indent-linked case.
--
-- Does NOT create a trip: confirmed the current TS flow's success message
-- ("Load awarded -- supplier can allocate from Action required.") and the
-- absence of any trip-insert call in useAwardQuote.ts's non-driver-direct
-- branch -- trip creation for this path is a separate, later action
-- (create_trip_from_direct_quote), not part of Award.
--
-- Error/return convention matches this domain's existing RPCs exactly
-- (accept_driver_direct_bid, reject_driver_direct_bid): RAISE EXCEPTION with
-- a "code: message" string on failure (surfaces as error.message to the
-- client, same as today), jsonb_build_object on success.

CREATE OR REPLACE FUNCTION public.award_direct_quote(p_indent_id uuid, p_winning_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_indent   public.indents%ROWTYPE;
  v_winner   public.direct_quotes%ROWTYPE;
  v_rejected int;
BEGIN
  SELECT * INTO v_indent FROM public.indents WHERE id = p_indent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: indent %', p_indent_id;
  END IF;
  IF NOT public.is_org_member(v_indent.organization_id) THEN
    RAISE EXCEPTION 'unauthorized: caller is not a member of org %', v_indent.organization_id;
  END IF;

  SELECT * INTO v_winner FROM public.direct_quotes WHERE id = p_winning_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: direct_quote %', p_winning_quote_id;
  END IF;
  IF v_winner.indent_id <> p_indent_id THEN
    RAISE EXCEPTION 'invalid_state: quote % does not belong to indent %', p_winning_quote_id, p_indent_id;
  END IF;

  -- Idempotency, checked before the pending-status guard (same rationale as
  -- accept_driver_direct_bid): a retry on an already-awarded indent with the
  -- same winner returns the current state instead of raising.
  IF lower(trim(coalesce(v_indent.status, ''))) = 'awarded' AND v_winner.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', true, 'indent_id', p_indent_id, 'accepted_quote_id', p_winning_quote_id, 'rejected_count', 0);
  END IF;

  IF lower(trim(coalesce(v_indent.status, ''))) IN ('awarded', 'completed', 'cancelled', 'closed', 'expired') THEN
    RAISE EXCEPTION 'indent_not_open: indent % is not open for award (status=%)', p_indent_id, v_indent.status;
  END IF;
  IF v_winner.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state: quote already decided (current: %)', v_winner.status;
  END IF;

  UPDATE public.direct_quotes
  SET status = 'accepted', updated_at = now()
  WHERE id = p_winning_quote_id;

  UPDATE public.direct_quotes
  SET status = 'rejected', updated_at = now()
  WHERE indent_id = p_indent_id
    AND id <> p_winning_quote_id
    AND status = 'pending';
  GET DIAGNOSTICS v_rejected = ROW_COUNT;

  -- Fires deactivate_posts_for_terminal_indent, which rejects pending
  -- bids/driver_direct_bids/market_bids linked to this indent's posts --
  -- unchanged, existing trigger behavior, not duplicated here.
  UPDATE public.indents SET status = 'awarded', updated_at = now() WHERE id = p_indent_id;

  RETURN jsonb_build_object('ok', true, 'indent_id', p_indent_id, 'accepted_quote_id', p_winning_quote_id, 'rejected_count', v_rejected);
END;
$function$;

REVOKE ALL ON FUNCTION public.award_direct_quote(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_direct_quote(uuid, uuid) TO authenticated;
