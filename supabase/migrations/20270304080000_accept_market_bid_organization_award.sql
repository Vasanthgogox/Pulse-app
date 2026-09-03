-- A4.4 Phase 2 -- organization Market bid award (award-without-trip).
--
-- accept_market_bid() previously raised 'not_implemented' for any
-- bidder_type <> 'dco'. This adds a real organization branch, deliberately
-- narrower than the DCO branch:
--   - accepts the bid, rejects competing pending bids on the same indent
--     (identical rule to the DCO path)
--   - sets indents.status = 'awarded' and indents.assigned_supplier_id =
--     the bidder organization (same column the existing direct_quotes
--     award flow already uses, so the existing Allocate entry point and
--     resolveIndentDeployQuote's "assigned_indent" fallback mode pick this
--     up for free -- no new resolution mode needed, confirmed by reading
--     both before writing this migration)
--   - does NOT create a trip, does NOT resolve/create a driver stub, does
--     NOT touch owner_vehicle_id -- an organization's own vehicle/driver is
--     chosen at allocation time (A4.4 Phase 3), never at bid time:
--     market_bids.owner_vehicle_id can only ever reference an individual
--     DCO's owner_vehicles row (its own FK target), never an organization's
--     fleet, so there is nothing to resolve here even in principle.
--
-- The DCO branch (bidder_type = 'dco') is reproduced verbatim below --
-- same locking order, same checks, same trip INSERT, same column values.
-- Nothing about it changes.
--
-- Idempotency gains a second case. Previously the only idempotency check
-- was "does a trip already exist for this bid" (correct for DCO, since a
-- trip is always created in the same transaction as acceptance). An
-- organization award has no trip at accept time, so a retry against an
-- already-accepted organization bid would fall through to
-- "invalid_state: bid already decided" instead of succeeding gracefully.
-- Added: if the bid is already 'accepted' and no trip exists yet, return
-- the same success shape with trip_id = NULL.

CREATE OR REPLACE FUNCTION public.accept_market_bid(p_bid_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_bid       public.market_bids;
  v_indent    public.indents;
  v_driver_id uuid;
  v_trip      public.trips%ROWTYPE;
BEGIN
  SELECT * INTO v_bid FROM public.market_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  -- Lock the INDENT first -- the concurrency rule locked for this contract.
  -- Any concurrent award attempt on this same indent (another market_bids
  -- row, a driver_direct_bids accept via an indent-linked post, or an
  -- org-to-org award RPC) serializes on this same row lock.
  SELECT * INTO v_indent FROM public.indents WHERE id = v_bid.indent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: indent % for bid %', v_bid.indent_id, p_bid_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_indent.organization_id
      AND om.user_id = (select auth.uid())
      AND om.status = 'active'
      AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the organization that owns this indent';
  END IF;

  -- Idempotency 1: a trip already exists for this bid (DCO path always,
  -- organization path once allocation/Phase 3 has run).
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.source = 'market_bid' AND t.source_market_bid_id = v_bid.id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', v_bid.status);
  END IF;

  -- Idempotency 2: organization award already accepted, no trip yet (the
  -- normal, expected state between accept and allocation).
  IF v_bid.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', NULL, 'status', 'accepted');
  END IF;

  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state: bid already decided (current: %)', v_bid.status;
  END IF;

  IF lower(trim(coalesce(v_indent.status, ''))) NOT IN ('open', 'broadcast') THEN
    RAISE EXCEPTION 'indent_not_open: indent % is not open for award (status=%)', v_indent.id, v_indent.status;
  END IF;

  -- At most one non-cancelled canonical trip per indent -- the same guard
  -- release_and_reopen_indent() uses, backstopped by the narrowed
  -- trips_one_per_indent unique index.
  IF EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.indent_id = v_indent.id AND t.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'already_awarded: indent % already has an active canonical trip', v_indent.id;
  END IF;

  IF v_bid.bidder_type = 'organization' THEN
    IF v_bid.bidder_organization_id IS NULL THEN
      RAISE EXCEPTION 'invalid_bid: organization bid % has no bidder_organization_id', v_bid.id;
    END IF;

    UPDATE public.market_bids
    SET status = 'accepted', accepted_at = now(), updated_at = now()
    WHERE id = p_bid_id;

    -- Only one bid may win this indent -- same rule as the DCO path.
    UPDATE public.market_bids
    SET status = 'rejected', updated_at = now()
    WHERE indent_id = v_indent.id AND id <> v_bid.id AND status = 'pending';

    UPDATE public.indents
    SET status = 'awarded',
        assigned_supplier_id = v_bid.bidder_organization_id,
        updated_at = now()
    WHERE id = v_indent.id;

    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', NULL, 'status', 'accepted');
  END IF;

  IF v_bid.bidder_type <> 'dco' THEN
    RAISE EXCEPTION 'unexpected_bidder_type: %', v_bid.bidder_type;
  END IF;

  -- H4 (Gate 4 hardening): the vehicle was valid when the bid was submitted,
  -- but acceptance is the moment it becomes part of a real Trip -- revalidate
  -- rather than trust a snapshot that may be stale by the time of award.
  -- Same check submit_market_bid already performs at submission time
  -- (ownership + not soft-deleted); acceptance re-checks the same two
  -- things, not a new, stricter bar.
  IF v_bid.owner_vehicle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.owner_vehicles ov
    WHERE ov.id = v_bid.owner_vehicle_id
      AND ov.owner_user_id = v_bid.bidder_user_id
      AND ov.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'vehicle_no_longer_eligible: owner_vehicle % is no longer valid for bidder %', v_bid.owner_vehicle_id, v_bid.bidder_user_id;
  END IF;

  v_driver_id := public._resolve_or_create_market_driver(v_indent.organization_id, v_bid.bidder_user_id);

  INSERT INTO public.trips (
    organization_id,
    trip_number,
    source,
    source_market_bid_id,
    indent_id,
    owner_vehicle_id,
    pickup_area,
    drop_location,
    client_name,
    client_price,
    supplier_rate,
    supplier_id,
    trip_payout_mode,
    driver_id,
    status,
    pickup_date,
    load_type,
    platform_fee,
    driver_commission,
    payment_status,
    amount_paid
  ) VALUES (
    v_indent.organization_id,
    '',
    'market_bid',
    v_bid.id,
    v_indent.id,
    v_bid.owner_vehicle_id,
    coalesce(v_indent.pickup_area, ''),
    coalesce(v_indent.drop_location, ''),
    coalesce(v_indent.client_name, ''),
    v_bid.amount,
    0,
    NULL,
    'asset',
    v_driver_id,
    'assigned',
    v_indent.pickup_date,
    coalesce(v_indent.load_type, ''),
    0,
    v_bid.amount,
    'pending',
    0
  )
  RETURNING * INTO v_trip;

  UPDATE public.market_bids
  SET status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE id = p_bid_id;

  -- Only one bid may win this indent -- close out the rest, across the
  -- market_bids table itself. Pending bids/driver_direct_bids on any
  -- indent-linked LOAD post are already handled by the terminal-status
  -- trigger fired by the indents.status update below.
  UPDATE public.market_bids
  SET status = 'rejected', updated_at = now()
  WHERE indent_id = v_indent.id AND id <> v_bid.id AND status = 'pending';

  UPDATE public.indents SET status = 'awarded', updated_at = now() WHERE id = v_indent.id;

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', 'accepted');
END;
$function$;
