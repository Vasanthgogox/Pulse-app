-- trip_payout_mode must always be stamped when a trip is created.
--
-- The client createTrip() path already derives it (supplier_id → market, else
-- asset). But the award/deploy-from-indent RPCs (award_indent_to_trip,
-- create_trip_from_assigned_indent, batch_award_indents_to_trips) inserted
-- trips WITHOUT trip_payout_mode, leaving it NULL. Consumers (finance ledger,
-- vehicle economics, operational-integrity gates) then fall back to inferring
-- from supplier_id — a silent status/column divergence like the started_at gap.
--
-- Fix: (1) backfill existing NULL rows using the canonical rule, and
--      (2) stamp trip_payout_mode inside all three RPCs so it can't recur.
-- Canonical rule (features/finance/utils/tripLedgerPayoutMode.util.ts):
--   supplier_id present → 'market', otherwise → 'asset'.

BEGIN;

-- (1) Backfill: every NULL row currently has a supplier_id, so all resolve to
-- 'market'; the CASE keeps it correct even if an asset (no-supplier) NULL exists.
UPDATE public.trips
SET trip_payout_mode = CASE WHEN supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END,
    updated_at = now()
WHERE trip_payout_mode IS NULL;

-- (2a) award_indent_to_trip — add trip_payout_mode to the INSERT.
CREATE OR REPLACE FUNCTION public.award_indent_to_trip(p_indent_id uuid, p_supplier_rate numeric DEFAULT NULL::numeric, p_supplier_id uuid DEFAULT NULL::uuid, p_supplier_org_id uuid DEFAULT NULL::uuid, p_driver_id uuid DEFAULT NULL::uuid, p_vehicle_id uuid DEFAULT NULL::uuid, p_vehicle_display_number text DEFAULT NULL::text)
 RETURNS SETOF trips
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_indent        public.indents%ROWTYPE;
  v_org_id        uuid;
  v_trip          public.trips%ROWTYPE;
  v_supplier_id   uuid;
  v_supplier_rate numeric;
  v_vehicle_disp  text;
BEGIN
  SELECT * INTO v_indent FROM public.indents WHERE id = p_indent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent % not found', p_indent_id;
  END IF;

  IF lower(coalesce(v_indent.status, '')) = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot create trip: indent % is cancelled', p_indent_id;
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

  v_org_id := v_indent.organization_id;

  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not authorized: caller is not a member of org %', v_org_id;
  END IF;

  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = p_indent_id
  LIMIT 1;

  IF FOUND THEN
    IF lower(coalesce(v_trip.status, '')) NOT IN ('completed', 'cancelled') THEN
      UPDATE public.trips
      SET
        driver_id             = COALESCE(p_driver_id,  driver_id),
        vehicle_id            = COALESCE(p_vehicle_id, vehicle_id),
        vehicle_display_number = CASE
          WHEN p_vehicle_display_number IS NOT NULL AND trim(p_vehicle_display_number) <> ''
          THEN trim(p_vehicle_display_number)
          ELSE vehicle_display_number
        END,
        updated_at = now()
      WHERE id = v_trip.id;
      SELECT * INTO v_trip FROM public.trips WHERE id = v_trip.id;
    END IF;
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  v_supplier_rate := COALESCE(
    p_supplier_rate,
    (v_indent.assigned_supplier_rate)::numeric,
    v_indent.supplier_target,
    0
  );

  -- supplier_id resolution:
  -- 1. Explicit param (direct suppliers row id)
  v_supplier_id := p_supplier_id;

  -- 2. indent.assigned_supplier_id is an organizations FK (bidder org id) — look up
  --    the suppliers row in this org that is linked to that bidder org.
  IF v_supplier_id IS NULL AND v_indent.assigned_supplier_id IS NOT NULL THEN
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE organization_id = v_org_id
      AND linked_organization_id = v_indent.assigned_supplier_id
    LIMIT 1;
  END IF;

  -- 3. Explicit bidder org id (same lookup)
  IF v_supplier_id IS NULL AND p_supplier_org_id IS NOT NULL THEN
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE organization_id = v_org_id
      AND linked_organization_id = p_supplier_org_id
    LIMIT 1;
  END IF;

  v_vehicle_disp := NULLIF(TRIM(COALESCE(p_vehicle_display_number, '')), '');

  INSERT INTO public.trips (
    organization_id,
    trip_number,
    indent_id,
    source,
    pickup_area,
    drop_location,
    client_name,
    client_price,
    supplier_rate,
    supplier_id,
    trip_payout_mode,
    driver_id,
    vehicle_id,
    vehicle_display_number,
    status,
    pickup_date,
    load_type,
    platform_fee,
    driver_commission,
    payment_status,
    amount_paid
  ) VALUES (
    v_org_id,
    '',
    p_indent_id,
    'indent',
    coalesce(v_indent.pickup_area, ''),
    coalesce(v_indent.drop_location, ''),
    coalesce(v_indent.client_name, ''),
    coalesce(v_indent.client_price, 0),
    v_supplier_rate,
    v_supplier_id,
    CASE WHEN v_supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END,
    p_driver_id,
    p_vehicle_id,
    v_vehicle_disp,
    CASE WHEN p_driver_id IS NOT NULL THEN 'assigned' ELSE 'draft' END,
    v_indent.pickup_date,
    coalesce(v_indent.load_type, ''),
    0,
    0,
    'pending',
    0
  )
  RETURNING * INTO v_trip;

  UPDATE public.indents
  SET status = 'completed', updated_at = now()
  WHERE id = p_indent_id;

  RETURN NEXT v_trip;
  RETURN;
END;
$function$;

-- (2b) create_trip_from_assigned_indent — add trip_payout_mode to the INSERT.
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
  v_bidder_org_name    text;
  v_try                integer := 0;
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

  v_org_id := v_indent.organization_id;

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

  v_supplier_rate := COALESCE(
    (v_indent.assigned_supplier_rate)::numeric,
    v_indent.supplier_target,
    0
  );

  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND linked_organization_id = v_supplier_org_id
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    SELECT COALESCE(NULLIF(TRIM(o.name), ''), 'Supplier')
    INTO v_bidder_org_name
    FROM public.organizations o
    WHERE o.id = v_supplier_org_id;

    INSERT INTO public.suppliers (
      organization_id,
      linked_organization_id,
      name,
      is_active,
      is_verified
    )
    VALUES (
      v_org_id,
      v_supplier_org_id,
      COALESCE(v_bidder_org_name, 'Supplier'),
      true,
      false
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_supplier_id;

    IF v_supplier_id IS NULL THEN
      SELECT id INTO v_supplier_id
      FROM public.suppliers
      WHERE organization_id = v_org_id
        AND linked_organization_id = v_supplier_org_id
      LIMIT 1;
    END IF;
  END IF;

  LOOP
    v_try := v_try + 1;
    BEGIN
      INSERT INTO public.trips (
        organization_id,
        owner_user_id,
        created_by_user_id,
        trip_number,
        indent_id,
        source,
        pickup_area,
        drop_location,
        client_name,
        client_price,
        supplier_rate,
        supplier_id,
        trip_payout_mode,
        driver_id,
        vehicle_id,
        status,
        pickup_date,
        load_type,
        vehicle_display_number,
        platform_fee,
        driver_commission,
        payment_status,
        amount_paid
      ) VALUES (
        v_org_id,
        v_indent.owner_user_id,
        v_created_by_user_id,
        '',
        p_indent_id,
        'indent',
        coalesce(v_indent.pickup_area, ''),
        coalesce(v_indent.drop_location, ''),
        coalesce(v_indent.client_name, ''),
        coalesce(v_indent.client_price, 0),
        v_supplier_rate,
        v_supplier_id,
        CASE WHEN v_supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END,
        p_driver_id,
        p_vehicle_id,
        CASE WHEN p_driver_id IS NOT NULL THEN 'assigned' ELSE 'draft' END,
        v_indent.pickup_date,
        coalesce(v_indent.load_type, ''),
        v_vehicle_display,
        0,
        0,
        'pending',
        0
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

-- (2c) batch_award_indents_to_trips — add trip_payout_mode to the INSERT.
CREATE OR REPLACE FUNCTION public.batch_award_indents_to_trips(p_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH to_convert AS (
    SELECT i.*
    FROM public.indents i
    LEFT JOIN public.trips t ON t.indent_id = i.id
    WHERE i.organization_id = p_org_id
      AND i.status = 'awarded'
      AND t.id IS NULL
  ),
  inserted AS (
    INSERT INTO public.trips (
      organization_id,
      owner_user_id,
      created_by_user_id,
      trip_number,
      indent_id,
      source,
      pickup_area,
      drop_location,
      pickup_lat,
      pickup_lon,
      drop_lat,
      drop_lon,
      distance,
      estimated_duration,
      client_name,
      client_id,
      client_price,
      supplier_rate,
      supplier_id,
      trip_payout_mode,
      status,
      pickup_date,
      load_type,
      notes,
      platform_fee,
      driver_commission,
      payment_status,
      amount_paid
    )
    SELECT
      tc.organization_id,
      tc.owner_user_id,
      auth.uid(),
      '',
      tc.id,
      'batch_conversion',
      tc.pickup_area,
      tc.drop_location,
      tc.pickup_lat,
      tc.pickup_lon,
      tc.drop_lat,
      tc.drop_lon,
      tc.distance,
      tc.estimated_duration,
      tc.client_name,
      tc.client_id,
      tc.client_price,
      tc.supplier_target,
      tc.assigned_supplier_id,
      CASE WHEN tc.assigned_supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END,
      'assigned',
      tc.pickup_date,
      tc.load_type,
      tc.notes,
      0,
      0,
      'pending',
      0
    FROM to_convert tc
    RETURNING id
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  UPDATE public.indents
  SET status = 'completed', updated_at = now()
  WHERE id IN (
    SELECT tc.id FROM public.indents tc
    LEFT JOIN public.trips t ON t.indent_id = tc.id
    WHERE tc.organization_id = p_org_id
      AND tc.status = 'awarded'
      AND t.id IS NOT NULL
  );

  RETURN v_inserted;
END;
$function$;

COMMIT;
