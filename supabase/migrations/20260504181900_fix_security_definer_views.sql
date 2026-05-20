-- Fix security advisor: ensure views run as invoker (respect caller RLS/privileges).
-- Views are created in 20260519120000_schema_refactor_from_master_init.sql; only alter when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_open_indents'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_open_indents SET (security_invoker = true)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_active_trips'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_active_trips SET (security_invoker = true)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_driver_balances'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_driver_balances SET (security_invoker = true)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_client_revenue'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_client_revenue SET (security_invoker = true)';
  END IF;
END $$;
