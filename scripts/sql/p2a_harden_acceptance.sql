-- Phase 2A hardening acceptance (linked remote). Creates only [TEST P2A]
-- labeled rows, asserts atomicity / merge / retry, then deletes those rows.

DO $$
DECLARE
  v_org uuid := '5b471ecb-fbfb-470e-95cf-525d789c761a';
  v_owner uuid := '2bd46990-57f0-45f3-9b9c-217ebe0d25a4';
  v_counter_org uuid;
  v_plan_num text;
  v_cx uuid;
  v_cy uuid;
  v_wh_a uuid;
  v_wh_b uuid;
  v_prod uuid;
  v_oa uuid;
  v_ob uuid;
  v_la uuid;
  v_lb uuid;
  v_plan uuid;
  v_plan2 uuid;
  v_plan_number text;
  v_plan_number2 text;
  v_fail_corr text := 'p2a-harden-fail-' || replace(gen_random_uuid()::text, '-', '');
  v_ok_corr text := 'p2a-harden-ok-' || replace(gen_random_uuid()::text, '-', '');
  v_indent uuid;
  v_stops int;
  v_pickups int;
  v_drops int;
  v_allocs int;
  v_ses int;
  v_trips int;
  v_failed boolean := false;
BEGIN
  -- Counter self-heal: org with no counter row must still allocate a plan number.
  INSERT INTO public.organizations (name)
  VALUES ('[TEST P2A] Counter Host')
  RETURNING id INTO v_counter_org;
  DELETE FROM public.organization_counters WHERE organization_id = v_counter_org;
  v_plan_num := public.next_plan_number(v_counter_org);
  IF v_plan_num IS NULL OR v_plan_num NOT LIKE 'EP-%' THEN
    RAISE EXCEPTION 'next_plan_number self-heal failed: %', v_plan_num;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_counters WHERE organization_id = v_counter_org AND plan_seq >= 1
  ) THEN
    RAISE EXCEPTION 'organization_counters was not recreated by next_plan_number';
  END IF;

  INSERT INTO public.clients (organization_id, name, phone, notes)
  VALUES (v_org, '[TEST P2A] Customer X', '9999999901', '[TEST P2A]')
  RETURNING id INTO v_cx;
  INSERT INTO public.clients (organization_id, name, phone, notes)
  VALUES (v_org, '[TEST P2A] Customer Y', '9999999902', '[TEST P2A]')
  RETURNING id INTO v_cy;

  INSERT INTO public.client_warehouses (organization_id, client_id, name, city, state, address)
  VALUES
    (v_org, v_cx, '[TEST P2A] Warehouse A', 'Mumbai', 'MH', 'Wh A'),
    (v_org, v_cy, '[TEST P2A] Warehouse B', 'Pune', 'MH', 'Wh B');
  SELECT id INTO v_wh_a FROM public.client_warehouses WHERE name = '[TEST P2A] Warehouse A' AND organization_id = v_org;
  SELECT id INTO v_wh_b FROM public.client_warehouses WHERE name = '[TEST P2A] Warehouse B' AND organization_id = v_org;

  INSERT INTO public.products (organization_id, sku, name)
  VALUES (v_org, 'P2A-SKU-HARDEN-1', '[TEST P2A] Widget')
  RETURNING id INTO v_prod;

  INSERT INTO public.sales_orders (
    organization_id, order_number, customer_id, pickup_warehouse_id, status, notes,
    total_amount, total_weight_kg
  ) VALUES
    (v_org, '[TEST P2A] SO-A', v_cx, v_wh_a, 'Pending Consolidation', '[TEST P2A]', 1000, 10)
  RETURNING id INTO v_oa;
  INSERT INTO public.sales_orders (
    organization_id, order_number, customer_id, pickup_warehouse_id, status, notes,
    total_amount, total_weight_kg
  ) VALUES
    (v_org, '[TEST P2A] SO-B', v_cy, v_wh_b, 'Pending Consolidation', '[TEST P2A]', 2000, 20)
  RETURNING id INTO v_ob;

  INSERT INTO public.sales_order_lines (
    organization_id, sales_order_id, product_id, quantity, line_total, weight_kg, volume_m3
  ) VALUES
    (v_org, v_oa, v_prod, 1, 1000, 10, 0.1)
  RETURNING id INTO v_la;
  INSERT INTO public.sales_order_lines (
    organization_id, sales_order_id, product_id, quantity, line_total, weight_kg, volume_m3
  ) VALUES
    (v_org, v_ob, v_prod, 1, 2000, 20, 0.2)
  RETURNING id INTO v_lb;

  -- Failure inside the DB transaction: pickup with NULL warehouse_id violates CHECK
  -- after execution_plans insert would have occurred in the same function.
  BEGIN
    PERFORM plan_id
    FROM public.create_execution_plan_with_graph(
      v_org,
      v_fail_corr,
      'Truck',
      jsonb_build_array(
        jsonb_build_object(
          'clientStopId', 'pu-bad',
          'type', 'pickup',
          'sequence', 0,
          'label', 'Bad pickup',
          'contactName', 'N',
          'contactPhone', '1',
          'podRequired', false,
          'warehouseId', ''
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb
    );
    RAISE EXCEPTION 'atomic failure test did not reject invalid pickup';
  EXCEPTION
    WHEN check_violation OR others THEN
      IF SQLERRM LIKE 'atomic failure test%' THEN
        RAISE;
      END IF;
      v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'expected graph RPC to fail';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.execution_plans
    WHERE organization_id = v_org AND correlation_id = v_fail_corr
  ) THEN
    RAISE EXCEPTION 'orphan execution_plans row after failed create';
  END IF;

  SELECT * INTO v_plan, v_plan_number
  FROM public.create_execution_plan_with_graph(
    v_org,
    v_ok_corr,
    'Truck',
    jsonb_build_array(
      jsonb_build_object(
        'clientStopId', 'pu-a', 'type', 'pickup', 'sequence', 0,
        'label', '[TEST P2A] Warehouse A', 'contactName', 'A', 'contactPhone', '1',
        'podRequired', false, 'warehouseId', v_wh_a::text
      ),
      jsonb_build_object(
        'clientStopId', 'pu-b', 'type', 'pickup', 'sequence', 1,
        'label', '[TEST P2A] Warehouse B', 'contactName', 'B', 'contactPhone', '1',
        'podRequired', false, 'warehouseId', v_wh_b::text
      ),
      jsonb_build_object(
        'clientStopId', 'dr-x', 'type', 'drop', 'sequence', 2,
        'label', '[TEST P2A] Customer X', 'contactName', 'X', 'contactPhone', '1',
        'podRequired', true, 'warehouseId', '',
        'address', jsonb_build_object('line1', 'X st', 'city', 'Mumbai', 'state', 'MH', 'pincode', '400001')
      ),
      jsonb_build_object(
        'clientStopId', 'dr-y', 'type', 'drop', 'sequence', 3,
        'label', '[TEST P2A] Customer Y', 'contactName', 'Y', 'contactPhone', '1',
        'podRequired', true, 'warehouseId', '',
        'address', jsonb_build_object('line1', 'Y st', 'city', 'Pune', 'state', 'MH', 'pincode', '411001')
      )
    ),
    jsonb_build_array(
      jsonb_build_object('orderId', v_oa::text, 'pickupClientStopId', 'pu-a', 'dropClientStopId', 'dr-x'),
      jsonb_build_object('orderId', v_ob::text, 'pickupClientStopId', 'pu-b', 'dropClientStopId', 'dr-y')
    ),
    jsonb_build_array(
      jsonb_build_object(
        'orderId', v_oa::text, 'customerId', v_cx::text, 'customerName', 'X', 'totalAmount', 1000,
        'lineItems', jsonb_build_array(jsonb_build_object('id', v_la::text, 'quantity', 1, 'weightKg', 10, 'volumeM3', 0.1))
      ),
      jsonb_build_object(
        'orderId', v_ob::text, 'customerId', v_cy::text, 'customerName', 'Y', 'totalAmount', 2000,
        'lineItems', jsonb_build_array(jsonb_build_object('id', v_lb::text, 'quantity', 1, 'weightKg', 20, 'volumeM3', 0.2))
      )
    )
  );

  SELECT * INTO v_plan2, v_plan_number2
  FROM public.create_execution_plan_with_graph(
    v_org, v_ok_corr, 'Truck', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );

  IF v_plan2 IS DISTINCT FROM v_plan OR v_plan_number2 IS DISTINCT FROM v_plan_number THEN
    RAISE EXCEPTION 'retry returned a different plan % / % vs % / %', v_plan2, v_plan_number2, v_plan, v_plan_number;
  END IF;

  INSERT INTO public.indents (
    organization_id, execution_plan_id, sales_order_id,
    pickup_area, drop_location, client_name, client_price, supplier_target,
    vehicle_type, load_type, weight, status, shared_at,
    owner_user_id, created_by_user_id, indent_number
  ) VALUES (
    v_org, v_plan, NULL,
    '2 pickups ([TEST P2A] Warehouse A, [TEST P2A] Warehouse B)',
    '2 drops ([TEST P2A] Customer X, [TEST P2A] Customer Y)',
    '2 merged orders', 3000, 0,
    'Truck', 'General', 30, 'broadcast', now(),
    v_owner, v_owner, NULL
  )
  RETURNING id INTO v_indent;

  UPDATE public.execution_plans SET status = 'published', published_at = now() WHERE id = v_plan;
  UPDATE public.sales_orders SET status = 'Planned', execution_plan_id = v_plan WHERE id IN (v_oa, v_ob);

  SELECT count(*) INTO v_stops FROM public.execution_plan_stops WHERE execution_plan_id = v_plan;
  SELECT count(*) INTO v_pickups FROM public.execution_plan_stops
    WHERE execution_plan_id = v_plan AND source_type = 'warehouse' AND warehouse_id IS NOT NULL AND source_id IS NULL;
  SELECT count(*) INTO v_drops FROM public.execution_plan_stops
    WHERE execution_plan_id = v_plan AND source_type = 'client' AND warehouse_id IS NULL AND source_id IN (v_cx, v_cy);
  SELECT count(*) INTO v_allocs FROM public.shipment_allocations WHERE execution_plan_id = v_plan;
  SELECT count(*) INTO v_ses
  FROM public.stop_execution_state ses
  JOIN public.execution_plan_stops eps ON eps.id = ses.stop_id
  WHERE eps.execution_plan_id = v_plan;
  SELECT count(*) INTO v_trips FROM public.trips t
    WHERE t.organization_id = v_org AND t.indent_id = v_indent;

  IF v_stops <> 4 OR v_pickups <> 2 OR v_drops <> 2 THEN
    RAISE EXCEPTION 'stop graph mismatch stops=% pickups=% drops=%', v_stops, v_pickups, v_drops;
  END IF;
  IF v_allocs <> 2 THEN
    RAISE EXCEPTION 'expected 2 allocations, got %', v_allocs;
  END IF;
  IF v_ses <> 0 THEN
    RAISE EXCEPTION 'stop_execution_state should be 0, got %', v_ses;
  END IF;
  IF v_trips <> 0 THEN
    RAISE EXCEPTION 'trips should be 0, got %', v_trips;
  END IF;
  IF (SELECT sales_order_id FROM public.indents WHERE id = v_indent) IS NOT NULL THEN
    RAISE EXCEPTION 'merged indent must have sales_order_id NULL';
  END IF;
  IF (SELECT count(*) FROM public.execution_plans WHERE organization_id = v_org AND correlation_id = v_ok_corr) <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 plan for retry key';
  END IF;

  RAISE NOTICE 'P2A_ACCEPT_OK plan=% indent=% stops=% allocs=%', v_plan, v_indent, v_stops, v_allocs;

  -- Cleanup only [TEST P2A] rows created above (and the counter-host org).
  DELETE FROM public.shipment_allocations WHERE execution_plan_id = v_plan;
  DELETE FROM public.execution_plan_stops WHERE execution_plan_id = v_plan;
  DELETE FROM public.indents WHERE id = v_indent;
  DELETE FROM public.sales_order_lines WHERE sales_order_id IN (v_oa, v_ob);
  DELETE FROM public.sales_orders WHERE id IN (v_oa, v_ob);
  DELETE FROM public.execution_plans WHERE id = v_plan;
  DELETE FROM public.products WHERE id = v_prod;
  DELETE FROM public.client_warehouses WHERE id IN (v_wh_a, v_wh_b);
  DELETE FROM public.clients WHERE id IN (v_cx, v_cy);
  DELETE FROM public.organizations WHERE id = v_counter_org;
END $$;
