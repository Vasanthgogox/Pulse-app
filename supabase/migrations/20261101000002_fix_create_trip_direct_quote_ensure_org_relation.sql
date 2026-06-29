-- Fix: create_trip_from_direct_quote must atomically ensure org relation + supplier link
-- before inserting the trip. Previously these were created by a separate connection_request
-- approval flow that could lag trip creation by minutes, causing the supplier to see the
-- trip before the visibility relation existed.

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
  v_shipper_org_name text;
  v_bidder_org_name text;
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

  -- Idempotent: return existing trip for this indent if any
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = v_quote.indent_id
  LIMIT 1;
  IF FOUND THEN
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  -- Resolve org names for supplier/client rows
  SELECT coalesce(nullif(trim(o.name), ''), 'Connected') INTO v_shipper_org_name
  FROM public.organizations o WHERE o.id = v_org_id;

  SELECT coalesce(nullif(trim(o.name), ''), 'Connected') INTO v_bidder_org_name
  FROM public.organizations o WHERE o.id = v_quote.bidder_organization_id;

  -- Ensure organization_relations row exists (shipper → supplier_client direction).
  -- Mirrors what on_connection_request_approved does for request_shipper_client.
  INSERT INTO public.organization_relations (from_organization_id, to_organization_id, relation_type, status)
  VALUES (v_quote.bidder_organization_id, v_org_id, 'supplier_client', 'active')
  ON CONFLICT (from_organization_id, to_organization_id, relation_type)
  DO UPDATE SET status = 'active', updated_at = now();

  -- Ensure the shipper has an integrated suppliers row for the bidder org.
  INSERT INTO public.suppliers (organization_id, name, linked_organization_id, supplier_type, updated_at)
  VALUES (v_org_id, v_bidder_org_name, v_quote.bidder_organization_id, 'integrated', now())
  ON CONFLICT (organization_id, linked_organization_id)
    WHERE linked_organization_id IS NOT NULL
  DO UPDATE SET
    supplier_type = 'integrated',
    linked_organization_id = v_quote.bidder_organization_id,
    updated_at = now();

  -- Resolve supplier_id: shipper's supplier row linked to bidder org (now guaranteed to exist)
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

  RETURN NEXT v_trip;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.create_trip_from_direct_quote(uuid) IS
  'Create a trip from an accepted direct quote (Load Hub award). Atomically ensures organization_relations + integrated suppliers row exist before inserting the trip, so visibility is consistent from the moment of creation. Idempotent: returns existing trip if one exists for the indent.';

REVOKE ALL ON FUNCTION public.create_trip_from_direct_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_trip_from_direct_quote(uuid) TO authenticated;
