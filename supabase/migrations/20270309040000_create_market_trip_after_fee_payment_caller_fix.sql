-- A8.6.2 follow-up — create_market_trip_after_fee_payment()'s caller check
-- was too narrow. It only allowed the bidder themselves or service_role,
-- but when fee_payment_status resolves to 'not_required' (the fee stays
-- inactive in production today), the BUSINESS must be able to complete
-- award + trip creation in a single "Accept" action, exactly like the old
-- accept_market_bid() did -- and the business is not the bidder. Widen the
-- check to also allow a non-driver active member of the indent-owning
-- organization (the same authorization award_market_bid() already
-- requires), alongside the bidder themselves (the real future A8.7 flow,
-- where the driver's own app triggers unlock after paying) and service_role
-- (A8.7's webhook handler). No other change to this function.

CREATE OR REPLACE FUNCTION public.create_market_trip_after_fee_payment(p_bid_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_bid           public.market_bids;
  v_indent        public.indents;
  v_indent_org_id uuid;
  v_driver_id     uuid;
  v_trip          public.trips%ROWTYPE;
BEGIN
  SELECT * INTO v_bid FROM public.market_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  SELECT organization_id INTO v_indent_org_id FROM public.indents WHERE id = v_bid.indent_id;

  -- CHANGED: caller must be the bidder themselves, OR a non-driver active
  -- member of the indent-owning org (same authorization award_market_bid()
  -- requires -- lets the business complete a fee-inactive "Accept" in one
  -- action), OR service_role (A8.7's webhook handler).
  IF NOT (
    (select auth.uid()) = v_bid.bidder_user_id
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = v_indent_org_id
        AND om.user_id = (select auth.uid())
        AND om.status = 'active'
        AND om.role <> 'driver'
    )
    OR current_user = 'service_role'
    OR current_setting('role', true) = 'service_role'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be the bidder who won this bid or an authorized member of the load-owning organization';
  END IF;

  IF v_bid.bidder_type <> 'dco' THEN
    RAISE EXCEPTION 'invalid_bidder_type: organization awards create a trip via create_trip_from_assigned_indent, not this function';
  END IF;

  -- Idempotent on trips.source_market_bid_id, same pattern as before.
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.source = 'market_bid' AND t.source_market_bid_id = v_bid.id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', v_bid.status);
  END IF;

  IF v_bid.status <> 'accepted' THEN
    RAISE EXCEPTION 'invalid_state: bid % is not an accepted award (current: %)', p_bid_id, v_bid.status;
  END IF;

  IF v_bid.fee_payment_status NOT IN ('paid', 'not_required') THEN
    RAISE EXCEPTION 'fee_payment_pending: platform fee must be paid before a trip can be created for bid % (current: %)', p_bid_id, v_bid.fee_payment_status;
  END IF;

  SELECT * INTO v_indent FROM public.indents WHERE id = v_bid.indent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: indent % for bid %', v_bid.indent_id, p_bid_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.indent_id = v_indent.id AND t.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'already_awarded: indent % already has an active canonical trip', v_indent.id;
  END IF;

  IF NOT public.is_driver_available(v_bid.bidder_user_id) THEN
    RAISE EXCEPTION 'driver_unavailable: this driver is already on an active trip';
  END IF;

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
    amount_paid,
    platform_fee_calc_snapshot,
    sale_rate_basis
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
    coalesce(v_bid.platform_fee_amount, 0),
    v_bid.amount,
    'pending',
    0,
    v_bid.platform_fee_calc_snapshot,
    'per_trip'
  )
  RETURNING * INTO v_trip;

  UPDATE public.market_bids
  SET status = 'superseded', updated_at = now()
  WHERE bidder_user_id = v_bid.bidder_user_id
    AND status = 'pending'
    AND id <> v_bid.id;

  UPDATE public.driver_direct_bids
  SET status = 'superseded', updated_at = now()
  WHERE driver_user_id = v_bid.bidder_user_id
    AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', 'accepted');
END;
$function$;

REVOKE ALL ON FUNCTION public.create_market_trip_after_fee_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_market_trip_after_fee_payment(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_market_trip_after_fee_payment(uuid) IS
  'A8.6.2: DCO-only. Creates the trip for an accepted market_bids row once fee_payment_status is paid/not_required. Caller must be the bidder themselves, an authorized member of the indent-owning org (lets the business complete a fee-inactive Accept in one action), or service_role. Re-checks is_driver_available() and vehicle eligibility. client_price = bid.amount; platform_fee/platform_fee_calc_snapshot read from the already-resolved market_bids row. sale_rate_basis is explicitly ''per_trip'' so the 20270308103000 per-MT trigger never overrides client_price. Idempotent on trips.source_market_bid_id.';
