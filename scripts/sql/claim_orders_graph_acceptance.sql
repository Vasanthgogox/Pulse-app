-- Atomic sales-order claim inside create_execution_plan_with_graph.
-- Creates only [TEST CLAIM] labeled rows, asserts 1–9, then deletes them.
-- Requires migration 20270915101200 applied. Do not run against a host
-- that still has the pre-claim RPC (the mixed/second-plan cases would persist).

DO $$
DECLARE
  v_org uuid := '5b471ecb-fbfb-470e-95cf-525d789c761a';
  v_owner uuid := '2bd46990-57f0-45f3-9b9c-217ebe0d25a4';
  v_cx uuid;
  v_wh uuid;
  v_prod uuid;
  v_oa uuid;
  v_ob uuid;
  v_oc uuid;
  v_la uuid;
  v_lb uuid;
  v_lc uuid;
  v_plan_a uuid;
  v_plan_a_num text;
  v_plan_a2 uuid;
  v_plan_a2_num text;
  v_plan_merged uuid;
  v_indent uuid;
  v_indent2 uuid;
  v_corr_a text := 'claim-graph-a-' || replace(gen_random_uuid()::text, '-', '');
  v_corr_b text := 'claim-graph-b-' || replace(gen_random_uuid()::text, '-', '');
  v_corr_merged text := 'claim-graph-m-' || replace(gen_random_uuid()::text, '-', '');
  v_corr_mixed text := 'claim-graph-x-' || replace(gen_random_uuid()::text, '-', '');
  v_failed boolean;
  v_claimed_status text;
  v_claimed_plan uuid;
  v_allocs int;
  v_ep_b int;
BEGIN
  INSERT INTO public.clients (organization_id, name, phone, notes)
  VALUES (v_org, '[TEST CLAIM] Customer', '9999999911', '[TEST CLAIM]')
  RETURNING id INTO v_cx;

  INSERT INTO public.client_warehouses (organization_id, client_id, name, city, state, address)
  VALUES (v_org, v_cx, '[TEST CLAIM] Warehouse', 'Mumbai', 'MH', 'Wh')
  RETURNING id INTO v_wh;

  INSERT INTO public.products (organization_id, sku, name)
  VALUES (v_org, 'CLAIM-SKU-1', '[TEST CLAIM] Widget')
  RETURNING id INTO v_prod;

  INSERT INTO public.sales_orders (
    organization_id, order_number, customer_id, pickup_warehouse_id, status, notes,
    total_amount, total_weight_kg
  ) VALUES
    (v_org, '[TEST CLAIM] SO-A', v_cx, v_wh, 'Pending Consolidation', '[TEST CLAIM]', 1000, 10)
  RETURNING id INTO v_oa;
  INSERT INTO public.sales_orders (
    organization_id, order_number, customer_id, pickup_warehouse_id, status, notes,
    total_amount, total_weight_kg
  ) VALUES
    (v_org, '[TEST CLAIM] SO-B', v_cx, v_wh, 'Pending Consolidation', '[TEST CLAIM]', 2000, 20)
  RETURNING id INTO v_ob;
  INSERT INTO public.sales_orders (
    organization_id, order_number, customer_id, pickup_warehouse_id, status, notes,
    total_amount, total_weight_kg
  ) VALUES
    (v_org, '[TEST CLAIM] SO-C', v_cx, v_wh, 'Pending Consolidation', '[TEST CLAIM]', 3000, 30)
  RETURNING id INTO v_oc;

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
  INSERT INTO public.sales_order_lines (
    organization_id, sales_order_id, product_id, quantity, line_total, weight_kg, volume_m3
  ) VALUES
    (v_org, v_oc, v_prod, 1, 3000, 30, 0.3)
  RETURNING id INTO v_lc;

  -- 1. One order → one plan (atomic claim)
  SELECT * INTO v_plan_a, v_plan_a_num
  FROM public.create_execution_plan_with_graph(
    v_org, v_corr_a, 'Truck',
    jsonb_build_array(
      jsonb_build_object(
        'clientStopId', 'pu', 'type', 'pickup', 'sequence', 0,
        'label', '[TEST CLAIM] Warehouse', 'contactName', 'A', 'contactPhone', '1',
        'podRequired', false, 'warehouseId', v_wh::text
      ),
      jsonb_build_object(
        'clientStopId', 'dr-a', 'type', 'drop', 'sequence', 1,
        'label', '[TEST CLAIM] Drop A', 'contactName', 'A', 'contactPhone', '1',
        'podRequired', true, 'warehouseId', '',
        'address', jsonb_build_object('line1', 'A st', 'city', 'Mumbai', 'state', 'MH', 'pincode', '400001')
      )
    ),
    jsonb_build_array(
      jsonb_build_object('orderId', v_oa::text, 'pickupClientStopId', 'pu', 'dropClientStopId', 'dr-a')
    ),
    jsonb_build_array(
      jsonb_build_object(
        'orderId', v_oa::text, 'customerId', v_cx::text, 'customerName', 'A', 'totalAmount', 1000,
        'lineItems', jsonb_build_array(jsonb_build_object('id', v_la::text, 'quantity', 1, 'weightKg', 10, 'volumeM3', 0.1))
      )
    )
  );

  SELECT status, execution_plan_id INTO v_claimed_status, v_claimed_plan
  FROM public.sales_orders WHERE id = v_oa;
  IF v_claimed_status IS DISTINCT FROM 'Planned' OR v_claimed_plan IS DISTINCT FROM v_plan_a THEN
    RAISE EXCEPTION 'test1: SO-A was not claimed atomically status=% plan=%', v_claimed_status, v_claimed_plan;
  END IF;

  -- 3–4. Same-plan retry → same plan; indent unique still one indent
  SELECT * INTO v_plan_a2, v_plan_a2_num
  FROM public.create_execution_plan_with_graph(
    v_org, v_corr_a, 'Truck', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
  IF v_plan_a2 IS DISTINCT FROM v_plan_a OR v_plan_a2_num IS DISTINCT FROM v_plan_a_num THEN
    RAISE EXCEPTION 'test3: retry returned a different plan';
  END IF;

  INSERT INTO public.indents (
    organization_id, execution_plan_id, sales_order_id,
    pickup_area, drop_location, client_name, client_price, supplier_target,
    vehicle_type, load_type, weight, status, shared_at, last_saved_at,
    owner_user_id, created_by_user_id, indent_number
  ) VALUES (
    v_org, v_plan_a, NULL,
    '[TEST CLAIM] pickup', '[TEST CLAIM] drop', 'A', 1000, 0,
    'Truck', 'General', 10, 'draft', NULL, now(),
    v_owner, v_owner, NULL
  )
  RETURNING id INTO v_indent;

  SELECT * INTO v_plan_a2, v_plan_a2_num
  FROM public.create_execution_plan_with_graph(
    v_org, v_corr_a, 'Truck', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
  IF v_plan_a2 IS DISTINCT FROM v_plan_a THEN
    RAISE EXCEPTION 'test4: retry after indent changed the plan';
  END IF;
  SELECT id INTO v_indent2 FROM public.indents WHERE execution_plan_id = v_plan_a;
  IF v_indent2 IS DISTINCT FROM v_indent THEN
    RAISE EXCEPTION 'test4: expected a single indent for the reused plan';
  END IF;
  IF (SELECT count(*) FROM public.indents WHERE execution_plan_id = v_plan_a) <> 1 THEN
    RAISE EXCEPTION 'test4: duplicate indent for same execution plan';
  END IF;

  -- 2. Multiple orders → one plan
  SELECT * INTO v_plan_merged, v_plan_a2_num
  FROM public.create_execution_plan_with_graph(
    v_org, v_corr_merged, 'Truck',
    jsonb_build_array(
      jsonb_build_object(
        'clientStopId', 'pu', 'type', 'pickup', 'sequence', 0,
        'label', '[TEST CLAIM] Warehouse', 'contactName', 'A', 'contactPhone', '1',
        'podRequired', false, 'warehouseId', v_wh::text
      ),
      jsonb_build_object(
        'clientStopId', 'dr-b', 'type', 'drop', 'sequence', 1,
        'label', '[TEST CLAIM] Drop B', 'contactName', 'B', 'contactPhone', '1',
        'podRequired', true, 'warehouseId', '',
        'address', jsonb_build_object('line1', 'B st', 'city', 'Pune', 'state', 'MH', 'pincode', '411001')
      ),
      jsonb_build_object(
        'clientStopId', 'dr-c', 'type', 'drop', 'sequence', 2,
        'label', '[TEST CLAIM] Drop C', 'contactName', 'C', 'contactPhone', '1',
        'podRequired', true, 'warehouseId', '',
        'address', jsonb_build_object('line1', 'C st', 'city', 'Pune', 'state', 'MH', 'pincode', '411002')
      )
    ),
    jsonb_build_array(
      jsonb_build_object('orderId', v_ob::text, 'pickupClientStopId', 'pu', 'dropClientStopId', 'dr-b'),
      jsonb_build_object('orderId', v_oc::text, 'pickupClientStopId', 'pu', 'dropClientStopId', 'dr-c')
    ),
    jsonb_build_array(
      jsonb_build_object(
        'orderId', v_ob::text, 'customerId', v_cx::text, 'customerName', 'B', 'totalAmount', 2000,
        'lineItems', jsonb_build_array(jsonb_build_object('id', v_lb::text, 'quantity', 1, 'weightKg', 20, 'volumeM3', 0.2))
      ),
      jsonb_build_object(
        'orderId', v_oc::text, 'customerId', v_cx::text, 'customerName', 'C', 'totalAmount', 3000,
        'lineItems', jsonb_build_array(jsonb_build_object('id', v_lc::text, 'quantity', 1, 'weightKg', 30, 'volumeM3', 0.3))
      )
    )
  );

  IF (SELECT count(*) FROM public.sales_orders
      WHERE id IN (v_ob, v_oc) AND status = 'Planned' AND execution_plan_id = v_plan_merged) <> 2 THEN
    RAISE EXCEPTION 'test2: merged plan did not claim both SO-B and SO-C';
  END IF;

  -- 5. Already-planned order → rejected on a new correlation
  v_failed := false;
  BEGIN
    PERFORM plan_id FROM public.create_execution_plan_with_graph(
      v_org, v_corr_b, 'Truck',
      jsonb_build_array(
        jsonb_build_object(
          'clientStopId', 'pu', 'type', 'pickup', 'sequence', 0,
          'label', '[TEST CLAIM] Warehouse', 'contactName', 'A', 'contactPhone', '1',
          'podRequired', false, 'warehouseId', v_wh::text
        ),
        jsonb_build_object(
          'clientStopId', 'dr-a', 'type', 'drop', 'sequence', 1,
          'label', '[TEST CLAIM] Drop A', 'contactName', 'A', 'contactPhone', '1',
          'podRequired', true, 'warehouseId', '',
          'address', jsonb_build_object('line1', 'A st', 'city', 'Mumbai', 'state', 'MH', 'pincode', '400001')
        )
      ),
      jsonb_build_array(
        jsonb_build_object('orderId', v_oa::text, 'pickupClientStopId', 'pu', 'dropClientStopId', 'dr-a')
      ),
      jsonb_build_array(
        jsonb_build_object(
          'orderId', v_oa::text, 'customerId', v_cx::text, 'customerName', 'A', 'totalAmount', 1000,
          'lineItems', jsonb_build_array(jsonb_build_object('id', v_la::text, 'quantity', 1, 'weightKg', 10, 'volumeM3', 0.1))
        )
      )
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%Could not claim all selected sales orders%' THEN
        v_failed := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'test5: already-planned SO-A was accepted on a second plan';
  END IF;

  -- 7–8. Sequential second transaction for SO-A: no EP-B graph remains
  SELECT count(*) INTO v_ep_b FROM public.execution_plans
    WHERE organization_id = v_org AND correlation_id = v_corr_b;
  IF v_ep_b <> 0 THEN
    RAISE EXCEPTION 'test7: failed second plan left an execution_plans row';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.execution_plan_stops eps
    JOIN public.execution_plans ep ON ep.id = eps.execution_plan_id
    WHERE ep.correlation_id = v_corr_b
  ) OR EXISTS (
    SELECT 1 FROM public.shipment_allocations sa
    JOIN public.execution_plans ep ON ep.id = sa.execution_plan_id
    WHERE ep.correlation_id = v_corr_b
  ) THEN
    RAISE EXCEPTION 'test8: failed second plan left stops or allocations';
  END IF;
  IF (SELECT execution_plan_id FROM public.sales_orders WHERE id = v_oa) IS DISTINCT FROM v_plan_a THEN
    RAISE EXCEPTION 'test8: SO-A is not linked only to EP-A';
  END IF;

  -- 6. Mixed: SO-A planned + a fresh pending order. Entire new plan rolls back.
  -- Recreate SO-B as pending? SO-B is already on merged plan. Insert SO-D:
  -- Use a fourth order created here.
  DECLARE
    v_od uuid;
    v_ld uuid;
  BEGIN
    INSERT INTO public.sales_orders (
      organization_id, order_number, customer_id, pickup_warehouse_id, status, notes,
      total_amount, total_weight_kg
    ) VALUES
      (v_org, '[TEST CLAIM] SO-D', v_cx, v_wh, 'Pending Consolidation', '[TEST CLAIM]', 4000, 40)
    RETURNING id INTO v_od;
    INSERT INTO public.sales_order_lines (
      organization_id, sales_order_id, product_id, quantity, line_total, weight_kg, volume_m3
    ) VALUES
      (v_org, v_od, v_prod, 1, 4000, 40, 0.4)
    RETURNING id INTO v_ld;

    v_failed := false;
    BEGIN
      PERFORM plan_id FROM public.create_execution_plan_with_graph(
        v_org, v_corr_mixed, 'Truck',
        jsonb_build_array(
          jsonb_build_object(
            'clientStopId', 'pu', 'type', 'pickup', 'sequence', 0,
            'label', '[TEST CLAIM] Warehouse', 'contactName', 'A', 'contactPhone', '1',
            'podRequired', false, 'warehouseId', v_wh::text
          ),
          jsonb_build_object(
            'clientStopId', 'dr-a', 'type', 'drop', 'sequence', 1,
            'label', '[TEST CLAIM] Drop A', 'contactName', 'A', 'contactPhone', '1',
            'podRequired', true, 'warehouseId', '',
            'address', jsonb_build_object('line1', 'A st', 'city', 'Mumbai', 'state', 'MH', 'pincode', '400001')
          ),
          jsonb_build_object(
            'clientStopId', 'dr-d', 'type', 'drop', 'sequence', 2,
            'label', '[TEST CLAIM] Drop D', 'contactName', 'D', 'contactPhone', '1',
            'podRequired', true, 'warehouseId', '',
            'address', jsonb_build_object('line1', 'D st', 'city', 'Pune', 'state', 'MH', 'pincode', '411003')
          )
        ),
        jsonb_build_array(
          jsonb_build_object('orderId', v_oa::text, 'pickupClientStopId', 'pu', 'dropClientStopId', 'dr-a'),
          jsonb_build_object('orderId', v_od::text, 'pickupClientStopId', 'pu', 'dropClientStopId', 'dr-d')
        ),
        jsonb_build_array(
          jsonb_build_object(
            'orderId', v_oa::text, 'customerId', v_cx::text, 'customerName', 'A', 'totalAmount', 1000,
            'lineItems', jsonb_build_array(jsonb_build_object('id', v_la::text, 'quantity', 1, 'weightKg', 10, 'volumeM3', 0.1))
          ),
          jsonb_build_object(
            'orderId', v_od::text, 'customerId', v_cx::text, 'customerName', 'D', 'totalAmount', 4000,
            'lineItems', jsonb_build_array(jsonb_build_object('id', v_ld::text, 'quantity', 1, 'weightKg', 40, 'volumeM3', 0.4))
          )
        )
      );
    EXCEPTION
      WHEN others THEN
        IF SQLERRM LIKE '%Could not claim all selected sales orders%' THEN
          v_failed := true;
        ELSE
          RAISE;
        END IF;
    END;
    IF NOT v_failed THEN
      RAISE EXCEPTION 'test6: mixed selection was accepted';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.execution_plans WHERE organization_id = v_org AND correlation_id = v_corr_mixed
    ) THEN
      RAISE EXCEPTION 'test6: mixed plan was partially committed';
    END IF;
    IF (SELECT execution_plan_id FROM public.sales_orders WHERE id = v_oa) IS DISTINCT FROM v_plan_a THEN
      RAISE EXCEPTION 'test6: SO-A claim changed during mixed rollback';
    END IF;
    IF (SELECT status FROM public.sales_orders WHERE id = v_od) IS DISTINCT FROM 'Pending Consolidation'
       OR (SELECT execution_plan_id FROM public.sales_orders WHERE id = v_od) IS NOT NULL THEN
      RAISE EXCEPTION 'test6: SO-D was partially claimed';
    END IF;

    DELETE FROM public.sales_order_lines WHERE id = v_ld;
    DELETE FROM public.sales_orders WHERE id = v_od;
  END;

  -- 9. No duplicate shipment allocation across plans for SO-A's line
  SELECT count(*) INTO v_allocs
  FROM public.shipment_allocations sa
  WHERE sa.sales_order_line_id = v_la;
  IF v_allocs <> 1 THEN
    RAISE EXCEPTION 'test9: expected 1 allocation for SO-A line, got %', v_allocs;
  END IF;

  RAISE NOTICE 'CLAIM_GRAPH_ACCEPT_OK plan_a=% merged=% indent=%', v_plan_a, v_plan_merged, v_indent;

  DELETE FROM public.shipment_allocations WHERE execution_plan_id IN (v_plan_a, v_plan_merged);
  DELETE FROM public.execution_plan_stops WHERE execution_plan_id IN (v_plan_a, v_plan_merged);
  DELETE FROM public.indents WHERE id = v_indent;
  DELETE FROM public.sales_order_lines WHERE sales_order_id IN (v_oa, v_ob, v_oc);
  DELETE FROM public.sales_orders WHERE id IN (v_oa, v_ob, v_oc);
  DELETE FROM public.execution_plans WHERE id IN (v_plan_a, v_plan_merged);
  DELETE FROM public.products WHERE id = v_prod;
  DELETE FROM public.client_warehouses WHERE id = v_wh;
  DELETE FROM public.clients WHERE id = v_cx;
END $$;
