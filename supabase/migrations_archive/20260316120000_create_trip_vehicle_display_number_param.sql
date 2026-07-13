-- Add optional p_vehicle_display_number to create_trip_from_direct_quote so Staff Handshake
-- (ad-hoc deploy) can persist vehicle registration in one round-trip. RPC runs as SECURITY DEFINER
-- so supplier can set it without needing UPDATE on trips (trip.organization_id is shipper's org).

CREATE OR REPLACE FUNCTION public.create_trip_from_direct_quote(
  p_quote_id uuid,
  p_vehicle_display_number text DEFAULT NULL
)
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
  v_vehicle_display text;
BEGIN
  v_vehicle_display := NULLIF(TRIM(COALESCE(p_vehicle_display_number, '')), '');

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
      updated_at = now(),
      vehicle_display_number = CASE
        WHEN v_vehicle_display IS NOT NULL THEN v_vehicle_display
        ELSE vehicle_display_number
      END
    WHERE id = v_trip.id;
    SELECT * INTO v_trip FROM public.trips WHERE id = v_trip.id;
    UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = v_quote.indent_id;
    RETURN NEXT v_trip;
    RETURN;
  END IF;

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
    load_type,
    vehicle_display_number
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
    coalesce(v_indent.load_type, ''),
    v_vehicle_display
  )
  RETURNING * INTO v_trip;

  UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = v_quote.indent_id;

  RETURN NEXT v_trip;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.create_trip_from_direct_quote(uuid, text) IS
  'Create a trip from an accepted direct quote (Load Hub award). Optional p_vehicle_display_number is stored on trips.vehicle_display_number (Staff Handshake ad-hoc vehicle registration). Idempotent: if trip exists for indent, applies quote driver_id/vehicle_id and optional vehicle_display_number; otherwise inserts new trip.';
