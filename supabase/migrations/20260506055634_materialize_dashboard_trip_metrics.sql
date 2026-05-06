-- Replace dashboard_trip_metrics view with a materialized view.
-- The live view does a full GROUP BY aggregate scan on every load.
-- The materialized view pre-computes per-org totals and refreshes on trips changes.

-- Drop the old live view
DROP VIEW IF EXISTS public.dashboard_trip_metrics;

-- Create materialized view with same columns
CREATE MATERIALIZED VIEW public.dashboard_trip_metrics AS
SELECT
  t.organization_id,
  COUNT(*)::bigint AS total_trips,
  COUNT(*) FILTER (
    WHERE lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'done', 'delivered', 'cancelled')
  )::bigint AS active_trips,
  COUNT(*) FILTER (
    WHERE lower(trim(coalesce(t.status::text, ''))) IN ('completed', 'done', 'delivered')
  )::bigint AS completed_trips,
  COALESCE(SUM(t.client_price), 0)::numeric AS total_revenue,
  COALESCE(SUM(t.supplier_rate), 0)::numeric AS total_cost,
  COALESCE(SUM(COALESCE(t.client_price, 0) - COALESCE(t.supplier_rate, 0)), 0)::numeric AS total_margin,
  MAX(t.updated_at) AS last_trip_updated_at
FROM public.trips t
WHERE t.deleted_at IS NULL
GROUP BY t.organization_id
WITH DATA;

-- Unique index enables REFRESH CONCURRENTLY (no table lock during refresh)
CREATE UNIQUE INDEX idx_dashboard_trip_metrics_org
  ON public.dashboard_trip_metrics (organization_id);

-- Auto-refresh function triggered after any trips change
CREATE OR REPLACE FUNCTION public.refresh_dashboard_trip_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.dashboard_trip_metrics;
  RETURN NULL;
END;
$$;

-- Statement-level trigger: one refresh per transaction regardless of rows changed
CREATE TRIGGER trg_refresh_dashboard_trip_metrics
  AFTER INSERT OR UPDATE OR DELETE ON public.trips
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_dashboard_trip_metrics();

-- Grant same access as the old view
GRANT SELECT ON public.dashboard_trip_metrics TO authenticated;
GRANT SELECT ON public.dashboard_trip_metrics TO anon;
