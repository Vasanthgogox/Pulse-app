-- A8.6.2 — split award from trip creation for the DCO Marketplace branch,
-- gated on the (new, independent) Marketplace platform-fee payment state.
--
-- Commercial model this implements (frozen A8.6.1 design): the client pays
-- the winning bidder the full bid amount; the bidder separately pays Pulse
-- the platform fee; the fee gates trip creation and contact reveal, not the
-- client price. client_price = bid amount for BOTH bidder types, never
-- bid + fee. driver_commission/supplier_rate stay the full gross bid
-- amount -- no net-of-fee value is ever persisted anywhere.

-- ---------------------------------------------------------------------
-- award_market_bid(): unified award step for both bidder types. Resolves
-- and locks in the platform fee (now for BOTH branches -- previously
-- DCO-only) but creates NO trip for either branch.
CREATE OR REPLACE FUNCTION public.award_market_bid(p_bid_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_bid          public.market_bids;
  v_indent       public.indents;
  v_fee_calc     jsonb;
  v_platform_fee numeric;
  v_fee_status   text;
BEGIN
  SELECT * INTO v_bid FROM public.market_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  -- Lock the INDENT first -- unchanged concurrency rule from accept_market_bid.
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

  -- No trip is ever created by this function for either branch now, so
  -- "already decided" is fully expressed by market_bids.status alone -- no
  -- trips lookup needed here at all (a simplification vs. the old
  -- accept_market_bid, which had to special-case "accepted, no trip yet"
  -- only for the organization branch; here it is uniform for both).
  IF v_bid.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'ok', true, 'bid_id', p_bid_id, 'status', 'accepted',
      'fee_payment_status', v_bid.fee_payment_status,
      'platform_fee_amount', v_bid.platform_fee_amount
    );
  END IF;

  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state: bid already decided (current: %)', v_bid.status;
  END IF;

  IF lower(trim(coalesce(v_indent.status, ''))) NOT IN ('open', 'broadcast') THEN
    RAISE EXCEPTION 'indent_not_open: indent % is not open for award (status=%)', v_indent.id, v_indent.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.indent_id = v_indent.id AND t.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'already_awarded: indent % already has an active canonical trip', v_indent.id;
  END IF;

  -- A8.6.2: fee resolution now runs for BOTH bidder types (previously DCO
  -- only) -- this is the one genuinely new behavior for the organization
  -- branch. Never recompute after this; locked into market_bids row below.
  v_fee_calc     := public.calculate_marketplace_platform_fee(v_bid.amount);
  v_platform_fee := coalesce((v_fee_calc->>'resolved_fee')::numeric, 0);
  v_fee_status   := CASE WHEN v_platform_fee > 0 THEN 'required' ELSE 'not_required' END;

  IF v_bid.bidder_type = 'organization' THEN
    IF v_bid.bidder_organization_id IS NULL THEN
      RAISE EXCEPTION 'invalid_bid: organization bid % has no bidder_organization_id', v_bid.id;
    END IF;

    UPDATE public.market_bids
    SET status = 'accepted', accepted_at = now(), updated_at = now(),
        platform_fee_amount = v_platform_fee,
        platform_fee_calc_snapshot = v_fee_calc,
        fee_payment_status = v_fee_status
    WHERE id = p_bid_id;

    UPDATE public.market_bids
    SET status = 'rejected', updated_at = now()
    WHERE indent_id = v_indent.id AND id <> v_bid.id AND status = 'pending';

    UPDATE public.indents
    SET status = 'awarded',
        assigned_supplier_id = v_bid.bidder_organization_id,
        updated_at = now()
    WHERE id = v_indent.id;

    RETURN jsonb_build_object(
      'ok', true, 'bid_id', p_bid_id, 'status', 'accepted',
      'fee_payment_status', v_fee_status, 'platform_fee_amount', v_platform_fee
    );
  END IF;

  IF v_bid.bidder_type <> 'dco' THEN
    RAISE EXCEPTION 'unexpected_bidder_type: %', v_bid.bidder_type;
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

  -- _resolve_or_create_market_driver() deliberately NOT called here anymore
  -- -- it moves to create_market_trip_after_fee_payment(), the moment a
  -- trip actually gets created. Creating the drivers-row stub before a fee
  -- is even paid would be premature side-effecting for a bid that might
  -- never convert.

  UPDATE public.market_bids
  SET status = 'accepted', accepted_at = now(), updated_at = now(),
      platform_fee_amount = v_platform_fee,
      platform_fee_calc_snapshot = v_fee_calc,
      fee_payment_status = v_fee_status
  WHERE id = p_bid_id;

  UPDATE public.market_bids
  SET status = 'rejected', updated_at = now()
  WHERE indent_id = v_indent.id AND id <> v_bid.id AND status = 'pending';

  -- A6.3 superseding: unchanged timing -- runs at AWARD, not at eventual
  -- trip creation. NOTE (A8.6.2 known gap, documented in the plan): this
  -- only closes out bids that are already PENDING at award time. A driver
  -- can still submit and be awarded a second bid while this one sits
  -- fee-pending, since is_driver_available() has no visibility into an
  -- accepted-but-unpaid market_bids row. Not fixed in this phase.
  UPDATE public.market_bids
  SET status = 'superseded', updated_at = now()
  WHERE bidder_user_id = v_bid.bidder_user_id
    AND status = 'pending'
    AND id <> v_bid.id;

  UPDATE public.driver_direct_bids
  SET status = 'superseded', updated_at = now()
  WHERE driver_user_id = v_bid.bidder_user_id
    AND status = 'pending';

  UPDATE public.indents SET status = 'awarded', updated_at = now() WHERE id = v_indent.id;

  RETURN jsonb_build_object(
    'ok', true, 'bid_id', p_bid_id, 'status', 'accepted',
    'fee_payment_status', v_fee_status, 'platform_fee_amount', v_platform_fee
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.award_market_bid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_market_bid(uuid) TO authenticated;

COMMENT ON FUNCTION public.award_market_bid(uuid) IS
  'A8.6.2: unified award step for both bidder types. Resolves and locks in the Marketplace platform fee (calculate_marketplace_platform_fee) for BOTH branches now, writing platform_fee_amount/platform_fee_calc_snapshot/fee_payment_status onto market_bids. Creates NO trip for either branch -- see create_market_trip_after_fee_payment() (DCO) and create_trip_from_assigned_indent() (organization, via self-allocation). Known gap: a driver can hold two simultaneously-accepted, fee-pending awards since is_driver_available() only inspects trips -- see A8.6.2 plan doc.';

-- ---------------------------------------------------------------------
-- create_market_trip_after_fee_payment(): DCO only. Creates the trip once
-- the platform fee is paid (or was never required).
CREATE OR REPLACE FUNCTION public.create_market_trip_after_fee_payment(p_bid_id uuid)
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

  -- Caller must be the bidder themselves (finalizing their own paid award),
  -- or service_role (the seam A8.7's webhook handler will use to chain
  -- confirm_marketplace_fee_payment -> this function server-side).
  IF NOT (
    (select auth.uid()) = v_bid.bidder_user_id
    OR current_user = 'service_role'
    OR current_setting('role', true) = 'service_role'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be the bidder who won this bid';
  END IF;

  IF v_bid.bidder_type <> 'dco' THEN
    RAISE EXCEPTION 'invalid_bidder_type: organization awards create a trip via create_trip_from_assigned_indent, not this function';
  END IF;

  -- Idempotency: identical pattern to the old accept_market_bid's check 1.
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

  -- Same one-non-cancelled-canonical-trip invariant as before.
  IF EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.indent_id = v_indent.id AND t.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'already_awarded: indent % already has an active canonical trip', v_indent.id;
  END IF;

  -- Re-check: the driver may have become unavailable DURING the
  -- fee-pending window -- do not trust award_market_bid's earlier check.
  IF NOT public.is_driver_available(v_bid.bidder_user_id) THEN
    RAISE EXCEPTION 'driver_unavailable: this driver is already on an active trip';
  END IF;

  -- Same vehicle revalidation discipline as before -- stale-by-now check.
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
    v_bid.amount,                                -- client_price = bid amount, NOT bid + fee
    0,
    NULL,
    'asset',
    v_driver_id,
    'assigned',
    v_indent.pickup_date,
    coalesce(v_indent.load_type, ''),
    coalesce(v_bid.platform_fee_amount, 0),       -- read from the bid row, not recomputed
    v_bid.amount,
    'pending',
    0,
    v_bid.platform_fee_calc_snapshot,             -- read from the bid row
    'per_trip'                                    -- explicit: suppresses trips_apply_sale_rate_snapshot's
                                                   -- per-MT client_price override (20270308103000) for
                                                   -- Marketplace trips -- the winning bid is always the
                                                   -- authoritative price here, regardless of the indent's
                                                   -- own sale_rate_basis. COALESCE(NEW.x, indent.x) in that
                                                   -- trigger only back-fills a NULL; an explicit 'per_trip'
                                                   -- here is never overwritten by it.
  )
  RETURNING * INTO v_trip;

  -- Belt-and-suspenders: close out any pending bid this driver submitted
  -- AFTER award but before this payment confirmed (award_market_bid's
  -- superseding pass could not have caught these -- they did not exist
  -- yet). Does not fully close the money-for-nothing gap documented on
  -- award_market_bid() above.
  UPDATE public.market_bids
  SET status = 'superseded', updated_at = now()
  WHERE bidder_user_id = v_bid.bidder_user_id
    AND status = 'pending'
    AND id <> v_bid.id;

  UPDATE public.driver_direct_bids
  SET status = 'superseded', updated_at = now()
  WHERE driver_user_id = v_bid.bidder_user_id
    AND status = 'pending';

  -- indents.status stays 'awarded' (set already by award_market_bid) -- NOT
  -- advanced to 'completed' here, matching the old accept_market_bid's
  -- behavior exactly.

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', 'accepted');
END;
$function$;

REVOKE ALL ON FUNCTION public.create_market_trip_after_fee_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_market_trip_after_fee_payment(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_market_trip_after_fee_payment(uuid) IS
  'A8.6.2: DCO-only. Creates the trip for an accepted market_bids row once fee_payment_status is paid/not_required. Re-checks is_driver_available() and vehicle eligibility (state may have changed while payment was pending). client_price = bid.amount (client pays the bid, not bid+fee); platform_fee/platform_fee_calc_snapshot read from the already-resolved market_bids row, never recomputed. sale_rate_basis is explicitly ''per_trip'' so the 20270308103000 per-MT trigger never overrides client_price for a Marketplace trip. Idempotent on trips.source_market_bid_id.';

-- ---------------------------------------------------------------------
-- accept_market_bid(): DEPRECATED, kept as a thin compatibility wrapper.
-- Not dropped -- no way to confirm nothing outside the tracked frontend
-- calls it by name (a saved SQL Editor snippet, a support runbook, etc).
-- The one real in-repo caller (AwardModal.tsx) is repointed to
-- award_market_bid directly.
CREATE OR REPLACE FUNCTION public.accept_market_bid(p_bid_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN public.award_market_bid(p_bid_id);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_market_bid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_market_bid(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_market_bid(uuid) IS
  'DEPRECATED (A8.6.2) -- thin compatibility wrapper around award_market_bid(). No trip is created here for either branch; see award_market_bid()/create_market_trip_after_fee_payment(). Kept for any caller outside the tracked frontend; the frontend itself calls award_market_bid directly. Safe to remove in a future cleanup once confirmed unused via logs.';

-- ---------------------------------------------------------------------
-- confirm_marketplace_fee_payment(): the A8.7 seam. Represents a
-- server-confirmed payment outcome. NOT callable by an ordinary bidder on
-- themselves -- grant pattern mirrors admin_approve_profile's established
-- idiom in this codebase (broad EXECUTE grant, narrow internal gate).
CREATE OR REPLACE FUNCTION public.confirm_marketplace_fee_payment(
  p_market_bid_id uuid,
  p_provider_payment_id text DEFAULT NULL,
  p_provider text DEFAULT 'manual_test',
  p_failure_reason text DEFAULT NULL,
  p_outcome text DEFAULT 'paid'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_bid     public.market_bids;
  v_payment public.marketplace_fee_payments;
BEGIN
  IF NOT (
    current_user = 'service_role'
    OR current_setting('role', true) = 'service_role'
    OR public.has_platform_permission((select auth.uid()), 'marketplace_fees.manage')
  ) THEN
    RAISE EXCEPTION 'unauthorized: marketplace_fees.manage permission (or service_role) required';
  END IF;

  IF p_outcome NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'invalid_outcome: % (must be paid or failed)', p_outcome;
  END IF;

  SELECT * INTO v_bid FROM public.market_bids WHERE id = p_market_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: market bid %', p_market_bid_id;
  END IF;

  -- Idempotency: a retry against an already-paid bid is a no-op success.
  IF v_bid.fee_payment_status = 'paid' AND p_outcome = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'market_bid_id', p_market_bid_id, 'fee_payment_status', 'paid');
  END IF;

  IF v_bid.fee_payment_status NOT IN ('required', 'pending', 'failed') THEN
    RAISE EXCEPTION 'invalid_state: bid % fee_payment_status is % -- nothing to confirm', p_market_bid_id, v_bid.fee_payment_status;
  END IF;

  -- Reuse an existing active row if one is mid-flight, else create the
  -- attempt record here (A8.6.2 has no separate "initiate" RPC yet -- that
  -- is A8.7's job; this function stands in for "provider told us the
  -- outcome" for both the not-yet-initiated and already-pending cases).
  SELECT * INTO v_payment
  FROM public.marketplace_fee_payments
  WHERE market_bid_id = p_market_bid_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.marketplace_fee_payments (
      market_bid_id, bidder_type, bidder_user_id, bidder_organization_id,
      amount, provider, provider_payment_id, status
    ) VALUES (
      p_market_bid_id, v_bid.bidder_type, v_bid.bidder_user_id, v_bid.bidder_organization_id,
      coalesce(v_bid.platform_fee_amount, 0), p_provider, p_provider_payment_id, 'pending'
    )
    RETURNING * INTO v_payment;
  END IF;

  IF p_outcome = 'paid' THEN
    UPDATE public.marketplace_fee_payments
    SET status = 'paid', paid_at = now(), provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id), updated_at = now()
    WHERE id = v_payment.id;

    UPDATE public.market_bids
    SET fee_payment_status = 'paid', updated_at = now()
    WHERE id = p_market_bid_id;

    RETURN jsonb_build_object('ok', true, 'market_bid_id', p_market_bid_id, 'fee_payment_status', 'paid');
  ELSE
    UPDATE public.marketplace_fee_payments
    SET status = 'failed', failed_at = now(), failure_reason = p_failure_reason, updated_at = now()
    WHERE id = v_payment.id;

    UPDATE public.market_bids
    SET fee_payment_status = 'failed', updated_at = now()
    WHERE id = p_market_bid_id;

    RETURN jsonb_build_object('ok', true, 'market_bid_id', p_market_bid_id, 'fee_payment_status', 'failed');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_marketplace_fee_payment(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_marketplace_fee_payment(uuid, text, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_marketplace_fee_payment(uuid, text, text, text, text) IS
  'A8.6.2 seam for A8.7: represents a server-confirmed Marketplace platform-fee payment outcome. NOT callable by an ordinary bidder on themselves -- internal check requires service_role OR marketplace_fees.manage (mirrors admin_approve_profile''s grant pattern: broad EXECUTE grant, narrow internal gate). For this phase, the only real caller is a staff/service-role/SQL-console path for manual test confirmation; A8.7''s real webhook handler will call this as service_role once a payment gateway exists. p_outcome=failed leaves the bid accepted and retryable -- no auto-expiry in this phase. NOTE: reuses marketplace_fees.manage (today: fee-config editing only) as a minimum-footprint choice for this manual-test-only path -- a dedicated marketplace_fee_payments.manage permission is a candidate for A8.7 if this becomes a real ops workflow.';
