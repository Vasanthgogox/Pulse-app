-- When a trip already exists for the indent (idempotent path), apply the quote's
-- driver_id and vehicle_id to that trip so Staff Handshake "Authorize Voyage" assigns correctly.

CREATE OR REPLACE FUNCTION public.create_trip_from_direct_quote(p_quote_id uuid)
RETURNS SETOF public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.direct_quotes%ROWTYPE;
  v_indent public.indents%ROWTYPE;
  v_supplier_id uuid;
  v_org_id uuid;
  v_trip public.trips%ROWTYPE;
BEGIN
  SELECT * INTO v_quote FROM public.direct_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Direct quote not found';
  END IF;
  IF (v_quote.status IS NULL OR lower(v_quote.status) <> 'accepted') THEN
    RAISE EXCEPTION 'Quote must be accepted before creating a trip';
  END IF;

  SELECT * INTO v_indent FROM public.indents WHERE id = v_quote.indent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent not found';
  END IF;

  v_org_id := v_indent.organization_id;

  -- Caller must be member of indent org (shipper) or bidder org (supplier)
  IF NOT (
    public.is_org_member(v_org_id) OR public.is_org_member(v_quote.bidder_organization_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to create trip from this quote';
  END IF;

  -- Idempotent: if a trip already exists for this indent, apply quote assignment and return it
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = v_quote.indent_id
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.trips
    SET
      driver_id = COALESCE(v_quote.driver_id, driver_id),
      vehicle_id = COALESCE(v_quote.vehicle_id, vehicle_id),
      updated_at = now()
    WHERE id = v_trip.id;
    SELECT * INTO v_trip FROM public.trips WHERE id = v_trip.id;
    -- Mark indent completed so Secured tab no longer shows "ASSIGN STAFF & DEPLOY" (supplier cannot update indent via RLS).
    UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = v_quote.indent_id;
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  -- Resolve supplier_id: shipper's supplier row linked to bidder org
  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND linked_organization_id = v_quote.bidder_organization_id
  LIMIT 1;

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
    driver_id,
    vehicle_id,
    status,
    pickup_date,
    load_type
  ) VALUES (
    v_org_id,
    '',
    v_quote.indent_id,
    'direct_quote',
    coalesce(v_indent.pickup_area, ''),
    coalesce(v_indent.drop_location, ''),
    coalesce(v_indent.client_name, ''),
    coalesce(v_indent.client_price, 0),
    coalesce(v_quote.amount, 0),
    v_supplier_id,
    v_quote.driver_id,
    v_quote.vehicle_id,
    'assigned',
    v_indent.pickup_date,
    coalesce(v_indent.load_type, '')
  )
  RETURNING * INTO v_trip;

  -- Mark indent completed so Secured tab no longer shows "ASSIGN STAFF & DEPLOY" (supplier cannot update indent via RLS).
  UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = v_quote.indent_id;

  RETURN NEXT v_trip;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.create_trip_from_direct_quote(uuid) IS
  'Create a trip from an accepted direct quote (Load Hub award). Idempotent: if trip exists for indent, applies quote driver_id/vehicle_id and returns it; otherwise inserts new trip. Sets indent status to completed so Secured list updates.';
