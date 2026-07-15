-- Fix: create_trip_from_direct_quote sets supplier_id = NULL when no suppliers row is linked to the
-- bidder org. Root cause: the linked_organization_id lookup silently returns nothing when the indent
-- owner's org has never added a supplier entity for the bidder org.
--
-- Fix: after the lookup fails, auto-create a suppliers row (linked to bidder org) so every
-- direct-quote trip always has a resolvable supplier_id.
--
-- Secondary fix: award_indent_to_trip incorrectly used indent.assigned_supplier_id (which FKs to
-- organizations, not suppliers) directly as a suppliers row id. Replace with the same lookup
-- pattern: linked_organization_id = assigned_supplier_id (the org id).

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
  v_quote              public.direct_quotes%ROWTYPE;
  v_indent             public.indents%ROWTYPE;
  v_supplier_id        uuid;
  v_org_id             uuid;
  v_trip               public.trips%ROWTYPE;
  v_vehicle_display    text;
  v_try                integer := 0;
  v_actor_user_id      uuid := auth.uid();
  v_created_by_user_id uuid := NULL;
  v_bidder_org_name    text;
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

  SELECT * INTO v_quote FROM public.direct_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Direct quote not found';
  END IF;
  IF (v_quote.status IS NULL OR lower(v_quote.status) <> 'accepted') THEN
    RAISE EXCEPTION 'Quote must be accepted before creating a trip';
  END IF;

  SELECT * INTO v_indent FROM public.indents WHERE id = (v_quote).indent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent not found';
  END IF;

  v_org_id := v_indent.organization_id;

  IF NOT (
    public.is_org_member(v_org_id) OR public.is_org_member((v_quote).bidder_organization_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to create trip from this quote';
  END IF;

  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = (v_quote).indent_id
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.trips
    SET
      driver_id = COALESCE((v_quote).driver_id, driver_id),
      vehicle_id = COALESCE((v_quote).vehicle_id, vehicle_id),
      updated_at = now(),
      vehicle_display_number = CASE
        WHEN v_vehicle_display IS NOT NULL THEN v_vehicle_display
        ELSE vehicle_display_number
      END
    WHERE id = (v_trip).id;
    SELECT * INTO v_trip FROM public.trips WHERE id = (v_trip).id;
    UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  -- Resolve supplier_id: find existing suppliers row linked to the bidder org.
  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND linked_organization_id = (v_quote).bidder_organization_id
  LIMIT 1;

  -- No linked supplier row exists yet — auto-create one so the trip always has a supplier_id.
  -- This mirrors the real-world relationship: the shipper already accepted this org's quote.
  IF v_supplier_id IS NULL THEN
    SELECT COALESCE(NULLIF(TRIM(o.name), ''), 'Supplier')
    INTO v_bidder_org_name
    FROM public.organizations o
    WHERE o.id = (v_quote).bidder_organization_id;

    INSERT INTO public.suppliers (
      organization_id,
      linked_organization_id,
      name,
      is_active,
      is_verified
    )
    VALUES (
      v_org_id,
      (v_quote).bidder_organization_id,
      COALESCE(v_bidder_org_name, 'Supplier'),
      true,
      false
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_supplier_id;

    -- Handle race: if ON CONFLICT fired, re-fetch the existing row.
    IF v_supplier_id IS NULL THEN
      SELECT id INTO v_supplier_id
      FROM public.suppliers
      WHERE organization_id = v_org_id
        AND linked_organization_id = (v_quote).bidder_organization_id
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
        (v_indent).owner_user_id,
        v_created_by_user_id,
        '',
        (v_quote).indent_id,
        'direct_quote',
        coalesce((v_indent).pickup_area, ''),
        coalesce((v_indent).drop_location, ''),
        coalesce((v_indent).client_name, ''),
        coalesce((v_indent).client_price, 0),
        coalesce((v_quote).amount, 0),
        v_supplier_id,
        (v_quote).driver_id,
        (v_quote).vehicle_id,
        'assigned',
        (v_indent).pickup_date,
        coalesce((v_indent).load_type, ''),
        v_vehicle_display,
        0,
        0,
        'pending',
        0
      )
      RETURNING * INTO v_trip;

      UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;
      RETURN NEXT v_trip;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT t.* INTO v_trip
        FROM public.trips t
        WHERE t.indent_id = (v_quote).indent_id
        LIMIT 1;
        IF FOUND THEN
          UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;
          RETURN NEXT v_trip;
          RETURN;
        END IF;

        INSERT INTO public.organization_counters (organization_id, trip_seq)
        VALUES (v_org_id, 0)
        ON CONFLICT (organization_id) DO NOTHING;

        UPDATE public.organization_counters oc
        SET trip_seq = greatest(
          oc.trip_seq,
          coalesce((
            SELECT max(
              CASE
                WHEN t.trip_number ~ '^TRP[0-9]+$'
                THEN substring(t.trip_number FROM 4)::bigint
                ELSE 0
              END
            )
            FROM public.trips t
            WHERE t.organization_id = v_org_id
          ), 0)
        )
        WHERE oc.organization_id = v_org_id;

        IF v_try >= 3 THEN
          RAISE EXCEPTION 'Could not create trip: repeated unique conflict after counter sync';
        END IF;
    END;
  END LOOP;
END;
$$;


-- Fix award_indent_to_trip: it incorrectly used indent.assigned_supplier_id (an organizations FK)
-- directly as a suppliers row id. Replace with a proper linked_organization_id lookup.
CREATE OR REPLACE FUNCTION public.award_indent_to_trip(
  p_indent_id             uuid,
  p_supplier_rate         numeric  DEFAULT NULL,
  p_supplier_id           uuid     DEFAULT NULL,
  p_supplier_org_id       uuid     DEFAULT NULL,
  p_driver_id             uuid     DEFAULT NULL,
  p_vehicle_id            uuid     DEFAULT NULL,
  p_vehicle_display_number text    DEFAULT NULL
)
RETURNS SETOF public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.create_trip_from_direct_quote(uuid, text) IS
  'Create a trip from an accepted direct quote. Resolves supplier_id by linked_organization_id lookup;
   auto-creates a suppliers row for the bidder org if none exists so supplier_id is never NULL.';

COMMENT ON FUNCTION public.award_indent_to_trip(uuid, numeric, uuid, uuid, uuid, uuid, text) IS
  'Convert a single awarded/open indent into a trips row (manual-assignment path — no direct quote).
   Idempotent: returns existing trip if already created, applying any new driver/vehicle.
   Resolution order: supplier_rate = p_supplier_rate → indent.assigned_supplier_rate → indent.supplier_target;
   supplier_id = p_supplier_id → lookup by indent.assigned_supplier_id (org FK via linked_organization_id)
     → lookup by p_supplier_org_id.
   Sets indent.status = completed after insert. Caller must be org member.';

-- Also backfill TRP028 supplier_id from the auto-create logic above (data fix for existing row).
DO $$
DECLARE
  v_supplier_id uuid;
  v_org_id uuid := 'c481a15d-c488-4e26-aa03-d77681fb5835';
  v_bidder_org_id uuid := 'b177c614-f146-4d1c-ae80-bcf7aca3f9cd';
  v_trip_id uuid := '2b1a35ee-8fff-41cb-9e45-48692725eef0';
BEGIN
  -- Find or create the suppliers row
  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND linked_organization_id = v_bidder_org_id;

  IF v_supplier_id IS NULL THEN
    INSERT INTO public.suppliers (
      organization_id, linked_organization_id, name, is_active, is_verified
    )
    SELECT v_org_id, v_bidder_org_id,
           COALESCE(NULLIF(TRIM(o.name), ''), 'Supplier'),
           true, false
    FROM public.organizations o WHERE o.id = v_bidder_org_id
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_supplier_id;

    IF v_supplier_id IS NULL THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
      WHERE organization_id = v_org_id AND linked_organization_id = v_bidder_org_id;
    END IF;
  END IF;

  -- Backfill TRP028
  IF v_supplier_id IS NOT NULL THEN
    UPDATE public.trips
    SET supplier_id = v_supplier_id, updated_at = now()
    WHERE id = v_trip_id AND supplier_id IS NULL;
  END IF;
END;
$$;
