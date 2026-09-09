-- A8.6.2 — gate the organization Marketplace branch of
-- create_trip_from_assigned_indent() on the new fee_payment_status, and fix
-- client_price to be the winning bid amount rather than the indent's
-- (possibly stale/unrelated) posted client_price. The relationship-award
-- branch (non-Marketplace supplier deploys) is untouched.
--
-- Diff against the live body (confirmed fresh this session, already
-- reflects 20270308103000's indent_has_convertible_sale() swap):
--   1. New guard right after the market-bid lookup: raise unless the fee is
--      paid/not_required.
--   2. Market-award branch: client_price = market_bids.amount (was
--      indents.client_price); platform_fee/platform_fee_calc_snapshot now
--      populated from the bid row (were hardcoded 0 / omitted).
--   3. Market-award branch's trip insert explicitly sets
--      sale_rate_basis = 'per_trip' -- suppresses trips_apply_sale_rate_snapshot's
--      (20270308103000) per-MT client_price override for Marketplace trips,
--      where the winning bid is always the authoritative price regardless
--      of the indent's own sale_rate_basis. The relationship branch is left
--      exactly as-is (no sale_rate_basis set), so its existing per-MT
--      recompute behavior for ordinary supplier deploys is unaffected.
--   4. CREATE OR REPLACE is legal here -- return type (SETOF trips) is
--      unchanged, no grant change needed.

CREATE OR REPLACE FUNCTION public.create_trip_from_assigned_indent(p_indent_id uuid, p_driver_id uuid DEFAULT NULL::uuid, p_vehicle_id uuid DEFAULT NULL::uuid, p_vehicle_display_number text DEFAULT NULL::text)
 RETURNS SETOF trips
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_indent             public.indents%ROWTYPE;
  v_org_id             uuid;
  v_supplier_org_id    uuid;
  v_supplier_id        uuid;
  v_trip               public.trips%ROWTYPE;
  v_vehicle_display    text;
  v_supplier_rate      numeric;
  v_actor_user_id      uuid := auth.uid();
  v_created_by_user_id uuid := NULL;
  v_try                integer := 0;
  v_market_bid         public.market_bids%ROWTYPE;
  v_is_market_award    boolean := false;
  v_source             text := 'indent';
  v_source_market_bid_id uuid := NULL;
  v_client_price       numeric;
  v_trip_platform_fee  numeric := 0;
  v_trip_fee_snapshot  jsonb := NULL;
  v_trip_sale_basis    text := NULL;
BEGIN
  v_vehicle_display := NULLIF(TRIM(COALESCE(p_vehicle_display_number, '')), '');

  IF v_actor_user_id IS NOT NULL THEN
    INSERT INTO public.users (id, name)
    VALUES (v_actor_user_id, 'User')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT id INTO v_created_by_user_id
  FROM public.users
  WHERE id = v_actor_user_id
  LIMIT 1;

  SELECT * INTO v_indent FROM public.indents WHERE id = p_indent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent % not found', p_indent_id;
  END IF;

  IF lower(coalesce(v_indent.status, '')) IN ('cancelled', 'closed') THEN
    RAISE EXCEPTION 'Cannot create trip: indent % is not available', p_indent_id;
  END IF;

  v_supplier_org_id := v_indent.assigned_supplier_id;
  IF v_supplier_org_id IS NULL THEN
    RAISE EXCEPTION 'Indent has no assigned supplier';
  END IF;

  IF NOT public.is_org_member(v_supplier_org_id) THEN
    RAISE EXCEPTION 'Not authorized to deploy this load';
  END IF;

  v_org_id := v_indent.organization_id;

  -- A4.4 Phase 3: is this a Marketplace award (accepted organization
  -- market_bid), or the existing relationship-based award? Checked before
  -- the approved-supplier gate so the Marketplace branch can bypass it --
  -- open Marketplace winners are, by construction, orgs with no prior
  -- relationship to the load owner.
  SELECT * INTO v_market_bid
  FROM public.market_bids
  WHERE indent_id = p_indent_id
    AND bidder_type = 'organization'
    AND bidder_organization_id = v_supplier_org_id
    AND status = 'accepted'
  LIMIT 1;
  v_is_market_award := FOUND;

  -- NEW (A8.6.2): fee-payment gate. Placed immediately after the
  -- market-bid lookup, before any other work, so a not-yet-paid award
  -- fails fast with a clear error rather than partway through trip
  -- assembly.
  IF v_is_market_award AND v_market_bid.fee_payment_status NOT IN ('paid', 'not_required') THEN
    RAISE EXCEPTION 'fee_payment_pending: platform fee must be paid before this Marketplace award can be deployed (bid %, current: %)', v_market_bid.id, v_market_bid.fee_payment_status;
  END IF;

  IF NOT v_is_market_award THEN
    IF NOT public.is_approved_supplier(v_org_id, v_supplier_org_id) THEN
      RAISE EXCEPTION 'Bidder is not an approved supplier of this load owner. Add and approve them as a supplier before deploying.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF coalesce(trim(v_indent.pickup_area), '') = '' THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no pickup_area', p_indent_id;
  END IF;
  IF coalesce(trim(v_indent.drop_location), '') = '' THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no drop_location', p_indent_id;
  END IF;
  IF NOT public.indent_has_convertible_sale(v_indent) THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no client_price', p_indent_id;
  END IF;

  IF p_driver_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = p_driver_id AND d.organization_id = v_supplier_org_id
    ) THEN
      RAISE EXCEPTION 'Driver must belong to your organization';
    END IF;
  END IF;

  IF p_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = p_vehicle_id AND v.organization_id = v_supplier_org_id
    ) THEN
      RAISE EXCEPTION 'Vehicle must belong to your organization';
    END IF;
  END IF;

  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = p_indent_id
  LIMIT 1;

  IF FOUND THEN
    IF lower(coalesce(v_trip.status, '')) NOT IN ('completed', 'cancelled') THEN
      UPDATE public.trips
      SET
        driver_id = COALESCE(p_driver_id, driver_id),
        vehicle_id = COALESCE(p_vehicle_id, vehicle_id),
        vehicle_display_number = CASE
          WHEN v_vehicle_display IS NOT NULL THEN v_vehicle_display
          ELSE vehicle_display_number
        END,
        updated_at = now()
      WHERE id = v_trip.id;
      SELECT * INTO v_trip FROM public.trips WHERE id = v_trip.id;
    END IF;
    UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = p_indent_id;
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  IF v_is_market_award THEN
    v_supplier_rate      := v_market_bid.amount;
    v_supplier_id        := NULL;
    v_source             := 'market_bid';
    v_source_market_bid_id := v_market_bid.id;
    v_client_price       := v_market_bid.amount;                          -- CHANGED (was v_indent.client_price)
    v_trip_platform_fee  := coalesce(v_market_bid.platform_fee_amount, 0); -- NEW (was hardcoded 0)
    v_trip_fee_snapshot  := v_market_bid.platform_fee_calc_snapshot;      -- NEW (was omitted from INSERT)
    v_trip_sale_basis    := 'per_trip';                                   -- NEW: suppress per-MT override for Marketplace trips
  ELSE
    v_supplier_rate := COALESCE(
      (v_indent.assigned_supplier_rate)::numeric,
      v_indent.supplier_target,
      0
    );

    -- Eligibility was already confirmed above; resolve (never auto-create)
    -- the shipper's supplier row for the bidder org.
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE organization_id = v_org_id
      AND linked_organization_id = v_supplier_org_id
      AND is_active = true
    LIMIT 1;

    IF v_supplier_id IS NULL THEN
      RAISE EXCEPTION 'Bidder is not an approved supplier of this load owner. Add and approve them as a supplier before deploying.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_source              := 'indent';
    v_source_market_bid_id := NULL;
    v_client_price        := coalesce(v_indent.client_price, 0);  -- UNCHANGED, relationship branch only
    v_trip_platform_fee    := 0;                                   -- UNCHANGED
    v_trip_fee_snapshot     := NULL;                                -- UNCHANGED
    v_trip_sale_basis       := NULL;                                -- UNCHANGED: relationship trips keep the
                                                                     -- existing per-MT trigger behavior
  END IF;

  LOOP
    v_try := v_try + 1;
    BEGIN
      INSERT INTO public.trips (
        organization_id, owner_user_id, created_by_user_id, trip_number, indent_id,
        source, source_market_bid_id, pickup_area, drop_location, client_name, client_price, supplier_rate,
        supplier_id, trip_payout_mode, driver_id, vehicle_id, status, pickup_date,
        load_type, vehicle_display_number, platform_fee, driver_commission,
        payment_status, amount_paid, platform_fee_calc_snapshot, sale_rate_basis
      ) VALUES (
        v_org_id, v_indent.owner_user_id, v_created_by_user_id, '', p_indent_id,
        v_source, v_source_market_bid_id, coalesce(v_indent.pickup_area, ''), coalesce(v_indent.drop_location, ''),
        coalesce(v_indent.client_name, ''),
        v_client_price,                                                  -- CHANGED
        v_supplier_rate, v_supplier_id,
        CASE WHEN v_supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END,
        p_driver_id, p_vehicle_id,
        CASE WHEN p_driver_id IS NOT NULL THEN 'assigned' ELSE 'draft' END,
        v_indent.pickup_date, coalesce(v_indent.load_type, ''), v_vehicle_display,
        v_trip_platform_fee, 0, 'pending', 0,                             -- CHANGED (platform_fee only; driver_commission stays 0, unchanged)
        v_trip_fee_snapshot,                                              -- NEW
        v_trip_sale_basis                                                 -- NEW
      )
      RETURNING * INTO v_trip;

      UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = p_indent_id;
      RETURN NEXT v_trip;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT t.* INTO v_trip
        FROM public.trips t
        WHERE t.indent_id = p_indent_id
        LIMIT 1;
        IF FOUND THEN
          UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = p_indent_id;
          RETURN NEXT v_trip;
          RETURN;
        END IF;
        IF v_try >= 3 THEN
          RAISE;
        END IF;
    END;
  END LOOP;
END;
$function$;
