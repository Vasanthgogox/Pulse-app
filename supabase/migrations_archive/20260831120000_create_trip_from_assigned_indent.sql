-- Supplier deploy for indents awarded via assigned_supplier_id without a direct_quotes row.
-- award_indent_to_trip is shipper-only (checks indent.organization_id membership).
-- This RPC checks assigned_supplier_id (executing carrier org).

CREATE OR REPLACE FUNCTION public.create_trip_from_assigned_indent(
  p_indent_id uuid,
  p_driver_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,
  p_vehicle_display_number text DEFAULT NULL
)
RETURNS SETOF public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.create_trip_from_assigned_indent(uuid, uuid, uuid, text) IS
  'Supplier Claimed deploy: create trip from indent assigned to caller org (no direct_quotes row). Idempotent.';

REVOKE ALL ON FUNCTION public.create_trip_from_assigned_indent(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_trip_from_assigned_indent(uuid, uuid, uuid, text) TO authenticated;
