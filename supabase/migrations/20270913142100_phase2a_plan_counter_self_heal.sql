-- Phase 2A hardening (2A-H2): organization_counters self-heal for plan numbers.
--
-- Lifecycle (traced):
--   organizations INSERT → trigger init_organization_counter() creates a row
--   set_trip_number / set_indent_number already INSERT ON CONFLICT DO NOTHING
--     then UPDATE, so a legitimate org can create its first trip/indent even
--     if the trigger was skipped (legacy org, restore, etc.)
--   next_plan_number() and create_execution_plan_with_graph() only UPDATE and
--     RAISE 'Org counter missing' — that is what blocked GOGOVAN's first plan.
--
-- Contract: provisioning trigger remains the primary path. Number allocators
-- must use the same self-heal as trip/indent. Do not invent a generic UPSERT
-- of sequence values — only ensure the row exists, then increment.
--
-- Also: if a complete plan already exists for (org, clientPlanId), the graph
-- RPC returns it instead of inserting a duplicate (same identity as
-- findByClientPlanId). Authenticated callers must be org members; postgres
-- / SQL-editor sessions (auth.uid() IS NULL) keep working for acceptance.

INSERT INTO public.organization_counters (organization_id)
SELECT o.id
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_counters oc WHERE oc.organization_id = o.id
)
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_plan_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seq bigint;
  v_year text := to_char(now(), 'YYYY');
BEGIN
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

  RETURN 'EP-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_plan_number(uuid) TO authenticated;

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

COMMENT ON FUNCTION public.next_plan_number(uuid) IS
  'Allocates the next EP-YYYY-NNNN. Creates organization_counters if missing (same self-heal as set_trip_number / set_indent_number).';

COMMENT ON FUNCTION public.create_execution_plan_with_graph IS
  'Atomic plan+stops+allocations. Self-heals organization_counters. Returns existing plan for the same (org, clientPlanId). Authenticated callers must be org members.';
