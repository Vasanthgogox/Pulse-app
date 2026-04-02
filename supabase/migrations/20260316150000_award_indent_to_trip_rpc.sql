-- award_indent_to_trip(p_indent_id, ...) — single-indent conversion.
-- Works for the manual-assignment path (indent has assigned_supplier_id / assigned_supplier_rate)
-- when no direct quote exists. Complements create_trip_from_direct_quote which covers the
-- direct-quote path.
--
-- Rules:
--   • Idempotent: if a trip already exists for the indent, apply any new driver/vehicle and return it.
--   • Caller must be a member of the indent's organization (RLS equivalent check).
--   • Indent must not be 'cancelled'; must have pickup_area, drop_location, client_price > 0.
--   • Sets indent.status = 'completed' after trip insert (open/awarded → completed).
--   • supplier_rate resolution order: p_supplier_rate → indent.assigned_supplier_rate → indent.supplier_target → 0.
--   • supplier_id resolution order: p_supplier_id → lookup suppliers by p_supplier_org_id → NULL.

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
  -- 1. Fetch and validate indent
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

  -- 2. Auth: caller must belong to the indent's org
  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not authorized: caller is not a member of org %', v_org_id;
  END IF;

  -- 3. Idempotent: trip already exists for this indent — apply any new driver/vehicle and return
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = p_indent_id
  LIMIT 1;

  IF FOUND THEN
    -- Only update pre-departure fields (status not completed/cancelled)
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

  -- 4. Resolve supplier_rate
  v_supplier_rate := COALESCE(
    p_supplier_rate,
    (v_indent.assigned_supplier_rate)::numeric,  -- from indent if set
    v_indent.supplier_target,
    0
  );

  -- 5. Resolve supplier_id
  v_supplier_id := p_supplier_id;

  -- If not provided directly, try indent.assigned_supplier_id
  IF v_supplier_id IS NULL THEN
    v_supplier_id := (v_indent.assigned_supplier_id)::uuid;
  END IF;

  -- If still null and a bidder org is given, look up the supplier row in the indent org
  IF v_supplier_id IS NULL AND p_supplier_org_id IS NOT NULL THEN
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE organization_id = v_org_id
      AND linked_organization_id = p_supplier_org_id
    LIMIT 1;
  END IF;

  -- 6. Resolve vehicle_display_number
  v_vehicle_disp := NULLIF(TRIM(COALESCE(p_vehicle_display_number, '')), '');

  -- 7. Insert trip
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
    '',                                       -- DB trigger sets display_trip_id
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

  -- 8. Mark indent completed
  UPDATE public.indents
  SET status = 'completed', updated_at = now()
  WHERE id = p_indent_id;

  RETURN NEXT v_trip;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.award_indent_to_trip(uuid, numeric, uuid, uuid, uuid, uuid, text) IS
  'Convert a single awarded/open indent into a trips row (manual-assignment path — no direct quote).
   Idempotent: returns existing trip if already created, applying any new driver/vehicle.
   Resolution order: supplier_rate = p_supplier_rate → indent.assigned_supplier_rate → indent.supplier_target;
   supplier_id = p_supplier_id → indent.assigned_supplier_id → lookup by p_supplier_org_id.
   Sets indent.status = completed after insert. Caller must be org member.';

REVOKE ALL ON FUNCTION public.award_indent_to_trip(uuid, numeric, uuid, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_indent_to_trip(uuid, numeric, uuid, uuid, uuid, uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- batch_award_indents_to_trips(p_org_id) — O(n) sweep.
-- Converts ALL indents in the org that are in status 'awarded' with no
-- corresponding trip row yet. Uses a single set-based INSERT … SELECT so the
-- DB does one pass (O(n)) over the eligible indents.
-- Returns the count of newly created trips.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.batch_award_indents_to_trips(
  p_org_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  -- Auth: caller must belong to the org
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized for org %', p_org_id;
  END IF;

  -- Single set-based INSERT: one row per awarded indent that has no trip yet.
  -- O(n): one seq-scan on indents filtered by org+status, one index lookup on
  -- trips.indent_id (partial index if present, else PK scan on small result set).
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
    platform_fee,
    driver_commission,
    payment_status,
    amount_paid
  )
  SELECT
    i.organization_id,
    '',                -- DB trigger sets display_trip_id
    i.id,
    'indent',
    coalesce(i.pickup_area, ''),
    coalesce(i.drop_location, ''),
    coalesce(i.client_name, ''),
    coalesce(i.client_price, 0),
    coalesce(
      (i.assigned_supplier_rate)::numeric,
      i.supplier_target,
      0
    ),
    -- supplier_id: resolve from indent's assigned_supplier_id if it's a valid UUID in suppliers
    (
      SELECT s.id FROM public.suppliers s
      WHERE s.organization_id = i.organization_id
        AND s.id = (i.assigned_supplier_id)::uuid
      LIMIT 1
    ),
    NULL,              -- driver_id: not known at batch-award time
    NULL,              -- vehicle_id: not known at batch-award time
    'draft',           -- status: no driver yet
    i.pickup_date,
    coalesce(i.load_type, ''),
    0, 0, 'pending', 0
  FROM public.indents i
  -- Only indents with required fields
  WHERE i.organization_id = p_org_id
    AND lower(coalesce(i.status, '')) = 'awarded'
    AND coalesce(trim(i.pickup_area), '')    <> ''
    AND coalesce(trim(i.drop_location), '')  <> ''
    AND coalesce(i.client_price, 0)           > 0
    -- Idempotency: skip indents that already have a trip
    AND NOT EXISTS (
      SELECT 1 FROM public.trips t WHERE t.indent_id = i.id
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Mark those indents as completed in a single UPDATE
  UPDATE public.indents
  SET status = 'completed', updated_at = now()
  WHERE organization_id = p_org_id
    AND lower(coalesce(status, '')) = 'awarded'
    -- Only ones we just converted (they now have a matching trip)
    AND EXISTS (
      SELECT 1 FROM public.trips t WHERE t.indent_id = indents.id
    );

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.batch_award_indents_to_trips(uuid) IS
  'O(n) batch conversion: inserts one trip per awarded indent that has no trip yet.
   Uses a single set-based INSERT…SELECT so no per-row round-trips.
   Returns count of newly created trips. Caller must be org member.';

REVOKE ALL ON FUNCTION public.batch_award_indents_to_trips(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_award_indents_to_trips(uuid) TO authenticated;
