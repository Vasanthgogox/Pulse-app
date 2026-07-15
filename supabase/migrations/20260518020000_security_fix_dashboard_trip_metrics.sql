-- SECURITY FIX: CRITICAL-2
-- dashboard_trip_metrics materialized view exposes all-org financial data.
-- Cannot set security_invoker on matviews; must restrict at grant level + private schema.

-- 1. Create private schema if not yet done
CREATE SCHEMA IF NOT EXISTS private;

-- 2. Move to private schema only if it still lives in public
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'dashboard_trip_metrics'
  ) THEN
    REVOKE ALL ON public.dashboard_trip_metrics FROM anon, authenticated;
    ALTER MATERIALIZED VIEW public.dashboard_trip_metrics SET SCHEMA private;
  END IF;
END;
$$;

-- 3. Org-scoped RPC to replace direct matview access
CREATE OR REPLACE FUNCTION public.get_org_trip_metrics(p_org_id uuid)
RETURNS TABLE(
  total_trips       bigint,
  active_trips      bigint,
  completed_trips   bigint,
  total_revenue     numeric,
  total_cost        numeric,
  total_margin      numeric,
  last_trip_updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    total_trips, active_trips, completed_trips,
    total_revenue, total_cost, total_margin, last_trip_updated_at
  FROM private.dashboard_trip_metrics
  WHERE organization_id = p_org_id
    AND public.is_org_member(p_org_id);
$$;

REVOKE ALL ON FUNCTION public.get_org_trip_metrics(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_org_trip_metrics(uuid) TO authenticated;
