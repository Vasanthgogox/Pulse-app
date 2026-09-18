-- Ground Ops warehouse scoping.
--
-- Product rule (ADR, agreed before implementation):
--   1. Scope: Commerce-flow indents only (indents.sales_order_id or
--      indents.execution_plan_id set). Native/legacy indents (free-text
--      pickup_area/drop_location, no warehouse FK) are out of scope.
--   2. Assignment unit: client_warehouses.id. One organization_member -> many
--      warehouses via a join table. Warehouses may span multiple clients
--      under the same org.
--   3. Visibility: a ground_ops member sees ONLY trips whose resolved
--      warehouse (pickup OR drop, on the order itself) is in their
--      assignment set. Zero assignments = zero trips. Fail-closed.
--   4. Actions: document upload only, gated additionally by the existing
--      groundOpsDocUploadEnabled org toggle (kill switch, independent of
--      warehouse assignment).
--   5. Ground Ops must not see indents at all — see the separate
--      20270917100200_ground_ops_indents_rls_exclusion.sql migration.
--
-- Scoping invariant (order-level only, deliberately NOT stop-level):
--   - Single sales-order indent: match sales_orders.pickup_warehouse_id /
--     drop_warehouse_id for that order.
--   - Merged multi-order plan indent (execution_plan_id set): union
--     pickup/drop warehouses across every sales order allocated to that
--     plan (execution_plan_id -> shipment_allocations -> sales_order_lines
--     -> sales_orders).
--   - Intermediate/plan-level stops (execution_plan_stops.warehouse_id) are
--     NOT matched — a warehouse that only appears as a mid-plan stop does
--     not grant trip-level visibility. Per-stop document association
--     already exists separately via trip_documents.stop_id.
--
-- PERFORMANCE NOTE (read before changing this file): an earlier version of
-- this feature wrapped the warehouse-membership check in SECURITY DEFINER
-- helper functions (trip_warehouse_ids() / can_ground_ops_access_trip())
-- called from RLS USING clauses and from get_trips_for_org /
-- get_trip_detail_bundle. SECURITY DEFINER functions are opaque to the
-- planner — they cannot be inlined into the calling query — so every
-- row-level RLS check re-executed the full multi-join warehouse-resolution
-- subquery independently. On get_trips_for_org (up to 400 rows) that is up
-- to 400 full multi-join executions per call. In production this produced
-- 11-12s calls to get_trip_detail_bundle and saturated the connection pool
-- (503s across the app, cron jobs failing to start) within minutes of
-- deploy. That version was rolled back (see develop commit 2be7072a /
-- 20270916150000_rollback_ground_ops_warehouse_scoping.sql).
--
-- This version inlines the warehouse-membership check as a plain SQL EXISTS
-- directly in every RLS policy and RPC — exactly like every other
-- predicate already in this codebase (is_org_staff usages, the existing
-- client/supplier EXISTS checks on trips) — so the planner can inline,
-- decorrelate, and index it as part of the whole statement's plan, rather
-- than as an opaque per-row function call.
--
-- Indexes were already sufficient for this (confirmed against migration
-- history, no new indexes needed beyond the join table's own):
--   - idx_sales_orders_pickup_warehouse_id / idx_sales_orders_drop_warehouse_id
--     (20260714090843_add_missing_foreign_key_indexes.sql)
--   - partial index on indents.sales_order_id WHERE NOT NULL
--     (20261127000000_indents_sales_order_id.sql)
--   - idx_shipment_alloc_plan / idx_shipment_alloc_line
--     (20261105000000_commerce_module.sql)
--   - indents_execution_plan_id_unique (20270913090000_multi_stop_execution_foundation.sql)

BEGIN;

-- ── 1. Assignment table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_member_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_member_id uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.client_warehouses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_member_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_org_member_warehouses_member
  ON public.organization_member_warehouses(organization_member_id);

CREATE INDEX IF NOT EXISTS idx_org_member_warehouses_warehouse
  ON public.organization_member_warehouses(warehouse_id);

ALTER TABLE public.organization_member_warehouses ENABLE ROW LEVEL SECURITY;

-- Org staff manage assignments; the warehouse must belong to the same org
-- as the member being assigned (prevents cross-org warehouse attachment)
-- and must not be soft-deleted.
DROP POLICY IF EXISTS "org_member_warehouses_staff_manage" ON public.organization_member_warehouses;

CREATE POLICY "org_member_warehouses_staff_manage" ON public.organization_member_warehouses
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.id = organization_member_warehouses.organization_member_id
      AND is_org_staff(om.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.client_warehouses cw
      ON cw.id = organization_member_warehouses.warehouse_id
     AND cw.organization_id = om.organization_id
     AND cw.deleted_at IS NULL
    WHERE om.id = organization_member_warehouses.organization_member_id
      AND is_org_staff(om.organization_id)
  )
);

-- A member can read their own assignment set (app UI: "my warehouses").
DROP POLICY IF EXISTS "org_member_warehouses_self_select" ON public.organization_member_warehouses;

CREATE POLICY "org_member_warehouses_self_select" ON public.organization_member_warehouses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.id = organization_member_warehouses.organization_member_id
      AND om.user_id = (SELECT auth.uid())
  )
);

-- ── 2. trips RLS: ground_ops SELECT, inlined predicate (no function call) ──
DROP POLICY IF EXISTS "trips_ground_ops_select_assigned" ON public.trips;

CREATE POLICY "trips_ground_ops_select_assigned" ON public.trips
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = trips.organization_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
  )
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om2
    JOIN public.organization_member_warehouses omw
      ON omw.organization_member_id = om2.id
    JOIN public.indents i ON i.id = trips.indent_id
    WHERE om2.organization_id = trips.organization_id
      AND om2.user_id = (SELECT auth.uid())
      AND om2.status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM public.sales_orders so
          WHERE so.id = i.sales_order_id
            AND (so.pickup_warehouse_id = omw.warehouse_id OR so.drop_warehouse_id = omw.warehouse_id)
        )
        OR (
          i.execution_plan_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.shipment_allocations sa
            JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
            JOIN public.sales_orders so2 ON so2.id = sol.sales_order_id
            WHERE sa.execution_plan_id = i.execution_plan_id
              AND (so2.pickup_warehouse_id = omw.warehouse_id OR so2.drop_warehouse_id = omw.warehouse_id)
          )
        )
      )
  )
);

-- ── 3. trip_documents RLS: same inlined predicate for SELECT + INSERT ───
DROP POLICY IF EXISTS "trip_documents_org_member_select" ON public.trip_documents;

CREATE POLICY "trip_documents_org_member_select" ON public.trip_documents
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND (
        COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
        OR EXISTS (
          SELECT 1
          FROM public.organization_member_warehouses omw
          JOIN public.indents i ON i.id = t.indent_id
          WHERE omw.organization_member_id = om.id
            AND (
              EXISTS (
                SELECT 1 FROM public.sales_orders so
                WHERE so.id = i.sales_order_id
                  AND (so.pickup_warehouse_id = omw.warehouse_id OR so.drop_warehouse_id = omw.warehouse_id)
              )
              OR (
                i.execution_plan_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.shipment_allocations sa
                  JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
                  JOIN public.sales_orders so2 ON so2.id = sol.sales_order_id
                  WHERE sa.execution_plan_id = i.execution_plan_id
                    AND (so2.pickup_warehouse_id = omw.warehouse_id OR so2.drop_warehouse_id = omw.warehouse_id)
                )
              )
            )
        )
      )
  )
);

DROP POLICY IF EXISTS "trip_documents_org_member_insert" ON public.trip_documents;

CREATE POLICY "trip_documents_org_member_insert" ON public.trip_documents
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND (
        COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
        OR (
          COALESCE((o.settings ->> 'groundOpsDocUploadEnabled')::boolean, false) IS TRUE
          AND EXISTS (
            SELECT 1
            FROM public.organization_member_warehouses omw
            JOIN public.indents i ON i.id = t.indent_id
            WHERE omw.organization_member_id = om.id
              AND (
                EXISTS (
                  SELECT 1 FROM public.sales_orders so
                  WHERE so.id = i.sales_order_id
                    AND (so.pickup_warehouse_id = omw.warehouse_id OR so.drop_warehouse_id = omw.warehouse_id)
                )
                OR (
                  i.execution_plan_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM public.shipment_allocations sa
                    JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
                    JOIN public.sales_orders so2 ON so2.id = sol.sales_order_id
                    WHERE sa.execution_plan_id = i.execution_plan_id
                      AND (so2.pickup_warehouse_id = omw.warehouse_id OR so2.drop_warehouse_id = omw.warehouse_id)
                  )
                )
              )
          )
        )
      )
  )
);

-- ── 4. get_trips_for_org: inlined predicate ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_trips_for_org(p_org_id uuid)
RETURNS SETOF json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT row_to_json(q)
  FROM (
    SELECT DISTINCT ON (tr.id)
      CASE WHEN tr.organization_id = p_org_id THEN tr.client_price      END AS client_price,
      CASE WHEN tr.organization_id = p_org_id THEN tr.margin            END AS margin,
      CASE WHEN tr.organization_id = p_org_id THEN tr.platform_fee      END AS platform_fee,
      CASE WHEN tr.organization_id = p_org_id THEN tr.driver_commission END AS driver_commission,
      CASE WHEN tr.organization_id = p_org_id THEN tr.amount_paid       END AS amount_paid,
      CASE WHEN tr.organization_id = p_org_id THEN tr.payment_status    END AS payment_status,
      CASE WHEN tr.organization_id = p_org_id THEN tr.client_id         END AS client_id,

      tr.id,
      tr.organization_id,
      tr.trip_number,
      tr.source,
      tr.display_trip_id,
      tr.driver_display_trip_id,
      tr.trip_code,
      tr.trip_operational_code,
      tr.booking_ref,
      tr.sequence_number,

      tr.pickup_area,
      tr.drop_location,
      tr.distance,
      tr.estimated_duration,
      tr.pickup_lat,
      tr.pickup_lon,
      tr.drop_lat,
      tr.drop_lon,
      tr.load_type,
      tr.load_tons,
      tr.notes,

      tr.client_name,
      tr.supplier_id,
      tr.supplier_trip_sequence,

      tr.supplier_rate,
      tr.advance_paid,
      tr.is_guaranteed,
      tr.trip_payout_mode,
      tr.operating_mode,
      tr.dco_payee_id,

      tr.driver_id,
      tr.vehicle_id,
      tr.owner_vehicle_id,
      tr.driver_display_name,
      tr.vehicle_display_number,

      tr.status,
      tr.pickup_date,
      tr.started_at,
      tr.completed_at,
      tr.created_at,
      tr.updated_at,
      tr.deleted_at,
      tr.status_change_origin,
      tr.pod_received_at,
      tr.pod_required,

      tr.owner_user_id,
      tr.created_by_user_id,
      tr.assigned_by_user_id,

      tr.last_location_at,
      tr.last_location_chat_at,
      tr.actual_distance_traveled_km,
      tr.start_odometer_km,
      tr.end_odometer_km,
      tr.odometer_distance_km,
      tr.gps_distance_km,
      tr.distance_discrepancy_km,
      tr.distance_source,
      tr.odometer_verification_state,
      tr.odometer_notes,
      tr.odometer_updated_by,
      tr.odometer_updated_at,

      tr.indent_id,
      tr.source_indent_id,
      tr.source_indent_code,
      tr.indent_reference_code,
      tr.converted_from_indent_at,
      tr.converted_by,
      tr.source_bid_id,

      i.indent_number
    FROM public.trips tr
    LEFT JOIN public.indents i ON i.id = tr.indent_id
    WHERE public.is_org_member(p_org_id)
      AND (
        tr.organization_id = p_org_id
        OR (
          EXISTS (
            SELECT 1 FROM public.suppliers s
            WHERE s.id = tr.supplier_id
              AND s.linked_organization_id = p_org_id
          )
          AND tr.indent_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.trips m
            WHERE m.organization_id = p_org_id
              AND m.source = 'mover_asset'
              AND m.source_indent_id = tr.indent_id
              AND m.deleted_at IS NULL
          )
        )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = p_org_id
            AND om.user_id = (SELECT auth.uid())
            AND om.status = 'active'
            AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
        )
        OR EXISTS (
          SELECT 1
          FROM public.organization_members om3
          JOIN public.organization_member_warehouses omw
            ON omw.organization_member_id = om3.id
          WHERE om3.organization_id = p_org_id
            AND om3.user_id = (SELECT auth.uid())
            AND om3.status = 'active'
            AND (
              EXISTS (
                SELECT 1 FROM public.sales_orders so
                WHERE so.id = i.sales_order_id
                  AND (so.pickup_warehouse_id = omw.warehouse_id OR so.drop_warehouse_id = omw.warehouse_id)
              )
              OR (
                i.execution_plan_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.shipment_allocations sa
                  JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
                  JOIN public.sales_orders so2 ON so2.id = sol.sales_order_id
                  WHERE sa.execution_plan_id = i.execution_plan_id
                    AND (so2.pickup_warehouse_id = omw.warehouse_id OR so2.drop_warehouse_id = omw.warehouse_id)
                )
              )
            )
        )
      )
    ORDER BY tr.id, tr.created_at DESC
  ) q
  ORDER BY q.created_at DESC
  LIMIT 400;
$function$;

COMMIT;
