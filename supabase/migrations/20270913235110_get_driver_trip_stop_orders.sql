-- Primitive A: driver-safe Commerce Trip → Stop → Order read.
--
-- supabase migration new emitted 20260913182052 (wall-clock 2026-09-13),
-- which sorts BEFORE the 20270913 Commerce / SES head and would replay
-- before those tables exist. This version is the next non-midnight sort
-- key after 20270913224500 and does not edit that Product file.
--
-- One SECURITY DEFINER RPC. No new tables. No trips.is_commerce.
-- No Driver RLS on sales_orders / sales_order_lines / shipment_allocations /
-- clients. Does not replace trips_driver_view.

CREATE OR REPLACE FUNCTION public.get_driver_trip_stop_orders(p_trip_id uuid)
RETURNS TABLE (
  trip_id uuid,
  indent_id uuid,
  execution_plan_id uuid,
  stop_id uuid,
  sequence integer,
  stop_type text,
  source_type text,
  display_name text,
  label text,
  address_line text,
  city text,
  state text,
  pincode text,
  contact_name text,
  contact_phone text,
  latitude numeric,
  longitude numeric,
  pod_required boolean,
  stop_execution_status text,
  arrived_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  attachment_role text,
  sales_order_id uuid,
  order_number text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  sales_order_line_id uuid,
  quantity numeric,
  delivery_window_start timestamptz,
  delivery_window_end timestamptz,
  notes text,
  priority text,
  order_total_amount numeric,
  currency text,
  stop_distinct_drop_order_count integer,
  order_distinct_drop_stop_count integer,
  order_completed_drop_stop_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH owned_trip AS (
    SELECT
      t.id AS trip_id,
      t.indent_id
    FROM public.trips t
    JOIN public.drivers d ON d.id = t.driver_id
    WHERE t.id = p_trip_id
      AND d.user_id = (SELECT auth.uid())
  ),
  trip_plan AS (
    SELECT
      ot.trip_id,
      ot.indent_id,
      i.execution_plan_id
    FROM owned_trip ot
    LEFT JOIN public.indents i ON i.id = ot.indent_id
  ),
  trip_stops AS (
    SELECT
      tp.trip_id,
      tp.indent_id,
      tp.execution_plan_id,
      ses.stop_id,
      ses.sequence,
      ses.status AS stop_execution_status,
      ses.arrived_at,
      ses.completed_at,
      ses.failure_reason,
      eps.stop_type,
      eps.source_type,
      eps.display_name,
      eps.label,
      eps.address_line,
      eps.city,
      eps.state,
      eps.pincode,
      eps.contact_name,
      eps.contact_phone,
      eps.latitude,
      eps.longitude,
      eps.pod_required
    FROM trip_plan tp
    LEFT JOIN public.stop_execution_state ses ON ses.trip_id = tp.trip_id
    LEFT JOIN public.execution_plan_stops eps ON eps.id = ses.stop_id
  ),
  attachments AS (
    SELECT
      ts.*,
      'pickup'::text AS attachment_role,
      sa.id AS allocation_id,
      sa.sales_order_line_id,
      sa.quantity AS allocated_quantity
    FROM trip_stops ts
    JOIN public.shipment_allocations sa
      ON sa.execution_plan_id = ts.execution_plan_id
     AND sa.pickup_stop_id = ts.stop_id
    WHERE ts.execution_plan_id IS NOT NULL
      AND ts.stop_id IS NOT NULL

    UNION ALL

    SELECT
      ts.*,
      'drop'::text AS attachment_role,
      sa.id AS allocation_id,
      sa.sales_order_line_id,
      sa.quantity AS allocated_quantity
    FROM trip_stops ts
    JOIN public.shipment_allocations sa
      ON sa.execution_plan_id = ts.execution_plan_id
     AND sa.drop_stop_id = ts.stop_id
    WHERE ts.execution_plan_id IS NOT NULL
      AND ts.stop_id IS NOT NULL
  ),
  stop_rows AS (
    SELECT
      ts.trip_id,
      ts.indent_id,
      ts.execution_plan_id,
      ts.stop_id,
      ts.sequence,
      ts.stop_type,
      ts.source_type,
      ts.display_name,
      ts.label,
      ts.address_line,
      ts.city,
      ts.state,
      ts.pincode,
      ts.contact_name,
      ts.contact_phone,
      ts.latitude,
      ts.longitude,
      ts.pod_required,
      ts.stop_execution_status,
      ts.arrived_at,
      ts.completed_at,
      ts.failure_reason,
      a.attachment_role,
      so.id AS sales_order_id,
      so.order_number,
      so.customer_id,
      c.name AS customer_name,
      c.phone AS customer_phone,
      a.sales_order_line_id,
      a.allocated_quantity AS quantity,
      so.delivery_window_start,
      so.delivery_window_end,
      so.notes,
      so.priority,
      so.total_amount AS order_total_amount,
      so.currency
    FROM trip_stops ts
    LEFT JOIN attachments a
      ON a.trip_id = ts.trip_id
     AND a.stop_id IS NOT DISTINCT FROM ts.stop_id
     AND a.sequence IS NOT DISTINCT FROM ts.sequence
    LEFT JOIN public.sales_order_lines sol
      ON sol.id = a.sales_order_line_id
    LEFT JOIN public.sales_orders so
      ON so.id = sol.sales_order_id
     AND so.deleted_at IS NULL
    LEFT JOIN public.clients c
      ON c.id = so.customer_id
  ),
  drop_stop_counts AS (
    SELECT
      sr.trip_id,
      sr.stop_id,
      COUNT(DISTINCT sr.sales_order_id)::integer AS stop_distinct_drop_order_count
    FROM stop_rows sr
    WHERE sr.attachment_role = 'drop'
      AND sr.sales_order_id IS NOT NULL
    GROUP BY sr.trip_id, sr.stop_id
  ),
  drop_order_counts AS (
    SELECT
      sr.trip_id,
      sr.sales_order_id,
      COUNT(DISTINCT sr.stop_id)::integer AS order_distinct_drop_stop_count,
      COUNT(DISTINCT sr.stop_id) FILTER (
        WHERE sr.stop_execution_status = 'completed'
      )::integer AS order_completed_drop_stop_count
    FROM stop_rows sr
    WHERE sr.attachment_role = 'drop'
      AND sr.sales_order_id IS NOT NULL
    GROUP BY sr.trip_id, sr.sales_order_id
  )
  SELECT
    sr.trip_id,
    sr.indent_id,
    sr.execution_plan_id,
    sr.stop_id,
    sr.sequence,
    sr.stop_type,
    sr.source_type,
    sr.display_name,
    sr.label,
    sr.address_line,
    sr.city,
    sr.state,
    sr.pincode,
    sr.contact_name,
    sr.contact_phone,
    sr.latitude,
    sr.longitude,
    sr.pod_required,
    sr.stop_execution_status,
    sr.arrived_at,
    sr.completed_at,
    sr.failure_reason,
    sr.attachment_role,
    sr.sales_order_id,
    sr.order_number,
    sr.customer_id,
    sr.customer_name,
    sr.customer_phone,
    sr.sales_order_line_id,
    sr.quantity,
    sr.delivery_window_start,
    sr.delivery_window_end,
    sr.notes,
    sr.priority,
    sr.order_total_amount,
    sr.currency,
    COALESCE(dsc.stop_distinct_drop_order_count, 0) AS stop_distinct_drop_order_count,
    COALESCE(doc.order_distinct_drop_stop_count, 0) AS order_distinct_drop_stop_count,
    COALESCE(doc.order_completed_drop_stop_count, 0) AS order_completed_drop_stop_count
  FROM stop_rows sr
  LEFT JOIN drop_stop_counts dsc
    ON dsc.trip_id = sr.trip_id
   AND dsc.stop_id IS NOT DISTINCT FROM sr.stop_id
  LEFT JOIN drop_order_counts doc
    ON doc.trip_id = sr.trip_id
   AND doc.sales_order_id IS NOT DISTINCT FROM sr.sales_order_id
  ORDER BY sr.sequence NULLS LAST, sr.attachment_role NULLS LAST, sr.order_number, sr.sales_order_line_id;
$function$;

COMMENT ON FUNCTION public.get_driver_trip_stop_orders(uuid) IS
  'Primitive A. Driver-owned trip only: auth.uid() → drivers.user_id → trips.driver_id → p_trip_id. '
  'Returns stop_execution_state + execution_plan_stops, and Commerce allocations/orders when '
  'indents.execution_plan_id is set. Unauthorized callers get zero rows (no existence leak). '
  'execution_plan_id is the Commerce signal — no trips.is_commerce column. '
  'attachment_role is pickup|drop from shipment_allocations FKs only. '
  'order_total_amount is sales_orders.total_amount (sales), never transport. '
  'stop_distinct_drop_order_count / order_distinct_drop_stop_count / order_completed_drop_stop_count '
  'are read-only grouping aids so callers do not invent N/M delivered from a shared drop or a single '
  'drop of a multi-drop order. Does not write sales_orders.status.';

REVOKE ALL ON FUNCTION public.get_driver_trip_stop_orders(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driver_trip_stop_orders(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_driver_trip_stop_orders(uuid) TO authenticated;
