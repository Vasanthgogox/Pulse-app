-- DCO-4 implementation, part 3/3: the actual marketplace -> DCO trip fix.
-- This is the change that unwinds the core defect DCO-1 found: both bid
-- paths were stamping a DCO's payment into trips.driver_commission (an
-- employee-style field), zeroing supplier_rate, nulling supplier_id, and
-- forcing trip_payout_mode='asset' -- so ensureAssetCompletionAutoEntries
-- posted every DCO's settlement as a DRIVER_COMMISSION payable at
-- completion. None of that existing "asset" machinery is touched here; DCO
-- trips are simply routed into the already-correct 'market' lane instead
-- of being forced into 'asset'.
--
-- Path A (market_bids): the DCO-bid eligibility gate moves from
-- is_driver_fleet_owner() (a different, legacy capability -- confirmed to
-- also gate unrelated Reach distribution-channel visibility elsewhere, so
-- it is deliberately left completely alone everywhere else) to
-- is_dco_eligible(). Per the locked DCO-4.1 contract, award_market_bid() is
-- NOT modified -- it already never re-checks eligibility for either bidder
-- type (traced live), so an awarded DCO bid's bidder_type='dco' is exactly
-- the right, already-existing immutable evidence of the commitment.
-- create_market_trip_after_fee_payment() also does not re-check
-- is_dco_eligible() -- per the same contract, "classify from the persisted
-- winning bid's bidder_type='dco', not from the bidder's current profile
-- state," since suspension must not create a paid-but-no-trip state
-- (traced: no refund/cancellation path exists at all today, for any
-- reason).
--
-- Confirmed business decision: owner_vehicle_id is now MANDATORY on a DCO
-- bid, not merely validated when supplied -- a DCO is defined as
-- owner+driver+vehicle-owner (DCO-2), so the commitment itself must name
-- the vehicle, not just eventual trip execution. This also guarantees
-- create_market_trip_after_fee_payment always has a real vehicle to carry
-- onto the trip via v_bid.owner_vehicle_id.
--
-- Path B (driver_direct_bids): submit_driver_direct_bid() is NOT modified
-- at all -- it was never DCO-exclusive (no bidder_type column exists on
-- this table; any driver, employed or independent, can use it, and
-- is_driver_fleet_owner() there gates an unrelated Reach channel-visibility
-- rule). accept_driver_direct_bid() now checks is_dco_eligible() at the
-- single moment acceptance and trip creation happen (one transaction, no
-- award/payment gap exists on this path) and branches the trip's financial
-- fields accordingly -- a non-DCO driver's trip is byte-for-byte identical
-- to today's behavior.

CREATE OR REPLACE FUNCTION public.submit_market_bid(
  p_indent_id uuid,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_bidder_organization_id uuid DEFAULT NULL,
  p_owner_vehicle_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_bidder_type text;
  v_bid_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- p_bidder_organization_id NULL => DCO path. Set => Business path.
  IF p_bidder_organization_id IS NULL THEN
    v_bidder_type := 'dco';

    -- CHANGED (DCO-4): was is_driver_fleet_owner(v_uid). That capability is
    -- a different, unapproved, self-service concept (see DCO-1/DCO-2 trace)
    -- that happens to also gate Reach distribution-channel visibility
    -- elsewhere -- left untouched there. DCO marketplace eligibility is now
    -- its own, admin-approved concept: dco_profiles.status='APPROVED' AND
    -- not currently an active employed driver anywhere.
    IF NOT public.is_dco_eligible(v_uid) THEN
      RAISE EXCEPTION 'unauthorized: approved, currently-independent DCO status required for a DCO bid';
    END IF;

    -- A6.3: a driver with a non-terminal trip cannot submit (or revise) a
    -- Market bid until that trip completes.
    IF NOT public.is_driver_available(v_uid) THEN
      RAISE EXCEPTION 'driver_unavailable: you are on an active trip -- complete it before bidding on another load';
    END IF;

    -- CHANGED (DCO-4): owner_vehicle_id is now mandatory for a DCO bid, not
    -- merely validated when supplied. Confirmed as an explicit business
    -- decision: a DCO is defined as owner+driver+vehicle-owner (DCO-2), so
    -- the bid itself -- not just eventual trip execution -- must name the
    -- vehicle that will operate it. This also guarantees
    -- create_market_trip_after_fee_payment always has a real
    -- v_bid.owner_vehicle_id to carry onto the trip.
    IF p_owner_vehicle_id IS NULL THEN
      RAISE EXCEPTION 'owner_vehicle_required: a DCO bid must specify the vehicle that will operate this trip';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.owner_vehicles ov
      WHERE ov.id = p_owner_vehicle_id AND ov.owner_user_id = v_uid AND ov.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'owner_vehicle_id must belong to the caller''s own fleet';
    END IF;
  ELSE
    v_bidder_type := 'organization';

    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_bidder_organization_id
        AND om.user_id = v_uid
        AND om.status = 'active'
    ) THEN
      RAISE EXCEPTION 'unauthorized: caller is not an active member of bidder organization';
    END IF;
  END IF;

  INSERT INTO public.market_bids (
    indent_id, bidder_type, bidder_user_id, bidder_organization_id, owner_vehicle_id, amount, note
  )
  VALUES (
    p_indent_id, v_bidder_type, v_uid, p_bidder_organization_id, p_owner_vehicle_id, p_amount,
    NULLIF(TRIM(COALESCE(p_note, '')), '')
  )
  ON CONFLICT (indent_id, bidder_user_id) DO UPDATE SET
    amount = EXCLUDED.amount,
    note = EXCLUDED.note,
    owner_vehicle_id = EXCLUDED.owner_vehicle_id,
    updated_at = now()
  WHERE public.market_bids.status = 'pending'
  RETURNING id INTO v_bid_id;

  IF v_bid_id IS NULL THEN
    RAISE EXCEPTION 'bid_locked: an existing decided bid cannot be changed';
  END IF;

  RETURN jsonb_build_object(
    'bid_id', v_bid_id, 'indent_id', p_indent_id, 'bidder_type', v_bidder_type, 'amount', p_amount
  );
END;
$function$;

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
  v_dco_payee_id  uuid;
  v_trip          public.trips%ROWTYPE;
BEGIN
  SELECT * INTO v_bid FROM public.market_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  SELECT organization_id INTO v_indent_org_id FROM public.indents WHERE id = v_bid.indent_id;

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

  -- CHANGED (DCO-4): resolve the DCO payee by lookup only, no re-check of
  -- current eligibility -- see this migration's header. bidder_type='dco'
  -- already guarantees eligibility was verified at submission; a
  -- dco_payees row is created exactly once, at first approval, so its
  -- absence here would be a genuine data-integrity violation, not a normal
  -- "not eligible right now" outcome (that case is exactly what a
  -- suspension after award must NOT retroactively enforce).
  v_dco_payee_id := public.get_dco_payee_id(v_bid.bidder_user_id);
  IF v_dco_payee_id IS NULL THEN
    RAISE EXCEPTION 'dco_payee_missing: bidder % has bidder_type=dco but no dco_payees row', v_bid.bidder_user_id;
  END IF;

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
    operating_mode,
    dco_payee_id,
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
    v_bid.amount,   -- CHANGED: was 0. This is the DCO's settlement amount.
    NULL,
    'market',       -- CHANGED: was 'asset'.
    'DCO',          -- NEW
    v_dco_payee_id, -- NEW
    v_driver_id,
    'assigned',
    v_indent.pickup_date,
    coalesce(v_indent.load_type, ''),
    coalesce(v_bid.platform_fee_amount, 0),
    0,              -- CHANGED: was v_bid.amount. A DCO trip carries zero driver commission.
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

CREATE OR REPLACE FUNCTION public.accept_driver_direct_bid(p_bid_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_bid              public.driver_direct_bids;
  v_post             public.posts;
  v_campaign         record;
  v_indent           public.indents;
  v_driver_id        uuid;
  v_is_dco           boolean;
  v_dco_payee_id     uuid;
  v_trip             public.trips%ROWTYPE;
  v_client_name      text;
BEGIN
  SELECT * INTO v_bid FROM public.driver_direct_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = v_bid.post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: post % for bid %', v_bid.post_id, p_bid_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_post.organization_id AND om.user_id = (select auth.uid())
      AND om.status = 'active' AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the organization that owns this post';
  END IF;

  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.source = 'direct_bid' AND t.source_bid_id = v_bid.id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', v_bid.status);
  END IF;

  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state: bid already decided (current: %)', v_bid.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.driver_direct_bids b2
    WHERE b2.post_id = v_bid.post_id AND b2.status = 'accepted' AND b2.id <> v_bid.id
  ) THEN
    RAISE EXCEPTION 'already_awarded: this load already has an accepted direct bid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bids b
    WHERE b.post_id = v_bid.post_id AND b.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'already_awarded: this load already has an accepted marketplace bid';
  END IF;

  IF NOT public.is_driver_available(v_bid.driver_user_id) THEN
    RAISE EXCEPTION 'driver_unavailable: this driver is already on an active trip';
  END IF;

  SELECT rc.* INTO v_campaign
  FROM public.reach_campaigns rc
  WHERE rc.post_id = v_bid.post_id AND rc.status = 'active'
  ORDER BY rc.published_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no active campaign snapshot for post %', v_bid.post_id;
  END IF;

  IF v_post.source_indent_id IS NOT NULL THEN
    SELECT * INTO v_indent FROM public.indents WHERE id = v_post.source_indent_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_found: indent % for post %', v_post.source_indent_id, v_post.id;
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

    v_client_name := coalesce(v_indent.client_name, '');
  ELSE
    v_indent := NULL;
    v_client_name := '';
  END IF;

  v_driver_id := public._resolve_or_create_market_driver(v_post.organization_id, v_bid.driver_user_id);

  -- NEW (DCO-4): this path is NOT DCO-exclusive (no bidder_type column on
  -- driver_direct_bids -- any employed or independent driver can win this
  -- way), so classification happens here, at the single atomic
  -- acceptance+creation moment, using the live eligibility predicate --
  -- per the locked contract, current eligibility at acceptance is
  -- sufficient since no award/payment gap exists on this path.
  v_is_dco := public.is_dco_eligible(v_bid.driver_user_id);
  IF v_is_dco THEN
    v_dco_payee_id := public.get_dco_payee_id(v_bid.driver_user_id);
    IF v_dco_payee_id IS NULL THEN
      RAISE EXCEPTION 'dco_payee_missing: bidder % is DCO-eligible but has no dco_payees row', v_bid.driver_user_id;
    END IF;
  ELSE
    v_dco_payee_id := NULL;
  END IF;

  INSERT INTO public.trips (
    organization_id,
    trip_number,
    source,
    source_bid_id,
    indent_id,
    pickup_area,
    drop_location,
    client_name,
    client_price,
    supplier_rate,
    supplier_id,
    trip_payout_mode,
    operating_mode,
    dco_payee_id,
    driver_id,
    status,
    pickup_date,
    load_type,
    platform_fee,
    driver_commission,
    payment_status,
    amount_paid
  ) VALUES (
    v_post.organization_id,
    '',
    'direct_bid',
    v_bid.id,
    CASE WHEN v_indent.id IS NOT NULL THEN v_indent.id ELSE NULL END,
    coalesce(v_campaign.snapshot_origin, ''),
    coalesce(v_campaign.snapshot_destination, ''),
    v_client_name,
    coalesce(v_campaign.snapshot_rate_offer, 0),
    CASE WHEN v_is_dco THEN v_bid.amount ELSE 0 END,          -- CHANGED: was always 0.
    NULL,
    CASE WHEN v_is_dco THEN 'market' ELSE 'asset' END,         -- CHANGED: was always 'asset'.
    CASE WHEN v_is_dco THEN 'DCO' ELSE 'FLEET' END,            -- NEW
    v_dco_payee_id,                                            -- NEW
    v_driver_id,
    'assigned',
    NULL,
    coalesce(v_campaign.snapshot_material, ''),
    0,
    CASE WHEN v_is_dco THEN 0 ELSE v_bid.amount END,           -- CHANGED: was always v_bid.amount.
    'pending',
    0
  )
  RETURNING * INTO v_trip;

  UPDATE public.driver_direct_bids
  SET status = 'accepted', updated_at = now()
  WHERE id = p_bid_id;

  UPDATE public.driver_direct_bids
  SET status = 'rejected', updated_at = now()
  WHERE post_id = v_bid.post_id AND id <> v_bid.id AND status = 'pending';

  UPDATE public.driver_direct_bids
  SET status = 'superseded', updated_at = now()
  WHERE driver_user_id = v_bid.driver_user_id
    AND status = 'pending'
    AND id <> v_bid.id;

  UPDATE public.market_bids
  SET status = 'superseded', updated_at = now()
  WHERE bidder_user_id = v_bid.driver_user_id
    AND status = 'pending';

  IF v_indent.id IS NOT NULL THEN
    UPDATE public.indents SET status = 'awarded', updated_at = now() WHERE id = v_indent.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', 'accepted');
END;
$function$;
