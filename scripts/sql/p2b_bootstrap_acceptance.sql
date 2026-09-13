-- Phase 2B bootstrap acceptance (linked remote). Creates only [TEST P2B]
-- labeled rows, asserts seeder / trigger / rollback, then deletes those rows.

DO $$
DECLARE
  v_org uuid;
  v_driver uuid;
  v_plan4 uuid;
  v_plan1 uuid;
  v_plan0 uuid;
  v_planj uuid;
  v_indent4 uuid;
  v_indent1 uuid;
  v_indent0 uuid;
  v_indent_legacy uuid;
  v_indent_j uuid;
  v_trip4 uuid;
  v_trip1 uuid;
  v_trip_legacy uuid;
  v_trip_mover uuid;
  v_trip_j uuid;
  v_trip_fail uuid;
  v_trip_retry uuid;
  v_ses int;
  v_trips int;
  v_seq int[];
  v_stop_ids uuid[];
  v_plan_stop_ids uuid[];
  v_drv uuid;
  v_err text;
BEGIN
  INSERT INTO public.organizations (name)
  VALUES ('[TEST P2B] Bootstrap Host')
  RETURNING id INTO v_org;

  INSERT INTO public.drivers (organization_id, name, phone)
  VALUES (
    v_org,
    '[TEST P2B] Driver',
    '+91' || lpad((floor(random() * 9000000000 + 1000000000))::bigint::text, 10, '0')
  )
  RETURNING id INTO v_driver;

  -- ── A. 4-stop plan ────────────────────────────────────────────────────
  INSERT INTO public.execution_plans (plan_number, organization_id, status, origin, correlation_id)
  VALUES ('[TEST P2B] EP-4', v_org, 'published', 'customer_orders', 'p2b-4-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_plan4;

  INSERT INTO public.execution_plan_stops (
    organization_id, execution_plan_id, stop_type, sequence, source_type, display_name
  ) VALUES
    (v_org, v_plan4, 'pickup', 0, 'manual', '[TEST P2B] P1'),
    (v_org, v_plan4, 'pickup', 1, 'manual', '[TEST P2B] P2'),
    (v_org, v_plan4, 'drop', 2, 'manual', '[TEST P2B] D1'),
    (v_org, v_plan4, 'drop', 3, 'manual', '[TEST P2B] D2');

  INSERT INTO public.indents (
    organization_id, indent_number, pickup_area, drop_location, client_name,
    client_price, status, execution_plan_id
  ) VALUES (
    v_org, '', '[TEST P2B] Pickup', '[TEST P2B] Drop', '[TEST P2B] Plan4',
    100, 'broadcast', v_plan4
  ) RETURNING id INTO v_indent4;

  INSERT INTO public.trips (
    organization_id, trip_number, indent_id, source,
    pickup_area, drop_location, client_name, status, driver_id
  ) VALUES (
    v_org, '', v_indent4, 'indent',
    '[TEST P2B] Pickup', '[TEST P2B] Drop', '[TEST P2B] Plan4', 'draft', v_driver
  ) RETURNING id INTO v_trip4;

  SELECT count(*) INTO v_ses FROM public.stop_execution_state WHERE trip_id = v_trip4;
  IF v_ses <> 4 THEN
    RAISE EXCEPTION 'A: expected 4 SES, got %', v_ses;
  END IF;

  SELECT array_agg(ses.stop_id ORDER BY ses.sequence), array_agg(ses.sequence ORDER BY ses.sequence)
  INTO v_stop_ids, v_seq
  FROM public.stop_execution_state ses
  WHERE ses.trip_id = v_trip4;

  SELECT array_agg(eps.id ORDER BY eps.sequence)
  INTO v_plan_stop_ids
  FROM public.execution_plan_stops eps
  WHERE eps.execution_plan_id = v_plan4;

  IF v_stop_ids IS DISTINCT FROM v_plan_stop_ids THEN
    RAISE EXCEPTION 'A/J: SES stop_ids do not match plan stops';
  END IF;
  IF v_seq IS DISTINCT FROM ARRAY[0, 1, 2, 3] THEN
    RAISE EXCEPTION 'A: sequence snapshot mismatch: %', v_seq;
  END IF;

  SELECT driver_id INTO v_drv FROM public.stop_execution_state WHERE trip_id = v_trip4 LIMIT 1;
  IF v_drv IS DISTINCT FROM v_driver THEN
    RAISE EXCEPTION 'H: SES.driver_id % <> trip driver %', v_drv, v_driver;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stop_execution_state ses
    JOIN public.execution_plan_stops eps ON eps.id = ses.stop_id
    WHERE ses.trip_id = v_trip4 AND eps.execution_plan_id IS DISTINCT FROM v_plan4
  ) THEN
    RAISE EXCEPTION 'A: SES stop does not belong to trip plan';
  END IF;

  -- ── B + I. 1-stop plan, no driver ─────────────────────────────────────
  INSERT INTO public.execution_plans (plan_number, organization_id, status, origin, correlation_id)
  VALUES ('[TEST P2B] EP-1', v_org, 'published', 'customer_orders', 'p2b-1-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_plan1;

  INSERT INTO public.execution_plan_stops (
    organization_id, execution_plan_id, stop_type, sequence, source_type, display_name
  ) VALUES (v_org, v_plan1, 'pickup', 0, 'manual', '[TEST P2B] Only');

  INSERT INTO public.indents (
    organization_id, indent_number, pickup_area, drop_location, client_name,
    client_price, status, execution_plan_id
  ) VALUES (
    v_org, '', '[TEST P2B] Pickup', '[TEST P2B] Drop', '[TEST P2B] Plan1',
    50, 'broadcast', v_plan1
  ) RETURNING id INTO v_indent1;

  INSERT INTO public.trips (
    organization_id, trip_number, indent_id, source,
    pickup_area, drop_location, client_name, status
  ) VALUES (
    v_org, '', v_indent1, 'indent',
    '[TEST P2B] Pickup', '[TEST P2B] Drop', '[TEST P2B] Plan1', 'draft'
  ) RETURNING id INTO v_trip1;

  SELECT count(*) INTO v_ses FROM public.stop_execution_state WHERE trip_id = v_trip1;
  IF v_ses <> 1 THEN
    RAISE EXCEPTION 'B: expected 1 SES, got %', v_ses;
  END IF;
  SELECT driver_id INTO v_drv FROM public.stop_execution_state WHERE trip_id = v_trip1;
  IF v_drv IS NOT NULL THEN
    RAISE EXCEPTION 'I: expected NULL driver_id, got %', v_drv;
  END IF;

  -- ── C. Legacy non-plan indent ─────────────────────────────────────────
  INSERT INTO public.indents (
    organization_id, indent_number, pickup_area, drop_location, client_name,
    client_price, status
  ) VALUES (
    v_org, '', '[TEST P2B] Legacy Pickup', '[TEST P2B] Legacy Drop', '[TEST P2B] Legacy',
    10, 'open'
  ) RETURNING id INTO v_indent_legacy;

  INSERT INTO public.trips (
    organization_id, trip_number, indent_id, source,
    pickup_area, drop_location, client_name, status
  ) VALUES (
    v_org, '', v_indent_legacy, 'indent',
    '[TEST P2B] Legacy Pickup', '[TEST P2B] Legacy Drop', '[TEST P2B] Legacy', 'draft'
  ) RETURNING id INTO v_trip_legacy;

  SELECT count(*) INTO v_ses FROM public.stop_execution_state WHERE trip_id = v_trip_legacy;
  IF v_ses <> 0 THEN
    RAISE EXCEPTION 'C: legacy trip must have 0 SES, got %', v_ses;
  END IF;

  -- ── D. Mover-asset (indent_id NULL, source_indent_id = plan indent) ───
  INSERT INTO public.trips (
    organization_id, trip_number, indent_id, source_indent_id, source,
    pickup_area, drop_location, client_name, status
  ) VALUES (
    v_org, '', NULL, v_indent4, 'mover_asset',
    '[TEST P2B] Pickup', '[TEST P2B] Drop', '[TEST P2B] Mover', 'draft'
  ) RETURNING id INTO v_trip_mover;

  SELECT count(*) INTO v_ses FROM public.stop_execution_state WHERE trip_id = v_trip_mover;
  IF v_ses <> 0 THEN
    RAISE EXCEPTION 'D: mover-asset must have 0 SES, got %', v_ses;
  END IF;

  -- ── E + G. Zero-stop plan: trip INSERT must fail and roll back ────────
  INSERT INTO public.execution_plans (plan_number, organization_id, status, origin, correlation_id)
  VALUES ('[TEST P2B] EP-0', v_org, 'published', 'customer_orders', 'p2b-0-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_plan0;

  INSERT INTO public.indents (
    organization_id, indent_number, pickup_area, drop_location, client_name,
    client_price, status, execution_plan_id
  ) VALUES (
    v_org, '', '[TEST P2B] Pickup', '[TEST P2B] Drop', '[TEST P2B] Plan0',
    1, 'broadcast', v_plan0
  ) RETURNING id INTO v_indent0;

  v_err := NULL;
  BEGIN
    INSERT INTO public.trips (
      organization_id, trip_number, indent_id, source,
      pickup_area, drop_location, client_name, status
    ) VALUES (
      v_org, '', v_indent0, 'indent',
      '[TEST P2B] Pickup', '[TEST P2B] Drop', '[TEST P2B] Plan0', 'draft'
    ) RETURNING id INTO v_trip_fail;
  EXCEPTION
    WHEN OTHERS THEN
      v_err := SQLERRM;
      v_trip_fail := NULL;
  END;

  IF v_err IS NULL OR v_err NOT ILIKE '%has no stops%' THEN
    RAISE EXCEPTION 'E: zero-stop plan must RAISE, got: %', v_err;
  END IF;
  IF v_trip_fail IS NOT NULL THEN
    RAISE EXCEPTION 'E: trip id leaked after zero-stop failure';
  END IF;
  SELECT count(*) INTO v_trips FROM public.trips t WHERE t.indent_id = v_indent0;
  IF v_trips <> 0 THEN
    RAISE EXCEPTION 'E/G: trip row survived seeder failure';
  END IF;
  SELECT count(*) INTO v_ses
  FROM public.stop_execution_state ses
  JOIN public.trips t ON t.id = ses.trip_id
  WHERE t.indent_id = v_indent0;
  IF v_ses <> 0 THEN
    RAISE EXCEPTION 'G: partial SES after seeder failure';
  END IF;

  -- ── F. Retry / duplicate seed ─────────────────────────────────────────
  PERFORM public.seed_stop_execution_state_for_trip(v_trip4);
  PERFORM public.seed_stop_execution_state_for_trip(v_trip4);
  SELECT count(*) INTO v_ses FROM public.stop_execution_state WHERE trip_id = v_trip4;
  IF v_ses <> 4 THEN
    RAISE EXCEPTION 'F: retry created duplicate SES, count=%', v_ses;
  END IF;

  -- Concurrent uniqueness: second canonical trip for same indent must fail.
  v_err := NULL;
  BEGIN
    INSERT INTO public.trips (
      organization_id, trip_number, indent_id, source,
      pickup_area, drop_location, client_name, status
    ) VALUES (
      v_org, '', v_indent4, 'indent',
      '[TEST P2B] Pickup', '[TEST P2B] Drop', '[TEST P2B] Dup', 'draft'
    ) RETURNING id INTO v_trip_retry;
  EXCEPTION
    WHEN unique_violation THEN
      v_err := 'unique';
      v_trip_retry := NULL;
  END;
  IF v_err IS DISTINCT FROM 'unique' THEN
    RAISE EXCEPTION 'concurrency: expected trips_one_per_indent unique_violation, got %', v_err;
  END IF;
  SELECT count(*) INTO v_ses FROM public.stop_execution_state WHERE trip_id = v_trip4;
  IF v_ses <> 4 THEN
    RAISE EXCEPTION 'concurrency: SES set changed after rejected second trip';
  END IF;

  -- ── J. Two-order-shaped 4-stop (same as A; ownership already checked) ─
  INSERT INTO public.execution_plans (plan_number, organization_id, status, origin, correlation_id)
  VALUES ('[TEST P2B] EP-J', v_org, 'published', 'customer_orders', 'p2b-j-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_planj;

  INSERT INTO public.execution_plan_stops (
    organization_id, execution_plan_id, stop_type, sequence, source_type, display_name
  ) VALUES
    (v_org, v_planj, 'pickup', 0, 'manual', '[TEST P2B] JA'),
    (v_org, v_planj, 'pickup', 1, 'manual', '[TEST P2B] JB'),
    (v_org, v_planj, 'drop', 2, 'manual', '[TEST P2B] JX'),
    (v_org, v_planj, 'drop', 3, 'manual', '[TEST P2B] JY');

  INSERT INTO public.indents (
    organization_id, indent_number, pickup_area, drop_location, client_name,
    client_price, status, execution_plan_id
  ) VALUES (
    v_org, '', '[TEST P2B] A+B', '[TEST P2B] X+Y', '[TEST P2B] 2-order',
    3000, 'broadcast', v_planj
  ) RETURNING id INTO v_indent_j;

  INSERT INTO public.trips (
    organization_id, trip_number, indent_id, source,
    pickup_area, drop_location, client_name, status
  ) VALUES (
    v_org, '', v_indent_j, 'indent',
    '[TEST P2B] A+B', '[TEST P2B] X+Y', '[TEST P2B] 2-order', 'draft'
  ) RETURNING id INTO v_trip_j;

  SELECT count(*) INTO v_ses FROM public.stop_execution_state WHERE trip_id = v_trip_j;
  IF v_ses <> 4 THEN
    RAISE EXCEPTION 'J: expected 4 SES, got %', v_ses;
  END IF;

  -- Cleanup [TEST P2B] graph (children first).
  DELETE FROM public.stop_execution_state
  WHERE trip_id IN (SELECT id FROM public.trips WHERE organization_id = v_org);
  DELETE FROM public.trips WHERE organization_id = v_org;
  DELETE FROM public.indents WHERE organization_id = v_org;
  DELETE FROM public.shipment_allocations WHERE organization_id = v_org;
  DELETE FROM public.execution_plan_stops WHERE organization_id = v_org;
  DELETE FROM public.execution_plans WHERE organization_id = v_org;
  DELETE FROM public.drivers WHERE organization_id = v_org;
  DELETE FROM public.organization_counters WHERE organization_id = v_org;
  DELETE FROM public.organizations WHERE id = v_org;

  RAISE NOTICE 'P2B bootstrap acceptance PASS';
END;
$$;
