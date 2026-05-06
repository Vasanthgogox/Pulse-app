-- Compatibility view for dashboard queries expecting dashboard_trip_metrics.
-- Aggregates trip counts and finance metrics at organization level.

CREATE OR REPLACE VIEW public.dashboard_trip_metrics
WITH (security_invoker = true)
AS
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
GROUP BY t.organization_id;

GRANT SELECT ON public.dashboard_trip_metrics TO authenticated;
