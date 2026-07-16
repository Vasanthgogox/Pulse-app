-- cashflow_forecast lived in reporting.* but remote PostgREST only exposes `public`
-- unless Dashboard → API → Extra schemas includes reporting (not configured).
-- PGRST106 on GET /rest/v1/cashflow_forecast. Align with other AI tables in public.

ALTER TABLE IF EXISTS reporting.cashflow_forecast SET SCHEMA public;

-- RLS policy moves with the table; re-assert grants for API roles.
GRANT SELECT ON TABLE public.cashflow_forecast TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload config';
