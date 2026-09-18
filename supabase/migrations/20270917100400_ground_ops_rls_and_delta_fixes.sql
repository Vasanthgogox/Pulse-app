-- Post-push fixes for ground_ops warehouse scoping (part 1 — no trips DDL lock):
-- get_indents_delta / get_trips_delta are SECURITY DEFINER and bypass RLS.
-- Drop orphaned can_ground_ops_access_trip / trip_warehouse_ids.
-- Trips broad-policy fix is 20270917100500 (separate; needs brief trips lock).

BEGIN;

-- ── 1. get_indents_delta: no indents for ground_ops ──────────────────────
CREATE OR REPLACE FUNCTION public.get_indents_delta(
  p_org_id  UUID,
  p_since   TEXT,
  p_limit   INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := p_since::TIMESTAMPTZ;
  v_changed   JSONB;
  v_deleted   JSONB;
  v_next      TEXT;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object(
      'changed', '[]'::JSONB,
      'deleted_ids', '[]'::JSONB,
      'next_cursor', p_since
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
  ) THEN
    RETURN jsonb_build_object(
      'changed', '[]'::JSONB,
      'deleted_ids', '[]'::JSONB,
      'next_cursor', p_since
    );
  END IF;

  SELECT
    COALESCE(jsonb_agg(row_to_json(i) ORDER BY i.updated_at) FILTER (WHERE i.deleted_at IS NULL), '[]'),
    COALESCE(jsonb_agg(i.id::TEXT)                           FILTER (WHERE i.deleted_at IS NOT NULL), '[]'),
    MAX(i.updated_at)::TEXT
  INTO v_changed, v_deleted, v_next
  FROM (
    SELECT * FROM public.indents
    WHERE organization_id = p_org_id
      AND updated_at > v_since
    ORDER BY updated_at
    LIMIT p_limit
  ) i;

  RETURN jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  v_deleted,
    'next_cursor',  COALESCE(v_next, p_since)
  );
END;
$$;

-- ── 2. get_trips_delta: warehouse-scoped for ground_ops ────────────────────
CREATE OR REPLACE FUNCTION public.get_trips_delta(
  p_org_id  UUID,
  p_since   TEXT,
  p_limit   INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := p_since::TIMESTAMPTZ;
  v_changed   JSONB;
  v_deleted   JSONB;
  v_next      TEXT;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object(
      'changed', '[]'::JSONB,
      'deleted_ids', '[]'::JSONB,
      'next_cursor', p_since
    );
  END IF;

  SELECT
    COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.updated_at) FILTER (WHERE t.deleted_at IS NULL), '[]'),
    COALESCE(jsonb_agg(t.id::TEXT)                           FILTER (WHERE t.deleted_at IS NOT NULL), '[]'),
    MAX(t.updated_at)::TEXT
  INTO v_changed, v_deleted, v_next
  FROM (
    SELECT tr.*
    FROM public.trips tr
    LEFT JOIN public.indents i ON i.id = tr.indent_id
    WHERE tr.organization_id = p_org_id
      AND tr.updated_at > v_since
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
    ORDER BY tr.updated_at
    LIMIT p_limit
  ) t;

  RETURN jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  v_deleted,
    'next_cursor',  COALESCE(v_next, p_since)
  );
END;
$$;

-- ── 3. Drop orphaned helper functions from the rolled-back approach ────────
DROP FUNCTION IF EXISTS public.can_ground_ops_access_trip(uuid);

DROP FUNCTION IF EXISTS public.trip_warehouse_ids(uuid);

COMMIT;
