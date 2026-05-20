-- Lineage: pg_depend alone is incomplete for plpgsql; MV/view text is authoritative for SELECT sources.
-- Example — materialized view definition (logical FROM clause).
SELECT CASE WHEN to_regclass('public.dashboard_trip_metrics') IS NOT NULL
            THEN pg_get_viewdef('public.dashboard_trip_metrics'::regclass, true)
       END AS dashboard_trip_metrics_definition;

-- Example — plpgsql: catalog deps are often shallow; full map needs pg_get_functiondef / AST tooling.
WITH f AS (
  SELECT p.oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'confirm_to_accounting_books'
  LIMIT 1
)
SELECT d.deptype,
       pg_describe_object(d.classid, d.objid, d.objsubid)     AS obj,
       pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS ref
FROM pg_depend d
JOIN f ON d.objid = f.oid OR d.refobjid = f.oid;
