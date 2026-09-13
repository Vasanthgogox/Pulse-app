-- Phase 2A hardening (2A-H1): atomic execution-plan graph creation.
--
-- executionPlanRepository.createWithGraph() previously issued three
-- independent Supabase calls (INSERT execution_plans, INSERT
-- execution_plan_stops, INSERT shipment_allocations). A failure between the
-- first and second left a committed, stopless "orphan" plan — proven live
-- during the Phase 2A acceptance test (a CHECK-constraint violation on
-- execution_plan_stops left exactly this state). Worse, the idempotency
-- lookup (by clientPlanId/correlation_id) cannot distinguish a complete plan
-- from this kind of orphan, so a retry would silently reuse the broken plan
-- forever instead of creating a fresh, complete graph.
--
-- Fix: do the whole creation (sequence allocation + plan + stops +
-- allocations) inside one SECURITY DEFINER function. A single function
-- call is one Postgres transaction — an exception anywhere inside it
-- (including a CHECK-constraint violation) rolls back everything the call
-- did, so there is no partial-graph state possible: either the complete
-- graph exists, or none of it does.
--
-- Also adds a defensive unique constraint on (organization_id,
-- correlation_id) so two concurrent publishes racing past the
-- application-level idempotency check cannot each create a separate,
-- duplicate plan for the same clientPlanId — the database itself now
-- enforces "at most one plan per clientPlanId per org".

ALTER TABLE public.execution_plans
  ADD CONSTRAINT execution_plans_org_correlation_unique UNIQUE (organization_id, correlation_id);

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
BEGIN
  -- Atomic sequence allocation (same counter/format next_plan_number uses).
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

  -- Resolve each drop stop's customer id from the order(s) allocated to it —
  -- a stop has no direct customer reference; it's only reachable via
  -- allocations -> orders (same logic the TypeScript layer used before this
  -- migration, now inlined so it participates in the same transaction).
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

  -- Insert stops (each stop object already carries its resolved `sequence`,
  -- computed client-side from route.sequence — no need to re-derive it here).
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

  -- Insert line-level allocations (one row per order line, per allocation —
  -- matches the pre-migration TypeScript expansion logic exactly).
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    SELECT o INTO v_order
    FROM jsonb_array_elements(p_orders) o
    WHERE o->>'orderId' = v_alloc->>'orderId'
    LIMIT 1;

    IF v_order IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(v_order->'lineItems')
    LOOP
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

  RETURN QUERY SELECT v_plan_id, v_plan_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_execution_plan_with_graph(uuid, text, text, jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_execution_plan_with_graph IS
  'Atomic replacement for the previous three-separate-inserts pattern in executionPlanRepository.createWithGraph(). One function call = one transaction: an exception anywhere (including execution_plan_stops_source_check) rolls back the plan, all stops, and all allocations together — no orphaned/partial plan can be committed. See migration 20270913091416.';
