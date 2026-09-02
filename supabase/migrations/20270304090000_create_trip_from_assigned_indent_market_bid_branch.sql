-- A4.4 Phase 3 -- extend create_trip_from_assigned_indent() with an isolated
-- Marketplace market_bid branch, per the explicit design:
--
--   create_trip_from_assigned_indent()
--   │
--   ├── relationship / direct_quote award  (UNCHANGED)
--   │   ├── approved-supplier check
--   │   ├── pricing from assigned_supplier_rate / supplier_target
--   │   └── source = 'indent'
--   │
--   └── Marketplace market_bid award       (NEW)
--       ├── validate accepted market_bid (bidder_type='organization',
--       │   bidder_organization_id = the assigned org)
--       ├── NO approved-supplier requirement -- that relationship is
--       │   exactly what open Marketplace exists to not require
--       ├── supplier_rate = market_bids.amount
--       ├── source = 'market_bid'
--       ├── source_market_bid_id = accepted bid id
--       └── source_bid_id untouched (stays NULL; that column belongs to
--           the Reach/driver_direct_bids path and is never written here)
--
-- Every existing caller was identified before writing this (both go through
-- the SAME shared resolveIndentDeployQuoteWithFreshQuote + this one RPC, so
-- neither needs a frontend change):
--   - features/network/hooks/useTripDeployment.ts (Get Load "Allocate" flow)
--   - features/network/hooks/useStaffHandshake.ts (staff/OTP handshake deploy)
-- Both already treat "assigned_supplier_id = orgId with no accepted
-- direct_quote row" as a valid, generic "assigned_indent" case (Give-Load-
-- without-a-quote-row) -- confirmed by reading resolveIndentDeployQuote.util.ts
-- before writing this migration. A Market-bid-awarded indent satisfies that
-- exact same shape (accept_market_bid's organization branch sets
-- assigned_supplier_id, same column, same convention), so both callers pick
-- this branch up automatically. No frontend change needed for either.
--
-- client_price is intentionally left as coalesce(v_indent.client_price, 0),
-- unchanged from the relationship branch -- the design instruction was to
-- price the supplier/transaction side (supplier_rate) from the accepted
-- bid's amount, not to redefine what the load owner bills their own client.
--
-- Idempotency: the existing "does a trip already exist for this indent"
-- check and its driver/vehicle-update-in-place retry path are untouched and
-- apply identically to both branches -- they operate on trips.indent_id,
-- not on which branch created the row.

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
  IF coalesce(v_indent.client_price, 0) <= 0 THEN
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
    v_supplier_rate := v_market_bid.amount;
    v_supplier_id := NULL;
    v_source := 'market_bid';
    v_source_market_bid_id := v_market_bid.id;
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

    v_source := 'indent';
    v_source_market_bid_id := NULL;
  END IF;

  LOOP
    v_try := v_try + 1;
    BEGIN
      INSERT INTO public.trips (
        organization_id, owner_user_id, created_by_user_id, trip_number, indent_id,
        source, source_market_bid_id, pickup_area, drop_location, client_name, client_price, supplier_rate,
        supplier_id, trip_payout_mode, driver_id, vehicle_id, status, pickup_date,
        load_type, vehicle_display_number, platform_fee, driver_commission,
        payment_status, amount_paid
      ) VALUES (
        v_org_id, v_indent.owner_user_id, v_created_by_user_id, '', p_indent_id,
        v_source, v_source_market_bid_id, coalesce(v_indent.pickup_area, ''), coalesce(v_indent.drop_location, ''),
        coalesce(v_indent.client_name, ''), coalesce(v_indent.client_price, 0),
        v_supplier_rate, v_supplier_id,
        CASE WHEN v_supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END,
        p_driver_id, p_vehicle_id,
        CASE WHEN p_driver_id IS NOT NULL THEN 'assigned' ELSE 'draft' END,
        v_indent.pickup_date, coalesce(v_indent.load_type, ''), v_vehicle_display,
        0, 0, 'pending', 0
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
