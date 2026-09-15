-- Atomic order claim inside create_execution_plan_with_graph.
--
-- Cross-plan race: two Converts could previously COMMIT the plan graph and then
-- separately UPDATE sales_orders (markPlannedForExecutionPlan). Both graphs
-- could persist allocations for SO-A while only one order row survived.
--
-- Claim now happens in the same function body as plan/stops/allocations.
-- A RAISE rolls the entire graph back. Signature unchanged.
--
-- Order set is DISTINCT allocation orderIds (must match p_orders exactly).
-- One Sales Order may have multiple allocations / lines on the same plan.
-- Cancelled-plan reuse is out of scope.

CREATE OR REPLACE FUNCTION public.create_execution_plan_with_graph(
  p_org_id uuid,
  p_client_plan_id text,
  p_vehicle_type text,
  p_stops jsonb,
  p_allocations jsonb,
  p_orders jsonb
)
RETURNS TABLE(plan_id uuid, plan_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan_id uuid;
  v_plan_number text;
  v_seq bigint;
  v_year text := to_char(now(), 'YYYY');
  v_stop jsonb;
  v_client_stop_id text;
  v_new_stop_id uuid;
  v_stop_id_map jsonb := '{}'::jsonb;
  v_customer_id_map jsonb := '{}'::jsonb;
  v_alloc jsonb;
  v_order jsonb;
  v_line jsonb;
  v_line_order_id uuid;
  v_expected_ids uuid[];
  v_payload_ids uuid[];
  v_claimed int;
  v_alloc_orders int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized to create an execution plan for this organization'
      USING ERRCODE = '42501';
  END IF;

  SELECT ep.id, ep.plan_number
  INTO v_plan_id, v_plan_number
  FROM public.execution_plans ep
  WHERE ep.organization_id = p_org_id
    AND ep.correlation_id = p_client_plan_id
    AND ep.deleted_at IS NULL
  LIMIT 1;

  IF v_plan_id IS NOT NULL THEN
    RETURN QUERY SELECT v_plan_id, v_plan_number;
    RETURN;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT (a->>'orderId')::uuid
    FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) a
    ORDER BY 1
  ) INTO v_expected_ids;

  SELECT ARRAY(
    SELECT DISTINCT (o->>'orderId')::uuid
    FROM jsonb_array_elements(COALESCE(p_orders, '[]'::jsonb)) o
    ORDER BY 1
  ) INTO v_payload_ids;

  IF COALESCE(cardinality(v_expected_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Execution plan has no order allocations'
      USING ERRCODE = '23514';
  END IF;

  IF v_payload_ids IS DISTINCT FROM v_expected_ids THEN
    RAISE EXCEPTION 'Order payload does not match shipment allocations'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.organization_counters (organization_id)
  VALUES (p_org_id)
  ON CONFLICT (organization_id) DO NOTHING;

  UPDATE public.organization_counters
  SET plan_seq = plan_seq + 1
  WHERE organization_id = p_org_id
  RETURNING plan_seq INTO v_seq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Org counter missing for: %', p_org_id;
  END IF;
  v_plan_number := 'EP-' || v_year || '-' || LPAD(v_seq::text, 4, '0');

  INSERT INTO public.execution_plans (
    plan_number, organization_id, status, origin, planned_vehicle_type, correlation_id
  ) VALUES (
    v_plan_number, p_org_id, 'ready', 'customer_orders', p_vehicle_type, p_client_plan_id
  )
  RETURNING id INTO v_plan_id;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    SELECT o INTO v_order
    FROM jsonb_array_elements(p_orders) o
    WHERE o->>'orderId' = v_alloc->>'orderId'
    LIMIT 1;

    IF v_order IS NOT NULL THEN
      v_customer_id_map := jsonb_set(
        v_customer_id_map,
        ARRAY[v_alloc->>'dropClientStopId'],
        to_jsonb(v_order->>'customerId')
      );
    END IF;
  END LOOP;

  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops)
  LOOP
    v_client_stop_id := v_stop->>'clientStopId';

    IF v_stop->>'type' = 'pickup' THEN
      INSERT INTO public.execution_plan_stops (
        organization_id, execution_plan_id, stop_type, sequence,
        label, contact_name, contact_phone, pod_required,
        warehouse_id, source_type, source_id
      ) VALUES (
        p_org_id, v_plan_id, 'pickup', COALESCE((v_stop->>'sequence')::int, 0),
        v_stop->>'label', v_stop->>'contactName', v_stop->>'contactPhone',
        COALESCE((v_stop->>'podRequired')::boolean, false),
        NULLIF(v_stop->>'warehouseId','')::uuid, 'warehouse', NULL
      )
      RETURNING id INTO v_new_stop_id;
    ELSE
      INSERT INTO public.execution_plan_stops (
        organization_id, execution_plan_id, stop_type, sequence,
        label, contact_name, contact_phone, pod_required,
        warehouse_id, source_type, source_id,
        display_name, address_line, city, state, pincode, latitude, longitude
      ) VALUES (
        p_org_id, v_plan_id, 'drop', COALESCE((v_stop->>'sequence')::int, 0),
        v_stop->>'label', v_stop->>'contactName', v_stop->>'contactPhone',
        COALESCE((v_stop->>'podRequired')::boolean, true),
        NULL, 'client', NULLIF(v_customer_id_map->>v_client_stop_id,'')::uuid,
        v_stop->>'label',
        v_stop->'address'->>'line1', v_stop->'address'->>'city',
        v_stop->'address'->>'state', v_stop->'address'->>'pincode',
        NULLIF(v_stop->'address'->>'lat','')::numeric,
        NULLIF(v_stop->'address'->>'lng','')::numeric
      )
      RETURNING id INTO v_new_stop_id;
    END IF;

    v_stop_id_map := jsonb_set(v_stop_id_map, ARRAY[v_client_stop_id], to_jsonb(v_new_stop_id::text));
  END LOOP;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    SELECT o INTO v_order
    FROM jsonb_array_elements(p_orders) o
    WHERE o->>'orderId' = v_alloc->>'orderId'
    LIMIT 1;

    IF v_order IS NULL THEN
      RAISE EXCEPTION 'Shipment allocation is missing its sales order'
        USING ERRCODE = '23514';
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(v_order->'lineItems')
    LOOP
      SELECT sol.sales_order_id
      INTO v_line_order_id
      FROM public.sales_order_lines sol
      WHERE sol.id = (v_line->>'id')::uuid
        AND sol.organization_id = p_org_id;

      IF v_line_order_id IS DISTINCT FROM (v_alloc->>'orderId')::uuid THEN
        RAISE EXCEPTION 'Shipment allocation line does not belong to the allocated sales order'
          USING ERRCODE = '23514';
      END IF;

      INSERT INTO public.shipment_allocations (
        organization_id, execution_plan_id, sales_order_line_id,
        pickup_stop_id, drop_stop_id, quantity, weight_kg, volume_m3
      ) VALUES (
        p_org_id, v_plan_id, (v_line->>'id')::uuid,
        (v_stop_id_map->>(v_alloc->>'pickupClientStopId'))::uuid,
        (v_stop_id_map->>(v_alloc->>'dropClientStopId'))::uuid,
        (v_line->>'quantity')::numeric,
        (v_line->>'weightKg')::numeric,
        (v_line->>'volumeM3')::numeric
      );
    END LOOP;
  END LOOP;

  SELECT count(DISTINCT sol.sales_order_id) INTO v_alloc_orders
  FROM public.shipment_allocations sa
  JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
  WHERE sa.execution_plan_id = v_plan_id;

  IF COALESCE(v_alloc_orders, 0) IS DISTINCT FROM cardinality(v_expected_ids) THEN
    RAISE EXCEPTION 'Shipment allocations do not cover every selected sales order'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.sales_orders
  WHERE organization_id = p_org_id
    AND id = ANY (v_expected_ids)
    AND deleted_at IS NULL
  ORDER BY id
  FOR UPDATE;

  UPDATE public.sales_orders
  SET
    status = 'Planned',
    execution_plan_id = v_plan_id,
    updated_at = now()
  WHERE organization_id = p_org_id
    AND id = ANY (v_expected_ids)
    AND deleted_at IS NULL
    AND execution_plan_id IS NULL
    AND status = 'Pending Consolidation';

  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  IF v_claimed IS DISTINCT FROM cardinality(v_expected_ids) THEN
    RAISE EXCEPTION 'Could not claim all selected sales orders for this execution plan'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY SELECT v_plan_id, v_plan_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_execution_plan_with_graph(uuid, text, text, jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_execution_plan_with_graph IS
  'Atomic plan+stops+allocations+sales_order claim. Distinct allocation orderIds must match p_orders. Claims only Pending Consolidation rows with execution_plan_id IS NULL. Returns existing plan for the same (org, clientPlanId). Authenticated callers must be org members.';
