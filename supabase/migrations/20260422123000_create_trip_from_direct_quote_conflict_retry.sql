-- Harden create_trip_from_direct_quote against concurrent inserts and stale org counters.
-- Fixes 409 conflicts during Staff Handshake "Assign Trip" where insert may fail
-- with unique violations (trip already created in race, or trip_number collision).

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
  v_try integer := 0;
BEGIN
  v_vehicle_display := NULLIF(TRIM(COALESCE(p_vehicle_display_number, '')), '');

  SELECT * INTO v_quote FROM public.direct_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Direct quote not found';
  END IF;
  IF (v_quote.status IS NULL OR lower(v_quote.status) <> 'accepted') THEN
    RAISE EXCEPTION 'Quote must be accepted before creating a trip';
  END IF;

  -- Lock indent row to serialize create attempts for the same load.
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

  -- Idempotent: if a trip already exists for this indent, update assignment and return it.
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

  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND linked_organization_id = (v_quote).bidder_organization_id
  LIMIT 1;

  -- Retry insert a few times for unique conflicts.
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
        auth.uid(),
        '', -- DB trigger sets trip_number
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
        -- Race path: if another transaction created the same indent trip, return it.
        SELECT t.* INTO v_trip
        FROM public.trips t
        WHERE t.indent_id = (v_quote).indent_id
        LIMIT 1;
        IF FOUND THEN
          UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;
          RETURN NEXT v_trip;
          RETURN;
        END IF;

        -- Repair stale per-org counter (trip_number uniqueness) and retry.
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

COMMENT ON FUNCTION public.create_trip_from_direct_quote(uuid, text) IS
  'Create trip from accepted direct quote (race-safe). Idempotent by indent_id; retries unique conflicts and repairs org trip counter if stale.';
