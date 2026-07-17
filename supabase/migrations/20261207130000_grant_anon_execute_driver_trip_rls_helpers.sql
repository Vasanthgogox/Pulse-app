-- Fix Sentry: "permission denied for function driver_has_assigned_trip_for_trip_id".
-- Cause: these SECURITY DEFINER helpers are referenced inside the suppliers/transactions
-- SELECT RLS policies (see 20260511120000_fix_trips_rls_recursion_via_suppliers_policy.sql).
-- When an anon / expired-session caller reads those tables, Postgres evaluates the policy
-- and tries to call the helper. anon has no EXECUTE grant -> "permission denied for function".
--
-- Fix: grant EXECUTE to anon. The helpers filter on auth.uid(); for an anon caller
-- auth.uid() is NULL, so the inner EXISTS returns FALSE. The policy then simply evaluates
-- to false (no rows) instead of raising a permission error. No data is exposed.

GRANT EXECUTE ON FUNCTION public.driver_has_assigned_trip_for_trip_id(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.driver_has_assigned_trip_for_supplier(uuid) TO anon;
