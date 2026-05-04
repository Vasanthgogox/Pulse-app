-- Fix security advisor: ensure views run as invoker (respect caller RLS/privileges)
ALTER VIEW public.v_open_indents SET (security_invoker = true);
ALTER VIEW public.v_active_trips SET (security_invoker = true);
ALTER VIEW public.v_driver_balances SET (security_invoker = true);
ALTER VIEW public.v_client_revenue SET (security_invoker = true);
