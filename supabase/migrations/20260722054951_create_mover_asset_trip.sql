-- Mover-side asset trip for awarded loads.
--
-- Flow: aggregator (MAX) awards a load to a mover (Lenovo). One trip already
-- exists, owned by the aggregator, trip_payout_mode = 'market' (the mover is a
-- payable/supplier on it). But the mover executes the load with its OWN driver
-- + vehicle, so the mover needs its own 'asset' trip to log fuel / toll /
-- driver salary. The shared aggregator row cannot be that record: it is billed
-- market and is blocked by the trips_one_per_indent unique index on indent_id.
--
-- This RPC creates the mover's own trip:
--   - organization_id = mover org  → mover owns it; existing "Org members can
--     manage trips" RLS + the trip-child EXISTS policies grant full access with
--     NO new policy required.
--   - source_indent_id = indent    → links to the load WITHOUT using indent_id,
--     so trips_one_per_indent (unique on indent_id) does not fire.
--   - trip_payout_mode = 'asset'   → unlocks fuel/toll/salary entry UI.
--   - client_price = aggregator supplier_rate (the mover's ₹ receivable);
--     supplier_id = NULL (mover pays its own driver, not a sub-supplier).
-- Idempotent on (organization_id, source_indent_id).

CREATE OR REPLACE FUNCTION public.create_mover_asset_trip(
  p_indent_id  uuid,
  p_driver_id  uuid DEFAULT NULL::uuid,
  p_vehicle_id uuid DEFAULT NULL::uuid,
  p_vehicle_display_number text DEFAULT NULL::text
)
 RETURNS SETOF trips
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_indent          public.indents%ROWTYPE;
  v_mover_org_id    uuid;
  v_agg_trip        public.trips%ROWTYPE;
  v_trip            public.trips%ROWTYPE;
  v_revenue         numeric;
  v_vehicle_display text;
  v_actor_user_id   uuid := auth.uid();
BEGIN
  v_vehicle_display := NULLIF(TRIM(COALESCE(p_vehicle_display_number, '')), '');

  SELECT * INTO v_indent FROM public.indents WHERE id = p_indent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent % not found', p_indent_id;
  END IF;

  -- The mover is the awarded supplier org on the indent.
  v_mover_org_id := v_indent.assigned_supplier_id;
  IF v_mover_org_id IS NULL THEN
    RAISE EXCEPTION 'Indent % has no assigned mover', p_indent_id;
  END IF;

  -- Only the mover org may create its own asset trip.
  IF NOT public.is_org_member(v_mover_org_id) THEN
    RAISE EXCEPTION 'Not authorized: caller is not a member of the mover org';
  END IF;

  -- Driver / vehicle, if given, must belong to the mover org (its own assets).
  IF p_driver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.drivers d WHERE d.id = p_driver_id AND d.organization_id = v_mover_org_id
  ) THEN
    RAISE EXCEPTION 'Driver must belong to the mover organization';
  END IF;
  IF p_vehicle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vehicles v WHERE v.id = p_vehicle_id AND v.organization_id = v_mover_org_id
  ) THEN
    RAISE EXCEPTION 'Vehicle must belong to the mover organization';
  END IF;

  -- Idempotency: return the mover's existing asset trip for this indent if present.
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.organization_id = v_mover_org_id
    AND t.source_indent_id = p_indent_id
    AND t.deleted_at IS NULL
  LIMIT 1;
  IF FOUND THEN
    -- Keep driver/vehicle fresh if the caller re-deployed with new assets.
    IF lower(coalesce(v_trip.status, '')) NOT IN ('completed', 'cancelled') THEN
      UPDATE public.trips
      SET driver_id = COALESCE(p_driver_id, driver_id),
          vehicle_id = COALESCE(p_vehicle_id, vehicle_id),
          vehicle_display_number = CASE
            WHEN v_vehicle_display IS NOT NULL THEN v_vehicle_display
            ELSE vehicle_display_number END,
          updated_at = now()
      WHERE id = v_trip.id;
      SELECT * INTO v_trip FROM public.trips WHERE id = v_trip.id;
    END IF;
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  -- Revenue = what the aggregator owes the mover. Prefer the live aggregator
  -- trip's supplier_rate (single source of truth for payable=receivable),
  -- then the indent's assigned rate / target.
  SELECT t.* INTO v_agg_trip
  FROM public.trips t
  WHERE t.indent_id = p_indent_id AND t.deleted_at IS NULL
  LIMIT 1;

  v_revenue := COALESCE(
    NULLIF(v_agg_trip.supplier_rate, 0),
    NULLIF((v_indent.assigned_supplier_rate)::numeric, 0),
    NULLIF(v_indent.supplier_target, 0),
    0
  );

  IF v_actor_user_id IS NOT NULL THEN
    INSERT INTO public.users (id, name) VALUES (v_actor_user_id, 'User')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.trips (
    organization_id, owner_user_id, created_by_user_id,
    trip_number, source_indent_id, source_indent_code, source,
    pickup_area, drop_location, client_name,
    client_price, supplier_rate, supplier_id, trip_payout_mode,
    driver_id, vehicle_id, vehicle_display_number,
    status, pickup_date, load_type,
    platform_fee, driver_commission, payment_status, amount_paid
  ) VALUES (
    v_mover_org_id, v_actor_user_id, v_actor_user_id,
    '', p_indent_id, v_indent.indent_code, 'mover_asset',
    coalesce(v_indent.pickup_area, ''), coalesce(v_indent.drop_location, ''),
    -- Mover's "customer" for this load is the aggregator that awarded it.
    coalesce((SELECT o.name FROM public.organizations o WHERE o.id = v_indent.organization_id), 'Client'),
    v_revenue,          -- mover receivable = aggregator payable
    0,                  -- mover pays its own driver, not a sub-supplier
    NULL,               -- no supplier_id → asset execution
    'asset',
    p_driver_id, p_vehicle_id, v_vehicle_display,
    CASE WHEN p_driver_id IS NOT NULL THEN 'assigned' ELSE 'draft' END,
    v_indent.pickup_date, coalesce(v_indent.load_type, ''),
    0, 0, 'pending', 0
  )
  RETURNING * INTO v_trip;

  RETURN NEXT v_trip;
  RETURN;
END;
$function$;
